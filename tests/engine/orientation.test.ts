// Licensed under the GNU General Public License v2 or later. See LICENSE.
// EXIF orientation: the eight turns against Pillow's exif_transpose, the tag read in both byte orders, the decoder
// given the pixels as stored, the upright size recorded, and the original's bytes unchanged.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import {
  crc32, decodeImage, describeImage, emptyProject, jpegOrientation, newProjectImage, orientRaster, parseProject, serializeProject, shapeOf,
  storedOrientationCopy, workingShape, type Raster,
} from "../../source/engine";

const read = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));
const inflate = async (data: Uint8Array) => new Uint8Array(inflateSync(data));
// Written by tests/fixtures/make-orientation-fixtures.py with Pillow's ImageOps.exif_transpose.
const expected: { widthPx: number; heightPx: number; stored: number[]; cases: { orientation: number; widthPx: number; heightPx: number; samples: number[] }[] } =
  JSON.parse(readFileSync("tests/fixtures/orientation-expected.json", "utf8"));

for (const { orientation, widthPx, heightPx, samples } of expected.cases) {
  test(`orientation ${orientation} turns the stored pixels as Pillow does`, () => {
    const stored: Raster = { widthPx: expected.widthPx, heightPx: expected.heightPx, channels: 1, bitDepth: 8, data: Uint16Array.from(expected.stored) };
    const upright = orientRaster(stored, orientation);
    assert.deepEqual([upright.widthPx, upright.heightPx, ...upright.data], [widthPx, heightPx, ...samples]);
  });
}

/** A JPEG holding only an APP1 EXIF block with one orientation entry, in either byte order. */
function exifJpeg(orientation: number, littleEndian: boolean): Uint8Array {
  const tiff = new Uint8Array(8 + 2 + 12 + 4);
  const view = new DataView(tiff.buffer);
  tiff.set(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  view.setUint16(8, 1, littleEndian);
  view.setUint16(10, 0x0112, littleEndian); view.setUint16(12, 3, littleEndian); view.setUint32(14, 1, littleEndian); view.setUint16(18, orientation, littleEndian);
  const app1 = [0xff, 0xe1, 0, 2 + 6 + tiff.length, ..."Exif".split("").map((c) => c.charCodeAt(0)), 0, 0, ...tiff];
  return Uint8Array.from([0xff, 0xd8, ...app1, 0xff, 0xd9]);
}

test("the orientation tag is read in either byte order; no tag, a bad value or another format is 1", () => {
  for (const littleEndian of [true, false]) for (const orientation of [1, 3, 6, 8]) assert.equal(jpegOrientation(exifJpeg(orientation, littleEndian)), orientation, `${orientation} ${littleEndian}`);
  assert.equal(jpegOrientation(exifJpeg(9, true)), 1);
  assert.equal(jpegOrientation(exifJpeg(0, false)), 1);
  assert.equal(jpegOrientation(read("orientation-6.jpg")), 6);
  assert.equal(jpegOrientation(read("orientation-none.jpg")), 1);
  assert.equal(jpegOrientation(read("rgb-6x4.png")), 1);
});

test("the decoder gets a copy whose tag is 1; the original's bytes are unchanged", () => {
  const original = read("orientation-6.jpg"), before = crc32(original);
  const copy = storedOrientationCopy(original);
  assert.notEqual(copy, original);
  assert.equal(jpegOrientation(copy), 1);
  assert.equal(crc32(original), before);
  // Only the two bytes of the value differ.
  assert.equal([...copy].filter((value, index) => value !== original[index]).length, 1);
  // A file that needs no turn is passed on as it is.
  const plain = read("orientation-none.jpg");
  assert.equal(storedOrientationCopy(plain), plain);
});

test("an orientation-6 JPEG is described upright, decoded upright, and the turn is recorded", async () => {
  const bytes = read("orientation-6.jpg");
  const { source } = describeImage(bytes);
  assert.deepEqual([source.widthPx, source.heightPx, source.orientation], [4, 8, 6]);
  let given: Uint8Array | null = null;
  // A stand-in decoder that returns the stored 8 × 4 pixels, with x + 10 y in red, as any decoder would for tag 1.
  const decodeJpeg = async (data: Uint8Array) => {
    given = data;
    const rgba = new Uint8ClampedArray(8 * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) rgba.set([x + 10 * y, 0, 0, 255], (y * 8 + x) * 4);
    return { widthPx: 8, heightPx: 4, rgba };
  };
  const decoded = await decodeImage(bytes, { inflate, decodeJpeg });
  assert.equal(jpegOrientation(given!), 1);
  assert.deepEqual(decoded.conversions, ["exif-orientation"]);
  assert.deepEqual(shapeOf(decoded.raster), workingShape(source));
  // A quarter turn clockwise: the upright top row is the stored left column, read from the bottom up.
  assert.deepEqual([0, 1, 2, 3].map((x) => decoded.raster.data[x * 3]), [30, 20, 10, 0]);
});

test("the orientation is saved with the image, and a document without it reads as 1", () => {
  const project = emptyProject();
  project.images.push(newProjectImage(project, "/lab/photo.jpg", "photo.jpg", describeImage(read("orientation-6.jpg")).source, 0, 0));
  const text = serializeProject(project, "/lab/a.pfg");
  assert.equal(serializeProject(parseProject(text, "/lab/a.pfg"), "/lab/a.pfg"), text);
  assert.equal(JSON.parse(text).images[0].source.orientation, 6);
  const data = JSON.parse(text);
  delete data.images[0].source.orientation;
  assert.equal(parseProject(JSON.stringify(data), null).images[0].source.orientation, 1);
  data.images[0].source.orientation = 9;
  assert.throws(() => parseProject(JSON.stringify(data), null), /invalid image orientation/);
});
