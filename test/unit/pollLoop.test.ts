import { describe, it, expect, vi, afterEach } from 'vitest'

// pollLoop → logger → electron `app`, which doesn't exist under vitest.
vi.mock('../../src/main/services/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// StateDiffer uses xxhash-wasm (async WASM init), which is flaky under fake
// timers. We only care about health transitions here, so make diff synchronous
// and always-changed.
vi.mock('../../src/main/services/stateDiff', () => ({
  StateDiffer: class {
    async diff(): Promise<{ changed: boolean }> {
      return { changed: true }
    }
    reset(): void {}
  }
}))

// normalize() is exercised in screens.test.ts; here we make it a controllable
// spy (passthrough by default) so we can simulate a body that fails to parse.
vi.mock('../../src/main/services/screens', () => ({
  normalize: vi.fn((body: unknown) => body)
}))

import { PollLoop } from '../../src/main/services/pollLoop'
import { normalize } from '../../src/main/services/screens'
import type { McpClient } from '../../src/main/services/mcpClient'

function httpResult(status: number, body: unknown = undefined) {
  return {
    status,
    body,
    rawBytes: Buffer.from(body === undefined ? '' : JSON.stringify(body))
  }
}

function okResult() {
  const body = { state_type: 'menu' }
  return {
    status: 200,
    body,
    rawBytes: Buffer.from(JSON.stringify(body))
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('PollLoop health reporting', () => {
  it('reports healthy on the FIRST successful poll, not only on recovery', async () => {
    vi.useFakeTimers()
    const client = {
      get: vi.fn().mockResolvedValue(okResult()),
      close: vi.fn()
    }
    const onHealth = vi.fn()
    const loop = new PollLoop(
      client as unknown as McpClient,
      { onState: vi.fn(), onHealth },
      { baseTickMs: 10 }
    )
    loop.start()
    await vi.advanceTimersByTimeAsync(5) // first tick (scheduled at 0)
    loop.stop()

    expect(onHealth).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
  })

  it('reports healthy only once across steady successful polls (no per-tick spam)', async () => {
    vi.useFakeTimers()
    const client = {
      get: vi.fn().mockResolvedValue(okResult()),
      close: vi.fn()
    }
    const onHealth = vi.fn()
    const loop = new PollLoop(
      client as unknown as McpClient,
      { onState: vi.fn(), onHealth },
      { baseTickMs: 10 }
    )
    loop.start()
    await vi.advanceTimersByTimeAsync(60) // several ticks
    loop.stop()

    const okCalls = onHealth.mock.calls.filter((c) => c[0]?.ok === true)
    expect(okCalls).toHaveLength(1)
  })

  it('stays healthy when the mod responds but the body fails to normalize', async () => {
    // The regression: a co-op/MP body of an unexpected shape made normalize()
    // throw, which was wrongly treated as a disconnect → "Waiting for STS2MCP".
    vi.useFakeTimers()
    vi.mocked(normalize).mockImplementationOnce(() => {
      throw new Error('unexpected body shape')
    })
    const client = {
      get: vi.fn().mockResolvedValue(okResult()),
      close: vi.fn()
    }
    const onHealth = vi.fn()
    const onState = vi.fn()
    const loop = new PollLoop(
      client as unknown as McpClient,
      { onState, onHealth },
      { baseTickMs: 10 }
    )
    loop.start()
    await vi.advanceTimersByTimeAsync(5) // single tick: 200 response, normalize throws
    loop.stop()

    // The mod answered 200, so it's reachable → healthy.
    expect(onHealth).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
    // A parse failure is NOT a disconnect.
    expect(onHealth).not.toHaveBeenCalledWith(
      expect.objectContaining({ ok: false })
    )
    // And the unparseable tick produced no state.
    expect(onState).not.toHaveBeenCalled()
  })

  it('marks healthy and flips the endpoint on a 409 (run-mode mismatch)', async () => {
    vi.useFakeTimers()
    const get = vi
      .fn()
      .mockResolvedValueOnce(httpResult(409))
      .mockResolvedValue(okResult())
    const client = { get, close: vi.fn() }
    const onHealth = vi.fn()
    const loop = new PollLoop(
      client as unknown as McpClient,
      { onState: vi.fn(), onHealth },
      { baseTickMs: 10, spPath: '/sp', mpPath: '/mp' }
    )
    loop.start()
    await vi.advanceTimersByTimeAsync(5) // first tick → 409
    // A 409 is a real response → healthy, never a failure.
    expect(onHealth).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
    expect(onHealth).not.toHaveBeenCalledWith(
      expect.objectContaining({ ok: false })
    )
    expect(get.mock.calls[0]?.[0]).toBe('/sp')
    await vi.advanceTimersByTimeAsync(10) // next tick uses the flipped endpoint
    loop.stop()
    expect(get.mock.calls[1]?.[0]).toBe('/mp')
  })

  it('reports unhealthy on a 5xx (the mod itself errored)', async () => {
    vi.useFakeTimers()
    const client = {
      get: vi.fn().mockResolvedValue(httpResult(500, { error: 'boom' })),
      close: vi.fn()
    }
    const onHealth = vi.fn()
    const loop = new PollLoop(
      client as unknown as McpClient,
      { onState: vi.fn(), onHealth },
      { baseTickMs: 10 }
    )
    loop.start()
    await vi.advanceTimersByTimeAsync(5)
    loop.stop()
    expect(onHealth).toHaveBeenLastCalledWith(
      expect.objectContaining({ ok: false })
    )
  })

  it('re-reports healthy after a failure recovers', async () => {
    vi.useFakeTimers()
    const client = { get: vi.fn(), close: vi.fn() }
    client.get
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue(okResult())
    const onHealth = vi.fn()
    const loop = new PollLoop(
      client as unknown as McpClient,
      { onState: vi.fn(), onHealth },
      { baseTickMs: 10, maxBackoffMs: 100 }
    )
    loop.start()
    await vi.advanceTimersByTimeAsync(5) // first tick fails
    expect(onHealth).toHaveBeenLastCalledWith(
      expect.objectContaining({ ok: false })
    )
    await vi.advanceTimersByTimeAsync(40) // backoff, then a successful poll
    loop.stop()

    expect(onHealth).toHaveBeenLastCalledWith(
      expect.objectContaining({ ok: true })
    )
  })
})
