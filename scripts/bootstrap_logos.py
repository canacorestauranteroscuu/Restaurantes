#!/usr/bin/env python3
"""Bootstrap logos without full Notion sync (web fallback). Optional JSON from Notion URLs."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from logo_utils import (  # noqa: E402
    load_sources,
    resolve_logo_for_entry,
    save_sources,
    save_logo,
    http_get,
    slugify,
)

DATA_JS = ROOT / "site" / "assets" / "restaurants-data.js"
NOTION_URLS = ROOT / "scripts" / "notion_logo_urls.json"


def parse_restaurants(js_path: Path) -> list[dict]:
    import subprocess

    script = (
        "const fs=require('fs');"
        "const code=fs.readFileSync(process.argv[1],'utf8');"
        "const fn=new Function(code+'; return restaurants;');"
        "console.log(JSON.stringify(fn()));"
    )
    out = subprocess.check_output(["node", "-e", script, str(js_path)], text=True)
    return json.loads(out)


def main():
    notion_map = {}
    if NOTION_URLS.exists():
        notion_map = json.loads(NOTION_URLS.read_text(encoding="utf-8"))
    restaurants = parse_restaurants(DATA_JS)
    sources = load_sources()
    for r in restaurants:
        name = r["name"]
        page = None
        if name in notion_map and notion_map[name].get("url"):
            page = {
                "properties": {
                    "Logo": {
                        "files": [{"type": "external", "external": {"url": notion_map[name]["url"]}}]
                    }
                }
            }
        logo, record = resolve_logo_for_entry(name, page, r.get("web"), r.get("social"))
        sources[name] = record
        print(f"{name}: {record['source']} → {logo or 'initials'}")
    save_sources(sources)


if __name__ == "__main__":
    main()