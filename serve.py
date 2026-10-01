#!/usr/bin/env python3
"""Lokal server utan bufring, så endringar i JS/CSS blir med ved vanleg omlasting.

    python3 serve.py        # http://localhost:8765
"""

import functools
import http.server
from pathlib import Path

PORT = 8765


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


handler = functools.partial(NoCache, directory=Path(__file__).parent / "public")
print(f"http://localhost:{PORT}")
http.server.ThreadingHTTPServer(("", PORT), handler).serve_forever()
