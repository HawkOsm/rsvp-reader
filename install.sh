#!/usr/bin/env bash
# RSVP Reader - a local desktop speed reader.
# Copyright (C) 2026 Osman Sahin Guler
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
#
# SPDX-License-Identifier: GPL-3.0-or-later

# Add RSVP Reader to your desktop application menu.
#
#   ./install.sh              install (or refresh) the launcher
#   ./install.sh --associate  also offer it under "Open With" for PDFs/text
#   ./install.sh --uninstall  remove it again
#
# By default the entry claims no file types at all.  Registering for
# application/pdf would otherwise make this app the *default* PDF opener on
# a system that has no explicit default set, which is not what a speed
# reader should do to your desktop.
#
# Nothing is copied except the icon: the menu entry and the PATH command
# both point at this directory, so editing the code here takes effect
# immediately.  Everything lands under ~/.local, no root needed.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ID="rsvp-reader"

BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
DESKTOP_DIR="$DATA_DIR/applications"
ICON_DIR="$DATA_DIR/icons/hicolor/scalable/apps"

LAUNCHER="$APP_DIR/$APP_ID"
BIN_LINK="$BIN_DIR/$APP_ID"
DESKTOP_FILE="$DESKTOP_DIR/$APP_ID.desktop"
ICON_FILE="$ICON_DIR/$APP_ID.svg"

refresh_caches() {
    command -v update-desktop-database >/dev/null 2>&1 \
        && update-desktop-database -q "$DESKTOP_DIR" 2>/dev/null || true
    command -v gtk-update-icon-cache >/dev/null 2>&1 \
        && gtk-update-icon-cache -qtf "$DATA_DIR/icons/hicolor" 2>/dev/null || true
}

if [ "${1:-}" = "--uninstall" ]; then
    rm -f "$DESKTOP_FILE" "$ICON_FILE"
    # Only remove the PATH command if it is our symlink, never a real file.
    if [ -L "$BIN_LINK" ] && [ "$(readlink -f "$BIN_LINK")" = "$LAUNCHER" ]; then
        rm -f "$BIN_LINK"
    fi
    refresh_caches
    echo "Removed RSVP Reader from your applications."
    echo "Your library at ~/.config/rsvp-reader/library.db was left alone."
    exit 0
fi

[ -x "$LAUNCHER" ] || chmod +x "$LAUNCHER"
mkdir -p "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR"

ln -sfn "$LAUNCHER" "$BIN_LINK"
install -m 644 "$APP_DIR/share/$APP_ID.svg" "$ICON_FILE"

ASSOCIATE=""
[ "${1:-}" = "--associate" ] && ASSOCIATE=yes

# Types we would claim, and the defaults to protect before claiming them.
MIME_TYPES="application/pdf text/plain text/markdown"

write_desktop_file() {
    # $1 = MimeType line to include, or empty for none
    cat > "$DESKTOP_FILE" <<DESKTOP
[Desktop Entry]
Type=Application
Version=1.0
Name=RSVP Reader
GenericName=Speed Reader
Comment=Read documents one word at a time, at a pace you set
Exec=$LAUNCHER %F
TryExec=$LAUNCHER
Icon=$APP_ID
Terminal=false
Categories=Office;Viewer;
Keywords=rsvp;speed;reading;reader;pdf;spritz;words;
${1:-}StartupNotify=true
StartupWMClass=$APP_ID
DESKTOP
    chmod 644 "$DESKTOP_FILE"
}

# Install claiming nothing first, so the queries below cannot see us.
write_desktop_file ""
refresh_caches

if [ -n "$ASSOCIATE" ]; then
    # Pin whatever is currently the default for each type, so that adding
    # ourselves to the candidate list cannot silently take it over.
    for type in $MIME_TYPES; do
        current="$(xdg-mime query default "$type" 2>/dev/null || true)"
        if [ -n "$current" ] && [ "$current" != "$APP_ID.desktop" ]; then
            xdg-mime default "$current" "$type" 2>/dev/null || true
            echo "  kept $type default: $current"
        fi
    done
    write_desktop_file "MimeType=application/pdf;text/plain;text/markdown;
"
fi

if command -v desktop-file-validate >/dev/null 2>&1; then
    desktop-file-validate "$DESKTOP_FILE" \
        || echo "warning: desktop entry failed validation (see above)" >&2
fi
refresh_caches

echo "Installed RSVP Reader."
echo "  menu entry : $DESKTOP_FILE"
echo "  icon       : $ICON_FILE"
echo "  command    : $BIN_LINK  ->  $LAUNCHER"
echo
echo "It should appear in your launcher as \"RSVP Reader\"."
echo "From a terminal: rsvp-reader [FILE]"
if [ -n "$ASSOCIATE" ]; then
    echo "PDFs and text files now list it under \"Open With\"."
else
    echo
    echo "It deliberately claims no file types, so it cannot become your"
    echo "default PDF opener.  Want it in the \"Open With\" menu anyway?"
    echo "    ./install.sh --associate"
fi

case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) echo; echo "note: $BIN_DIR is not on your PATH, so the terminal"
       echo "      command will not be found until you add it." ;;
esac
