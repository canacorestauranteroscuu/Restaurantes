#!/usr/bin/env python3
"""Merge name→url logo map batches into scripts/notion_logo_urls.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent / "notion_logo_urls.json"


def main(argv: list[str]) -> None:
    mapping: dict[str, dict] = {}
    if OUT.exists():
        mapping = json.loads(OUT.read_text(encoding="utf-8"))

    for path_str in argv:
        data = json.loads(Path(path_str).read_text(encoding="utf-8"))
        for name, url in data.items():
            if name and url:
                mapping[name.strip()] = {"url": url}

    OUT.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(mapping)} entries → {OUT}")