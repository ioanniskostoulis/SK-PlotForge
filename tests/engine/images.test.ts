// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Image import: formats from their signatures, header metadata, the TIFF reader against Pillow's pixels, and
// originals left byte for byte unchanged.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import {
  crc32, decodeTiff, describeImage, detectFormat, ImageFormatError, isImagePath, lzwDecode, readImageInfo, tiffToRgba, unpackBits,
} from "../../source/engine";

const FIXTURES = "tests/fixtures";
const read = (name: string) => new Uint8Array(readFileSync(`${FIXTURES}/${name}`));
const inflate = async (data: Uint8Array) => new Uint8Array(inflateSync(data));
const expected: Record<string, { size: [number, number]; rgba: number[] }> = JSON.parse(readFileSync(`${FIXTURES}/expected.json`, "utf8"));

// MARK: formats

test("the format comes from the signature, not the extension", () => {
  assert.equal(detectFormat(read("rgb-6x4.png")), "png");
  assert.equal(detectFormat(read("rgb-6x4.jpg")), "jpeg");
  assert.equal(detectFormat(read("rgb-6x4-none.tif")), "tiff");
  assert.equal(detectFormat(read("rgb-6x4-be-pred.tif")), "tiff");
  assert.equal(detectFormat(new TextEncoder().encode("{\"format\":\"plotforge\"}")), null);
  // One byte short of each signature is not enough.
  assert.equal(detectFormat(read("rgb-6x4.png").subarray(0, 7)), null);
  assert.equal(detectFormat(read("rgb-6x4.jpg").subarray(0, 2)), null);
  assert.equal(detectFormat(read("rgb-6x4-none.tif").subarray(0, 3)), null);
});

test("PNG, JPEG and TIFF extensions are offered, in any case, and others are not", () => {
  for (const name of ["a.png", "a.JPG", "a.jpeg", "a.tif", "b.TIFF", "dir.v2/x.tiff"]) assert.ok(isImagePath(name), name);
  for (const name of ["a.pfg", "a.gif", "png", "a.png.txt", "a.tiff2"]) assert.ok(!isImagePath(name), name);
});

test("the header gives size, depth and colour without decoding", () => {
  assert.deepEqual(readImageInfo(read("rgb-6x4.png")), { format: "png", widthPx: 6, heightPx: 4, bitDepth: 8, colour: "rgb", channels: 3 });
  assert.deepEqual(readImageInfo(read("grey16-3x2.png")), { format: "png", widthPx: 3, heightPx: 2, bitDepth: 16, colour: "grey", channels: 1 });
  assert.deepEqual(readImageInfo(read("rgba-2x2.png")), { format: "png", widthPx: 2, heightPx: 2, bitDepth: 8, colour: "rgba", channels: 4 });
  assert.deepEqual(readImageInfo(read("rgb-6x4.jpg")), { format: "jpeg", widthPx: 6, heightPx: 4, bitDepth: 8, colour: "rgb", channels: 3 });
  assert.deepEqual(readImageInfo(read("grey16-3x2.tif")), { format: "tiff", widthPx: 3, heightPx: 2, bitDepth: 16, colour: "grey", channels: 1 });
  assert.deepEqual(readImageInfo(read("palette-6x4.tif")), { format: "tiff", widthPx: 6, heightPx: 4, bitDepth: 8, colour: "palette", channels: 1 });
  assert.deepEqual(readImageInfo(read("rgba-2x2.tif")), { format: "tiff", widthPx: 2, heightPx: 2, bitDepth: 8, colour: "rgba", channels: 4 });
});

test("a file that is not an image, or is cut short, is refused with a sentence", () => {
  assert.throws(() => readImageInfo(new Uint8Array([1, 2, 3, 4])), (error: Error) => error instanceof ImageFormatError && error.message === "The file is not a PNG, JPEG or TIFF image.");
  assert.throws(() => readImageInfo(read("rgb-6x4.png").subarray(0, 20)), /PNG file has no header/);
  assert.throws(() => readImageInfo(read("rgb-6x4.jpg").subarray(0, 4)), /JPEG file has no frame header/);
  assert.throws(() => readImageInfo(read("rgb-6x4-none.tif").subarray(0, 12)), /cut short/);
});

// MARK: the TIFF reader

for (const name of ["rgb-6x4-none.tif", "rgb-6x4-lzw.tif", "rgb-6x4-packbits.tif", "rgb-6x4-be-pred.tif", "tiled-6x4.tif", "planar-6x4.tif",
  "grey-5x3-lzw.tif", "rgba-2x2.tif", "palette-6x4.tif", "bilevel-10x2.tif"]) {
  test(`${name} decodes to the same pixels as Pillow`, async () => {
    const image = await decodeTiff(read(name), { inflate });
    assert.deepEqual([image.widthPx, image.heightPx], expected[name].size);
    assert.deepEqual([...tiffToRgba(image)], expected[name].rgba);
  });
}

test("16-bit samples keep their full depth, and display at eight bits", async () => {
  const image = await decodeTiff(read("grey16-3x2.tif"));
  assert.deepEqual([...image.samples], [0, 1000, 20000, 40000, 65535, 256]);
  // 255 × v / 65535, rounded: 1000 → 3.89 → 4; 256 → 0.996 → 1.
  assert.deepEqual([...tiffToRgba(image)].filter((_, i) => i % 4 === 0), [0, 4, 78, 156, 255, 1]);
});

test("LZW past the 9-bit and 12-bit code widths and through table clears decodes every sample", async () => {
  const image = await decodeTiff(read("noise-128x96-lzw.tif"));
  assert.deepEqual(Buffer.from(Uint8Array.from(image.samples)), readFileSync(`${FIXTURES}/noise-128x96.raw`));
});

test("LZW: the code being defined (KwKwK) repeats the previous string and its first byte", () => {
  // Codes, 9 bits each, most significant bit first: CLEAR, 65 ('A'), 258 (defined by this very code: "AA"), END.
  const codes = [256, 65, 258, 257];
  const bits = codes.map((code) => code.toString(2).padStart(9, "0")).join("").padEnd(40, "0");
  const bytes = Uint8Array.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  assert.deepEqual([...lzwDecode(bytes, 3)], [65, 65, 65]);
});

test("PackBits: literal runs, repeats, and the −128 no-op", () => {
  // 2 → three literals; −2 → the next byte three times; −128 → nothing; 0 → one literal.
  assert.deepEqual([...unpackBits(Uint8Array.from([2, 1, 2, 3, 0xfe, 9, 0x80, 0, 7]), 7)], [1, 2, 3, 9, 9, 9, 7]);
  // Output stops at the expected length even when the data would run on.
  assert.deepEqual([...unpackBits(Uint8Array.from([0xfd, 5]), 2)], [5, 5]);
});

test("unsupported TIFF variants are named in the refusal", async () => {
  const bytes = read("rgb-6x4-none.tif");
  const patched = (tag: number, value: number) => {
    const copy = bytes.slice();
    const view = new DataView(copy.buffer);
    const first = view.getUint32(4, true);
    for (let i = 0; i < view.getUint16(first, true); i++) {
      const entry = first + 2 + i * 12;
      if (view.getUint16(entry, true) === tag) view.setUint16(entry + 8, value, true);
    }
    return copy;
  };
  await assert.rejects(decodeTiff(patched(259, 7)), /TIFF JPEG is not supported/);
  await assert.rejects(decodeTiff(patched(262, 5)), /colour model CMYK is not supported/);
  await assert.rejects(decodeTiff(read("rgba-2x2.tif")), /need an inflater/);
});

// MARK: originals are read-only

test("importing reads an original without changing a byte of it", async () => {
  for (const name of ["rgb-6x4.png", "rgb-6x4.jpg", "rgb-6x4-lzw.tif", "rgba-2x2.tif", "noise-128x96-lzw.tif"]) {
    const before = readFileSync(`${FIXTURES}/${name}`);
    const bytes = new Uint8Array(before);
    const copy = bytes.slice();
    const { source } = describeImage(bytes);
    if (source.format === "tiff") tiffToRgba(await decodeTiff(bytes, { inflate }));
    assert.deepEqual(bytes, copy, `${name}: the buffer was changed`);
    assert.deepEqual(readFileSync(`${FIXTURES}/${name}`), before, `${name}: the file was changed`);
    assert.equal(source.crc32, crc32(copy));
    assert.equal(source.bytes, before.length);
  }
});

test("CRC-32 matches the standard check value", () => {
  // The check value of the CRC-32 catalogue for the nine ASCII digits.
  assert.equal(crc32(new TextEncoder().encode("123456789")), "cbf43926");
  assert.equal(crc32(new Uint8Array()), "00000000");
});
