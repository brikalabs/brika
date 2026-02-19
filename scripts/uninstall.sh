#!/bin/sh
# BRIKA Uninstaller for Linux and macOS
#
# Usage:
#   brika uninstall
#   curl -fsSL https://raw.githubusercontent.com/maxscharwath/brika/master/scripts/uninstall.sh | sh
#
# Environment variables:
#   BRIKA_INSTALL_DIR  - Installation directory (default: ~/.brika)
#   BRIKA_YES          - Set to 1 to skip confirmation prompt

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

main() {
  printf "\n${BOLD}${CYAN}  BRIKA Uninstaller${RESET}\n\n"

  # Check installed
  if [ ! -d "$INSTALL_DIR" ]; then
    error "Brika is not installed at $INSTALL_DIR"
    exit 1
  fi

  # Show installed version
  if [ -x "$BIN_DIR/brika" ]; then
    CURRENT_VERSION=$("$BIN_DIR/brika" --version 2>/dev/null || echo "")
    if [ -n "$CURRENT_VERSION" ]; then
      dim "  Installed version: v${CURRENT_VERSION}"
    fi
  fi

  dim "  Will remove: $INSTALL_DIR"
  printf "\n"

  # Confirm (skip if BRIKA_YES=1 or stdin is not interactive)
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

  # Remove installation directory
  info "Removing $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"

  # Clean up PATH entries from shell config files
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
  info "  Restart your shell to apply PATH changes."
  printf "\n"
}

main
