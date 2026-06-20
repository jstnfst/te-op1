<#
.SYNOPSIS
    Generates zero and max boundary patches for every unique preset combination.

.DESCRIPTION
    For each unique (synth, fx, lfo) combination found in presets\*.json, produces:
      explore\zero\[ssssffffllll].aif   — knobs / fx_params / lfo_params all 0
      explore\max\[ssssffffllll].aif    — knobs / fx_params / lfo_params all 32767

    The 12-char slug is built from the first 4 chars of each engine name,
    underscore-padded when the name is shorter.  Duplicate combinations are
    generated once from the first preset that provides them and skipped thereafter.

    Requires: json2aif.exe in the current directory.
    Run from the te-op1 root, not from inside presets\.
#>

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'

# ── output directories ──────────────────────────────────────────────────────
$zeroDir = "explore\zero"
$maxDir  = "explore\max"
$null = New-Item -ItemType Directory -Force $zeroDir
$null = New-Item -ItemType Directory -Force $maxDir

# ── slug helper: first 4 alphanumeric chars of a name, underscore-padded ───
function Get-Slug([string]$s) {
    ($s -replace '[^a-zA-Z0-9]', '').PadRight(4, '_').Substring(0, 4).ToLower()
}

# ── process presets ─────────────────────────────────────────────────────────
$seen  = @{}   # key = "synth+fx+lfo", used for dedup
$gen   = 0     # unique combos written
$dup   = 0     # duplicates skipped

Write-Host ""
Write-Host "Scanning presets\*.json ..."
Write-Host ""

Get-ChildItem "presets\*.json" |
    Where-Object { $_.Name -notmatch '_(zero|max)\.' } |
    Sort-Object Name |
    ForEach-Object {
        $file = $_
        $json = Get-Content $file.FullName -Raw | ConvertFrom-Json

        $synth = $json.type
        $fx    = $json.fx_type
        $lfo   = $json.lfo_type

        if (-not $synth -or -not $fx -or -not $lfo) {
            Write-Warning "Skipping $($file.Name): missing type / fx_type / lfo_type"
            return
        }

        $key  = "$synth+$fx+$lfo"
        $slug = "[$(Get-Slug $synth)$(Get-Slug $fx)$(Get-Slug $lfo)]"

        if ($seen.ContainsKey($key)) {
            Write-Host "  skip  $($file.Name.PadRight(50)) (dup of $slug)"
            $dup++
            return
        }
        $seen[$key] = $true

        $zeroOut = "$zeroDir\${slug}.aif"
        $maxOut  = "$maxDir\${slug}.aif"

        Write-Host "  gen   $($file.Name.PadRight(50)) → $slug"
        Write-Host "          synth=$synth  fx=$fx  lfo=$lfo"

        $z = & .\json2aif.exe zero $file.FullName $zeroOut 2>&1
        $m = & .\json2aif.exe max  $file.FullName $maxOut  2>&1

        if ($LASTEXITCODE -ne 0) {
            Write-Warning "  ERROR generating max for $slug"
            Write-Host $m
        }

        $gen++
    }

Write-Host ""
Write-Host "Done.  $gen unique combinations generated, $dup duplicates skipped."
Write-Host ""
Write-Host "  explore\zero\   all knobs / fx_params / lfo_params = 0"
Write-Host "  explore\max\    all knobs / fx_params / lfo_params = 32767"
Write-Host ""
