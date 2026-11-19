#!/usr/bin/env python3
"""Append logo URLs for the 8 missing Pagado entries from scripts/missing8/*.url files."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "notion_logo_urls.json"
MISSING_DIR = ROOT / "missing8"
NAMES = [
    "El Temorense",
    "Mayólica",
    "Deliciosa Mente",
    "La Tarima - Alitas & Burgers",
    "Costa Langosta",
    "Pinos Burger",
    "Ricos Tacos de la 24",
    "naturalbalance.club",
]


def slug_name(name: str) -> str:
    return (
        name.replace("/", "_")
        .replace(" ", "_")
        .replace("&", "and")
        .replace(".", "_")
        .replace("ó", "o")
        .replace("í", "i")
    )


def main() -> None:
    mapping = json.loads(OUT.read_text(encoding="utf-8"))
    for name in NAMES:
        path = MISSING_DIR / f"{slug_name(name)}.url"
        if not path.is_file():
            raise SystemExit(f"Missing URL file: {path}")
        url = path.read_text(encoding="utf-8").strip().split("#notion_record=")[0]
        mapping[name] = {"url": url}

    OUT.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(mapping)} entries → {OUT}")


if __name__ == "__main__":
    main()