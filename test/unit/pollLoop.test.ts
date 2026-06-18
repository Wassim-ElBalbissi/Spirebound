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

import { PollLoop } from '../../src/main/services/pollLoop'
import type { McpClient } from '../../src/main/services/mcpClient'

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
