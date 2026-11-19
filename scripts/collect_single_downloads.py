#!/usr/bin/env python3
"""Merge Pagado logo map from batch download JSON + per-file single downloads."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REFS = ROOT / "_logo_refs.json"
OUT = ROOT / "notion_logo_urls.json"


def strip_fragment(url: str) -> str:
    return url.split("#notion_record=")[0]


def main(argv: list[str]) -> None:
    ref_to_url: dict[str, str] = {}
    for path_str in argv:
        data = json.loads(Path(path_str).read_text(encoding="utf-8"))
        if data.get("files"):
            for item in data["files"]:
                if item.get("reference") and item.get("url"):
                    ref_to_url[item["reference"]] = strip_fragment(item["url"])
        else:
            # single-ref wrapper
            for item in data.get("files", []):
                pass

    for p in sorted(ROOT.glob("_single_dl_*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        for item in data.get("files", []):
            if item.get("reference") and item.get("url"):
                ref_to_url[item["reference"]] = strip_fragment(item["url"])

    mapping: dict[str, dict] = {}
    for item in json.loads(REFS.read_text(encoding="utf-8")):
        url = ref_to_url.get(item["reference"])
        if url:
            mapping[item["name"]] = {"url": url}

    OUT.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(mapping)} entries → {OUT}")
    missing = [r["name"] for r in json.loads(REFS.read_text()) if r["reference"] not in ref_to_url]
    if missing:
        print("Missing:", len(missing), missing)
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])