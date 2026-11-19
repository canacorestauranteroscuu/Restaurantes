#!/usr/bin/env python3
"""Build _download_urls_batch2b.json from _refs_b2b.json + per-file signatures (same batch token as batch1)."""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
SPACE = "bd060faf-8c9c-40cc-b1ec-b55094164199"

# Signatures from Notion get-file-download-urls batch @ 20261119T053546Z
SIGS = {
    "777e6312-6d3c-46e4-8259-6d3d9598366d/sello.png": "4bbb6313a82e465d49626d68ca6aeb2bf7e03ecf0f0c2e16c33794a8e668073b",
    "4cbf28cb-1cc4-4a85-bb94-8b7b521fef27/00be11cd-d73f-41a9-8850-ba45a934a52a.jpeg": "6e52ae5e4225a06ab384bbc23c0c2320d795fc019834793d51816cba8e60d6e7",
    "3cdc2597-243a-4c49-932e-2c90a0077aca/Screenshot_2025-04-26-13-14-28-32_99c04817c0de5652397fc8b56c3b3817.jpg": "477b0453feac53964124e9ac78070a7f7d946bd7015c423d8dad9e80bd05fc6c",
    "559b038a-fa05-4aff-924c-15641dd08d63/LOGO_TARIMA_NUEVO.jpeg": "00f86cddc6c04e8fb3e4c6efb914f087902718cca5c907586470d92532f03d59",
    "8e28e7e7-efe7-4d7b-9b56-10a2abd0d276/PHOTO-2025-04-09-10-40-58.jpg": "36c9f5128477dc2ba514e705be6611ab78a021c8a7295a0b4d3689e2d8688843",
    "074fc26a-e2e0-4e7c-8b38-c5726772bd6c/pinos.png": "d0b4149e896db453be9239547c11f6817caa3326f66a30de2042708311d7abb2",
    "369b5bda-9b3a-428c-b940-ddca50de1cc0/logo_ACTUAL_de_la_24.2020.png": "03490cf6fe0b32a7deea7a10c1b1efbf034b4db972457d9e0eaf232d056965ed",
    "622e46a8-8c9b-4465-8827-1b1874bd5da2/natural-balance-logo-GREEN-no-background_-_Louie_Elizondo.png": "d7fc506cb5299a872848f75c6ac18d0f855cf62ea0ef03efb646ae03a01470fe",
}

QUERY = (
    "X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD"
    "&X-Amz-Credential=ASIAZI2LB466ZAGAG56I%2F20261119%2Fus-west-2%2Fs3%2Faws4_request"
    "&X-Amz-Date=20261119T053546Z&X-Amz-Expires=300"
    "&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEEUaCXVzLXdlc3QtMiJHMEUCIQDips5w3BBUfE%2F9fqyEi5c6yhtL8rZqGKv7BDleZEHGGgIgXMag3jiNE6jss1eZXRvvwuBZJwEj%2FIk58fZ70AJGs6cq%2FwMIDhAAGgw2Mzc0MjMxODM4MDUiDAPnhCGHA66%2BLYBU3SrcA%2FQe9h69UwrSJatrPzBauyp40amnotFDEjzdw2TQU8%2BuPBUlBt613jORJ5AKnHdKioWGDVNW5VZA7l7baMHtvMrqEMfhHlssrYeO2BF6ho0i1%2FL42cwUmv85a8SgKEaBVBFZeT1DXIAVRfZzoAekJiyV8Zsd7j1qRzO0nCjXIBxbMJl%2Fizc6Vh05OWHpE%2BB1KCa9N35kCMK%2FETlkBT4Z7RFt6S%2B%2BcJBMi1TqfjWWI4nMk%2BfoIRH7Gga2IJGYdZ4raaVaedbfehRsVDY28YwvvL%2FEWYjdtdSDHPU4OQm3HCN6Ncell4KJdkp5YRJ3lmKtLmZxww7Clg%2BszCF7VJkhtwfnOboJcfFpstBsPmcqLwQOCfdJYGq3nxIf%2BPx2u01%2BKoCQ6GzcXXyZ3TbYmxxPEwdrKlMaBJGKGl5OvGR2BG5lmLfMuvrhPWolBx6BNOHDCUVQOL7HZE1kFCZr8bHEL0WOFmzpuzNFdrIJg%2F2RYABOrWSE%2Fgjgn4hg7LmFCh3pjt0EJrkTAT7MsH0eifeTgY17I%2F8ih8qCguu4RzyDFZPHBCkMecsjTPI6osj6eKuG33m0g9TGN2VD%2BekiReiNR5NwQ%2Fe8mU9fBDziYKab8NwAa%2BupRaHbUcPzqgSmMIKL%2BtcGOqUBUWhBHIaWRYGzf4h3EkBLN82MnJPSEnyAMXF2GXps8%2Bm5kUPRa2VjgIbI%2BDFVa%2Fv2MxTIrsvP53e4oltaK4yVkF%2Fmp5bK0lvFHLOWTOTqFzwPNptLKXQF1%2F2s1W6%2BwPqQ9Ss2TxGWS71Ir15udD%2BWhgDMak5eEU%2FV8cM9jGF3nmTzeS%2BxDfzFSrfPQS7pzJV0DpTLjfAgyLOJKvScT7OGxYxO5lkX"
    "&X-Amz-Signature={sig}&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject"
)


def ref_to_object_key(ref: str) -> str:
    m = re.search(r"/([^/]+)\?space_id=", ref)
    if not m:
        raise ValueError(f"bad ref: {ref}")
    file_id = m.group(1)
    name_m = re.search(r"name=([^&]+)", ref)
    name = name_m.group(1) if name_m else "file"
    return f"{file_id}/{name}"


def main() -> None:
    refs = json.loads((ROOT / "_refs_b2b.json").read_text(encoding="utf-8"))
    files = []
    for ref in refs:
        obj = ref_to_object_key(ref)
        sig = SIGS.get(obj)
        if not sig:
            raise SystemExit(f"no signature for {obj}")
        path = f"https://prod-files-secure.s3.us-west-2.amazonaws.com/{SPACE}/{quote(obj, safe='/')}"
        url = f"{path}?{QUERY.format(sig=sig)}"
        files.append({"reference": ref, "url": url, "expiry_time": "2026-11-19T05:40:46.962Z"})
    out = {"files": files, "unresolved": []}
    (ROOT / "_download_urls_batch2b.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote batch2b with {len(files)} files")


if __name__ == "__main__":
    main()