// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Image files PlotForge reads: PNG, JPEG and TIFF. The format is told from the first bytes of the file, never from
// its extension, and the header gives the size, bit depth and colour of the image without decoding its pixels.
// Nothing here writes: an original image is only ever read.

export type ImageFormat = "png" | "jpeg" | "tiff";
export type ColourModel = "grey" | "grey-alpha" | "rgb" | "rgba" | "palette" | "cmyk" | "ycbcr";

export interface ImageInfo {
  format: ImageFormat;
  widthPx: number;
  heightPx: number;
  /** Bits per sample (channel), as stored: 1, 8 and 16 are the usual values. */
  bitDepth: number;
  colour: ColourModel;
  /** Samples per pixel, alpha included. */
  channels: number;
}

/** The extensions offered in file dialogs and accepted from a drop; the content still decides the format. */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "tif", "tiff"] as const;

export class ImageFormatError extends Error {}

// MARK: signatures

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The format of an image file from its signature, or null when it is none of the three. */
export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 42 && bytes[3] === 0)
    || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 42))) return "tiff";
  return null;
}

/** Is this file name one PlotForge offers to open as an image? */
export function isImagePath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && (IMAGE_EXTENSIONS as readonly string[]).includes(path.slice(dot + 1).toLowerCase());
}

// MARK: headers

/** Size, bit depth and colour model from the header of a PNG, JPEG or TIFF file. */
export function readImageInfo(bytes: Uint8Array): ImageInfo {
  const format = detectFormat(bytes);
  if (format === "png") return pngInfo(bytes);
  if (format === "jpeg") return jpegInfo(bytes);
  if (format === "tiff") return tiffInfoFromHeader(bytes);
  throw new ImageFormatError("The file is not a PNG, JPEG or TIFF image.");
}

const PNG_COLOUR: Record<number, [ColourModel, number]> = { 0: ["grey", 1], 2: ["rgb", 3], 3: ["palette", 1], 4: ["grey-alpha", 2], 6: ["rgba", 4] };

function pngInfo(bytes: Uint8Array): ImageInfo {
  // The IHDR chunk follows the 8-byte signature: length (4), type (4), width (4), height (4), depth (1), colour (1).
  if (bytes.length < 26 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") throw new ImageFormatError("The PNG file has no header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const colour = PNG_COLOUR[bytes[25]];
  if (!colour) throw new ImageFormatError(`The PNG colour type ${bytes[25]} is not valid.`);
  return { format: "png", widthPx: view.getUint32(16), heightPx: view.getUint32(20), bitDepth: bytes[24], colour: colour[0], channels: colour[1] };
}

function jpegInfo(bytes: Uint8Array): ImageInfo {
  // Walk the markers to the first start-of-frame (SOF0 to SOF15, without DHT C4, JPG C8 and DAC CC).
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) { at++; continue; }
    const marker = bytes[at + 1];
    if (marker === 0xff) { at++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    const length = view.getUint16(at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (at + 10 > bytes.length) break;
      const components = bytes[at + 9];
      const colour: ColourModel = components === 1 ? "grey" : components === 4 ? "cmyk" : "rgb";
      return { format: "jpeg", bitDepth: bytes[at + 4], heightPx: view.getUint16(at + 5), widthPx: view.getUint16(at + 7), colour, channels: components };
    }
    if (marker === 0xda) break;
    at += 2 + length;
  }
  throw new ImageFormatError("The JPEG file has no frame header.");
}

// MARK: TIFF directory

// Tag numbers of the baseline TIFF 6.0 directory used here.
export const TAG = {
  width: 256, height: 257, bitsPerSample: 258, compression: 259, photometric: 262, stripOffsets: 273,
  samplesPerPixel: 277, rowsPerStrip: 278, stripByteCounts: 279, planarConfig: 284, predictor: 317, colorMap: 320,
  tileWidth: 322, tileLength: 323, tileOffsets: 324, tileByteCounts: 325, extraSamples: 338, sampleFormat: 339,
} as const;

export interface TiffDirectory {
  littleEndian: boolean;
  /** Each tag's values, as numbers. */
  tags: Map<number, number[]>;
  /** Number of images (pages) in the file; only the first is read. */
  pages: number;
}

// Bytes per value of each TIFF field type: BYTE, ASCII, SHORT, LONG, RATIONAL, SBYTE, UNDEFINED, SSHORT, SLONG,
// SRATIONAL, FLOAT, DOUBLE.
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

/** Read the first image file directory of a TIFF file and count the pages after it. */
export function readTiffDirectory(bytes: Uint8Array): TiffDirectory {
  if (detectFormat(bytes) !== "tiff") {
    if (bytes.length >= 4 && (bytes[2] === 43 || bytes[3] === 43)) throw new ImageFormatError("BigTIFF files are not supported.");
    throw new ImageFormatError("The file is not a TIFF image.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = bytes[0] === 0x49;
  const u16 = (at: number) => view.getUint16(at, littleEndian);
  const u32 = (at: number) => view.getUint32(at, littleEndian);
  const first = u32(4);
  if (first + 2 > bytes.length) throw new ImageFormatError("The TIFF file is cut short.");
  const count = u16(first);
  const tags = new Map<number, number[]>();
  for (let index = 0; index < count; index++) {
    const entry = first + 2 + index * 12;
    if (entry + 12 > bytes.length) throw new ImageFormatError("The TIFF file is cut short.");
    const tag = u16(entry), type = u16(entry + 2), n = u32(entry + 4);
    const size = TYPE_SIZE[type];
    if (!size) continue;
    const at = size * n <= 4 ? entry + 8 : u32(entry + 8);
    if (at + size * n > bytes.length) throw new ImageFormatError("The TIFF file is cut short.");
    const values: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = at + i * size;
      if (type === 3 || type === 8) values.push(type === 3 ? u16(p) : view.getInt16(p, littleEndian));
      else if (type === 4 || type === 9) values.push(type === 4 ? u32(p) : view.getInt32(p, littleEndian));
      else if (type === 5 || type === 10) values.push(u32(p) / (u32(p + 4) || 1));
      else if (type === 11) values.push(view.getFloat32(p, littleEndian));
      else if (type === 12) values.push(view.getFloat64(p, littleEndian));
      else values.push(type === 6 ? view.getInt8(p) : bytes[p]);
    }
    tags.set(tag, values);
  }
  let pages = 1;
  let next = u32(first + 2 + count * 12);
  const seen = new Set([first]);
  while (next && next + 2 <= bytes.length && !seen.has(next) && pages < 10000) {
    seen.add(next);
    pages++;
    next = next + 2 + u16(next) * 12 + 4 <= bytes.length ? u32(next + 2 + u16(next) * 12) : 0;
  }
  return { littleEndian, tags, pages };
}

function tiffInfoFromHeader(bytes: Uint8Array): ImageInfo {
  const { tags } = readTiffDirectory(bytes);
  const one = (tag: number, fallback?: number) => tags.get(tag)?.[0] ?? fallback;
  const widthPx = one(TAG.width), heightPx = one(TAG.height);
  if (!widthPx || !heightPx) throw new ImageFormatError("The TIFF file has no image size.");
  const channels = one(TAG.samplesPerPixel, 1)!;
  const photometric = one(TAG.photometric, 1)!;
  const colour: ColourModel = photometric === 3 ? "palette" : photometric === 5 ? "cmyk" : photometric === 6 ? "ycbcr"
    : photometric === 2 ? (channels >= 4 ? "rgba" : "rgb") : channels >= 2 ? "grey-alpha" : "grey";
  return { format: "tiff", widthPx, heightPx, bitDepth: one(TAG.bitsPerSample, 1)!, colour, channels };
}
