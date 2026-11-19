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

    def test_hueco_de_letra_pasa_a_blanco_y_el_relleno_no(self):
        bg = (20, 60, 170)
        im = Image.new("RGB", (300, 300), bg)
        draw = ImageDraw.Draw(im)
        draw.ellipse((40, 40, 260, 260), fill=(210, 30, 40))
        draw.ellipse((110, 110, 190, 190), fill=bg)
        image = out(im)
        self.assertTrue((image[256, 256] > 245).all())
        ring = image[256, 150]
        self.assertGreater(ring[0], 160)
        self.assertLess(ring[2], 80)

        marked = Image.new("RGB", (300, 300), bg)
        draw = ImageDraw.Draw(marked)
        draw.ellipse((40, 40, 260, 260), fill=(210, 30, 40))
        draw.ellipse((110, 110, 190, 190), fill=(240, 210, 40))
        kept = out(marked)
        center = kept[256, 256]
        self.assertGreater(center[0], 180)
        self.assertGreater(center[1], 150)
        self.assertLess(center[2], 80)

        # Cerca del fondo (dentro de tol_out) pero no es el color de fondo:
        # no se come. Solo entra lo que coincide con el fondo (≤ tol_in).
        close = Image.new("RGB", (300, 300), bg)
        draw = ImageDraw.Draw(close)
        draw.ellipse((40, 40, 260, 260), fill=(210, 30, 40))
        draw.ellipse((110, 110, 190, 190), fill=(90, 60, 170))
        near = out(close)
        mid = near[256, 256]
        self.assertGreater(mid[0], 70)
        self.assertLess(mid[2], 200)
        self.assertLess(abs(mid[0] - mid[2]), 120)

    def test_papel_crema_a_blanco(self):
        im = Image.new("RGB", (300, 300), (240, 236, 225))
        ImageDraw.Draw(im).rectangle((80, 80, 220, 220), fill=(20, 80, 40))
        image = out(im)
        self.assertTrue((image[3, 256] > 250).all())


if __name__ == "__main__":
    unittest.main()
