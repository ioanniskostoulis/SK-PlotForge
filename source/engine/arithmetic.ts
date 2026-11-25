// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Maths with a constant and contrast enhancement (IMAGE-ANALYSIS.md, Maths; roadmap I21), each on every channel of a
// copy of its input. Results are rounded and clipped to 0 to M, M the depth's maximum; a step that clips says so in
// its summary when the image is shown (`mathClipped`).
//
// - Add, subtract, multiply and divide by a value; min sets every value below it to it, max every value above it
//   to it; set gives every pixel the value.
// - Gamma: M · (v / M)^γ. Log: M · ln(v) / ln(M), with ln(0) taken as 0.
// - Normalise: the range that leaves `saturated` percent of the pixels outside, half at each end (display.ts,
//   autoRange), stretched to 0 to M; a colour image takes one range from all its channels.
// - Equalise: v' = round(M · (C(v) − C(min)) / (N − C(min))), C the cumulative count and N the pixel count, the
//   classic histogram equalisation.
import { autoRange } from "./display";
import { maxValue, newRaster, type Raster } from "./raster";

export type MathOperation = "add" | "subtract" | "multiply" | "divide" | "min" | "max" | "gamma" | "log" | "set";
export const MATH_OPERATIONS: readonly MathOperation[] = ["add", "subtract", "multiply", "divide", "min", "max", "gamma", "log", "set"];
export type ContrastMethod = "normalize" | "equalize";
export const CONTRAST_METHODS: readonly ContrastMethod[] = ["normalize", "equalize"];

/** Why a maths operation cannot run with this value, or null. */
export function mathProblem(operation: MathOperation, value: number): string | null {
  if (!MATH_OPERATIONS.includes(operation)) return "The maths operation is not known.";
  if (operation !== "log" && !Number.isFinite(value)) return "The value must be a number.";
  if (operation === "divide" && value === 0) return "Dividing by 0 is not defined.";
  if (operation === "gamma" && !(value > 0 && value <= 10)) return "Gamma must be above 0 and at most 10.";
  return null;
}

/** The unrounded result of an operation on one value. */
function compute(operation: MathOperation, v: number, value: number, M: number): number {
  switch (operation) {
    case "add": return v + value;
    case "subtract": return v - value;
    case "multiply": return v * value;
    case "divide": return v / value;
    case "min": return Math.max(v, value);
    case "max": return Math.min(v, value);
    case "gamma": return M * Math.pow(v / M, value);
    case "log": return v > 0 ? (M * Math.log(v)) / Math.log(M) : 0;
    case "set": return value;
  }
}

/** One lookup per possible value, then the image through it. */
function throughTable(input: Raster, table: Uint16Array): Raster {
  const out = newRaster(input.widthPx, input.heightPx, input.channels, input.bitDepth);
  for (let i = 0; i < out.data.length; i++) out.data[i] = table[input.data[i]];
  return out;
}

export function applyMath(input: Raster, operation: MathOperation, value: number): Raster {
  const M = maxValue(input.bitDepth);
  const table = new Uint16Array(M + 1);
  for (let v = 0; v <= M; v++) table[v] = Math.min(M, Math.max(0, Math.round(compute(operation, v, value, M))));
  return throughTable(input, table);
}

/** How many of the image's samples a maths operation clips at 0 or M. */
export function mathClipped(input: Raster, operation: MathOperation, value: number): number {
  const M = maxValue(input.bitDepth);
  let clipped = 0;
  for (const v of input.data) { const r = Math.round(compute(operation, v, value, M)); if (r < 0 || r > M) clipped++; }
  return clipped;
}

export function applyContrast(input: Raster, method: ContrastMethod, saturated: number): Raster {
  const M = maxValue(input.bitDepth);
  const counts = new Float64Array(M + 1);
  for (const v of input.data) counts[v]++;
  const table = new Uint16Array(M + 1);
  if (method === "normalize") {
    const range = autoRange(counts, saturated);
    if (!range) return input;
    for (let v = 0; v <= M; v++) table[v] = Math.min(M, Math.max(0, Math.round(((v - range.min) * M) / (range.max - range.min))));
  } else {
    let cumulative = 0, first = -1;
    const total = input.data.length;
    const cdf = new Float64Array(M + 1);
    for (let v = 0; v <= M; v++) { cumulative += counts[v]; cdf[v] = cumulative; if (first < 0 && counts[v]) first = v; }
    const low = cdf[first];
    if (total === low) return input;
    for (let v = 0; v <= M; v++) table[v] = Math.round((M * Math.max(0, cdf[v] - low)) / (total - low));
  }
  return throughTable(input, table);
}
