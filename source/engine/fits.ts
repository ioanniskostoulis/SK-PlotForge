// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Smoothing and fits of a series (2026-11-17), as Excel's trendlines and Origin's Smooth and Fit: a moving average or a
// Savitzky–Golay filter that follows the data, or a regression with its equation, parameters and statistics. Linear,
// polynomial, exponential, power and logarithmic fits are solved as Excel solves them; peaks, sigmoids, decays, kinetics
// and a formula of the user's own (2026-11-18) by least squares from starting values (nonlinear.ts). A fit is drawn over
// the series as a curve of its own, computed again from the series' cells whenever they change; the data are never changed.
import { parseExpression, type FitExpression } from "./fit-expression";
import { fitStatistics, leastSquares, type FitParameter, type FitStatistics, type Model } from "./nonlinear";

export type FitKind = "average" | "savitzky-golay" | "linear" | "polynomial" | "exponential" | "power" | "logarithmic"
  | "exponential-1" | "exponential-2" | "gaussian" | "lorentzian" | "pseudo-voigt" | "gaussians"
  | "boltzmann" | "logistic-4" | "logistic-5" | "michaelis-menten" | "custom";
export const FIT_KINDS: readonly FitKind[] = ["average", "savitzky-golay", "linear", "polynomial", "exponential", "power", "logarithmic",
  "exponential-1", "exponential-2", "gaussian", "lorentzian", "pseudo-voigt", "gaussians", "boltzmann", "logistic-4", "logistic-5", "michaelis-menten", "custom"];
export const FIT_NAMES: Record<FitKind, string> = {
  average: "Moving average", "savitzky-golay": "Savitzky–Golay", linear: "Linear", polynomial: "Polynomial",
  exponential: "Exponential", power: "Power", logarithmic: "Logarithmic",
  "exponential-1": "Exponential decay", "exponential-2": "Two-phase decay", gaussian: "Gaussian", lorentzian: "Lorentzian",
  "pseudo-voigt": "Pseudo-Voigt", gaussians: "Gaussian peaks", boltzmann: "Boltzmann", "logistic-4": "Logistic (4PL)",
  "logistic-5": "Logistic (5PL)", "michaelis-menten": "Michaelis–Menten", custom: "Custom function",
};
/** The models in the groups menus show them in. */
export const FIT_GROUPS: readonly (readonly [group: string, kinds: readonly FitKind[]])[] = [
  ["Smoothing", ["average", "savitzky-golay"]],
  ["Basic", ["linear", "polynomial", "exponential", "power", "logarithmic"]],
  ["Growth and decay", ["exponential-1", "exponential-2"]],
  ["Peaks", ["gaussian", "lorentzian", "pseudo-voigt", "gaussians"]],
  ["Sigmoids", ["boltzmann", "logistic-4", "logistic-5"]],
  ["Kinetics", ["michaelis-menten"]],
  ["Custom", ["custom"]],
];
/** Smoothing follows the data point by point; the others are regressions with an equation. */
export const isSmoothing = (kind: FitKind) => kind === "average" || kind === "savitzky-golay";
/** Whether a fit has an order: a polynomial's and a Savitzky–Golay's degree, or how many Gaussian peaks. */
export const hasOrder = (kind: FitKind) => kind === "polynomial" || kind === "savitzky-golay" || kind === "gaussians";

/** How the points are weighted: equally, by 1/y as counts are, or by 1/y² for a relative error. */
export type FitWeights = "none" | "counts" | "relative";
export const FIT_WEIGHTS: readonly FitWeights[] = ["none", "counts", "relative"];
export const FIT_WEIGHT_NAMES: Record<FitWeights, string> = { none: "None", counts: "1/y (counts)", relative: "1/y² (relative)" };

/** Where a fit's label stands in the plot area: Auto takes a top corner the legend leaves free. */
export type FitLabelPlace = "auto" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export const FIT_LABEL_PLACES: Record<FitLabelPlace, string> = { auto: "Auto", "top-left": "Top left", "top-right": "Top right", "bottom-left": "Bottom left", "bottom-right": "Bottom right" };
/** How a fit's equation is written: as typeset mathematics, or as plain computer notation (y = 2.1*x^2 + 0.3). */
export type FitFormat = "latex" | "plain";
export const FIT_FORMATS: Record<FitFormat, string> = { latex: "Mathematics", plain: "Plain text" };
/** A fit label's backing: none, the data showing through, or white, as the legend's. */
export type FitLabelBack = "none" | "white";
export const FIT_LABEL_BACKS: Record<FitLabelBack, string> = { none: "Transparent", white: "White" };
/** A fit line's dash, as a series line's (plot.ts LINE_DASHES). */
export type FitDash = "solid" | "dash" | "dot" | "dash-dot";
const FIT_DASHES: readonly FitDash[] = ["solid", "dash", "dot", "dash-dot"];

/**
 * A fit of a series (2026-11-19: a series has a list of them, as an image has steps): its id, whether it is drawn, its
 * kind, the window of a smoothing (odd, in points), the order of a polynomial or Savitzky–Golay or the number of Gaussian
 * peaks, a custom fit's formula, starting and fixed values by parameter name, the weighting and the x range it is fitted
 * over (null ends are the data's); its line (colour and width null follow the series); its label (shown, written as
 * mathematics or plain text, with R² or not, its corner and backing); and whether its residuals are plotted under the plot.
 */
export interface SeriesFit {
  id: string; enabled: boolean;
  kind: FitKind; window: number; order: number;
  expression?: string; start?: Record<string, number>; fixed?: Record<string, number>; weights?: FitWeights; from?: number | null; to?: number | null;
  colour: string | null; lineWidth: number | null; dash: FitDash;
  equation: boolean; format: FitFormat; stats: boolean; place: FitLabelPlace; back: FitLabelBack;
  residuals: boolean;
  /** Whether the fit has a row of its own in the plot's legend, under its series. */
  legend: boolean;
}
export const FIT_WINDOWS: readonly number[] = [3, 5, 7, 9, 11, 15, 21, 31];
export const DEFAULT_FIT: Omit<SeriesFit, "kind" | "id"> = {
  enabled: true, window: 5, order: 2, colour: null, lineWidth: null, dash: "dash",
  equation: false, format: "latex", stats: true, place: "auto", back: "none", residuals: false, legend: false,
};
/** A new fit of a kind, with the order its kind starts from. */
export function newFit(kind: FitKind, id: string): SeriesFit {
  return { ...DEFAULT_FIT, id, kind, order: kind === "gaussians" ? 2 : DEFAULT_FIT.order, ...(kind === "custom" ? { expression: DEFAULT_EXPRESSION } : {}) };
}
/** The fit with another kind: what belongs to the old model's parameters goes. */
export function refit(fit: SeriesFit, kind: FitKind): SeriesFit {
  const { start: _start, fixed: _fixed, ...rest } = fit;
  return { ...rest, kind, order: kind === "gaussians" ? Math.max(2, fit.order) : fit.order, ...(kind === "custom" ? { expression: fit.expression ?? DEFAULT_EXPRESSION } : {}) };
}
/** A fit's name in the legend: Linear fit of Copper; a smoothing is named as it is, Moving average of Copper. */
export function fitLegendName(fit: SeriesFit, seriesName: string): string {
  return `${FIT_NAMES[fit.kind]}${isSmoothing(fit.kind) ? "" : " fit"} of ${seriesName}`;
}
export const DEFAULT_EXPRESSION = "a * exp(-b * x) + c";

/**
 * A fit's result: the curve to draw (in data values), and for a regression its equation, R², what it was fitted on, each
 * parameter, the statistics, whether the solve converged, and a note (points left out, or why it did not converge).
 */
export interface FitResult {
  xs: Float64Array; ys: Float64Array; equation: string | null; r2: number | null; count: number;
  parameters?: FitParameter[]; statistics?: FitStatistics; converged?: boolean; note?: string | null;
  /** Each fitted point's x, y and residual, y − f(x). */
  residuals?: { x: number; y: number; residual: number }[];
}
export type { FitParameter, FitStatistics };

/** The points both of whose values are finite, in order. */
function finitePairs(xs: ArrayLike<number>, ys: ArrayLike<number>): { x: number[]; y: number[] } {
  const x: number[] = [], y: number[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) { x.push(xs[i]); y.push(ys[i]); }
  return { x, y };
}

/** Solve a small linear system by Gaussian elimination with partial pivoting; null when it is singular. */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length, m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = m[row][col] / m[col][col];
      for (let k = col; k <= n; k++) m[row][k] -= f * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Least-squares polynomial coefficients (constant first) of y on x. x is centred and scaled for the solve, so that
 * high orders stay well conditioned, and the coefficients are turned back to x.
 */
export function polyfit(x: readonly number[], y: readonly number[], order: number): number[] | null {
  if (x.length <= order) return null;
  const mean = x.reduce((sum, v) => sum + v, 0) / x.length;
  const scale = Math.max(...x.map((v) => Math.abs(v - mean))) || 1;
  const u = x.map((v) => (v - mean) / scale);
  const n = order + 1, a = Array.from({ length: n }, () => new Array<number>(n).fill(0)), b = new Array<number>(n).fill(0);
  for (let i = 0; i < u.length; i++) {
    const powers = [1];
    for (let k = 1; k < 2 * n; k++) powers.push(powers[k - 1] * u[i]);
    for (let r = 0; r < n; r++) { b[r] += powers[r] * y[i]; for (let c = 0; c < n; c++) a[r][c] += powers[r + c]; }
  }
  const cu = solve(a, b);
  if (!cu) return null;
  // p(x) = Σ cu[k] ((x − mean)/scale)^k, expanded in powers of x.
  const out = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    const factor = cu[k] / scale ** k;
    for (let j = 0; j <= k; j++) out[j] += factor * binomial(k, j) * (-mean) ** (k - j);
  }
  return out;
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

const polyAt = (c: readonly number[], x: number) => c.reduceRight((sum, coefficient) => sum * x + coefficient, 0);

/** R² of predictions against the data: 1 − residual sum of squares / total sum of squares. */
export function rSquared(y: readonly number[], predicted: readonly number[]): number {
  const mean = y.reduce((sum, v) => sum + v, 0) / y.length;
  let residual = 0, total = 0;
  for (let i = 0; i < y.length; i++) { residual += (y[i] - predicted[i]) ** 2; total += (y[i] - mean) ** 2; }
  return total > 0 ? 1 - residual / total : 1;
}

/** A number for an equation: four significant figures, a true minus, no trailing zeros, exponents as × 10ⁿ. */
export function fitNumber(value: number): string {
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const superscript = (n: number) => `${n < 0 ? "⁻" : ""}${String(Math.abs(n)).split("").map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]).join("")}`;
  const text = exponent >= 5 || exponent <= -4
    ? `${Number((value / 10 ** exponent).toPrecision(4))} × 10${superscript(exponent)}`
    : String(Number(value.toPrecision(4)));
  return text.replace(/^-/, "−");
}

/** A polynomial written out, highest power first: y = 0.5x² − 3x + 2. */
function polyText(c: readonly number[]): string {
  const powers = ["", "x", "x²", "x³", "x⁴", "x⁵", "x⁶"];
  const terms = c.map((coefficient, k) => ({ coefficient, k })).reverse().filter((term) => term.coefficient !== 0);
  if (!terms.length) return "y = 0";
  return terms.map(({ coefficient, k }, index) => {
    const size = fitNumber(Math.abs(coefficient)), sign = coefficient < 0 ? "−" : "+";
    const body = k > 0 && size === "1" ? powers[k] : `${size}${powers[k]}`;
    return index === 0 ? `y = ${coefficient < 0 ? "−" : ""}${body}` : ` ${sign} ${body}`;
  }).join("");
}

/** A centred moving average of `window` points; near the ends, of the points there are. */
function movingAverage(y: readonly number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return y.map((_, i) => {
    const from = Math.max(0, i - half), to = Math.min(y.length - 1, i + half);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += y[j];
    return sum / (to - from + 1);
  });
}

/**
 * A Savitzky–Golay filter: each point the value of a least-squares polynomial of `order` over the `window` points
 * around it in x; near the ends, over the first or last window, as the filter's usual end treatment.
 */
function savitzkyGolay(x: readonly number[], y: readonly number[], window: number, order: number): number[] {
  const n = y.length, size = Math.min(window, n), half = Math.floor(size / 2), degree = Math.min(order, size - 1);
  return y.map((_, i) => {
    const from = Math.max(0, Math.min(n - size, i - half));
    const c = polyfit(x.slice(from, from + size), y.slice(from, from + size), degree);
    return c ? polyAt(c, x[i]) : y[i];
  });
}

// MARK: models

/** A model fitted by least squares: its parameters' names, its value, its starting values from the data, and its equation. */
interface NonlinearModel {
  names: (fit: SeriesFit) => string[];
  f: Model;
  guess: (x: number[], y: number[], fit: SeriesFit) => number[];
  /** The equation with its values in, `{name}` standing for each parameter. */
  template: (fit: SeriesFit) => string;
  /** Fitted only on points with x above 0. */
  positiveX?: boolean;
}

const range = (x: readonly number[]) => Math.max(...x) - Math.min(...x) || 1;
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
/** The points in order of x. */
function sorted(x: readonly number[], y: readonly number[]): { x: number[]; y: number[] } {
  const order = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
  return { x: order.map((i) => x[i]), y: order.map((i) => y[i]) };
}
/** The first x where y crosses a level, between the points either side; the middle of x when it never does. */
function crossing(x: readonly number[], y: readonly number[], level: number): number {
  for (let i = 1; i < x.length; i++) {
    if ((y[i - 1] - level) * (y[i] - level) <= 0 && y[i] !== y[i - 1]) return x[i - 1] + ((level - y[i - 1]) * (x[i] - x[i - 1])) / (y[i] - y[i - 1]);
  }
  return (x[0] + x[x.length - 1]) / 2;
}
/** A peak's (or dip's) baseline, height, centre and full width at half its height. */
function peakGuess(xs: readonly number[], ys: readonly number[]): { base: number; height: number; centre: number; fwhm: number } {
  const { x, y } = sorted(xs, ys);
  const middle = [...y].sort((a, b) => a - b)[Math.floor(y.length / 2)];
  const up = Math.max(...y) - middle >= middle - Math.min(...y);
  const base = up ? Math.min(...y) : Math.max(...y);
  let top = 0;
  y.forEach((value, i) => { if (Math.abs(value - base) > Math.abs(y[top] - base)) top = i; });
  const height = y[top] - base;
  let left = top, right = top;
  while (left > 0 && Math.abs(y[left] - base) > Math.abs(height / 2)) left--;
  while (right < y.length - 1 && Math.abs(y[right] - base) > Math.abs(height / 2)) right++;
  const fwhm = x[right] - x[left] > 0 && (left !== top || right !== top) ? x[right] - x[left] : range(x) / 5;
  return { base, height, centre: x[top], fwhm };
}
/** Where an exponential flattens: at the end (a decay, t above 0) or at the start (a growth, t below 0). */
function exponentialGuess(xs: readonly number[], ys: readonly number[], t: number): { y0: number; t: number; reference: number; size: number } {
  const { x, y } = sorted(xs, ys), n = x.length, k = Math.max(1, Math.floor(n / 5));
  const startSlope = Math.abs((y[k] - y[0]) / (x[k] - x[0] || 1)), endSlope = Math.abs((y[n - 1] - y[n - 1 - k]) / (x[n - 1] - x[n - 1 - k] || 1));
  const decay = endSlope <= startSlope;
  const y0 = decay ? y[n - 1] : y[0], far = decay ? 0 : n - 1;
  return { y0, t: decay ? t : -t, reference: x[far], size: y[far] - y0 };
}
const amplitude = (size: number, x: number, t: number) => { const a = size / Math.exp(-x / t); return Number.isFinite(a) ? a : size; };

const MODELS: Partial<Record<FitKind, NonlinearModel>> = {
  "exponential-1": {
    names: () => ["y0", "A", "t"],
    f: (x, [y0, a, t]) => y0 + a * Math.exp(-x / t),
    guess: (x, y) => { const g = exponentialGuess(x, y, range(x) / 3); return [g.y0, amplitude(g.size, g.reference, g.t), g.t]; },
    template: () => "y = {y0} + {A}e^(−x/{t})",
  },
  "exponential-2": {
    names: () => ["y0", "A1", "t1", "A2", "t2"],
    f: (x, [y0, a1, t1, a2, t2]) => y0 + a1 * Math.exp(-x / t1) + a2 * Math.exp(-x / t2),
    guess: (x, y) => {
      const fast = exponentialGuess(x, y, range(x) / 10), slow = exponentialGuess(x, y, range(x) / 2);
      return [fast.y0, amplitude(fast.size / 2, fast.reference, fast.t), fast.t, amplitude(slow.size / 2, slow.reference, slow.t), slow.t];
    },
    template: () => "y = {y0} + {A1}e^(−x/{t1}) + {A2}e^(−x/{t2})",
  },
  gaussian: {
    names: () => ["y0", "A", "xc", "w"],
    f: (x, [y0, a, xc, w]) => y0 + a * Math.exp(-((x - xc) ** 2) / (2 * w * w)),
    guess: (x, y) => { const p = peakGuess(x, y); return [p.base, p.height, p.centre, p.fwhm / 2.3548]; },
    template: () => "y = {y0} + {A}e^(−(x − {xc})²/(2·{w}²))",
  },
  lorentzian: {
    names: () => ["y0", "A", "xc", "w"],
    f: (x, [y0, a, xc, w]) => y0 + (a * w * w) / ((x - xc) ** 2 + w * w),
    guess: (x, y) => { const p = peakGuess(x, y); return [p.base, p.height, p.centre, p.fwhm / 2]; },
    template: () => "y = {y0} + {A}·{w}²/((x − {xc})² + {w}²)",
  },
  "pseudo-voigt": {
    names: () => ["y0", "A", "xc", "w", "mu"],
    f: (x, [y0, a, xc, w, mu]) => {
      const u = ((x - xc) / w) ** 2;
      return y0 + a * (mu / (1 + 4 * u) + (1 - mu) * Math.exp(-4 * Math.LN2 * u));
    },
    guess: (x, y) => { const p = peakGuess(x, y); return [p.base, p.height, p.centre, p.fwhm, 0.5]; },
    template: () => "y = {y0} + {A}[{mu}·L(x) + (1 − {mu})·G(x)], centre {xc}, FWHM {w}",
  },
  gaussians: {
    names: (fit) => ["y0", ...Array.from({ length: fit.order }, (_, i) => [`A${i + 1}`, `xc${i + 1}`, `w${i + 1}`]).flat()],
    f: (x, p) => {
      let y = p[0];
      for (let i = 1; i + 2 < p.length + 1; i += 3) y += p[i] * Math.exp(-((x - p[i + 1]) ** 2) / (2 * p[i + 2] * p[i + 2]));
      return y;
    },
    guess: (xs, ys, fit) => {
      const { x, y } = sorted(xs, ys), n = fit.order, base = Math.min(...y), spread = range(x);
      const maxima = x.map((_, i) => i).filter((i) => (i === 0 || y[i] >= y[i - 1]) && (i === x.length - 1 || y[i] >= y[i + 1])).sort((a, b) => y[b] - y[a]);
      const picked: number[] = [];
      for (const i of maxima) if (picked.length < n && picked.every((j) => Math.abs(x[i] - x[j]) > spread / (3 * n))) picked.push(i);
      const centres = picked.map((i) => x[i]);
      while (centres.length < n) centres.push(x[0] + (spread * (centres.length + 0.5)) / n);
      centres.sort((a, b) => a - b);
      const at = (c: number) => y[x.reduce((best, v, i) => (Math.abs(v - c) < Math.abs(x[best] - c) ? i : best), 0)];
      return [base, ...centres.flatMap((c) => [at(c) - base, c, spread / (8 * n)])];
    },
    template: (fit) => `y = {y0}${Array.from({ length: fit.order }, (_, i) => ` + {A${i + 1}}e^(−(x − {xc${i + 1}})²/(2·{w${i + 1}}²))`).join("")}`,
  },
  boltzmann: {
    names: () => ["A1", "A2", "x0", "dx"],
    f: (x, [a1, a2, x0, dx]) => a2 + (a1 - a2) / (1 + Math.exp((x - x0) / dx)),
    guess: (xs, ys) => {
      const { x, y } = sorted(xs, ys), k = Math.max(1, Math.min(3, Math.floor(x.length / 4)));
      const a1 = mean(y.slice(0, k)), a2 = mean(y.slice(-k));
      return [a1, a2, crossing(x, y, (a1 + a2) / 2), range(x) / 10];
    },
    template: () => "y = {A2} + ({A1} − {A2})/(1 + e^((x − {x0})/{dx}))",
  },
  "logistic-4": {
    names: () => ["bottom", "top", "EC50", "hill"],
    f: (x, [bottom, top, ec50, hill]) => bottom + (top - bottom) / (1 + (ec50 / x) ** hill),
    guess: (xs, ys) => {
      const { x, y } = sorted(xs, ys), k = Math.max(1, Math.min(3, Math.floor(x.length / 4)));
      const low = mean(y.slice(0, k)), high = mean(y.slice(-k)), mid = crossing(x, y, (low + high) / 2);
      return [low, high, mid > 0 ? mid : Math.sqrt(x[0] * x[x.length - 1]), 1];
    },
    template: () => "y = {bottom} + ({top} − {bottom})/(1 + ({EC50}/x)^{hill})",
    positiveX: true,
  },
  "logistic-5": {
    names: () => ["bottom", "top", "EC50", "hill", "s"],
    f: (x, [bottom, top, ec50, hill, s]) => bottom + (top - bottom) / (1 + (ec50 / x) ** hill) ** s,
    guess: (xs, ys, fit) => [...MODELS["logistic-4"]!.guess(xs, ys, fit), 1],
    template: () => "y = {bottom} + ({top} − {bottom})/(1 + ({EC50}/x)^{hill})^{s}",
    positiveX: true,
  },
  "michaelis-menten": {
    names: () => ["Vmax", "Km"],
    f: (x, [vmax, km]) => (vmax * x) / (km + x),
    guess: (xs, ys) => { const { x, y } = sorted(xs, ys), top = Math.max(...y); const km = crossing(x, y, top / 2); return [top, km > 0 ? km : mean(x)]; },
    template: () => "y = {Vmax}·x/({Km} + x)",
  },
};

/** A fit's custom formula, read; null when the fit has none to read. */
export function fitExpression(fit: SeriesFit): FitExpression | string {
  return parseExpression(fit.expression ?? DEFAULT_EXPRESSION);
}

/** The names of a fit's parameters, as `fit set` and the Fits tab write them; none for a smoothing. */
export function fitParameterNames(fit: SeriesFit): string[] {
  if (fit.kind === "custom") { const expression = fitExpression(fit); return typeof expression === "string" ? [] : expression.parameters; }
  if (fit.kind === "linear") return ["intercept", "slope"];
  if (fit.kind === "polynomial") return Array.from({ length: fit.order + 1 }, (_, i) => `c${i}`);
  if (fit.kind === "exponential" || fit.kind === "power" || fit.kind === "logarithmic") return ["a", "b"];
  return MODELS[fit.kind]?.names(fit) ?? [];
}

/** An equation with its values in: `{name}` takes the parameter's value, and a sign before a negative value turns. */
function fillTemplate(template: string, names: readonly string[], values: readonly number[]): string {
  let text = template;
  names.forEach((name, i) => { text = text.split(`{${name}}`).join(values[i] < 0 ? `(${fitNumber(values[i])})` : fitNumber(values[i])); });
  return text.replace(/\+ \(−([^()]+)\)/g, "− $1").replace(/− \(−([^()]+)\)/g, "+ $1");
}

/** The weight of each point. */
function weightsOf(y: readonly number[], weights: FitWeights | undefined): number[] {
  if (weights === "counts") return y.map((value) => 1 / Math.max(Math.abs(value), 1e-12));
  if (weights === "relative") return y.map((value) => 1 / Math.max(value * value, 1e-24));
  return y.map(() => 1);
}

/** The x values a curve is drawn at: across the fitted x, in `steps` steps. */
function curveAcross(x: readonly number[], positive: boolean, steps: number): Float64Array {
  const usable = positive ? x.filter((v) => v > 0) : x;
  const low = Math.min(...usable), high = Math.max(...usable), out = new Float64Array(steps);
  for (let i = 0; i < out.length; i++) out[i] = low + ((high - low) * i) / (out.length - 1);
  return out;
}

/** The closed-form fits as models, for their statistics and for refining them by least squares. */
function closedModel(fit: SeriesFit): Model {
  if (fit.kind === "linear" || fit.kind === "polynomial") return (x, p) => polyAt(p, x);
  if (fit.kind === "exponential") return (x, [a, b]) => a * Math.exp(b * x);
  if (fit.kind === "power") return (x, [a, b]) => a * x ** b;
  return (x, [a, b]) => a * Math.log(x) + b;
}

/** The closed-form (Excel) solution of a basic fit, its parameters in `fitParameterNames` order, or why there is none. */
function closedForm(fit: SeriesFit, x: number[], y: number[]): { p: number[]; x: number[]; y: number[]; left: number } | string {
  if (fit.kind === "linear" || fit.kind === "polynomial") {
    const order = fit.kind === "linear" ? 1 : fit.order;
    const c = polyfit(x, y, order);
    return c ? { p: c, x, y, left: 0 } : `A ${fit.kind === "linear" ? "line" : `polynomial of order ${order}`} needs ${order + 1} points with different x or more.`;
  }
  // Exponential, power and logarithmic fits are straight lines after taking logarithms, as Excel fits them.
  const keep = x.map((v, i) => ({ x: v, y: y[i] })).filter((p) => (fit.kind === "logarithmic" || p.y > 0) && (fit.kind === "exponential" || p.x > 0));
  if (keep.length < 2) return fit.kind === "exponential" ? "An exponential fit needs two points with y above 0." : fit.kind === "power" ? "A power fit needs two points with x and y above 0." : "A logarithmic fit needs two points with x above 0.";
  const u = keep.map((p) => (fit.kind === "exponential" ? p.x : Math.log(p.x)));
  const v = keep.map((p) => (fit.kind === "logarithmic" ? p.y : Math.log(p.y)));
  const line = polyfit(u, v, 1);
  if (!line) return "The points have no spread in x to fit.";
  const [c0, c1] = line;
  const p = fit.kind === "logarithmic" ? [c1, c0] : [Math.exp(c0), c1];
  return { p, x: keep.map((point) => point.x), y: keep.map((point) => point.y), left: x.length - keep.length };
}

function closedEquation(fit: SeriesFit, p: readonly number[]): string {
  if (fit.kind === "linear" || fit.kind === "polynomial") return polyText(p);
  const signed = (value: number) => (value < 0 ? ` − ${fitNumber(-value)}` : ` + ${fitNumber(value)}`);
  if (fit.kind === "exponential") return `y = ${fitNumber(p[0])}e^(${fitNumber(p[1])}x)`;
  if (fit.kind === "power") return `y = ${fitNumber(p[0])}x^${fitNumber(p[1])}`;
  return `y = ${fitNumber(p[0])} ln(x)${signed(p[1])}`;
}

const leftOut = (count: number) => (count ? `${count} point${count === 1 ? "" : "s"} left out` : null);

function computeFit(xs: ArrayLike<number>, ys: ArrayLike<number>, fit: SeriesFit): FitResult | string {
  const all = finitePairs(xs, ys);
  const low = fit.from ?? -Infinity, high = fit.to ?? Infinity;
  const inRange = all.x.map((v, i) => i).filter((i) => all.x[i] >= low && all.x[i] <= high);
  const x = inRange.map((i) => all.x[i]), y = inRange.map((i) => all.y[i]);
  if (fit.from != null || fit.to != null) { if (x.length < 2) return "The fit's x range holds fewer than two points."; }
  if (isSmoothing(fit.kind)) {
    if (x.length < 3) return "A smoothing needs three points or more.";
    const smoothed = fit.kind === "average" ? movingAverage(y, fit.window) : savitzkyGolay(x, y, fit.window, fit.order);
    return { xs: Float64Array.from(x), ys: Float64Array.from(smoothed), equation: null, r2: null, count: x.length };
  }
  const names = fitParameterNames(fit);
  let model: Model, start: number[], fx = x, fy = y, left = 0, closed = false, equationOf: (p: readonly number[]) => string, positive = false, steps = 400;
  if (fit.kind === "custom") {
    const expression = fitExpression(fit);
    if (typeof expression === "string") return expression;
    model = (value, p) => expression.evaluate(value, p);
    start = expression.parameters.map((name) => fit.start?.[name] ?? 1);
    equationOf = () => `y = ${expression.text}`;
  } else if (MODELS[fit.kind]) {
    const definition = MODELS[fit.kind]!;
    if (definition.positiveX) { const keep = x.map((_, i) => i).filter((i) => x[i] > 0); left = x.length - keep.length; fx = keep.map((i) => x[i]); fy = keep.map((i) => y[i]); }
    if (fx.length < names.length) return `${FIT_NAMES[fit.kind]} needs ${names.length} points${definition.positiveX ? " with x above 0" : ""} or more.`;
    model = definition.f;
    start = definition.guess(fx, fy, fit).map((value, i) => fit.start?.[names[i]] ?? value);
    equationOf = (p) => fillTemplate(definition.template(fit), names, p);
    positive = !!definition.positiveX;
  } else {
    const solved = closedForm(fit, x, y);
    if (typeof solved === "string") return solved;
    ({ x: fx, y: fy, left } = solved);
    model = closedModel(fit); start = solved.p.map((value, i) => fit.start?.[names[i]] ?? value);
    equationOf = (p) => closedEquation(fit, p);
    positive = fit.kind === "power" || fit.kind === "logarithmic";
    closed = true; steps = 200;
  }
  if (fx.length < names.length) return `The fit needs ${names.length} points or more; there ${fx.length === 1 ? "is" : "are"} ${fx.length}.`;
  const fixed = names.map((name) => typeof fit.fixed?.[name] === "number");
  start = start.map((value, i) => (fixed[i] ? fit.fixed![names[i]] : value));
  const w = weightsOf(fy, fit.weights);
  const weighted = (fit.weights ?? "none") !== "none";
  // An Excel fit keeps its own solution unless a weight or a fixed value asks for a least-squares one.
  const solved = closed && !weighted && !fixed.some(Boolean) ? { values: start, converged: true, iterations: 0 } : leastSquares(model, fx, fy, w, start, fixed);
  // A peak's width enters squared, so its sign is arbitrary: it is reported positive.
  const p = solved.values.map((value, i) => (/^w\d*$/.test(names[i]) && MODELS[fit.kind] ? Math.abs(value) : value));
  if (!p.every(Number.isFinite)) return "The fit found no finite values; try other starting values.";
  const { parameters, statistics } = fitStatistics(model, fx, fy, w, p, fixed, names);
  const curve = curveAcross(fx, positive, steps);
  const notes = [leftOut(left), solved.converged ? null : `did not converge in ${solved.iterations} steps`].filter(Boolean);
  const note = notes.length ? notes.join("; ") : null;
  return {
    xs: curve, ys: curve.map((value) => model(value, p)),
    equation: `${equationOf(p)}${closed && left ? ` (${leftOut(left)})` : ""}`,
    r2: statistics.r2, count: fx.length, parameters, statistics, converged: solved.converged, note: note ? `${note[0].toUpperCase()}${note.slice(1)}.` : null,
    residuals: fx.map((value, i) => ({ x: value, y: fy[i], residual: fy[i] - model(value, p) })),
  };
}

// A fit is computed on every draw from the series' current cells, so it follows them; the last results are kept by
// their inputs, so that redrawing an unchanged plot does not solve it again.
const cache = new Map<string, FitResult | string>();
function cacheKey(xs: ArrayLike<number>, ys: ArrayLike<number>, fit: SeriesFit): string {
  let hash = 2166136261;
  const mix = (value: number) => { const text = String(value); for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); hash = Math.imul(hash ^ 44, 16777619); };
  for (let i = 0; i < xs.length; i++) mix(xs[i]);
  mix(NaN);
  for (let i = 0; i < ys.length; i++) mix(ys[i]);
  const { id: _id, enabled: _on, colour: _c, lineWidth: _w, dash: _d, equation: _e, format: _f, stats: _s, place: _p, back: _b, residuals: _r, ...model } = fitRecord(fit) as Record<string, unknown> & Partial<SeriesFit>;
  return `${xs.length}:${ys.length}:${hash >>> 0}:${JSON.stringify(model)}`;
}

/** A series' fit from its points, or why it cannot be made. Points missing either value are left out. */
export function fitSeries(xs: ArrayLike<number>, ys: ArrayLike<number>, fit: SeriesFit): FitResult | string {
  const key = cacheKey(xs, ys, fit);
  const kept = cache.get(key);
  if (kept !== undefined) { cache.delete(key); cache.set(key, kept); return kept; }
  const result = computeFit(xs, ys, fit);
  cache.set(key, result);
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  return result;
}

// MARK: the label

const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const plainSuper = (text: string) => text.replace(/⁻/g, "-").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (d) => String(SUPERSCRIPTS.indexOf(d)));

/** An equation as computer notation, as a spreadsheet or program takes it: y = 0.5*x^2 - 3*x + 2, 1.2E-5, exp(…). */
export function plainEquation(text: string): string {
  return text
    .replace(/(\d(?:\.\d+)?) × 10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, mantissa: string, power: string) => `${mantissa}E${plainSuper(power)}`)
    .replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (power) => `^${plainSuper(power)}`)
    .replace(/(^|[^A-Za-z])e\^\(/g, "$1exp(")
    .replace(/·/g, "*").replace(/−/g, "-")
    .replace(/([0-9)\]])\s?(?=(?![Ee][-\d])[A-Za-z(\[])/g, "$1*");
}

/** Text from `start` (an opening bracket) to its match: the inside, and the index after the closing bracket. */
function bracketed(text: string, start: number): { inside: string; end: number } {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return { inside: text.slice(start + 1, i), end: i + 1 };
  }
  return { inside: text.slice(start + 1), end: text.length };
}

/** The body of an equation as TeX: powers raised, products as a centred dot, words upright, functions by name. */
function latexBody(text: string): string {
  let out = "";
  for (let i = 0; i < text.length;) {
    const rest = text.slice(i), before = text[i - 1] ?? "";
    if (rest.startsWith("e^(") && !/[A-Za-z]/.test(before)) { const { inside, end } = bracketed(text, i + 2); out += `e^{${latexBody(inside)}}`; i = end; continue; }
    const power = /^\^(−?-?[\d.]+)/.exec(rest);
    if (power) { out += `^{${power[1]}}`; i += power[0].length; continue; }
    const raised = /^[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/.exec(rest);
    if (raised) { out += `^{${plainSuper(raised[0]).replace("-", "−")}}`; i += raised[0].length; continue; }
    const word = /^(ln|exp|log|sin|cos|tan)\(/.exec(rest);
    if (word && !/[A-Za-z]/.test(before)) { out += `\\${word[1]}(`; i += word[0].length; continue; }
    const upright = /^(centre|FWHM)\b ?/.exec(rest);
    if (upright) { out += `\\text{${upright[1]}}\\ `; i += upright[0].length; continue; }
    const char = text[i];
    out += char === "·" || char === "*" ? "\\cdot " : char === "×" ? "\\times " : char === "$" ? "\\$" : char === "," ? ",\\ " : char;
    i++;
  }
  return out;
}

/** An equation as typeset mathematics, between dollar signs (forge-shell text-math): y = 0.5x² becomes $y = 0.5x^{2}$. */
export const latexEquation = (text: string): string => `$${latexBody(text)}$`;

/** What a fit's label says: its equation, written as the fit asks, and its R² when asked; null with nothing to say. */
export function fitLabelText(fit: SeriesFit, result: FitResult): string | null {
  if (!fit.equation || !result.equation) return null;
  const r2 = fit.stats && result.r2 !== null ? Number(result.r2.toFixed(4)) : null;
  if (fit.format === "plain") return `${plainEquation(result.equation)}${r2 === null ? "" : `, R^2 = ${r2}`}`;
  return `$${latexBody(result.equation)}${r2 === null ? "" : `,\\quad R^{2} = ${r2}`}$`;
}

// MARK: the document's records

const numbersRecord = (values: Record<string, number> | undefined) => (values && Object.keys(values).length ? { ...values } : undefined);

export function fitRecord(fit: SeriesFit): Record<string, unknown> {
  const start = numbersRecord(fit.start), fixed = numbersRecord(fit.fixed);
  return {
    id: fit.id, kind: fit.kind, ...(fit.enabled ? {} : { enabled: false }), ...(isSmoothing(fit.kind) ? { window: fit.window } : {}),
    ...(hasOrder(fit.kind) ? { order: fit.order } : {}),
    ...(fit.kind === "custom" ? { expression: fit.expression ?? DEFAULT_EXPRESSION } : {}),
    ...(start ? { start } : {}), ...(fixed ? { fixed } : {}),
    ...(fit.weights && fit.weights !== "none" ? { weights: fit.weights } : {}),
    ...(fit.from != null ? { from: fit.from } : {}), ...(fit.to != null ? { to: fit.to } : {}),
    ...(fit.colour ? { colour: fit.colour } : {}), ...(fit.lineWidth !== null ? { lineWidth: fit.lineWidth } : {}), dash: fit.dash,
    ...(fit.equation ? { equation: true } : {}), format: fit.format, ...(fit.stats ? {} : { stats: false }),
    ...(fit.place !== "auto" ? { place: fit.place } : {}), ...(fit.back !== "none" ? { back: fit.back } : {}), ...(fit.residuals ? { residuals: true } : {}),
    ...(fit.legend ? { legend: true } : {}),
  };
}

function numbers(raw: unknown, what: string, bad: (what: string) => Error): Record<string, number> | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw bad(what);
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 20 || !entries.every(([name, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && typeof value === "number" && Number.isFinite(value))) throw bad(what);
  return Object.fromEntries(entries) as Record<string, number>;
}

/**
 * A fit from the document; an invalid one is refused with `bad`. A fit saved before fits had a line and label of their
 * own (2026-11-19) keeps its look: a solid line, its equation as plain text, at the top left.
 */
export function parseFit(raw: any, bad: (what: string) => Error, id: string): SeriesFit {
  if (!raw || typeof raw !== "object" || !FIT_KINDS.includes(raw.kind)) throw bad("fit");
  const window = raw.window ?? DEFAULT_FIT.window, order = raw.order ?? DEFAULT_FIT.order;
  if (!Number.isInteger(window) || window < 3 || window > 101 || window % 2 === 0) throw bad("fit window");
  if (!Number.isInteger(order) || order < 1 || order > 6) throw bad("fit order");
  if (raw.expression !== undefined && (typeof raw.expression !== "string" || raw.expression.length > 300)) throw bad("fit formula");
  if (raw.weights !== undefined && !FIT_WEIGHTS.includes(raw.weights)) throw bad("fit weights");
  for (const end of ["from", "to"]) if (raw[end] !== undefined && raw[end] !== null && !(typeof raw[end] === "number" && Number.isFinite(raw[end]))) throw bad("fit range");
  if (raw.colour !== undefined && (typeof raw.colour !== "string" || !/^#[0-9a-f]{6}$/i.test(raw.colour))) throw bad("fit colour");
  if (raw.lineWidth !== undefined && !(typeof raw.lineWidth === "number" && raw.lineWidth > 0 && raw.lineWidth <= 72)) throw bad("fit line width");
  if (raw.dash !== undefined && !FIT_DASHES.includes(raw.dash)) throw bad("fit dash");
  if (raw.format !== undefined && !(raw.format in FIT_FORMATS)) throw bad("fit format");
  if (raw.place !== undefined && !(raw.place in FIT_LABEL_PLACES)) throw bad("fit label place");
  if (raw.back !== undefined && !(raw.back in FIT_LABEL_BACKS)) throw bad("fit label back");
  const start = numbers(raw.start, "fit starting values", bad), fixed = numbers(raw.fixed, "fit fixed values", bad);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : id, enabled: raw.enabled !== false,
    kind: raw.kind, window, order,
    ...(raw.kind === "custom" ? { expression: raw.expression ?? DEFAULT_EXPRESSION } : {}),
    ...(start ? { start } : {}), ...(fixed ? { fixed } : {}),
    ...(raw.weights && raw.weights !== "none" ? { weights: raw.weights } : {}),
    ...(raw.from != null ? { from: raw.from } : {}), ...(raw.to != null ? { to: raw.to } : {}),
    colour: raw.colour ?? null, lineWidth: raw.lineWidth ?? null, dash: raw.dash ?? "solid",
    equation: raw.equation === true, format: raw.format ?? "plain", stats: raw.stats !== false,
    place: raw.place ?? "auto", back: raw.back ?? "none", residuals: raw.residuals === true, legend: raw.legend === true,
  };
}

/** A series' fits from the document: its list, or the one fit a series had before 2026-11-19. */
export function parseFits(list: unknown, single: unknown, bad: (what: string) => Error, seriesId: string): SeriesFit[] {
  if (list !== undefined) {
    if (!Array.isArray(list) || list.length > 20) throw bad("fits");
    const fits = list.map((raw, index) => parseFit(raw, bad, `${seriesId}-fit-${index + 1}`));
    if (new Set(fits.map((fit) => fit.id)).size !== fits.length) throw bad("fit ids");
    return fits;
  }
  return single === undefined || single === null ? [] : [parseFit(single, bad, `${seriesId}-fit-1`)];
}
