#!/usr/bin/env bash
set -e

CHROME_DIR="/opt/render/chrome"
CHROME_BIN="$CHROME_DIR/chrome"

if [ -x "$CHROME_BIN" ]; then
  echo "Chromium already installed"
  exit 0
fi

echo "Installing Chromium via apt..."

apt-get update
apt-get install -y chromium

mkdir -p "$CHROME_DIR"
ln -s /usr/bin/chromium "$CHROME_BIN"

echo "Chromium installed at $CHROME_BIN"
