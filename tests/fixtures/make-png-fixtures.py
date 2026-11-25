# Licensed under the GNU General Public License v2 or later. See LICENSE.
# Writes the PNG fixtures of tests/engine/raster.test.ts and their expected samples (png-expected.json).
#
# The PNG files are written by this script's own small encoder, so that every filter type (rows cycle through None,
# Sub, Up, Average and Paeth), every bit depth, Adam7 interlacing and transparency chunks are covered, which Pillow's
# writer does not offer. Pillow then reads each file back where its modes allow, and the script stops if Pillow sees
# other samples than were encoded: the encoder is checked against an independent decoder before the files are used.
#
#   python3 tests/fixtures/make-png-fixtures.py
import json
import random
import struct
import zlib
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
random.seed(20261107)

# MARK: encoder

COLOUR_TYPE = {"grey": 0, "rgb": 2, "palette": 3, "grey-alpha": 4, "rgba": 6}
CHANNELS = {"grey": 1, "rgb": 3, "palette": 1, "grey-alpha": 2, "rgba": 4}
# Adam7: start x, start y, step x, step y of the seven passes.
ADAM7 = [(0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def pack_row(samples, depth):
    """One row of samples at the given depth, most significant bit first, 16-bit big-endian."""
    if depth == 16:
        return b"".join(struct.pack(">H", s) for s in samples)
    if depth == 8:
        return bytes(samples)
    out, acc, bits = bytearray(), 0, 0
    for s in samples:
        acc = (acc << depth) | s
        bits += depth
        if bits == 8:
            out.append(acc)
            acc, bits = 0, 0
    if bits:
        out.append(acc << (8 - bits))
    return bytes(out)


def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c


def filter_rows(rows, bpp):
    """Filter each row with type (row number mod 5), as a writer may choose a different filter per row."""
    out, prior = bytearray(), bytes(len(rows[0])) if rows else b""
    for n, raw in enumerate(rows):
        kind = n % 5
        line = bytearray()
        for i, x in enumerate(raw):
            a = raw[i - bpp] if i >= bpp else 0
            b = prior[i]
            c = prior[i - bpp] if i >= bpp else 0
            predictor = [0, a, b, (a + b) // 2, paeth(a, b, c)][kind]
            line.append((x - predictor) & 0xFF)
        out.append(kind)
        out += line
        prior = raw
    return bytes(out)


def encode(width, height, colour, depth, pixels, interlace=False, palette=None, trns=None):
    """pixels: rows of pixels, each pixel a tuple of samples (palette: index)."""
    channels = CHANNELS[colour]
    bpp = max(1, (channels * depth + 7) // 8)
    data = bytearray()
    passes = ADAM7 if interlace else [(0, 0, 1, 1)]
    for x0, y0, dx, dy in passes:
        xs = range(x0, width, dx)
        ys = range(y0, height, dy)
        if not len(xs) or not len(ys):
            continue
        rows = [pack_row([s for x in xs for s in pixels[y][x]], depth) for y in ys]
        data += filter_rows(rows, bpp)
    ihdr = struct.pack(">IIBBBBB", width, height, depth, COLOUR_TYPE[colour], 0, 0, 1 if interlace else 0)
    body = chunk(b"IHDR", ihdr)
    if palette:
        body += chunk(b"PLTE", bytes(v for rgb in palette for v in rgb))
    if trns is not None:
        body += chunk(b"tRNS", trns)
    # The image data is split over two IDAT chunks, which a reader joins.
    z = zlib.compress(bytes(data), 9)
    half = len(z) // 2
    body += chunk(b"IDAT", z[:half]) + chunk(b"IDAT", z[half:]) + chunk(b"IEND", b"")
    return b"\x89PNG\r\n\x1a\n" + body


# MARK: the expected working image

def to_raster(colour, depth, pixels, palette=None, trns_key=None, trns_alpha=None):
    """The working image PlotForge should make: grey or RGB, 8 or 16 bits, alpha composited on white.

    Depths below 8 are scaled to 8 bits (v * 255 / max, exact for 1, 2 and 4 bits). The composite of a sample v with
    alpha a on white, both at the image's depth with maximum M, is round((v * a + M * (M - a)) / M).
    """
    out_depth = 16 if depth == 16 else 8
    M = (1 << out_depth) - 1
    scale = 255 // ((1 << depth) - 1) if depth < 8 else 1
    over_white = lambda v, a: (v * a + M * (M - a) + M // 2) // M  # round half up, as Math.round does for positives
    samples, channels = [], 3 if colour in ("rgb", "rgba", "palette") else 1
    for row in pixels:
        for p in row:
            if colour == "palette":
                rgb = palette[p[0]]
                a = trns_alpha[p[0]] if trns_alpha and p[0] < len(trns_alpha) else 255
                samples += [over_white(v, a) for v in rgb]
            elif colour in ("grey-alpha", "rgba"):
                samples += [over_white(v, p[-1]) for v in p[:-1]]
            else:
                values = [v * scale for v in p]
                if trns_key is not None and tuple(p) == tuple(trns_key):
                    values = [M] * len(values)
                samples += values
    return {"channels": channels, "bitDepth": out_depth, "samples": samples}


# MARK: fixtures

def noise(width, height, channels, depth):
    top = (1 << depth) - 1
    return [[tuple(random.randint(0, top) for _ in range(channels)) for _ in range(width)] for _ in range(height)]


fixtures = []
checked = []


def add(name, width, height, colour, depth, pixels, interlace=False, palette=None, trns=None, trns_key=None, trns_alpha=None, pillow=None):
    data = encode(width, height, colour, depth, pixels, interlace, palette, trns)
    (HERE / name).write_bytes(data)
    if pillow:
        image = Image.open(HERE / name)
        seen = list(image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata())
        assert seen == pillow(pixels), f"Pillow reads other samples in {name}"
        checked.append(name)
    fixtures.append({
        "name": name, "widthPx": width, "heightPx": height, "colour": colour, "bitDepth": depth, "interlaced": interlace,
        "stored": [s for row in pixels for p in row for s in p],
        "raster": to_raster(colour, depth, pixels, palette, trns_key, trns_alpha),
    })


flat = lambda pixels: [p for row in pixels for p in row]
flat1 = lambda pixels: [p[0] for row in pixels for p in row]

add("png-grey1-11x3.png", 11, 3, "grey", 1, noise(11, 3, 1, 1), pillow=lambda px: [p[0] * 255 for p in flat(px)])
add("png-grey2-5x3.png", 5, 3, "grey", 2, noise(5, 3, 1, 2))
add("png-grey4-5x3.png", 5, 3, "grey", 4, noise(5, 3, 1, 4))
add("png-grey8-7x5-adam7.png", 7, 5, "grey", 8, noise(7, 5, 1, 8), interlace=True, pillow=flat1)
add("png-grey16-9x9-adam7.png", 9, 9, "grey", 16, noise(9, 9, 1, 16), interlace=True, pillow=flat1)
add("png-rgb8-6x5.png", 6, 5, "rgb", 8, noise(6, 5, 3, 8), pillow=flat)
add("png-rgb16-4x3.png", 4, 3, "rgb", 16, noise(4, 3, 3, 16), pillow=lambda px: [tuple(v >> 8 for v in p) for p in flat(px)])
palette = [(0, 0, 0), (255, 255, 255), (200, 40, 10), (10, 120, 220), (90, 90, 90)]
add("png-palette4-5x3-trns.png", 5, 3, "palette", 4, [[(random.randint(0, 4),) for _ in range(5)] for _ in range(3)],
    palette=palette, trns=bytes([255, 0, 128]), trns_alpha=[255, 0, 128], pillow=flat1)
add("png-grey-alpha8-3x2.png", 3, 2, "grey-alpha", 8, [[(0, 0), (0, 255), (100, 128)], [(255, 0), (37, 1), (200, 254)]], pillow=flat)
add("png-rgba16-3x2.png", 3, 2, "rgba", 16, noise(3, 2, 4, 16))
key = [[(7,), (9,), (7,)], [(250,), (7,), (0,)]]
add("png-grey8-3x2-key.png", 3, 2, "grey", 8, key, trns=struct.pack(">H", 7), trns_key=(7,), pillow=flat1)

(HERE / "png-expected.json").write_text(json.dumps(fixtures, separators=(",", ":")) + "\n")
print(f"Wrote {len(fixtures)} PNG fixtures and png-expected.json; Pillow read {len(checked)} of them back with the same samples.")
