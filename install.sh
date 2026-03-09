#!/usr/bin/env bash
# install.sh — Install all dependencies to develop Mark's TCL extension on Ubuntu.
# Usage: bash install.sh

set -euo pipefail

# ── helpers ────────────────────────────────────────────────────────────────────
info()  { echo "[INFO]  $*"; }
error() { echo "[ERROR] $*" >&2; exit 1; }

require_ubuntu() {
  if ! grep -qi 'ubuntu' /etc/os-release 2>/dev/null; then
    error "This script is intended for Ubuntu only."
  fi
}

# ── pre-flight ─────────────────────────────────────────────────────────────────
require_ubuntu

info "Updating apt package lists…"
sudo apt-get update -qq

# ── 1. Node.js LTS (via NodeSource) ───────────────────────────────────────────
# Node.js 18 LTS is the minimum supported runtime version for this project.
NODE_MAJOR=18

INSTALL_NODE=0
if command -v node &>/dev/null; then
  INSTALLED_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [ "$INSTALLED_MAJOR" -ge "$NODE_MAJOR" ]; then
    info "Node.js $(node --version) is already installed — skipping."
  else
    info "Node.js $INSTALLED_MAJOR is too old; installing Node.js $NODE_MAJOR LTS…"
    INSTALL_NODE=1
  fi
else
  info "Node.js not found; installing Node.js $NODE_MAJOR LTS…"
  INSTALL_NODE=1
fi

if [ "$INSTALL_NODE" = "1" ]; then
  # Install curl if not present
  sudo apt-get install -y curl ca-certificates

  # Download the NodeSource setup script to a temporary file so it can be
  # inspected before execution (avoids piping untrusted content directly into
  # the shell).
  NODESOURCE_SETUP="$(mktemp /tmp/nodesource-setup-XXXXXX.sh)"
  trap 'rm -f "$NODESOURCE_SETUP"' EXIT
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o "$NODESOURCE_SETUP"
  sudo -E bash "$NODESOURCE_SETUP"
  rm -f "$NODESOURCE_SETUP"
  trap - EXIT

  sudo apt-get install -y nodejs
fi

info "Node.js $(node --version), npm $(npm --version)"

# ── 2. TCL runtime (tclsh) ────────────────────────────────────────────────────
# Required for the 'local' syntax-check mode (tcl.runtime.syntaxCheckMode).
if command -v tclsh &>/dev/null; then
  info "tclsh is already installed — skipping."
else
  info "Installing tcl…"
  sudo apt-get install -y tcl
  info "tclsh installed: $(tclsh <<< 'puts [info patchlevel]')"
fi

# ── 3. Project npm dependencies ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info "Installing npm dependencies in $SCRIPT_DIR…"
npm install --prefix "$SCRIPT_DIR"

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "✅  All dependencies installed."
echo ""
echo "Next steps:"
echo "  npm run compile    — compile the TypeScript sources"
echo "  npm test           — run the test suite"
echo "  npm run package    — build the .vsix extension package"
