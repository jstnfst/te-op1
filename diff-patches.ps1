<#
.SYNOPSIS
    Diff two OP-1 Field patch JSON files and show what changed.

.PARAMETER FileA
    Path to the baseline patch (JSON or AIF)

.PARAMETER FileB
    Path to the changed patch (JSON or AIF)

.EXAMPLE
    .\diff-patches.ps1 sandbox\epiphany.json presets\epiphany0005.json
    .\diff-patches.ps1 sandbox\epiphany.aif  presets\epiphany0005.aif
#>

param(
    [Parameter(Mandatory=$true)] [string]$FileA,
    [Parameter(Mandatory=$true)] [string]$FileB
)

function Resolve-PatchJson([string]$path) {
    if ($path -like "*.aif") {
        $json = $path -replace '\.aif$', '.json'
        if (-not (Test-Path $json)) {
            Write-Error "No sidecar JSON for $path -- run op1dump.exe on it first"
            exit 1
        }
        return $json
    }
    return $path
}

$pathA  = Resolve-PatchJson $FileA
$pathB  = Resolve-PatchJson $FileB
$patchA = Get-Content $pathA -Raw | ConvertFrom-Json
$patchB = Get-Content $pathB -Raw | ConvertFrom-Json

Write-Host ""
Write-Host "A: $pathA"
Write-Host "B: $pathB"
Write-Host ""

$skip  = @('mtime', 'name', '_file')
$diffs = 0

foreach ($key in $patchA.PSObject.Properties.Name) {
    if ($skip -contains $key) { continue }

    $aStr = $patchA.$key | ConvertTo-Json -Compress
    $bStr = $patchB.$key | ConvertTo-Json -Compress

    if ($aStr -ne $bStr) {
        $diffs++
        Write-Host "FIELD: $key" -ForegroundColor Cyan
        Write-Host "  A : $aStr"
        Write-Host "  B : $bStr"

        $aArr = @($patchA.$key)
        $bArr = @($patchB.$key)
        if ($patchA.$key -is [System.Array] -and $patchB.$key -is [System.Array]) {
            for ($i = 0; $i -lt $aArr.Count; $i++) {
                if ($aArr[$i] -ne $bArr[$i]) {
                    $delta = [int]$bArr[$i] - [int]$aArr[$i]
                    $sign  = if ($delta -ge 0) { "+" } else { "" }
                    Write-Host ("  -> [{0}]: {1} -> {2}  ({3}{4})" -f $i, $aArr[$i], $bArr[$i], $sign, $delta) -ForegroundColor Green
                }
            }
        }
        Write-Host ""
    }
}

if ($diffs -eq 0) {
    Write-Host "No differences (excluding name/mtime)." -ForegroundColor Green
}
