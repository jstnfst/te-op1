// Minimal ZIP writer for the Workers runtime: DEFLATE entries with the native
// CompressionStream + a JS CRC32. No deps; also runs under Node 22 (which has
// CompressionStream/Response globals) so it can be unit-tested.

export interface ZipEntry {
  name: string
  bytes: Uint8Array
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw")
  const stream = new Response(bytes).body!.pipeThrough(cs)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** De-duplicate entry names (case-insensitive): foo.aif, foo-2.aif, … */
function uniqueName(name: string, seen: Map<string, number>): string {
  const key = name.toLowerCase()
  const count = seen.get(key) || 0
  seen.set(key, count + 1)
  if (count === 0) return name
  const dot = name.lastIndexOf(".")
  return dot > 0 ? `${name.slice(0, dot)}-${count + 1}${name.slice(dot)}` : `${name}-${count + 1}`
}

/** Build a standard (DEFLATE) ZIP archive from the given entries. */
export async function buildZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const seen = new Map<string, number>()
  const locals: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const e of entries) {
    const nameBytes = enc.encode(uniqueName(e.name, seen))
    const crc = crc32(e.bytes)
    const comp = await deflateRaw(e.bytes)
    const uncompSize = e.bytes.length
    const compSize = comp.length

    const lh = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(lh.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header sig
    lv.setUint16(4, 20, true)         // version needed
    lv.setUint16(6, 0x0800, true)     // flags: UTF-8 names
    lv.setUint16(8, 8, true)          // method: deflate
    lv.setUint16(10, 0, true)         // mod time
    lv.setUint16(12, 0x21, true)      // mod date (1980-01-01)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, compSize, true)
    lv.setUint32(22, uncompSize, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)         // extra length
    lh.set(nameBytes, 30)
    locals.push(lh, comp)

    const ch = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014b50, true) // central dir header sig
    cv.setUint16(4, 20, true)         // version made by
    cv.setUint16(6, 20, true)         // version needed
    cv.setUint16(8, 0x0800, true)     // flags
    cv.setUint16(10, 8, true)         // method
    cv.setUint16(12, 0, true)         // mod time
    cv.setUint16(14, 0x21, true)      // mod date
    cv.setUint32(16, crc, true)
    cv.setUint32(20, compSize, true)
    cv.setUint32(24, uncompSize, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)         // extra length
    cv.setUint16(32, 0, true)         // comment length
    cv.setUint16(34, 0, true)         // disk number start
    cv.setUint16(36, 0, true)         // internal attrs
    cv.setUint32(38, 0, true)         // external attrs
    cv.setUint32(42, offset, true)    // local header offset
    ch.set(nameBytes, 46)
    central.push(ch)

    offset += lh.length + comp.length
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0)
  const cdOffset = offset

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)         // EOCD sig
  ev.setUint16(8, entries.length, true)     // entries on this disk
  ev.setUint16(10, entries.length, true)    // total entries
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdOffset, true)

  const all = [...locals, ...central, eocd]
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0))
  let p = 0
  for (const a of all) { out.set(a, p); p += a.length }
  return out
}
