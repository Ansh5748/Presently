#!/usr/bin/env bash
set -e

if [ ! -f /opt/render/chrome/chrome ]; then
  echo "Installing Chromium manually..."
  mkdir -p /opt/render/chrome
  curl -L https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/1191205/chrome-linux.zip -o chrome.zip
  unzip chrome.zip
  mv chrome-linux/* /opt/render/chrome/
  chmod +x /opt/render/chrome/chrome
fi
