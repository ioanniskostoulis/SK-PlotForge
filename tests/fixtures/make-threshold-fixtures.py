# Licensed under the GNU General Public License v2 or later. See LICENSE.
# Writes the bimodal threshold fixtures of tests/engine/threshold.test.ts and their reference thresholds.
#
# The references are computed here from each method's definition, on the pixels, with NumPy: Otsu by trying every t
# and keeping the largest between-class variance w0 · w1 · (μ0 − μ1)² (the smallest t on a tie); Mean as ⌊mean⌋; Li by
# its iteration t ← (μb − μf) / (ln μb − ln μf) from the mean until t moves less than 0.5, then ⌊t⌋. PlotForge computes
# the same from cumulative histogram sums, so agreement checks one method against the other.
#
#   python3 -I tests/fixtures/make-threshold-fixtures.py
import json
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
rng = np.random.default_rng(20261107)


def otsu(values):
    values = values.astype(np.float64)
    best, best_t = -1.0, 0
    for t in range(int(values.min()), int(values.max())):
        background, objects = values[values <= t], values[values > t]
        if not len(background) or not len(objects):
            continue
        w0, w1 = len(background) / len(values), len(objects) / len(values)
        between = w0 * w1 * (background.mean() - objects.mean()) ** 2
        if between > best:
            best, best_t = between, t
    return best_t


def li(values):
    values = values.astype(np.float64)
    t = values.mean()
    for _ in range(1000):
        background, objects = values[values <= t], values[values > t]
        mb, mf = background.mean(), objects.mean()
        following = 0.0 if mb == 0 else (mb - mf) / (np.log(mb) - np.log(mf))
        moved = abs(following - t)
        t = following
        if moved < 0.5:
            break
    return int(np.floor(t))


def bimodal(width, height, dark, light, spread, share, top):
    """Two Gaussian populations: `share` of the pixels around `light`, the rest around `dark`, clipped to 0..top."""
    n = width * height
    light_pixels = rng.random(n) < share
    values = np.where(light_pixels, rng.normal(light, spread, n), rng.normal(dark, spread, n))
    return np.clip(np.rint(values), 0, top).reshape(height, width)


cases = []
for name, values, mode in [
    ("threshold-bimodal8.png", bimodal(64, 48, 60, 170, 18, 0.35, 255).astype(np.uint8), "L"),
    ("threshold-bimodal16.png", bimodal(40, 30, 9000, 41000, 4500, 0.6, 65535).astype(np.uint16), "I;16"),
    ("threshold-skewed8.png", bimodal(50, 40, 20, 90, 12, 0.1, 255).astype(np.uint8), "L"),
]:
    Image.fromarray(values, mode=mode).save(HERE / name)
    flat = values.ravel()
    cases.append({
        "name": name, "otsu": otsu(flat), "mean": int(np.floor(flat.astype(np.float64).mean())), "li": li(flat),
        "count_above_otsu": int((flat > otsu(flat)).sum()), "pixels": int(flat.size),
    })
(HERE / "threshold-expected.json").write_text(json.dumps(cases, indent=1) + "\n")
for case in cases:
    print(f"{case['name']:28} otsu {case['otsu']:6}  mean {case['mean']:6}  li {case['li']:6}")
