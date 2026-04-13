# BRIKA Installer for Windows
#
# Usage:
#   iwr -useb https://brika.dev/install.ps1 | iex
#   & ([scriptblock]::Create((irm https://brika.dev/install.ps1))) canary
#
# Environment variables:
#   BRIKA_INSTALL_DIR  - Installation directory (default: %LOCALAPPDATA%\brika\bin)
#   BRIKA_VERSION      - Specific version to install (default: latest)
#                        Use "canary" for the latest development build

$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

$GitHubRepo = "brikalabs/brika"
$InstallDir = if ($env:BRIKA_INSTALL_DIR) { $env:BRIKA_INSTALL_DIR } else { "$env:LOCALAPPDATA\brika\bin" }
$BinaryPath = Join-Path $InstallDir "brika.exe"

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

function Write-Info    { param([string]$Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Success { param([string]$Message) Write-Host $Message -ForegroundColor Green }
function Write-Err     { param([string]$Message) Write-Host "error: $Message" -ForegroundColor Red }
function Write-Dim     { param([string]$Message) Write-Host $Message -ForegroundColor DarkGray }

# ─────────────────────────────────────────────────────────────────────────────
# Platform detection
# ─────────────────────────────────────────────────────────────────────────────

$Arch     = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq "Arm64") { "arm64" } else { "x64" }
$Platform = "windows-$Arch"

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  BRIKA Installer" -ForegroundColor Cyan
Write-Host ""

$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "brika-install-$(Get-Random)"
New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

try {
    # ─────────────────────────────────────────────────────────────────────────────
    # Resolve version and fetch release metadata
    # ─────────────────────────────────────────────────────────────────────────────

    $Version = if ($env:BRIKA_VERSION) { $env:BRIKA_VERSION } elseif ($args.Count -gt 0) { $args[0] } else { $null }
    if ($Version -eq "canary") {
        Write-Info "Using canary (development) channel..."
        $ReleaseTag = "canary"
        $MetaUrl = "https://github.com/$GitHubRepo/releases/download/canary/release-meta.json"
    } elseif ($Version) {
        $ReleaseTag = "v$Version"
        $MetaUrl = "https://github.com/$GitHubRepo/releases/download/v$Version/release-meta.json"
    } else {
        Write-Info "Checking latest version..."
        $ReleaseTag = "latest"
        $MetaUrl = "https://github.com/$GitHubRepo/releases/latest/download/release-meta.json"
    }

    $MetaFile = Join-Path $TmpDir "release-meta.json"
    Invoke-WebRequest -Uri $MetaUrl -OutFile $MetaFile -UseBasicParsing
    $Meta = Get-Content $MetaFile -Raw | ConvertFrom-Json

    $Version     = $Meta.version
    $CommitShort = $Meta.commit.Substring(0, [Math]::Min(7, $Meta.commit.Length))

    if (-not $Version -or -not $CommitShort) {
        Write-Err "Failed to parse release metadata"
        exit 1
    }

    # ─────────────────────────────────────────────────────────────────────────────
    # Detect existing installation
    # ─────────────────────────────────────────────────────────────────────────────

    $ExistingVersion = ""
    if (Test-Path $BinaryPath) {
        # Try JSON format first (new binary)
        try {
            $Json = & $BinaryPath version --json 2>$null | ConvertFrom-Json
            if ($Json.version -and $Json.commit) {
                $ExistingVersion = "v$($Json.version) ($($Json.commit.Substring(0, [Math]::Min(7, $Json.commit.Length))))"
            }
        } catch {}

        # Fall back to human-readable: "brika v0.3.0 (abc1234)"
        if (-not $ExistingVersion) {
            try {
                $Out = (& $BinaryPath --version 2>$null | Select-Object -First 1).Trim()
                if ($Out -match 'brika v([^\s]+) \(([^)]+)\)') {
                    $ExistingVersion = "v$($Matches[1]) ($($Matches[2]))"
                }
            } catch {}
        }
    }

    # ─────────────────────────────────────────────────────────────────────────────
    # Download
    # ─────────────────────────────────────────────────────────────────────────────

    $AssetName   = "brika-$Platform.zip"
    if ($ReleaseTag -eq "latest") {
        $DownloadUrl = "https://github.com/$GitHubRepo/releases/latest/download/$AssetName"
    } else {
        $DownloadUrl = "https://github.com/$GitHubRepo/releases/download/$ReleaseTag/$AssetName"
    }

    if ($ExistingVersion) {
        Write-Info "Upgrading brika $ExistingVersion → v$Version ($CommitShort) for $Platform..."
    } else {
        Write-Info "Downloading brika v$Version ($CommitShort) for $Platform..."
    }
    Write-Dim "  $DownloadUrl"

    $ArchivePath = Join-Path $TmpDir $AssetName
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchivePath -UseBasicParsing

    # Verify checksum
    $Expected = $Meta.checksums.$AssetName
    if ($Expected) {
        $Actual = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLower()
        if ($Actual -ne $Expected) {
            Write-Err "Checksum mismatch for $AssetName"
            Write-Err "  expected: $Expected"
            Write-Err "  got:      $Actual"
            exit 1
        }
        Write-Dim "  Checksum verified"
    }

    # ─────────────────────────────────────────────────────────────────────────────
    # Extract
    # ─────────────────────────────────────────────────────────────────────────────

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Write-Info "Extracting..."
    Expand-Archive -Path $ArchivePath -DestinationPath $InstallDir -Force

    # ─────────────────────────────────────────────────────────────────────────────
    # Verify installation
    # ─────────────────────────────────────────────────────────────────────────────

    $Out = ""
    try { $Out = (& $BinaryPath --version 2>$null | Select-Object -First 1).Trim() } catch {}
    if (-not $Out) {
        Write-Err "Installation may have failed — brika binary failed to run"
        exit 1
    }
    $InstalledVersion = "v$Version ($CommitShort)"

    # ─────────────────────────────────────────────────────────────────────────────
    # Setup PATH
    # ─────────────────────────────────────────────────────────────────────────────

    $CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($CurrentPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$InstallDir;$CurrentPath", "User")
        Write-Dim "  Added $InstallDir to user PATH"
    }
    $env:Path = "$InstallDir;$env:Path"

    # ─────────────────────────────────────────────────────────────────────────────
    # Done
    # ─────────────────────────────────────────────────────────────────────────────

    Write-Host ""
    if ($ExistingVersion) {
        Write-Success "  Brika upgraded successfully!  $ExistingVersion → $InstalledVersion"
    } else {
        Write-Success "  Brika $InstalledVersion installed successfully!"
    }
    Write-Host ""
    Write-Dim "  Install directory: $InstallDir"
    Write-Dim "  Binary:            $InstallDir\brika.exe  (Bun runtime embedded)"
    Write-Host ""
    Write-Info "  Run 'brika start' to get started!"
    Write-Host ""
}
finally {
    Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
