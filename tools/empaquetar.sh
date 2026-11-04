#!/bin/bash
# Genera ../ar-trading-vX.Y.zip (carpeta raíz "ar-trading", sin node_modules, data ni .git)
set -e
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
OUT="/home/claude/ar-trading-v${V}.zip"
T=$(mktemp -d)
mkdir "$T/ar-trading"
tar --exclude=.git --exclude=node_modules --exclude=data --exclude=dist --exclude='*.zip' -cf - . | tar -xf - -C "$T/ar-trading"
rm -f "$OUT"
(cd "$T" && zip -qr "$OUT" ar-trading)
echo "$OUT"
