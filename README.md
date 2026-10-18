# te-op1

A community patch library and a preset-format reference for the Teenage Engineering
**OP-1 Field** (firmware 1.7.3), live at **https://te-op1.pages.dev**. This repo also
holds `mondo`, the C toolkit that reads, writes, and moves OP-1 patch files.

> **TL;DR**
> - **Want sounds?** Open the [Library](https://te-op1.pages.dev/library), download a `.aif`, and copy it into `synth/` on your OP-1.
> - **Want to know how a preset works?** Open the [Lab](https://te-op1.pages.dev/lab), or read [The preset format](#the-preset-format).
> - **Want to work on the code?** `./master-control.sh setup`, then `./master-control.sh dev up`. See [For developers](#for-developers).

## Two paths

The site splits in two at its home page, and so does this README.

| | **Library**: for musicians | **Lab**: for developers |
|---|---|---|
| Who | OP-1 Field owners who want sounds | Sound designers and tool builders who want the format |
| On the site | Browse, open in the editor, download, like, build packs, upload | Format map, knob layouts, value mappings, `.aif` inspector |
| In this README | [For musicians](#for-musicians) | [For developers](#for-developers) |

---

## For musicians

### Get a patch onto your OP-1

1. Find a patch in the [Library](https://te-op1.pages.dev/library) and download its `.aif`, or select several to get one `.zip`.
2. Connect the OP-1 Field over USB-C. It appears as a portable device (MTP), not a drive. On Windows, it's under *This PC*.
3. Copy the `.aif` into `synth/`, or into a folder inside it such as `synth/mine/`. The OP-1 allows one folder level.

From a Windows terminal, `mondo op1` does the same thing: `mondo op1 push patch.aif synth/mine`. See [`mondo op1`](#mondo-op1).

### On the site

- **Library**: search by name, or filter by engine and tag
- **Patch editor**: open any patch, shape it, and download the `.aif`. Signed in, you can save a copy, update your own patches, or start from **+ New patch**
- **Packs**: curated sets of patches, downloaded as one `.zip`
- **Favorites** and **Mine**: what you've liked, and what you've uploaded or built
- **Upload**: shares the patch settings from an `.aif`. Sampler audio isn't stored, so a downloaded sampler patch carries a placeholder tone

Browsing and downloading are open to everyone. Sign in (Google, Microsoft, Yahoo, or GitHub) to upload, like, and build packs. A GitHub sign-in also lets you file site issues.

---

## For developers

### What's in the repo

```
te-op1/
  src/                 React SPA: home, Library, Packs, Favorites, Mine, Upload, Lab, Issues, Mod
  functions/           Cloudflare Pages Functions: the /api (auth, patches, packs, likes, issues)
  functions/_shared/   validation, tagging, and .aif rebuild: TypeScript ports of mondo.c
  public/              static pages and the shared format data:
                         patch.html    patch editor (Library) and inspector (Lab)
                         params.html   Lab knob layout
                         display.html  Lab value mappings
                         layout-params.js, mapping-data.js, knob-model.js   format data
                         op1-stats.js  coverage numbers shared by the Lab pages
                         aif.js        .aif <-> JSON in the browser
  migrations/          D1 schema
  scripts/             database seeding and master-control helpers
  master-control.sh    dev toolbox: setup, dev server, builds, tests, deploy
  mondo.c              the C toolkit, one source file (with op1_aif.h, cJSON.c/.h)
  build.bat            build mondo.exe with MSVC
  op1-params.json      knob name database read by mondo dump
  oracle/              exports saved on the hardware: the ground truth, never regenerated
  presets/             .aif patches and their .json sidecars
  collection/          patch collections: .aif, .json, and .tags per preset
  sandbox/             hardware probe sets (gitignored; ./master-control.sh probe)
  explore/             generated boundary patches (gitignored; mondo build explore)
```

### Run the website locally

```bash
./master-control.sh setup     # deps, .dev.vars, local DB schema
./master-control.sh dev up    # http://localhost:8788
./master-control.sh help      # every command: build, test, db, deploy
```

The stack is Vite + React on Cloudflare Pages, with Pages Functions for the API and D1 for storage. Setup by hand, OAuth, mock logins, and Cloudflare configuration are in [README-WEB.md](README-WEB.md).

### The preset format

What each knob is on every engine, and how its raw value turns into the number on the screen, lives on the site: [Layout](https://te-op1.pages.dev/lab/layout) for every engine's eight array slots, [Mappings](https://te-op1.pages.dev/lab/mappings) for raw-to-display values, and the [Inspector](https://te-op1.pages.dev/lab/inspector) to read back any `.aif`. The data behind them is `public/layout-params.js`, `public/mapping-data.js`, and `public/knob-model.js`; edit those, not a copy. This section only covers the container and the JSON shape.

#### File structure

OP-1 Field patch files are standard **AIFF-C** containers (IFF with
big-endian chunk lengths). Every patch file contains exactly four chunks
in this order:

| Chunk | Size | Contents |
|-------|------|----------|
| `FVER` | 4 bytes | AIFC version constant `0xA2805140` - always this value |
| `COMM` | 64 bytes | Audio format: mono, 16-bit, 22050 Hz, `sowt` (little-endian signed PCM) |
| `APPL` | 1028 bytes | OP-1 synth metadata (see below) |
| `SSND` | varies | Raw PCM audio sample data used by the synth engine |

**APPL chunk layout**

```
[4 bytes]  "op-1"          application signature
[N bytes]  {...}           JSON string with synth parameters
[pad]      spaces          space-padded to fill exactly 1028 bytes total
```

The JSON is always compact (no whitespace), followed by `\n` then spaces
to reach the 1028-byte boundary.

**Audio (SSND)**

For sample-based synths like **cluster**, the SSND contains the actual
waveform the engine operates on. Replacing it with silence produces a
valid but soundless patch. `mondo build` writes 28896 frames of silence
at 22050 Hz (~1.310 s), which matches hardware-exported patches.

#### JSON schema

Every array value is a **16-bit integer**: most run 0–32767, some are signed (Mappings says which).

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
> strict **alphabetical order**. `mondo build` passes JSON through as-is - callers must order
> keys correctly. Required order:
> `adsr, fx_active, fx_params, fx_type, knobs, lfo_active, lfo_params, lfo_type, mtime, name, octave, synth_version, type`

**dbox** (drum box) presets differ: `drum_version: 2` in place of `synth_version`, no `adsr`, and per-pad arrays instead - `dbox_data` (24 pads × 8 values), `dyna_env` (8), and the optional `pan`, `pan_ab`, `attack`, `fademode`, `stereo`.

### `mondo`: the C toolkit

One source file (`mondo.c`), one executable, one subcommand per job. Build it with `build.bat` (MSVC) or `./master-control.sh build c` (cl, else clang, else gcc).

| Subcommand | What it does |
|---|---|
| [`dump`](#mondo-dump) | print a patch's metadata and write a `.json` sidecar |
| [`build`](#mondo-build) | `.json` → device-loadable `.aif`; boundary-patch generator |
| [`test`](#mondo-test) | check an `.aif` against the file spec |
| [`diff`](#mondo-diff) | show which fields and indices differ between two patches |
| [`explore`](#mondo-explore) | low-level chunk and byte inspector |
| [`summarize`](#mondo-summarize) | per-type knob ranges across all presets |
| [`rename`](#mondo-rename) | set each patch's `"name"` to its filename |
| [`sort`](#mondo-sort) | file patches into `synth/<engine>/` |
| [`tag`](#mondo-tag) | derive musical descriptor tags |
| [`wrap`](#mondo-wrap) | turn an audio file into a sampler patch |
| [`samples`](#mondo-samples) | generate `samples.js` from preset JSON |
| [`op1`](#mondo-op1) | list, copy, and delete files on a connected OP-1 (Windows) |

#### `mondo dump`

Reads a `.aif` patch file, prints all synth metadata with named parameters,
and writes a `.json` sidecar. Pass a directory to process all `.aif` files recursively.

```
mondo dump <file.aif>
mondo dump <directory>
```

```
mondo dump epiphany.aif         → prints metadata, writes epiphany.json
mondo dump presets/             → dumps all .aif files recursively, prints stats
```

- Reads `op1-params.json` from the **current working directory** (not the file's directory)
- Console output: container info, audio format, synth knobs, ADSR, FX params, LFO params, raw JSON
- Each parameter printed as `name : raw_value  (normalized)` where normalized = raw / 32767
- Non-zero unnamed slots printed as `knob N [unknown]` - add them to `op1-params.json` once identified
- Always writes a `.json` sidecar at the same path as the input file
- Directory mode prints a final summary: `=== Done: N processed, N failed (X.XX sec) ===`

#### `mondo build`

Creates a valid OP-1 Field `.aif` from a `.json` patch file. Pass a directory to convert all `.json` files recursively. Also generates all 756×2 boundary patches via the `explore` subcommand.

Note: `mondo build explore` (this boundary-patch generator) is unrelated to the
top-level `mondo explore` subcommand (the low-level binary `.aif` inspector,
formerly `explore-aif.exe`) - the shared word is a naming coincidence, not a typo.

```
mondo build <patch.json> [output.aif]
mondo build zero <patch.json> [output.aif]
mondo build max  <patch.json> [output.aif]
mondo build <directory>
mondo build explore [-dest <synth|envelope|fx|mix>] [-param <N>]
```

```
mondo build mypatch.json                → writes mypatch.aif
mondo build mypatch.json out.aif        → writes out.aif
mondo build zero mypatch.json           → zeros knobs/fx_params/lfo_params
mondo build max  mypatch.json           → sets all three arrays to 32767
mondo build presets/                    → converts all .json files recursively
mondo build explore                     → generates all 3024 files in explore\
mondo build explore -dest fx            → min patches with dest = FX
mondo build explore -dest fx -param 5824
```

- Output format: AIFC with FVER + COMM (mono, 16-bit, 22050 Hz, `sowt`, 28896 frames ~1.310 s) + APPL (1028 bytes) + SSND (silence)
- JSON must be ≤ 1024 bytes; exits with an error message if too large
- Automatically injects `"mtime":<unix_ts>.0` at write time
- Single-file mode refuses to overwrite an existing output file; directory mode overwrites
- Strips UTF-8 BOM from input JSON if present
- **Sampler patches:** looks for a `.wav` sidecar at the same path; embeds it if found, falls back to a 440 Hz sine tone if not

**`explore` subcommand** - generates min and max boundary patches for all 15 × 9 × 6 = 810 synth/FX/LFO combinations (3240 files total):

- Deletes and recreates `explore\` at the start of each run
- Output structure: `explore\aif\[mode]\[synth]\[lfo]\*.aif` and `explore\json\[mode]\[synth]\[lfo]\*.json`
- **min** uses hardware minimums per parameter type; types with non-zero floors use explicit per-type values
- **max** uses hardware maximums per type; types with ceilings below 32767 use explicit per-type values
- ADSR is fixed to instant-attack / full-sustain values so every combination produces audible output

#### `mondo test`

Validates that a generated `.aif` file conforms to the OP-1 Field file spec (29 checks).

```
mondo test <file.aif>
```

Checks include: file size, chunk order and sizes (FVER/COMM/APPL/SSND), COMM spec (22050 Hz, 28896 frames, 16-bit `sowt`), APPL JSON (all required keys present, alphabetical key order, `mtime` presence and validity, no UTF-8 BOM), and SSND audio byte count. Exits 0 on pass, non-zero on any failure.

#### `mondo diff`

Diffs two patch files and shows exactly which fields and array indices changed.

```
mondo diff <file_a> <file_b>
```

```
mondo diff presets\name0001.json presets\name0002.json
mondo diff sandbox\epiphany.aif  presets\epiphany0005.aif
```

- Accepts `.json` or `.aif`; if `.aif` is given, it looks for a `.json` sidecar next to it - run `mondo dump` first if the sidecar is missing
- Skips `name`, `mtime`, and `_file` automatically (they always differ between snapshots)
- For array fields: lists each changed index with before and after values and signed delta (`+N` / `-N`)
- Prints "No differences" if the patches are identical (excluding skipped fields)

#### `mondo explore`

Low-level binary inspector for `.aif` file internals. Multiple flags can be combined in one call.

```
mondo explore <file.aif> [flags]
```

| Flag | Description |
|------|-------------|
| `--read-bytes [N]` | Hex + ASCII dump of the first N bytes of the file (default: 128) |
| `--parse-chunks` | Walk the IFF chunk tree - prints chunk ID, file offset, and size for every chunk |
| `--dump-chunk <ID>` | Hex + ASCII dump of a specific chunk by its 4-char ID (e.g. `APPL`, `COMM`, `SSND`, `FVER`) |
| `--show-json` | Scan the file for `{...}` blocks and print each one found |
| `--decode-fver` | Print the FVER version constant and confirm whether it matches `0xA2805140` |
| `--decode-comm` | Full COMM decode: channels, frame count, bit depth, 80-bit extended sample rate, compression type |
| `--analyze-ssnd` | SSND audio stats: byte count, sample count, min/max sample, silence %, peak level in dBFS |

```
mondo explore epiphany.aif --parse-chunks
mondo explore epiphany.aif --dump-chunk APPL
mondo explore epiphany.aif --decode-comm
mondo explore epiphany.aif --analyze-ssnd
mondo explore epiphany.aif --show-json
mondo explore epiphany.aif --parse-chunks --decode-comm --show-json
```

#### `mondo summarize`

Reads all parsed presets and produces a grouped report.

```
mondo summarize
```

- **Prerequisite:** run `dump-all.bat` first to generate the `.json` sidecars
- Reads: `presets/*.json`, `op1-params.json`, `op1-params-ok.json`
- Output sections: **Synth Engines**, **FX**, **LFO** - each type shows per-knob min/max raw + normalized ranges and patch count
- Trailing **"Missing from op1-params.json"** section prints exact stub lines to paste in

#### `mondo rename`

Renames the `"name"` field inside each `.json` patch to match the file's own filename (without extension). Edits in place.

```
mondo rename <patch.json> [patch2.json ...]
mondo rename <directory>
```

```
mondo rename presets\epiphany.json         → sets name: "epiphany"
mondo rename collection\_anonymized-popular → renames all .json files recursively
```

- Useful for normalising a batch of anonymised or exported patches before loading them on device
- Directory mode prints a final summary: `=== Done: N processed, N failed ===`

#### `mondo sort`

Moves `.json` and `.aif` patch pairs into a `synth/<engine>/` folder tree, organised by synth engine type. The `synth/` folder is created as a **sibling** of the directory passed in.

```
mondo sort <patch.json>
mondo sort <directory>
```

```
mondo sort collection\_anonymized-popular
  → collection\synth\cluster\patch (1).{json,aif}
  → collection\synth\dimension\patch (2).{json,aif}
  ...
```

- Skips any subdirectory named `synth` to avoid re-processing already-sorted files
- Never overwrites an existing destination file - prints `skip (exists)` and moves on
- `.aif` sidecars are moved alongside their `.json`; missing sidecars are silently skipped
- Directory mode prints a final summary: `=== Done: N moved, N skipped, N failed ===`

#### `mondo tag`

Interprets OP-1 patch parameters and outputs a comma-separated list of musical descriptor tags (e.g. `pad`, `metallic`, `lush`, `percussive`). Also writes a `.tags` sidecar file alongside each `.json` for easy grepping.

```
mondo tag <patch.json> [patch2.json ...]
mondo tag <directory>
```

```
mondo tag presets\epiphany.json
  → epiphany: cluster, morphing, pad, lush, spacious, slow tremolo, ambient

mondo tag collection\synth\
  → (tags every .json recursively, writes .tags sidecars, prints stats)
```

Tags are derived from six domains - engine type, envelope shape, FX character, LFO motion, octave register, and composite combinations:

| Domain | Example tags |
|--------|-------------|
| Engine | `cluster`, `fm`, `dimension`, `morphing`, `wide`, `inharmonic` |
| Envelope | `pad`, `percussive`, `sustained`, `swelling`, `tight`, `legato` |
| FX | `lush`, `spacious`, `reverb-heavy`, `echo`, `chorus`, `vintage` |
| LFO | `tremolo`, `vibrato`, `slow tremolo`, `animated`, `unpredictable` |
| Octave | `low register`, `sub`, `upper register` |
| Composite | `ambient`, `stab`, `cinematic`, `lead`, `bell` |

The `.tags` sidecar is a single comma-separated line - grep-friendly:
```
grep "bell\|metallic" collection\synth\fm\*.tags
```

The website tags uploads with a simplified port of this (`functions/_shared/tags.ts`), and caps hand-added tags at 7 per patch.

#### `mondo wrap`

Wraps an audio file into an OP-1 Field sampler patch. The root note defaults to middle C, and it warns about clips longer than the ~6 s the hardware's own sampler patches use.

```
mondo wrap <input.aif | input.wav> [output.aif]
mondo wrap <directory>
```

#### `mondo samples`

Generates `samples.js` from preset JSON files. That file feeds the patch editor's sample list and the local database seed (`node scripts/seed.mjs`).

```
mondo samples <preset.json | directory> [output.js]
mondo samples collection samples.js
```

#### `mondo op1`

List, copy, create, rename, and delete files on a connected OP-1 Field (Windows only).

**TL;DR:** `mondo op1 ls -r synth` to look around, `mondo op1 pull synth presets\op1` to back up, `mondo op1 push mypatch.aif synth/myfolder` to load a patch.

The OP-1 Field connects over **MTP**, not USB mass storage. Explorer lists it under *This PC*, but it never gets a drive letter, so `copy`, `xcopy`, and plain `fopen` can't reach it. `mondo op1` uses the Windows Portable Devices API instead. `./master-control.sh op1 <verb> ...` runs the same commands.

```
mondo op1 [-d <device>] ls    [-r] [path]
mondo op1 [-d <device>] pull  <path> [local dest]
mondo op1 [-d <device>] push  [-f] <local file|folder> <device folder>
mondo op1 [-d <device>] mkdir [-p] <path>
mondo op1 [-d <device>] rm    [-r] <path>
mondo op1 [-d <device>] mv    <path> <new name>
```

```
mondo op1 ls                                      → drum/ mixdown/ synth/ tapes/
mondo op1 ls -r synth                             → every synth folder and patch, with size and date
mondo op1 pull synth/_cluster/bass-4440.aif .     → copies one patch into the current folder
mondo op1 pull synth backup\synth                 → copies the whole synth tree (recursive)
mondo op1 push presets\epiphany.aif synth/mine    → uploads a patch into synth/mine
mondo op1 push -f presets\epiphany.aif synth/mine → replaces it if it already exists
mondo op1 push sandbox\mypatches synth            → uploads a folder as synth/mypatches
mondo op1 mkdir synth/mine                        → creates a patch folder
mondo op1 mv synth/mine/old.aif new.aif           → renames in place
mondo op1 rm synth/mine/new.aif                   → deletes a patch
mondo op1 rm -r synth/mine                        → deletes a folder and its contents
```

- Device paths use `/`, start at the OP-1's root (`synth`, `drum`, `tapes`, `mixdown`), and match case-insensitively
- `pull` works like `cp`: an existing local folder (or a dest ending in `\`) gets the item placed inside it; otherwise the dest is the new name
- `push` won't replace an existing file unless you pass `-f`. MTP has no in-place overwrite, so `-f` deletes the old file and then uploads the new one
- `rm` needs `-r` for folders, and it refuses to delete the root or the four top-level folders
- The OP-1 allows only one folder level (`synth/<folder>/patch.aif`), so a deeper `mkdir` or folder `push` fails
- Renaming a patch also changes its `"name"` field. The OP-1 rewrites the APPL JSON to match the new file name, so the bytes after a rename differ from the original
- `-d <name>` picks a device by its friendly name. By default it matches `OP-1`, or any teenage engineering USB device (VID `2367`)

### Testing on the hardware

Two folders hold patches made for, or saved by, the OP-1 itself.

**`sandbox/`: probe sets** (gitignored, yours to make and throw away). A probe set is a folder of patches that differ in one array slot, so loading them one by one on the device shows what that slot does at each raw value. `master-control.sh` runs the whole loop (Windows, with the OP-1 connected):

```bash
# one patch per value of lfo_params[2], from a base preset, built to .aif
./master-control.sh probe sweep presets/x.json lfo_params 2 1024,2144,4160,7168 rd
./master-control.sh probe push rd     # onto the OP-1 as synth/_rd/
#   ...load each on the device and read the screen; save any you change...
./master-control.sh probe pull rd     # what the device saved -> sandbox/rd/from-device/, dumped to JSON
./master-control.sh probe clean rd    # remove synth/_rd/ from the OP-1
./master-control.sh probe list        # the sets you have
```

Each patch is named `<set> i<index> <value>` (e.g. `rd i2 1024`) so it reads on the device's screen. `probe build <set>` rebuilds a set after you edit its `.json` files by hand. The pulled copies are how firmware quirks show up: the random LFO's DESTINATION, for one, doesn't survive a save on the device.

**`oracle/`: ground truth** (tracked in git, never generated). Reference exports saved directly from the OP-1 Field with known knob positions.

- Never regenerate oracle files from JSON. `mondo build` refuses to overwrite them.
- To capture one: set the knobs on the hardware → save the preset → copy the `.aif` into `oracle/` (`./master-control.sh op1 pull synth/<folder>/<file>.aif oracle/`) → `mondo dump oracle\<file>.aif` and read the raw values from the JSON sidecar.
- Naming: `<synth>-<fx>-<lfo>-<tag>.aif`, where tag is `0000` (all-min), `ffff` (all-max), or a short descriptor.
