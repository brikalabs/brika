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

info()  { printf "${CYAN}%s${RESET}\n" "$*"; }
success() { printf "${GREEN}%s${RESET}\n" "$*"; }
error() { printf "${RED}error:${RESET} %s\n" "$*" >&2; }
dim()   { printf "${DIM}%s${RESET}\n" "$*"; }

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
# Resolve latest version from GitHub
# ─────────────────────────────────────────────────────────────────────────────

resolve_version() {
  if [ -n "$VERSION" ]; then
    return
  fi

  info "Checking latest version..."

  if command -v curl >/dev/null 2>&1; then
    VERSION=$(curl -fsSL "https://api.github.com/repos/$GITHUB_REPO/releases/latest" \
      | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/')
  elif command -v wget >/dev/null 2>&1; then
    VERSION=$(wget -qO- "https://api.github.com/repos/$GITHUB_REPO/releases/latest" \
      | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/')
  fi

  if [ -z "$VERSION" ]; then
    error "Failed to determine latest version"
    exit 1
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Detect existing installation
# ─────────────────────────────────────────────────────────────────────────────

detect_existing() {
  EXISTING_VERSION=""
  if [ -x "$BIN_DIR/brika" ]; then
    EXISTING_VERSION=$("$BIN_DIR/brika" --version 2>/dev/null || echo "")
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Install Brika
# ─────────────────────────────────────────────────────────────────────────────

install_brika() {
  ASSET_NAME="brika-${PLATFORM}.tar.gz"
  DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/download/v${VERSION}/${ASSET_NAME}"

  if [ -n "$EXISTING_VERSION" ]; then
    info "Upgrading brika v${EXISTING_VERSION} → v${VERSION} for ${PLATFORM}..."
  else
    info "Downloading brika v${VERSION} for ${PLATFORM}..."
  fi
  dim "  $DOWNLOAD_URL"

  TMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TMP_DIR"' EXIT

  download "$DOWNLOAD_URL" "$TMP_DIR/$ASSET_NAME"

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
  INSTALLED_VERSION=$("$BIN_DIR/brika" --version 2>/dev/null || echo "")
  if [ -z "$INSTALLED_VERSION" ]; then
    error "Installation may have failed — could not run brika"
    exit 1
  fi
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

  printf "\n"
  if [ -n "$EXISTING_VERSION" ]; then
    success "  Brika upgraded successfully!  v${EXISTING_VERSION} → v${VERSION}"
  else
    success "  Brika v${VERSION} installed successfully!"
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
