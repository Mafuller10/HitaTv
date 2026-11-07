<#
  Packages roku/ and sideloads it onto a Roku in Developer Mode.

  One-time setup on the TV:  Home x3, Up x2, Right, Left, Right, Left, Right  -> enable the installer,
  set a password (user is always "rokudev"), and note the IP address it shows.

  Usage:
    .\deploy.ps1 -RokuIp 192.168.1.50 -Password yourpass
    .\deploy.ps1 -RokuIp 192.168.1.50 -Password yourpass -RebuildCatalog   # refresh bundled catalog first
#>
param(
  [Parameter(Mandatory = $true)][string]$RokuIp,
  [Parameter(Mandatory = $true)][string]$Password,
  [switch]$RebuildCatalog
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if ($RebuildCatalog) {
  Push-Location "$root\builder"
  try { npm run build -- --bundle; if ($LASTEXITCODE -ne 0) { throw "catalog build failed" } } finally { Pop-Location }
}

if (-not (Test-Path "$root\roku\images\splash_fhd.png")) { node "$root\tools\make-images.mjs" }

New-Item -ItemType Directory -Force "$root\out" | Out-Null
$zip = "$root\out\hitatv.zip"
if (Test-Path $zip) { Remove-Item $zip -Force -Confirm:$false }

# tar.exe (bsdtar, built into Windows 10+) writes forward-slash paths; Compress-Archive on PS 5.1 does not,
# and the Roku installer rejects backslash paths.
Push-Location "$root\roku"
# Call Windows' bsdtar explicitly: a GNU tar from Git on PATH would write a tarball, not a zip.
$bsdtar = "$env:SystemRoot\System32\tar.exe"
try { & $bsdtar -a -c -f $zip manifest source components images data; if ($LASTEXITCODE -ne 0) { throw "zip failed" } } finally { Pop-Location }
"Package: {0:N0} KB" -f ((Get-Item $zip).Length / 1KB)

curl.exe --fail --silent --show-error --digest -u "rokudev:$Password" `
  -F "mysubmit=Install" -F "archive=@$zip" "http://$RokuIp/plugin_install" | Select-String -Pattern "Install Success|Identical|Failure|Error" | ForEach-Object { $_.Line.Trim() }

"Done. Debug console:  telnet $RokuIp 8085"
