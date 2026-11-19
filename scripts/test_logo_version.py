#!/usr/bin/env python3
"""?v= por contenido, carpeta manual intocable, y SKIP_LOGOS conserva la URL."""
import hashlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("NOTION_TOKEN", "test")
os.environ.setdefault("GOOGLE_API_KEY", "test")

import logo_utils  # noqa: E402
import sync  # noqa: E402

try:
    from PIL import Image, ImageDraw
except ImportError:
    Image = ImageDraw = None


def tiny_png():
    im = Image.new("RGB", (80, 80), (255, 255, 255))
    ImageDraw.Draw(im).rectangle((20, 30, 60, 50), fill=(180, 20, 20))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


@unittest.skipIf(Image is None, "Pillow not installed")
class VersionAndManualTest(unittest.TestCase):
    def test_hash_y_manual_no_se_reescribe(self):
        with tempfile.TemporaryDirectory() as raw:
            tmp = Path(raw)
            manual = tmp / "manual"
            manual.mkdir()
            akari = manual / "akari.webp"
            akari.write_bytes(b"badge-negro-akari-no-invertir-xxxx")
            yakiyang = manual / "yakiyang.webp"
            yakiyang.write_bytes(b"wordmark-yakiyang")
            self.assertFalse((manual / "yaki-yang.webp").exists())

            logo_utils.LOGO_DIR = tmp
            logo_utils.SOURCES_JSON = tmp / "sources.json"
            url, record = logo_utils.resolve_logo_for_entry("Akari", None, "www.akari.com.mx", None)
            digest = hashlib.sha256(akari.read_bytes()).hexdigest()[:8]
            self.assertEqual(url, f"/assets/logos/manual/akari.webp?v={digest}")
            self.assertEqual(record["source"], "manual")
            self.assertEqual(akari.read_bytes(), b"badge-negro-akari-no-invertir-xxxx")

            yaki_url, _ = logo_utils.resolve_logo_for_entry("Yakiyang", None, None, None)
            self.assertIn("/assets/logos/manual/yakiyang.webp?v=", yaki_url)
            self.assertNotIn("yaki-yang", yaki_url)

            logo_utils.save_logo("otro", tiny_png())
            self.assertTrue((tmp / "otro.webp").is_file())
            self.assertFalse((manual / "otro.webp").exists())
            self.assertEqual(akari.read_bytes(), b"badge-negro-akari-no-invertir-xxxx")
            with self.assertRaises(ValueError):
                logo_utils.save_logo("manual", tiny_png())
            with self.assertRaises(ValueError):
                logo_utils.save_logo("manual/akari", tiny_png())

    def test_akari_es_placa_oscura(self):
        im = Image.open(ROOT / "site/assets/logos/manual/akari.webp").convert("RGB")
        raw = im.tobytes()
        dark = sum(1 for i in range(0, len(raw), 3) if raw[i] + raw[i + 1] + raw[i + 2] < 90)
        self.assertGreater(dark / (im.size[0] * im.size[1]), 0.15)


class SkipLogosTest(unittest.TestCase):
    def test_conserva_la_url_y_el_null(self):
        with tempfile.TemporaryDirectory() as raw:
            path = Path(raw) / "restaurants-data.js"
            path.write_text(
                """
const restaurants = [
  {
    name: "Akari",
    logo: "/assets/logos/manual/akari.webp?v=abcd1234",
  },
  {
    name: "Foo",
    logo: null,
  },
];
""",
                encoding="utf-8",
            )
            logos = sync.load_existing_logos(path)
        self.assertEqual(logos["Akari"], "/assets/logos/manual/akari.webp?v=abcd1234")
        self.assertIsNone(logos["Foo"])
        source = (ROOT / "sync.py").read_text(encoding="utf-8")
        self.assertIn('notion_data["logo"] = existing_logos.get(notion_data["name"])', source)
        self.assertNotIn('notion_data["logo"] = None', source)


if __name__ == "__main__":
    unittest.main()
