#!/usr/bin/env python3
"""Build notion_logo_urls.json from _logo_refs.json + get-file-download-urls batch JSON files."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REFS = ROOT / "_logo_refs.json"
OUT = ROOT / "notion_logo_urls.json"


def strip_fragment(url: str) -> str:
    if "#notion_record=" in url:
        return url.split("#notion_record=")[0]
    return url


def load_ref_to_url(paths: list[Path]) -> dict[str, str]:
    out: dict[str, str] = {}
    for path in paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        for item in data.get("files", []):
            ref = item.get("reference")
            url = item.get("url")
            if ref and url:
                out[ref] = strip_fragment(url)
    return out


def main(argv: list[str]) -> None:
    ref_items = json.loads(REFS.read_text(encoding="utf-8"))
    ref_to_url = load_ref_to_url([Path(p) for p in argv])

    mapping: dict[str, dict] = {}
    missing: list[str] = []
    for item in ref_items:
        name = item["name"]
        ref = item["reference"]
        url = ref_to_url.get(ref)
        if url:
            mapping[name] = {"url": url}
        else:
            missing.append(name)

    OUT.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(mapping)} entries → {OUT}")
    if missing:
        print(f"Missing URLs for {len(missing)}:", ", ".join(missing[:5]), "..." if len(missing) > 5 else "")


if __name__ == "__main__":
    main(sys.argv[1:])