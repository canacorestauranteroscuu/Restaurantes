#!/usr/bin/env python3
"""Download, normalize, and record restaurant logos (Notion + web fallback)."""
from __future__ import annotations

import io
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageOps
except ImportError:
    Image = None

LOGO_DIR = Path(os.environ.get("LOGO_DIR", "site/assets/logos"))
SOURCES_JSON = LOGO_DIR / "sources.json"
LOGO_SIZE = int(os.environ.get("LOGO_SIZE", "256"))
USER_AGENT = "CANACO-LogoSync/1.0 (+https://sercanaco.com)"


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFD", name.strip().lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "restaurante"


def load_sources() -> dict:
    if SOURCES_JSON.exists():
        with open(SOURCES_JSON, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_sources(sources: dict) -> None:
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    with open(SOURCES_JSON, "w", encoding="utf-8") as f:
        json.dump(sources, f, ensure_ascii=False, indent=2)
        f.write("\n")
    write_sources_md(sources)


def write_sources_md(sources: dict) -> None:
    lines = [
        "# Fuentes de logos — sercanaco.com",
        "",
        "Generado por `sync.py` / `logo_utils.py`. Revisar entradas `web` antes de producción.",
        "",
        "| Restaurante | Slug | Fuente | Detalle |",
        "|-------------|------|--------|---------|",
    ]
    for name in sorted(sources, key=lambda x: x.casefold()):
        row = sources[name]
        lines.append(
            f"| {name} | `{row.get('slug', '')}` | **{row.get('source', 'initials')}** | {row.get('detail', '')} |"
        )
    counts = {}
    for row in sources.values():
        src = row.get("source", "initials")
        counts[src] = counts.get(src, 0) + 1
    lines.extend(
        [
            "",
            "## Resumen",
            "",
            f"- Notion: {counts.get('notion', 0)}",
            f"- Web: {counts.get('web', 0)}",
            f"- Iniciales (sin imagen): {counts.get('initials', 0)}",
            "",
        ]
    )
    md_path = LOGO_DIR / "SOURCES.md"
    md_path.write_text("\n".join(lines), encoding="utf-8")


NOTION_API_HOST = "api.notion.com"


def notion_only_headers(url: str, notion_headers: dict | None) -> dict | None:
    """Bearer de Notion solo a api.notion.com; nunca a S3, CDN ni sitios web."""
    if not notion_headers:
        return None
    host = urllib.parse.urlparse(url).netloc.lower().split(":", 1)[0]
    if host == NOTION_API_HOST:
        return dict(notion_headers)
    return None


def http_get(url: str, headers: dict | None = None, timeout=20) -> bytes:
    hdrs = {"User-Agent": USER_AGENT}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


class OGParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.og_image = None

    def handle_starttag(self, tag, attrs):
        if tag != "meta":
            return
        ad = dict(attrs)
        prop = (ad.get("property") or ad.get("name") or "").lower()
        if prop in ("og:image", "twitter:image"):
            self.og_image = ad.get("content")


def normalize_candidate_url(url: str | None) -> str | None:
    if not url:
        return None
    url = url.strip()
    if not url:
        return None
    if url.startswith("http"):
        return url
    if url.startswith("www."):
        return "https://" + url
    if url.startswith("facebook.com") or url.startswith("instagram.com"):
        return "https://www." + url
    if "facebook.com" in url or "instagram.com" in url:
        return "https://" + url.lstrip("/")
    if url.startswith("@"):
        return f"https://www.instagram.com/{url[1:]}/"
    if "." in url and " " not in url:
        return "https://" + url
    return None


def find_og_image(page_url: str) -> str | None:
    try:
        html = http_get(page_url, timeout=15).decode("utf-8", errors="ignore")
    except Exception:
        return None
    parser = OGParser()
    try:
        parser.feed(html[:500_000])
    except Exception:
        return None
    return parser.og_image


def web_logo_candidates(web: str | None, social: str | None) -> list[str]:
    urls = []
    for raw in (web, social):
        u = normalize_candidate_url(raw)
        if not u:
            continue
        parsed = urllib.parse.urlparse(u)
        if parsed.netloc:
            domain = parsed.netloc.replace("www.", "")
            urls.append(f"https://logo.clearbit.com/{domain}")
        og = find_og_image(u)
        if og:
            if og.startswith("/"):
                og = urllib.parse.urljoin(u, og)
            urls.append(og)
    out = []
    seen = set()
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def extract_notion_logo_urls(page: dict) -> list[str]:
    urls: list[str] = []
    props = page.get("properties", {})
    logo_prop = props.get("Logo", {})
    for f in logo_prop.get("files", []):
        if f.get("type") == "file" and f.get("file", {}).get("url"):
            urls.append(f["file"]["url"])
        elif f.get("type") == "external" and f.get("external", {}).get("url"):
            urls.append(f["external"]["url"])
    icon = page.get("icon")
    if icon:
        if icon.get("type") == "file" and icon.get("file", {}).get("url"):
            urls.append(icon["file"]["url"])
        elif icon.get("type") == "external" and icon.get("external", {}).get("url"):
            urls.append(icon["external"]["url"])
    return urls


def standardize_logo(raw: bytes) -> bytes:
    if Image is None:
        raise RuntimeError("Pillow is required for logo processing")
    if len(raw) < 200:
        raise ValueError("response too small to be an image")
    if raw[:15].lower().startswith(b"<!doctype") or raw[:5].lower().startswith(b"<html"):
        raise ValueError("response is HTML, not an image")
    im = Image.open(io.BytesIO(raw))
    im = ImageOps.exif_transpose(im)
    im = im.convert("RGBA")

    size = LOGO_SIZE
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    inner = int(size * 0.82)
    thumb = ImageOps.contain(im, (inner, inner), Image.Resampling.LANCZOS)
    x = (size - thumb.width) // 2
    y = (size - thumb.height) // 2
    canvas.paste(thumb, (x, y), thumb)

    # Rounded square mask
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    radius = int(size * 0.14)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    out.paste(canvas, (0, 0), mask)

    buf = io.BytesIO()
    out.convert("RGB").save(buf, format="WEBP", quality=82, method=6)
    return buf.getvalue()


def save_logo(slug: str, raw: bytes) -> Path:
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    data = standardize_logo(raw)
    path = LOGO_DIR / f"{slug}.webp"
    path.write_bytes(data)
    return path


def render_initials_png(name: str) -> bytes:
    if Image is None:
        raise RuntimeError("Pillow required")
    parts = re.findall(r"\w+", name, re.UNICODE)
    letters = "".join(p[0] for p in parts[:2]).upper() or "?"
    size = LOGO_SIZE
    im = Image.new("RGB", (size, size), (245, 240, 234))
    draw = ImageDraw.Draw(im)
    radius = int(size * 0.14)
    draw.rounded_rectangle((4, 4, size - 5, size - 5), radius=radius, outline=(200, 188, 176), width=2)
    # crude text sizing
    font_size = 72 if len(letters) == 1 else 56
    try:
        from PIL import ImageFont

        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), letters, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((size - tw) / 2, (size - th) / 2 - 4), letters, fill=(26, 15, 8), font=font)
    buf = io.BytesIO()
    im.save(buf, format="WEBP", quality=85)
    return buf.getvalue()


def resolve_logo_for_entry(
    name: str,
    page: dict | None,
    web: str | None,
    social: str | None,
    notion_headers: dict | None = None,
) -> tuple[str | None, dict]:
    """Returns (public logo path or None, source record)."""
    slug = slugify(name)
    sources = load_sources()
    detail = ""
    hdrs = notion_headers or {}

    for url in extract_notion_logo_urls(page or {}):
        if url.lower().split("?")[0].endswith(".pdf"):
            detail = "Logo en Notion es PDF (omitido)"
            continue
        try:
            raw = http_get(url, headers=notion_only_headers(url, hdrs))
            save_logo(slug, raw)
            record = {
                "slug": slug,
                "source": "notion",
                "detail": url.split("?")[0][:120],
            }
            sources[name] = record
            save_sources(sources)
            return f"/assets/logos/{slug}.webp", record
        except Exception as e:
            detail = f"Notion download failed: {e}"
            print(f"  ⚠️  Notion logo {name}: {e}", file=sys.stderr)

    for url in web_logo_candidates(web, social):
        try:
            raw = http_get(url)
            if len(raw) < 500:
                continue
            save_logo(slug, raw)
            record = {"slug": slug, "source": "web", "detail": url}
            sources[name] = record
            save_sources(sources)
            return f"/assets/logos/{slug}.webp", record
        except Exception as e:
            detail = f"Web failed ({url}): {e}"
            continue

    record = {"slug": slug, "source": "initials", "detail": detail or "Sin logo en Notion ni web"}
    sources[name] = record
    save_sources(sources)
    return None, record