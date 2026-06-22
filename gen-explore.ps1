<#
.SYNOPSIS
    Generates zero and max boundary patches for every synth × fx × lfo combination.

.DESCRIPTION
    Produces 14 synths × 9 FX × 6 LFOs = 756 unique combinations.
    For each combination two files are written to explore\zero\ and explore\max\:
      [ssssffffllll].json   — compact patch JSON (source of truth)
      [ssssffffllll].aif    — AIFF-C ready to load on the OP-1 Field

    The 12-char slug is the first 4 alphanumeric chars of each engine name,
    underscore-padded when the name is shorter (e.g. fm → fm__, dna → dna_).

    ADSR is fixed to instant-attack / full-sustain so every combination
    produces audible output when a key is held, regardless of synth type.

    Run from the te-op1 root.  Output goes to explore\ which is gitignored.
    Requires: json2aif.exe in the current directory.
#>

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'

# ── Engine lists ────────────────────────────────────────────────────────────
$synthTypes = @('amp','cluster','digital','dimension','dna','drwave',
                'dsynth','fm','phase','pulse','sampler','string','vocoder','voltage')
$fxTypes    = @('cwo','delay','grid','mother','nitro','phone','punch','spring','terminal')
$lfoTypes   = @('element','midi','random','tremolo','value','velocity')

# synth_version per engine type (read from existing presets; cluster defaulted to 3)
$synthVersion = @{
    amp       = 3
    cluster   = 3   # no preset on disk; 3 matches the README example
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

# ── Output directories ───────────────────────────────────────────────────────
$zeroDir = "explore\zero"
$maxDir  = "explore\max"
$null = New-Item -ItemType Directory -Force $zeroDir
$null = New-Item -ItemType Directory -Force $maxDir

# ── Helpers ──────────────────────────────────────────────────────────────────
function Get-Slug([string]$s) {
    ($s -replace '[^a-zA-Z0-9]', '').PadRight(4, '_').Substring(0, 4).ToLower()
}

# Build a compact OP-1 patch JSON string.
# fill = 0 (zero mode) or 32767 (max mode)
# ADSR is fixed to instant-attack / full-sustain regardless of fill so the
# patch is always audible when a key is held.
function Build-Json {
    param(
        [string]$synth,
        [string]$fx,
        [string]$lfo,
        [string]$name,
        [int]   $ver,
        [int]   $fill
    )
    $arr8 = ($fill, $fill, $fill, $fill, $fill, $fill, $fill, $fill) -join ','
    $adsr = '0,0,32767,8192,0,0,32767,8192'
    # Keys must be in strict alphabetical order — the OP-1 Field firmware
    # uses a streaming parser that expects the same order its serializer writes.
    return (
        '{"adsr":['        + $adsr + '],' +
        '"fx_active":true,' +
        '"fx_params":['   + $arr8 + '],' +
        '"fx_type":"'     + $fx   + '",' +
        '"knobs":['       + $arr8 + '],' +
        '"lfo_active":true,' +
        '"lfo_params":['  + $arr8 + '],' +
        '"lfo_type":"'    + $lfo  + '",' +
        '"name":"'        + $name + '",' +
        '"octave":0,' +
        '"synth_version":' + $ver + ',' +
        '"type":"'        + $synth + '"}')
}

# ── Main loop ────────────────────────────────────────────────────────────────
$total = $synthTypes.Count * $fxTypes.Count * $lfoTypes.Count
Write-Host ""
Write-Host "Generating $total combinations × 2 (zero + max) = $($total * 2) pairs ..."
Write-Host "Each pair = 1 JSON + 1 AIF  →  $($total * 4) files total"
Write-Host ""

$n = 0
foreach ($synth in $synthTypes) {
    $ver = $synthVersion[$synth]
    foreach ($fx in $fxTypes) {
        foreach ($lfo in $lfoTypes) {
            $slug = "[$(Get-Slug $synth)$(Get-Slug $fx)$(Get-Slug $lfo)]"
            $name = ($slug -replace '[\[\]]', '')   # strip brackets for the JSON name field

            foreach ($mode in @('zero', 'max')) {
                $fill    = if ($mode -eq 'zero') { 0 } else { 32767 }
                $dir     = if ($mode -eq 'zero') { $zeroDir } else { $maxDir }
                $jsonOut = "$dir\${slug}.json"
                $aifOut  = "$dir\${slug}.aif"

                $jsonContent = Build-Json -synth $synth -fx $fx -lfo $lfo `
                                          -name $name -ver $ver -fill $fill

                [System.IO.File]::WriteAllText(
                    (Resolve-Path $dir).Path + "\${slug}.json",
                    $jsonContent,
                    [System.Text.Encoding]::UTF8
                )

                $null = & .\json2aif.exe $jsonOut $aifOut 2>&1
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "json2aif failed for $slug ($mode)"
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
$zeroJson = (Get-ChildItem "$zeroDir\*.json").Count
$zeroAif  = (Get-ChildItem "$zeroDir\*.aif" ).Count
$maxJson  = (Get-ChildItem "$maxDir\*.json" ).Count
$maxAif   = (Get-ChildItem "$maxDir\*.aif"  ).Count

Write-Host "  explore\zero\   $zeroJson JSON + $zeroAif AIF  (all params = 0)"
Write-Host "  explore\max\    $maxJson JSON + $maxAif AIF  (all params = 32767)"
Write-Host ""
