#!/usr/bin/env python3
"""Import notion-fetch MCP payloads from a JSON array file into scripts/fetches/."""
from __future__ import annotations

import json
import sys
from pathlib import Path

FETCH_DIR = Path(__file__).resolve().parent / "fetches"


def save_payload(data: dict) -> str | None:
    url = data.get("url") or ""
    pid = url.split("/")[-1].split("?")[0]
    if not pid:
        return None
    FETCH_DIR.mkdir(parents=True, exist_ok=True)
    (FETCH_DIR / f"{pid}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return pid


def main() -> None:
    path = Path(sys.argv[1])
    items = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        items = [items]
    saved = 0
    for item in items:
        if save_payload(item):
            saved += 1
    print(f"Saved {saved} fetches → {FETCH_DIR}")


if __name__ == "__main__":
    main()