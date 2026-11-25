// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Images in the renderer. The engine decodes PNG and TIFF itself, keeping every stored sample; JPEG goes through the
// browser's decoder; the engine turns a JPEG upright by its EXIF orientation and records it. The working image after the steps is drawn from a canvas made for
// display. The bytes of the original are only read.
import { canvasBytes } from "forge-shell/app/raster-export";
import { overlayColor, pictureSurface } from "forge-shell/app/canvas-overlay";
import { applySteps, decodeImage, describeImage, displayRgba, encodePng, formatLength, isBox, scaleBarNumber, scaleBarTicks, toRgb8, SCALE_BAR_SIZE_FACTORS, type DisplaySettings, type ScaleBarPlace, type ScaleBarSize, type ScaleBarStyle, type Roi, type DecodedImage, type ImportedImage, type Raster, type Step, type StepProblem, type OtherImages, type TextLabel, PLOT_STYLE } from "../engine";

/** Inflate a zlib stream (PNG, Deflate-compressed TIFF) with the browser's decompressor. */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The browser's JPEG decoder, to 8-bit RGBA. The engine passes a copy whose orientation tag is 1, so these are the stored pixels. */
async function decodeJpeg(bytes: Uint8Array): Promise<{ widthPx: number; heightPx: number; rgba: Uint8ClampedArray }> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: "image/jpeg" }), { imageOrientation: "none", colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { widthPx: canvas.width, heightPx: canvas.height, rgba: context.getImageData(0, 0, canvas.width, canvas.height).data };
}

/** Decode an image file to its working image; a file PlotForge cannot read rejects with a sentence. */
export const decode = (bytes: Uint8Array): Promise<DecodedImage> => decodeImage(bytes, { inflate, decodeJpeg });

/** A canvas showing a raster through its display settings, for drawImage on the work surface. */
export function displayCanvas(raster: Raster, display?: DisplaySettings): OffscreenCanvas {
  const canvas = new OffscreenCanvas(raster.widthPx, raster.heightPx);
  canvas.getContext("2d")!.putImageData(new ImageData(displayRgba(raster, display) as Uint8ClampedArray<ArrayBuffer>, raster.widthPx, raster.heightPx), 0, 0);
  return canvas;
}

/** A canvas of a mask in an overlay colour (#rrggbbaa, from the settings' palette), transparent elsewhere. */
export function maskCanvas(mask: Uint8Array, widthPx: number, heightPx: number, colour: string): OffscreenCanvas {
  const [r, g, b, a] = [1, 3, 5, 7].map((at) => parseInt(colour.slice(at, at + 2), 16));
  const rgba = new Uint8ClampedArray(widthPx * heightPx * 4);
  for (let i = 0; i < mask.length; i++) if (mask[i]) rgba.set([r, g, b, a], i * 4);
  const canvas = new OffscreenCanvas(widthPx, heightPx);
  canvas.getContext("2d")!.putImageData(new ImageData(rgba, widthPx, heightPx), 0, 0);
  return canvas;
}

/** A canvas of classes: class k of each pixel drawn in `colours[k]` (#rrggbbaa), or transparent where it is null. */
export function classCanvas(classes: Uint8Array, widthPx: number, heightPx: number, colours: readonly (string | null)[]): OffscreenCanvas {
  const rgba = new Uint8ClampedArray(widthPx * heightPx * 4);
  const parsed = colours.map((colour) => (colour ? [1, 3, 5, 7].map((at) => parseInt(colour.slice(at, at + 2), 16)) : null));
  for (let i = 0; i < classes.length; i++) { const c = parsed[classes[i]]; if (c) rgba.set(c, i * 4); }
  const canvas = new OffscreenCanvas(widthPx, heightPx);
  canvas.getContext("2d")!.putImageData(new ImageData(rgba, widthPx, heightPx), 0, 0);
  return canvas;
}

/** Compress with the browser's zlib compressor, for PNG export. */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The PNG file of a working image: lossless, at its own depth (8 or 16 bits) and colour (grey or RGB). */
export const exportPng = (raster: Raster): Promise<Uint8Array> => encodePng(raster, deflate);

/**
 * A picture of a working image for export: 8-bit RGB (`toRgb8`), with the mask and region outlines drawn in when
 * `overlays` is given, encoded as PNG or JPEG (quality 1 to 100). Lossless PNG at full depth without overlays is
 * `exportPng`; this is for JPEG and for pictures with overlays, which are pictures and not data.
 */
export async function exportPicture(
  raster: Raster, format: "png" | "jpeg", quality: number, overlays: { masks: readonly OffscreenCanvas[]; rois: readonly Roi[]; labels?: readonly TextLabel[] } | null,
  scaleBar: ScaleBarDrawing | null = null,
): Promise<Uint8Array> {
  const { widthPx: W, heightPx: H } = raster;
  const rgb = toRgb8(raster);
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let p = 0; p < W * H; p++) { rgba[p * 4] = rgb[p * 3]; rgba[p * 4 + 1] = rgb[p * 3 + 1]; rgba[p * 4 + 2] = rgb[p * 3 + 2]; rgba[p * 4 + 3] = 255; }
  const canvas = new OffscreenCanvas(W, H);
  const context = canvas.getContext("2d")!;
  context.putImageData(new ImageData(rgba, W, H), 0, 0);
  if (overlays) {
    for (const mask of overlays.masks) context.drawImage(mask, 0, 0);
    // Outlines one pixel wide per 400 pixels of the shorter side, at least one, in the shell's overlay palette in order,
    // for the lightness of the picture, as on the work surface.
    context.lineWidth = Math.max(1, Math.round(Math.min(W, H) / 400));
    context.lineJoin = "round";
    const surface = pictureSurface({ data: rgba, width: W, height: H });
    for (const [index, roi] of overlays.rois.entries()) {
      context.strokeStyle = overlayColor(index, surface);
      context.beginPath();
      if (isBox(roi)) {
        if (roi.type === "rectangle") context.rect(roi.x, roi.y, roi.width, roi.height);
        else context.ellipse(roi.x + roi.width / 2, roi.y + roi.height / 2, roi.width / 2, roi.height / 2, 0, 0, 2 * Math.PI);
      } else {
        roi.points.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
        if (roi.type !== "line") context.closePath();
      }
      context.stroke();
    }
    if (overlays.labels?.length) drawLabels(context, overlays.labels, W, H);
  }
  if (scaleBar) drawScaleBar(context, W, H, scaleBar);
  if (format === "jpeg") return canvasBytes(canvas, "jpeg", { quality });
  // PNG: the composed picture read back and written as 8-bit RGB by the engine (a browser's encoder adds an alpha channel).
  const composed = context.getImageData(0, 0, W, H).data;
  const picture = new Uint16Array(W * H * 3);
  for (let p = 0; p < W * H; p++) { picture[p * 3] = composed[p * 4]; picture[p * 3 + 1] = composed[p * 4 + 1]; picture[p * 3 + 2] = composed[p * 4 + 2]; }
  return encodePng({ widthPx: W, heightPx: H, channels: 3, bitDepth: 8, data: picture }, deflate);
}

/** A calibration bar to draw: its length in pixels and in the image's unit, the corner, and how it looks. */
export interface ScaleBarDrawing {
  pixels: number;
  length: number;
  unit: string;
  place: Exclude<ScaleBarPlace, "none">;
  style: ScaleBarStyle;
  blocks: number;
  size: ScaleBarSize;
}

/**
 * A calibration bar in a corner. Its size follows the picture's shorter side (times the size's factor), so pictures
 * of one size get the same bar. Checkered: two rows of alternating black and white blocks, edged in black, and the
 * numbers below each division in plain black, the unit after the last, as a map scale, with no box behind them;
 * numbers that would touch their right neighbour are left out. Simple: a white bar with its length above, both
 * edged in black.
 */
export function drawScaleBar(context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, W: number, H: number, bar: ScaleBarDrawing): void {
  const side = Math.min(W, H) * SCALE_BAR_SIZE_FACTORS[bar.size];
  const margin = Math.max(4, Math.round(Math.min(W, H) / 40));
  const right = bar.place.endsWith("right"), lower = bar.place.startsWith("lower");
  context.save();
  if (bar.style === "simple") {
    const thick = Math.max(2, Math.round(side / 150)), size = Math.max(10, Math.round(side / 30));
    const label = formatLength(Number(bar.length.toPrecision(12)), bar.unit);
    const x = right ? W - margin - bar.pixels : margin;
    const barY = lower ? H - margin - thick : margin + size + Math.round(size / 4);
    context.font = `600 ${size}px ${PLOT_STYLE.font}`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.lineWidth = Math.max(1, thick / 2);
    context.strokeStyle = "#000000";
    context.fillStyle = "#ffffff";
    context.strokeRect(x, barY, bar.pixels, thick);
    context.fillRect(x, barY, bar.pixels, thick);
    context.lineWidth = Math.max(2, size / 6);
    context.lineJoin = "round";
    context.strokeText(label, x + bar.pixels / 2, barY - Math.round(size / 6));
    context.fillText(label, x + bar.pixels / 2, barY - Math.round(size / 6));
    context.restore();
    return;
  }
  const row = Math.max(3, Math.round(side / 55)), size = Math.max(9, Math.round(side / 30));
  const line = Math.max(1, Math.round(row / 5)), gap = Math.max(2, Math.round(size / 4));
  context.font = `${size}px ${PLOT_STYLE.font}`;
  const ticks = scaleBarTicks(bar.blocks);
  const numbers = ticks.map((fraction) => scaleBarNumber(fraction * bar.length));
  const widths = numbers.map((text) => context.measureText(text).width);
  const unitText = ` ${bar.unit}`, unitWidth = context.measureText(unitText).width;
  const leftOver = widths[0] / 2, rightOver = widths[widths.length - 1] / 2 + unitWidth;
  const totalW = leftOver + bar.pixels + rightOver, totalH = 2 * row + gap + size;
  const x = (right ? W - margin - totalW : margin) + leftOver, y = lower ? H - margin - totalH : margin;
  // Blocks on white: the first row black, white, black…; the second row the other way round; the bar edged in black.
  context.fillStyle = "#ffffff";
  context.fillRect(x, y, bar.pixels, 2 * row);
  context.strokeStyle = "#000000";
  context.lineWidth = line;
  context.fillStyle = "#000000";
  for (let i = 0; i < ticks.length - 1; i++) {
    const from = x + ticks[i] * bar.pixels, to = x + ticks[i + 1] * bar.pixels;
    context.fillRect(from, y + (i % 2 ? row : 0), to - from, row);
  }
  context.strokeRect(x, y, bar.pixels, 2 * row);
  // Numbers in plain black, centred under their divisions, kept from the right so the length and its unit are always shown.
  context.textBaseline = "top";
  context.textAlign = "center";
  const textY = y + 2 * row + gap;
  const text = (value: string, at: number) => context.fillText(value, at, textY);
  let limit = Infinity;
  for (let i = ticks.length - 1; i >= 0; i--) {
    const at = x + ticks[i] * bar.pixels, half = widths[i] / 2;
    if (at + half > limit - gap) continue;
    text(numbers[i], at);
    limit = at - half;
  }
  context.textAlign = "left";
  text(unitText, x + bar.pixels + widths[widths.length - 1] / 2);
  context.restore();
}

/**
 * Overlay text in pixels of the picture, white edged in black like the calibration bar, 1/30 of the shorter side
 * tall; each label's point is the left end of its baseline.
 */
export function drawLabels(context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, labels: readonly TextLabel[], W: number, H: number): void {
  const size = Math.max(10, Math.round(Math.min(W, H) / 30));
  context.save();
  context.font = `600 ${size}px ${PLOT_STYLE.font}`;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.lineWidth = Math.max(2, size / 6);
  context.lineJoin = "round";
  context.strokeStyle = "#000000";
  context.fillStyle = "#ffffff";
  for (const label of labels) { context.strokeText(label.text, label.x, label.y); context.fillText(label.text, label.x, label.y); }
  context.restore();
}

/** The picture as it is shown, 8 bits per channel, as PNG bytes, for the clipboard. */
export async function shownPng(canvas: OffscreenCanvas): Promise<Uint8Array> {
  return canvasBytes(canvas, "png");
}

/** An image ready to show and measure: the decoded original, and the result of its steps. */
export interface ReadyImage {
  kind: "ready";
  decoded: DecodedImage;
  /** The steps the result was made from, as text, so that a change of the steps is noticed. */
  stepsKey: string;
  working: Raster;
  problems: StepProblem[];
  /** The display settings the canvas was drawn with, as text. */
  displayKey: string;
  canvas: OffscreenCanvas;
}

/** Run the steps on the decoded original and make the canvas that shows the result. */
export function processed(decoded: DecodedImage, steps: readonly Step[], display?: DisplaySettings, others?: OtherImages, stepsKey = JSON.stringify(steps)): ReadyImage {
  const { raster, problems } = applySteps(decoded.raster, steps, others);
  return { kind: "ready", decoded, stepsKey, working: raster, problems, displayKey: JSON.stringify(display ?? null), canvas: displayCanvas(raster, display) };
}

/** The same result drawn with other display settings; the steps are not run again. */
export function redisplayed(ready: ReadyImage, display?: DisplaySettings): ReadyImage {
  return { ...ready, displayKey: JSON.stringify(display ?? null), canvas: displayCanvas(ready.working, display) };
}

export interface LoadedImage extends ImportedImage { decoded: DecodedImage }

/** Describe and decode one image file. */
export async function loadImage(bytes: Uint8Array): Promise<LoadedImage> {
  const imported = describeImage(bytes);
  return { ...imported, decoded: await decode(bytes) };
}
