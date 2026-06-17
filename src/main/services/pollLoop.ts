import { McpClient, McpUnavailableError } from './mcpClient'
import { StateDiffer } from './stateDiff'
import { normalize } from './screens'
import type { RawGameState } from '../types/rawState'
import type { McpHealth, NormalizedState } from '../types/gameState'
import { logger } from './logger'

export interface PollLoopEvents {
  onState: (state: NormalizedState) => void
  onHealth: (health: McpHealth) => void
}

export interface PollLoopOptions {
  /** Base tick period when the mod is responding. Default 250 ms. */
  baseTickMs?: number
  /** Maximum backoff when offline. Default 5000 ms. */
  maxBackoffMs?: number
  /** Path of the SP run-state endpoint. */
  spPath?: string
  /** Path of the MP run-state endpoint, used as fallback on 409. */
  mpPath?: string
}

const DEFAULTS = {
  baseTickMs: 250,
  maxBackoffMs: 5000,
  spPath: '/api/v1/singleplayer',
  mpPath: '/api/v1/multiplayer'
} as const

/**
 * Drives polling against STS2MCP.
 * - Single in-flight request per tick (AbortController cancels the prior tick).
 * - Exponential backoff while the mod is unreachable.
 * - Falls back to the MP endpoint when SP returns 409 (multiplayer run active).
 * - Skips classification + recommenders when the response hash is unchanged.
 */
export class PollLoop {
  private readonly client: McpClient
  private readonly differ = new StateDiffer()
  private readonly opts: Required<PollLoopOptions>
  private timer: NodeJS.Timeout | null = null
  private currentAbort: AbortController | null = null
  private backoffMs: number
  private useMpEndpoint = false
  private running = false

  constructor(
    client: McpClient,
    private readonly events: PollLoopEvents,
    opts: PollLoopOptions = {}
  ) {
    this.client = client
    this.opts = { ...DEFAULTS, ...opts }
    this.backoffMs = this.opts.baseTickMs
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.scheduleNext(0)
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.currentAbort?.abort()
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) return
    this.timer = setTimeout(() => {
      void this.tick()
    }, delayMs)
  }

  private async tick(): Promise<void> {
    if (!this.running) return
    this.currentAbort?.abort()
    const abort = new AbortController()
    this.currentAbort = abort

    const path = this.useMpEndpoint ? this.opts.mpPath : this.opts.spPath

    try {
      const res = await this.client.get<RawGameState>(path, abort.signal)

      if (res.status === 409) {
        // SP/MP mismatch — flip endpoint and retry next tick.
        this.useMpEndpoint = !this.useMpEndpoint
        this.scheduleNext(this.opts.baseTickMs)
        return
      }

      if (res.status >= 500) {
        this.handleFailure(`status ${res.status}`)
        return
      }

      const { changed } = await this.differ.diff(res.rawBytes)
      this.markHealthy()

      if (changed) {
        const normalized = normalize(res.body)
        this.events.onState(normalized)
      }

      this.scheduleNext(this.opts.baseTickMs)
    } catch (err) {
      if (abort.signal.aborted) return
      const msg =
        err instanceof McpUnavailableError
          ? formatErr(err.cause)
          : err instanceof Error
            ? err.message
            : String(err)
      this.handleFailure(msg)
    }
  }

  private handleFailure(reason: string): void {
    logger.debug({ reason }, 'mcp poll failure')
    this.events.onHealth({ ok: false, error: reason })
    this.backoffMs = Math.min(this.backoffMs * 2, this.opts.maxBackoffMs)
    this.scheduleNext(this.backoffMs)
  }

  private markHealthy(): void {
    if (this.backoffMs !== this.opts.baseTickMs) {
      this.backoffMs = this.opts.baseTickMs
      this.events.onHealth({ ok: true, lastOkAt: Date.now() })
    }
  }
}

function formatErr(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    return String((cause as { code: unknown }).code)
  }
  if (cause instanceof Error) return cause.message
  return String(cause)
}
