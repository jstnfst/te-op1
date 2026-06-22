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
$synthVersion = @{
    amp       = 3
    cluster   = 3   # no oracle on disk; 3 matches README example
    digital   = 2
    dimension = 3
    dna       = 2
    drwave    = 2
    dsynth    = 2
    fm        = 2
    phase     = 2
    pulse     = 2
    sampler   = 3
    string    = 2
    vocoder   = 3
    voltage   = 2
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

# ── Output directories ───────────────────────────────────────────────────────
$minDir = "explore\min"
$maxDir = "explore\max"
if (Test-Path "explore") { Remove-Item -Recurse -Force "explore" }
$null = New-Item -ItemType Directory -Force $minDir
$null = New-Item -ItemType Directory -Force $maxDir

# ── Helpers ──────────────────────────────────────────────────────────────────
function Get-Slug([string]$s) {
    ($s -replace '[^a-zA-Z0-9]', '').PadRight(4, '_').Substring(0, 4).ToLower()
}

# Build a compact OP-1 patch JSON string.
# $lfoArr8: the 8-value comma-separated string for lfo_params
# $fillArr8: the 8-value comma-separated string for knobs and fx_params
# ADSR is fixed (neutral: instant attack, full sustain) regardless of mode.
# Keys are in strict alphabetical order — OP-1 Field firmware requires this.
function Build-Json {
    param(
        [string]$synth,
        [string]$fx,
        [string]$lfo,
        [string]$name,
        [int]   $ver,
        [string]$fillArr8,
        [string]$lfoArr8
    )
    $adsr  = '576,4160,17408,15808,14336,7872,18432,3276'
    $mtime = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    return (
        '{"adsr":['        + $adsr     + '],' +
        '"fx_active":true,' +
        '"fx_params":['   + $fillArr8 + '],' +
        '"fx_type":"'     + $fx       + '",' +
        '"knobs":['       + $fillArr8 + '],' +
        '"lfo_active":true,' +
        '"lfo_params":['  + $lfoArr8  + '],' +
        '"lfo_type":"'    + $lfo      + '",' +
        '"mtime":'        + $mtime    + '.0,' +
        '"name":"'        + $name     + '",' +
        '"octave":0,' +
        '"synth_version":' + $ver     + ',' +
        '"type":"'        + $synth    + '"}')
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
    foreach ($fx in $fxTypes) {
        foreach ($lfo in $lfoTypes) {
            $slug = "$(Get-Slug $synth)$(Get-Slug $fx)$(Get-Slug $lfo)"
            $name = $slug

            foreach ($mode in @('min', 'max')) {
                $dir = if ($mode -eq 'min') { $minDir } else { $maxDir }

                $fillArr8 = if ($mode -eq 'min') { $zeros8 } else { $max8 }
                $lfoArr8  = if ($mode -eq 'min') { $lfoMinParams[$lfo] } else { $max8 }

                $jsonContent = Build-Json -synth $synth -fx $fx -lfo $lfo `
                                          -name $name -ver $ver `
                                          -fillArr8 $fillArr8 -lfoArr8 $lfoArr8

                $absJson = (Resolve-Path $dir).Path + "\${slug}.json"
                $absAif  = (Resolve-Path $dir).Path + "\${slug}.aif"

                [System.IO.File]::WriteAllText($absJson, $jsonContent,
                    [System.Text.UTF8Encoding]::new($false))

                # json2aif.exe will error if the AIF already exists (overwrite protection)
                $out = & .\json2aif.exe $absJson $absAif 2>&1
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "json2aif failed for $slug ($mode): $out"
                }
            }

            $n++
            if ($n % 50 -eq 0) {
                Write-Host "  $n / $total  (last: $slug)"
            }
        }
    }
}

Write-Host ""
Write-Host "Done.  $total combinations processed."
Write-Host ""

# ── Summary ──────────────────────────────────────────────────────────────────
$minJson = (Get-ChildItem "$minDir\*.json").Count
$minAif  = (Get-ChildItem "$minDir\*.aif" ).Count
$maxJson = (Get-ChildItem "$maxDir\*.json" ).Count
$maxAif  = (Get-ChildItem "$maxDir\*.aif"  ).Count

Write-Host "  explore\min\   $minJson JSON + $minAif AIF  (hardware minimum values)"
Write-Host "  explore\max\   $maxJson JSON + $maxAif AIF  (all params = 32767)"
Write-Host ""
