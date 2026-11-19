#!/usr/bin/env python3
"""Write Notion get-file-download-urls JSON from stdin to a batch file."""
import json
import sys
from pathlib import Path

def main() -> None:
    dest = Path(sys.argv[1])
    raw = sys.stdin.read()
    data = json.loads(raw)
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(data.get('files', []))} files → {dest}")

if __name__ == "__main__":
    main()