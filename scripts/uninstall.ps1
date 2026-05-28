# BRIKA Uninstaller for Windows
#
# Usage:
#   brika uninstall
#   irm https://raw.githubusercontent.com/brikalabs/brika/main/scripts/uninstall.ps1 | iex
#
# Environment variables:
#   BRIKA_INSTALL_DIR  - Installation directory (default: %LOCALAPPDATA%\brika\bin)
#   BRIKA_YES          - Set to 1 to skip confirmation prompt

$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

$InstallDir = if ($env:BRIKA_INSTALL_DIR) { $env:BRIKA_INSTALL_DIR } else { "$env:LOCALAPPDATA\brika\bin" }

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

function Write-Info    { param([string]$m) Write-Host $m -ForegroundColor Cyan }
function Write-Success { param([string]$m) Write-Host $m -ForegroundColor Green }
function Write-Err     { param([string]$m) Write-Host "error: $m" -ForegroundColor Red }
function Write-Dim     { param([string]$m) Write-Host $m -ForegroundColor DarkGray }

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  BRIKA Uninstaller" -ForegroundColor Cyan
Write-Host ""

# Check installed
if (-not (Test-Path $InstallDir)) {
    Write-Err "Brika is not installed at $InstallDir"
    exit 1
}

# Show installed version. `brika --version` now emits a multi-line block
# ("Brika Console v0.X.Y\n  branch …"), so blindly prefixing it with `v`
# used to print garbled output. Read the structured JSON instead;
# degrade silently against any legacy binary that doesn't implement
# `version --json`.
$BinaryPath = Join-Path $InstallDir "brika.exe"
if (Test-Path $BinaryPath) {
    try {
        $Json = & $BinaryPath version --json 2>$null | ConvertFrom-Json
        if ($Json.version) {
            $Label = "v$($Json.version)"
            if ($Json.commit) {
                $Short = $Json.commit.Substring(0, [Math]::Min(7, $Json.commit.Length))
                $Label = "$Label ($Short)"
            }
            Write-Dim "  Installed version: $Label"
        }
    } catch {}
}

Write-Dim "  Will remove: $InstallDir"
Write-Host ""

# Confirm (skip if BRIKA_YES=1)
if ($env:BRIKA_YES -ne "1") {
    $Confirm = Read-Host "  Continue? [y/N]"
    if ($Confirm -notmatch '^[yY]') {
        Write-Info "  Aborted."
        exit 0
    }
}

# Remove installation directory
Write-Info "Removing $InstallDir..."
Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue

# Remove from user PATH
$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -like "*$InstallDir*") {
    $NewPath = ($CurrentPath -split ";" | Where-Object { $_ -ne $InstallDir }) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    Write-Dim "  Removed $InstallDir from user PATH"
}

Write-Host ""
Write-Success "  Brika uninstalled successfully!"
Write-Host ""
Write-Info "  Restart your terminal to apply PATH changes."
Write-Host ""
