# OP-1 Field Parameter Display Notes

Observations on how the hardware displays parameter values. Raw values are
16-bit integers (0–32767, sometimes negative). The display scale varies by
parameter type.

---

## Display scale types seen so far

| Scale type | Description | Example |
|---|---|---|
| `%` | Linear 0–100 percentage | DIGITALNESS, POWER |
| `centered %` | Linear, centered at 0, negative possible | DETUNE+RINGMOD |
| `discrete-N` | Discrete steps 0–N (or 1–N) | OCTAVE (0–6), ROUNDS (1–24), AMOUNT in lfo.value (0–24) |
| `hz` | Frequency in Hz | FILTER FREQ in dimension |
| `tempo-dial` | Non-linear BPM/tempo dial | SPEED in lfo.value |
| `selector` | Named discrete options | DESTINATION, PARAMETER (context-dependent) |
| `non-linear` | Appears near max at ~34% linear | IMPULSE in synth.string |

---

## Per-parameter notes

### synth.amp
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | VOLUME | `%` | confirmed linear %; 16415 → 50 (oracle capture 12) |
| 1 | COMPRESSOR | `%` | confirmed linear %; 16416 → 50 (oracle capture 12) |
| 2 | TONE | `%` | confirmed linear %; 16704 → 51 (oracle capture 12) |
| 3 | DRIVE | `%` | confirmed linear %; 16384 → 50 (oracle capture 12) |

### synth.voltage
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | AMPERE MODULATION | `%` | confirmed linear %; 16383 → 50, 26623 → 81 (oracle captures 13+14) |
| 1 | GROUND NOISE | `%` | confirmed linear %; 14336 → 44, 26623 → 81 (oracle captures 13+14) |
| 2 | PHASE FILTER | `%` | confirmed linear %; 20992 → 64, 29183 → 89 (oracle captures 13+14) |
| 3 | VOLTAGE DETUNE | `%` | confirmed linear %; 16384 → 50, 26112 → 80 (oracle captures 13+14) |

### synth.digital
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | WAVE SHAPER | `%` | |
| 1 | OCTAVE | `discrete-6` | 0–6 inclusive; 19712 → 4; hardware min=2048, hardware max=26624 |
| 2 | DETUNE+RINGMOD | `centered %` | Negative values; -10369 → 33; hardware min=-32768 |
| 3 | DIGITALNESS | `%` | |

### synth.dimension
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | WAVEFORM | `%` | |
| 1 | STEREO | `%` | |
| 2 | FILTER CUTOFF FREQ | `hz` | Displays in Hz; 13742 → 1320 Hz |
| 3 | RESONANCE | `%` | |

### fx.punch
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FREQUENCY | `%` | Linear gauge with pointer display; hardware min=1344, max=12480 (oracle fx4+fx-max(4)) |
| 1 | PUNCH | `%` | 24512 → 74; hardware max=32767 |
| 2 | ROUNDS | `discrete-24` | 1–24 inclusive; non-linear; hardware min=1536 (step 1), hardware max=25088 (step 24) |
| 3 | POWER | `%` | 29159 → 88; hardware max=32767 |
| 4–7 | — | `fixed` | Firmware-managed constant; always 8000 across all oracle captures |

### fx.phone
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | TONE | `%` | Confirmed linear %; display=(raw−204)/20276×100; 5458→26, 10522→51 (oracle captures 10+11) |
| 1 | GSM | `%` | Confirmed linear %; display=(raw−3072)/14336×100; 6712→26, 10352→51 (oracle captures 10+11) |
| 2 | BAUD | `%` | Confirmed linear %; display=(raw−1536)/15360×100; 5466→26, 9426→52 (oracle captures 10+11) |
| 3 | TELEMATIC | `%` | Confirmed linear %; full 0–32767 range; 8441→26, 16876→52 (oracle captures 10+11) |
| 4–7 | — | `fixed` | Firmware-managed constant; always 8000 across all oracle captures |

### lfo.value
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | SPEED | `tempo-dial` | Non-linear tempo dial; hardware min=0, max=16384 (oracle); differs from tremolo max (32440) |
| 1 | AMOUNT | `centered %` | Bipolar -100 to +100; 23255 → ~71% |
| 2 | DESTINATION | `selector` | Selects which synth parameter to modulate; for amp synth: hardware max=11264 (oracle lfo-max(2)) |
| 3 | PARAMETER | `selector` | Discrete, options depend on DESTINATION value; hardware max=15360 |
| 4 | LFO SHAPE | `selector` | Confirmed at index 4 (oracle lfo-max(2)); hardware max=28086; differs from lfo.tremolo (index 7, max=32767) |

### synth.drwave
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | WAVE TYPE AND LENGTH | `discrete-98` | 0–98; hardware max=24568 (oracle synthmax(6)); encodes wave type + length together; 14209 → 57, 24568 → 98 |
| 1 | FILTER | `discrete-98` | 0–98; hardware max=16379 (oracle); 11735 → 70, 16379 → 98 |
| 2 | PHASE | `discrete-98` | 0–98; hardware max=16377 (oracle); 8199 → 49, 16377 → 98 |
| 3 | CHORUS | `discrete-99` | 0–99; 100 steps; 0 → 0, 32767 → 99 |

### fx.delay
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | RANGE | `ms-inverse` | Delay time in ms; **inverse**: lower raw = more time; range 31.25–1000ms; raw 8000 → 125ms; hardware min=1024, hardware max=11264 |
| 1 | SPEED | `discrete-99` | 0–99; raw 10624 → 25; hardware min=3276, hardware max=32767 |
| 2 | FEEDBACK | `discrete-99` | 0–99; raw 8328 → 50; hardware max=16384 |
| 3 | LEVEL | `%` | Approximately linear; hardware max=32767 |

### fx.nitro
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FREQUENCY LOWS | `%` | Hardware min=64, hardware max=16448 |
| 1 | FILTER FOLLOW | `centered %` | Bipolar; hardware min=-32768, hardware max=32767 |
| 2 | FEEDBACK | `%` | Hardware min=0, hardware max=20643 |
| 3 | FREQUENCY HIGHS | `%` | Hardware min=64, hardware max=16448 |

### synth.dna
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FILTER | `centered %` | Bipolar; hardware min=-29491 (≈ -90%); not a simple 0–100 % |
| 1 | WAVE NUMBER | `%` | Hardware min=4608, hardware max=12800 (limited range) |
| 2 | WAVE MODIFIER | `%` | max=32767 |
| 3 | NOISE | `%` | |

### lfo.element
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | SOURCE | `selector-4` | 4 options in order: **gravity, microphone, envelope, sum**. raw 1024 → gravity (min), raw 7168 → sum (max). Note: element uses different selector raw values than lfo.midi. |
| 1 | AMOUNT | `centered %` | Bipolar -100 to +100; raw -32767 → -100 (min), 32767 → +100 (max) |
| 2 | DESTINATION | `selector-4` | 4 options in order: **synth, envelope, fx, mix**. raw 1024 → synth (min), raw 7168 → mix (max). Changing this changes what PARAMETER (index 3) can select. |
| 3 | PARAMETER | `selector` | Context-dependent on DESTINATION. raw 1024 → first knob (min), raw 15360 → last option (max). When dest=synth: options are the active synth engine's knob names. See table below. |

#### lfo.element PARAMETER — dest=synth mapping

4-param synths use raw values: **1024, 4864, 8704, 15360** (confirmed via oracle: cluster; predicted for others).

| Synth | raw 1024 | raw 4864 | raw 8704 | raw 15360 |
|-------|----------|----------|----------|-----------|
| amp | VOLUME | COMPRESSOR | TONE | DRIVE |
| cluster | WAVE NUMBER | WAVE ENV | SPREAD | UNITOR |
| digital | WAVE SHAPER | OCTAVE | DETUNE+RINGMOD | DIGITALNESS |
| dimension | WAVEFORM | STEREO | FILTER CUTOFF FREQ | RESONANCE |
| dna | FILTER | WAVE NUMBER | WAVE MODIFIER | NOISE |
| drwave | WAVE TYPE AND LENGTH | FILTER | PHASE | CHORUS |
| fm | FM AMOUNT | FREQUENCY | TOPOLOGY | DETUNE |
| phase | PHASE SHIFT | DISTORTION AMOUNT | PHASE FILTER | PHASE TILT |
| pulse | FILTER | AMPLITUDE | PULSE TWO | MODULATION |
| string | TENSION | DECAY | DETUNE | IMPULSE TYPE |
| vocoder | WAVEFORM | FORMANT | BANDS | MIX |
| voltage | AMPERE MODULATION | GROUND NOISE | PHASE FILTER | VOLTAGE DETUNE |

8-param synths use raw values: **1024, 2944, 4384, 6304, 8224, 10624, 13024, 15360** (confirmed via oracle: dsynth; predicted for sampler).

| Synth | 1024 | 2944 | 4384 | 6304 | 8224 | 10624 | 13024 | 15360 |
|-------|------|------|------|------|------|-------|-------|-------|
| dsynth | ENVELOPE CROSSFADER | WAVEFORM 1 | ENVELOPE 1 | CROSS MODULATION | FREQUENCY | WAVEFORM 2 | ENVELOPE 2 | CUTOFF |
| sampler | START | LOOP IN | LOOP OUT | END | DIRECTION | FINE TUNE | LOOP FADE | GAIN |

### synth.pulse
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FILTER | `%` | 18848 → ~57%; hardware max=23168 |
| 1 | AMPLITUDE | `%` | 3984 → ~12%; hardware max=16384 |
| 2 | PULSE TWO | `%` | 10752 → ~33%; hardware max=16384 |
| 3 | MODULATION | `centered %` | Bipolar; -6144 → negative; hardware max=16384 (positive side) |

### synth.phase
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | PHASE SHIFT | `%` | 0 → min |
| 1 | DISTORTION AMOUNT | `%` | 14310 → 44, 29491 → 90; hardware max=29491 (oracle synthmax(9)); does not reach 32767 |
| 2 | PHASE FILTER | `%` | 0 → min |
| 3 | PHASE TILT | `%` | 0 → min |

### synth.cluster
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | WAVE NUMBER | `%` | Hardware min=3072, max=17408 (oracle min0+synthmax(2)); does not span full 0–32767 |
| 1 | WAVE ENV | `%` | Hardware min=0, max=32767 (oracle) |
| 2 | SPREAD | `%` | Hardware min=512, max=24064 (oracle); does not span full 0–32767 |
| 3 | UNITOR | `%` | linear %; hardware min=3, max=1638 (oracle) |

### synth.dsynth
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | ENVELOPE CROSSFADER | `%` | Linear knob; range 0–32767 (oracle captures 1+synthmax(7)) |
| 1 | WAVEFORM 1 | `%` | Linear knob; range 0–32767 |
| 2 | ENVELOPE 1 | `%` | Linear knob; range 0–32767 |
| 3 | CROSS MODULATION | `%` | Linear knob; range 0–32767 |
| 4 | FREQUENCY | `%` | Linear knob; range 0–32767 |
| 5 | WAVEFORM 2 | `%` | Linear knob; range 0–32767 |
| 6 | ENVELOPE 2 | `%` | Linear knob; range 0–32767 |
| 7 | CUTOFF | `%` | Linear knob; range 0–32767 |

### synth.fm
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FM AMOUNT | `discrete-99` | 0–99; 31743 → 95 |
| 1 | FREQUENCY | `discrete-99` | 0–99; 17352 → 52 |
| 2 | TOPOLOGY | `selector` | Hardware min=1024, max=17408 (oracle min3+synthmax(8)); 9 options; 13312 → 6 |
| 3 | DETUNE | `discrete-99` | 0–99; 0 → 0 |
| 4 | — | `fixed` | Firmware-managed FM operator constant; always 15000 across all oracle captures |
| 5 | — | `fixed` | Firmware-managed FM operator constant; always 0 across all oracle captures |
| 6 | — | `fixed` | Firmware-managed FM operator constant; always 100 across all oracle captures |
| 7 | — | `fixed` | Firmware-managed FM operator constant; always 1500 across all oracle captures |

### synth.string
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | TENSION | `%` | Hardware min=64, hardware max=8256 (narrow raw range) |
| 1 | DECAY | `max~24064` | Hardware min=512, hardware max=24064 (not 32767); similar to drwave |
| 2 | DETUNE | `%` | Hardware max=16384; 16384 → 100% display |
| 3 | IMPULSE TYPE | `%` | linear %; hardware min=8256, max=16448 (oracle) |

### fx.grid
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | X SIZE | `discrete-99` | 0–99; non-linear; 9064 → 50; hardware min=1344, hardware max=16704 |
| 1 | Y SIZE | `discrete-99` | 0–99; non-linear; 6032 → 30; hardware min=1344, hardware max=16704 |
| 2 | Z FEEDBACK | `discrete-99` | 0–99; ~linear; 23248 → 72; hardware max=32767 |
| 3 | MIX | `%` | approximately linear; hardware max=32767 |
| 4–7 | — | `fixed` | Firmware-managed constant; always 8000 across all oracle captures |

### fx.spring
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | TONE | `%` | Hardware min=1344, hardware max=16448 |
| 1 | TURNS | `%` | Hardware min=7744, hardware max=16448 |
| 2 | DAMPING | `%` | 4096 → ~12%; hardware max=16384 |
| 3 | MIX | `%` | Hardware max=32767 |
| 4–7 | — | `fixed` | Firmware-managed constant; always 8000 across all oracle captures |

### lfo.tremolo
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | SPEED | `tempo-dial` | Non-linear tempo dial; hardware min=0, max=32440 (oracle); raw sweep: 0, 2943, 4576, 12751, 16348, 22228, 29422, 32440 |
| 1 | PITCH AMOUNT | `centered %` | Bipolar -100 to +100; 985 → ~3%, 2264 → ~7% |
| 2 | VOLUME LEVEL | `centered %` | Bipolar -100 to +100; -12759 → -38 |
| 3 | PITCH ENVELOPE | `%` | 4592 → ~14%, 12136 → ~37% |
| 7 | LFO SHAPE | `selector` | Confirmed at index 7; 0 → default, 19456 → "exponential", 32767 → max; indices 4–6 are null |

### fx.terminal
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FREQUENCY | `hz` | Log Hz scale; raw 0 → 100 Hz, raw 32767 → 20 kHz |
| 1 | BITS | `decimal` | raw 0 → 2.0 bits, raw 32767 → 16 bits |
| 2 | MODEL | `decimal` | Continuous decimal scale 1.0–6.0; raw 0 → 1.0, raw 32767 → 6.0 |
| 3 | MIX | `%` | raw 32767 → 100%; raw 14322 → 50% |

### synth.sampler
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | START | `%` | raw 0 → 0; hardware max=32766 |
| 1 | LOOP IN | `%` | raw 9821 → ~30% |
| 2 | LOOP OUT | `%` | raw 18033 → ~55% |
| 3 | END | `%` | raw 31301 → ~96% |
| 4 | DIRECTION | `selector-bipolar` | forward/reverse; raw 12000 → "forward", hardware max=24576 (reverse) |
| 5 | FINE TUNE | `%` | raw 30195 → ~92% |
| 6 | LOOP FADE | `%` | raw 9103 → ~28% |
| 7 | GAIN | `%` | raw 8192 → ~25%; hardware max=32767 |

Note: sampler presets include extra JSON fields (`base_freq`, `fade`, `stereo`) in addition
to the standard keys. Explore presets now include these fields: `base_freq=261.625550` (Middle C),
`fade=0`, `stereo=true`, matching oracle captures (`sampler-max-0000.json`).

### synth.vocoder
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | WAVEFORM | `selector-8` | Named options: S, 1, 2, 3, 4, 5, 6, N (8 options); raw 0 → "S" |
| 1 | FORMANT | `discrete-centered` | Range -4 to +4 (9 steps); raw 0 → -4 (so 0 is the minimum, not center) |
| 2 | BANDS | `discrete-7` | 0–7 inclusive (8 steps); raw 0 → 0 |
| 3 | MIX | `%` | raw 0 → 0 |

### fx.cwo
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FREQUENCY | `%` | ~linear; raw 16366 → 50% |
| 1 | DELAY | `%` | ~linear; raw 16677 → 50% |
| 2 | FEEDBACK | `%` | ~linear; raw 16610 → 50% |
| 3 | SIDEBAND | `%` | ~linear; raw 15345 → 50% |

### lfo.midi
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | PARAMETER 1 | `selector-4` | Selects target knob: 1, 2, 3, 4; raw 1024 → 1 (confirmed) |
| 1 | PARAMETER 2 | `selector-4` | Same scale as PARAMETER 1; raw 5824 → 2 (inferred) |
| 2 | PARAMETER 3 | `selector-4` | Same scale as PARAMETER 1; raw 10144 → 3 (inferred) |
| 3 | PARAMETER 4 | `selector-4` | Same scale as PARAMETER 1; raw 15360 → 4 (inferred) |
| 4 | DESTINATION 1 | `selector-4` | Options: synth, envelope, fx, sound output; raw 1024 → "synth" (confirmed) |
| 5 | DESTINATION 2 | `selector-4` | Same options; raw 2144 → "envelope" (inferred) |
| 6 | DESTINATION 3 | `selector-4` | Same options; raw 4384 → "fx" (inferred) |
| 7 | DESTINATION 4 | `selector-4` | Same options; raw 7168 → "sound output" (inferred) |

### lfo.velocity
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | AMP | `%` | Hardware label "AMP"; destination volume level; 16381 → ~50%; hardware max=32767 (oracle lfo-max(3)) |
| 1 | VOLUME AMOUNT | `centered %` | Bipolar -100 to +100; 16694 → ~51% (positive side); hardware max=32767 (oracle lfo-max(3)) |
| 2 | DESTINATION | `selector-4` | Options: synth/envelope/fx/mix; 1024 → synth (confirmed), max=7168 → mix (oracle lfo-max(3)); same encoding as lfo.element DESTINATION |
| 3 | PARAMETER | `selector` | Context-dependent on DESTINATION and synth type; hardware max=15360 (oracle lfo-max(3)) |

### lfo.random
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | SPEED | `non-linear` | Like other LFO speeds; 4952 → 6 |
| 1 | AMOUNT | `discrete-99` | 0–99 (not 0–24 like element/tremolo); 7167 → 21 |
| 2 | DESTINATION | `selector` | 4952 → "fx" |
| 3 | ENVELOPE | `%` | ~linear; 28925 → ~88% |
| 4 | PARAMETER | `selector` | Context-dependent on DESTINATION; raw 0 → "freq" when destination = "fx" |

### adsr (global, all synth types)

Confirmed via oracle probes adsr01–adsr11 (2026-06-23). All 8 indices are global keyboard
settings, not synth-type-specific. Baseline `[64, 64, 0, 64, 2048, 64, 2048, 3276]`.

| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | ATTACK | `%` | linear %; hardware min=64, probe max=16320 |
| 1 | DECAY | `%` | linear %; hardware min=64, probe max=16320 |
| 2 | SUSTAIN | continuous | hardware min=0, max=32767 |
| 3 | RELEASE | `%` | linear %; hardware min=64, probe max=16320 |
| 4 | PLAY MODE | `selector-4` | 2048=poly, 6140=mono, 9209=legato, 14336=unison |
| 5 | PORTAMENTO | `%` | linear %; hardware min=64, probe max=16448 |
| 6 | BEND RANGE | `selector-5` | 2048=1 semitone, 5117=2 semitones, 9209=4 semitones, 13301=7 semitones, 18432=octave |
| 7 | VOLUME | `discrete-100` | 1–100; formula: raw ≈ floor(N × 32767 / 100); 3276→10, 32767→100 |

---

## General observations

- Parameters that are **selector/discrete** types cannot be verified by
  percentage alone — need to check the named option displayed.
- FILTER FREQ-style params likely use a logarithmic Hz mapping.
- The `AMOUNT` parameter on LFOs commonly uses a 0–24 scale.
- Negative raw values appear for centered/bipolar params (e.g. DETUNE).
- FX and LFO param arrays are always 8 elements long in the JSON, but the
  number of *active* indices varies by type. Do not assume indices 4–7 are
  unused for any type — verify each type independently.
