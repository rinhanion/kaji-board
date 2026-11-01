// PWA 用のアイコン(PNG)を依存なしで作る。緑の正方形に白いチェック
// 使い方: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [0x3d, 0x7a, 0x50]
const FG = [0xff, 0xfc, 0xf6]
// 512 を基準にしたチェックの折れ線(マスカブル用に中央 60% に収める)
const POINTS = [
  [150, 270],
  [225, 345],
  [365, 185],
]
const STROKE = 34

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size) {
  const scale = size / 512
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / scale
      const py = (y + 0.5) / scale
      const d = Math.min(distToSegment(px, py, POINTS[0], POINTS[1]), distToSegment(px, py, POINTS[1], POINTS[2]))
      // 端をなめらかにする(1px ぶんのぼかし)
      const a = Math.max(0, Math.min(1, (STROKE / 2 - d) * scale + 0.5))
      for (let i = 0; i < 3; i++) raw[row + 1 + x * 3 + i] = Math.round(BG[i] * (1 - a) + FG[i] * a)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size))
  console.log(`public/${name}`)
}
