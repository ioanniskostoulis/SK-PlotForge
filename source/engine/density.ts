// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Optical density calibration against a density standard (roadmap I20). Without one, optical density is
// log10(M / v) (measure.ts). With one, the image keeps the standard's points, grey values with their known optical
// densities (from a calibrated step tablet, for instance), and a fit of OD against the grey value by least squares:
//   linear     OD = a + bv                  (at least 2 points with different grey values)
//   quadratic  OD = a + bv + cv²            (at least 3)
// The fit is recomputed from the points whenever it is needed, so it is never out of step with them, and is stated
// with its coefficients and R² = 1 − SSres / SStot. Values outside the standard's grey range are extrapolated by the
// same curve; the inspector says so.
export type DensityFit = "linear" | "quadratic";
export const DENSITY_FITS: readonly DensityFit[] = ["linear", "quadratic"];
export interface DensityPoint { grey: number; od: number }
export interface DensityStandard { fit: DensityFit; points: DensityPoint[] }
export interface FittedDensity { fit: DensityFit; coefficients: number[]; rSquared: number; low: number; high: number }

const terms = (fit: DensityFit) => (fit === "linear" ? 2 : 3);

/** Why a standard cannot be fitted, or null. */
export function densityProblem(standard: DensityStandard): string | null {
  if (!DENSITY_FITS.includes(standard.fit)) return "The fit is linear or quadratic.";
  if (!standard.points.every((point) => Number.isFinite(point.grey) && Number.isFinite(point.od) && point.grey >= 0)) return "Each point needs a grey value of 0 or more and a known optical density.";
  const distinct = new Set(standard.points.map((point) => point.grey)).size, needed = terms(standard.fit);
  if (distinct < needed) return `A ${standard.fit} fit needs at least ${needed} points with different grey values; there ${distinct === 1 ? "is" : "are"} ${distinct}.`;
  return null;
}

/** Solve A x = y by Gaussian elimination with partial pivoting; A is n × n. */
function solve(A: number[][], y: number[]): number[] {
  const n = y.length, m = A.map((row, i) => [...row, y[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    for (let r = c + 1; r < n; r++) { const k = m[r][c] / m[c][c]; for (let j = c; j <= n; j++) m[r][j] -= k * m[c][j]; }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = m[r][n]; for (let j = r + 1; j < n; j++) s -= m[r][j] * x[j]; x[r] = s / m[r][r]; }
  return x;
}

/** The least-squares fit of a standard; throws when `densityProblem` gives a reason. */
export function fitDensity(standard: DensityStandard): FittedDensity {
  const problem = densityProblem(standard);
  if (problem) throw new Error(problem);
  const n = terms(standard.fit), pts = standard.points;
  // Normal equations, with the grey values scaled to 0..1 for conditioning, then scaled back.
  const s = Math.max(1, ...pts.map((p) => p.grey));
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => pts.reduce((sum, p) => sum + (p.grey / s) ** (i + j), 0)));
  const y = Array.from({ length: n }, (_, i) => pts.reduce((sum, p) => sum + p.od * (p.grey / s) ** i, 0));
  const coefficients = solve(A, y).map((c, i) => c / s ** i);
  const mean = pts.reduce((sum, p) => sum + p.od, 0) / pts.length;
  let ssRes = 0, ssTot = 0;
  for (const p of pts) { ssRes += (p.od - evaluate(coefficients, p.grey)) ** 2; ssTot += (p.od - mean) ** 2; }
  const greys = pts.map((p) => p.grey);
  return { fit: standard.fit, coefficients, rSquared: ssTot > 0 ? 1 - ssRes / ssTot : 1, low: Math.min(...greys), high: Math.max(...greys) };
}

const evaluate = (c: readonly number[], v: number) => c.reduce((sum, k, i) => sum + k * v ** i, 0);

/** The calibrated optical density of a grey value. */
export const densityAt = (fitted: FittedDensity, v: number): number => evaluate(fitted.coefficients, v);

/** The fit as a sentence: `OD = 2.1 − 0.0081v (linear, R² = 0.998, 5 points, grey 12 to 240)`. */
export function describeFit(fitted: FittedDensity, points: number, format: (value: number) => string): string {
  const [a, b, c] = fitted.coefficients;
  const term = (k: number, text: string) => `${k < 0 ? "−" : "+"} ${format(Math.abs(k))}${text}`;
  const body = `${format(a)} ${term(b, "v")}${c === undefined ? "" : ` ${term(c, "v²")}`}`;
  return `OD = ${body} (${fitted.fit}, R² = ${format(fitted.rSquared)}, ${points} points, grey ${format(fitted.low)} to ${format(fitted.high)})`;
}

export class DensityError extends Error {}

export function parseDensity(raw: unknown): DensityStandard | undefined {
  if (raw === undefined || raw === null) return undefined;
  const data = raw as { fit?: unknown; points?: unknown };
  const standard = { fit: data.fit as DensityFit, points: Array.isArray(data.points) ? data.points.map((p) => ({ grey: (p as DensityPoint)?.grey, od: (p as DensityPoint)?.od })) : [] } as DensityStandard;
  if (!DENSITY_FITS.includes(standard.fit) || !standard.points.every((p) => typeof p.grey === "number" && typeof p.od === "number" && Number.isFinite(p.grey) && Number.isFinite(p.od))) {
    throw new DensityError("The document has an invalid density standard.");
  }
  return standard;
}

export const densityRecord = (standard: DensityStandard): Record<string, unknown> => ({ fit: standard.fit, points: standard.points.map((p) => ({ grey: p.grey, od: p.od })) });
