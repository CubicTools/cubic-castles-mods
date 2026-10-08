[CmdletBinding()]
param(
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$installerSourceDir = $PSScriptRoot
$browserModDir = [IO.Path]::GetFullPath((Join-Path $installerSourceDir '..'))
$repoRoot = [IO.Path]::GetFullPath((Join-Path $browserModDir '..\..'))

if (-not $OutputPath) {
  $OutputPath = Join-Path $repoRoot 'CubicCastlesBrowserModsInstaller.exe'
}
$OutputPath = [IO.Path]::GetFullPath($OutputPath)

$manifestPath = Join-Path $browserModDir 'manifest.json'
$installScriptPath = Join-Path $browserModDir 'install.ps1'
$programPath = Join-Path $installerSourceDir 'Program.cs'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$releaseZip = Join-Path $repoRoot "stage2\release\files\browser-mod-$($manifest.version).zip"

foreach ($required in @($programPath, $manifestPath, $installScriptPath, $releaseZip)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required installer input not found: $required"
  }
}

$compilerCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1
if (-not $compiler) {
  throw 'The Windows .NET Framework C# compiler was not found.'
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$compilerArgs = @(
  '/nologo',
  '/target:exe',
  '/platform:anycpu',
  '/optimize+',
  "/out:$OutputPath",
  "/resource:$installScriptPath,Installer.install.ps1",
  "/resource:$manifestPath,Installer.manifest.json",
  "/resource:$releaseZip,Installer.browser-mod.zip",
  $programPath
)

& $compiler $compilerArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $OutputPath)) {
  throw "Installer compilation failed with exit code $LASTEXITCODE."
}

$result = Get-Item -LiteralPath $OutputPath
$hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
Write-Host "Built: $($result.FullName)"
Write-Host "Size:  $($result.Length) bytes"
Write-Host "SHA256: $hash"
