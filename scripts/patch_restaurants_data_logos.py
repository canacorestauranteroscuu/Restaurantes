#!/usr/bin/env python3
"""Add logo paths to site/assets/restaurants-data.js from sources.json."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from logo_utils import slugify  # noqa: E402

DATA_JS = ROOT / "site" / "assets" / "restaurants-data.js"
SOURCES_JSON = ROOT / "site" / "assets" / "logos" / "sources.json"


def main() -> None:
    sources = json.loads(SOURCES_JSON.read_text(encoding="utf-8"))
    import subprocess

    text = DATA_JS.read_text(encoding="utf-8")
    m = re.search(r"(const restaurants = \[)(.*)(\]\s*\.sort)", text, re.DOTALL)
    if not m:
        raise SystemExit("Could not parse restaurants-data.js")
    prefix, suffix = m.group(1), m.group(3)
    script = (
        "const fs=require('fs');"
        "const code=fs.readFileSync(process.argv[1],'utf8');"
        "const fn=new Function(code+'; return restaurants;');"
        "console.log(JSON.stringify(fn()));"
    )
    out = subprocess.check_output(["node", "-e", script, str(DATA_JS)], text=True)
    restaurants = json.loads(out)

    for r in restaurants:
        name = r["name"]
        slug = slugify(name)
        rec = sources.get(name, {})
        webp = ROOT / "site" / "assets" / "logos" / f"{slug}.webp"
        if rec.get("source") in ("notion", "web") and webp.is_file():
            r["logo"] = f"/assets/logos/{slug}.webp"
        else:
            r["logo"] = None

    blocks = []
    for r in restaurants:
        lines = ["  {"]
        for key, val in r.items():
            if val is None:
                lines.append(f"    {key}: null,")
            elif isinstance(val, bool):
                lines.append(f"    {key}: {'true' if val else 'false'},")
            elif isinstance(val, (int, float)):
                lines.append(f"    {key}: {val},")
            elif isinstance(val, list):
                if val and isinstance(val[0], dict):
                    lines.append(f"    {key}: {json.dumps(val, ensure_ascii=False)},")
                else:
                    inner = ", ".join(json.dumps(x, ensure_ascii=False) for x in val)
                    lines.append(f"    {key}: [{inner}],")
            elif isinstance(val, dict):
                if not val:
                    lines.append(f"    {key}: {{}},")
                else:
                    inner = ", ".join(
                        f'{k}: {json.dumps(v, ensure_ascii=False)}' for k, v in val.items()
                    )
                    lines.append(f"    {key}: {{ {inner} }},")
            else:
                lines.append(f"    {key}: {json.dumps(str(val), ensure_ascii=False)},")
        lines.append("  }")
        blocks.append("\n".join(lines))

    new_body = ",\n".join(blocks)
    header = text[: m.start()]
    footer = text[m.end() :]
    DATA_JS.write_text(header + prefix + "\n" + new_body + "\n" + suffix + footer, encoding="utf-8")
    with_logo = sum(1 for r in restaurants if r.get("logo"))
    print(f"Patched {len(restaurants)} entries; {with_logo} with logo paths")


if __name__ == "__main__":
    main()