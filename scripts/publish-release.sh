#!/usr/bin/env bash
set -euo pipefail
: "${RELEASE_TAG:?Missing release tag}"
: "${GH_REPO:?Missing repository}"
version="${RELEASE_TAG#v}"
required=("YMarkdownG-$version-Windows-x64.exe" "YMarkdownG-$version-Setup-x64.exe" "YMarkdownG-$version-macOS-arm64.dmg" "YMarkdownG-$version-macOS-x64.dmg" "YMarkdownG-$version-macOS-arm64.zip" "YMarkdownG-$version-macOS-x64.zip" "YMarkdownG-$version-Linux-x86_64.AppImage")
for name in "${required[@]}"; do test -s "release/$name" || { echo "Missing $name"; exit 1; }; done
rm -f release/SHA256SUMS.txt
(cd release && sha256sum -- * > ../SHA256SUMS.txt)
mv SHA256SUMS.txt release/
notes=".github/release-notes/$RELEASE_TAG.md"
test -f "$notes"
if gh release view "$RELEASE_TAG" --json isDraft > existing-release.json 2>/dev/null; then
  jq -e '.isDraft == true' existing-release.json >/dev/null || { echo 'Release already published; refusing overwrite'; exit 1; }
else
  gh release create "$RELEASE_TAG" --verify-tag --draft --title "YMarkdownG $RELEASE_TAG · Desktop" --notes-file "$notes"
fi
gh release upload "$RELEASE_TAG" release/* --clobber
gh release view "$RELEASE_TAG" --json assets > uploaded-assets.json
for file in release/*; do
  name="$(basename "$file")"; bytes="$(stat -c%s "$file")"
  jq -e --arg name "$name" --argjson bytes "$bytes" '.assets | any(.name == $name and .size == $bytes)' uploaded-assets.json >/dev/null
done
gh release edit "$RELEASE_TAG" --draft=false --latest
