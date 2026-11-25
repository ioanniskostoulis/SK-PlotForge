// Licensed under the GNU General Public License v2 or later. See LICENSE.
// One name for each step and each import conversion, used by the Document menu, the inspector and Terminal alike.
import { FILTER_VALUES, SIGMA_FILTERS } from "../engine";
import type { ThresholdMethod, CalculatorOperation, ContrastMethod, DepthMapping, FilterKind, MaskOperationKind, MathOperation, FlipAxis, GreyMethod, ImportConversion, QuarterTurns, Step, StepType } from "../engine";

export const STEP_NAMES: Record<StepType, string> = {
  grey: "Convert to grey", "8-bit": "Convert to 8-bit", crop: "Crop", rotate: "Rotate", flip: "Flip", canvas: "Canvas", levels: "Levels", invert: "Invert", math: "Maths", contrast: "Enhance contrast", filter: "Filter", fill: "Fill",
  calculator: "Image calculator", paste: "Paste into selection", threshold: "Threshold", mask: "Mask",
};

/** The automatic threshold methods' names, shared by the Threshold menu, the phase inspector and Settings. */
export const THRESHOLD_METHOD_LABELS: Record<ThresholdMethod, string> = {
  otsu: "Otsu", mean: "Mean", li: "Li", isodata: "IsoData", percentile: "Percentile", triangle: "Triangle", intermodes: "Intermodes", minimum: "Minimum",
  moments: "Moments", maxentropy: "MaxEntropy", yen: "Yen", ijisodata: "IJ IsoData", huang: "Huang", minerror: "MinError", renyientropy: "RenyiEntropy",
  shanbhag: "Shanbhag",
};

export const OPERATION_LABELS: Record<MaskOperationKind, string> = { erode: "Erode", dilate: "Dilate", open: "Open", close: "Close", outline: "Outline", fill: "Fill holes", skeleton: "Skeletonize" };
export const OPERATION_TIPS: Record<MaskOperationKind, string> = {
  erode: "Keep a pixel only when all 8 neighbours are in the mask; objects shrink by one pixel per iteration.",
  dilate: "Add every pixel next to the mask; objects grow by one pixel per iteration.",
  open: "Erode, then dilate: removes specks and thin bridges, keeps larger objects.",
  close: "Dilate, then erode: fills small gaps and notches.",
  outline: "Keep only the mask's edge pixels, one pixel wide.",
  fill: "Fill the holes inside objects: background that does not reach the image's edge.",
  skeleton: "Thin each object to lines one pixel wide along its middle, keeping its branches and holes.",
};

export const CALCULATOR_LABELS: Record<CalculatorOperation, string> = {
  add: "Add", subtract: "Subtract", multiply: "Multiply", divide: "Divide", and: "AND", or: "OR", xor: "XOR", min: "Min", max: "Max", average: "Average", difference: "Difference",
};
export const CALCULATOR_TIPS: Record<CalculatorOperation, string> = {
  add: "This image plus the other, clipped at the depth's maximum.", subtract: "This image minus the other, clipped at 0.",
  multiply: "This image times the other, clipped.", divide: "This image over the other, rounded; over 0 gives the maximum (0 over 0 gives 0).",
  and: "The bits both values have.", or: "The bits either value has.", xor: "The bits only one of the values has.",
  min: "The smaller of the two values.", max: "The larger of the two values.", average: "The mean of the two values, rounded.", difference: "The absolute difference of the two values.",
};

export const MATH_LABELS: Record<MathOperation, string> = {
  add: "Add", subtract: "Subtract", multiply: "Multiply", divide: "Divide", min: "Min", max: "Max", gamma: "Gamma", log: "Log", set: "Set",
};
export const MATH_TIPS: Record<MathOperation, string> = {
  add: "Add the value to every pixel.", subtract: "Subtract the value from every pixel.", multiply: "Multiply every pixel by the value.",
  divide: "Divide every pixel by the value.", min: "Raise every value below the value to it.", max: "Lower every value above the value to it.",
  gamma: "M × (v / M) to the power of the value, M the depth's maximum.", log: "M × ln(v) / ln(M); 0 stays 0.", set: "Give every pixel the value.",
};
export const CONTRAST_LABELS: Record<ContrastMethod, string> = { normalize: "Normalise", equalize: "Equalise" };

export const FILTER_LABELS: Record<FilterKind, string> = {
  gaussian: "Gaussian blur", mean: "Mean", median: "Median", min: "Minimum", max: "Maximum", variance: "Variance", unsharp: "Unsharp mask",
  smooth: "Smooth", sharpen: "Sharpen", edges: "Find edges", despeckle: "Despeckle", "bright-outliers": "Remove bright outliers",
  "dark-outliers": "Remove dark outliers", convolve: "Convolve",
};

/** A step's name as the list shows it: a filter by its kind, any other step by its type. */
export const stepName = (step: Step): string => (step.type === "filter" ? FILTER_LABELS[step.filter] : step.type === "mask" ? OPERATION_LABELS[step.operation]
  : step.type === "fill" && step.outside ? "Clear outside" : STEP_NAMES[step.type]);

export const GREY_METHOD_LABELS: Record<GreyMethod, string> = { luminance: "Luminance", red: "Red channel", green: "Green channel", blue: "Blue channel", mean: "Mean" };
export const MAPPING_LABELS: Record<DepthMapping, string> = { minmax: "Min-max", range: "Fixed range" };
export const TURN_LABELS: Record<QuarterTurns, string> = { 1: "90° clockwise", 2: "180°", 3: "90° counter-clockwise" };
export const AXIS_LABELS: Record<FlipAxis, string> = { horizontal: "Horizontal", vertical: "Vertical" };

export const CONVERSION_LABELS: Record<ImportConversion, string> = {
  "palette-to-rgb": "Palette expanded to RGB", "white-is-zero": "White-is-zero grey inverted", "depth-to-8": "Scaled to 8 bits", "alpha-on-white": "Alpha composited on white", "exif-orientation": "Turned upright by its EXIF orientation",
};

/** What import changed, as one phrase: "Palette expanded to RGB, alpha composited on white". */
export function conversionText(conversions: readonly ImportConversion[]): string {
  return conversions.map((item, index) => (index ? CONVERSION_LABELS[item].replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()) : CONVERSION_LABELS[item])).join(", ");
}

/** A phase's name in a step list, by id, for the summary of a mask step that names one. */
export const phaseNameIn = (steps: readonly Step[]) => (id: string): string =>
  (steps.find((step) => step.type === "threshold") as Extract<Step, { type: "threshold" }> | undefined)?.phases.find((phase) => phase.id === id)?.name ?? "a removed phase";

/** The parameters of a step in a few words, as the step list shows them beside its name. */
export function stepSummary(step: Step, nameOf: (imageId: string) => string = (id) => id || "no image", phaseName: (phaseId: string) => string = (id) => id): string {
  switch (step.type) {
    case "grey": return GREY_METHOD_LABELS[step.method];
    case "8-bit": return step.mapping === "minmax" ? MAPPING_LABELS.minmax : `${step.low} to ${step.high}`;
    case "crop": return `${step.width} × ${step.height} px at ${step.x}, ${step.y}`;
    case "rotate": return TURN_LABELS[step.quarterTurns];
    case "flip": return AXIS_LABELS[step.axis];
    case "canvas": return `${step.width} × ${step.height} px, image at ${step.x}, ${step.y}`;
    case "levels": return `${step.black} to ${step.white}, gamma ${step.gamma}`;
    case "invert": return "";
    case "filter":
      if (step.filter === "convolve") { const n = Math.round(Math.sqrt(step.kernel.length)); return `${n} × ${n}${step.normalize && step.kernel.reduce((a, b) => a + b, 0) !== 0 ? ", normalised" : ""}`; }
      if (!FILTER_VALUES[step.filter].length) return "3 × 3";
      return FILTER_VALUES[step.filter].map((key) => key !== "radius" ? `${key} ${step[key]}` : `${SIGMA_FILTERS.includes(step.filter) ? "σ" : "radius"} ${step.radius} px`).join(", ");
    case "math": return step.operation === "log" ? MATH_LABELS.log : `${MATH_LABELS[step.operation]} ${step.value}`;
    case "fill": return `${step.region.name}, value ${step.value}`;
    case "contrast": return step.method === "normalize" ? `${CONTRAST_LABELS.normalize}, ${step.saturated}% saturated` : CONTRAST_LABELS.equalize;
    case "calculator": return `${CALCULATOR_LABELS[step.operation]} ${nameOf(step.imageId)}`;
    case "paste": return `${nameOf(step.imageId)} into ${step.region.name}`;
    case "threshold": return step.phases.length === 1 ? step.phases[0].name : `${step.phases.length} phases`;
    case "mask": {
      const times = ["erode", "dilate", "open", "close"].includes(step.operation) && step.iterations > 1 ? `× ${step.iterations}` : "";
      const target = step.phase === undefined ? "each phase" : phaseName(step.phase);
      return times ? `${times}, ${target}` : target;
    }
  }
}

/** The Add step menu's groups, in order; each is a submenu of Document › Add step and of the inspector's Add step. */
export const STEP_GROUPS = ["Convert", "Geometry", "Adjust", "Filters", "Combine", "Threshold"] as const;
export type StepGroup = (typeof STEP_GROUPS)[number];

/** The menu items that add a step: an id suffix, the label, the step type, the parameters it starts with and its group. */
export const ADD_STEP_ITEMS: readonly { id: string; label: string; type: StepType; change?: Partial<Step>; group: StepGroup }[] = [
  { id: "grey", label: "Convert to grey", type: "grey", group: "Convert" },
  { id: "8-bit", label: "Convert to 8-bit", type: "8-bit", group: "Convert" },
  { id: "crop", label: "Crop", type: "crop", group: "Geometry" },
  { id: "rotate-cw", label: "Rotate 90° clockwise", type: "rotate", change: { quarterTurns: 1 }, group: "Geometry" },
  { id: "rotate-ccw", label: "Rotate 90° counter-clockwise", type: "rotate", change: { quarterTurns: 3 }, group: "Geometry" },
  { id: "rotate-180", label: "Rotate 180°", type: "rotate", change: { quarterTurns: 2 }, group: "Geometry" },
  { id: "flip-h", label: "Flip horizontal", type: "flip", change: { axis: "horizontal" }, group: "Geometry" },
  { id: "flip-v", label: "Flip vertical", type: "flip", change: { axis: "vertical" }, group: "Geometry" },
  { id: "translate", label: "Translate", type: "canvas", change: { x: 10, y: 10 }, group: "Geometry" },
  { id: "canvas", label: "Canvas size", type: "canvas", group: "Geometry" },
  { id: "levels", label: "Levels", type: "levels", group: "Adjust" },
  { id: "invert", label: "Invert", type: "invert", group: "Adjust" },
  { id: "contrast", label: "Enhance contrast", type: "contrast", group: "Adjust" },
  { id: "math", label: "Maths", type: "math", group: "Adjust" },
  ...(Object.entries(FILTER_LABELS) as [FilterKind, string][]).map(([filter, label]) => ({
    id: `filter-${filter}`, label, type: "filter" as const, change: { filter } as Partial<Step>, group: "Filters" as const,
  })),
  { id: "calculator", label: "Image calculator", type: "calculator", group: "Combine" },
  // The Threshold step, then the mask steps that act on each phase's mask after it.
  { id: "threshold", label: "Threshold", type: "threshold", group: "Threshold" },
  ...(Object.entries(OPERATION_LABELS) as [MaskOperationKind, string][]).map(([operation, label]) => ({
    id: `mask-${operation}`, label, type: "mask" as const, change: { operation } as Partial<Step>, group: "Threshold" as const,
  })),
];

/** The Add step items of each group, in menu order. */
export const stepGroupItems = (group: StepGroup) => ADD_STEP_ITEMS.filter((item) => item.group === group);

// MARK: filters

export const FILTER_TIPS: Record<FilterKind, string> = {
  gaussian: "A Gaussian of the given sigma, cut at 4 sigma, along x then y.",
  mean: "The mean of a circular neighbourhood.",
  median: "The median of a circular neighbourhood; removes specks and keeps edges.",
  min: "The smallest value of a circular neighbourhood; dark areas grow.",
  max: "The largest value of a circular neighbourhood; light areas grow.",
  variance: "The variance of a circular neighbourhood; high where values change.",
  unsharp: "Sharpens by taking away a weighted Gaussian blur: (value − weight × blur) / (1 − weight).",
  smooth: "The mean of each 3 × 3 neighbourhood.",
  sharpen: "The 3 × 3 kernel of −1 around 12, divided by 4.",
  edges: "The Sobel gradient's magnitude over each 3 × 3 neighbourhood.",
  despeckle: "The median of each 3 × 3 neighbourhood; removes single-pixel specks.",
  "bright-outliers": "A value more than the threshold above the median of its neighbourhood becomes that median.",
  "dark-outliers": "A value more than the threshold below the median of its neighbourhood becomes that median.",
  convolve: "A kernel of your own, an odd square of weights.",
};

/** A kernel as text: one row per line, weights separated by spaces. */
export function kernelText(kernel: readonly number[]): string {
  const n = Math.round(Math.sqrt(kernel.length));
  return Array.from({ length: n }, (_, row) => kernel.slice(row * n, row * n + n).join(" ")).join("\n");
}

/** A kernel from text: rows of numbers separated by spaces or commas, an odd square; null otherwise. */
export function parseKernel(text: string): number[] | null {
  const rows = text.trim().split(/\n+/).map((line) => line.trim().split(/[\s,]+/).filter(Boolean));
  const n = rows.length;
  if (n % 2 === 0 || rows.some((row) => row.length !== n)) return null;
  const values = rows.flat().map((word) => (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(word) ? Number(word) : NaN));
  return values.every(Number.isFinite) ? values : null;
}

/** A number, with or without its unit after it; NaN otherwise. */
export function parseNumber(text: string, unit: string): number {
  const match = /^\s*([-+]?(?:\d+\.?\d*|\.\d+))\s*(\S*)\s*$/.exec(text);
  if (!match || (match[2] && match[2] !== unit)) return NaN;
  return Number(match[1]);
}
