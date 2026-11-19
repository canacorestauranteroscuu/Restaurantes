#!/usr/bin/env python3
"""Download, normalize, and record restaurant logos (Notion + web fallback)."""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from html.parser import HTMLParser
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter, ImageOps
except ImportError:
    Image = ImageDraw = ImageFilter = ImageOps = None
    np = None

LOGO_DIR = Path(os.environ.get("LOGO_DIR", "site/assets/logos"))
SOURCES_JSON = LOGO_DIR / "sources.json"
LOGO_SIZE = int(os.environ.get("LOGO_SIZE", "512"))
LOGO_MARGIN = 0.03
MANUAL_DIRNAME = "manual"  # site/assets/logos/manual/<slug>.webp — el sync nunca escribe aquí
USER_AGENT = "CANACO-LogoSync/1.0 (+https://sercanaco.com)"
WHITE = np.array([255.0, 255.0, 255.0]) if np is not None else None


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


def _flatten_white(im: Image.Image) -> np.ndarray:
    """RGBA/P/LA → RGB float sobre blanco (la transparencia se vuelve blanco)."""
    im = ImageOps.exif_transpose(im).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    return np.asarray(bg.convert("RGB"), dtype=np.float32)


def _dist(a: np.ndarray, c) -> np.ndarray:
    return np.sqrt(((a - np.asarray(c, dtype=np.float32)) ** 2).sum(-1))


def _edge_background(rgb: np.ndarray):
    """Fondo sólido del borde, o None."""
    edge = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    nonwhite = edge[_dist(edge, WHITE) > 40]
    if len(nonwhite) >= 0.5 * len(edge):
        med = np.median(nonwhite, axis=0)
        if (_dist(nonwhite, med) < 30).mean() >= 0.85:
            return med
        return None
    med = np.median(edge, axis=0)
    if (_dist(edge, med) < 30).mean() >= 0.85 and 6 < _dist(med[None], WHITE)[0] <= 40:
        return med
    return None


def _flood_from_edges(close: np.ndarray) -> np.ndarray:
    """Máscara de píxeles conectados al borde (BFS 4-vecinos)."""
    h, w = close.shape
    seen = np.zeros_like(close, dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen


def _key_to_white(rgb: np.ndarray, bg, tol_in=36.0, tol_out=110.0) -> np.ndarray:
    d = _dist(rgb, bg)
    region = _flood_from_edges(d < tol_out)
    a = np.clip((d - tol_in) / (tol_out - tol_in), 0, 1)
    a[~region] = 1.0
    a = np.asarray(
        Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)),
        dtype=np.float32,
    )[..., None] / 255.0
    safe = np.maximum(a, 1e-3)
    fg = np.clip((rgb - (1 - safe) * np.asarray(bg)) / safe, 0, 255)
    return fg * a + WHITE * (1 - a)


def _mark_is_light(rgb: np.ndarray, bg) -> bool:
    fgmask = _dist(rgb, bg) >= 60
    if fgmask.mean() < 0.01:
        return True
    lum = rgb[fgmask] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    return (lum > 200).mean() > 0.35


def _badge(rgb: np.ndarray, radius=0.12) -> np.ndarray:
    h, w, _ = rgb.shape
    m = Image.new("L", (w * 4, h * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        (0, 0, w * 4 - 1, h * 4 - 1),
        radius=int(min(w, h) * 4 * radius),
        fill=255,
    )
    a = np.asarray(m.resize((w, h), Image.Resampling.LANCZOS), dtype=np.float32)[..., None] / 255.0
    return rgb * a + WHITE * (1 - a)


def _content_bbox(rgb: np.ndarray, tol=28.0):
    ink = _dist(rgb, WHITE) > tol
    ys, xs = np.nonzero(ink)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _finish(rgb: np.ndarray, size=LOGO_SIZE, margin=LOGO_MARGIN) -> bytes:
    box = _content_bbox(rgb)
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    if box:
        im = im.crop(box)
    inner = int(round(size * (1 - 2 * margin)))
    scale = inner / max(im.width, im.height)
    im = ImageOps.contain(im, (inner, inner), Image.Resampling.LANCZOS)
    if scale > 1.2:
        im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    buf = io.BytesIO()
    canvas.save(buf, format="WEBP", quality=90, method=6)
    return buf.getvalue()


def standardize_logo(raw: bytes) -> bytes:
    """Transparencia a blanco, fondo sólido a blanco o placa redondeada, 512 px."""
    if Image is None or np is None:
        raise RuntimeError("Pillow y numpy hacen falta para procesar logos")
    if len(raw) < 200:
        raise ValueError("response too small to be an image")
    head = raw[:15].lower()
    if head.startswith(b"<!doctype") or head.startswith(b"<html"):
        raise ValueError("response is HTML, not an image")
    rgb = _flatten_white(Image.open(io.BytesIO(raw)))
    box = _content_bbox(rgb)
    if box:
        rgb = rgb[box[1]:box[3], box[0]:box[2]]
    bg = _edge_background(rgb)
    if bg is not None:
        if _dist(bg[None], WHITE)[0] <= 40:
            rgb = _key_to_white(rgb, bg, tol_in=22, tol_out=55)
        elif _mark_is_light(rgb, bg):
            rgb = _badge(rgb)
        else:
            rgb = _key_to_white(rgb, bg)
    return _finish(rgb)


def manual_logo(slug: str, logo_dir=None):
    """El archivo en manual/ gana. El sync no lo escribe."""
    root = Path(logo_dir) if logo_dir is not None else LOGO_DIR
    path = root / MANUAL_DIRNAME / f"{slug}.webp"
    return path if path.is_file() else None


def versioned(public_path: str, file_path) -> str:
    """Agrega ?v=<sha256 de 8> para que la caché immutable no sirva el archivo viejo."""
    digest = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()[:8]
    return f"{public_path}?v={digest}"


def save_logo(slug: str, raw: bytes) -> Path:
    if not slug or slug in {".", "..", MANUAL_DIRNAME} or "/" in slug or "\\" in slug:
        raise ValueError("el sync no escribe en logos/manual")
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    path = (LOGO_DIR / f"{slug}.webp").resolve()
    manual = (LOGO_DIR / MANUAL_DIRNAME).resolve()
    if path == manual or manual in path.parents:
        raise ValueError("el sync no escribe en logos/manual")
    data = standardize_logo(raw)
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

    manual = manual_logo(slug, LOGO_DIR)
    if manual:
        record = {"slug": slug, "source": "manual", "detail": str(manual)}
        sources[name] = record
        save_sources(sources)
        return versioned(f"/assets/logos/{MANUAL_DIRNAME}/{slug}.webp", manual), record

    for url in extract_notion_logo_urls(page or {}):
        if url.lower().split("?")[0].endswith(".pdf"):
            detail = "Logo en Notion es PDF (omitido)"
            continue
        try:
            raw = http_get(url, headers=notion_only_headers(url, hdrs))
            path = save_logo(slug, raw)
            record = {
                "slug": slug,
                "source": "notion",
                "detail": url.split("?")[0][:120],
            }
            sources[name] = record
            save_sources(sources)
            return versioned(f"/assets/logos/{slug}.webp", path), record
        except Exception as e:
            detail = f"Notion download failed: {e}"
            print(f"  ⚠️  Notion logo {name}: {e}", file=sys.stderr)

    for url in web_logo_candidates(web, social):
        try:
            raw = http_get(url)
            if len(raw) < 500:
                continue
            path = save_logo(slug, raw)
            record = {"slug": slug, "source": "web", "detail": url}
            sources[name] = record
            save_sources(sources)
            return versioned(f"/assets/logos/{slug}.webp", path), record
        except Exception as e:
            detail = f"Web failed ({url}): {e}"
            continue

    record = {"slug": slug, "source": "initials", "detail": detail or "Sin logo en Notion ni web"}
    sources[name] = record
    save_sources(sources)
    return None, record