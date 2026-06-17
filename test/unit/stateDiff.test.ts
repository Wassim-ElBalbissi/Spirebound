import { describe, it, expect } from 'vitest'
import { StateDiffer } from '../../src/main/services/stateDiff'

describe('StateDiffer', () => {
  it('flags first payload as changed', async () => {
    const d = new StateDiffer()
    const r = await d.diff(Buffer.from('{"state_type":"menu"}'))
    expect(r.changed).toBe(true)
  })

  it('returns changed=false for identical consecutive payloads', async () => {
    const d = new StateDiffer()
    const buf = Buffer.from('{"state_type":"map"}')
    await d.diff(buf)
    const r = await d.diff(buf)
    expect(r.changed).toBe(false)
  })

  it('returns changed=true when payload differs', async () => {
    const d = new StateDiffer()
    await d.diff(Buffer.from('{"state_type":"map"}'))
    const r = await d.diff(Buffer.from('{"state_type":"card_reward"}'))
    expect(r.changed).toBe(true)
  })

  it('reset() restores first-seen behaviour', async () => {
    const d = new StateDiffer()
    const buf = Buffer.from('{"x":1}')
    await d.diff(buf)
    d.reset()
    const r = await d.diff(buf)
    expect(r.changed).toBe(true)
  })
})
