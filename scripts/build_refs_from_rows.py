#!/usr/bin/env python3
"""Build notion-file-block references + restaurant names from Pagado rows."""
from __future__ import annotations

import json
import urllib.parse
from pathlib import Path

ROWS = Path(__file__).resolve().parent / "_pagado_rows.json"
OUT = Path(__file__).resolve().parent / "_logo_refs.json"


def plain_title(value: str) -> str:
    value = (value or "").strip()
    if value.startswith("[") and "](" in value:
        import re

        m = re.match(r"^\[([^\]]+)\]\([^)]+\)\s*$", value)
        if m:
            return m.group(1).strip()
    return value.strip()


def logo_ref_from_row(logo_field: str) -> str | None:
    logos = json.loads(logo_field)
    if not logos:
        return None
    item = logos[0]
    if not item.startswith("file://"):
        return None
    obj = json.loads(urllib.parse.unquote(item[7:]))
    source = obj.get("source", "")
    if not source.startswith("attachment:"):
        return None
    _, file_id, filename = source.split(":", 2)
    perm = obj.get("permissionRecord") or {}
    block_id = perm.get("id")
    space_id = perm.get("spaceId")
    if not (block_id and space_id and file_id):
        return None
    name_q = urllib.parse.quote(filename)
    return f"notion-file-block://{block_id}/{file_id}?space_id={space_id}&name={name_q}"


def main() -> None:
    data = json.loads(ROWS.read_text(encoding="utf-8"))
    rows = data.get("results", data)
    refs: list[dict[str, str]] = []
    for row in rows:
        logo = row.get("Logo")
        if not logo or logo in ("null", "[]"):
            continue
        ref = logo_ref_from_row(logo)
        name = plain_title(row.get("Nombre Restaurante") or "")
        if ref and name:
            refs.append({"name": name, "reference": ref})
    OUT.write_text(json.dumps(refs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(refs)} logo references → {OUT}")


if __name__ == "__main__":
    main()