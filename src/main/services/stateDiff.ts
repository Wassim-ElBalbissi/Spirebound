import xxhash, { XXHashAPI } from 'xxhash-wasm'

let api: XXHashAPI | null = null

async function getApi(): Promise<XXHashAPI> {
  if (!api) api = await xxhash()
  return api
}

export interface DiffResult {
  changed: boolean
  hash: bigint
}

/**
 * Hash a raw response buffer and compare to the previously seen hash.
 * Used by the poll loop to skip the classifier + recommender on unchanged payloads.
 *
 * xxhash64 is plenty for ~1-50KB JSON bodies; collisions are negligible at this scale.
 */
export class StateDiffer {
  private prevHash: bigint = 0n
  private ready: Promise<XXHashAPI>

  constructor() {
    this.ready = getApi()
  }

  async diff(bytes: Buffer): Promise<DiffResult> {
    const a = await this.ready
    const hash = a.h64Raw(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length))
    const changed = hash !== this.prevHash
    this.prevHash = hash
    return { changed, hash }
  }

  reset(): void {
    this.prevHash = 0n
  }
}
