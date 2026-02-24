#!/bin/sh
# BRIKA Installer for Linux and macOS
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/maxscharwath/brika/master/scripts/install.sh | sh
#
# Environment variables:
#   BRIKA_INSTALL_DIR  - Installation directory (default: ~/.brika)
#   BRIKA_VERSION      - Specific version to install (default: latest)

set -e

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

GITHUB_REPO="maxscharwath/brika"
INSTALL_DIR="${BRIKA_INSTALL_DIR:-$HOME/.brika}"
BIN_DIR="$INSTALL_DIR/bin"
VERSION="${BRIKA_VERSION:-}"

# ─────────────────────────────────────────────────────────────────────────────
# Colors (only if terminal supports it)
# ─────────────────────────────────────────────────────────────────────────────

if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  CYAN='\033[0;36m'
  DIM='\033[2m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  RED='' GREEN='' CYAN='' DIM='' BOLD='' RESET=''
fi

info()    { printf "${CYAN}%s${RESET}\n" "$*"; }
success() { printf "${GREEN}%s${RESET}\n" "$*"; }
error()   { printf "${RED}error:${RESET} %s\n" "$*" >&2; }
dim()     { printf "${DIM}%s${RESET}\n" "$*"; }

# ─────────────────────────────────────────────────────────────────────────────
# Platform detection
# ─────────────────────────────────────────────────────────────────────────────

detect_platform() {
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "$OS" in
    linux)  OS="linux" ;;
    darwin) OS="darwin" ;;
    *)
      error "Unsupported operating system: $OS"
      exit 1
      ;;
  esac

  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *)
      error "Unsupported architecture: $ARCH"
      exit 1
      ;;
  esac

  PLATFORM="${OS}-${ARCH}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Download helper (curl or wget)
# ─────────────────────────────────────────────────────────────────────────────

download() {
  url="$1"
  dest="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --progress-bar "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --show-progress "$url" -O "$dest"
  else
    error "Neither curl nor wget found. Please install one of them."
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# SHA-256 helper
# ─────────────────────────────────────────────────────────────────────────────

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Resolve version and fetch release metadata
# ─────────────────────────────────────────────────────────────────────────────

TMP_DIR=""
META_FILE=""
COMMIT_SHORT=""

resolve_version() {
  TMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TMP_DIR"' EXIT

  META_FILE="$TMP_DIR/release-meta.json"

  if [ -n "$VERSION" ]; then
    META_URL="https://github.com/$GITHUB_REPO/releases/download/v${VERSION}/release-meta.json"
  else
    info "Checking latest version..."
    META_URL="https://github.com/$GITHUB_REPO/releases/latest/download/release-meta.json"
  fi

  download "$META_URL" "$META_FILE"

  VERSION=$(grep '"version"' "$META_FILE" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
  COMMIT_SHORT=$(grep '"commit"' "$META_FILE" | head -1 | sed 's/.*"commit": *"\([^"]*\)".*/\1/' | cut -c1-7)

  if [ -z "$VERSION" ] || [ -z "$COMMIT_SHORT" ]; then
    error "Failed to parse release metadata"
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Detect existing installation
# ─────────────────────────────────────────────────────────────────────────────

detect_existing() {
  EXISTING_VERSION=""
  if [ -x "$BIN_DIR/brika" ]; then
    # Try JSON format first (new binary), fall back to human-readable (old binary)
    _json=$("$BIN_DIR/brika" version --json 2>/dev/null || echo "")
    _v=$(printf '%s' "$_json" | sed 's/.*"version":"\([^"]*\)".*/\1/')
    _c=$(printf '%s' "$_json" | sed 's/.*"commit":"\([^"]*\)".*/\1/')
    if [ -n "$_v" ] && [ "$_v" != "$_json" ]; then
      EXISTING_VERSION="v${_v} (${_c})"
    else
      # Old binary: "brika v0.3.0 (abc1234)"
      _out=$("$BIN_DIR/brika" --version 2>/dev/null || echo "")
      _v=$(printf '%s' "$_out" | head -1 | sed 's/.*brika v\([^ ]*\).*/\1/')
      _c=$(printf '%s' "$_out" | head -1 | sed 's/.*(\([^)]*\)).*/\1/')
      if [ -n "$_v" ] && [ "$_v" != "$_out" ]; then
        EXISTING_VERSION="v${_v} (${_c})"
      fi
    fi
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Install Brika
# ─────────────────────────────────────────────────────────────────────────────

install_brika() {
  ASSET_NAME="brika-${PLATFORM}.tar.gz"
  DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/download/v${VERSION}/${ASSET_NAME}"

  if [ -n "$EXISTING_VERSION" ]; then
    info "Upgrading brika ${EXISTING_VERSION} → v${VERSION} (${COMMIT_SHORT}) for ${PLATFORM}..."
  else
    info "Downloading brika v${VERSION} (${COMMIT_SHORT}) for ${PLATFORM}..."
  fi
  dim "  $DOWNLOAD_URL"

  download "$DOWNLOAD_URL" "$TMP_DIR/$ASSET_NAME"

  # Verify checksum
  EXPECTED=$(grep "\"${ASSET_NAME}\"" "$META_FILE" | sed 's/.*"[^"]*": *"\([a-f0-9]*\)".*/\1/')
  if [ -n "$EXPECTED" ]; then
    ACTUAL=$(sha256_file "$TMP_DIR/$ASSET_NAME")
    if [ "$ACTUAL" != "$EXPECTED" ]; then
      error "Checksum mismatch for $ASSET_NAME"
      error "  expected: $EXPECTED"
      error "  got:      $ACTUAL"
      exit 1
    fi
    dim "  Checksum verified"
  fi

  # Create install directory
  mkdir -p "$BIN_DIR"

  # Extract
  info "Extracting..."
  tar xzf "$TMP_DIR/$ASSET_NAME" -C "$BIN_DIR"

  # Ensure binary is executable
  chmod +x "$BIN_DIR/brika"
}

# ─────────────────────────────────────────────────────────────────────────────
# Verify installation
# ─────────────────────────────────────────────────────────────────────────────

verify_installation() {
  _out=$("$BIN_DIR/brika" --version 2>/dev/null || echo "")
  if [ -z "$_out" ]; then
    error "Installation may have failed — brika binary failed to run"
    exit 1
  fi
  INSTALLED_VERSION="v${VERSION} (${COMMIT_SHORT})"
}

# ─────────────────────────────────────────────────────────────────────────────
# Setup PATH
# ─────────────────────────────────────────────────────────────────────────────

setup_path() {
  # Check if already in PATH
  case ":$PATH:" in
    *":$BIN_DIR:"*) return ;;
  esac

  SHELL_NAME=$(basename "$SHELL" 2>/dev/null || echo "sh")
  EXPORT_LINE="export PATH=\"$BIN_DIR:\$PATH\""

  case "$SHELL_NAME" in
    zsh)
      RC_FILE="$HOME/.zshrc"
      ;;
    bash)
      if [ -f "$HOME/.bash_profile" ]; then
        RC_FILE="$HOME/.bash_profile"
      else
        RC_FILE="$HOME/.bashrc"
      fi
      ;;
    fish)
      EXPORT_LINE="set -gx PATH $BIN_DIR \$PATH"
      RC_FILE="$HOME/.config/fish/config.fish"
      ;;
    *)
      RC_FILE="$HOME/.profile"
      ;;
  esac

  # Only add if not already present
  if [ -f "$RC_FILE" ] && grep -q "$BIN_DIR" "$RC_FILE" 2>/dev/null; then
    return
  fi

  printf '\n# Brika\n%s\n' "$EXPORT_LINE" >> "$RC_FILE"
  dim "  Added $BIN_DIR to PATH in $RC_FILE"
}

# ─────────────────────────────────────────────────────────────────────────────
# Setup shell completions
# ─────────────────────────────────────────────────────────────────────────────

setup_completions() {
  "$BIN_DIR/brika" completions >/dev/null 2>&1 && \
    dim "  Installed shell completions" || true
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
  printf "\n${BOLD}${CYAN}  BRIKA Installer${RESET}\n\n"

  detect_platform
  resolve_version
  detect_existing
  install_brika
  verify_installation
  setup_path
  setup_completions

  printf "\n"
  if [ -n "$EXISTING_VERSION" ]; then
    success "  Brika upgraded successfully!  ${EXISTING_VERSION} → ${INSTALLED_VERSION}"
  else
    success "  Brika ${INSTALLED_VERSION} installed successfully!"
  fi
  printf "\n"
  dim "  Install directory: $BIN_DIR"
  dim "  Binary:            $BIN_DIR/brika  (Bun runtime embedded)"
  printf "\n"

  # Check if we need to reload shell
  case ":$PATH:" in
    *":$BIN_DIR:"*)
      info "  Run 'brika start' to get started!"
      ;;
    *)
      info "  Restart your shell or run:"
      printf "    ${BOLD}export PATH=\"$BIN_DIR:\$PATH\"${RESET}\n"
      printf "\n"
      info "  Then run 'brika start' to get started!"
      ;;
  esac

  printf "\n"
}

main
