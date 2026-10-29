#!/bin/sh
# Install RSVP Reader on Linux (x86_64), for this user only: no sudo.
#
#   sh install.sh               install the version this script came with
#   sh install.sh --uninstall   remove it (your library is kept)
#
# Each release carries its own copy of this script with its version filled
# in (.github/workflows/release.yml), and it installs exactly that version's
# AppImage, after checking it against the release's SHA256SUMS. Run from a
# clone of the repository instead, it needs --version vX.Y.
#
# What it puts where:
#   ~/.local/bin/rsvp-reader                          the AppImage
#   ~/.local/share/applications/rsvp-reader.desktop   the menu entry
#   ~/.local/share/icons/hicolor/128x128/apps/rsvp-reader.png
#
# RSVP_RELEASE_URL overrides where the release's files are fetched from (a
# folder or file:// URL works), for testing the script itself.
set -eu

VERSION="@VERSION@"
REPO="HawkOsm/rsvp-reader"
APPIMAGE="rsvp-reader-linux-x86_64.AppImage"

BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/128x128/apps"
TARGET="$BIN_DIR/rsvp-reader"
DESKTOP="$APPS_DIR/rsvp-reader.desktop"
ICON="$ICON_DIR/rsvp-reader.png"

say() { printf '%s\n' "$*"; }
fail() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }

uninstall() {
  rm -f "$TARGET" "$DESKTOP" "$ICON"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" || true
  say "RSVP Reader is removed. Your library is still in ~/.local/share/io.github.hawkosm.rsvpreader;"
  say "delete that folder too if you want it gone."
}

while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) uninstall; exit 0 ;;
    --version) [ $# -ge 2 ] || fail "--version needs a version, like v0.3"; VERSION="$2"; shift ;;
    -h | --help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) fail "unknown option: $1 (try --help)" ;;
  esac
  shift
done

case "$VERSION" in
  @*) fail "this copy has no version. Use the install.sh attached to a release, or pass --version v0.3." ;;
  v[0-9]*) ;;
  *) fail "a version looks like v0.3, not '$VERSION'" ;;
esac
[ "$(uname -s)" = Linux ] || fail "this is for Linux; see the release page for other systems."
[ "$(uname -m)" = x86_64 ] || fail "there is only an x86_64 build for Linux so far."
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is needed (it comes with coreutils)."

BASE="${RSVP_RELEASE_URL:-https://github.com/$REPO/releases/download/$VERSION}"
fetch() { # fetch <name> <to>
  case "$BASE" in
    http*) if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$2" "$BASE/$1"
           elif command -v wget >/dev/null 2>&1; then wget -q -O "$2" "$BASE/$1"
           else fail "curl or wget is needed to download."; fi ;;
    file://*) cp "${BASE#file://}/$1" "$2" ;;
    *) cp "$BASE/$1" "$2" ;;
  esac
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

say "Downloading RSVP Reader $VERSION…"
fetch "$APPIMAGE" "$WORK/$APPIMAGE" || fail "couldn't download $APPIMAGE for $VERSION."
fetch SHA256SUMS "$WORK/SHA256SUMS" || fail "couldn't download SHA256SUMS for $VERSION."
# Check the AppImage against its line in SHA256SUMS, and only that line.
grep "  $APPIMAGE\$" "$WORK/SHA256SUMS" >"$WORK/check" || fail "SHA256SUMS has no line for $APPIMAGE."
(cd "$WORK" && sha256sum -c --quiet check) || fail "the download doesn't match its checksum; nothing was installed."

mkdir -p "$BIN_DIR" "$APPS_DIR" "$ICON_DIR"
chmod +x "$WORK/$APPIMAGE"
# Replace in one step, so a running copy isn't half overwritten.
mv -f "$WORK/$APPIMAGE" "$TARGET.new" && mv -f "$TARGET.new" "$TARGET"

# The icon, from the repository at this version (the app's own, GPL-3.0).
fetch_icon() {
  case "$BASE" in
    http*)
      url="https://raw.githubusercontent.com/$REPO/$VERSION/src-tauri/icons/128x128.png"
      if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$ICON" "$url"; else wget -q -O "$ICON" "$url"; fi ;;
    *) fetch rsvp-reader.png "$ICON" ;;
  esac
}
fetch_icon 2>/dev/null || say "(No icon: the menu entry will use a generic one.)"

cat >"$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=RSVP Reader
Comment=A local speed reader
Exec="$TARGET" %f
Icon=rsvp-reader
Terminal=false
Categories=Office;Viewer;Education;
MimeType=application/pdf;application/epub+zip;text/plain;text/markdown;
EOF
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS_DIR" || true

say "Installed RSVP Reader $VERSION as $TARGET, with a menu entry."
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) say "Note: $BIN_DIR isn't on your PATH, so start it from the menu, or add it to PATH." ;;
esac
# Most AppImages need libfuse2 to start; say so now rather than on first launch.
if command -v ldconfig >/dev/null 2>&1 && ! ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
  say "Note: libfuse2 seems to be missing, and the AppImage may not start without it."
  say "      Install it (e.g. 'fuse2' or 'libfuse2'), or run it with APPIMAGE_EXTRACT_AND_RUN=1."
fi
