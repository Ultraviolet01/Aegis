# Installs Foundry (forge/cast/anvil) prebuilt Windows binaries into %USERPROFILE%\.foundry\bin
# Deliberately does NOT modify the system PATH — callers use the full path to forge.exe.
$ErrorActionPreference = "Stop"

$dest = Join-Path $env:USERPROFILE ".foundry\bin"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$zip = Join-Path $env:TEMP "foundry.zip"
$urls = @(
    "https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_win32_amd64.zip",
    "https://github.com/foundry-rs/foundry/releases/download/nightly/foundry_nightly_win32_amd64.zip"
)

$ok = $false
foreach ($u in $urls) {
    try {
        Write-Output "Trying: $u"
        Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing
        Write-Output "Downloaded OK: $u"
        $ok = $true
        break
    } catch {
        Write-Output "Failed: $u -- $($_.Exception.Message)"
    }
}

if (-not $ok) { throw "Could not download Foundry from any known release URL." }

Expand-Archive -Path $zip -DestinationPath $dest -Force
Remove-Item $zip -Force -ErrorAction SilentlyContinue

Write-Output "--- Installed to $dest ---"
Get-ChildItem $dest | Select-Object -ExpandProperty Name
& (Join-Path $dest "forge.exe") --version
