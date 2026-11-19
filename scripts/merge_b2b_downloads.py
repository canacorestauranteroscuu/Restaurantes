#!/usr/bin/env python3
"""Append batch2b download URLs into notion_logo_urls.json (reference-keyed batch file)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REFS = ROOT / "_logo_refs.json"
OUT = ROOT / "notion_logo_urls.json"


def strip_fragment(url: str) -> str:
    return url.split("#notion_record=")[0]


def main() -> None:
    batch_path = Path(sys.argv[1])
    batch = json.loads(batch_path.read_text(encoding="utf-8"))
    ref_to_url = {f["reference"]: strip_fragment(f["url"]) for f in batch.get("files", []) if f.get("url")}

    mapping: dict[str, dict] = {}
    if OUT.exists():
        mapping = json.loads(OUT.read_text(encoding="utf-8"))

    for item in json.loads(REFS.read_text(encoding="utf-8")):
        ref = item["reference"]
        if ref in ref_to_url:
            mapping[item["name"]] = {"url": ref_to_url[ref]}

    OUT.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(mapping)} entries → {OUT}")