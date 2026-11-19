#!/usr/bin/env python3
"""standardize_logo: recorte al contenido y buen ratio de relleno (pase Muriel #2)."""
import io
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import logo_utils  # noqa: E402

try:
    from PIL import Image, ImageDraw
except ImportError:
    Image = ImageDraw = None


@unittest.skipIf(Image is None, "Pillow not installed")
class ContentBboxTest(unittest.TestCase):
    def test_dark_logo_on_transparent_alpha_bbox(self):
        size = 240
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(im)
        draw.rectangle((70, 90, 170, 150), fill=(12, 18, 28, 255))
        box = logo_utils._content_bbox(im)
        self.assertIsNotNone(box)
        w, h = box[2] - box[0], box[3] - box[1]
        self.assertLess(w, size * 0.7)
        self.assertLess(h, size * 0.5)
        out = logo_utils.standardize_logo(self._png_bytes(im))
        out_im = Image.open(io.BytesIO(out)).convert("RGBA")
        obox = logo_utils._content_bbox(out_im)
        self.assertIsNotNone(obox)
        self.assertGreater(obox[2] - obox[0], logo_utils.LOGO_SIZE * 0.35)

    @staticmethod
    def _png_bytes(im):
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        return buf.getvalue()


@unittest.skipIf(Image is None, "Pillow not installed")
class StandardizeLogoTest(unittest.TestCase):
    def test_output_size_and_fill_ratio(self):
        size = 320
        im = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        draw = ImageDraw.Draw(im)
        draw.rectangle((80, 100, 240, 220), fill=(200, 40, 40, 255))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        out = logo_utils.standardize_logo(buf.getvalue())
        out_im = Image.open(io.BytesIO(out)).convert("RGBA")
        self.assertEqual(out_im.size, (logo_utils.LOGO_SIZE, logo_utils.LOGO_SIZE))
        box = logo_utils._content_bbox(out_im)
        self.assertIsNotNone(box)
        cw, ch = box[2] - box[0], box[3] - box[1]
        fill = max(cw, ch) / logo_utils.LOGO_SIZE
        self.assertGreater(fill, 0.55, f"logo content too small after normalize: {fill:.2f}")
        self.assertLess(fill, 0.98)

    def test_crops_padding_before_margin(self):
        """Logo with huge white border should shrink to content, not stay tiny in center."""
        im = Image.new("RGBA", (400, 400), (255, 255, 255, 255))
        draw = ImageDraw.Draw(im)
        draw.rectangle((175, 175, 225, 225), fill=(0, 80, 160, 255))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        out = logo_utils.standardize_logo(buf.getvalue())
        out_im = Image.open(io.BytesIO(out)).convert("RGBA")
        box = logo_utils._content_bbox(out_im)
        self.assertIsNotNone(box)
        cw, ch = box[2] - box[0], box[3] - box[1]
        self.assertGreater(cw, logo_utils.LOGO_SIZE * 0.35)


if __name__ == "__main__":
    unittest.main()