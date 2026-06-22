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
| `non-linear` | Appears near max at ~34% linear | FREQUENCY in fx.punch |

---

## Per-parameter notes

### synth.amp
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | VOLUME | `%` | raw 0 → 0% (confirmed min) |
| 1 | COMPRESSOR | `%` | raw 0 → 0% (confirmed min) |
| 2 | TONE | `%` | raw 0 → 0% (confirmed min) |
| 3 | DRIVE | `%` | raw 0 → 0% (confirmed min) |

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
| 2 | FILTER FREQ | `hz` | Displays in Hz; 13742 → 1320 Hz |
| 3 | RES | `%` | |

### fx.punch
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FREQUENCY | `hz` | Log Hz scale; 8952 → above halfway, 11248 → near max; not linear %; hardware min=1344 |
| 1 | PUNCH | `%` | 24512 → 74 |
| 2 | ROUNDS | `discrete-24` | 1–24 inclusive; non-linear mapping: 3744 → 3, 11904 → 11; hardware min=1536 (step 1) |
| 3 | POWER | `%` | 29159 → 88, 31783 → 96 |
| 4–7 | (unknown) | — | Fixed at 8000 in all observed presets |

### fx.phone
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | TONE | `%` | Hardware min=204 (does not go to 0) |
| 1 | GSM | `%` | Hardware min=3072 (~9%); named confirmed from oracle fx3.aif |
| 2 | BAUD | `%` | Hardware min=1536 (~5%); named confirmed from oracle fx3.aif |
| 3 | TELEMATIC | `%` | Hardware min=0 |
| 4–7 | (unknown) | — | Fixed at 8000 in all observed presets |

### lfo.value
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | SPEED | `tempo-dial` | Non-linear BPM dial; no simple numeric reading |
| 1 | AMOUNT | `centered %` | Bipolar -100 to +100; 23255 → ~71% |
| 2 | DESTINATION | `selector` | Discrete named options (e.g. "waveform") |
| 3 | PARAMETER | `selector` | Discrete, options depend on DESTINATION value |
| 4 | LFO SHAPE | `selector` | Wave shape control; always 0 in observed presets (defaults to sine); unverified index — may be at index 7 instead (consistent with lfo.tremolo where shape is at index 7). Need a preset with non-zero shape to confirm. |

### synth.drwave
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | WAVE TYPE AND LENGTH | `discrete-98` | 0–98; hardware max=24568; encodes wave type + length together; 14209 → 57 |
| 1 | FILTER | `discrete-98` | 0–98; hardware max=16379; 11735 → 70 |
| 2 | PHASE | `discrete-98` | 0–98; hardware max=16377; 8199 → 49 |
| 3 | CHORUS | `discrete-99` | 0–99; 100 steps; 0 → 0 |
| 4 | (unknown) | — | hardware max=32000; non-zero at max position |

### fx.delay
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | RANGE | `ms-inverse` | Delay time in ms; **inverse**: lower raw = more time; range 31.25–1000ms; raw 8000 → 125ms; hardware min=1024 |
| 1 | SPEED | `discrete-99` | 0–99; raw 10624 → 25; hardware min=3276 |
| 2 | FEEDBACK | `discrete-99` | 0–99; effective max ~16383; raw 8328 → 50 |
| 3 | LEVEL | `%` | Approximately linear |

### fx.nitro
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FREQUENCY LOWS | `%` | Hardware min=64 (not 0) |
| 1 | FILTER FOLLOW | `centered %` | Bipolar; hardware min=-32768; 0 = neutral center |
| 2 | FEEDBACK | `%` | 0 = min |
| 3 | FREQUENCY HIGHS | `%` | Hardware min=64 (not 0); 9344 → 50%; internal max ~18688 (not 32767) |

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
| 0 | SOURCE | `selector-4` | 4 options in order: **gravity, microphone, envelope, sum**. raw 1024 → gravity (minimum/first). "envelope" seen in presets means this knob was turned to that option. |
| 1 | AMOUNT | `centered %` | Bipolar -100 to +100; raw -32767 → -100 (confirmed min), -13743 → -41, 6245 → 19, 8265 → ~25, 32767 → +100 |
| 2 | DESTINATION | `selector-4` | 4 options in order: **synth (synthesizer engine), envelope, fx, mix**. raw 1024 → synth (minimum/first). Changing this changes what PARAMETER (index 3) can select. |
| 3 | PARAMETER | `selector` | Context-dependent on DESTINATION. When dest=synth: options are the active synth engine's own knob names (e.g. for amp: VOLUME, COMPRESSOR, TONE, DRIVE; for fm: FM AMOUNT, FREQUENCY, TOPOLOGY, DETUNE). raw 1024 → first knob of whatever synth is loaded (confirmed min). When dest=envelope/fx/mix: different options. Examples: "cutoff" (dimension+synth), "filter" (dna+synth), "crossfade" (dsynth+synth), "tilt" (phase+synth, raw 15360) |

### synth.pulse
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FILTER | `%` | 18848 → ~57%; hardware max=23168 |
| 1 | AMPLITUDE | `%` | 3984 → ~12%; hardware max=16384 |
| 2 | SECOND PULSE | `%` | 10752 → ~33%; hardware max=16384 |
| 3 | MODULATION | `centered %` | Bipolar; -6144 → negative; hardware max=16384 (positive side) |

### synth.phase
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | PHASE SHIFT | `%` | 0 → min |
| 1 | DISTORTION AMOUNT | `%` | 14310 → ~44%; hardware max=29491 (does not reach 32767) |
| 2 | PHASE FILTER | `%` | 0 → min |
| 3 | PHASE TILT | `%` | 0 → min |

### synth.cluster
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | WAVES | `%` | Hardware min=3072, hardware max=17408 (does not span full 0–32767) |
| 1 | WAVE ENV | `%` | Hardware min=0 |
| 2 | SPREAD | `%` | Hardware min=512, hardware max=24064 |
| 3 | UNITOR | `selector` | Hardware min=3, hardware max=1638 (distinct selector encoding, not 1024-based) |

### synth.fm
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | FM AMOUNT | `discrete-99` | 0–99; 31743 → 95 |
| 1 | FREQUENCY | `discrete-99` | 0–99; 17352 → 52 |
| 2 | TOPOLOGY | `selector` | Hardware min=1024, hardware max=17408; 13312 → 6 |
| 3 | DETUNE | `discrete-99` | 0–99; 0 → 0 |
| 4 | (unknown) | — | Fixed at 15000 in all observed presets; FM operator param |
| 5 | (unknown) | — | Fixed at 0 in all observed presets |
| 6 | (unknown) | — | Fixed at 100 in all observed presets; FM operator param |
| 7 | (unknown) | — | Fixed at 1500 in all observed presets; FM operator param |

### synth.string
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | TENSION | `%` | Hardware min=64, hardware max=8256 (narrow raw range) |
| 1 | IMPULSE | `max~24064` | Hardware min=512, hardware max=24064 (not 32767); similar to drwave |
| 2 | STEREO | `%` | Hardware max=16384; 16384 → 100% display |
| 3 | IMPULSE TYPE | `selector` | Hardware min=8256, hardware max=16448 |

### fx.grid
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | X SIZE | `discrete-99` | 0–99; non-linear; 9064 → 50; hardware min=1344 |
| 1 | Y SIZE | `discrete-99` | 0–99; non-linear; 6032 → 30; hardware min=1344 |
| 2 | Z FEEDBACK | `discrete-99` | 0–99; ~linear; 23248 → 72 |
| 3 | MIX | `%` | approximately linear |
| 4–7 | (unknown) | — | Fixed at 8000 in all observed presets |

### fx.spring
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | TONE | `%` | Linear 0–100; 16448 → ~50%; hardware min=1344 |
| 1 | TURNS | `%` | Linear 0–100; 14544 → ~44%; hardware min=7744 (~24%) |
| 2 | DAMPING | `%` | Linear 0–100; 4096 → ~12% |
| 3 | MIX | `%` | Linear 0–100; 32767 → max |
| 4–7 | (unknown) | — | Fixed at 8000 in all observed presets |

### lfo.tremolo
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | SPEED | `tempo-dial` | Non-linear tempo/BPM dial |
| 1 | PITCH AMOUNT | `centered %` | Bipolar -100 to +100; 985 → ~3%, 2264 → ~7% |
| 2 | VOLUME LEVEL | `centered %` | Bipolar -100 to +100; -12759 → -38 |
| 3 | PITCH ENVELOPE | `%` | 4592 → ~14%, 12136 → ~37% |
| 7 | LFO SHAPE | `selector` | Confirmed at index 7; 0 → default, 19456 → "exponential"; indices 4–6 are null |

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
| 0 | START | `%` | raw 0 → 0 |
| 1 | LOOP IN | `%` | raw 9821 → ~30% |
| 2 | LOOP OUT | `%` | raw 18033 → ~55% |
| 3 | END | `%` | raw 31301 → ~96% |
| 4 | DIRECTION | `selector-bipolar` | forward/reverse; larger values = reverse; raw 12000 → "forward" |
| 5 | FINE TUNE | `%` | raw 30195 → ~92% |
| 6 | LOOP FADE | `%` | raw 9103 → ~28% |
| 7 | GAIN | `%` | raw 8192 → ~25% |

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
| 0 | AMP | `%` | Hardware label "AMP"; destination volume level; 16381 → ~50% |
| 1 | VOLUME AMOUNT | `centered %` | Bipolar -100 to +100; 16694 → ~51% (positive side) |
| 2 | DESTINATION | `selector-4` | synth=1024 (inferred), envelope≈5824 [inferred], fx≈10144 [inferred], mix≈15360 [inferred] — values based on lfo.midi selector-4 pattern |
| 3 | PARAMETER | `selector` | Context-dependent on DESTINATION and synth type. For synth=amp (dest=synth): volume→1024, comp≈5824, tone≈10144, drive≈15360 [inferred]. 15360 → "telematic" when dest=fx/phone |

### lfo.random
| Index | Name | Scale | Notes |
|---|---|---|---|
| 0 | SPEED | `non-linear` | Like other LFO speeds; 4952 → 6 |
| 1 | AMOUNT | `discrete-99` | 0–99 (not 0–24 like element/tremolo); 7167 → 21 |
| 2 | DESTINATION | `selector` | 4952 → "fx" |
| 3 | ENVELOPE | `%` | ~linear; 28925 → ~88% |
| 4 | PARAMETER | `selector` | Context-dependent on DESTINATION; raw 0 → "freq" when destination = "fx" |

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
