#!/usr/bin/env python3
"""Local static server with Firebase-style cleanUrls (extensionless HTML)."""

from __future__ import annotations

import json
import os
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "3456"))
DEBUG_LOG = ROOT / ".cursor" / "debug-b36607.log"


def _agent_log(message: str, data: dict, hypothesis_id: str = "C") -> None:
    # #region agent log
    try:
        DEBUG_LOG.parent.mkdir(parents=True, exist_ok=True)
        entry = {
            "sessionId": "b36607",
            "runId": "clean-url-server",
            "hypothesisId": hypothesis_id,
            "location": "serve.py",
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with DEBUG_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError:
        pass
    # #endregion


class CleanURLHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        parsed = urlparse(path)
        raw = unquote(parsed.path)
        # Strip query handled by urlparse; keep filesystem mapping under ROOT
        rel = raw.lstrip("/")
        candidate = (ROOT / rel).resolve()

        # Stay inside project root
        try:
            candidate.relative_to(ROOT)
        except ValueError:
            return str(ROOT)

        if candidate.is_file():
            return str(candidate)

        if candidate.is_dir():
            index = candidate / "index.html"
            if index.is_file():
                return str(index)
            return str(candidate)

        # Clean URL: /pages/find-advisor -> find-advisor.html
        html = Path(str(candidate) + ".html")
        if html.is_file():
            _agent_log(
                "resolved clean url",
                {"request": raw, "served": str(html.relative_to(ROOT))},
            )
            return str(html)

        # Trailing-slash style: /pages/find-advisor/ -> find-advisor.html
        if raw.endswith("/"):
            html = ROOT / (rel.rstrip("/") + ".html")
            if html.is_file():
                _agent_log(
                    "resolved clean url trailing",
                    {"request": raw, "served": str(html.relative_to(ROOT))},
                )
                return str(html)

        _agent_log(
            "path not found",
            {"request": raw},
            hypothesis_id="C",
        )
        return str(candidate)

    def log_message(self, fmt: str, *args) -> None:
        super().log_message(fmt, *args)


def main() -> None:
    handler = partial(CleanURLHandler, directory=str(ROOT))
    # Bind IPv4 explicitly so http://127.0.0.1:3456 always works
    server = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    _agent_log(
        "server started",
        {"host": "127.0.0.1", "port": PORT, "root": str(ROOT)},
        hypothesis_id="A",
    )
    print(f"Serving MyTalks with cleanUrls at http://127.0.0.1:{PORT}/")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()
