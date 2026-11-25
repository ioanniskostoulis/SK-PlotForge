// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Calibration (IMAGE-ANALYSIS.md, Calibration): how many real units one pixel spans. It is set per image or as the
// document's default, by a known length (a distance of so many pixels is so long) or directly as units per pixel, with
// the pixel aspect ratio. It changes reported lengths, areas and perimeters only: pixels, steps, thresholds, masks
// and percentages never read it. Without a calibration, measurements are in pixels and say so.
import type { Step } from "./steps";

// MARK: given values

export const LENGTH_UNITS = ["nm", "µm", "mm", "cm", "m", "in"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

/** How the calibration was entered; both are stored as a pixel length and a real length. */
export type CalibrationMode = "known" | "scale";

export interface Calibration {
  mode: CalibrationMode;
  /** A distance in pixels, measured along x, and its real length. Direct entry stores 1 px and the units per pixel. */
  pixelLength: number;
  realLength: number;
  unit: LengthUnit;
  /** Pixel aspect ratio: the height of a pixel over its width; 1 for square pixels. */
  aspect: number;
  /** A known length taken from a line region of the image: its id. The pixel length then follows the line. */
  line?: string;
}

/** An image's own choice: a calibration, pixels whatever the document says, or null to follow the document. */
export type ImageCalibration = Calibration | "pixels" | null;

/** The real size of one pixel, along x and y, in `unit`; 1 × 1 px when not calibrated. */
export interface Scale { x: number; y: number; unit: LengthUnit | "px" }

export const PIXELS: Scale = { x: 1, y: 1, unit: "px" };

// MARK: new calibrations

/** A known length: `pixels` pixels along x span `length` units. */
export function knownLength(pixels: number, length: number, unit: LengthUnit, aspect = 1): Calibration {
  return { mode: "known", pixelLength: pixels, realLength: length, unit, aspect };
}

/** A direct scale: one pixel spans `perPixel` units along x. */
export function directScale(perPixel: number, unit: LengthUnit, aspect = 1): Calibration {
  return { mode: "scale", pixelLength: 1, realLength: perPixel, unit, aspect };
}

/** Why a calibration cannot be used, or null. Every length and the aspect ratio must be finite and above 0. */
export function calibrationProblem(calibration: Calibration): string | null {
  const positive = (value: number) => Number.isFinite(value) && value > 0;
  if (!positive(calibration.pixelLength)) return "The pixel length must be above 0.";
  if (!positive(calibration.realLength)) return "The real length must be above 0.";
  if (!positive(calibration.aspect)) return "The pixel aspect ratio must be above 0.";
  if (!LENGTH_UNITS.includes(calibration.unit)) return `The unit is one of ${LENGTH_UNITS.join(", ")}.`;
  return null;
}

// MARK: from a drawn line

/**
 * The length of a line drawn on the result of the steps, in pixels of the original image along x, which is what a
 * known length's pixel length means. An odd number of quarter turns swaps the axes back; a pixel's height counts as
 * `aspect` widths. Flips and crops keep lengths.
 */
export function linePixelLength(points: readonly (readonly [number, number])[], steps: readonly Step[], aspect = 1): number {
  const turns = steps.reduce((sum, step) => sum + (step.enabled && step.type === "rotate" ? step.quarterTurns : 0), 0);
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i - 1][0], dy = points[i][1] - points[i - 1][1];
    const [ox, oy] = turns % 2 ? [dy, dx] : [dx, dy];
    total += Math.hypot(ox, oy * aspect);
  }
  return total;
}

/** A known length from a line: the line spans `length` units; the calibration keeps the line's id. */
export function lineCalibration(lineId: string, points: readonly (readonly [number, number])[], steps: readonly Step[], length: number, unit: LengthUnit, aspect = 1): Calibration {
  return { ...knownLength(linePixelLength(points, steps, aspect), length, unit, aspect), line: lineId };
}

// MARK: which calibration applies

export type CalibrationSource = "image" | "document" | "app" | "none";

/**
 * The calibration in effect for an image: its own, else the document's default, else the app's default calibration,
 * else none (pixels). "pixels" keeps an image in pixels whatever the defaults.
 */
export function resolveCalibration(own: ImageCalibration, documentDefault: Calibration | null, appDefault: Calibration | null = null): { calibration: Calibration | null; from: CalibrationSource } {
  if (own === "pixels") return { calibration: null, from: "none" };
  if (own) return { calibration: own, from: "image" };
  if (documentDefault) return { calibration: documentDefault, from: "document" };
  return appDefault ? { calibration: appDefault, from: "app" } : { calibration: null, from: "none" };
}

// MARK: the scale

/** The size of one pixel: x = real length / pixel length, y = x · aspect. */
export function scaleOf(calibration: Calibration | null): Scale {
  if (!calibration || calibrationProblem(calibration)) return PIXELS;
  const x = calibration.realLength / calibration.pixelLength;
  return { x, y: x * calibration.aspect, unit: calibration.unit };
}

/**
 * The scale of the result of the steps. Steps never resample, so a pixel keeps its size; only an odd number of
 * quarter turns, among the enabled rotate steps, swaps the pixel's width and height.
 */
export function scaleAfterSteps(scale: Scale, steps: readonly Step[]): Scale {
  const turns = steps.reduce((sum, step) => sum + (step.enabled && step.type === "rotate" ? step.quarterTurns : 0), 0);
  return turns % 2 ? { x: scale.y, y: scale.x, unit: scale.unit } : scale;
}

/** The length of a displacement of (dx, dy) pixels: √((dx · sx)² + (dy · sy)²). */
export function lengthOf(dxPx: number, dyPx: number, scale: Scale): number {
  return Math.hypot(dxPx * scale.x, dyPx * scale.y);
}

/** The area of `pixels` pixels: pixels · sx · sy, in the unit squared. */
export function areaOf(pixels: number, scale: Scale): number {
  return pixels * scale.x * scale.y;
}

/** The position of a pixel's top-left corner, in real units from the top-left of the image. */
export function positionOf(xPx: number, yPx: number, scale: Scale): [number, number] {
  return [xPx * scale.x, yPx * scale.y];
}

// MARK: wording

/** A measured value with four significant digits and no trailing zeros: 0.25, 12.35, 1234, 0.0001235, 1.2e+6. */
export function formatMeasure(value: number): string {
  if (value === 0) return "0";
  if (Number.isInteger(value) && Math.abs(value) < 1e6) return String(value);
  // Below a million, the rounded number as JavaScript writes it (0.00001235); above, in exponent form (1.235e+6).
  if (Math.abs(value) < 1e6) return String(Number(value.toPrecision(4)));
  return value.toPrecision(4).replace(/\.?0+e/, "e");
}

/** A length with its unit, a space between: `0.25 µm`, `12 px`. */
export const formatLength = (value: number, unit: string): string => `${formatMeasure(value)} ${unit}`;
/** An area with its unit squared: `40 µm²`, `120 px²`. */
export const formatArea = (value: number, unit: string): string => `${formatMeasure(value)} ${unit}²`;

// MARK: reading and writing

export class CalibrationError extends Error {}

/** A calibration from a document, checked; anything else is refused with a sentence. */
export function parseCalibration(raw: unknown): Calibration {
  const data = raw as Record<string, unknown>;
  if (!data || typeof data !== "object") throw new CalibrationError("The document has an invalid calibration.");
  const calibration = {
    mode: data.mode === "scale" ? "scale" : "known", pixelLength: data.pixelLength, realLength: data.realLength, unit: data.unit, aspect: data.aspect ?? 1,
  } as Calibration;
  if (data.line !== undefined) {
    if (typeof data.line !== "string" || calibration.mode !== "known") throw new CalibrationError("The calibration has an invalid line.");
    calibration.line = data.line;
  }
  for (const key of ["pixelLength", "realLength", "aspect"] as const) {
    if (typeof calibration[key] !== "number") throw new CalibrationError(`The calibration has an invalid ${key}.`);
  }
  const problem = calibrationProblem(calibration);
  if (problem) throw new CalibrationError(`The calibration is not valid. ${problem}`);
  return calibration;
}

/** An image's own choice from a document: absent or null follows the document, "pixels" stays in pixels. */
export function parseImageCalibration(raw: unknown): ImageCalibration {
  if (raw === undefined || raw === null) return null;
  if (raw === "pixels") return "pixels";
  return parseCalibration(raw);
}

/** A calibration with its fields in a fixed order, so that writing a document twice gives the same bytes. */
export function calibrationRecord(calibration: Calibration): Record<string, unknown> {
  const record: Record<string, unknown> = { mode: calibration.mode, pixelLength: calibration.pixelLength, realLength: calibration.realLength, unit: calibration.unit, aspect: calibration.aspect };
  if (calibration.line !== undefined) record.line = calibration.line;
  return record;
}
