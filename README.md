# OP-1 Field Patch File Format

Tools for reading and writing `.aif` synth patch files for the
Teenage Engineering OP-1 Field (firmware 1.7.3).

Web pages: `index.html` (home), `params.html` (knob layout), `display.html` (value mappings).

---

## Coverage

31 parameter types across 15 synth engines, 9 FX, 6 LFO, and global ADSR.

**synth** — amp, cluster, dbox, digital, dimension, dna, drwave, dsynth, fm, phase, pulse, sampler, string, vocoder, voltage  
**fx** — cwo, delay, grid, mother, nitro, phone, punch, spring, terminal  
**lfo** — element, midi, random, tremolo, value, velocity  
**adsr** — attack, decay, sustain, release, play mode, portamento, bend range, volume

---

## File Format

OP-1 Field patch files are standard **AIFF-C** containers (IFF with
big-endian chunk lengths). Every patch file contains exactly four chunks
in this order:

| Chunk | Size | Contents |
|-------|------|----------|
| `FVER` | 4 bytes | AIFC version constant `0xA2805140` — always this value |
| `COMM` | 64 bytes | Audio format: mono, 16-bit, 22050 Hz, `sowt` (little-endian signed PCM) |
| `APPL` | 1028 bytes | OP-1 synth metadata (see below) |
| `SSND` | varies | Raw PCM audio sample data used by the synth engine |

### APPL Chunk Layout

```
[4 bytes]  "op-1"          application signature
[N bytes]  {...}           JSON string with synth parameters
[pad]      spaces          space-padded to fill exactly 1028 bytes total
```

The JSON is always compact (no whitespace), followed by `\n` then spaces
to reach the 1028-byte boundary.

### Audio (SSND)

For sample-based synths like **cluster**, the SSND contains the actual
waveform the engine operates on. Replacing it with silence produces a
valid but soundless patch. `json2aif.exe` writes 28896 frames of silence
at 22050 Hz (~1.310 s), which matches hardware-exported patches.

---

## JSON Schema

Most numeric parameters are **16-bit integers in the range 0–32767**
(0.0–1.0 normalized). Exception: `centered %` parameters (e.g. AMOUNT in
`lfo.element`, VOLUME LEVEL in `lfo.tremolo`) use a signed range with minimum
**-32767**.

```jsonc
{
  "name":          "epiphany",      // patch name shown on device
  "type":          "cluster",       // synth engine
  "synth_version": 3,               // engine version
  "octave":        0,               // octave offset (-2 to +2)
  "mtime":         1709403000.0,    // Unix modification timestamp

  "knobs":         [7104, 29657, 7872, 454, 0, 0, 0, 0],   // 8 synth knobs
  "adsr":          [64, 16320, 22016, 16320, 2048, 7232, 18432, 13568],

  "fx_type":       "mother",        // effect engine
  "fx_active":     true,
  "fx_params":     [21064, 0, 25574, 17000, 0, 0, 0, 0],   // 8 FX knobs

  "lfo_type":      "tremolo",       // LFO engine
  "lfo_active":    true,
  "lfo_params":    [5476, 1017, 4190, 15696, 0, 0, 0, 0]   // 8 LFO knobs
}
```

> **Key order:** The OP-1 Field firmware uses a streaming JSON parser that requires keys in
> strict **alphabetical order**. `json2aif.exe` passes JSON through as-is — callers must order
> keys correctly. Required order:
> `adsr, fx_active, fx_params, fx_type, knobs, lfo_active, lfo_params, lfo_type, mtime, name, octave, synth_version, type`

### ADSR

Always 8 values — global keyboard settings, shared across all patches:

`0` ATTACK · `1` DECAY · `2` SUSTAIN · `3` RELEASE  
`4` PLAY MODE · `5` PORTAMENTO · `6` BEND RANGE · `7` VOLUME

PLAY MODE is a selector: poly (2048) / mono (6140) / legato (9209) / unison (14336).  
BEND RANGE is a selector: 1 st (2048) / 2 st (5117) / 4 st (9209) / 7 st (13301) / oct (18432).  
VOLUME is discrete 1–100; raw = `floor(N × 32767 / 100)`.

---

## Known Knob Mappings

Full name database is in `op1-params.json`. Raw-to-display value mappings are in `display.html`.

Most types use 4 active params (indices 0–3). Exceptions: `synth.dsynth`
and `synth.sampler` use all 8; `lfo.midi` uses all 8; `lfo.random` and
`lfo.value` use 5; `lfo.tremolo` uses indices 0–3 and 7.

### Synth

#### `amp`
`0` VOLUME · `1` COMPRESSOR · `2` TONE · `3` DRIVE

#### `cluster`
`0` WAVE NUMBER · `1` WAVE ENV · `2` SPREAD · `3` UNITOR

#### `dbox` (drum box)
Uses `drum_version: 2` instead of `synth_version`. No `adsr` field. Unique JSON keys:

| Key | Type | Description |
|-----|------|-------------|
| `dbox_data` | `int[24][8]` | Per-pad parameter values (24 pads × 8 params each) |
| `dyna_env`  | `int[8]`     | Dynamic envelope (see below) |
| `pan`       | `int[24]`    | Per-pad pan position (optional) |
| `pan_ab`    | `bool[24]`   | Per-pad stereo A/B flag (optional) |
| `attack`    | `int[24]`    | Per-pad attack (optional; 0 in oracle) |
| `fademode`  | `null`       | Fade mode (optional) |
| `stereo`    | `bool`       | Stereo flag (optional) |

`dyna_env` — 4 active params (indices 4–7 unused):

| Index | Name | Min | Max |
|-------|------|-----|-----|
| 0 | ATTACK  | -32768 | 32767 |
| 1 | GAIN    | 0      | 8192  |
| 2 | RELEASE | -32768 | 32767 |
| 3 | SMOOTH  | 0      | 32767 |

Knob parameters are identical to `dsynth`:  
`0` ENVELOPE CROSSFADER · `1` WAVEFORM 1 · `2` ENVELOPE 1 · `3` CROSS MODULATION  
`4` FREQUENCY · `5` WAVEFORM 2 · `6` ENVELOPE 2 · `7` CUTOFF

lfo.element PARAMETER selector for dbox differs from other 8-param synths:
`knob 0: 1024 · knob 1: 2464 · knob 2: 4384 · knob 3: 6304 · knob 4: 8224 · knob 5: 10624 · knob 6: 12544 · knob 7: 14464`

#### `digital`
`0` WAVE SHAPER · `1` OCTAVE · `2` DETUNE+RINGMOD · `3` DIGITALNESS

#### `dimension`
`0` WAVEFORM · `1` STEREO · `2` FILTER CUTOFF FREQ · `3` RESONANCE

#### `dna`
`0` FILTER · `1` WAVE NUMBER · `2` WAVE MODIFIER · `3` NOISE

#### `drwave`
`0` WAVE TYPE AND LENGTH · `1` FILTER · `2` PHASE · `3` CHORUS

#### `dsynth`
`0` ENVELOPE CROSSFADER · `1` WAVEFORM 1 · `2` ENVELOPE 1 · `3` CROSS MODULATION  
`4` FREQUENCY · `5` WAVEFORM 2 · `6` ENVELOPE 2 · `7` CUTOFF

#### `fm`
`0` FM AMOUNT · `1` FREQUENCY · `2` TOPOLOGY · `3` DETUNE

#### `phase`
`0` PHASE SHIFT · `1` DISTORTION AMOUNT · `2` PHASE FILTER · `3` PHASE TILT

#### `pulse`
`0` FILTER · `1` AMPLITUDE · `2` PULSE TWO · `3` MODULATION

#### `sampler`
`0` START · `1` LOOP IN · `2` LOOP OUT · `3` END  
`4` DIRECTION · `5` FINE TUNE · `6` LOOP FADE · `7` GAIN

#### `string`
`0` TENSION · `1` DECAY · `2` DETUNE · `3` IMPULSE TYPE

#### `vocoder`
`0` WAVEFORM · `1` FORMANT · `2` BANDS · `3` MIX

#### `voltage`
`0` AMPERE MODULATION · `1` GROUND NOISE · `2` PHASE FILTER · `3` VOLTAGE DETUNE

---

### FX

#### `cwo`
`0` FREQUENCY · `1` DELAY · `2` FEEDBACK · `3` SIDEBAND

#### `delay`
`0` RANGE · `1` SPEED · `2` FEEDBACK · `3` LEVEL

#### `grid`
`0` X SIZE · `1` Y SIZE · `2` Z FEEDBACK · `3` MIX

#### `mother`
`0` DISTANCE · `1` GATE · `2` COLOR · `3` MIX

#### `nitro`
`0` FREQUENCY LOWS · `1` FILTER FOLLOW · `2` FEEDBACK · `3` FREQUENCY HIGHS

#### `phone`
`0` TONE · `1` GSM · `2` BAUD · `3` TELEMATIC

#### `punch`
`0` FREQUENCY · `1` PUNCH · `2` ROUNDS · `3` POWER

#### `spring`
`0` TONE · `1` TURNS · `2` DAMPING · `3` MIX

#### `terminal`
`0` FREQUENCY · `1` BITS · `2` MODEL · `3` MIX

---

### LFO

#### `element`
`0` SOURCE · `1` AMOUNT · `2` DESTINATION · `3` PARAMETER

#### `midi`
`0` PARAMETER 1 · `1` PARAMETER 2 · `2` PARAMETER 3 · `3` PARAMETER 4  
`4` DESTINATION 1 · `5` DESTINATION 2 · `6` DESTINATION 3 · `7` DESTINATION 4

#### `random`
`0` SPEED · `1` AMOUNT · `2` DESTINATION · `3` ENVELOPE · `4` PARAMETER

#### `tremolo`
`0` SPEED · `1` PITCH AMOUNT · `2` VOLUME LEVEL · `3` PITCH ENVELOPE · `7` LFO SHAPE

#### `value`
`0` SPEED · `1` AMOUNT · `2` DESTINATION · `3` PARAMETER · `4` LFO SHAPE

#### `velocity`
`0` AMP · `1` VOLUME AMOUNT · `2` DESTINATION · `3` PARAMETER

---

### ADSR (global)

`0` ATTACK · `1` DECAY · `2` SUSTAIN · `3` RELEASE  
`4` PLAY MODE · `5` PORTAMENTO · `6` BEND RANGE · `7` VOLUME

---

## Tools

### `op1dump.exe`

Reads a `.aif` patch file, prints all synth metadata with named parameters,
and writes a `.json` sidecar.

```
op1dump.exe <file.aif>
```

```
op1dump.exe epiphany.aif         → prints metadata, writes epiphany.json
```

- Reads `op1-params.json` from the **current working directory** (not the file's directory)
- Console output: container info, audio format, synth knobs, ADSR, FX params, LFO params, raw JSON
- Each parameter printed as `name : raw_value  (normalized)` where normalized = raw / 32767
- Non-zero unnamed slots printed as `knob N [unknown]` — add them to `op1-params.json` once identified
- Always writes a `.json` sidecar at the same path as the input file

### `dump-all.bat`

Runs `op1dump.exe` on every `.aif` in `presets/`.

```
dump-all.bat
```

### `json2aif.exe`

Creates a valid OP-1 Field `.aif` from a `.json` patch file. Also generates all 756×2 boundary patches via the `explore` subcommand.

```
json2aif.exe <patch.json> [output.aif]
json2aif.exe zero <patch.json> [output.aif]
json2aif.exe max  <patch.json> [output.aif]
json2aif.exe explore [-dest <synth|envelope|fx|mix>] [-param <N>]
```

```
json2aif.exe mypatch.json                → writes mypatch.aif
json2aif.exe mypatch.json out.aif        → writes out.aif
json2aif.exe zero mypatch.json           → zeros knobs/fx_params/lfo_params
json2aif.exe max  mypatch.json           → sets all three arrays to 32767
json2aif.exe explore                     → generates all 3024 files in explore\
json2aif.exe explore -dest fx            → min patches with dest = FX
json2aif.exe explore -dest fx -param 5824
```

- Output format: AIFC with FVER + COMM (mono, 16-bit, 22050 Hz, `sowt`, 28896 frames ~1.310 s) + APPL (1028 bytes) + SSND (silence)
- JSON must be ≤ 1024 bytes; exits with an error message if too large
- Automatically injects `"mtime":<unix_ts>.0` at write time
- Refuses to overwrite an existing output file (single-file modes only)
- Strips UTF-8 BOM from input JSON if present

**`explore` subcommand** — generates min and max boundary patches for all 15 × 9 × 6 = 810 synth/FX/LFO combinations (3240 files total):

- Deletes and recreates `explore\` at the start of each run
- Output structure: `explore\aif\[mode]\[synth]\[lfo]\*.aif` and `explore\json\[mode]\[synth]\[lfo]\*.json`
- **min** uses hardware minimums per parameter type; types with non-zero floors use explicit per-type values
- **max** uses hardware maximums per type; types with ceilings below 32767 use explicit per-type values
- ADSR is fixed to instant-attack / full-sustain values so every combination produces audible output

### `summarize.exe`

Reads all parsed presets and produces a grouped report.

```
summarize.exe
```

- **Prerequisite:** run `dump-all.bat` first to generate the `.json` sidecars
- Reads: `presets/*.json`, `op1-params.json`, `op1-params-ok.json`
- Output sections: **Synth Engines**, **FX**, **LFO** — each type shows per-knob min/max raw + normalized ranges and patch count
- Trailing **"Missing from op1-params.json"** section prints exact stub lines to paste in

### `diff-patches.exe`

Diffs two patch files and shows exactly which fields and array indices changed.

```
diff-patches.exe <file_a> <file_b>
```

```
diff-patches.exe presets\name0001.json presets\name0002.json
diff-patches.exe sandbox\epiphany.aif  presets\epiphany0005.aif
```

- Accepts `.json` or `.aif`; if `.aif` is given, it looks for a `.json` sidecar next to it — run `op1dump.exe` first if the sidecar is missing
- Skips `name`, `mtime`, and `_file` automatically (they always differ between snapshots)
- For array fields: lists each changed index with before and after values and signed delta (`+N` / `-N`)
- Prints "No differences" if the patches are identical (excluding skipped fields)

### `test_aif.exe`

Validates that a generated `.aif` file conforms to the OP-1 Field file spec (29 checks).

```
test_aif.exe <file.aif>
```

Checks include: file size, chunk order and sizes (FVER/COMM/APPL/SSND), COMM spec (22050 Hz, 28896 frames, 16-bit `sowt`), APPL JSON (all required keys present, alphabetical key order, `mtime` presence and validity, no UTF-8 BOM), and SSND audio byte count. Exits 0 on pass, non-zero on any failure.

### `explore-aif.exe`

Low-level binary inspector for `.aif` file internals. Multiple flags can be combined in one call.

```
explore-aif.exe <file.aif> [flags]
```

| Flag | Description |
|------|-------------|
| `--read-bytes [N]` | Hex + ASCII dump of the first N bytes of the file (default: 128) |
| `--parse-chunks` | Walk the IFF chunk tree — prints chunk ID, file offset, and size for every chunk |
| `--dump-chunk <ID>` | Hex + ASCII dump of a specific chunk by its 4-char ID (e.g. `APPL`, `COMM`, `SSND`, `FVER`) |
| `--show-json` | Scan the file for `{...}` blocks and print each one found |
| `--decode-fver` | Print the FVER version constant and confirm whether it matches `0xA2805140` |
| `--decode-comm` | Full COMM decode: channels, frame count, bit depth, 80-bit extended sample rate, compression type |
| `--analyze-ssnd` | SSND audio stats: byte count, sample count, min/max sample, silence %, peak level in dBFS |

```
explore-aif.exe epiphany.aif --parse-chunks
explore-aif.exe epiphany.aif --dump-chunk APPL
explore-aif.exe epiphany.aif --decode-comm
explore-aif.exe epiphany.aif --analyze-ssnd
explore-aif.exe epiphany.aif --show-json
explore-aif.exe epiphany.aif --parse-chunks --decode-comm --show-json
```

---

## File Layout

```
te-op1/
  op1dump.c          source — patch dumper
  op1dump.exe        compiled dumper
  json2aif.c         source — JSON to AIF writer + explore generator
  json2aif.exe       compiled writer/generator
  test_aif.c         source — AIF validator
  test_aif.exe       compiled validator
  diff-patches.c     source — patch diff tool
  diff-patches.exe   compiled diff tool
  explore-aif.c      source — low-level AIF inspector
  explore-aif.exe    compiled inspector
  summarize.c        source — preset report tool
  summarize.exe      compiled report tool
  op1_aif.h          shared binary helpers (big-endian reads, hex dump, 80-bit float)
  cJSON.c            vendored JSON library (from github.com/DaveGamble/cJSON)
  cJSON.h            vendored JSON library header
  op1-params.json    knob/param name database (edit freely, no recompile)
  op1-params-ok.json tracks which param indices have been mapped per type
  build.bat          recompile all tools (requires MSVC)
  dump-all.bat       batch-process presets/ folder
  index.html         home — coverage overview and file format summary
  params.html        knob layout — all 31 types with named knob diagrams
  display.html       value mappings — raw-to-display mappings per parameter
  presets/           .aif patch files and their .json sidecars
  oracle/            reference exports from hardware (tracked in git, never regenerated)
  explore/           generated boundary patches — gitignored, recreate with: json2aif.exe explore
                     explore\aif\[min|max]\[synth]\[lfo]\*.aif
                     explore\json\[min|max]\[synth]\[lfo]\*.json
```

---

## Oracle Workflow

`oracle/` stores reference exports — patch files saved directly from the
OP-1 Field with known knob positions. These are the ground truth for parameter values.

**Rules:**
- Never regenerate oracle files from JSON. `json2aif.exe` will refuse to overwrite them.
- To capture a new oracle: set knobs on hardware → export preset → copy `.aif` to `oracle/` →
  run `op1dump.exe oracle\<file>.aif` → inspect the JSON sidecar for raw values.
- Naming convention: `<synth>-<fx>-<lfo>-<tag>.aif` where tag is `0000` (all-min),
  `ffff` (all-max), or a short descriptor.
