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
  }
}
