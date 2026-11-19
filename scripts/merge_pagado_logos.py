#!/usr/bin/env python3
"""Build notion_logo_urls.json from fetch JSON files in scripts/fetches/."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))

from scripts.build_notion_logo_urls import extract_from_fetch_payload, plain_title  # type: ignore

OUT = ROOT / "notion_logo_urls.json"
FETCH_DIR = ROOT / "fetches"
ROWS = ROOT / "_pagado_rows.json"


def main() -> None:
    mapping: dict[str, dict] = {}
    if OUT.exists():
        mapping = json.loads(OUT.read_text(encoding="utf-8"))

    for path in sorted(FETCH_DIR.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        pair = extract_from_fetch_payload(payload)
        if pair:
            mapping[pair[0]] = {"url": pair[1]}

    if ROWS.exists():
        data = json.loads(ROWS.read_text(encoding="utf-8"))
        for row in data.get("results", []):
            logo = row.get("Logo")
            if not logo or logo in ("null", "[]"):
                continue
            name = plain_title((row.get("Nombre Restaurante") or "").strip())
            if name and name not in mapping:
                pass  # missing fetch

    OUT.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(mapping)} logo URLs → {OUT}")


if __name__ == "__main__":
    main()