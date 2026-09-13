#!/usr/bin/env python3
# RSVP Reader - a local speed reader.
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

"""Serve the web app locally.

    python serve.py [port]        # default 8770

Threaded on purpose.  The single-threaded http.server deadlocks when the
service worker fetches its own script while a page load is still in
flight, and registration then fails with an unhelpful "unknown error
occurred when fetching the script".

Service workers need a secure context; localhost counts as one, so this
is enough to develop and test the installable app.
"""

from __future__ import annotations

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parent / "web"


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        # Never serve a stale shell or worker while developing.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args) -> None:
        pass


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    if not WEB_ROOT.is_dir():
        print(f"no web directory at {WEB_ROOT}", file=sys.stderr)
        return 1

    handler = partial(Handler, directory=str(WEB_ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"RSVP Reader (web) on http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
