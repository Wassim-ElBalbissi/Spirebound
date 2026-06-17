import { request, Agent } from 'undici'

export interface McpClientOptions {
  baseUrl?: string
  timeoutMs?: number
}

export interface McpFetchResult<T> {
  status: number
  body: T
  rawBytes: Buffer
}

export class McpUnavailableError extends Error {
  constructor(public readonly cause: unknown) {
    super('STS2MCP unavailable')
  }
}

/**
 * Thin HTTP client for the STS2MCP mod running on localhost.
 * Single connection pool, short timeouts so a stuck game doesn't stall the poll loop.
 */
export class McpClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly agent: Agent

  constructor(opts: McpClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? 'http://localhost:15526'
    this.timeoutMs = opts.timeoutMs ?? 1500
    this.agent = new Agent({
      connections: 1,
      keepAliveTimeout: 5_000,
      keepAliveMaxTimeout: 10_000
    })
  }

  async get<T = unknown>(
    path: string,
    signal?: AbortSignal
  ): Promise<McpFetchResult<T>> {
    try {
      const res = await request(`${this.baseUrl}${path}`, {
        method: 'GET',
        dispatcher: this.agent,
        headersTimeout: this.timeoutMs,
        bodyTimeout: this.timeoutMs,
        signal
      })
      const buf = Buffer.from(await res.body.arrayBuffer())
      const body =
        buf.length === 0
          ? (undefined as unknown as T)
          : (JSON.parse(buf.toString('utf-8')) as T)
      return { status: res.statusCode, body, rawBytes: buf }
    } catch (err) {
      throw new McpUnavailableError(err)
    }
  }

  async close(): Promise<void> {
    await this.agent.close()
  }
}
