# BRIKA Uninstaller for Windows
#
# The binary can't delete its own running .exe on Windows, so this script owns
# the file removal. It first delegates the data + keychain cleanup to
# `brika uninstall` (single source of truth for that logic), then removes the
# install tree and PATH entry once the brika process has exited and unlocked
# the .exe.
#
# Usage:
#   brika uninstall
#   irm https://raw.githubusercontent.com/brikalabs/brika/main/scripts/uninstall.ps1 | iex
#
# Environment variables:
#   BRIKA_INSTALL_DIR  - Installation directory (default: %LOCALAPPDATA%\brika\bin)
#   BRIKA_YES          - Set to 1 to skip confirmation prompt
#   BRIKA_KEEP_DATA    - Set to 1 to keep the data dir (DB, plugins, secrets)

$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

$InstallDir = if ($env:BRIKA_INSTALL_DIR) { $env:BRIKA_INSTALL_DIR } else { "$env:LOCALAPPDATA\brika\bin" }
# The data dir is the parent of the bin dir (matches the binary's resolver).
$DataDir = Split-Path -Parent $InstallDir
$KeepData = $env:BRIKA_KEEP_DATA -eq "1"

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

if ($KeepData) {
    Write-Dim "  Will remove: $InstallDir"
} else {
    Write-Dim "  Will remove: $DataDir (binary + all data)"
    Write-Dim "  and stored secrets in Windows Credential Manager"
}
Write-Host ""

# Confirm, unless BRIKA_YES=1 or input is redirected (e.g. `irm ... | iex`), so
# the piped one-liner runs non-interactively, matching uninstall.sh.
if ($env:BRIKA_YES -ne "1" -and -not [Console]::IsInputRedirected) {
    $Confirm = Read-Host "  Continue? [y/N]"
    if ($Confirm -notmatch '^[yY]') {
        Write-Info "  Aborted."
        exit 0
    }
}

# Delegate the data dir + keychain cleanup to the binary (single source of
# truth). On Windows the binary purges the keychain but leaves the file tree to
# us, since its own .exe is locked while running. Best-effort.
if ((Test-Path $BinaryPath) -and (-not $KeepData)) {
    Write-Info "Cleaning data and secrets..."
    try {
        & $BinaryPath uninstall --purge --yes 2>$null | Out-Null
    } catch {}
}

# Remove the install tree. The brika process has exited by now, so the .exe is
# unlocked. Removing the data dir takes the bin subdir with it.
$Target = if ($KeepData) { $InstallDir } else { $DataDir }
Write-Info "Removing $Target..."
Remove-Item -Path $Target -Recurse -Force -ErrorAction SilentlyContinue

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
