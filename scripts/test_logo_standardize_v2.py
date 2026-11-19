#!/usr/bin/env python3
"""standardize_logo v2: fondo blanco o placa redondeada (pase Muriel #3)."""
import io
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import logo_utils as L  # noqa: E402

try:
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:
    np = Image = ImageDraw = None


def png(im):
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def out(im):
    return np.asarray(Image.open(io.BytesIO(L.standardize_logo(png(im)))).convert("RGB"), dtype=float)


@unittest.skipIf(Image is None or np is None, "Pillow y numpy hacen falta")
class V2(unittest.TestCase):
    def test_tamano_y_relleno(self):
        im = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
        ImageDraw.Draw(im).rectangle((100, 130, 200, 170), fill=(200, 30, 30, 255))
        image = out(im)
        self.assertEqual(image.shape[:2], (512, 512))
        ink = np.nonzero((np.abs(image - 255).sum(-1) > 60).any(0))[0]
        self.assertGreater((ink.max() - ink.min()) / 512, 0.9)
        self.assertTrue((image[0:5] > 250).all())

    def test_cuadro_negro_se_vuelve_blanco(self):
        im = Image.new("RGB", (300, 300), (5, 5, 5))
        ImageDraw.Draw(im).ellipse((60, 60, 240, 240), fill=(220, 40, 40))
        image = out(im)
        self.assertTrue((image[2, 2] > 245).all())
        self.assertLess(image[256, 256][1], 90)

    def test_logo_claro_sobre_oscuro_queda_placa(self):
        im = Image.new("RGB", (300, 200), (10, 10, 10))
        ImageDraw.Draw(im).rectangle((60, 60, 240, 140), fill=(255, 255, 255))
        image = out(im)
        self.assertTrue((image[256, 30] < 40).all())
        self.assertTrue((image[2, 2] > 245).all())

    def test_papel_crema_a_blanco(self):
        im = Image.new("RGB", (300, 300), (240, 236, 225))
        ImageDraw.Draw(im).rectangle((80, 80, 220, 220), fill=(20, 80, 40))
        image = out(im)
        self.assertTrue((image[3, 256] > 250).all())


if __name__ == "__main__":
    unittest.main()
