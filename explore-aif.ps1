<#
.SYNOPSIS
    OP-1 Field AIF file explorer

.PARAMETER File
    Path to the .aif file

.PARAMETER ReadBytes
    Show raw first N bytes as hex + ASCII

.PARAMETER ParseChunks
    Parse AIFF IFF chunk structure

.PARAMETER DumpChunk
    Dump the raw bytes of a specific chunk (by 4-char ID)

.PARAMETER ShowJson
    Find and print any JSON-like content in the file

.PARAMETER DecodeFver
    Decode the FVER chunk version number

.PARAMETER DecodeComm
    Fully decode the COMM chunk (sample rate 80-bit float, compression type/name)

.PARAMETER AnalyzeSsnd
    Analyze SSND audio: offset/block header, min/max sample values, silence ratio

.PARAMETER ByteCount
    Number of bytes to display with -ReadBytes (default 128)

.EXAMPLE
    .\explore-aif.ps1 -File epiphany.aif -ReadBytes
    .\explore-aif.ps1 -File epiphany.aif -ParseChunks
    .\explore-aif.ps1 -File epiphany.aif -DumpChunk APPL
    .\explore-aif.ps1 -File epiphany.aif -ShowJson
    .\explore-aif.ps1 -File epiphany.aif -DecodeFver
    .\explore-aif.ps1 -File epiphany.aif -DecodeComm
    .\explore-aif.ps1 -File epiphany.aif -AnalyzeSsnd
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$File,

    [switch]$ReadBytes,
    [switch]$ParseChunks,
    [string]$DumpChunk,
    [switch]$ShowJson,
    [switch]$DecodeFver,
    [switch]$DecodeComm,
    [switch]$AnalyzeSsnd,
    [int]$ByteCount = 128
)

# ---- helpers ----------------------------------------------------------------

function Read-BigEndianInt32 {
    param([byte[]]$buf, [int]$offset)
    return ([int]$buf[$offset] -shl 24) -bor ([int]$buf[$offset+1] -shl 16) -bor ([int]$buf[$offset+2] -shl 8) -bor [int]$buf[$offset+3]
}

function Read-BigEndianUInt32 {
    param([byte[]]$buf, [int]$offset)
    return ([uint32]$buf[$offset] -shl 24) -bor ([uint32]$buf[$offset+1] -shl 16) -bor ([uint32]$buf[$offset+2] -shl 8) -bor [uint32]$buf[$offset+3]
}

function Read-FourCC {
    param([byte[]]$buf, [int]$offset)
    return [System.Text.Encoding]::ASCII.GetString($buf[$offset..($offset+3)])
}

function Format-HexDump {
    param([byte[]]$data, [int]$baseOffset = 0)
    $sb = [System.Text.StringBuilder]::new()
    for ($i = 0; $i -lt $data.Length; $i += 16) {
        $addr = "{0:X6}" -f ($baseOffset + $i)
        $hexPart  = ""
        $asciiPart = ""
        for ($j = 0; $j -lt 16; $j++) {
            if ($i + $j -lt $data.Length) {
                $b = $data[$i + $j]
                $hexPart  += "{0:X2} " -f $b
                $asciiPart += if ($b -ge 32 -and $b -lt 127) { [char]$b } else { '.' }
            } else {
                $hexPart  += "   "
            }
        }
        $null = $sb.AppendLine("$addr  $($hexPart.PadRight(48))  $asciiPart")
    }
    return $sb.ToString()
}

# ---- resolve file path ------------------------------------------------------

$resolvedPath = Resolve-Path $File -ErrorAction SilentlyContinue
if (-not $resolvedPath) {
    Write-Error "File not found: $File"
    exit 1
}
$bytes = [System.IO.File]::ReadAllBytes($resolvedPath.Path)
Write-Host "File: $($resolvedPath.Path)  ($($bytes.Length) bytes)" -ForegroundColor Cyan

# ---- -ReadBytes -------------------------------------------------------------

if ($ReadBytes) {
    $count = [Math]::Min($ByteCount, $bytes.Length)
    Write-Host "`n=== First $count bytes ===" -ForegroundColor Yellow
    Write-Host (Format-HexDump $bytes[0..($count-1)] 0)
}

# ---- -ParseChunks -----------------------------------------------------------

if ($ParseChunks) {
    Write-Host "`n=== AIFF Chunk Structure ===" -ForegroundColor Yellow

    # AIFF begins: FORM (4) + size (4) + AIFF/AIFC (4)
    $formID   = Read-FourCC $bytes 0
    $formSize = Read-BigEndianUInt32 $bytes 4
    $formType = Read-FourCC $bytes 8

    Write-Host "FORM ID   : $formID"
    Write-Host "FORM size : $formSize"
    Write-Host "Form type : $formType"
    Write-Host ""

    if ($formID -ne "FORM") {
        Write-Warning "Not a valid IFF/AIFF file (expected FORM, got $formID)"
    }

    # Walk sub-chunks starting at offset 12
    $pos = 12
    while ($pos + 8 -le $bytes.Length) {
        $chunkID   = Read-FourCC $bytes $pos
        $chunkSize = Read-BigEndianUInt32 $bytes ($pos + 4)

        Write-Host ("  [{0:X6}] '{1}'  size={2}" -f $pos, $chunkID, $chunkSize) -ForegroundColor Green

        # Peek at chunk content for known types
        $dataStart = $pos + 8
        switch ($chunkID.Trim()) {
            "COMM" {
                if ($chunkSize -ge 18) {
                    $numChan   = ([int]$bytes[$dataStart] -shl 8) -bor $bytes[$dataStart+1]
                    $numFrames = Read-BigEndianUInt32 $bytes ($dataStart+2)
                    $bitDepth  = ([int]$bytes[$dataStart+6] -shl 8) -bor $bytes[$dataStart+7]
                    Write-Host ("           Channels={0}  Frames={1}  BitDepth={2}" -f $numChan, $numFrames, $bitDepth)
                }
            }
            "APPL" {
                # First 4 bytes are application signature
                if ($chunkSize -ge 4) {
                    $appSig = Read-FourCC $bytes $dataStart
                    Write-Host "           App signature: '$appSig'"
                }
            }
        }

        # Chunks are padded to even size
        $advance = $chunkSize
        if ($advance % 2 -ne 0) { $advance++ }
        $pos = $dataStart + $advance
    }
}

# ---- -DumpChunk <ID> --------------------------------------------------------

if ($DumpChunk) {
    Write-Host "`n=== Chunk dump: '$DumpChunk' ===" -ForegroundColor Yellow
    $pos = 12
    $found = $false
    while ($pos + 8 -le $bytes.Length) {
        $chunkID   = Read-FourCC $bytes $pos
        $chunkSize = Read-BigEndianUInt32 $bytes ($pos + 4)
        $dataStart = $pos + 8

        if ($chunkID -eq $DumpChunk) {
            $found = $true
            Write-Host "Found '$DumpChunk' at offset 0x{0:X6}, size=$chunkSize" -f $pos
            $chunkData = $bytes[$dataStart..($dataStart + $chunkSize - 1)]
            Write-Host (Format-HexDump $chunkData $dataStart)

            # Also try to print as UTF-8 string
            $asString = [System.Text.Encoding]::UTF8.GetString($chunkData)
            $printable = $asString -replace '[^\x20-\x7E\r\n\t]', '.'
            Write-Host "--- as text ---"
            Write-Host $printable
        }

        $advance = $chunkSize
        if ($advance % 2 -ne 0) { $advance++ }
        $pos = $dataStart + $advance
    }
    if (-not $found) {
        Write-Warning "Chunk '$DumpChunk' not found in file"
    }
}

# ---- -ShowJson --------------------------------------------------------------

if ($ShowJson) {
    Write-Host "`n=== JSON-like content scan ===" -ForegroundColor Yellow
    $text = [System.Text.Encoding]::ASCII.GetString($bytes)

    # Find all { ... } blocks
    $depth = 0
    $start = -1
    $results = @()
    for ($i = 0; $i -lt $text.Length; $i++) {
        $c = $text[$i]
        if ($c -eq '{') {
            if ($depth -eq 0) { $start = $i }
            $depth++
        } elseif ($c -eq '}') {
            $depth--
            if ($depth -eq 0 -and $start -ge 0) {
                $results += [PSCustomObject]@{ Offset = $start; Text = $text.Substring($start, $i - $start + 1) }
                $start = -1
            }
        }
    }

    if ($results.Count -eq 0) {
        Write-Warning "No JSON-like blocks found"
    }
    foreach ($r in $results) {
        Write-Host ("--- JSON block at offset 0x{0:X6} ---" -f $r.Offset) -ForegroundColor Cyan
        # Try to pretty-print
        try {
            $parsed = $r.Text | ConvertFrom-Json
            $parsed | ConvertTo-Json -Depth 10
        } catch {
            Write-Host $r.Text
        }
    }
}

# ---- -DecodeFver ------------------------------------------------------------

if ($DecodeFver) {
    Write-Host "`n=== FVER Chunk ===" -ForegroundColor Yellow
    $pos = 12
    $found = $false
    while ($pos + 8 -le $bytes.Length) {
        $chunkID   = Read-FourCC $bytes $pos
        $chunkSize = Read-BigEndianUInt32 $bytes ($pos + 4)
        $dataStart = $pos + 8
        if ($chunkID -eq "FVER" -and $chunkSize -ge 4) {
            $found = $true
            $ver = Read-BigEndianUInt32 $bytes $dataStart
            Write-Host ("  Raw value : 0x{0:X8}" -f $ver)
            # The only defined AIFC version is 0xA2805140
            if ($ver -eq 2726318400) {  # 0xA2805140 as decimal (avoids PS5 Int32 overflow)
                Write-Host "  Meaning   : AIFC format version 1 (standard, value 0xA2805140)"
            } else {
                Write-Host "  Meaning   : Unknown version"
            }
        }
        $advance = $chunkSize + ($chunkSize % 2)
        $pos = $dataStart + $advance
    }
    if (-not $found) { Write-Warning "FVER chunk not found" }
}

# ---- -DecodeComm ------------------------------------------------------------

if ($DecodeComm) {
    Write-Host "`n=== COMM Chunk (full decode) ===" -ForegroundColor Yellow
    $pos = 12
    $found = $false
    while ($pos + 8 -le $bytes.Length) {
        $chunkID   = Read-FourCC $bytes $pos
        $chunkSize = Read-BigEndianUInt32 $bytes ($pos + 4)
        $dataStart = $pos + 8
        if ($chunkID -eq "COMM" -and $chunkSize -ge 18) {
            $found = $true
            $numChannels  = ([int]$bytes[$dataStart]   -shl 8) -bor $bytes[$dataStart+1]
            $numFrames    = Read-BigEndianUInt32 $bytes ($dataStart+2)
            $sampleSize   = ([int]$bytes[$dataStart+6] -shl 8) -bor $bytes[$dataStart+7]

            # 80-bit IEEE 754 extended at offset +8 (10 bytes)
            # Exponent is biased by 16383; mantissa is explicit (bit 63 = integer part)
            $extOff = $dataStart + 8
            $sign     = ($bytes[$extOff] -band 0x80) -ne 0
            $exponent = (([int]($bytes[$extOff] -band 0x7F) -shl 8) -bor $bytes[$extOff+1])
            $mantHi   = Read-BigEndianUInt32 $bytes ($extOff+2)
            $mantLo   = Read-BigEndianUInt32 $bytes ($extOff+6)
            $mantissa = [double]$mantHi + [double]$mantLo / [Math]::Pow(2, 32)
            $sampleRate = $mantissa * [Math]::Pow(2, $exponent - 16383 - 31)

            Write-Host ("  numChannels  : {0}" -f $numChannels)
            Write-Host ("  numFrames    : {0}" -f $numFrames)
            Write-Host ("  sampleSize   : {0}-bit" -f $sampleSize)
            Write-Host ("  sampleRate   : {0:F2} Hz  (from 80-bit extended: exp={1} mantHi=0x{2:X8})" -f $sampleRate, $exponent, $mantHi)
            Write-Host ("  Duration     : {0:F4} seconds" -f ($numFrames / $sampleRate))

            # AIFC-only: compression type (4 bytes) + Pascal string
            if ($chunkSize -ge 24) {
                $compType = Read-FourCC $bytes ($dataStart+18)
                $pascalLen = [int]$bytes[$dataStart+22]
                $compName = [System.Text.Encoding]::ASCII.GetString($bytes[($dataStart+23)..($dataStart+22+$pascalLen)])
                Write-Host ("  comprType    : '{0}'" -f $compType)
                Write-Host ("  comprName    : '{0}'" -f $compName)

                switch ($compType.Trim()) {
                    "NONE" { Write-Host "  Meaning      : Uncompressed big-endian PCM" }
                    "sowt" { Write-Host "  Meaning      : Uncompressed little-endian signed PCM (standard on macOS/OP-1)" }
                    "fl32" { Write-Host "  Meaning      : 32-bit float PCM" }
                    "alaw" { Write-Host "  Meaning      : A-law compressed" }
                    "ulaw" { Write-Host "  Meaning      : mu-law compressed" }
                    default { Write-Host ("  Meaning      : Unknown compression type") }
                }
            }

            Write-Host ""
            Write-Host "  Raw hex of COMM data:"
            $chunkData = $bytes[$dataStart..($dataStart + $chunkSize - 1)]
            Write-Host (Format-HexDump $chunkData $dataStart)
        }
        $advance = $chunkSize + ($chunkSize % 2)
        $pos = $dataStart + $advance
    }
    if (-not $found) { Write-Warning "COMM chunk not found" }
}

# ---- -AnalyzeSsnd -----------------------------------------------------------

if ($AnalyzeSsnd) {
    Write-Host "`n=== SSND Chunk Analysis ===" -ForegroundColor Yellow
    $pos = 12
    $found = $false
    while ($pos + 8 -le $bytes.Length) {
        $chunkID   = Read-FourCC $bytes $pos
        $chunkSize = Read-BigEndianUInt32 $bytes ($pos + 4)
        $dataStart = $pos + 8
        if ($chunkID -eq "SSND" -and $chunkSize -ge 8) {
            $found = $true

            # SSND header: 4-byte offset + 4-byte blockSize
            $ssndOffset    = Read-BigEndianUInt32 $bytes $dataStart
            $ssndBlockSize = Read-BigEndianUInt32 $bytes ($dataStart+4)
            $audioStart    = $dataStart + 8 + $ssndOffset
            $audioBytes    = $chunkSize - 8 - $ssndOffset

            Write-Host ("  Chunk size   : {0} bytes" -f $chunkSize)
            Write-Host ("  SSND offset  : {0}  (bytes before audio data)" -f $ssndOffset)
            Write-Host ("  SSND blkSize : {0}  (0 = not block-aligned)" -f $ssndBlockSize)
            Write-Host ("  Audio start  : 0x{0:X6}" -f $audioStart)
            Write-Host ("  Audio bytes  : {0}" -f $audioBytes)

            # Analyze 16-bit little-endian PCM samples (sowt)
            # 'sowt' stores samples as little-endian 16-bit signed integers
            $numSamples = [int]($audioBytes / 2)
            Write-Host ("  Num samples  : {0}" -f $numSamples)

            $minVal  =  32767
            $maxVal  = -32768
            $zeroCount = 0
            for ($i = 0; $i -lt $numSamples; $i++) {
                $lo = [int]$bytes[$audioStart + $i*2]
                $hi = [int]$bytes[$audioStart + $i*2 + 1]
                # little-endian signed 16-bit
                $sample = [int](($hi -shl 8) -bor $lo)
                if ($sample -gt 32767) { $sample -= 65536 }
                if ($sample -lt $minVal) { $minVal = $sample }
                if ($sample -gt $maxVal) { $maxVal = $sample }
                if ($sample -eq 0) { $zeroCount++ }
            }
            $silenceRatio = if ($numSamples -gt 0) { [double]$zeroCount / $numSamples * 100 } else { 0 }

            Write-Host ("  Min sample   : {0}  ({1:F4} normalized)" -f $minVal, ($minVal / 32768.0))
            Write-Host ("  Max sample   : {0}  ({1:F4} normalized)" -f $maxVal, ($maxVal / 32767.0))
            Write-Host ("  Zero samples : {0} / {1}  ({2:F1}% silence)" -f $zeroCount, $numSamples, $silenceRatio)
            Write-Host ("  Peak level   : {0:F2} dBFS" -f (20 * [Math]::Log10([Math]::Max([Math]::Abs($minVal), [Math]::Abs($maxVal)) / 32767.0 + 1e-10)))

            # Show first and last 16 bytes of audio
            Write-Host "`n  First 32 bytes of audio data:"
            $preview = $bytes[$audioStart..([Math]::Min($audioStart+31, $bytes.Length-1))]
            Write-Host (Format-HexDump $preview $audioStart)

            Write-Host "  Last 32 bytes of audio data:"
            $tailStart = [Math]::Max($audioStart, $audioStart + $audioBytes - 32)
            $preview2  = $bytes[$tailStart..($audioStart + $audioBytes - 1)]
            Write-Host (Format-HexDump $preview2 $tailStart)
        }
        $advance = $chunkSize + ($chunkSize % 2)
        $pos = $dataStart + $advance
    }
    if (-not $found) { Write-Warning "SSND chunk not found" }
}
