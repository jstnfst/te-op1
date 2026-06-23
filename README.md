# OP-1 Field Patch File Format

Notes and tools for reading and writing `.aif` synth patch files for the
Teenage Engineering OP-1 Field (firmware 1.5.7).

See also: `index.html` (overview), `params.html` (parameter reference), `display.html` (scale analysis).

---

## Research Status

All synth, FX, and LFO parameter types have been fully mapped and verified
against hardware. See `op1-params.json` for the complete name database and
`display-notes.md` for hardware display scale details per parameter.

| Group | Verified types |
|-------|---------------|
| synth | amp, cluster, digital, dimension, dna, drwave, dsynth, fm, phase, pulse, sampler, string, vocoder, voltage |
| fx    | cwo, delay, grid, mother, nitro, phone, punch, spring, terminal |
| lfo   | element, midi, random, tremolo, value, velocity |

---

## Development Process

### Daily workflow

```
1.  Drop .aif files into  presets/
2.  dump-all.bat             → writes a .json sidecar next to each .aif
3.  .\summarize.ps1          → grouped report: what's known, what's unknown
4.  Edit op1-params.json     → add names for any [unknown] knobs found
5.  .\summarize.ps1          → confirm names appear, no recompile needed
```

### Mapping a new parameter

To identify what a single physical knob does:

1. On the OP-1 Field, load a patch and save a snapshot (`name0001.aif`).
2. Change **one knob only**, save another snapshot (`name0002.aif`).
3. Copy both files to `presets/` and run `dump-all.bat`.
4. Run `.\diff-patches.ps1 presets\name0001.json presets\name0002.json`.
5. The output shows exactly which array index changed and by how much.
6. Add the name to `op1-params.json` under the appropriate key (e.g. `"synth.cluster"`).

### Adding a newly discovered synth/fx/lfo type

When `summarize.ps1` reports a type under **"Missing from op1-params.json"**:

1. Add a stub line to `op1-params.json`:
   ```json
   "synth.newtype": []
   ```
2. Re-run `summarize.ps1` — it will now show `[names TBD]` instead of the red warning.
3. Map each knob using the snapshot diff process above, filling in the array as you go:
   ```json
   "synth.newtype": ["PARAM A", "PARAM B", null, null]
   ```
   `null` = slot exists but name not yet known.

### op1-params.json format

```json
{
  "synth.cluster": ["WAVES", "WAVE ENV", "SPREAD", "UNITOR"],
  "fx.mother":     ["DISTANCE", "GATE", "COLOR", "MIX"],
  "lfo.tremolo":   ["SPEED", "PITCH AMOUNT", "VOLUME LEVEL", "PITCH ENVELOPE", null, null, null, "LFO SHAPE"]
}
```

- Key format: `"group.type"` — group is `synth`, `fx`, or `lfo`
- Values: array of up to 8 strings (index = knob position)
- `null` = knob position exists but is unused for this type
- Missing key = type not yet seen; `summarize.ps1` will flag it red

### Rebuilding the tools

Only needed after editing `.c` source files. Requires MSVC in PATH.

```
build.bat
```

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

### ADSR (always 8 values — two envelopes)

| Index | Label    |
|-------|----------|
| 0     | Attack   |
| 1     | Decay    |
| 2     | Sustain  |
| 3     | Release  |
| 4     | Attack2  |
| 5     | Decay2   |
| 6     | Sustain2 |
| 7     | Release2 |

---

## Known Knob Mappings

Full name database is in `op1-params.json`. Display scale details and
observed raw↔display value mappings are in `display-notes.md`.
`op1-params-ok.json` tracks which indices have been hardware-verified.

Note: most types use 4 active params (indices 0–3). Exceptions:
`synth.dsynth` and `synth.sampler` use all 8; `lfo.midi` uses all 8;
`lfo.random` and `lfo.value` use 5; `lfo.tremolo` uses indices 0–3 and 7.

### Synth types

#### `amp`
| Index | Name |
|-------|------|
| 0 | VOLUME |
| 1 | COMPRESSOR |
| 2 | TONE |
| 3 | DRIVE |

#### `cluster`
| Index | Name |
|-------|------|
| 0 | WAVES |
| 1 | WAVE ENV |
| 2 | SPREAD |
| 3 | UNITOR |

#### `digital`
| Index | Name |
|-------|------|
| 0 | WAVE SHAPER |
| 1 | OCTAVE |
| 2 | DETUNE+RINGMOD |
| 3 | DIGITALNESS |

#### `dimension`
| Index | Name |
|-------|------|
| 0 | WAVEFORM |
| 1 | STEREO |
| 2 | FILTER FREQ |
| 3 | RES |

#### `dna`
| Index | Name |
|-------|------|
| 0 | FILTER |
| 1 | WAVE NUMBER |
| 2 | WAVE MODIFIER |
| 3 | NOISE |

#### `drwave`
| Index | Name |
|-------|------|
| 0 | WAVE TYPE AND LENGTH |
| 1 | FILTER |
| 2 | PHASE |
| 3 | CHORUS |

#### `dsynth`
| Index | Name |
|-------|------|
| 0 | ENV CROSSFADER |
| 1 | WAVEFORM |
| 2 | ENVELOPE |
| 3 | CROSS MODULATION |
| 4 | FREQUENCY |
| 5 | WAVEFORM |
| 6 | ENVELOPE |
| 7 | FILTER CUTOFF FREQUENCY |

#### `fm`
| Index | Name |
|-------|------|
| 0 | FM AMOUNT |
| 1 | FREQUENCY |
| 2 | TOPOLOGY |
| 3 | DETUNE |

#### `phase`
| Index | Name |
|-------|------|
| 0 | PHASE SHIFT |
| 1 | DISTORTION AMOUNT |
| 2 | PHASE FILTER |
| 3 | PHASE TILT |

#### `pulse`
| Index | Name |
|-------|------|
| 0 | FILTER |
| 1 | AMPLITUDE |
| 2 | SECOND PULSE |
| 3 | MODULATION |

#### `sampler`
| Index | Name |
|-------|------|
| 0 | START |
| 1 | LOOP IN |
| 2 | LOOP OUT |
| 3 | END |
| 4 | DIRECTION |
| 5 | FINE TUNE |
| 6 | LOOP FADE |
| 7 | GAIN |

#### `string`
| Index | Name |
|-------|------|
| 0 | TENSION |
| 1 | IMPULSE |
| 2 | STEREO |
| 3 | IMPULSE TYPE |

#### `vocoder`
| Index | Name |
|-------|------|
| 0 | WAVEFORM |
| 1 | FORMANT |
| 2 | BANDS |
| 3 | MIX |

#### `voltage`
| Index | Name |
|-------|------|
| 0 | MODULATION |
| 1 | GROUND NOISE |
| 2 | PHASE FILTER |
| 3 | DETUNE |

---

### FX types

#### `cwo`
| Index | Name |
|-------|------|
| 0 | FREQUENCY |
| 1 | DELAY |
| 2 | FEEDBACK |
| 3 | SIDEBAND |

#### `delay`
| Index | Name |
|-------|------|
| 0 | RANGE |
| 1 | SPEED |
| 2 | FEEDBACK |
| 3 | LEVEL |

#### `grid`
| Index | Name |
|-------|------|
| 0 | X SIZE |
| 1 | Y SIZE |
| 2 | Z FEEDBACK |
| 3 | MIX |

#### `mother`
| Index | Name |
|-------|------|
| 0 | DISTANCE |
| 1 | GATE |
| 2 | COLOR |
| 3 | MIX |

#### `nitro`
| Index | Name |
|-------|------|
| 0 | FREQUENCY LOWS |
| 1 | FILTER FOLLOW |
| 2 | FEEDBACK |
| 3 | FREQUENCY HIGHS |

#### `phone`
| Index | Name |
|-------|------|
| 0 | TONE |
| 1 | GSM |
| 2 | BAUD |
| 3 | TELEMATIC |

#### `punch`
| Index | Name |
|-------|------|
| 0 | FREQUENCY |
| 1 | PUNCH |
| 2 | ROUNDS |
| 3 | POWER |

#### `spring`
| Index | Name |
|-------|------|
| 0 | TONE |
| 1 | TURNS |
| 2 | DAMPING |
| 3 | MIX |

#### `terminal`
| Index | Name |
|-------|------|
| 0 | FREQUENCY |
| 1 | BITS |
| 2 | MODEL |
| 3 | MIX |

---

### LFO types

#### `element`
| Index | Name |
|-------|------|
| 0 | SOURCE |
| 1 | AMOUNT |
| 2 | DESTINATION |
| 3 | PARAMETER |

#### `midi`
| Index | Name |
|-------|------|
| 0 | PARAMETER 1 |
| 1 | PARAMETER 2 |
| 2 | PARAMETER 3 |
| 3 | PARAMETER 4 |
| 4 | DESTINATION 1 |
| 5 | DESTINATION 2 |
| 6 | DESTINATION 3 |
| 7 | DESTINATION 4 |

#### `random`
| Index | Name |
|-------|------|
| 0 | SPEED |
| 1 | AMOUNT |
| 2 | DESTINATION |
| 3 | ENVELOPE |
| 4 | PARAMETER |

#### `tremolo`
| Index | Name |
|-------|------|
| 0 | SPEED |
| 1 | PITCH AMOUNT |
| 2 | VOLUME LEVEL |
| 3 | PITCH ENVELOPE |
| 7 | LFO SHAPE |

#### `value`
| Index | Name |
|-------|------|
| 0 | SPEED |
| 1 | AMOUNT |
| 2 | DESTINATION |
| 3 | PARAMETER |
| 4 | LFO SHAPE |

#### `velocity`
| Index | Name |
|-------|------|
| 0 | DESTINATION AMOUNT |
| 1 | VOLUME AMOUNT |
| 2 | DESTINATION |
| 3 | PARAMETER |

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
- Console output: container info, audio format, synth knobs, dual ADSR envelope, FX params, LFO params, raw JSON
- Each parameter printed as `name : raw_value  (normalized)` where normalized = raw / 32767
- Non-zero unnamed slots printed as `knob N [unknown]` — add them to `op1-params.json` once identified
- Always writes a `.json` sidecar at the same path as the input file

### `dump-all.bat`

Runs `op1dump.exe` on every `.aif` in `presets/`.

```
dump-all.bat
```

### `json2aif.exe`

Creates a valid OP-1 Field `.aif` from a `.json` patch file.

```
json2aif.exe <patch.json> [output.aif]
```

```
json2aif.exe mypatch.json            → writes mypatch.aif
json2aif.exe mypatch.json out.aif    → writes out.aif
```

- Output format: AIFC with FVER + COMM (mono, 16-bit, 22050 Hz, `sowt`, 28896 frames ~1.310 s) + APPL (1028 bytes) + SSND (silence)
- JSON must be ≤ 1024 bytes; exits with an error message if too large
- APPL chunk: `"op-1"` signature + JSON + `\n` + space padding to fill the fixed 1028-byte area
- Audio is always silence (all zero samples) — replace SSND manually if real audio is needed
- Automatically injects `"mtime":<unix_ts>.0` at write time in alphabetical position (before `"name"`)
- Refuses to overwrite an existing output file — delete it first or choose a different path
- Strips UTF-8 BOM from input JSON if present

### `gen-explore.ps1`

Generates min and max boundary patches for all 14 × 9 × 6 = 756 synth/FX/LFO combinations (3024 files total).

```
.\gen-explore.ps1 [-VelocityDest <synth|envelope|fx|mix>] [-VelocityParam <raw>]
```

```
.\gen-explore.ps1                                → default: velocity dest = synth (1024)
.\gen-explore.ps1 -VelocityDest fx              → min velocity patches with dest = FX (10144)
.\gen-explore.ps1 -VelocityDest fx -VelocityParam 5824  → also set PARAMETER raw value
```

- Deletes and recreates `explore\` at the start of each run
- Output structure: `explore\aif\[mode]\[synth]\[lfo]\*.aif` and `explore\json\[mode]\[synth]\[lfo]\*.json`
- **min** uses oracle-confirmed hardware minimums per parameter type:
  - `%` scale → 0, `centered %` scale → -32767, `selector` → 1024
  - Synth types with non-zero floors (cluster, digital, dna, fm, string) use oracle-verified values
  - FX types with non-zero floors (delay, grid, nitro, phone, punch, spring) use oracle-verified values
- **max** uses oracle-confirmed hardware maximums per type; only types with ceilings below 32767 have explicit entries (e.g. cluster WAVES max = 17408, delay RANGE max = 11264)
- ADSR is fixed to oracle-verified hardware values for instant-attack / full-sustain so every combination produces audible output
- Requires `json2aif.exe` in the current directory (run `build.bat` first)

### `summarize.ps1`

Reads all parsed presets and produces a grouped discovery report.

```
.\summarize.ps1
```

- No parameters
- **Prerequisite:** run `dump-all.bat` first to generate the `.json` sidecars
- Reads: `presets/*.json`, `op1-params.json`, `op1-params-ok.json`
- Output sections: **Synth Engines**, **FX**, **LFO** — each type shows:
  - Mapping status tag and per-knob min/max raw + normalized ranges + patch count
  - How many patches have that engine/fx/lfo active
- Color coding:
  - Green — all params named and hardware-verified
  - Yellow — type known but some params unnamed or unverified
  - Red — type not in `op1-params.json` at all
- Trailing **"Missing from op1-params.json"** section prints the exact stub lines to paste in

### `diff-patches.ps1`

Diffs two patch files and shows exactly which fields and array indices changed.

```
.\diff-patches.ps1 -FileA <path> -FileB <path>
```

```
.\diff-patches.ps1 presets\name0001.json presets\name0002.json
.\diff-patches.ps1 sandbox\epiphany.aif  presets\epiphany0005.aif
```

- Both `-FileA` and `-FileB` are required (positional, no flag name needed)
- Accepts `.json` or `.aif`; if `.aif` is given, it looks for a `.json` sidecar next to it — run `op1dump.exe` first if the sidecar is missing
- Skips `name`, `mtime`, and `_file` automatically (they always differ between snapshots)
- For scalar fields: prints before/after values
- For array fields: lists each changed index with before → after and signed delta (`+N` / `-N`)
- Prints "No differences" if the patches are identical (excluding skipped fields)

### `test_aif.exe`

Validates that a generated `.aif` file conforms to the OP-1 Field file spec (29 checks).

```
test_aif.exe <file.aif>
```

Checks include: file size, chunk order and sizes (FVER/COMM/APPL/SSND), COMM spec (22050 Hz, 28896 frames, 16-bit `sowt`), APPL JSON (all required keys present, alphabetical key order, `mtime` presence and validity, no UTF-8 BOM), and SSND audio byte count. Exits 0 on pass, non-zero on any failure.

Build with `build.bat`. Source: `test_aif.c`.

### `explore-aif.ps1`

Low-level binary inspector for `.aif` file internals. Multiple flags can be combined in one call.

```
.\explore-aif.ps1 -File <path> [flags]
```

| Flag | Description |
|------|-------------|
| `-ReadBytes` | Hex + ASCII dump of the first N bytes of the file |
| `-ByteCount N` | Number of bytes to show with `-ReadBytes` (default: 128) |
| `-ParseChunks` | Walk the IFF chunk tree — prints chunk ID, file offset, and size for every chunk; peeks COMM channel/frame/bit-depth and APPL signature |
| `-DumpChunk <ID>` | Hex + ASCII dump of a specific chunk by its 4-char ID (e.g. `APPL`, `COMM`, `SSND`, `FVER`); also prints the chunk as UTF-8 text |
| `-ShowJson` | Scan the file for `{...}` blocks and pretty-print each one found |
| `-DecodeFver` | Print the FVER version constant and confirm whether it matches the AIFC standard value `0xA2805140` |
| `-DecodeComm` | Full COMM decode: channels, frame count, bit depth, 80-bit extended sample rate in Hz, compression type and name; includes raw hex |
| `-AnalyzeSsnd` | SSND audio stats: offset/blockSize header, audio byte count, sample count, min/max sample, zero-sample ratio (silence %), peak level in dBFS; shows first and last 32 bytes of audio |

```powershell
.\explore-aif.ps1 -File epiphany.aif -ParseChunks
.\explore-aif.ps1 -File epiphany.aif -DumpChunk APPL
.\explore-aif.ps1 -File epiphany.aif -DecodeComm
.\explore-aif.ps1 -File epiphany.aif -AnalyzeSsnd
.\explore-aif.ps1 -File epiphany.aif -ShowJson
.\explore-aif.ps1 -File epiphany.aif -ReadBytes -ByteCount 256
.\explore-aif.ps1 -File epiphany.aif -ParseChunks -DecodeComm -ShowJson
```

---

## File Layout

```
te-op1/
  op1dump.c          source — patch dumper
  op1dump.exe        compiled dumper
  json2aif.c         source — JSON to AIF writer
  json2aif.exe       compiled writer
  test_aif.c         source — 29-check AIF validator
  test_aif.exe       compiled validator
  op1-params.json    knob/param name database (edit freely, no recompile)
  op1-params-ok.json tracks hardware-verified param indices per type
  display-notes.md   raw↔display value mappings and scale notes per param
  build.bat          recompile all tools (requires MSVC)
  dump-all.bat       batch-process presets/ folder
  gen-explore.ps1    generate min+max boundary patches for all 756 combinations
  summarize.ps1      discovery report across all presets
  diff-patches.ps1   diff two patch files
  explore-aif.ps1    low-level AIF inspector
  index.html         project overview website
  params.html        complete parameter reference (all 29 types)
  display.html       raw↔display scale analysis with oracle-confirmed samples
  presets/           .aif patch files and their .json sidecars
  oracle/            hardware-verified reference exports (tracked in git, never regenerated)
  explore/           generated boundary patches — gitignored, recreate with gen-explore.ps1
                     explore\aif\[min|max]\[synth]\[lfo]\*.aif
                     explore\json\[min|max]\[synth]\[lfo]\*.json
```

---

## Oracle Workflow

`oracle/` stores hardware-verified reference exports — patch files saved directly from the
OP-1 Field with known knob positions. These are the ground truth for parameter values.

**Rules:**
- Never regenerate oracle files from JSON. `json2aif.exe` will refuse to overwrite them.
- To capture a new oracle: set knobs on hardware → export preset → copy `.aif` to `oracle/` →
  run `op1dump.exe oracle\<file>.aif` → inspect the JSON sidecar for raw values.
- Naming convention: `<synth>-<fx>-<lfo>-<tag>.aif` where tag is `0000` (all-min),
  `ffff` (all-max), or a short descriptor.

**Currently verified oracles (53 files):**

| Batch | Files | Purpose |
|-------|-------|---------|
| `amp-cwo-elem-0000` | 1 | All-min reference: amp + cwo + element, all knobs at leftmost position |
| `min0` – `min4` | 5 | Synth-knob minimums: cluster, digital, dna, fm, string |
| `synthmax (1)` – `synthmax (12)` | 12 | Synth-knob maximums: all 14 engine types (amp, cluster, digital, dimension, dna, drwave, fm, phase, pulse, vocoder, voltage, and 1 extra) |
| `synthmax-string-0000`, `synthmax-string` | 2 | String synth max values |
| `sampler-max-0000`, `sampler-max-0001` | 2 | Sampler knob max values (DIRECTION, GAIN) |
| `fx0` – `fx5` | 6 | FX-params minimums: delay, grid, nitro, phone, punch, spring |
| `fx-max (1)` – `fx-max (7)` | 7 | FX-params maximums: mother, nitro, delay, grid, punch, spring, phone |
| `element-max-0000` | 1 | LFO element max values: SOURCE, DESTINATION, PARAMETER selectors |
| `lfo-max (1)` – `lfo-max (3)` | 3 | LFO max values: tremolo SPEED, value SPEED+DESTINATION+LFO SHAPE, velocity |
| `trem-min` | 1 | Tremolo LFO min values |
| `captures-needed (1)` – `captures-needed (14)` | 14 | Mixed captures confirming specific bounded params (phone linear %, mother SPEED, amp/voltage scale data, dsynth, fm topology, cluster, string min/max bounds) |
