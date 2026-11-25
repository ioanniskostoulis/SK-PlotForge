// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A PNG reader. Chromium decodes PNG for display, but only to 8 bits per channel, and analysis needs the stored samples:
// 16-bit images keep their 16 bits here. Every colour type, every bit depth, Adam7 interlacing and the transparency
// chunk are read. The zlib stream is inflated by the caller's function (DecompressionStream, node:zlib).
import { ImageFormatError } from "./image-format";

// MARK: given values

const SIGNATURE_BYTES = 8;
/** Samples per pixel of each colour type: grey, RGB, palette index, grey and alpha, RGB and alpha. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** The bit depths the specification allows for each colour type. */
const DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
/** Adam7 passes: start x, start y, step x, step y. */
const ADAM7: readonly [number, number, number, number][] = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

export interface DecodedPng {
  widthPx: number;
  heightPx: number;
  bitDepth: number;
  /** 0 grey, 2 RGB, 3 palette, 4 grey and alpha, 6 RGB and alpha. */
  colourType: number;
  /** Samples per pixel as stored (palette: 1, the index). */
  channels: number;
  /** Every sample, row by row, pixel by pixel, at its stored depth (0 to 2^depth − 1). */
  samples: Uint16Array;
  /** PLTE: red, green, blue of each entry. */
  palette?: Uint8Array;
  /** tRNS of a palette image: the alpha of each entry; entries beyond it are opaque. */
  paletteAlpha?: Uint8Array;
  /** tRNS of a grey or RGB image: the one colour that is fully transparent, at the stored depth. */
  transparentKey?: number[];
  interlaced: boolean;
}

export interface PngOptions {
  inflate: (data: Uint8Array) => Promise<Uint8Array>;
}

// MARK: filters

/** The Paeth predictor of the PNG specification: the neighbour (left, above, upper left) nearest to a + b − c. */
export function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Undo the filter of one row in place: `row` holds the filtered bytes, `prior` the unfiltered row above (or zeros). */
function unfilter(kind: number, row: Uint8Array, prior: Uint8Array, bpp: number): void {
  const n = row.length;
  if (kind === 0) return;
  if (kind === 1) { for (let i = bpp; i < n; i++) row[i] = (row[i] + row[i - bpp]) & 0xff; return; }
  if (kind === 2) { for (let i = 0; i < n; i++) row[i] = (row[i] + prior[i]) & 0xff; return; }
  if (kind === 3) { for (let i = 0; i < n; i++) row[i] = (row[i] + ((i >= bpp ? row[i - bpp] : 0) + prior[i] >> 1)) & 0xff; return; }
  if (kind === 4) { for (let i = 0; i < n; i++) row[i] = (row[i] + paeth(i >= bpp ? row[i - bpp] : 0, prior[i], i >= bpp ? prior[i - bpp] : 0)) & 0xff; return; }
  throw new ImageFormatError(`The PNG file uses an unknown row filter (${kind}).`);
}

// MARK: decoding

/** Decode a PNG file to its stored samples. The input is read, never changed. */
export async function decodePng(bytes: Uint8Array, options: PngOptions): Promise<DecodedPng> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = SIGNATURE_BYTES;
  let header: { widthPx: number; heightPx: number; bitDepth: number; colourType: number; interlaced: boolean } | null = null;
  let palette: Uint8Array | undefined, trns: Uint8Array | undefined;
  const parts: Uint8Array[] = [];
  // The chunks: length (4), type (4), data, CRC (4).
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (data.length < length) throw new ImageFormatError("The PNG file is cut short.");
    if (type === "IHDR") {
      if (length < 13) throw new ImageFormatError("The PNG file has no header.");
      header = { widthPx: view.getUint32(at + 8), heightPx: view.getUint32(at + 12), bitDepth: data[8], colourType: data[9], interlaced: data[12] === 1 };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") parts.push(data);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (!header) throw new ImageFormatError("The PNG file has no header.");
  const { widthPx, heightPx, bitDepth, colourType, interlaced } = header;
  const channels = CHANNELS[colourType];
  if (!channels) throw new ImageFormatError(`The PNG colour type ${colourType} is not valid.`);
  if (!DEPTHS[colourType].includes(bitDepth)) throw new ImageFormatError(`The PNG bit depth ${bitDepth} is not valid for its colour type.`);
  if (!widthPx || !heightPx) throw new ImageFormatError("The PNG file has no image size.");
  if (colourType === 3 && !palette) throw new ImageFormatError("The PNG palette is missing.");
  if (!parts.length) throw new ImageFormatError("The PNG file has no image data.");

  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { joined.set(part, offset); offset += part.length; }
  const raw = await options.inflate(joined);

  // Each pass is a small image of its own, filtered row by row; a non-interlaced image is one pass of the whole.
  const samples = new Uint16Array(widthPx * heightPx * channels);
  const bpp = Math.max(1, (channels * bitDepth) >> 3);
  const mask = (1 << bitDepth) - 1;
  let read = 0;
  for (const [x0, y0, dx, dy] of interlaced ? ADAM7 : [[0, 0, 1, 1] as const]) {
    const passWidth = Math.ceil((widthPx - x0) / dx), passHeight = Math.ceil((heightPx - y0) / dy);
    if (passWidth <= 0 || passHeight <= 0) continue;
    const rowBytes = Math.ceil((passWidth * channels * bitDepth) / 8);
    let prior = new Uint8Array(rowBytes);
    for (let r = 0; r < passHeight; r++) {
      if (read + 1 + rowBytes > raw.length) throw new ImageFormatError("The PNG image data is cut short.");
      const kind = raw[read];
      const row = raw.slice(read + 1, read + 1 + rowBytes);
      read += 1 + rowBytes;
      unfilter(kind, row, prior, bpp);
      prior = row;
      const y = y0 + r * dy;
      for (let k = 0; k < passWidth * channels; k++) {
        let value: number;
        if (bitDepth === 8) value = row[k];
        else if (bitDepth === 16) value = (row[2 * k] << 8) | row[2 * k + 1];
        else { const bit = k * bitDepth; value = (row[bit >> 3] >> (8 - bitDepth - (bit & 7))) & mask; }
        const x = x0 + Math.floor(k / channels) * dx;
        samples[(y * widthPx + x) * channels + (k % channels)] = value;
      }
    }
  }

  const decoded: DecodedPng = { widthPx, heightPx, bitDepth, colourType, channels, samples, palette, interlaced };
  if (trns && colourType === 3) decoded.paletteAlpha = trns;
  else if (trns && colourType === 0 && trns.length >= 2) decoded.transparentKey = [(trns[0] << 8) | trns[1]];
  else if (trns && colourType === 2 && trns.length >= 6) decoded.transparentKey = [0, 2, 4].map((i) => (trns![i] << 8) | trns![i + 1]);
  return decoded;
}

// MARK: writing

/** CRC-32 of a chunk's type and data, as PNG stores it. */
function chunkCrc(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, chunkCrc(out.subarray(4, 8 + data.length)));
  return out;
}

export interface PngImage { widthPx: number; heightPx: number; channels: 1 | 3; bitDepth: 8 | 16; data: Uint16Array }

/**
 * A PNG file of a grey or RGB image at 8 or 16 bits, every sample as given (lossless). Rows are filtered with Sub
 * (each byte less the same byte one pixel left), which suits smooth images; the zlib stream comes from the caller's
 * `deflate` (CompressionStream, node:zlib).
 */
export async function encodePng(image: PngImage, deflate: (data: Uint8Array) => Promise<Uint8Array>): Promise<Uint8Array> {
  const { widthPx, heightPx, channels, bitDepth, data } = image;
  const bpp = channels * (bitDepth / 8);
  const rowBytes = widthPx * bpp;
  const raw = new Uint8Array(heightPx * (rowBytes + 1));
  const row = new Uint8Array(rowBytes);
  for (let y = 0; y < heightPx; y++) {
    for (let k = 0; k < widthPx * channels; k++) {
      const v = data[y * widthPx * channels + k];
      if (bitDepth === 8) row[k] = v; else { row[2 * k] = v >> 8; row[2 * k + 1] = v & 0xff; }
    }
    const at = y * (rowBytes + 1);
    raw[at] = 1;
    for (let i = 0; i < rowBytes; i++) raw[at + 1 + i] = (row[i] - (i >= bpp ? row[i - bpp] : 0)) & 0xff;
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, widthPx);
  view.setUint32(4, heightPx);
  header[8] = bitDepth;
  header[9] = channels === 1 ? 0 : 2;
  const parts = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
