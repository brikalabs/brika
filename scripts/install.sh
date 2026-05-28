#!/bin/sh
# BRIKA Installer for Linux and macOS
#
# Usage:
#   curl -fsSL https://brika.dev/install.sh | sh
#   curl -fsSL https://brika.dev/install.sh | sh -s -- canary
#
# Environment variables:
#   BRIKA_INSTALL_DIR  - Installation directory (default: ~/.brika)
#   BRIKA_VERSION      - Specific version to install (default: latest)
#                        Use "canary" for the latest development build

set -e

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

GITHUB_REPO="brikalabs/brika"
INSTALL_DIR="${BRIKA_INSTALL_DIR:-$HOME/.brika}"
BIN_DIR="$INSTALL_DIR/bin"
VERSION="${BRIKA_VERSION:-${1:-}}"

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
# Minisign signature verification (optional)
#
# Brika releases publish a `<asset>.minisig` alongside each binary
# archive once the signing key ceremony is live. When `minisign` is
# installed locally AND a public key is embedded below, install.sh
# refuses unsigned or invalid releases. When the pubkey is empty (the
# pre-ceremony state, today's default), signature verification is
# skipped silently.
#
# To enable: replace the empty BRIKA_MINISIGN_PUBKEY below with the
# *full* second-line of `brika.pub` (the minisign-format base64
# blob — NOT the raw 32-byte key, since the `minisign -V` CLI parses
# a public key file in the minisign format). Example:
#   BRIKA_MINISIGN_PUBKEY="RWQf6LRCGA…"
# ─────────────────────────────────────────────────────────────────────────────

BRIKA_MINISIGN_PUBKEY=""

verify_signature() {
  _asset="$1"
  _sig="$2"
  if [ -z "$BRIKA_MINISIGN_PUBKEY" ]; then
    # No pubkey embedded — signature ceremony not live yet. Skip silently.
    return 0
  fi
  if ! command -v minisign >/dev/null 2>&1; then
    error "Brika releases are signed but \`minisign\` CLI is not installed."
    error "Install it (https://jedisct1.github.io/minisign/) or set BRIKA_INSECURE=1 to skip."
    if [ "${BRIKA_INSECURE:-}" = "1" ]; then
      dim "  BRIKA_INSECURE=1 set, skipping signature verification (NOT recommended)"
      return 0
    fi
    exit 1
  fi
  if [ ! -f "$_sig" ]; then
    error "Signature file missing: $_sig"
    exit 1
  fi
  # Write pubkey to a temp file in minisign's expected format.
  _pubfile="$TMP_DIR/brika.pub"
  printf 'untrusted comment: brika signing key\n%s\n' "$BRIKA_MINISIGN_PUBKEY" > "$_pubfile"
  if ! minisign -V -p "$_pubfile" -m "$_asset" >/dev/null 2>&1; then
    error "Signature verification failed for $(basename "$_asset")"
    exit 1
  fi
  dim "  Signature verified"
}

# ─────────────────────────────────────────────────────────────────────────────
# Resolve version and fetch release metadata
# ─────────────────────────────────────────────────────────────────────────────

TMP_DIR=""
META_FILE=""
COMMIT_SHORT=""

# Find the newest `canary-*` prerelease tag via the GitHub releases API.
# Canary tags are stamped `canary-YYYYMMDD-HHMMSS-<sha>` and lexical
# sort matches chronological order, so the first match in the API's
# `created_at desc` response is what we want.
#
# Prints the tag to stdout on success, prints nothing on failure (the
# caller checks for an empty string). The grep+sed pipeline keeps this
# POSIX (no jq dependency on a fresh box).
#
# Anonymous GitHub API: 60 requests/hour per IP. One per install is
# fine; if you run a CI runner that installs dozens of canaries an
# hour, set BRIKA_VERSION=<exact-tag> instead to bypass.
resolve_latest_canary_tag() {
  _api_url="https://api.github.com/repos/$GITHUB_REPO/releases?per_page=20"
  _body=""
  if command -v curl >/dev/null 2>&1; then
    _body=$(curl -fsSL -H 'Accept: application/vnd.github+json' "$_api_url" 2>/dev/null) || return 1
  elif command -v wget >/dev/null 2>&1; then
    _body=$(wget -q -O - --header='Accept: application/vnd.github+json' "$_api_url" 2>/dev/null) || return 1
  else
    return 1
  fi
  printf '%s' "$_body" \
    | grep -o '"tag_name":[[:space:]]*"canary-[^"]*"' \
    | sed -n 's/.*"\(canary-[^"]*\)"/\1/p' \
    | head -n 1
}

resolve_version() {
  TMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TMP_DIR"' EXIT

  META_FILE="$TMP_DIR/release-meta.json"

  if [ "$VERSION" = "canary" ]; then
    info "Using canary (development) channel..."
    RELEASE_TAG=$(resolve_latest_canary_tag)
    if [ -z "$RELEASE_TAG" ]; then
      error "No canary release found. The build pipeline may not have published one yet."
      exit 1
    fi
    info "Latest canary: ${RELEASE_TAG}"
    META_URL="https://github.com/$GITHUB_REPO/releases/download/${RELEASE_TAG}/release-meta.json"
  elif [ -n "$VERSION" ]; then
    RELEASE_TAG="v${VERSION}"
    META_URL="https://github.com/$GITHUB_REPO/releases/download/v${VERSION}/release-meta.json"
  else
    info "Checking latest version..."
    RELEASE_TAG="latest"
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
  [ -x "$BIN_DIR/brika" ] || return 0

  # `brika version --json` lands a single-line JSON payload. Use `sed -n …p` so
  # a non-match prints nothing — the prior `sed s/…/\1/` left the whole input
  # in place on a no-op, which made `[ -n "$_v" ]` always true and produced
  # garbled "Upgrading vBrika Console …" banners against any binary that
  # didn't actually implement --json (which was every binary prior to this
  # change, since the flag was documented in the comment but never shipped).
  _json=$("$BIN_DIR/brika" version --json 2>/dev/null || echo "")
  _v=$(printf '%s' "$_json" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
  _c=$(printf '%s' "$_json" | sed -n 's/.*"commit":"\([^"]*\)".*/\1/p' | cut -c1-7)
  if [ -n "$_v" ]; then
    EXISTING_VERSION="v${_v}${_c:+ ($_c)}"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Install Brika
# ─────────────────────────────────────────────────────────────────────────────

install_brika() {
  ASSET_NAME="brika-${PLATFORM}.tar.gz"
  if [ "$RELEASE_TAG" = "latest" ]; then
    DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/latest/download/${ASSET_NAME}"
  else
    DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/download/${RELEASE_TAG}/${ASSET_NAME}"
  fi

  if [ -n "$EXISTING_VERSION" ]; then
    info "Upgrading brika ${EXISTING_VERSION} → v${VERSION} (${COMMIT_SHORT}) for ${PLATFORM}..."
  else
    info "Downloading brika v${VERSION} (${COMMIT_SHORT}) for ${PLATFORM}..."
  fi
  dim "  $DOWNLOAD_URL"

  download "$DOWNLOAD_URL" "$TMP_DIR/$ASSET_NAME"

  # Verify checksum — fail closed when no checksum was published.
  # Silently skipping (the previous behaviour) opened a hole: a
  # tampered release-meta.json that simply OMITS the asset key would
  # bypass integrity verification entirely.
  EXPECTED=$(grep "\"${ASSET_NAME}\"" "$META_FILE" | sed 's/.*"[^"]*": *"\([a-f0-9]*\)".*/\1/')
  if [ -z "$EXPECTED" ]; then
    error "No checksum recorded for $ASSET_NAME in release-meta.json"
    error "  refusing to install an unverifiable artifact"
    exit 1
  fi
  ACTUAL=$(sha256_file "$TMP_DIR/$ASSET_NAME")
  if [ "$ACTUAL" != "$EXPECTED" ]; then
    error "Checksum mismatch for $ASSET_NAME"
    error "  expected: $EXPECTED"
    error "  got:      $ACTUAL"
    exit 1
  fi
  dim "  Checksum verified"

  # Verify signature (when ceremony is live + minisign CLI present)
  if [ -n "$BRIKA_MINISIGN_PUBKEY" ]; then
    SIG_URL="${DOWNLOAD_URL}.minisig"
    download "$SIG_URL" "$TMP_DIR/${ASSET_NAME}.minisig" || true
    verify_signature "$TMP_DIR/$ASSET_NAME" "$TMP_DIR/${ASSET_NAME}.minisig"
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
