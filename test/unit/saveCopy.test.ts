import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  copyVanillaToModdedIfNoSaveData,
  hasRealSaveData,
  isEmptyDir,
  listProfileDirs,
  pathsOverlap
} from '../../src/main/services/saveCopy'

let root: string
let vanilla: string
let modded: string
let backupRoot: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'spirebound-savecopy-'))
  vanilla = join(root, 'vanilla')
  modded = join(root, 'modded')
  backupRoot = join(root, 'backups')
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

/** Realistic vanilla profile: real progress under `saves/`. */
async function seedVanilla(): Promise<void> {
  await fs.mkdir(join(vanilla, 'saves', 'history'), { recursive: true })
  await fs.writeFile(join(vanilla, 'saves', 'progress.save'), 'unlocks')
  await fs.writeFile(join(vanilla, 'saves', 'prefs.save'), 'vanilla-prefs')
  await fs.writeFile(join(vanilla, 'saves', 'history', 'run1.run'), 'run')
}

/** The empty scaffold STS2 pre-creates under the modded scope (no progress). */
async function seedModdedScaffold(): Promise<void> {
  await fs.mkdir(join(modded, 'saves', 'history'), { recursive: true })
  await fs.writeFile(join(modded, 'saves', 'prefs.save'), 'modded-prefs')
}

describe('copyVanillaToModdedIfNoSaveData', () => {
  it('copies vanilla into an empty modded scope and reports nested files', async () => {
    await seedVanilla()
    await fs.mkdir(modded, { recursive: true }) // empty target → triggers backup

    const res = await copyVanillaToModdedIfNoSaveData({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: '2026-06-18'
    })

    expect(res.action).toBe('migrated')
    expect(existsSync(join(modded, 'saves', 'progress.save'))).toBe(true)
    expect(existsSync(join(modded, 'saves', 'history', 'run1.run'))).toBe(true)
    // An existing (empty) target is backed up first.
    expect(res.backupDir).toBe(join(backupRoot, 'modded-2026-06-18'))
    expect(existsSync(res.backupDir!)).toBe(true)
  })

  it('migrates with no backup when the modded scope does not exist yet', async () => {
    await seedVanilla()

    const res = await copyVanillaToModdedIfNoSaveData({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's'
    })

    expect(res.action).toBe('migrated')
    expect(res.backupDir).toBeUndefined()
    expect(existsSync(join(modded, 'saves', 'progress.save'))).toBe(true)
  })

  it('migrates into a modded scaffold the game pre-created (the new-install bug)', async () => {
    await seedVanilla()
    await seedModdedScaffold() // empty saves/ + prefs.save, but NO progress.save

    const res = await copyVanillaToModdedIfNoSaveData({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's'
    })

    expect(res.action).toBe('migrated')
    expect(existsSync(join(modded, 'saves', 'progress.save'))).toBe(true)
    expect(existsSync(join(modded, 'saves', 'history', 'run1.run'))).toBe(true)
    // Merge is non-destructive: a pre-existing modded file is never overwritten.
    expect(await fs.readFile(join(modded, 'saves', 'prefs.save'), 'utf-8')).toBe(
      'modded-prefs'
    )
  })

  it('leaves a modded scope that already has progress untouched', async () => {
    await seedVanilla()
    await fs.mkdir(join(modded, 'saves'), { recursive: true })
    await fs.writeFile(join(modded, 'saves', 'progress.save'), 'modded-progress')

    const res = await copyVanillaToModdedIfNoSaveData({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's'
    })

    expect(res.action).toBe('already-correct')
    // Existing modded data is untouched.
    expect(
      await fs.readFile(join(modded, 'saves', 'progress.save'), 'utf-8')
    ).toBe('modded-progress')
  })

  it('no-ops when there is no real vanilla save to copy', async () => {
    // A vanilla scaffold with no progress.save / history is "no vanilla data".
    await fs.mkdir(join(vanilla, 'saves', 'history'), { recursive: true })
    await fs.writeFile(join(vanilla, 'saves', 'prefs.save'), 'prefs')

    const res = await copyVanillaToModdedIfNoSaveData({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's'
    })
    expect(res.action).toBe('skipped-no-vanilla')
    expect(existsSync(modded)).toBe(false)
  })

  it('is idempotent: a second run is a no-op (already-correct)', async () => {
    await seedVanilla()

    const first = await copyVanillaToModdedIfNoSaveData({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's1'
    })
    expect(first.action).toBe('migrated')

    const second = await copyVanillaToModdedIfNoSaveData({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's2'
    })
    expect(second.action).toBe('already-correct')
  })

  it('refuses overlapping source/target paths', async () => {
    await seedVanilla()
    const child = join(vanilla, 'modded')

    const res = await copyVanillaToModdedIfNoSaveData({
      vanillaDir: vanilla,
      moddedDir: child,
      backupRoot,
      stamp: 's'
    })
    expect(res.action).toBe('skipped-overlapping-paths')
  })
})

describe('hasRealSaveData', () => {
  it('distinguishes real progress from an empty/settings-only scaffold', async () => {
    // Missing dir.
    expect(await hasRealSaveData(join(root, 'nope'))).toBe(false)
    // Empty saves/ + history/ scaffold → not real.
    const p = join(root, 'p')
    await fs.mkdir(join(p, 'saves', 'history'), { recursive: true })
    expect(await hasRealSaveData(p)).toBe(false)
    // A lone prefs.save (settings only) → still not real.
    await fs.writeFile(join(p, 'saves', 'prefs.save'), 'prefs')
    expect(await hasRealSaveData(p)).toBe(false)
    // A non-empty progress.save → real.
    await fs.writeFile(join(p, 'saves', 'progress.save'), 'unlocks')
    expect(await hasRealSaveData(p)).toBe(true)
  })

  it('treats a 0-byte progress.save as not real, but any *.run as real', async () => {
    const p = join(root, 'q')
    await fs.mkdir(join(p, 'saves', 'history'), { recursive: true })
    await fs.writeFile(join(p, 'saves', 'progress.save'), '') // 0 bytes
    expect(await hasRealSaveData(p)).toBe(false)
    await fs.writeFile(join(p, 'saves', 'history', 'x.run'), 'run')
    expect(await hasRealSaveData(p)).toBe(true)
  })
})

describe('isEmptyDir', () => {
  it('treats missing and empty dirs as empty, populated dirs as not', async () => {
    expect(await isEmptyDir(join(root, 'nope'))).toBe(true)
    await fs.mkdir(join(root, 'empty'), { recursive: true })
    expect(await isEmptyDir(join(root, 'empty'))).toBe(true)
    await fs.writeFile(join(root, 'empty', 'f'), 'x')
    expect(await isEmptyDir(join(root, 'empty'))).toBe(false)
  })
})

describe('listProfileDirs', () => {
  it('returns only profileN directories under a scope root', async () => {
    // Mirror the real STS2 remote/ layout: profile dirs + scope/loose files.
    await fs.mkdir(join(root, 'profile1', 'saves'), { recursive: true })
    await fs.mkdir(join(root, 'profile2', 'saves'), { recursive: true })
    await fs.mkdir(join(root, 'modded'), { recursive: true })
    await fs.writeFile(join(root, 'profile.save'), 'x')
    await fs.writeFile(join(root, 'settings.save'), 'x')

    expect(listProfileDirs(root).sort()).toEqual(['profile1', 'profile2'])
    expect(listProfileDirs(join(root, 'does-not-exist'))).toEqual([])
  })
})

describe('pathsOverlap', () => {
  it('detects identical, parent, and child relationships', () => {
    expect(pathsOverlap('C:\\a\\b', 'C:\\a\\b')).toBe(true)
    expect(pathsOverlap('C:\\a', 'C:\\a\\b')).toBe(true)
    expect(pathsOverlap('C:\\a\\b', 'C:\\a')).toBe(true)
    expect(pathsOverlap('C:\\a\\b', 'C:\\a\\c')).toBe(false)
  })
})
