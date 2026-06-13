#!/bin/sh
# BRIKA Uninstaller for Linux and macOS
#
# A thin bootstrap around `brika uninstall`: when the binary works it owns the
# removal logic (binary, PATH, completions, and with --purge the data dir +
# keychain), so the behaviour matches the in-app command exactly. The hardcoded
# `rm -rf` below only runs as a fallback when the binary is missing or broken.
#
# Usage:
#   brika uninstall
#   curl -fsSL https://raw.githubusercontent.com/brikalabs/brika/main/scripts/uninstall.sh | sh
#
# Environment variables:
#   BRIKA_INSTALL_DIR  - Installation directory (default: ~/.brika)
#   BRIKA_YES          - Set to 1 to skip confirmation prompt
#   BRIKA_KEEP_DATA    - Set to 1 to keep the data dir (DB, plugins, secrets)

set -e

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

INSTALL_DIR="${BRIKA_INSTALL_DIR:-$HOME/.brika}"
BIN_DIR="$INSTALL_DIR/bin"

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
# Main
# ─────────────────────────────────────────────────────────────────────────────

# Delegate to the binary when it runs: single source of truth for the removal
# logic. `--purge` wipes the data dir + keychain unless BRIKA_KEEP_DATA=1;
# `--yes` skips the prompt when non-interactive (piped) or BRIKA_YES=1.
delegate() {
  PURGE="--purge"
  [ "${BRIKA_KEEP_DATA:-}" = "1" ] && PURGE=""
  YES=""
  if [ "${BRIKA_YES:-}" = "1" ] || [ ! -t 0 ]; then
    YES="--yes"
  fi
  # shellcheck disable=SC2086 # word-splitting the optional flags is intended
  exec "$BIN_DIR/brika" uninstall $PURGE $YES
}

# Fallback for a missing/broken binary: the binary can't clean its own data or
# keychain, so do the minimal directory + PATH cleanup directly.
fallback() {
  printf "\n${BOLD}${CYAN}  BRIKA Uninstaller${RESET}\n\n"
  dim "  Will remove: $INSTALL_DIR"
  printf "\n"

  if [ "${BRIKA_YES:-}" != "1" ] && [ -t 0 ]; then
    printf "  Continue? [y/N] "
    read -r CONFIRM
    case "$CONFIRM" in
      [yY]|[yY][eE][sS]) ;;
      *)
        info "  Aborted."
        exit 0
        ;;
    esac
  fi

  info "Removing $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"

  for RC_FILE in \
    "$HOME/.zshrc" \
    "$HOME/.bashrc" \
    "$HOME/.bash_profile" \
    "$HOME/.profile" \
    "$HOME/.config/fish/config.fish"
  do
    if [ -f "$RC_FILE" ] && grep -q "$BIN_DIR" "$RC_FILE" 2>/dev/null; then
      TMP=$(mktemp)
      grep -v "^# Brika$" "$RC_FILE" | grep -v "$BIN_DIR" > "$TMP"
      mv "$TMP" "$RC_FILE"
      dim "  Cleaned $RC_FILE"
    fi
  done

  printf "\n"
  success "  Brika uninstalled successfully!"
  printf "\n"
  dim "  Note: OS keychain entries (if any) were not removed; the binary was unavailable."
  info "  Restart your shell to apply PATH changes."
  printf "\n"
}

main() {
  if [ ! -d "$INSTALL_DIR" ]; then
    error "Brika is not installed at $INSTALL_DIR"
    exit 1
  fi

  if [ -x "$BIN_DIR/brika" ] && "$BIN_DIR/brika" --version >/dev/null 2>&1; then
    delegate
  fi

  fallback
}

main
