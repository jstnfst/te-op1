# OP-1 Field Patch File Format

Notes and tools for reading and writing `.aif` synth patch files for the
Teenage Engineering OP-1 Field.

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
  "fx.mother":     [null, null, null, "MIX"],
  "lfo.tremolo":   []
}
```

- Key format: `"group.type"` — group is `synth`, `fx`, or `lfo`
- Values: array of up to 8 strings (index = knob position)
- `null` = knob position known to exist but not yet named
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
valid but soundless patch. The sample rate in `epiphany.aif` is 22050 Hz;
`json2aif` defaults to 44100 Hz — change `SAMPLE_RATE` in `json2aif.c`
if the device rejects it.

---

## JSON Schema

All numeric parameters are **16-bit integers in the range 0–32767**
(0.0–1.0 normalized).

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

Knob names live in **`op1-params.json`** and are loaded at runtime — no
recompile needed when adding new entries.

### Synth: `cluster`

| Index | Name      |
|-------|-----------|
| 0     | WAVES     |
| 1     | WAVE ENV  |
| 2     | SPREAD    |
| 3     | UNITOR    |

### FX: `mother`

| Index | Name |
|-------|------|
| 3     | MIX  |

*(indices 0–2 active but not yet named)*

---

## Tools

### `op1dump.exe`

Reads a `.aif` patch file, prints all synth metadata with named parameters,
and writes a `.json` sidecar.

```
op1dump.exe epiphany.aif         → prints metadata, writes epiphany.json
```

Reads labels from `op1-params.json` in the current directory. Non-zero
unnamed slots are printed as `knob N [unknown]` so they surface for mapping.

### `dump-all.bat`

Runs `op1dump.exe` on every `.aif` in `presets/`.

```
dump-all.bat
```

### `summarize.ps1`

Reads all `presets/*.json` and produces a discovery report grouped by
synth/fx/lfo type with value ranges and mapping status.

```
.\summarize.ps1
```

Color coding: green = fully named, yellow = type known but names TBD, red = type missing from `op1-params.json`.

### `diff-patches.ps1`

Diffs two patch files (JSON or AIF) and shows exactly which fields and
array indices changed.

```
.\diff-patches.ps1 presets\name0001.json presets\name0002.json
.\diff-patches.ps1 sandbox\epiphany.aif  presets\epiphany0005.aif
```

Skips `name` and `mtime` automatically (they always change in snapshots).

### `json2aif.exe`

Creates a `.aif` from a `.json` patch file with one second of silence for audio.

```
json2aif.exe mypatch.json        → writes mypatch.aif
```

### `explore-aif.ps1`

Low-level inspector for `.aif` file internals (chunk structure, hex dump, etc.).

```powershell
.\explore-aif.ps1 -File epiphany.aif -ParseChunks
.\explore-aif.ps1 -File epiphany.aif -DumpChunk APPL
.\explore-aif.ps1 -File epiphany.aif -DecodeComm
.\explore-aif.ps1 -File epiphany.aif -AnalyzeSsnd
.\explore-aif.ps1 -File epiphany.aif -ShowJson
```

---

## File Layout

```
te-op1/
  op1dump.c          source — patch dumper
  op1dump.exe        compiled dumper
  json2aif.c         source — JSON to AIF writer
  json2aif.exe       compiled writer
  op1-params.json    knob/param name database (edit freely, no recompile)
  build.bat          recompile both tools (requires MSVC)
  dump-all.bat       batch-process presets/ folder
  summarize.ps1      discovery report across all presets
  diff-patches.ps1   diff two patch files
  explore-aif.ps1    low-level AIF inspector
  presets/           drop .aif files here for processing
  sandbox/           reference patches from reverse engineering
```
