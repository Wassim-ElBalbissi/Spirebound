/* eslint-disable */
// Dependency-free logo generator. Draws a sleek "spire" crystal mark on a
// dark rounded-square and writes build/icon.png (256x256, supersampled AA).
// Run: node scripts/gen-icon.cjs
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const S = 256 // output size
const SS = 4 // supersample factor
const N = S * SS

const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [
  lerp(c1[0], c2[0], t),
  lerp(c1[1], c2[1], t),
  lerp(c1[2], c2[2], t)
]
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

const BG_TOP = [26, 26, 34] // #1a1a22
const BG_BOT = [10, 10, 14] // #0a0a0e
const SP_TOP = [52, 211, 153] // emerald #34d399
const SP_BOT = [56, 189, 248] // sky #38bdf8

function inRoundRect(x, y, w, h, r) {
  const dx = Math.max(r - x, x - (w - r), 0)
  const dy = Math.max(r - y, y - (h - r), 0)
  return dx * dx + dy * dy <= r * r
}

// Spire (peak) triangle, normalized to N.
const APEX = [0.5 * N, 0.11 * N]
const BL = [0.17 * N, 0.86 * N]
const BR = [0.83 * N, 0.86 * N]
const CXX = 0.5 * N

function edge(px, py, a, b) {
  return (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1])
}

// Inside the spire triangle, optionally scaled about its centroid (for glow).
function inSpire(x, y, scale) {
  let a = APEX
  let b = BL
  let c = BR
  if (scale !== 1) {
    const gx = (APEX[0] + BL[0] + BR[0]) / 3
    const gy = (APEX[1] + BL[1] + BR[1]) / 3
    const sc = (p) => [gx + (p[0] - gx) * scale, gy + (p[1] - gy) * scale]
    a = sc(APEX)
    b = sc(BL)
    c = sc(BR)
  }
  const d1 = edge(x, y, a, b)
  const d2 = edge(x, y, b, c)
  const d3 = edge(x, y, c, a)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

// Hi-res sample -> [r,g,b,a]
function sample(x, y) {
  const w = N
  const r = N * 0.16
  if (!inRoundRect(x, y, w, w, r)) return [0, 0, 0, 0]

  // Background vertical gradient.
  let col = mix(BG_TOP, BG_BOT, y / w)

  const t = clamp((y - APEX[1]) / (BL[1] - APEX[1]), 0, 1)

  if (inSpire(x, y, 1)) {
    // Emerald (top) -> sky (bottom) along the spire.
    let s = mix(SP_TOP, SP_BOT, t)
    // Two facets: left darker, right lighter — gives the spire dimension.
    const facet = x < CXX ? 0.8 : 1.08
    s = [s[0] * facet, s[1] * facet, s[2] * facet]
    // Bright vertical seam highlight near the center axis.
    const seam = clamp(1 - Math.abs(x - CXX) / (N * 0.015), 0, 1) * 0.55
    s = mix(s, [255, 255, 255], seam)
    // "Bound" band: a dark belt across the lower spire.
    if (y > N * 0.58 && y < N * 0.645) {
      const edgeFade =
        Math.min(y - N * 0.58, N * 0.645 - y) / (N * 0.012)
      const k = 0.4 + 0.4 * clamp(edgeFade, 0, 1)
      s = [s[0] * (1 - k), s[1] * (1 - k), s[2] * (1 - k)]
    }
    col = [clamp(s[0], 0, 255), clamp(s[1], 0, 255), clamp(s[2], 0, 255)]
  } else if (inSpire(x, y, 1.12)) {
    // Soft outer glow hugging the spire.
    const glow = mix(SP_TOP, SP_BOT, t)
    col = mix(col, glow, 0.4)
  }

  return [col[0], col[1], col[2], 255]
}

// Render + box downsample.
const out = Buffer.alloc(S * S * 4)
for (let oy = 0; oy < S; oy++) {
  for (let ox = 0; ox < S; ox++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = sample(ox * SS + sx, oy * SS + sy)
        r += px[0]; g += px[1]; b += px[2]; a += px[3]
      }
    }
    const n = SS * SS
    const i = (oy * S + ox) * 4
    out[i] = Math.round(r / n)
    out[i + 1] = Math.round(g / n)
    out[i + 2] = Math.round(b / n)
    out[i + 3] = Math.round(a / n)
  }
}

// --- Minimal PNG encoder (RGBA, filter 0) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
const raw = Buffer.alloc((S * 4 + 1) * S)
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0
  out.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, y * S * 4 + S * 4)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const dir = path.join(__dirname, '..', 'build')
fs.mkdirSync(dir, { recursive: true })
const dest = path.join(dir, 'icon.png')
fs.writeFileSync(dest, png)
console.log('wrote', dest, png.length, 'bytes')
