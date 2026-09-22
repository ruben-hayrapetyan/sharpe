#!/bin/bash
# Builds "Sharpe.app" (a WKWebView shell around the web app in the parent folder).
set -euo pipefail
cd "$(dirname "$0")"
SRC="$(cd .. && pwd)"
OUT="${1:-$SRC/Sharpe.app}"
rm -rf "$OUT"
mkdir -p "$OUT/Contents/MacOS" "$OUT/Contents/Resources/web"
swiftc -O -o "$OUT/Contents/MacOS/Sharpe" main.swift
cp "$SRC/index.html" "$SRC/app.css" "$SRC/app.js" "$SRC/data.js" "$SRC/fermi.js" "$OUT/Contents/Resources/web/"
cp -R "$SRC/img" "$OUT/Contents/Resources/web/img"
[ -f AppIcon.icns ] && cp AppIcon.icns "$OUT/Contents/Resources/AppIcon.icns"
cat > "$OUT/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Sharpe</string>
  <key>CFBundleDisplayName</key><string>Sharpe</string>
  <key>CFBundleIdentifier</key><string>com.ruben.quantdrill</string>
  <key>CFBundleExecutable</key><string>Sharpe</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.education</string>
</dict></plist>
PLIST
codesign --force --sign - "$OUT" >/dev/null 2>&1 || true
echo "Built: $OUT"
