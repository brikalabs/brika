# BRIKA Installer for Windows
#
# Usage:
#   irm https://raw.githubusercontent.com/maxscharwath/brika/master/scripts/install.ps1 | iex
#
# Environment variables:
#   BRIKA_INSTALL_DIR  - Installation directory (default: %LOCALAPPDATA%\brika)
#   BRIKA_VERSION      - Specific version to install (default: latest)

$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

$GitHubRepo = "maxscharwath/brika"
$InstallDir = if ($env:BRIKA_INSTALL_DIR) { $env:BRIKA_INSTALL_DIR } else { "$env:LOCALAPPDATA\brika\bin" }

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

function Write-Info { param([string]$Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host $Message -ForegroundColor Green }
function Write-Err { param([string]$Message) Write-Host "error: $Message" -ForegroundColor Red }
function Write-Dim { param([string]$Message) Write-Host $Message -ForegroundColor DarkGray }

# ─────────────────────────────────────────────────────────────────────────────
# Platform detection
# ─────────────────────────────────────────────────────────────────────────────

$Arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") {
    "arm64"
} else {
    "x64"
}
$Platform = "windows-$Arch"

# ─────────────────────────────────────────────────────────────────────────────
# Resolve version
# ─────────────────────────────────────────────────────────────────────────────

$Version = $env:BRIKA_VERSION
if (-not $Version) {
    Write-Info "Checking latest version..."
    try {
        $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$GitHubRepo/releases/latest"
        $Version = $Release.tag_name -replace '^v', ''
    }
    catch {
        Write-Err "Failed to check latest version: $_"
        exit 1
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  BRIKA Installer" -ForegroundColor Cyan
Write-Host ""

# Detect existing installation
$ExistingVersion = ""
$BinaryPath = Join-Path $InstallDir "brika.exe"
if (Test-Path $BinaryPath) {
    try { $ExistingVersion = (& $BinaryPath --version 2>$null).Trim() } catch {}
}

# Create install directory
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

# Create temp directory
$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "brika-install-$(Get-Random)"
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

try {
    # Download Brika
    $AssetName = "brika-$Platform.zip"
    $DownloadUrl = "https://github.com/$GitHubRepo/releases/download/v$Version/$AssetName"

    if ($ExistingVersion) {
        Write-Info "Upgrading brika v$ExistingVersion -> v$Version for $Platform..."
    } else {
        Write-Info "Downloading brika v$Version for $Platform..."
    }
    Write-Dim "  $DownloadUrl"

    $ArchivePath = Join-Path $TmpDir $AssetName
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchivePath -UseBasicParsing

    # Extract Brika
    Write-Info "Extracting..."
    Expand-Archive -Path $ArchivePath -DestinationPath $InstallDir -Force

    # Verify installation
    $InstalledVersion = ""
    try { $InstalledVersion = (& $BinaryPath --version 2>$null).Trim() } catch {}
    if (-not $InstalledVersion) {
        Write-Err "Installation may have failed — could not run brika"
        exit 1
    }

    # Add to PATH
    $CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($CurrentPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$InstallDir;$CurrentPath", "User")
        Write-Dim "  Added $InstallDir to user PATH"
    }

    # Update current session PATH
    $env:Path = "$InstallDir;$env:Path"

    Write-Host ""
    if ($ExistingVersion) {
        Write-Success "  Brika upgraded successfully!  v$ExistingVersion -> v$Version"
    } else {
        Write-Success "  Brika v$Version installed successfully!"
    }
    Write-Host ""
    Write-Dim "  Install directory: $InstallDir"
    Write-Dim "  Binary:            $InstallDir\brika.exe"
    Write-Dim "  Bun runtime:       $InstallDir\bun.exe  (bundled)"
    Write-Host ""
    Write-Info "  Run 'brika start' to get started!"
    Write-Host ""
}
finally {
    # Cleanup
    Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
