import { readFileSync, watch } from 'fs'
import { normalize } from './screens'
import type { RawGameState } from '../types/rawState'
import type { NormalizedState } from '../types/gameState'
import { logger } from './logger'

export interface MockStateProviderEvents {
  onState: (state: NormalizedState) => void
}

/**
 * Dev-only: when MOCK_STATE=<path> is set, drive the renderer from a JSON file
 * instead of polling STS2MCP. The file is watched so editing it triggers
 * re-rendering — useful for designing advice cards without launching the game.
 */
export class MockStateProvider {
  private watcher: ReturnType<typeof watch> | null = null

  constructor(
    private readonly filePath: string,
    private readonly events: MockStateProviderEvents
  ) {}

  start(): void {
    this.publish()
    try {
      this.watcher = watch(this.filePath, () => {
        // Small debounce — editors often fire multiple events on save.
        setTimeout(() => this.publish(), 50)
      })
    } catch (err) {
      logger.warn({ err, filePath: this.filePath }, 'mock watcher failed')
    }
  }

  stop(): void {
    this.watcher?.close()
    this.watcher = null
  }

  private publish(): void {
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8')) as RawGameState
      const normalized = normalize(raw)
      this.events.onState(normalized)
    } catch (err) {
      logger.error({ err, filePath: this.filePath }, 'mock state read failed')
    }
  }
}
