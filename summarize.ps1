<#
.SYNOPSIS
    Summarize all parsed OP-1 Field presets in presets\*.json.
    Groups by synth/fx/lfo type, shows value ranges, and surfaces
    anything that still needs to be named in op1-params.json.

.EXAMPLE
    .\summarize.ps1
#>

$presetsDir = "presets"
$paramsFile = "op1-params.json"
$okFile     = "op1-params-ok.json"
$jsonFiles  = Get-ChildItem "$presetsDir\*.json" -ErrorAction SilentlyContinue

if ($jsonFiles.Count -eq 0) {
    Write-Host "No JSON files found in $presetsDir\ -- run dump-all.bat first." -ForegroundColor Yellow
    exit
}

# ---- load op1-params.json ---------------------------------------------------

$params = $null
if (Test-Path $paramsFile) {
    $params = Get-Content $paramsFile -Raw | ConvertFrom-Json
}

# ---- load op1-params-ok.json ------------------------------------------------

$ok = $null
if (Test-Path $okFile) {
    $ok = Get-Content $okFile -Raw | ConvertFrom-Json
}

# Returns @{ InFile = bool; Labels = string[] }
# Hashtable avoids PS5 empty-array-unrolling-to-null.
function Get-LabelInfo([string]$group, [string]$type) {
    $none = @{ InFile = $false; Labels = @() }
    if (-not $params) { return $none }
    $key  = "$group.$type"
    $prop = $params.PSObject.Properties[$key]
    if ($null -eq $prop) { return $none }
    $vals = if ($null -eq $prop.Value) { @() } else { @($prop.Value) }
    return @{ InFile = $true; Labels = $vals }
}

# Returns int[] of verified indices for a given "group.type" key, or @()
function Get-VerifiedIndices([string]$group, [string]$type) {
    if (-not $ok) { return @() }
    $key  = "$group.$type"
    $prop = $ok.PSObject.Properties[$key]
    if ($null -eq $prop -or $null -eq $prop.Value) { return @() }
    return @($prop.Value | ForEach-Object { [int]$_ })
}

# ---- load all patch JSONs ---------------------------------------------------

$patches = [System.Collections.ArrayList]@()
foreach ($f in $jsonFiles) {
    try {
        $j = Get-Content $f.FullName -Raw | ConvertFrom-Json
        $j | Add-Member -NotePropertyName _file -NotePropertyValue $f.Name -Force
        [void]$patches.Add($j)
    } catch {
        Write-Warning "Could not parse $($f.Name): $_"
    }
}

Write-Host ""
Write-Host "Loaded $($patches.Count) patch(es) from $presetsDir\" -ForegroundColor Cyan
Write-Host ""

# ---- helper: print one type block -------------------------------------------

function Show-TypeBlock([string]$header, [string]$type, [string]$group,
                        [string]$field, [object[]]$patchSet) {

    $info      = Get-LabelInfo $group $type
    $inFile    = $info.InFile
    $labels    = $info.Labels
    $hasNames  = ($inFile -and ($labels | Where-Object { $_ -ne $null -and $_ -ne '' }).Count -gt 0)
    $verified  = Get-VerifiedIndices $group $type
    $nVerified = $verified.Count

    # count named (non-null, non-empty) labels to know total expected
    $nNamed = ($labels | Where-Object { $_ -ne $null -and $_ -ne '' }).Count

    if (-not $inFile) {
        $tag   = "  [add to op1-params.json]"
        $color = "Red"
    } elseif (-not $hasNames) {
        $tag   = "  [names TBD]"
        $color = "Yellow"
    } elseif ($nVerified -ge $nNamed -and $nNamed -gt 0) {
        $tag   = "  [verified $nVerified/$nNamed]"
        $color = "Green"
    } elseif ($nVerified -gt 0) {
        $tag   = "  [$nVerified/$nNamed verified]"
        $color = "Yellow"
    } else {
        $tag   = "  [unverified]"
        $color = "Yellow"
    }

    Write-Host ("  {0} ({1}){2}" -f $header, $type, $tag) -ForegroundColor $color

    # per-index stats across all patches of this type
    $stats = @{}
    foreach ($p in $patchSet) {
        $arr = $p.$field
        if (-not $arr) { continue }
        for ($i = 0; $i -lt $arr.Count; $i++) {
            $v = [int]($arr[$i])
            if (-not $stats.ContainsKey($i)) {
                $stats[$i] = @{ Min = $v; Max = $v; NonZero = 0 }
            }
            if ($v -lt $stats[$i].Min) { $stats[$i].Min = $v }
            if ($v -gt $stats[$i].Max) { $stats[$i].Max = $v }
            if ($v -ne 0) { $stats[$i].NonZero++ }
        }
    }

    $total = $patchSet.Count
    foreach ($i in ($stats.Keys | Sort-Object)) {
        $s = $stats[$i]
        if ($s.NonZero -eq 0) { continue }   # skip always-zero slots

        $norm_min = "{0:F3}" -f ($s.Min / 32767.0)
        $norm_max = "{0:F3}" -f ($s.Max / 32767.0)

        if ($i -lt $labels.Count -and $labels[$i] -ne $null -and $labels[$i] -ne '') {
            $label = $labels[$i]
        } else {
            $label = "knob $i  [unknown]"
        }

        $okMark = if ($verified -contains $i) { " ok" } else { "   " }

        Write-Host ("   {0}{1,-22} {2,6} - {3,6}  ({4} - {5})  {6}/{7} patches" -f `
            $okMark, $label, $s.Min, $s.Max, $norm_min, $norm_max, $s.NonZero, $total)
    }
}

# ---- group and report -------------------------------------------------------

$synthGroups = @($patches | Group-Object -Property type     | Sort-Object Name)
$fxGroups    = @($patches | Group-Object -Property fx_type  | Sort-Object Name)
$lfoGroups   = @($patches | Group-Object -Property lfo_type | Sort-Object Name)

Write-Host "=== Synth Engines ===" -ForegroundColor Cyan
foreach ($g in $synthGroups) {
    Show-TypeBlock "Synth" $g.Name "synth" "knobs" @($g.Group)
    Write-Host ""
}

Write-Host "=== FX ===" -ForegroundColor Cyan
foreach ($g in $fxGroups) {
    $active = @($g.Group | Where-Object { $_.fx_active -eq $true }).Count
    Show-TypeBlock "FX" $g.Name "fx" "fx_params" @($g.Group)
    Write-Host "    (active in $active / $($g.Group.Count) patches)"
    Write-Host ""
}

Write-Host "=== LFO ===" -ForegroundColor Cyan
foreach ($g in $lfoGroups) {
    $active = @($g.Group | Where-Object { $_.lfo_active -eq $true }).Count
    Show-TypeBlock "LFO" $g.Name "lfo" "lfo_params" @($g.Group)
    Write-Host "    (active in $active / $($g.Group.Count) patches)"
    Write-Host ""
}

# ---- unmapped types ---------------------------------------------------------

$unmapped = [System.Collections.ArrayList]@()
foreach ($g in $synthGroups) {
    if (-not (Get-LabelInfo "synth" $g.Name).InFile) { [void]$unmapped.Add("`"synth.$($g.Name)`": []") }
}
foreach ($g in $fxGroups) {
    if (-not (Get-LabelInfo "fx" $g.Name).InFile) { [void]$unmapped.Add("`"fx.$($g.Name)`": []") }
}
foreach ($g in $lfoGroups) {
    if (-not (Get-LabelInfo "lfo" $g.Name).InFile) { [void]$unmapped.Add("`"lfo.$($g.Name)`": []") }
}

if ($unmapped.Count -gt 0) {
    Write-Host "=== Missing from op1-params.json -- add these ===" -ForegroundColor Red
    foreach ($u in $unmapped) { Write-Host "  $u" -ForegroundColor Red }
    Write-Host ""
}

Write-Host "$($patches.Count) patches  /  $($synthGroups.Count) synth type(s)  /  $($fxGroups.Count) fx type(s)  /  $($lfoGroups.Count) lfo type(s)"
