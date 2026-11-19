#!/usr/bin/env python3
"""Build notion_logo_urls.json from Notion fetch response JSON (one page per file or array)."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


def plain_title(value: str) -> str:
    value = value.strip()
    m = re.match(r"^\[([^\]]+)\]\([^)]+\)\s*$", value)
    if m:
        return m.group(1).strip()
    return value.strip()


def extract_from_fetch_payload(payload: dict) -> tuple[str, str] | None:
    text = payload.get("text") or ""
    m = re.search(r"<properties>\s*(\{.*\})\s*</properties>", text, re.DOTALL)
    if not m:
        return None
    raw = m.group(1)
    props = json.loads(raw)
    name = plain_title(props.get("Nombre Restaurante") or "")
    if not name:
        return None
    logos = props.get("Logo") or []
    if not logos:
        return None
    url = logos[0]
    if "#notion_record=" in url:
        url = url.split("#notion_record=")[0]
    if not url.startswith("https://prod-files-secure.s3"):
        # first https in Logo array
        for item in logos:
            if isinstance(item, str) and "prod-files-secure.s3" in item:
                url = item.split("#notion_record=")[0]
                break
        else:
            return None
    return name, url


def main(argv: list[str]) -> None:
    out = Path(__file__).resolve().parent / "notion_logo_urls.json"
    mapping: dict = {}
    if out.exists():
        mapping = json.loads(out.read_text(encoding="utf-8"))

    for path_str in argv:
        path = Path(path_str)
        if path.suffix == ".jsonl":
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                pair = extract_from_fetch_payload(json.loads(line))
                if pair:
                    mapping[pair[0]] = {"url": pair[1]}
        else:
            data = json.loads(path.read_text(encoding="utf-8"))
            items = data if isinstance(data, list) else [data]
            for item in items:
                pair = extract_from_fetch_payload(item)
                if pair:
                    mapping[pair[0]] = {"url": pair[1]}

    out.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(mapping)} entries → {out}")


if __name__ == "__main__":
    main(sys.argv[1:])