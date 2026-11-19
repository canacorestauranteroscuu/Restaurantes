#!/usr/bin/env python3
"""Save one Notion notion-fetch MCP response JSON to scripts/fetches/{page_id}.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

FETCH_DIR = Path(__file__).resolve().parent / "fetches"


def main() -> None:
    FETCH_DIR.mkdir(parents=True, exist_ok=True)
    data = json.loads(sys.stdin.read())
    url = data.get("url") or ""
    pid = url.split("/")[-1].split("?")[0]
    if not pid:
        raise SystemExit("missing url in payload")
    out = FETCH_DIR / f"{pid}.json"
    out.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(pid, file=sys.stderr)


if __name__ == "__main__":
    main()