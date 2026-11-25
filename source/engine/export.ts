// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Exporting images (IMAGE-ANALYSIS.md, Export): the result of the enabled steps, as a new PNG or JPEG file, and the
// results table as CSV. The naming, overwrite and protected-file rules are the shell's (`forge-shell/app/export-plan`,
// shell 5.0.0); PlotForge supplies its formats and its export options.
import { exportFileName, OVERWRITE_CHOICES, type ExportFormat as ShellExportFormat, type OverwriteChoice } from "forge-shell/app/export-plan";
import type { Raster } from "./raster";

export { OVERWRITE_CHOICES, type OverwriteChoice };

/** The formats PlotForge exports, for the shell's export dialog and main-process checks. */
export const EXPORT_FORMATS = {
  png: { id: "png", name: "PNG image", extensions: ["png"], mime: "image/png" },
  jpeg: { id: "jpeg", name: "JPEG image", extensions: ["jpg", "jpeg"], mime: "image/jpeg" },
  csv: { id: "csv", name: "CSV table", extensions: ["csv"], mime: "text/csv" },
  svg: { id: "svg", name: "SVG drawing", extensions: ["svg"], mime: "image/svg+xml" },
} as const satisfies Record<string, ShellExportFormat>;
export const EXPORT_FORMAT_LIST: readonly ShellExportFormat[] = Object.values(EXPORT_FORMATS);

// MARK: export options and the overwrite rule (IMAGE-ANALYSIS.md, Export and Settings layers)

export type ExportFormat = "png" | "jpeg";
export interface ExportOptions {
  format: ExportFormat;
  /** JPEG quality, 1 to 100. */
  jpegQuality: number;
  /** Draw the mask and region outlines into the picture; it is then a picture, not data. */
  includeOverlays: boolean;
  /** A calibration bar drawn into the picture, in a corner, or none; with one, the export is a picture, not data. */
  scaleBar: ScaleBarPlace;
  /** Checkered (alternating black and white blocks over two rows, numbered below, as a map scale) or a simple bar. */
  scaleBarStyle: ScaleBarStyle;
  /** The bar's length in the image's unit, or null for a round length near a fifth of the width. */
  scaleBarLength: number | null;
  /** A checkered bar's blocks, 1 to 5: the right half is one block and the rest is halved again (0, ⅛, ¼, ½, 1). */
  scaleBarBlocks: number;
  /** Thickness and text size, relative to the picture's shorter side, so equal pictures get equal bars. */
  scaleBarSize: ScaleBarSize;
  overwrite: OverwriteChoice;
}

export type ScaleBarPlace = "none" | "lower-right" | "lower-left" | "upper-right" | "upper-left";
export const SCALE_BAR_PLACES: readonly ScaleBarPlace[] = ["none", "lower-right", "lower-left", "upper-right", "upper-left"];
export type ScaleBarStyle = "checkered" | "simple";
export const SCALE_BAR_STYLES: readonly ScaleBarStyle[] = ["checkered", "simple"];
export type ScaleBarSize = "small" | "medium" | "large";
export const SCALE_BAR_SIZES: readonly ScaleBarSize[] = ["small", "medium", "large"];
/** Each size as a factor of the medium bar. */
export const SCALE_BAR_SIZE_FACTORS: Record<ScaleBarSize, number> = { small: 0.75, medium: 1, large: 1.5 };
export const MAX_SCALE_BAR_BLOCKS = 5;

/** The app's defaults: PNG, JPEG quality 90, no overlays, no calibration bar (checkered, automatic length, 4 blocks, medium), ask. */
export const DEFAULT_EXPORT: ExportOptions = {
  format: "png", jpegQuality: 90, includeOverlays: false,
  scaleBar: "none", scaleBarStyle: "checkered", scaleBarLength: null, scaleBarBlocks: 4, scaleBarSize: "medium", overwrite: "ask",
};

/** A typed bar length: a positive, finite number. */
export const isScaleBarLength = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Where a checkered bar of `blocks` blocks is divided, as fractions of its length: the right half is one block and
 * the left part is halved again, so 4 blocks give 0, ⅛, ¼, ½ and 1 (0, 2.5, 5, 10, 20 for a 20 nm bar).
 */
export function scaleBarTicks(blocks: number): number[] {
  const n = Math.min(MAX_SCALE_BAR_BLOCKS, Math.max(1, Math.round(blocks)));
  return [0, ...Array.from({ length: n - 1 }, (_, i) => 1 / 2 ** (n - 1 - i)), 1];
}

/** A tick's number: up to six significant digits, no trailing zeros (2.5, 0.625, 20). */
export const scaleBarNumber = (value: number): string => String(Number(value.toPrecision(6)));

/**
 * The calibration bar for an image `widthPx` wide at this scale: the longest of 1, 2 or 5 times a power of ten that
 * fits in `fraction` of the width, and its length in pixels (length / pixel width). In pixels when not calibrated.
 * A `fixed` length in the image's unit is used as it is, so bars match across images of one figure.
 */
export function scaleBarFor(scale: { x: number; unit: string }, widthPx: number, fraction = 0.2, fixed: number | null = null): { length: number; pixels: number; unit: string } {
  if (fixed !== null && isScaleBarLength(fixed)) return { length: fixed, pixels: fixed / scale.x, unit: scale.unit };
  const target = widthPx * fraction * scale.x;
  const power = 10 ** Math.floor(Math.log10(target));
  const length = [5, 2, 1].map((m) => m * power).find((value) => value <= target * (1 + 1e-12)) ?? power;
  return { length: Number(length.toPrecision(12)), pixels: length / scale.x, unit: scale.unit };
}

/** An image's file name for a format: `cells.png`, `cells.jpg` (the shell's `exportFileName`). */
export function exportFileNameAs(imageName: string, format: ExportFormat): string {
  return exportFileName(imageName, EXPORT_FORMATS[format]);
}

/** A picture's pixels as 8-bit RGB: a grey value copied to each channel, 16 bits divided by 257 and rounded. */
export function toRgb8(raster: Raster): Uint8Array {
  const { widthPx, heightPx, channels, bitDepth, data } = raster;
  const out = new Uint8Array(widthPx * heightPx * 3);
  const to8 = (v: number) => (bitDepth === 16 ? Math.round(v / 257) : v);
  for (let p = 0; p < widthPx * heightPx; p++) {
    for (let c = 0; c < 3; c++) out[p * 3 + c] = to8(data[p * channels + (channels === 1 ? 0 : c)]);
  }
  return out;
}
