// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Neighbourhood filters (IMAGE-ANALYSIS.md, Filters), each run on every channel of a copy of its input. Pixels beyond
// the image's edge repeat the nearest edge pixel. Results are rounded to whole values and clipped to 0 to M, where M
// is the largest value of the image's depth.
//
// - Gaussian blur: a normalised Gaussian of standard deviation σ (in pixels), cut at 4σ, run along x then y.
// - Mean, median, minimum, maximum and variance take the pixels of a circular neighbourhood of radius r, the same
//   kernel as ImageJ's rank filters: the rows dy from −r to r reach |dx| ≤ √(r² + 1 − dy²). Variance is the
//   population variance of the neighbourhood.
// - Unsharp mask: (v − w · blur) / (1 − w), blur being the Gaussian blur of σ and w the weight, from 0.1 to 0.9.
// - Smooth is the 3 × 3 mean; Sharpen is the 3 × 3 kernel −1 around 12, divided by 4; Find edges is the magnitude of
//   the 3 × 3 Sobel gradients, √(gx² + gy²).
// - Despeckle is the median of radius 1 (the 3 × 3 neighbourhood), as ImageJ's Despeckle.
// - Remove bright (dark) outliers replaces a value by the median of radius r when it is more than the threshold above
//   (below) that median; other values stay.
// - Convolve takes an odd square kernel, applied as written (not mirrored, as ImageJ does), divided by the sum of its
//   weights when asked and that sum is not 0.
import { maxValue, newRaster, type Raster } from "./raster";

export type FilterKind = "gaussian" | "mean" | "median" | "min" | "max" | "variance" | "unsharp" | "smooth" | "sharpen" | "edges"
  | "despeckle" | "bright-outliers" | "dark-outliers" | "convolve";
export const FILTER_KINDS: readonly FilterKind[] = [
  "gaussian", "mean", "median", "min", "max", "variance", "unsharp", "smooth", "sharpen", "edges", "despeckle", "bright-outliers", "dark-outliers", "convolve",
];
/** A number option a filter reads; the radius is σ for Gaussian blur and unsharp mask. */
export type FilterValue = "radius" | "weight" | "threshold";
/**
 * The number options each filter reads, in the order Terminal takes them. The one place this is decided: saving,
 * the inspector, the step list's summary and `step add` all read it. Convolve reads its kernel instead.
 */
export const FILTER_VALUES: Readonly<Record<FilterKind, readonly FilterValue[]>> = {
  gaussian: ["radius"], mean: ["radius"], median: ["radius"], min: ["radius"], max: ["radius"], variance: ["radius"], unsharp: ["radius", "weight"],
  smooth: [], sharpen: [], edges: [], despeckle: [], "bright-outliers": ["radius", "threshold"], "dark-outliers": ["radius", "threshold"], convolve: [],
};
/** Filters whose radius is σ, the Gaussian's standard deviation, rather than a neighbourhood's radius. */
export const SIGMA_FILTERS: readonly FilterKind[] = ["gaussian", "unsharp"];
/** Filters with a radius, and filters with a threshold (removing outliers). */
export const RADIUS_FILTERS: readonly FilterKind[] = FILTER_KINDS.filter((kind) => FILTER_VALUES[kind].includes("radius"));
export const THRESHOLD_FILTERS: readonly FilterKind[] = FILTER_KINDS.filter((kind) => FILTER_VALUES[kind].includes("threshold"));

export interface FilterOptions {
  /** σ in pixels for Gaussian blur and unsharp mask; the neighbourhood's radius for the rank filters. */
  radius: number;
  /** The unsharp mask's weight, from 0.1 to 0.9. */
  weight: number;
  /** Convolve's kernel, row by row, and whether to divide it by the sum of its weights. */
  kernel: readonly number[];
  normalize: boolean;
  /** How far from the median a value must be to count as an outlier, in the image's own values. */
  threshold: number;
}

export const FILTER_DEFAULTS: FilterOptions = { radius: 2, weight: 0.6, kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0], normalize: true, threshold: 50 };
export const MAX_RADIUS = 50;

/** Why a filter cannot run with these options, or null. */
export function filterProblem(kind: FilterKind, options: FilterOptions): string | null {
  if (SIGMA_FILTERS.includes(kind)) {
    if (!(options.radius > 0 && options.radius <= MAX_RADIUS)) return `The sigma must be above 0 and at most ${MAX_RADIUS} px.`;
  } else if (RADIUS_FILTERS.includes(kind) && !(options.radius >= 0.5 && options.radius <= MAX_RADIUS)) {
    return `The radius must be from 0.5 to ${MAX_RADIUS} px.`;
  }
  if (THRESHOLD_FILTERS.includes(kind) && !(options.threshold >= 0 && Number.isFinite(options.threshold))) return "The threshold must be a number from 0.";
  if (kind === "unsharp" && !(options.weight >= 0.1 && options.weight <= 0.9)) return "The weight must be from 0.1 to 0.9.";
  if (kind === "convolve") {
    const n = Math.sqrt(options.kernel.length);
    if (!Number.isInteger(n) || n % 2 === 0 || n > 2 * MAX_RADIUS + 1) return "The kernel must be square with an odd size, such as 3 × 3 or 5 × 5.";
    if (!options.kernel.every(Number.isFinite)) return "Every kernel weight must be a number.";
  }
  return null;
}

// MARK: planes

/** Run `filter` on each channel as a plane of numbers, then round and clip into a new raster of the same shape. */
function perChannel(input: Raster, filter: (plane: Float64Array, width: number, height: number) => Float64Array): Raster {
  const { widthPx: W, heightPx: H, channels: c } = input;
  const M = maxValue(input.bitDepth);
  const out = newRaster(W, H, c, input.bitDepth);
  const plane = new Float64Array(W * H);
  for (let k = 0; k < c; k++) {
    for (let p = 0; p < W * H; p++) plane[p] = input.data[p * c + k];
    const result = filter(plane, W, H);
    for (let p = 0; p < W * H; p++) out.data[p * c + k] = Math.min(M, Math.max(0, Math.round(result[p])));
  }
  return out;
}

const clampIndex = (i: number, n: number) => (i < 0 ? 0 : i >= n ? n - 1 : i);

/** The normalised Gaussian weights from −⌈4σ⌉ to ⌈4σ⌉. */
export function gaussianKernel(sigma: number): Float64Array {
  const half = Math.max(1, Math.ceil(4 * sigma));
  const weights = new Float64Array(2 * half + 1);
  let sum = 0;
  for (let i = -half; i <= half; i++) sum += weights[i + half] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < weights.length; i++) weights[i] /= sum;
  return weights;
}

function gaussianPlane(plane: Float64Array, W: number, H: number, sigma: number): Float64Array {
  const weights = gaussianKernel(sigma), half = (weights.length - 1) / 2;
  const across = new Float64Array(W * H), out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let i = -half; i <= half; i++) sum += weights[i + half] * plane[y * W + clampIndex(x + i, W)];
      across[y * W + x] = sum;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0;
      for (let i = -half; i <= half; i++) sum += weights[i + half] * across[clampIndex(y + i, H) * W + x];
      out[y * W + x] = sum;
    }
  }
  return out;
}

/** The offsets (dx, dy) of the circular neighbourhood of radius r, as ImageJ's rank filters take it. */
export function circleOffsets(radius: number): [number, number][] {
  const r2 = radius * radius + 1, reach = Math.floor(Math.sqrt(r2 + 1e-10));
  const offsets: [number, number][] = [];
  for (let dy = -reach; dy <= reach; dy++) {
    const dx = Math.floor(Math.sqrt(r2 - dy * dy) + 1e-10);
    for (let x = -dx; x <= dx; x++) offsets.push([x, dy]);
  }
  return offsets;
}

function rankPlane(plane: Float64Array, W: number, H: number, kind: "mean" | "median" | "min" | "max" | "variance", radius: number): Float64Array {
  const offsets = circleOffsets(radius), n = offsets.length;
  const values = new Float64Array(n), out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let i = 0; i < n; i++) values[i] = plane[clampIndex(y + offsets[i][1], H) * W + clampIndex(x + offsets[i][0], W)];
      let result: number;
      if (kind === "median") { values.sort(); result = n % 2 ? values[(n - 1) / 2] : (values[n / 2 - 1] + values[n / 2]) / 2; }
      else if (kind === "min") { result = Infinity; for (const v of values) if (v < result) result = v; }
      else if (kind === "max") { result = -Infinity; for (const v of values) if (v > result) result = v; }
      else {
        let sum = 0, sum2 = 0;
        for (const v of values) { sum += v; sum2 += v * v; }
        const mean = sum / n;
        result = kind === "mean" ? mean : Math.max(0, sum2 / n - mean * mean);
      }
      out[y * W + x] = result;
    }
  }
  return out;
}

/** A square kernel of odd size applied as written, not mirrored; edge pixels repeat. */
function kernelPlane(plane: Float64Array, W: number, H: number, kernel: readonly number[], scale: number): Float64Array {
  const size = Math.sqrt(kernel.length), half = (size - 1) / 2;
  const out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0, i = 0;
      for (let v = -half; v <= half; v++) {
        const row = clampIndex(y + v, H) * W;
        for (let u = -half; u <= half; u++) sum += kernel[i++] * plane[row + clampIndex(x + u, W)];
      }
      out[y * W + x] = sum * scale;
    }
  }
  return out;
}

const SMOOTH = [1, 1, 1, 1, 1, 1, 1, 1, 1];
const SHARPEN = [-1, -1, -1, -1, 12, -1, -1, -1, -1];
const SOBEL_X = [1, 0, -1, 2, 0, -2, 1, 0, -1];
const SOBEL_Y = [1, 2, 1, 0, 0, 0, -1, -2, -1];

// MARK: the filter

/** One filter on a copy of the input; the input is not changed. */
export function applyFilter(input: Raster, kind: FilterKind, options: FilterOptions = FILTER_DEFAULTS): Raster {
  return perChannel(input, (plane, W, H) => {
    switch (kind) {
      case "gaussian": return gaussianPlane(plane, W, H, options.radius);
      case "unsharp": {
        const blur = gaussianPlane(plane, W, H, options.radius), w = options.weight;
        return plane.map((v, i) => (v - w * blur[i]) / (1 - w));
      }
      case "smooth": return kernelPlane(plane, W, H, SMOOTH, 1 / 9);
      case "sharpen": return kernelPlane(plane, W, H, SHARPEN, 1 / 4);
      case "edges": {
        const gx = kernelPlane(plane, W, H, SOBEL_X, 1), gy = kernelPlane(plane, W, H, SOBEL_Y, 1);
        return gx.map((v, i) => Math.hypot(v, gy[i]));
      }
      case "despeckle": return rankPlane(plane, W, H, "median", 1);
      case "bright-outliers": case "dark-outliers": {
        const median = rankPlane(plane, W, H, "median", options.radius), t = options.threshold, bright = kind === "bright-outliers";
        return plane.map((v, i) => ((bright ? v - median[i] : median[i] - v) > t ? median[i] : v));
      }
      case "convolve": {
        const sum = options.kernel.reduce((a, b) => a + b, 0);
        return kernelPlane(plane, W, H, options.kernel, options.normalize && sum !== 0 ? 1 / sum : 1);
      }
      default: return rankPlane(plane, W, H, kind, options.radius);
    }
  });
}
