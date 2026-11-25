// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The working image: the PNG reader against the samples its fixtures were encoded with, the working image of each
// format, alpha on white, the pixel readout on both sides of every edge, and originals left unchanged.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import {
  crc32, decodeImage, decodePng, describeImage, shapeOf, workingShape, ImageFormatError, overWhite, paeth, pixelAt, pixelUnder, premultipliedOverWhite, rasterToRgba,
  type Raster,
} from "../../source/engine";

const FIXTURES = "tests/fixtures";
const read = (name: string) => new Uint8Array(readFileSync(`${FIXTURES}/${name}`));
const inflate = async (data: Uint8Array) => new Uint8Array(inflateSync(data));

interface PngFixture {
  name: string; widthPx: number; heightPx: number; colour: string; bitDepth: number; interlaced: boolean;
  stored: number[]; raster: { channels: number; bitDepth: number; samples: number[] };
}
// Written by tests/fixtures/make-png-fixtures.py, whose encoder Pillow checks.
const pngFixtures: PngFixture[] = JSON.parse(readFileSync(`${FIXTURES}/png-expected.json`, "utf8"));

// MARK: the PNG reader

for (const fixture of pngFixtures) {
  test(`${fixture.name} decodes to the samples it was encoded with`, async () => {
    const png = await decodePng(read(fixture.name), { inflate });
    assert.deepEqual([png.widthPx, png.heightPx, png.bitDepth, png.interlaced], [fixture.widthPx, fixture.heightPx, fixture.bitDepth, fixture.interlaced]);
    assert.deepEqual([...png.samples], fixture.stored);
  });
  test(`${fixture.name} gives the expected working image`, async () => {
    const { raster } = await decodeImage(read(fixture.name), { inflate });
    assert.deepEqual([raster.widthPx, raster.heightPx, raster.channels, raster.bitDepth], [fixture.widthPx, fixture.heightPx, fixture.raster.channels, fixture.raster.bitDepth]);
    assert.deepEqual([...raster.data], fixture.raster.samples);
  });
}

test("the Paeth predictor picks the nearest neighbour, preferring left, then above, on ties", () => {
  // p = a + b − c; the neighbour with the smallest |p − neighbour| wins.
  assert.equal(paeth(10, 20, 10), 20); // p = 20: above is exact
  assert.equal(paeth(20, 10, 10), 20); // p = 20: left is exact
  assert.equal(paeth(10, 10, 10), 10); // all tie: left
  assert.equal(paeth(5, 9, 7), 7); // p = 7: upper left is exact
  assert.equal(paeth(0, 4, 2), 2); // p = 2: |2−0| = |2−4| = 2, |2−2| = 0: upper left
});

test("16 bits stay 16 bits: a 16-bit PNG and TIFF keep every sample", async () => {
  const png = await decodeImage(read("png-grey16-9x9-adam7.png"), { inflate });
  assert.equal(png.raster.bitDepth, 16);
  assert.ok([...png.raster.data].some((v) => v > 255 && v % 257 !== 0), "values that 8 bits cannot hold");
  const tiff = await decodeImage(read("grey16-3x2.tif"), { inflate });
  assert.equal(tiff.raster.bitDepth, 16);
  assert.deepEqual(tiff.conversions, []);
});

test("import records what it changed: a palette, a depth under 8 bits, alpha", async () => {
  assert.deepEqual((await decodeImage(read("png-palette4-5x3-trns.png"), { inflate })).conversions, ["palette-to-rgb", "alpha-on-white"]);
  assert.deepEqual((await decodeImage(read("png-grey1-11x3.png"), { inflate })).conversions, ["depth-to-8"]);
  assert.deepEqual((await decodeImage(read("png-rgba16-3x2.png"), { inflate })).conversions, ["alpha-on-white"]);
  assert.deepEqual((await decodeImage(read("png-rgb8-6x5.png"), { inflate })).conversions, []);
  assert.deepEqual((await decodeImage(read("rgba-2x2.tif"), { inflate })).conversions, ["alpha-on-white"]);
  assert.deepEqual((await decodeImage(read("palette-6x4.tif"), { inflate })).conversions, ["palette-to-rgb"]);
});

test("a TIFF's working image matches the colours of its display decode where it is opaque", async () => {
  // The display path (tiffToRgba) is checked against Pillow in images.test.ts; the working image must agree with it.
  const expected = JSON.parse(readFileSync(`${FIXTURES}/expected.json`, "utf8"));
  for (const name of ["rgb-6x4-lzw.tif", "planar-6x4.tif", "palette-6x4.tif", "grey-5x3-lzw.tif"]) {
    const { raster } = await decodeImage(read(name), { inflate });
    const rgba = expected[name].rgba as number[];
    for (let p = 0; p < raster.widthPx * raster.heightPx; p++) {
      const values = raster.channels === 1 ? [raster.data[p], raster.data[p], raster.data[p]] : [...raster.data.subarray(3 * p, 3 * p + 3)];
      assert.deepEqual(values, rgba.slice(4 * p, 4 * p + 3), `${name} pixel ${p}`);
    }
  }
});

test("JPEG goes through the decoder the renderer gives; without one it is refused", async () => {
  const bytes = read("rgb-6x4.jpg");
  await assert.rejects(decodeImage(bytes, { inflate }), (error: Error) => error instanceof ImageFormatError && /need a decoder/.test(error.message));
  const rgba = new Uint8ClampedArray(6 * 4 * 4).map((_, i) => (i % 4 === 3 ? 255 : i));
  const { raster } = await decodeImage(bytes, { inflate, decodeJpeg: async () => ({ widthPx: 6, heightPx: 4, rgba }) });
  assert.deepEqual([raster.channels, raster.bitDepth], [3, 8]);
  assert.deepEqual([...raster.data.subarray(0, 6)], [0, 1, 2, 4, 5, 6]);
});

// MARK: alpha on white

test("alpha on white: opaque keeps the value, clear gives white, half is halfway", () => {
  assert.equal(overWhite(37, 255, 255), 37);
  assert.equal(overWhite(37, 0, 255), 255);
  assert.equal(overWhite(0, 128, 255), 127); // (0 · 128 + 255 · 127) / 255 = 127
  assert.equal(overWhite(0, 127, 255), 128); // one step less alpha, one step lighter
  assert.equal(overWhite(1000, 65535, 65535), 1000);
  assert.equal(overWhite(1000, 0, 65535), 65535);
  // Premultiplied: v already carries a / M, so the white behind adds M − a.
  assert.equal(premultipliedOverWhite(64, 128, 255), 191);
  assert.equal(premultipliedOverWhite(0, 0, 255), 255);
  assert.equal(premultipliedOverWhite(200, 255, 255), 200);
});

// MARK: the pixel readout

const grid: Raster = { widthPx: 3, heightPx: 2, channels: 1, bitDepth: 16, data: Uint16Array.from([0, 1, 2, 300, 40000, 65535]) };

test("the readout gives the pixel's own value, and nothing just outside the image", () => {
  assert.deepEqual(pixelAt(grid, 0, 0), { x: 0, y: 0, values: [0] });
  assert.deepEqual(pixelAt(grid, 2, 1), { x: 2, y: 1, values: [65535] });
  assert.deepEqual(pixelAt(grid, 1, 1), { x: 1, y: 1, values: [40000] });
  // Both sides of each edge: −1 and the width or height are outside.
  assert.equal(pixelAt(grid, -1, 0), null);
  assert.equal(pixelAt(grid, 3, 0), null);
  assert.equal(pixelAt(grid, 0, -1), null);
  assert.equal(pixelAt(grid, 0, 2), null);
  assert.equal(pixelAt(grid, 0.5, 0), null);
});

test("the pixel under the pointer: each pixel covers [x, x + 1), at any display size", () => {
  // Shown at its own size.
  assert.deepEqual(pixelUnder(grid, 0.99, 0.99, 3, 2)?.values, [0]);
  assert.deepEqual(pixelUnder(grid, 1, 0, 3, 2)?.values, [1]);
  assert.equal(pixelUnder(grid, 3, 0, 3, 2), null);
  assert.equal(pixelUnder(grid, -0.01, 0, 3, 2), null);
  // Shown ten times larger: the box point 29.99 is still pixel 2, 30 is outside.
  assert.deepEqual(pixelUnder(grid, 29.99, 19.99, 30, 20)?.values, [65535]);
  assert.equal(pixelUnder(grid, 30, 10, 30, 20), null);
  assert.equal(pixelUnder(grid, 1, 1, 0, 20), null);
});

test("the readout of a decoded file matches the stored pixel", async () => {
  const fixture = pngFixtures.find((item) => item.name === "png-rgb16-4x3.png")!;
  const { raster } = await decodeImage(read(fixture.name), { inflate });
  const at = (x: number, y: number) => fixture.stored.slice((y * 4 + x) * 3, (y * 4 + x) * 3 + 3);
  for (const [x, y] of [[0, 0], [3, 0], [0, 2], [3, 2], [2, 1]]) assert.deepEqual(pixelAt(raster, x, y)?.values, at(x, y));
});

test("display shows 16 bits across their full range; the working image keeps its values", () => {
  const rgba = rasterToRgba(grid);
  assert.deepEqual([...rgba.subarray(0, 4)], [0, 0, 0, 255]);
  assert.deepEqual([...rgba.subarray(12, 16)], [1, 1, 1, 255]); // 300 / 257 = 1.17
  assert.deepEqual([...rgba.subarray(20, 24)], [255, 255, 255, 255]);
  assert.equal(grid.data[3], 300);
});

// MARK: originals

test("decoding never changes the file's bytes", async () => {
  for (const name of [...pngFixtures.map((item) => item.name), "rgb-6x4-lzw.tif", "grey16-3x2.tif", "rgba-2x2.tif"]) {
    const bytes = read(name);
    const before = crc32(bytes), copy = bytes.slice();
    await decodeImage(bytes, { inflate });
    assert.equal(crc32(bytes), before, name);
    assert.deepEqual(bytes, copy, name);
    assert.equal(crc32(new Uint8Array(readFileSync(`${FIXTURES}/${name}`))), before, `${name} on disk`);
  }
});

test("damaged PNG files are refused with a sentence", async () => {
  const good = read("png-rgb8-6x5.png");
  await assert.rejects(decodePng(good.subarray(0, 40), { inflate }), /cut short|no image data/);
  // The signature and header (33 bytes) followed by IEND alone: no IDAT.
  await assert.rejects(decodePng(Uint8Array.from([...good.subarray(0, 33), ...good.subarray(good.length - 12)]), { inflate }), /no image data/);
  const badDepth = good.slice(); badDepth[24] = 3;
  await assert.rejects(decodePng(badDepth, { inflate }), /bit depth 3 is not valid/);
});

test("the working shape known from the document matches the decoded image, for every fixture", async () => {
  for (const name of [...pngFixtures.map((item) => item.name), "rgb-6x4-lzw.tif", "grey16-3x2.tif", "rgba-2x2.tif", "palette-6x4.tif", "bilevel-10x2.tif", "grey16-3x2.png"]) {
    const bytes = read(name);
    assert.deepEqual(workingShape(describeImage(bytes).source), shapeOf((await decodeImage(bytes, { inflate })).raster), name);
  }
});
