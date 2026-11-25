// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A baseline TIFF reader. Chromium shows PNG and JPEG itself but not TIFF, so PlotForge decodes TIFF here: the first
// page, in strips or tiles, chunky or planar, uncompressed, PackBits, LZW or Deflate, with or without the horizontal
// predictor, at 1, 2, 4, 8 or 16 bits per sample, in grey, RGB or a palette, with an optional alpha sample.
import { ImageFormatError, readTiffDirectory, TAG } from "./image-format";

/** Compression codes of the TIFF 6.0 specification and the Adobe Deflate extension. */
export const COMPRESSION = { none: 1, lzw: 5, deflate: 8, adobeDeflate: 32946, packBits: 32773 } as const;
const COMPRESSION_NAMES: Record<number, string> = { 2: "CCITT", 3: "CCITT T.4", 4: "CCITT T.6", 6: "old-style JPEG", 7: "JPEG", 34712: "JPEG 2000" };
const SUPPORTED_DEPTHS = [1, 2, 4, 8, 16];

export interface DecodedTiff {
  widthPx: number;
  heightPx: number;
  bitsPerSample: number;
  samplesPerPixel: number;
  /** 0 WhiteIsZero, 1 BlackIsZero, 2 RGB, 3 palette. */
  photometric: number;
  /** Every sample, row by row, pixel by pixel, at its stored depth (0 to 2^bits − 1). */
  samples: Uint16Array;
  /** The RGB palette (photometric 3), 16-bit values: all reds, then all greens, then all blues. */
  colorMap?: number[];
  /** 1 when the alpha sample is premultiplied (associated), 2 when it is not, 0 when there is none. */
  alpha: 0 | 1 | 2;
  pages: number;
}

export interface TiffOptions {
  /** Inflate a zlib stream, for Deflate-compressed files; the caller supplies it (DecompressionStream, node:zlib). */
  inflate?: (data: Uint8Array) => Promise<Uint8Array>;
}

// MARK: decompression

/** PackBits: a signed count n; 0 to 127 copies n + 1 bytes, −1 to −127 repeats the next byte 1 − n times. */
export function unpackBits(input: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let i = 0, o = 0;
  while (i < input.length && o < expected) {
    const n = (input[i++] << 24) >> 24;
    if (n >= 0) { const end = Math.min(i + n + 1, input.length); while (i < end && o < expected) out[o++] = input[i++]; }
    else if (n !== -128) { const value = input[i++]; for (let k = 0; k < 1 - n && o < expected; k++) out[o++] = value; }
  }
  return out;
}

/**
 * TIFF LZW: codes of 9 to 12 bits, most significant bit first; 256 clears the table and 257 ends the strip. The code
 * width grows one code early (at 511, 1023 and 2047 entries), as TIFF writers do. Every table entry is a run of the
 * output already written, so the table holds only where each entry starts in the output and how long it is.
 */
export function lzwDecode(input: Uint8Array, expected: number): Uint8Array {
  const CLEAR = 256, END = 257, MAX_WIDTH = 12;
  let out = new Uint8Array(Math.max(expected, 1));
  const start = new Int32Array(4096), length = new Int32Array(4096);
  let size = 258, width = 9, o = 0;
  let buffer = 0, bits = 0, i = 0;
  let prevStart = -1, prevLength = 0;
  const ensure = (extra: number) => {
    if (o + extra <= out.length) return;
    const grown = new Uint8Array(Math.max(out.length * 2, o + extra));
    grown.set(out);
    out = grown;
  };
  while (true) {
    while (bits < width && i < input.length) { buffer = ((buffer << 8) | input[i++]) & 0xffffff; bits += 8; }
    if (bits < width) break;
    bits -= width;
    const code = (buffer >>> bits) & ((1 << width) - 1);
    if (code === END) break;
    if (code === CLEAR) { size = 258; width = 9; prevStart = -1; continue; }
    const here = o;
    if (code < 256) { ensure(1); out[o++] = code; }
    else if (code < size) { ensure(length[code]); out.copyWithin(o, start[code], start[code] + length[code]); o += length[code]; }
    else if (code === size && prevStart >= 0) {
      // The entry being defined: the previous string followed by its own first byte.
      ensure(prevLength + 1); out.copyWithin(o, prevStart, prevStart + prevLength); o += prevLength; out[o++] = out[prevStart];
    } else throw new ImageFormatError("The TIFF LZW data is damaged.");
    if (prevStart >= 0 && size < 4096) { start[size] = prevStart; length[size] = prevLength + 1; size++; }
    prevStart = here; prevLength = o - here;
    if (size >= (1 << width) - 1 && width < MAX_WIDTH) width++;
  }
  return out.length === o ? out : out.slice(0, o);
}

// MARK: decoding

/** Decode the first page of a TIFF file. The input is read, never changed. */
export async function decodeTiff(bytes: Uint8Array, options: TiffOptions = {}): Promise<DecodedTiff> {
  const { littleEndian, tags, pages } = readTiffDirectory(bytes);
  const one = (tag: number, fallback: number) => tags.get(tag)?.[0] ?? fallback;
  const widthPx = one(TAG.width, 0), heightPx = one(TAG.height, 0);
  if (!widthPx || !heightPx) throw new ImageFormatError("The TIFF file has no image size.");
  const bps = one(TAG.bitsPerSample, 1);
  const spp = one(TAG.samplesPerPixel, 1);
  const photometric = one(TAG.photometric, 1);
  const compression = one(TAG.compression, COMPRESSION.none);
  const planar = one(TAG.planarConfig, 1);
  const predictor = one(TAG.predictor, 1);
  const sampleFormat = one(TAG.sampleFormat, 1);
  if ((tags.get(TAG.bitsPerSample) ?? [bps]).some((value) => value !== bps)) throw new ImageFormatError("TIFF files with different depths per sample are not supported.");
  if (!SUPPORTED_DEPTHS.includes(bps)) throw new ImageFormatError(`TIFF files with ${bps} bits per sample are not supported.`);
  if (sampleFormat !== 1 && sampleFormat !== 2) throw new ImageFormatError("Floating-point TIFF files are not supported.");
  if (![0, 1, 2, 3].includes(photometric)) throw new ImageFormatError(`The TIFF colour model ${photometric === 5 ? "CMYK" : photometric === 6 ? "YCbCr" : photometric} is not supported.`);
  if (predictor !== 1 && predictor !== 2) throw new ImageFormatError("The TIFF floating-point predictor is not supported.");
  if (![COMPRESSION.none, COMPRESSION.lzw, COMPRESSION.deflate, COMPRESSION.adobeDeflate, COMPRESSION.packBits].includes(compression as never)) {
    throw new ImageFormatError(`TIFF ${COMPRESSION_NAMES[compression] ?? `compression ${compression}`} is not supported.`);
  }
  if ((compression === COMPRESSION.deflate || compression === COMPRESSION.adobeDeflate) && !options.inflate) throw new ImageFormatError("Deflate-compressed TIFF files need an inflater.");
  const colorMap = photometric === 3 ? tags.get(TAG.colorMap) : undefined;
  if (photometric === 3 && (!colorMap || colorMap.length < 3 * (1 << bps))) throw new ImageFormatError("The TIFF palette is missing.");
  const extra = tags.get(TAG.extraSamples)?.[0] ?? 0;
  const colourSamples = photometric === 2 ? 3 : 1;
  const alpha: 0 | 1 | 2 = spp > colourSamples ? (extra === 1 ? 1 : 2) : 0;

  // The chunks: strips across the full width, or tiles; planar files have one set of chunks per sample.
  const tiled = tags.has(TAG.tileWidth);
  const chunkWidth = tiled ? one(TAG.tileWidth, 0) : widthPx;
  const chunkHeight = tiled ? one(TAG.tileLength, 0) : Math.min(one(TAG.rowsPerStrip, heightPx), heightPx);
  if (!chunkWidth || !chunkHeight) throw new ImageFormatError("The TIFF tile size is missing.");
  const offsets = tags.get(tiled ? TAG.tileOffsets : TAG.stripOffsets) ?? [];
  const counts = tags.get(tiled ? TAG.tileByteCounts : TAG.stripByteCounts) ?? [];
  const across = Math.ceil(widthPx / chunkWidth), down = Math.ceil(heightPx / chunkHeight);
  const planes = planar === 2 ? spp : 1;
  const chunkSamples = planar === 2 ? 1 : spp;
  if (offsets.length < across * down * planes) throw new ImageFormatError("The TIFF file lists too few strips or tiles.");
  const rowBytes = Math.ceil((chunkWidth * chunkSamples * bps) / 8);
  const mask = (1 << bps) - 1;
  const samples = new Uint16Array(widthPx * heightPx * spp);
  const row = new Uint16Array(chunkWidth * chunkSamples);

  for (let plane = 0; plane < planes; plane++) {
    for (let cy = 0; cy < down; cy++) {
      for (let cx = 0; cx < across; cx++) {
        const index = plane * across * down + cy * across + cx;
        const rows = tiled ? chunkHeight : Math.min(chunkHeight, heightPx - cy * chunkHeight);
        const expected = rows * rowBytes;
        const stored = bytes.subarray(offsets[index], offsets[index] + (counts[index] ?? expected));
        const raw = compression === COMPRESSION.lzw ? lzwDecode(stored, expected)
          : compression === COMPRESSION.packBits ? unpackBits(stored, expected)
          : compression === COMPRESSION.none ? stored
          : await options.inflate!(stored);
        for (let r = 0; r < rows; r++) {
          const y = cy * chunkHeight + r;
          if (y >= heightPx) break;
          // Unpack one row of samples at the stored depth, in the file's byte order.
          const base = r * rowBytes;
          for (let k = 0; k < row.length; k++) {
            if (bps === 8) row[k] = raw[base + k] ?? 0;
            else if (bps === 16) { const a = raw[base + 2 * k] ?? 0, b = raw[base + 2 * k + 1] ?? 0; row[k] = littleEndian ? a | (b << 8) : (a << 8) | b; }
            else { const bit = k * bps, byte = raw[base + (bit >> 3)] ?? 0; row[k] = (byte >> (8 - bps - (bit & 7))) & mask; }
          }
          // Horizontal differencing: each sample was stored as its difference from the same sample one pixel left.
          if (predictor === 2) for (let k = chunkSamples; k < row.length; k++) row[k] = (row[k] + row[k - chunkSamples]) & mask;
          for (let x = 0; x < chunkWidth; x++) {
            const px = cx * chunkWidth + x;
            if (px >= widthPx) break;
            const at = (y * widthPx + px) * spp;
            if (planar === 2) samples[at + plane] = row[x];
            else for (let s = 0; s < spp; s++) samples[at + s] = row[x * spp + s];
          }
        }
      }
    }
  }
  return { widthPx, heightPx, bitsPerSample: bps, samplesPerPixel: spp, photometric, samples, colorMap, alpha, pages };
}

// MARK: display

/** Eight-bit RGBA for display, row by row; the decoded samples keep their full depth for measurement. */
export function tiffToRgba(image: DecodedTiff): Uint8ClampedArray {
  const { widthPx, heightPx, bitsPerSample: bps, samplesPerPixel: spp, photometric, samples, colorMap, alpha } = image;
  const max = (1 << bps) - 1;
  const to8 = (value: number) => Math.round((value * 255) / max);
  const colours = 1 << bps;
  const out = new Uint8ClampedArray(widthPx * heightPx * 4);
  for (let p = 0; p < widthPx * heightPx; p++) {
    const s = p * spp, o = p * 4;
    let r: number, g: number, b: number, a = 255;
    if (photometric === 2) { r = to8(samples[s]); g = to8(samples[s + 1]); b = to8(samples[s + 2]); if (alpha) a = to8(samples[s + 3]); }
    else if (photometric === 3) { const i = samples[s]; r = colorMap![i] >> 8; g = colorMap![colours + i] >> 8; b = colorMap![2 * colours + i] >> 8; if (alpha) a = to8(samples[s + 1]); }
    else { const v = photometric === 0 ? 255 - to8(samples[s]) : to8(samples[s]); r = g = b = v; if (alpha) a = to8(samples[s + 1]); }
    // Premultiplied alpha is divided out: a canvas takes straight alpha.
    if (alpha === 1 && a > 0 && a < 255) { r = (r * 255) / a; g = (g * 255) / a; b = (b * 255) / a; }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  }
  return out;
}
