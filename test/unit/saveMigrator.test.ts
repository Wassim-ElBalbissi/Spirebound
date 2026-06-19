import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// saveMigrator imports electron (`app`) and the logger (which also reaches
// electron). We provide backupBaseDir in every call so app.getPath is never hit,
// but the imports still need to resolve under vitest.
vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
vi.mock('../../src/main/services/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import {
  migrateSaves,
  SAVE_MIGRATION_SCHEMA
} from '../../src/main/services/saveMigrator'
import type {
  StateStore,
  SaveMigrationRecord
} from '../../src/main/services/persistedState'

let root: string
let vanilla: string
let modded: string
let backups: string

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'spirebound-migrator-'))
  vanilla = join(root, 'vanilla')
  modded = join(root, 'modded')
  backups = join(root, 'backups')
  // resolveCopyPairs honors these as a single explicit pair.
  process.env['SPIREBOUND_SAVE_VANILLA'] = vanilla
  process.env['SPIREBOUND_SAVE_MODDED'] = modded
})

afterEach(async () => {
  delete process.env['SPIREBOUND_SAVE_VANILLA']
  delete process.env['SPIREBOUND_SAVE_MODDED']
  await fs.rm(root, { recursive: true, force: true })
})

async function seedVanillaReal(): Promise<void> {
  await fs.mkdir(join(vanilla, 'saves', 'history'), { recursive: true })
  await fs.writeFile(join(vanilla, 'saves', 'progress.save'), 'unlocks')
  await fs.writeFile(join(vanilla, 'saves', 'history', 'r.run'), 'run')
}

async function seedModdedScaffold(): Promise<void> {
  await fs.mkdir(join(modded, 'saves', 'history'), { recursive: true })
  await fs.writeFile(join(modded, 'saves', 'prefs.save'), 'prefs')
}

async function seedModdedReal(): Promise<void> {
  await fs.mkdir(join(modded, 'saves'), { recursive: true })
  await fs.writeFile(join(modded, 'saves', 'progress.save'), 'modded')
}

function fakeStore(initial?: SaveMigrationRecord): {
  store: StateStore
  rec: () => SaveMigrationRecord | undefined
} {
  const state: Record<string, unknown> = { saveMigration: initial }
  return {
    store: {
      get: (k: string) => state[k],
      set: (k: string, v: unknown) => {
        state[k] = v
      }
    } as unknown as StateStore,
    rec: () => state['saveMigration'] as SaveMigrationRecord | undefined
  }
}

describe('migrateSaves', () => {
  it('migrates vanilla into a modded scaffold on a fresh store', async () => {
    await seedVanillaReal()
    await seedModdedScaffold()
    const { store, rec } = fakeStore()

    const res = await migrateSaves(store, backups)

    expect(res.action).toBe('migrated')
    expect(rec()?.done).toBe(true)
    expect(rec()?.schemaVersion).toBe(SAVE_MIGRATION_SCHEMA)
    expect(await fs.readFile(join(modded, 'saves', 'progress.save'), 'utf-8')).toBe(
      'unlocks'
    )
  })

  it('re-runs when a prior record predates the current schema', async () => {
    // The exact broken state on existing installs: locked done:true with the
    // old skipped action and no schemaVersion.
    await seedVanillaReal()
    await seedModdedReal()
    const { store, rec } = fakeStore({
      done: true,
      action: 'skipped-modded-not-empty',
      migratedAt: 'old'
    } as SaveMigrationRecord)

    const res = await migrateSaves(store, backups)

    // Not short-circuited — it actually evaluated the scope this time.
    expect(res.action).toBe('already-correct')
    expect(rec()?.done).toBe(true)
    expect(rec()?.schemaVersion).toBe(SAVE_MIGRATION_SCHEMA)
    // Existing modded data left untouched.
    expect(await fs.readFile(join(modded, 'saves', 'progress.save'), 'utf-8')).toBe(
      'modded'
    )
  })

  it('short-circuits when already migrated under the current schema', async () => {
    await seedVanillaReal()
    await seedModdedScaffold()
    const { store } = fakeStore({
      done: true,
      schemaVersion: SAVE_MIGRATION_SCHEMA,
      action: 'migrated',
      migratedAt: 'x'
    })

    const res = await migrateSaves(store, backups)

    expect(res.action).toBe('already-done')
    // It must not have copied — the scaffold still has no progress.save.
    expect(existsSync(join(modded, 'saves', 'progress.save'))).toBe(false)
  })

  it('does not lock when there is nothing to migrate yet', async () => {
    // Vanilla has only an empty scaffold (no progress yet) → retryable later.
    await fs.mkdir(join(vanilla, 'saves'), { recursive: true })
    await seedModdedScaffold()
    const { store, rec } = fakeStore()

    await migrateSaves(store, backups)

    expect(rec()?.done).toBe(false)
    expect(rec()?.schemaVersion).toBe(SAVE_MIGRATION_SCHEMA)
  })
})
