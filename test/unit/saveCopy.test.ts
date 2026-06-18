import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  copyVanillaToModdedIfEmpty,
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

async function seedVanilla(): Promise<void> {
  await fs.mkdir(join(vanilla, 'saves', 'history'), { recursive: true })
  await fs.writeFile(join(vanilla, 'progress.save'), 'unlocks')
  await fs.writeFile(join(vanilla, 'saves', 'history', 'run1.run'), 'run')
}

describe('copyVanillaToModdedIfEmpty', () => {
  it('copies vanilla into an empty modded scope and reports nested files', async () => {
    await seedVanilla()
    await fs.mkdir(modded, { recursive: true }) // empty target → triggers backup

    const res = await copyVanillaToModdedIfEmpty({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: '2026-06-18'
    })

    expect(res.action).toBe('migrated')
    expect(existsSync(join(modded, 'progress.save'))).toBe(true)
    expect(existsSync(join(modded, 'saves', 'history', 'run1.run'))).toBe(true)
    // An existing (empty) target is backed up first.
    expect(res.backupDir).toBe(join(backupRoot, 'modded-2026-06-18'))
    expect(existsSync(res.backupDir!)).toBe(true)
  })

  it('migrates with no backup when the modded scope does not exist yet', async () => {
    await seedVanilla()

    const res = await copyVanillaToModdedIfEmpty({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's'
    })

    expect(res.action).toBe('migrated')
    expect(res.backupDir).toBeUndefined()
    expect(existsSync(join(modded, 'progress.save'))).toBe(true)
  })

  it('never overwrites a modded scope that already has progress', async () => {
    await seedVanilla()
    await fs.mkdir(modded, { recursive: true })
    await fs.writeFile(join(modded, 'progress.save'), 'modded-progress')

    const res = await copyVanillaToModdedIfEmpty({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's'
    })

    expect(res.action).toBe('skipped-modded-not-empty')
    // Existing modded data is untouched.
    expect(await fs.readFile(join(modded, 'progress.save'), 'utf-8')).toBe(
      'modded-progress'
    )
  })

  it('no-ops when there is no vanilla save to copy', async () => {
    const res = await copyVanillaToModdedIfEmpty({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's'
    })
    expect(res.action).toBe('skipped-no-vanilla')
    expect(existsSync(modded)).toBe(false)
  })

  it('is idempotent: a second run is a no-op', async () => {
    await seedVanilla()

    const first = await copyVanillaToModdedIfEmpty({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's1'
    })
    expect(first.action).toBe('migrated')

    const second = await copyVanillaToModdedIfEmpty({
      vanillaDir: vanilla,
      moddedDir: modded,
      backupRoot,
      stamp: 's2'
    })
    expect(second.action).toBe('skipped-modded-not-empty')
  })

  it('refuses overlapping source/target paths', async () => {
    await seedVanilla()
    const child = join(vanilla, 'modded')

    const res = await copyVanillaToModdedIfEmpty({
      vanillaDir: vanilla,
      moddedDir: child,
      backupRoot,
      stamp: 's'
    })
    expect(res.action).toBe('skipped-overlapping-paths')
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
