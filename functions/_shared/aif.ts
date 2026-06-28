// Reconstruct a device-loadable .aif (AIFF-C 'sowt') from a preset's JSON.
// Ported from json2aif.c write_aif(). JSON-only means sampler audio cannot be
// restored — sampler downloads embed a 440 Hz sine, matching json2aif's fallback.

const SAMPLE_RATE = 22050
const BIT_DEPTH = 16
const NUM_FRAMES = 28896 // matches OP-1 Field hardware silent export
const APPL_SYNTH = 1028 // 4-byte "op-1" + 1024 JSON area
const APPL_DBOX = 4100 // 4-byte "op-1" + 4096 JSON area
const COMPR_NAME = "Signed integer (little-endian) linear PCM"

function jsonTypeIs(json: string, want: string): boolean {
  return new RegExp(`"type"\\s*:\\s*"${want}"`).test(json)
}

function write80bitExtended(view: DataView, pos: number, hz: number): void {
  let exp = 0
  let tmp = hz
  while (tmp > 1) { tmp >>= 1; exp++ }
  const biased = exp + 16383
  const mant = BigInt(hz) << BigInt(63 - exp)
  view.setUint16(pos, biased, false)
  for (let i = 0; i < 8; i++) {
    view.setUint8(pos + 2 + i, Number((mant >> BigInt(56 - i * 8)) & 0xffn))
  }
}

function sineFrames(freq: number, frames: number): Int16Array {
  const out = new Int16Array(frames)
  for (let i = 0; i < frames; i++) {
    out[i] = Math.round(29491 * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE))
  }
  return out
}

/** Build the .aif bytes for a canonical (minified) preset JSON string. */
export function buildAif(jsonStr: string): Uint8Array {
  const isDbox = jsonTypeIs(jsonStr, "dbox")
  const isSampler = jsonTypeIs(jsonStr, "sampler")
  const applSize = isDbox ? APPL_DBOX : APPL_SYNTH

  const samples = isSampler ? sineFrames(440, SAMPLE_RATE) : new Int16Array(NUM_FRAMES)
  const frames = samples.length
  const audioBytes = frames * (BIT_DEPTH / 8)

  const pascalLen = COMPR_NAME.length
  const commSize = 2 + 4 + 2 + 10 + 4 + (1 + pascalLen)
  const ssndSize = 4 + 4 + audioBytes
  const chunks = (8 + 4) + (8 + commSize) + (8 + applSize) + (8 + ssndSize)
  const formBody = 4 + chunks
  const total = 8 + formBody

  const buf = new Uint8Array(total)
  const view = new DataView(buf.buffer)
  const enc = new TextEncoder()
  let pos = 0
  const tag = (s: string) => { for (let i = 0; i < s.length; i++) buf[pos++] = s.charCodeAt(i) }
  const u32 = (v: number) => { view.setUint32(pos, v >>> 0, false); pos += 4 }
  const u16 = (v: number) => { view.setUint16(pos, v & 0xffff, false); pos += 2 }
  const chunkHeader = (id: string, size: number) => { tag(id); u32(size) }

  tag("FORM"); u32(formBody); tag("AIFC")

  chunkHeader("FVER", 4); u32(0xa2805140)

  chunkHeader("COMM", commSize)
  u16(1)            // channels (mono)
  u32(frames)       // sample frames
  u16(BIT_DEPTH)
  write80bitExtended(view, pos, SAMPLE_RATE); pos += 10
  tag("sowt")
  buf[pos++] = pascalLen
  tag(COMPR_NAME)

  chunkHeader("APPL", applSize)
  tag("op-1")
  const jsonBytes = enc.encode(jsonStr)
  buf.set(jsonBytes, pos); pos += jsonBytes.length
  buf[pos++] = 0x0a // '\n'
  const padEnd = pos + (applSize - 4 - jsonBytes.length - 1)
  while (pos < padEnd) buf[pos++] = 0x20 // space padding

  chunkHeader("SSND", ssndSize)
  u32(0); u32(0) // offset, blockSize
  for (let i = 0; i < frames; i++) { view.setInt16(pos, samples[i], true); pos += 2 } // 'sowt' = LE

  return buf
}
