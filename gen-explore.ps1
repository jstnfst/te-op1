<#
.SYNOPSIS
    Generates min and max boundary patches for every synth × fx × lfo combination.

.DESCRIPTION
    Produces 14 synths × 9 FX × 6 LFOs = 756 unique combinations.
    For each combination two files are written to explore\min\ and explore\max\:
      [ssssffffllll].json   — compact patch JSON (source of truth)
      [ssssffffllll].aif    — AIFF-C ready to load on the OP-1 Field

    "min" uses the actual hardware minimum for each parameter type:
      - % scale          → 0
      - centered % scale → -32767
      - selector         → 1024 (first option, consistent across observed selectors)
    lfo_params vary by LFO type because they contain selector and centered-% params.
    Synth knobs and fx_params are all % or discrete with min = 0.

    "max" sets all arrays to 32767.

    ADSR is fixed to instant-attack / full-sustain so every combination
    produces audible output when a key is held.

    Run from the te-op1 root.  Output goes to explore\ which is gitignored.
    Requires: json2aif.exe in the current directory.

.PARAMETER VelocityDest
    DESTINATION selector value for lfo.velocity min presets.
    Options (inferred from selector-4 pattern): synth=1024, envelope=5824, fx=10144, mix=15360.
    Default: synth (1024).

.PARAMETER VelocityParam
    Raw value for the PARAMETER selector in lfo.velocity min presets.
    Meaning is context-dependent on VelocityDest and the loaded synth.
    For dest=synth with synth.amp: volume=1024, comp≈5824, tone≈10144, drive≈15360.
    Default: 1024 (first knob / volume for amp).
#>

param(
    [ValidateSet('synth','envelope','fx','mix')]
    [string]$VelocityDest  = 'synth',
    [int]   $VelocityParam = 1024
)

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'

# ── Engine lists ─────────────────────────────────────────────────────────────
$synthTypes = @('amp','cluster','digital','dimension','dna','drwave',
                'dsynth','fm','phase','pulse','sampler','string','vocoder','voltage')
$fxTypes    = @('cwo','delay','grid','mother','nitro','phone','punch','spring','terminal')
$lfoTypes   = @('element','midi','random','tremolo','value','velocity')

# synth_version per engine type
# [oracle] = confirmed from hardware export. [inferred] = not yet hardware-verified.
$synthVersion = @{
    amp       = 3   # [oracle]
    cluster   = 3   # [oracle] min0.aif
    digital   = 3   # [oracle] min1.aif
    dimension = 3   # [oracle] amp-cwo-elem-0000
    dna       = 3   # [oracle] min2.aif
    drwave    = 2   # [inferred]
    dsynth    = 2   # [inferred]
    fm        = 3   # [oracle] min3.aif
    phase     = 2   # [inferred]
    pulse     = 2   # [inferred]
    sampler   = 3   # [oracle]
    string    = 3   # [oracle] min4.aif
    vocoder   = 3   # [oracle]
    voltage   = 2   # [inferred]
}

# ── Minimum lfo_params per LFO type ──────────────────────────────────────────
# Rules applied per parameter:
#   % scale          → 0
#   centered % scale → -32767  (e.g. AMOUNT in element, VOLUME LEVEL in tremolo)
#   selector         → 1024    (first option; oracle-confirmed for element)
#   discrete-N       → 0
#   tempo-dial       → 0       (unverified; using 0 as floor)
#
# [oracle] = verified from hardware export with all knobs at leftmost position.
# [inferred] = derived from documented scale type; not yet hardware-verified.
$lfoMinParams = @{
    # [oracle] amp-cwo-elem-0000.aif: all knobs at min
    #   SOURCE=selector(gravity)=1024, AMOUNT=centered%=-32767,
    #   DESTINATION=selector(synth)=1024, PARAMETER=selector(first)=1024
    element  = '1024,-32767,1024,1024,0,0,0,0'

    # [inferred] all 8 indices are selectors (knob 1-4, dest 1-4); min = 1024
    midi     = '1024,1024,1024,1024,1024,1024,1024,1024'

    # [inferred] DESTINATION=selector→1024, ENVELOPE=%→0, PARAMETER=selector→1024
    random   = '0,0,1024,0,1024,0,0,0'

    # [inferred] PITCH AMOUNT=centered%→-32767, VOLUME LEVEL=centered%→-32767; SPEED/ENV are 0
    tremolo  = '0,-32767,-32767,0,0,0,0,0'

    # [inferred] AMOUNT=centered%→-32767, DESTINATION=selector→1024, PARAMETER=selector→1024
    value    = '0,-32767,1024,1024,0,0,0,0'

    # [inferred] AMP=%→0, VOLUME AMOUNT=centered%→-32767, DESTINATION/PARAMETER=selector (see -VelocityDest/-VelocityParam)
    velocity = $null  # filled dynamically below
}

$velocityDestRaw = @{ synth=1024; envelope=5824; fx=10144; mix=15360 }[$VelocityDest]
$lfoMinParams['velocity'] = "0,-32767,$velocityDestRaw,$VelocityParam,0,0,0,0"

# ── Minimum synth knobs per engine type ──────────────────────────────────────
# Hardware-confirmed minimum knob values (all knobs at leftmost position).
# Only engines whose hardware mins differ from all-zeros are listed here.
# [oracle] = raw JSON extracted from hardware export with all knobs at min.
$synthKnobsMin = @{
    # [oracle] min0.aif: WAVES=3072, SPREAD=512, UNITOR=3 have non-zero floors
    cluster = '3072,0,512,3,0,0,0,0'
    # [oracle] min1.aif: OCTAVE min=2048 (selector floor), DETUNE+RINGMOD is bipolar min=-32768
    digital = '0,2048,-32768,0,0,0,0,0'
    # [oracle] min2.aif: FILTER is bipolar (min=-29491), WAVE NUMBER min=4608
    dna     = '-29491,4608,0,0,0,0,0,0'
    # [oracle] min3.aif: TOPOLOGY min=1024 (selector), knobs[4-7] are fixed FM operator params
    fm      = '0,0,1024,0,15000,0,100,1500'
    # [oracle] min4.aif: TENSION=64, IMPULSE=512, IMPULSE TYPE=8256 have non-zero floors
    string  = '64,512,0,8256,0,0,0,0'
}

# ── Maximum synth knobs per engine type ──────────────────────────────────────
# Hardware-confirmed maximum knob values (all knobs at rightmost position).
# Only engines whose hardware maxes differ from all-32767 are listed here.
# Missing: sampler, string (no synthmax oracle provided).
# [oracle] = raw JSON extracted from synthmax(N).aif hardware exports.
$synthKnobsMax = @{
    # [oracle] synthmax(1).aif: indices 4-7 fixed at 0
    amp       = '32767,32767,32767,32767,0,0,0,0'
    # [oracle] synthmax(2).aif: WAVES=17408 (selector max), SPREAD=24064, UNITOR=1638 (selector max)
    cluster   = '17408,32767,24064,1638,0,0,0,0'
    # [oracle] synthmax(3).aif: OCTAVE=26624 (discrete-6 max), indices 4-7=0
    digital   = '32767,26624,32767,32767,0,0,0,0'
    # [oracle] synthmax(4).aif: indices 4-7 fixed at 0
    dimension = '32767,32767,32767,32767,0,0,0,0'
    # [oracle] synthmax(5).aif: WAVE NUMBER=12800 (selector max), indices 4-7=0
    dna       = '32767,12800,32767,32767,0,0,0,0'
    # [oracle] synthmax(6).aif: WAVE TYPE=24568, FILTER=16379, PHASE=16377, index4=32000
    drwave    = '24568,16379,16377,32767,32000,0,0,0'
    # dsynth: all 32767 including indices 4-7 — no entry needed
    # [oracle] synthmax(8).aif: TOPOLOGY=17408 (selector max), indices 4-7=fixed FM operator params
    fm        = '32767,32767,17408,32767,15000,0,100,1500'
    # [oracle] synthmax(9).aif: DISTORTION AMOUNT=29491, indices 4-7=0
    phase     = '32767,29491,32767,32767,0,0,0,0'
    # [oracle] synthmax(10).aif: FILTER=23168, AMPLITUDE=16384, SECOND PULSE=16384, MODULATION=16384
    pulse     = '23168,16384,16384,16384,0,0,0,0'
    # [oracle] sampler-max-0001.aif: START=32766, DIRECTION=24576 (reverse/max), GAIN=32767
    sampler   = '32766,32767,32767,32767,24576,32767,32767,32767'
    # [oracle] synthmax-string-0000.aif: TENSION=8256, IMPULSE=24064, STEREO=16384, IMPULSE TYPE=16448
    string    = '8256,24064,16384,16448,0,0,0,0'
    # [oracle] synthmax(11).aif: indices 4-7=0
    vocoder   = '32767,32767,32767,32767,0,0,0,0'
    # [oracle] synthmax(12).aif: indices 4-7=0
    voltage   = '32767,32767,32767,32767,0,0,0,0'
}

# ── Maximum fx_params per FX type ────────────────────────────────────────────
# Indices 4-7 must remain 8000 for these FX types (same as min; firmware requirement).
# Active params (0-3) use 32767 unless oracle data shows a lower ceiling.
# [oracle] = confirmed from min oracle work (fx0-fx5.aif).
$fxParamsMax = @{
    # [oracle] cwo: all active params valid at 32767; indices 4-7=0
    cwo    = '32767,32767,32767,32767,0,0,0,0'
    # [oracle] fx-max(2).aif: RANGE=11264, FEEDBACK=16384; indices 4-7=0
    delay  = '11264,32767,16384,32767,0,0,0,0'
    # [oracle] fx-max(3).aif: X SIZE=16704, Y SIZE=16704; indices 4-7=8000
    grid   = '16704,16704,32767,32767,8000,8000,8000,8000'
    # [oracle] fx-max(1).aif: FREQ LOWS=16448, FEEDBACK=20643, FREQ HIGHS=16448; indices 4-7=0
    nitro  = '16448,32767,20643,16448,0,0,0,0'
    # [oracle] fx-max(7).aif: TONE=20480, GSM=17408, BAUD=16896; indices 4-7=8000
    phone  = '20480,17408,16896,32767,8000,8000,8000,8000'
    # [oracle] fx-max(4).aif: FREQUENCY=12480, ROUNDS=25088; indices 4-7=8000
    punch  = '12480,32767,25088,32767,8000,8000,8000,8000'
    # [oracle] fx-max(5).aif: TONE=16448, TURNS=16448, DAMPING=16384; indices 4-7=8000
    spring = '16448,16448,16384,32767,8000,8000,8000,8000'
}

# ── Maximum lfo_params per LFO type ──────────────────────────────────────────
# Selector params cannot be 32767 — they select an out-of-range option.
# Max for selector-4 params inferred as 15360 (4th option, from lfo.midi/element data).
# [inferred] = derived from selector-4 pattern; not yet hardware-verified.
$lfoMaxParams = @{
    # [oracle] element-max-0000.aif: SOURCE=7168, AMOUNT=32767, DESTINATION=7168, PARAMETER=15360
    # element selector-4 uses different raw values than midi (max=7168, not 15360)
    element  = '7168,32767,7168,15360,0,0,0,0'
    # PARAMETER[0-3]=selector(knob1-4) max=15360; DESTINATION[4-7]=selector(synth/env/fx/out) max=7168
    # 7168 inferred from lfo.element DESTINATION oracle (same selector type)
    midi     = '15360,15360,15360,15360,7168,7168,7168,7168'
    # DESTINATION[2]=selector max=7168; PARAMETER[4]=selector max=15360 (element oracle pattern)
    random   = '32767,32767,7168,32767,15360,0,0,0'
    # [oracle] lfo-max(1): SPEED[0]=tempo-dial max=32440; LFO SHAPE[7] max=32767
    tremolo  = '32440,32767,32767,32767,0,0,0,32767'
    # [oracle] lfo-max(2): SPEED[0]=16384; DESTINATION[2]=11264 (amp synth, 4-knob selector);
    # LFO SHAPE is at index 4 (not 7) for value; max=28086
    value    = '16384,32767,11264,15360,28086,0,0,0'
    # [oracle] lfo-max(3): AMP[0]=32767, VOLUME AMOUNT[1]=32767, DESTINATION[2]=7168, PARAMETER[3]=15360
    velocity = '32767,32767,7168,15360,0,0,0,0'
}

# ── Minimum fx_params per FX type ────────────────────────────────────────────
# Hardware-confirmed minimum fx_params values (all FX knobs at leftmost position).
# Only FX types whose hardware mins differ from all-zeros are listed here.
# Indices 4-7 are 8000 for some FX types (delay/cwo/nitro use 0 there).
# [oracle] = raw JSON extracted from fx0-fx5.aif hardware exports.
$fxParamsMin = @{
    # [oracle] fx0.aif: RANGE=1024, SPEED=3276 have non-zero floors
    delay  = '1024,3276,0,0,0,0,0,0'
    # [oracle] fx1.aif: X SIZE=1344, Y SIZE=1344; indices 4-7=8000
    grid   = '1344,1344,0,0,8000,8000,8000,8000'
    # [oracle] fx2.aif: FREQ LOWS=64, FILTER FOLLOW=-32768 (bipolar), FREQ HIGHS=64
    nitro  = '64,-32768,0,64,0,0,0,0'
    # [oracle] fx3.aif: TONE=204, GSM=3072, BAUD=1536; indices 4-7=8000
    phone  = '204,3072,1536,0,8000,8000,8000,8000'
    # [oracle] fx4.aif: FREQUENCY=1344, ROUNDS=1536; indices 4-7=8000
    punch  = '1344,0,1536,0,8000,8000,8000,8000'
    # [oracle] fx5.aif: TONE=1344, TURNS=7744; indices 4-7=8000
    spring = '1344,7744,0,0,8000,8000,8000,8000'
}

# ── Output directories ───────────────────────────────────────────────────────
# Structure: explore\aif\[mode]\[synth]\[fx]\*.aif
#            explore\json\[mode]\[synth]\[fx]\*.json
if (Test-Path "explore") { Remove-Item -Recurse -Force "explore" }

# ── Helpers ──────────────────────────────────────────────────────────────────
function Get-Slug([string]$s) {
    ($s -replace '[^a-zA-Z0-9]', '').PadRight(4, '_').Substring(0, 4).ToLower()
}

# Build a compact OP-1 patch JSON string.
# ADSR is fixed (neutral: instant attack, full sustain) regardless of mode.
# Keys are in strict alphabetical order — OP-1 Field firmware requires this.
function Build-Json {
    param(
        [string]$synth,
        [string]$fx,
        [string]$lfo,
        [string]$name,
        [int]   $ver,
        [string]$knobsArr8,
        [string]$fxArr8,
        [string]$lfoArr8
    )
    $adsr  = '576,4160,17408,15808,14336,7872,18432,3276'
    $mtime = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    return (
        '{"adsr":['        + $adsr      + '],' +
        '"fx_active":true,' +
        '"fx_params":['    + $fxArr8    + '],' +
        '"fx_type":"'      + $fx        + '",' +
        '"knobs":['        + $knobsArr8 + '],' +
        '"lfo_active":true,' +
        '"lfo_params":['   + $lfoArr8   + '],' +
        '"lfo_type":"'     + $lfo       + '",' +
        '"mtime":'         + $mtime     + '.0,' +
        '"name":"'         + $name      + '",' +
        '"octave":0,' +
        '"synth_version":' + $ver       + ',' +
        '"type":"'         + $synth     + '"}')
}

# ── Main loop ────────────────────────────────────────────────────────────────
$total = $synthTypes.Count * $fxTypes.Count * $lfoTypes.Count
Write-Host ""
Write-Host "Generating $total combinations × 2 (min + max) = $($total * 2) pairs ..."
Write-Host "Each pair = 1 JSON + 1 AIF  →  $($total * 4) files total"
Write-Host ""

$zeros8 = '0,0,0,0,0,0,0,0'
$max8   = '32767,32767,32767,32767,32767,32767,32767,32767'

$n = 0
foreach ($synth in $synthTypes) {
    $ver = $synthVersion[$synth]
    foreach ($lfo in $lfoTypes) {
        foreach ($mode in @('min', 'max')) {
            $aifDir  = "explore\aif\$mode\$synth\$lfo"
            $jsonDir = "explore\json\$mode\$synth\$lfo"
            $null = New-Item -ItemType Directory -Force $aifDir
            $null = New-Item -ItemType Directory -Force $jsonDir
            $absAifDir  = (Resolve-Path $aifDir).Path
            $absJsonDir = (Resolve-Path $jsonDir).Path

            foreach ($fx in $fxTypes) {
                $slug = "$(Get-Slug $synth)$(Get-Slug $fx)$(Get-Slug $lfo)"
                $name = $slug

                if ($mode -eq 'min') {
                    $knobsArr8 = if ($synthKnobsMin.ContainsKey($synth)) { $synthKnobsMin[$synth] } else { $zeros8 }
                    $fxArr8    = if ($fxParamsMin.ContainsKey($fx))     { $fxParamsMin[$fx] }     else { $zeros8 }
                    $lfoArr8   = $lfoMinParams[$lfo]
                } else {
                    $knobsArr8 = if ($synthKnobsMax.ContainsKey($synth)) { $synthKnobsMax[$synth] } else { $max8 }
                    $fxArr8    = if ($fxParamsMax.ContainsKey($fx))      { $fxParamsMax[$fx] }      else { $max8 }
                    $lfoArr8   = if ($lfoMaxParams.ContainsKey($lfo))    { $lfoMaxParams[$lfo] }    else { $max8 }
                }

                $jsonContent = Build-Json -synth $synth -fx $fx -lfo $lfo `
                                          -name $name -ver $ver `
                                          -knobsArr8 $knobsArr8 -fxArr8 $fxArr8 -lfoArr8 $lfoArr8

                $absJson = "$absJsonDir\${slug}.json"
                $absAif  = "$absAifDir\${slug}.aif"

                [System.IO.File]::WriteAllText($absJson, $jsonContent,
                    [System.Text.UTF8Encoding]::new($false))

                # json2aif.exe will error if the AIF already exists (overwrite protection)
                $out = & .\json2aif.exe $absJson $absAif 2>&1
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "json2aif failed for $slug ($mode): $out"
                }
            }
        }

        $n += $fxTypes.Count
        if ($n % ($fxTypes.Count * 6) -eq 0) {
            Write-Host "  $n / $total  (last synth: $synth)"
        }
    }
}

Write-Host ""
Write-Host "Done.  $total combinations processed."
Write-Host ""

# ── Summary ──────────────────────────────────────────────────────────────────
$minAif  = (Get-ChildItem "explore\aif\min"  -Recurse -Filter "*.aif" ).Count
$maxAif  = (Get-ChildItem "explore\aif\max"  -Recurse -Filter "*.aif" ).Count
$minJson = (Get-ChildItem "explore\json\min" -Recurse -Filter "*.json").Count
$maxJson = (Get-ChildItem "explore\json\max" -Recurse -Filter "*.json").Count

Write-Host "  explore\aif\min\[synth]\[lfo]\   $minAif AIF  (hardware minimum values)"
Write-Host "  explore\aif\max\[synth]\[lfo]\   $maxAif AIF  (all params = 32767)"
Write-Host "  explore\json\min\[synth]\[lfo]\  $minJson JSON"
Write-Host "  explore\json\max\[synth]\[lfo]\  $maxJson JSON"
Write-Host ""
