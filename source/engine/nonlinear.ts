// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Least squares for any model (2026-11-18): Levenberg–Marquardt from starting values, with a numerical Jacobian, and
// the statistics of a fit as Origin and Prism report them: each parameter's standard error and 95% interval, SSE,
// R², adjusted R² and RMSE. Weighted fits minimise Σ w (y − f)², and their statistics are weighted too.

export type Model = (x: number, p: readonly number[]) => number;

/** Each parameter's value, standard error and 95% interval; a fixed parameter has no error. */
export interface FitParameter { name: string; value: number; se: number | null; low: number | null; high: number | null; fixed: boolean }
export interface FitStatistics { n: number; dof: number; sse: number; r2: number; adjR2: number; rmse: number }
export interface LeastSquares { values: number[]; converged: boolean; iterations: number }

const MAX_ITERATIONS = 400;

/** Solve a small linear system by Gaussian elimination with partial pivoting; null when it is singular. */
export function solveLinear(a: readonly number[][], b: readonly number[]): number[] | null {
  const n = b.length, m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (!(Math.abs(m[pivot][col]) > 1e-300)) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = m[row][col] / m[col][col];
      for (let k = col; k <= n; k++) m[row][k] -= f * m[col][k];
    }
  }
  const out = m.map((row, i) => row[n] / row[i]);
  return out.every(Number.isFinite) ? out : null;
}

/** The weighted residual sum of squares, or Infinity where the model has no finite value. */
function sumOfSquares(model: Model, x: readonly number[], y: readonly number[], w: readonly number[], p: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < x.length; i++) {
    const r = y[i] - model(x[i], p);
    if (!Number.isFinite(r)) return Infinity;
    total += w[i] * r * r;
  }
  return total;
}

/** ∂f/∂p for the free parameters at each x, by central differences. */
function jacobian(model: Model, x: readonly number[], p: readonly number[], free: readonly number[]): number[][] {
  const rows = x.map(() => new Array<number>(free.length).fill(0));
  free.forEach((index, column) => {
    const h = 1e-6 * Math.max(Math.abs(p[index]), 1e-6), up = [...p], down = [...p];
    up[index] += h; down[index] -= h;
    for (let i = 0; i < x.length; i++) rows[i][column] = (model(x[i], up) - model(x[i], down)) / (2 * h);
  });
  return rows;
}

/** JᵀWJ and JᵀW r for the free parameters. */
function normalEquations(J: number[][], x: readonly number[], y: readonly number[], w: readonly number[], model: Model, p: readonly number[]) {
  const k = J[0]?.length ?? 0, a = Array.from({ length: k }, () => new Array<number>(k).fill(0)), g = new Array<number>(k).fill(0);
  for (let i = 0; i < x.length; i++) {
    const r = y[i] - model(x[i], p);
    for (let c = 0; c < k; c++) {
      g[c] += w[i] * J[i][c] * r;
      for (let d = c; d < k; d++) a[c][d] += w[i] * J[i][c] * J[i][d];
    }
  }
  for (let c = 0; c < k; c++) for (let d = 0; d < c; d++) a[c][d] = a[d][c];
  return { a, g };
}

/** Levenberg–Marquardt from `start`, moving only the parameters not marked `fixed`. */
export function leastSquares(model: Model, x: readonly number[], y: readonly number[], w: readonly number[], start: readonly number[], fixed: readonly boolean[]): LeastSquares {
  const free = start.map((_, i) => i).filter((i) => !fixed[i]);
  let p = [...start], sse = sumOfSquares(model, x, y, w, p), lambda = 1e-3;
  if (!free.length || !Number.isFinite(sse)) return { values: p, converged: free.length === 0 && Number.isFinite(sse), iterations: 0 };
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const { a, g } = normalEquations(jacobian(model, x, p, free), x, y, w, model, p);
    let improved = false;
    while (lambda < 1e16) {
      const damped = a.map((row, c) => row.map((value, d) => (c === d ? value + lambda * Math.max(value, 1e-12) : value)));
      const step = solveLinear(damped, g);
      if (step) {
        const next = [...p];
        free.forEach((index, c) => { next[index] += step[c]; });
        const nextSse = sumOfSquares(model, x, y, w, next);
        if (nextSse <= sse) {
          const small = step.every((value, c) => Math.abs(value) <= 1e-10 * (Math.abs(p[free[c]]) + 1e-10));
          const flat = sse - nextSse <= 1e-14 * (sse + 1e-300);
          p = next; sse = nextSse; lambda = Math.max(lambda / 10, 1e-12); improved = true;
          if (small || flat) return { values: p, converged: true, iterations: iteration };
          break;
        }
      }
      lambda *= 10;
    }
    // No step lowers the sum further: the fit is at its minimum (or as near as numbers allow).
    if (!improved) return { values: p, converged: true, iterations: iteration };
  }
  return { values: p, converged: false, iterations: MAX_ITERATIONS };
}

// MARK: statistics

/** ln Γ(z), Lanczos. */
function logGamma(z: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const value of c) ser += value / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** The regularised incomplete beta function Iₓ(a, b), by its continued fraction. */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x > (a + 1) / (a + b + 2)) return 1 - incompleteBeta(1 - x, b, a);
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d);
  let h = d;
  for (let m = 1; m <= 300; m++) {
    for (const numerator of [(m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m)), -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))]) {
      d = 1 + numerator * d; d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d);
      c = 1 + numerator / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      h *= d * c;
    }
    if (Math.abs(d * c - 1) < 1e-15) break;
  }
  return (front * h) / a;
}

/** The t value with `dof` degrees of freedom that leaves 2.5% in each tail, for a 95% interval. */
export function tQuantile95(dof: number): number {
  const twoTailed = (t: number) => incompleteBeta(dof / (dof + t * t), dof / 2, 0.5);
  let low = 0, high = 1000;
  for (let i = 0; i < 100; i++) { const mid = (low + high) / 2; if (twoTailed(mid) > 0.05) low = mid; else high = mid; }
  return (low + high) / 2;
}

/** Each parameter with its error and interval, from the covariance s² (JᵀWJ)⁻¹ at the solution, and the fit's statistics. */
export function fitStatistics(model: Model, x: readonly number[], y: readonly number[], w: readonly number[], p: readonly number[], fixed: readonly boolean[], names: readonly string[]): { parameters: FitParameter[]; statistics: FitStatistics } {
  const free = p.map((_, i) => i).filter((i) => !fixed[i]), n = x.length, dof = n - free.length;
  const sse = sumOfSquares(model, x, y, w, p);
  const weight = w.reduce((sum, value) => sum + value, 0), mean = y.reduce((sum, value, i) => sum + w[i] * value, 0) / weight;
  const sst = y.reduce((sum, value, i) => sum + w[i] * (value - mean) ** 2, 0);
  const r2 = sst > 0 ? 1 - sse / sst : 1;
  const statistics: FitStatistics = { n, dof, sse, r2, adjR2: dof > 0 && n > 1 ? 1 - ((1 - r2) * (n - 1)) / dof : r2, rmse: dof > 0 ? Math.sqrt(sse / dof) : 0 };
  let errors: (number | null)[] = free.map(() => null);
  if (dof > 0 && free.length) {
    const { a } = normalEquations(jacobian(model, x, p, free), x, y, w, model, p);
    const variance = sse / dof;
    errors = free.map((_, c) => {
      const unit = free.map((__, d) => (d === c ? 1 : 0)), column = solveLinear(a, unit);
      return column && column[c] >= 0 ? Math.sqrt(variance * column[c]) : null;
    });
  }
  const t = dof > 0 ? tQuantile95(dof) : 0;
  const parameters = p.map((value, i) => {
    const se = fixed[i] ? null : errors[free.indexOf(i)] ?? null;
    return { name: names[i], value, se, low: se === null ? null : value - t * se, high: se === null ? null : value + t * se, fixed: !!fixed[i] };
  });
  return { parameters, statistics };
}
