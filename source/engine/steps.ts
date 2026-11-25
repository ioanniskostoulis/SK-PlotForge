// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The step list of an image (IMAGE-ANALYSIS.md, Step list). Steps run in order on a copy of the working image; each has
// a type, its parameters and an enabled flag, and a disabled step is passed over, so that the result without it can be
// seen. The original image, and the raster given to `applySteps`, are never changed.
//
// The Threshold step (IMAGE-ANALYSIS.md, Threshold as a step) splits the list in two. Its input is the grey working
// image at that point; its output is one binary mask per phase. Grey steps (everything but mask steps) belong before
// it, mask steps (erode, dilate, open, close, outline, fill holes) after it, and each mask step runs on every phase's
// mask separately, or on one phase's when it names one; phases never mix. A step on the wrong side is passed over with
// its reason. `applySteps` returns the working image, the grey result before the Threshold step; `stepPhases` gives
// the phases, each threshold carrying the mask steps that act on it as its operations, so `applyThreshold` makes the
// mask of a phase exactly as the list describes it.
import { maxValue, newRaster, type Channels, type Depth, type Raster } from "./raster";
import { parseRoi, roiMask, roiProblem, roiRecord, type Roi } from "./roi";
import { applyContrast, applyMath, CONTRAST_METHODS, MATH_OPERATIONS, mathProblem, type ContrastMethod, type MathOperation } from "./arithmetic";
import { applyCalculator, CALCULATOR_OPERATIONS, calculatorProblem, pasteInto, pasteProblem, type CalculatorOperation } from "./calculator";
import { applyFilter, FILTER_DEFAULTS, FILTER_KINDS, FILTER_VALUES, filterProblem, type FilterKind } from "./filters";
import { MASK_OPERATION_KINDS, maskOperationProblem, type MaskOperation, type MaskOperationKind } from "./binary";
import { MODEL_LIMITS, type Range } from "./colour";
import { newPhase, parsePhases, PhaseError, phaseRecord, type Phase } from "./phases";
import type { Threshold } from "./threshold";

// MARK: given values

/** Rec. 601 luminance weights of red, green and blue. */
export const LUMINANCE = [0.299, 0.587, 0.114] as const;

export type GreyMethod = "luminance" | "red" | "green" | "blue" | "mean";
export const GREY_METHODS: readonly GreyMethod[] = ["luminance", "red", "green", "blue", "mean"];
export type DepthMapping = "minmax" | "range";
export type FlipAxis = "horizontal" | "vertical";
/** Quarter turns clockwise: 90°, 180°, 270°. */
export type QuarterTurns = 1 | 2 | 3;

interface StepBase { id: string; enabled: boolean }
export type GreyStep = StepBase & { type: "grey"; method: GreyMethod };
/** `low` and `high` are used by the fixed range; min-max takes them from the image. */
export type EightBitStep = StepBase & { type: "8-bit"; mapping: DepthMapping; low: number; high: number };
/** A rectangle in the pixels of the image the step receives. */
export type CropStep = StepBase & { type: "crop"; x: number; y: number; width: number; height: number };
export type RotateStep = StepBase & { type: "rotate"; quarterTurns: QuarterTurns };
export type FlipStep = StepBase & { type: "flip"; axis: FlipAxis };
/**
 * Canvas size and translate: a new canvas of width × height filled with `value`, the image it receives placed with its
 * top-left corner at (x, y), which may be negative; what falls outside the canvas is cut. Translate is a canvas of the
 * image's own size with the image moved.
 */
export type CanvasStep = StepBase & { type: "canvas"; width: number; height: number; x: number; y: number; value: number };
/** Black and white points in the image's own values, and gamma (above 1 brightens the middle values). */
export type LevelsStep = StepBase & { type: "levels"; black: number; white: number; gamma: number };
export type InvertStep = StepBase & { type: "invert" };
/** A neighbourhood filter (filters.ts): its kind and the options it reads; the others are kept as they were. */
export type FilterStep = StepBase & { type: "filter"; filter: FilterKind; radius: number; weight: number; kernel: number[]; normalize: boolean; threshold: number };

/** Maths with a constant (arithmetic.ts). */
export type MathStep = StepBase & { type: "math"; operation: MathOperation; value: number };
/** Contrast enhancement: normalise with a percentage of saturated pixels, or equalise. */
export type ContrastStep = StepBase & { type: "contrast"; method: ContrastMethod; saturated: number };

/**
 * Fill a region (a copy, in pixels of the image the step receives) with one value in every channel, or everything
 * outside it ("Clear outside"). A line region has no inside, so it cannot be filled.
 */
export type FillStep = StepBase & { type: "fill"; region: Roi; value: number; outside: boolean };

/** The image calculator (calculator.ts): this image op the result of another image's steps. */
export type CalculatorStep = StepBase & { type: "calculator"; operation: CalculatorOperation; imageId: string };
/** Paste another image (a pasted clipboard image kept in the document) into a region; only inside it changes. */
export type PasteStep = StepBase & { type: "paste"; imageId: string; region: Roi };

/** The Threshold step: its phases, each a named threshold with its colour; their thresholds carry no mask operations. */
export type ThresholdStep = StepBase & { type: "threshold"; phases: Phase[] };
/** A mask step (binary.ts) after the Threshold step: on every phase's mask, or only on the phase `phase` names. */
export type MaskStep = StepBase & { type: "mask"; operation: MaskOperationKind; iterations: number; count?: number; phase?: string };

export type Step = GreyStep | EightBitStep | CropStep | RotateStep | FlipStep | CanvasStep | LevelsStep | InvertStep | FilterStep | MathStep | ContrastStep | FillStep | CalculatorStep | PasteStep | ThresholdStep | MaskStep;
export type StepType = Step["type"];
/** In the order of the step table of IMAGE-ANALYSIS.md, which is also the order of the menus. */
export const STEP_TYPES: readonly StepType[] = ["grey", "8-bit", "crop", "rotate", "flip", "canvas", "levels", "invert", "filter", "math", "contrast", "fill", "calculator", "paste", "threshold", "mask"];
/** The steps that run on the image, before the Threshold step: every type but the Threshold and mask steps. */
export const isGreyStep = (step: Pick<Step, "type">): boolean => step.type !== "threshold" && step.type !== "mask";

/**
 * The other images a step list reads, by id: the result of that image's own steps and its name, or a sentence saying
 * why it cannot be read (missing, not loaded, or depending back on this image).
 */
export type OtherImages = (imageId: string) => { name: string; raster: Raster } | string;

/** The shape of an image between steps: what the next step receives. */
export interface Shape { widthPx: number; heightPx: number; channels: Channels; bitDepth: Depth }

export const shapeOf = (raster: Raster): Shape => ({ widthPx: raster.widthPx, heightPx: raster.heightPx, channels: raster.channels, bitDepth: raster.bitDepth });

export interface StepProblem { id: string; message: string }

// MARK: new steps

/** A new step of a type, with the defaults for the image it will receive; the id is unique within `steps`. */
export function newStep(type: StepType, steps: readonly Step[], before: Shape): Step {
  const used = new Set(steps.map((step) => step.id));
  let n = steps.length + 1;
  while (used.has(`step-${n}`)) n++;
  const base = { id: `step-${n}`, enabled: true };
  const M = maxValue(before.bitDepth);
  switch (type) {
    case "grey": return { ...base, type, method: "luminance" };
    case "8-bit": return { ...base, type, mapping: "minmax", low: 0, high: M };
    case "crop": return { ...base, type, x: 0, y: 0, width: before.widthPx, height: before.heightPx };
    case "rotate": return { ...base, type, quarterTurns: 1 };
    case "flip": return { ...base, type, axis: "horizontal" };
    case "canvas": return { ...base, type, width: before.widthPx, height: before.heightPx, x: 0, y: 0, value: 0 };
    case "levels": return { ...base, type, black: 0, white: M, gamma: 1 };
    case "invert": return { ...base, type };
    case "filter": return { ...base, type, filter: "gaussian", ...FILTER_DEFAULTS, kernel: [...FILTER_DEFAULTS.kernel] };
    case "math": return { ...base, type, operation: "add", value: 10 };
    case "contrast": return { ...base, type, method: "normalize", saturated: 0.35 };
    case "fill": return { ...base, type, region: { id: "region", name: "Region", type: "rectangle", x: 0, y: 0, width: before.widthPx, height: before.heightPx }, value: 0, outside: false };
    case "calculator": return { ...base, type, operation: "subtract", imageId: "" };
    case "paste": return { ...base, type, imageId: "", region: { id: "region", name: "Region", type: "rectangle", x: 0, y: 0, width: before.widthPx, height: before.heightPx } };
    case "threshold": return { ...base, type, phases: [newPhase([], startingThreshold(before))] };
    case "mask": return { ...base, type, operation: "erode", iterations: 1 };
  }
}

/** The threshold a new Threshold step's first phase starts with: Otsu on light objects, or every colour on an RGB image. */
export const startingThreshold = (before: Pick<Shape, "channels">): Threshold => before.channels === 3
  ? { mode: "colour", model: "hsb", ranges: MODEL_LIMITS.hsb.map((range) => [range[0], range[1]]) as [Range, Range, Range] }
  : { mode: "otsu", objects: "light" };

/** Where a new step goes: a grey step before the Threshold step, any other at the end. */
export function insertIndex(steps: readonly Step[], type: StepType): number {
  const at = steps.findIndex((step) => step.type === "threshold");
  if (type === "threshold") { const mask = steps.findIndex((step) => step.type === "mask"); return mask < 0 ? steps.length : mask; }
  return type !== "mask" && at >= 0 ? at : steps.length;
}

// MARK: checking a step against its input

/** Why a step cannot run on an image of this shape, or null when it can. A step that cannot run is passed over. */
export function stepProblem(step: Step, before: Shape): string | null {
  const M = maxValue(before.bitDepth);
  if (step.type === "crop") {
    if (step.width < 1 || step.height < 1) return "The crop is empty. Give it a width and height of at least 1 px.";
    const box = clampCrop(step, before);
    if (!box) return `The crop lies outside the image, which is ${before.widthPx} × ${before.heightPx} px.`;
  }
  if (step.type === "canvas") {
    if (![step.width, step.height].every((n) => Number.isInteger(n) && n >= 1 && n <= MAX_CANVAS)) return `The canvas is a whole number of pixels from 1 to ${MAX_CANVAS} wide and high.`;
    if (!Number.isInteger(step.x) || !Number.isInteger(step.y)) return "The position is a whole number of pixels.";
    if (!(Number.isInteger(step.value) && step.value >= 0 && step.value <= M)) return `The background value is a whole number from 0 to ${M}.`;
  }
  if (step.type === "levels") {
    if (!(step.black >= 0 && step.white <= M)) return `Levels takes values from 0 to ${M} on this image.`;
    if (!(step.black < step.white)) return "Levels needs a black point below the white point.";
    if (!(step.gamma > 0)) return "Levels needs a gamma above 0.";
  }
  if (step.type === "filter") return filterProblem(step.filter, step);
  if (step.type === "math") return mathProblem(step.operation, step.value);
  if (step.type === "fill") {
    if (step.region.type === "line") return "A line has no inside to fill. Use a closed region.";
    const problem = roiProblem(step.region);
    if (problem) return problem;
    if (!(Number.isInteger(step.value) && step.value >= 0 && step.value <= M)) return `The fill value is a whole number from 0 to ${M}.`;
  }
  if ((step.type === "calculator" || step.type === "paste") && !step.imageId) return "Choose the other image this step reads.";
  if (step.type === "calculator" && !CALCULATOR_OPERATIONS.includes(step.operation)) return "The calculator operation is not known.";
  if (step.type === "paste") { if (step.region.type === "line") return "A line has no inside to paste into. Use a closed region."; const problem = roiProblem(step.region); if (problem) return problem; }
  if (step.type === "contrast" && !(step.saturated >= 0 && step.saturated < 100)) return "Saturated pixels are a percentage from 0 to below 100.";
  if (step.type === "threshold" && !step.phases.length) return "The Threshold step has no phase. Add one.";
  if (step.type === "mask") return maskOperationProblem({ kind: step.operation, iterations: step.iterations, count: step.count });
  if (step.type === "8-bit" && step.mapping === "range" && before.bitDepth === 16) {
    if (!(step.low >= 0 && step.high <= M && step.low < step.high)) return `The range needs a low value below the high value, from 0 to ${M}.`;
  }
  return null;
}

/** The largest canvas side, in pixels. */
export const MAX_CANVAS = 30000;

/** The crop rectangle cut to the image, in whole pixels, or null when nothing of it is inside. */
export function clampCrop(step: Pick<CropStep, "x" | "y" | "width" | "height">, before: Shape): { x: number; y: number; width: number; height: number } | null {
  const x0 = Math.max(0, Math.round(step.x)), y0 = Math.max(0, Math.round(step.y));
  const x1 = Math.min(before.widthPx, Math.round(step.x + step.width)), y1 = Math.min(before.heightPx, Math.round(step.y + step.height));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

// MARK: shapes

/** The shape a step gives an image of shape `before`, without touching pixels. */
export function shapeAfter(step: Step, before: Shape): Shape {
  if (!step.enabled || stepProblem(step, before)) return before;
  if (step.type === "grey") return { ...before, channels: 1 };
  if (step.type === "8-bit") return { ...before, bitDepth: 8 };
  if (step.type === "crop") { const box = clampCrop(step, before)!; return { ...before, widthPx: box.width, heightPx: box.height }; }
  if (step.type === "canvas") return { ...before, widthPx: step.width, heightPx: step.height };
  if (step.type === "rotate" && step.quarterTurns !== 2) return { ...before, widthPx: before.heightPx, heightPx: before.widthPx };
  return before;
}

/** The shape before each step, and the shape of the result last: `steps.length + 1` shapes. */
export function traceShapes(source: Shape, steps: readonly Step[]): Shape[] {
  const shapes = [source];
  for (const step of steps) shapes.push(shapeAfter(step, shapes[shapes.length - 1]));
  return shapes;
}

// MARK: the steps

/** Convert to grey. Luminance is round(0.299 R + 0.587 G + 0.114 B); mean is round((R + G + B) / 3). */
export function toGrey(input: Raster, method: GreyMethod): Raster {
  if (input.channels === 1) return input;
  const out = newRaster(input.widthPx, input.heightPx, 1, input.bitDepth);
  const M = maxValue(input.bitDepth);
  const d = input.data;
  for (let p = 0; p < out.data.length; p++) {
    const r = d[3 * p], g = d[3 * p + 1], b = d[3 * p + 2];
    const v = method === "luminance" ? LUMINANCE[0] * r + LUMINANCE[1] * g + LUMINANCE[2] * b
      : method === "mean" ? (r + g + b) / 3 : method === "red" ? r : method === "green" ? g : b;
    out.data[p] = Math.min(M, Math.round(v));
  }
  return out;
}

/**
 * Convert to 8 bits. The range [low, high] maps linearly onto [0, 255]: v' = round((v − low) · 255 / (high − low)),
 * values outside it clipped. Min-max takes low and high from the image; an image of one value becomes 0.
 */
export function toEightBit(input: Raster, mapping: DepthMapping, low: number, high: number): Raster {
  if (input.bitDepth === 8) return input;
  let lo = low, hi = high;
  if (mapping === "minmax") {
    lo = 65535; hi = 0;
    for (const v of input.data) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  const out = newRaster(input.widthPx, input.heightPx, input.channels, 8);
  const span = hi - lo;
  for (let i = 0; i < out.data.length; i++) {
    const v = Math.min(hi, Math.max(lo, input.data[i]));
    out.data[i] = span > 0 ? Math.round(((v - lo) * 255) / span) : 0;
  }
  return out;
}

export function crop(input: Raster, box: { x: number; y: number; width: number; height: number }): Raster {
  const out = newRaster(box.width, box.height, input.channels, input.bitDepth);
  const c = input.channels;
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * input.widthPx + box.x) * c;
    out.data.set(input.data.subarray(from, from + box.width * c), y * box.width * c);
  }
  return out;
}

/** Rotate clockwise by quarter turns. One turn sends (x, y) to (H − 1 − y, x); two to (W − 1 − x, H − 1 − y). */
export function rotate(input: Raster, quarterTurns: QuarterTurns): Raster {
  const { widthPx: W, heightPx: H, channels: c } = input;
  const odd = quarterTurns !== 2;
  const out = newRaster(odd ? H : W, odd ? W : H, c, input.bitDepth);
  const outW = out.widthPx;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [nx, ny] = quarterTurns === 1 ? [H - 1 - y, x] : quarterTurns === 2 ? [W - 1 - x, H - 1 - y] : [y, W - 1 - x];
      const from = (y * W + x) * c, to = (ny * outW + nx) * c;
      for (let k = 0; k < c; k++) out.data[to + k] = input.data[from + k];
    }
  }
  return out;
}

/** Mirror: horizontal sends x to W − 1 − x, vertical sends y to H − 1 − y. */
export function flip(input: Raster, axis: FlipAxis): Raster {
  const { widthPx: W, heightPx: H, channels: c } = input;
  const out = newRaster(W, H, c, input.bitDepth);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const from = (y * W + x) * c;
      const to = (axis === "horizontal" ? y * W + (W - 1 - x) : (H - 1 - y) * W + x) * c;
      for (let k = 0; k < c; k++) out.data[to + k] = input.data[from + k];
    }
  }
  return out;
}

/** A canvas of width × height in `value`, every channel, with the input's top-left pixel at (x, y). */
export function canvas(input: Raster, width: number, height: number, x: number, y: number, value: number): Raster {
  const c = input.channels, out = newRaster(width, height, c, input.bitDepth);
  if (value) out.data.fill(value);
  const x0 = Math.max(0, x), x1 = Math.min(width, x + input.widthPx);
  if (x1 <= x0) return out;
  for (let row = Math.max(0, y); row < Math.min(height, y + input.heightPx); row++) {
    const from = ((row - y) * input.widthPx + (x0 - x)) * c;
    out.data.set(input.data.subarray(from, from + (x1 - x0) * c), (row * width + x0) * c);
  }
  return out;
}

/**
 * Levels: t = (v − black) / (white − black), clipped to [0, 1], then v' = round(M · t^(1 / gamma)). Values at or
 * below the black point become 0, at or above the white point M. Each channel is mapped the same way.
 */
export function levels(input: Raster, black: number, white: number, gamma: number): Raster {
  const M = maxValue(input.bitDepth);
  const out = newRaster(input.widthPx, input.heightPx, input.channels, input.bitDepth);
  // One lookup per possible value, since a 16-bit image has at most 65536 of them.
  const table = new Uint16Array(M + 1);
  for (let v = 0; v <= M; v++) {
    const t = Math.min(1, Math.max(0, (v - black) / (white - black)));
    table[v] = Math.round(M * (gamma === 1 ? t : Math.pow(t, 1 / gamma)));
  }
  for (let i = 0; i < out.data.length; i++) out.data[i] = table[input.data[i]];
  return out;
}

/** Fill the pixels whose centres lie inside a region (or outside it) with one value, in every channel. */
export function fill(input: Raster, region: Roi, value: number, outside: boolean): Raster {
  const mask = roiMask(region, input);
  if (!mask) return input;
  const out = newRaster(input.widthPx, input.heightPx, input.channels, input.bitDepth);
  out.data.set(input.data);
  const c = input.channels;
  for (let p = 0; p < mask.length; p++) if (!mask[p] === outside) for (let k = 0; k < c; k++) out.data[p * c + k] = value;
  return out;
}

/** Invert: v' = M − v. */
export function invert(input: Raster): Raster {
  const M = maxValue(input.bitDepth);
  const out = newRaster(input.widthPx, input.heightPx, input.channels, input.bitDepth);
  for (let i = 0; i < out.data.length; i++) out.data[i] = M - input.data[i];
  return out;
}

// MARK: running the list

/** Why a step that reads another image cannot run with it, or null; other steps need nothing more. */
export function otherProblem(step: Step, input: Raster, others?: OtherImages): string | null {
  if (step.type !== "calculator" && step.type !== "paste") return null;
  const other = others ? others(step.imageId) : "The other image is not available.";
  if (typeof other === "string") return other;
  return step.type === "calculator" ? calculatorProblem(input, other.raster, other.name) : pasteProblem(input, other.raster, step.region);
}

/** One step on its input; a step that cannot run returns the input unchanged. */
export function applyStep(input: Raster, step: Step, others?: OtherImages): Raster {
  if (!step.enabled || stepProblem(step, input) || otherProblem(step, input, others)) return input;
  const out = runStep(input, step, others);
  return out === input ? out : carryOutside(input, out, step);
}

/**
 * The pixels outside the image after a step: a Canvas step adds those around the image it places, crop, rotate and flip
 * move them with the pixels, and every other step keeps them where they are.
 */
function carryOutside(input: Raster, out: Raster, step: Step): Raster {
  const through = (move: (mask: Raster) => Raster): Uint8Array => {
    const mask: Raster = { widthPx: input.widthPx, heightPx: input.heightPx, channels: 1, bitDepth: 8, data: input.outside ? Uint16Array.from(input.outside) : new Uint16Array(input.widthPx * input.heightPx) };
    return Uint8Array.from(move(mask).data);
  };
  let outside: Uint8Array | undefined = input.outside;
  if (step.type === "canvas") outside = through((mask) => canvas(mask, step.width, step.height, step.x, step.y, 1));
  else if (outside && step.type === "crop") outside = through((mask) => crop(mask, clampCrop(step, input)!));
  else if (outside && step.type === "rotate") outside = through((mask) => rotate(mask, step.quarterTurns));
  else if (outside && step.type === "flip") outside = through((mask) => flip(mask, step.axis));
  const { outside: _, ...rest } = out;
  return outside?.includes(1) ? { ...rest, outside } : rest;
}

function runStep(input: Raster, step: Step, others?: OtherImages): Raster {
  switch (step.type) {
    case "grey": return toGrey(input, step.method);
    case "8-bit": return toEightBit(input, step.mapping, step.low, step.high);
    case "crop": return crop(input, clampCrop(step, input)!);
    case "rotate": return rotate(input, step.quarterTurns);
    case "flip": return flip(input, step.axis);
    case "canvas": return canvas(input, step.width, step.height, step.x, step.y, step.value);
    case "levels": return levels(input, step.black, step.white, step.gamma);
    case "invert": return invert(input);
    case "filter": return applyFilter(input, step.filter, step);
    case "math": return applyMath(input, step.operation, step.value);
    case "contrast": return applyContrast(input, step.method, step.saturated);
    case "fill": return fill(input, step.region, step.value, step.outside);
    case "calculator": return applyCalculator(input, (others!(step.imageId) as { raster: Raster }).raster, step.operation).raster;
    case "paste": return pasteInto(input, (others!(step.imageId) as { raster: Raster }).raster, step.region);
    // The Threshold and mask steps make masks, never a new working image (`stepPhases`).
    case "threshold": case "mask": return input;
  }
}

/** Why a step cannot run where it stands in the list, or null: grey steps before the Threshold step, mask steps after it. */
export function placeProblem(steps: readonly Step[], index: number): string | null {
  const step = steps[index], at = steps.findIndex((item) => item.type === "threshold");
  if (step.type === "threshold") return at < index ? "An image has one Threshold step; this second one is passed over." : null;
  if (step.type === "mask") {
    if (at < 0 || at > index) return "A mask step acts on the masks of the Threshold step. Move it below the Threshold step.";
    const threshold = steps[at] as ThresholdStep;
    if (step.phase !== undefined && !threshold.phases.some((phase) => phase.id === step.phase)) return "The phase this step acts on is no longer in the Threshold step.";
    return null;
  }
  return at >= 0 && at < index ? "After the Threshold step only mask steps apply. Move this step above the Threshold step." : null;
}

/**
 * The working image after the enabled steps, in order, and the steps that could not run. The input is not changed: a
 * step that changes nothing passes its input on, and every other step writes a new raster.
 */
export function applySteps(source: Raster, steps: readonly Step[], others?: OtherImages): { raster: Raster; problems: StepProblem[] } {
  let raster = source;
  const problems: StepProblem[] = [];
  for (const [index, step] of steps.entries()) {
    if (!step.enabled) continue;
    const problem = placeProblem(steps, index) ?? stepProblem(step, raster) ?? otherProblem(step, raster, others);
    if (problem) { problems.push({ id: step.id, message: problem }); continue; }
    raster = applyStep(raster, step, others);
  }
  return { raster, problems };
}

// MARK: the Threshold step's phases

/** The Threshold step of a list, or null; a second one is passed over, so the first is the one. */
export const thresholdStep = (steps: readonly Step[]): ThresholdStep | null => (steps.find((step) => step.type === "threshold") as ThresholdStep | undefined) ?? null;

/** The mask steps that act on a phase, as mask operations in list order: those enabled, after the Threshold step, and runnable. */
export function phaseOperations(steps: readonly Step[], phaseId: string): MaskOperation[] {
  const at = steps.findIndex((step) => step.type === "threshold");
  if (at < 0) return [];
  return steps.slice(at + 1).filter((step): step is MaskStep => step.type === "mask" && step.enabled && (step.phase === undefined || step.phase === phaseId))
    .map((step) => ({ kind: step.operation, iterations: step.iterations, ...(step.count !== undefined ? { count: step.count } : {}) })).filter((operation) => !maskOperationProblem(operation));
}

/**
 * The phases the list makes: those of its Threshold step, when it is on, each threshold with the mask steps that act on
 * it as its operations. None without a Threshold step or with it off.
 */
export function stepPhases(steps: readonly Step[]): Phase[] {
  const step = thresholdStep(steps);
  if (!step?.enabled) return [];
  return step.phases.map((phase) => {
    const { operations: _, ...range } = phase.threshold;
    const operations = phaseOperations(steps, phase.id);
    return { ...phase, threshold: (operations.length ? { ...range, operations } : range) as Threshold };
  });
}

/** A phase's threshold as the Threshold step keeps it: its range, without mask operations, which are steps. */
export function rangeOnly(threshold: Threshold): Threshold {
  const { operations: _, ...range } = threshold;
  return range as Threshold;
}

// MARK: reading and checking stored steps

export class StepError extends Error {}

/** A step from a document, checked field by field; anything else is refused with a sentence. */
export function parseStep(raw: unknown): Step {
  const data = raw as Record<string, unknown>;
  if (!data || typeof data !== "object") throw new StepError("The document has an invalid step.");
  const id = data.id, type = data.type as StepType;
  if (typeof id !== "string" || !id) throw new StepError("The document has a step without an id.");
  if (!STEP_TYPES.includes(type)) throw new StepError(`The document has a step of an unknown type (${String(type)}).`);
  const base = { id, enabled: data.enabled !== false };
  const num = (key: string): number => {
    const value = data[key];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new StepError(`The ${type} step has an invalid ${key}.`);
    return value;
  };
  const oneOf = <T extends string>(key: string, choices: readonly T[]): T => {
    const value = data[key] as T;
    if (!choices.includes(value)) throw new StepError(`The ${type} step has an invalid ${key}.`);
    return value;
  };
  switch (type) {
    case "grey": return { ...base, type, method: oneOf("method", GREY_METHODS) };
    case "8-bit": return { ...base, type, mapping: oneOf("mapping", ["minmax", "range"] as const), low: num("low"), high: num("high") };
    case "crop": return { ...base, type, x: num("x"), y: num("y"), width: num("width"), height: num("height") };
    case "rotate": {
      const turns = num("quarterTurns");
      if (turns !== 1 && turns !== 2 && turns !== 3) throw new StepError("The rotate step has an invalid quarterTurns.");
      return { ...base, type, quarterTurns: turns };
    }
    case "flip": return { ...base, type, axis: oneOf("axis", ["horizontal", "vertical"] as const) };
    case "canvas": return { ...base, type, width: num("width"), height: num("height"), x: num("x"), y: num("y"), value: data.value === undefined ? 0 : num("value") };
    case "levels": return { ...base, type, black: num("black"), white: num("white"), gamma: num("gamma") };
    case "invert": return { ...base, type };
    case "filter": {
      const filter = oneOf("filter", FILTER_KINDS);
      const kernel = data.kernel === undefined ? [...FILTER_DEFAULTS.kernel] : data.kernel;
      if (!Array.isArray(kernel) || !kernel.every((value) => typeof value === "number" && Number.isFinite(value))) throw new StepError("The filter step has an invalid kernel.");
      return {
        ...base, type, filter, radius: data.radius === undefined ? FILTER_DEFAULTS.radius : num("radius"), weight: data.weight === undefined ? FILTER_DEFAULTS.weight : num("weight"),
        kernel: kernel as number[], normalize: data.normalize !== false, threshold: data.threshold === undefined ? FILTER_DEFAULTS.threshold : num("threshold"),
      };
    }
    case "math": return { ...base, type, operation: oneOf("operation", MATH_OPERATIONS), value: num("value") };
    case "contrast": return { ...base, type, method: oneOf("method", CONTRAST_METHODS), saturated: data.saturated === undefined ? 0.35 : num("saturated") };
    case "fill": {
      let region: Roi;
      try { region = parseRoi(data.region); } catch { throw new StepError("The fill step has an invalid region."); }
      return { ...base, type, region, value: num("value"), outside: data.outside === true };
    }
    case "threshold": {
      let phases: Phase[];
      try { phases = parsePhases(data.phases, undefined); } catch (error) { throw new StepError(error instanceof PhaseError ? error.message : "The threshold step has an invalid phase."); }
      return { ...base, type, phases: phases.map((phase) => ({ ...phase, threshold: rangeOnly(phase.threshold) })) };
    }
    case "mask": {
      const operation = oneOf("operation", MASK_OPERATION_KINDS), iterations = data.iterations === undefined ? 1 : num("iterations");
      const count = data.count === undefined ? undefined : num("count");
      if (maskOperationProblem({ kind: operation, iterations })) throw new StepError("The mask step has an invalid iterations.");
      if (maskOperationProblem({ kind: operation, iterations, count })) throw new StepError("The mask step has an invalid count.");
      if (data.phase !== undefined && (typeof data.phase !== "string" || !data.phase)) throw new StepError("The mask step has an invalid phase.");
      return { ...base, type, operation, iterations, ...(count !== undefined && count !== 1 ? { count } : {}), ...(typeof data.phase === "string" ? { phase: data.phase } : {}) };
    }
    case "calculator": case "paste": {
      if (typeof data.imageId !== "string") throw new StepError(`The ${type} step has an invalid imageId.`);
      if (type === "calculator") return { ...base, type, operation: oneOf("operation", CALCULATOR_OPERATIONS), imageId: data.imageId };
      let region: Roi;
      try { region = parseRoi(data.region); } catch { throw new StepError("The paste step has an invalid region."); }
      return { ...base, type, imageId: data.imageId, region };
    }
  }
}

/** A step with its fields in a fixed order, so that writing a document twice gives the same bytes. */
export function stepRecord(step: Step): Record<string, unknown> {
  const { id, enabled, type } = step;
  switch (step.type) {
    case "grey": return { id, type, enabled, method: step.method };
    case "8-bit": return { id, type, enabled, mapping: step.mapping, low: step.low, high: step.high };
    case "crop": return { id, type, enabled, x: step.x, y: step.y, width: step.width, height: step.height };
    case "rotate": return { id, type, enabled, quarterTurns: step.quarterTurns };
    case "flip": return { id, type, enabled, axis: step.axis };
    case "canvas": return { id, type, enabled, width: step.width, height: step.height, x: step.x, y: step.y, value: step.value };
    case "levels": return { id, type, enabled, black: step.black, white: step.white, gamma: step.gamma };
    case "invert": return { id, type, enabled };
    case "filter": {
      // Only the options the filter reads are written.
      const record: Record<string, unknown> = { id, type, enabled, filter: step.filter };
      for (const key of FILTER_VALUES[step.filter]) record[key] = step[key];
      if (step.filter === "convolve") { record.kernel = [...step.kernel]; record.normalize = step.normalize; }
      return record;
    }
    case "math": return { id, type, enabled, operation: step.operation, value: step.value };
    case "fill": return { id, type, enabled, region: roiRecord(step.region), value: step.value, outside: step.outside };
    case "calculator": return { id, type, enabled, operation: step.operation, imageId: step.imageId };
    case "paste": return { id, type, enabled, imageId: step.imageId, region: roiRecord(step.region) };
    case "threshold": return { id, type, enabled, phases: step.phases.map(phaseRecord) };
    case "mask": return { id, type, enabled, operation: step.operation, iterations: step.iterations, ...(step.count !== undefined && step.count !== 1 ? { count: step.count } : {}), ...(step.phase !== undefined ? { phase: step.phase } : {}) };
    case "contrast": return step.method === "normalize" ? { id, type, enabled, method: step.method, saturated: step.saturated } : { id, type, enabled, method: step.method };
  }
}
