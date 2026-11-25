// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The working image: the pixels that steps, thresholds and measurements see. It is grey or RGB, at 8 or 16 bits per
// sample, and every sample keeps the value stored in the file. What import has to change to reach that form (alpha
// composited on white, a palette expanded, a depth under 8 bits scaled to 8) is recorded beside the pixels, so that a
// result can always be traced (IMAGE-ANALYSIS.md, Image types).
import { detectFormat, ImageFormatError, readImageInfo, type ImageFormat } from "./image-format";
import { decodePng, type DecodedPng } from "./png";
import { decodeTiff, type DecodedTiff } from "./tiff";
import { jpegOrientation, orientRaster, storedOrientationCopy } from "./orientation";

// MARK: given values

export type Channels = 1 | 3;
export type Depth = 8 | 16;

export interface Raster {
  widthPx: number;
  heightPx: number;
  /** 1 grey, 3 RGB. */
  channels: Channels;
  bitDepth: Depth;
  /** Samples row by row, pixel by pixel: 0 to 255, or 0 to 65535. */
  data: Uint16Array;
  /**
   * 1 for each pixel a Canvas step added around the image, as a design app's transparent canvas: it holds the step's
   * background value for export, but histograms, thresholds, measurements and XY export pass over it. Absent when
   * every pixel is the image's.
   */
  outside?: Uint8Array;
}

/** What import did to reach the working image, in the order it was done. */
export type ImportConversion = "palette-to-rgb" | "white-is-zero" | "depth-to-8" | "alpha-on-white" | "exif-orientation";

export interface DecodedImage {
  format: ImageFormat;
  raster: Raster;
  conversions: ImportConversion[];
}

export const maxValue = (depth: Depth): number => (depth === 16 ? 65535 : 255);

export function newRaster(widthPx: number, heightPx: number, channels: Channels, bitDepth: Depth): Raster {
  return { widthPx, heightPx, channels, bitDepth, data: new Uint16Array(widthPx * heightPx * channels) };
}

/** A region (1 in it; null for every pixel) less the pixels outside the image; null when that is every pixel. */
export function withinImage(raster: Pick<Raster, "outside">, region: Uint8Array | null): Uint8Array | null {
  const outside = raster.outside;
  if (!outside) return region;
  const out = new Uint8Array(outside.length);
  for (let i = 0; i < out.length; i++) out[i] = (!region || region[i]) && !outside[i] ? 1 : 0;
  return out;
}

/** The pixels of the image itself: all of them, less those a Canvas step added. */
export function imagePixels(raster: Pick<Raster, "widthPx" | "heightPx" | "outside">): number {
  let n = raster.widthPx * raster.heightPx;
  if (raster.outside) for (const out of raster.outside) n -= out;
  return n;
}

export interface DecodeOptions {
  /** Inflate a zlib stream (PNG, Deflate TIFF). */
  inflate: (data: Uint8Array) => Promise<Uint8Array>;
  /**
   * Decode a JPEG file to 8-bit RGBA. The engine has no JPEG decoder of its own; the renderer passes the browser's.
   * It is given a copy whose EXIF orientation is 1, so it returns the pixels as stored; the engine turns them upright.
   * JPEG is 8-bit and lossy, so nothing beyond the browser's samples is lost.
   */
  decodeJpeg?: (bytes: Uint8Array) => Promise<{ widthPx: number; heightPx: number; rgba: Uint8ClampedArray }>;
}

// MARK: alpha

/**
 * A sample v with straight alpha a, composited on white, where M is the maximum of the depth:
 * v' = round((v · a + M · (M − a)) / M). Opaque (a = M) keeps v; clear (a = 0) gives white, M.
 */
export function overWhite(v: number, a: number, M: number): number {
  return Math.round((v * a + M * (M - a)) / M);
}

/** The same with premultiplied (associated) alpha, where v already carries the factor a / M: v' = v + M − a. */
export function premultipliedOverWhite(v: number, a: number, M: number): number {
  return Math.min(M, v + M - a);
}

// MARK: from each decoder

/** The working image of a decoded PNG. */
export function rasterFromPng(png: DecodedPng): DecodedImage {
  const { widthPx, heightPx, bitDepth, colourType, channels: stored, samples } = png;
  const conversions: ImportConversion[] = [];
  const palette = colourType === 3;
  const colour: Channels = colourType === 2 || colourType === 6 || palette ? 3 : 1;
  const depth: Depth = palette ? 8 : bitDepth === 16 ? 16 : 8;
  const M = maxValue(depth);
  // Depths of 1, 2 and 4 bits scale to 8 by a whole factor (255, 85, 17), so no value is rounded.
  const scale = !palette && bitDepth < 8 ? 255 / ((1 << bitDepth) - 1) : 1;
  const hasAlpha = colourType === 4 || colourType === 6 || !!png.paletteAlpha || !!png.transparentKey;
  if (palette) conversions.push("palette-to-rgb");
  if (scale !== 1) conversions.push("depth-to-8");
  if (hasAlpha) conversions.push("alpha-on-white");
  const raster = newRaster(widthPx, heightPx, colour, depth);
  const out = raster.data;
  for (let p = 0; p < widthPx * heightPx; p++) {
    const s = p * stored, o = p * colour;
    if (palette) {
      const index = samples[s];
      const a = png.paletteAlpha && index < png.paletteAlpha.length ? png.paletteAlpha[index] : 255;
      for (let c = 0; c < 3; c++) out[o + c] = overWhite(png.palette![index * 3 + c] ?? 0, a, M);
    } else if (colourType === 4 || colourType === 6) {
      const a = samples[s + colour];
      for (let c = 0; c < colour; c++) out[o + c] = overWhite(samples[s + c], a, M);
    } else {
      const key = png.transparentKey;
      const clear = !!key && key.every((value, c) => samples[s + c] === value);
      for (let c = 0; c < colour; c++) out[o + c] = clear ? M : samples[s + c] * scale;
    }
  }
  return { format: "png", raster, conversions };
}

/** The working image of a decoded TIFF. */
export function rasterFromTiff(tiff: DecodedTiff): DecodedImage {
  const { widthPx, heightPx, bitsPerSample: bps, samplesPerPixel: spp, photometric, samples, colorMap, alpha } = tiff;
  const conversions: ImportConversion[] = [];
  const palette = photometric === 3;
  const colour: Channels = photometric === 2 || palette ? 3 : 1;
  const depth: Depth = palette ? 8 : bps === 16 ? 16 : 8;
  const M = maxValue(depth);
  const storedMax = (1 << bps) - 1;
  // A depth of 1 to 4 bits, or an odd one, scales to 8 bits: v · 255 / (2^bits − 1), rounded.
  const toDepth = (v: number) => (bps === depth ? v : Math.round((v * M) / storedMax));
  if (palette) conversions.push("palette-to-rgb");
  if (photometric === 0) conversions.push("white-is-zero");
  if (!palette && bps !== depth) conversions.push("depth-to-8");
  if (alpha) conversions.push("alpha-on-white");
  const colours = 1 << bps;
  const raster = newRaster(widthPx, heightPx, colour, depth);
  const out = raster.data;
  for (let p = 0; p < widthPx * heightPx; p++) {
    const s = p * spp, o = p * colour;
    const values: number[] = palette
      // Palette entries are 16-bit; the high byte is the 8-bit colour.
      ? [colorMap![samples[s]] >> 8, colorMap![colours + samples[s]] >> 8, colorMap![2 * colours + samples[s]] >> 8]
      : Array.from({ length: colour }, (_, c) => toDepth(photometric === 0 ? storedMax - samples[s + c] : samples[s + c]));
    if (alpha) {
      const a = palette ? Math.round((samples[s + 1] * 255) / storedMax) : toDepth(samples[s + colour]);
      for (let c = 0; c < colour; c++) out[o + c] = alpha === 1 ? premultipliedOverWhite(values[c], a, M) : overWhite(values[c], a, M);
    } else for (let c = 0; c < colour; c++) out[o + c] = values[c];
  }
  return { format: "tiff", raster, conversions };
}

/** The working image of 8-bit RGBA from the browser's JPEG decoder; a one-component JPEG stays grey. */
export function rasterFromRgba(widthPx: number, heightPx: number, rgba: Uint8ClampedArray, grey: boolean): Raster {
  const raster = newRaster(widthPx, heightPx, grey ? 1 : 3, 8);
  const channels = raster.channels;
  for (let p = 0; p < widthPx * heightPx; p++) for (let c = 0; c < channels; c++) raster.data[p * channels + c] = rgba[p * 4 + c];
  return raster;
}

/** Decode an image file to its working image. The file's bytes are read, never changed. */
export async function decodeImage(bytes: Uint8Array, options: DecodeOptions): Promise<DecodedImage> {
  const format = detectFormat(bytes);
  if (format === "png") return rasterFromPng(await decodePng(bytes, options));
  if (format === "tiff") return rasterFromTiff(await decodeTiff(bytes, options));
  if (format === "jpeg") {
    const info = readImageInfo(bytes);
    if (!options.decodeJpeg) throw new ImageFormatError("JPEG files need a decoder.");
    const orientation = jpegOrientation(bytes);
    const { widthPx, heightPx, rgba } = await options.decodeJpeg(storedOrientationCopy(bytes));
    const stored = rasterFromRgba(widthPx, heightPx, rgba, info.colour === "grey");
    return { format, raster: orientRaster(stored, orientation), conversions: orientation === 1 ? [] : ["exif-orientation"] };
  }
  throw new ImageFormatError("The file is not a PNG, JPEG or TIFF image.");
}

// MARK: reading pixels

export interface PixelValue {
  x: number;
  y: number;
  /** The samples of the pixel: one grey value, or red, green and blue. */
  values: number[];
}

/** The pixel at whole-pixel coordinates, or null outside the image (x < 0, x ≥ width, and the same for y). */
export function pixelAt(raster: Raster, x: number, y: number): PixelValue | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= raster.widthPx || y >= raster.heightPx) return null;
  const at = (y * raster.widthPx + x) * raster.channels;
  return { x, y, values: Array.from(raster.data.subarray(at, at + raster.channels)) };
}

/**
 * The pixel under a point of an image drawn in a box: the point (px, py) in box units, the box `boxWidth` ×
 * `boxHeight` showing the whole raster. Pixel x covers [x, x + 1) in raster units, so the right and bottom edges
 * belong to no pixel.
 */
export function pixelUnder(raster: Raster, px: number, py: number, boxWidth: number, boxHeight: number): PixelValue | null {
  if (boxWidth <= 0 || boxHeight <= 0) return null;
  return pixelAt(raster, Math.floor((px * raster.widthPx) / boxWidth), Math.floor((py * raster.heightPx) / boxHeight));
}

// MARK: display

/**
 * Eight-bit RGBA for display. A 16-bit sample is shown across its full range: v · 255 / 65535, rounded. Display only;
 * the working image keeps its values.
 */
export function rasterToRgba(raster: Raster): Uint8ClampedArray {
  const { widthPx, heightPx, channels, bitDepth, data } = raster;
  const out = new Uint8ClampedArray(widthPx * heightPx * 4);
  const to8 = bitDepth === 16 ? (v: number) => Math.round(v / 257) : (v: number) => v;
  for (let p = 0; p < widthPx * heightPx; p++) {
    const s = p * channels, o = p * 4;
    if (channels === 1) out[o] = out[o + 1] = out[o + 2] = to8(data[s]);
    else { out[o] = to8(data[s]); out[o + 1] = to8(data[s + 1]); out[o + 2] = to8(data[s + 2]); }
    out[o + 3] = 255;
  }
  return out;
}
