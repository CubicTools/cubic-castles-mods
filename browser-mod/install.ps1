<#
  Files-only installer for Cubic Castles Browser Mods.

  It copies the production extension into a stable Local AppData folder,
  copies that folder path to the clipboard, and prints the manual Load unpacked
  instructions. It never opens or controls a browser.
#>

[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'CubicCastles\browser-mod'),
  [switch]$NoClipboard,
  [switch]$Pause
)

$ErrorActionPreference = 'Stop'
$ExtensionName = 'Cubic Castles Browser Mods'
$SourceDir = $PSScriptRoot

function Write-Step([string]$Message) {
  Write-Host "[*] $Message" -ForegroundColor Cyan
}

function Write-Good([string]$Message) {
  Write-Host "[+] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
  Write-Host "[!] $Message" -ForegroundColor Yellow
}

function Assert-SafeInstallPath([string]$Path) {
  $base = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'CubicCastles'))
  $full = [IO.Path]::GetFullPath($Path)
  if (-not $full.StartsWith($base + [IO.Path]::DirectorySeparatorChar,
      [StringComparison]::OrdinalIgnoreCase)) {
    throw "InstallDir must be inside $base (got $full)."
  }
  return $full
}

function Copy-ProductionExtension([string]$Destination) {
  $sourceManifestPath = Join-Path $SourceDir 'manifest.json'
  if (-not (Test-Path -LiteralPath $sourceManifestPath)) {
    throw "Extension manifest not found at $sourceManifestPath"
  }

  $sourceManifest = Get-Content -Raw -LiteralPath $sourceManifestPath | ConvertFrom-Json
  $version = [string]$sourceManifest.version
  $repoRoot = [IO.Path]::GetFullPath((Join-Path $SourceDir '..\..'))
  $releaseZip = Join-Path $repoRoot "stage2\release\files\browser-mod-$version.zip"
  $stage = Join-Path ([IO.Path]::GetTempPath()) (
    'cc-browser-install-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $stage | Out-Null

  try {
    if (Test-Path -LiteralPath $releaseZip) {
      Write-Step "Using production extension package v$version"
      Expand-Archive -LiteralPath $releaseZip -DestinationPath $stage -Force
    } else {
      Write-Warn 'No matching release ZIP was found; building from this checkout.'
      $skip = '^(test-.*|serve-test\.js|README\.md|install\.ps1|installer)$'
      Get-ChildItem -LiteralPath $SourceDir -Force | Where-Object {
        $_.Name -ne 'node_modules' -and $_.Name -notmatch $skip
      } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse -Force
      }

      $manifestPath = Join-Path $stage 'manifest.json'
      $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
      $manifest.PSObject.Properties.Remove('version_name')
      $manifest.PSObject.Properties.Remove('optional_host_permissions')
      $manifest.host_permissions = @($manifest.host_permissions | Where-Object {
        $_ -ne 'http://192.168.1.165/*'
      })
      $manifest.description = $manifest.description -replace
        ',?\s*(handyman |auto )?plot getter', ''
      $manifestText = ($manifest | ConvertTo-Json -Depth 20) + [Environment]::NewLine
      [IO.File]::WriteAllText($manifestPath, $manifestText,
        [Text.UTF8Encoding]::new($false))
    }

    $builtManifest = Get-Content -Raw -LiteralPath (Join-Path $stage 'manifest.json') |
      ConvertFrom-Json
    if ($builtManifest.name -ne $ExtensionName -or $builtManifest.version -ne $version) {
      throw 'The extension package does not match this checkout.'
    }
    if ([string]$builtManifest.version_name -match 'dev') {
      throw 'Refusing to install a development manifest because it disables self-updates.'
    }

    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Get-ChildItem -LiteralPath $stage -Force | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }

    $installedManifest = Get-Content -Raw -LiteralPath (
      Join-Path $Destination 'manifest.json') | ConvertFrom-Json
    if ($installedManifest.name -ne $ExtensionName -or
        $installedManifest.version -ne $version) {
      throw 'The installed extension failed its manifest verification.'
    }
    return $version
  } finally {
    if (Test-Path -LiteralPath $stage) {
      Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

$exitCode = 0
try {
  $InstallDir = Assert-SafeInstallPath $InstallDir
  Write-Host ''
  Write-Host 'Cubic Castles Browser Mods - extension file installer' -ForegroundColor White
  Write-Host ''

  Write-Step "Installing the production extension files to $InstallDir"
  $version = Copy-ProductionExtension $InstallDir
  Write-Good "Extension files installed and verified (v$version)"

  if (-not $NoClipboard) {
    try {
      Set-Clipboard -Value $InstallDir
      Write-Good 'The Load unpacked folder path was copied to your clipboard.'
    } catch {
      Write-Warn 'The folder path could not be copied to your clipboard.'
    }
  }

  Write-Host ''
  Write-Host 'LOAD UNPACKED FOLDER:' -ForegroundColor White
  Write-Host $InstallDir -ForegroundColor Yellow
  Write-Host ''
  Write-Host 'Next:' -ForegroundColor White
  Write-Host '  1. Open your browser Extensions page.'
  Write-Host '     Brave: brave://extensions'
  Write-Host '     Chrome: chrome://extensions'
  Write-Host '     Edge: edge://extensions'
  Write-Host '  2. Turn on Developer mode.'
  Write-Host '  3. Click Load unpacked and paste/select the folder shown above.'
  Write-Host '  4. Open the extension Details page and enable Allow User Scripts.'
  Write-Host ''
  Write-Good 'DONE. The installer did not open or modify any browser profile.'
} catch {
  $exitCode = 1
  Write-Host ''
  Write-Host "INSTALL FAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Target extension folder: $InstallDir" -ForegroundColor Yellow
} finally {
  if ($Pause) {
    Write-Host ''
    Read-Host 'Press Enter to close'
  }
}
exit $exitCode
