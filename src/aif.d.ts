// public/aif.js is loaded as a classic script in index.html and exposes the
// .aif <-> JSON converter on the window. See public/aif.js.
export {}

declare global {
  interface Window {
    OP1Aif: {
      /** Extract the embedded preset JSON string from an AIFF (.aif) buffer. */
      aifToJson(buf: ArrayBuffer | Uint8Array): string
      /** Rebuild device-loadable .aif bytes from a preset JSON string. */
      jsonToAif(jsonStr: string): Uint8Array
    }
    /** public/layout-params.js: engine key -> parameter name per array index (null = unused). */
    OP1_LAYOUT?: Record<string, Array<string | null>>
    /** public/mapping-data.js: scale type -> label, description, color. */
    OP1_SCALES?: Record<string, { label: string; desc: string; color: string }>
    /** public/mapping-data.js: [engine, index (or "4–7" for a fixed run), name, scale type,
     * [raw, display] sample points, info]. */
    OP1_MAPPINGS?: Array<[string, number | string, string, string, Array<[number, number | string]>, string]>
    /** public/knob-model.js: knob travel and raw -> display, shared with the patch editor. */
    OP1_KNOB?: {
      range(eng: string, idx: number): [number, number]
      display(eng: string, idx: number, raw: number): number | string | null
      frac(eng: string, idx: number, raw: number): number
      isSelector(eng: string, idx: number): boolean
      isContinuous(eng: string, idx: number): boolean
    }
    /** public/engine-art.js: an engine's line drawing as an <svg> string. */
    OP1_ENGINE_ART?: (type: string) => string
    /** public/op1-stats.js: coverage numbers shared by the Lab, Layout, and Mappings pages. */
    OP1_STATS?: {
      engines: number
      namedSlots: number
      fixedSlots: number
      slots: number
      scaleTypes: number
      byType: Record<string, number>
    }
  }
}
