# Licensed under the GNU General Public License v2 or later. See LICENSE.
# Writes the EXIF orientation fixtures of tests/engine/orientation.test.ts.
#
# For each EXIF orientation 1 to 8, Pillow's ImageOps.exif_transpose turns a small grey image upright; the stored and
# upright samples go to orientation-expected.json, so PlotForge's own turn is checked against Pillow's. Two JPEG files
# carry an orientation tag (6, and 8 in a big-endian EXIF block is not offered by Pillow, so the parser's byte order is
# tested with a hand-made block in the test itself).
#
#   python3 -I tests/fixtures/make-orientation-fixtures.py
import json
from pathlib import Path

from PIL import Image, ImageOps

HERE = Path(__file__).parent
WIDTH, HEIGHT = 4, 3
stored = list(range(10, 10 + WIDTH * HEIGHT * 10, 10))  # 10, 20, … 120: every pixel different

cases = []
for orientation in range(1, 9):
    image = Image.new("L", (WIDTH, HEIGHT))
    image.putdata(stored)
    exif = image.getexif()
    exif[0x0112] = orientation
    image.info["exif"] = exif.tobytes()
    upright = ImageOps.exif_transpose(image)
    data = upright.get_flattened_data() if hasattr(upright, "get_flattened_data") else upright.getdata()
    cases.append({"orientation": orientation, "widthPx": upright.width, "heightPx": upright.height, "samples": list(data)})

(HERE / "orientation-expected.json").write_text(json.dumps({"widthPx": WIDTH, "heightPx": HEIGHT, "stored": stored, "cases": cases}, separators=(",", ":")) + "\n")

# A JPEG with orientation 6 (stored 8 × 4, shown 4 × 8), and one without an EXIF block.
jpeg = Image.new("RGB", (8, 4), (200, 30, 30))
exif = jpeg.getexif()
exif[0x0112] = 6
jpeg.save(HERE / "orientation-6.jpg", quality=95, exif=exif.tobytes())
Image.new("RGB", (8, 4), (30, 30, 200)).save(HERE / "orientation-none.jpg", quality=95)
print("Wrote orientation-expected.json (8 orientations by Pillow's exif_transpose), orientation-6.jpg and orientation-none.jpg.")
