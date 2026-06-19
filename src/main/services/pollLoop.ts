import { McpClient, McpUnavailableError, type McpFetchResult } from './mcpClient'
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
  /** Whether we've already told listeners the mod is healthy (avoids re-emit
   *  every tick, but ensures the *first* success is reported, not just a
   *  recovery from backoff). Reset on any failure. */
  private healthyReported = false

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

    // Network layer — only a *thrown* request (connection refused / timeout)
    // means the mod is unreachable. Any HTTP response (even a 409 or a body we
    // can't parse) proves the mod is alive, so it must NOT trip handleFailure.
    let res: McpFetchResult<RawGameState>
    try {
      res = await this.client.get<RawGameState>(path, abort.signal)
    } catch (err) {
      if (abort.signal.aborted) return
      const msg =
        err instanceof McpUnavailableError
          ? formatErr(err.cause)
          : err instanceof Error
            ? err.message
            : String(err)
      this.handleFailure(msg)
      return
    }

    // SP/MP mismatch: the requested run mode isn't the active one. The mod
    // answered, so it's reachable (healthy) — flip to the other endpoint and
    // let a successful poll settle us there (useMpEndpoint stays sticky on 2xx).
    if (res.status === 409) {
      this.useMpEndpoint = !this.useMpEndpoint
      this.markHealthy()
      this.scheduleNext(this.opts.baseTickMs)
      return
    }

    // 5xx is the mod erroring on a request it accepted — back off and surface.
    if (res.status >= 500) {
      this.handleFailure(`status ${res.status}`)
      return
    }

    // Any other response (2xx, or an unexpected non-409 4xx) means the mod is
    // up. Report health BEFORE touching the body so reachability never depends
    // on the payload shape.
    this.markHealthy()

    // Parse layer — a body we can't diff/normalize must not mark the mod
    // unhealthy (the connection is fine; the payload just has an unexpected
    // shape, e.g. a multiplayer/co-op body). Log a sample so the new shape is
    // recoverable from logs. The differ advances its hash inside diff() even on
    // a later parse failure, so an unchanged bad body won't be retried in a
    // loop — only a genuinely changed body re-attempts normalize.
    let changed = false
    try {
      ;({ changed } = await this.differ.diff(res.rawBytes))
    } catch (err) {
      logger.debug({ err }, 'state diff failed; treating as unchanged')
    }

    if (changed) {
      try {
        const normalized = normalize(res.body)
        this.events.onState(normalized)
      } catch (err) {
        logger.warn(
          { err, sample: sampleBody(res.rawBytes) },
          'normalize failed; mod still reachable, skipping this state'
        )
      }
    }

    this.scheduleNext(this.opts.baseTickMs)
  }

  private handleFailure(reason: string): void {
    logger.debug({ reason }, 'mcp poll failure')
    this.healthyReported = false
    this.events.onHealth({ ok: false, error: reason })
    this.backoffMs = Math.min(this.backoffMs * 2, this.opts.maxBackoffMs)
    this.scheduleNext(this.backoffMs)
  }

  private markHealthy(): void {
    this.backoffMs = this.opts.baseTickMs
    // Report on the first success and after any recovery — but not every tick.
    if (!this.healthyReported) {
      this.healthyReported = true
      this.events.onHealth({ ok: true, lastOkAt: Date.now() })
    }
  }
}

/** First 512 chars of a response body, for diagnosing an unexpected shape. */
function sampleBody(buf: Buffer): string {
  return buf.toString('utf-8').slice(0, 512)
}

function formatErr(cause: unknown): string {
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    return String((cause as { code: unknown }).code)
  }
  if (cause instanceof Error) return cause.message
  return String(cause)
}
