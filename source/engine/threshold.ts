// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Thresholds (IMAGE-ANALYSIS.md, Thresholds; roadmap I5). The input is the grey working image at its own depth; the
// output is a binary mask of the pixels whose values lie in a range [low, high], both ends included. The range is set
// by hand, or by an automatic method that finds a value t splitting the image into background and objects:
// v ≤ t is one class and v > t the other, so light objects are [t + 1, M] and dark objects [0, t]. The mask is
// computed from the steps whenever it is needed; the document keeps the threshold that makes it, and each results row
// keeps the mask's CRC-32 and count, so that measuring the row again can show it used the same mask.
import { maxValue, withinImage, type Raster } from "./raster";
import { applyMaskOperations, MASK_OPERATION_KINDS, maskOperationProblem, type MaskOperation } from "./binary";
import { colourMask, colourRangesProblem, COLOUR_MODELS, type ColourModel3, type Range } from "./colour";

// MARK: given values

export type ThresholdMethod = "otsu" | "mean" | "li" | "isodata" | "percentile" | "triangle" | "intermodes" | "minimum" | "moments" | "maxentropy" | "yen"
  | "ijisodata" | "huang" | "minerror" | "renyientropy" | "shanbhag";
export const THRESHOLD_METHODS: readonly ThresholdMethod[] = [
  "otsu", "mean", "li", "isodata", "percentile", "triangle", "intermodes", "minimum", "moments", "maxentropy", "yen", "ijisodata", "huang", "minerror", "renyientropy", "shanbhag",
];
export type ObjectKind = "light" | "dark";

/**
 * An image's threshold: a range set by hand, or an automatic method with the kind of objects it keeps, and the mask
 * operations (binary.ts) run on its mask in order; none when absent.
 */
export type Threshold =
  | { mode: "manual"; low: number; high: number; operations?: MaskOperation[] }
  | { mode: ThresholdMethod; objects: ObjectKind; operations?: MaskOperation[] }
  /**
   * A colour threshold (colour.ts) on an RGB working image: a range per component of a colour model. `pick` is the
   * colour the ranges were set around (0 to 255 per component) and the tolerance used, when they came from a pick;
   * ranges typed in have none.
   */
  | { mode: "colour"; model: ColourModel3; ranges: [Range, Range, Range]; pick?: ColourPick; operations?: MaskOperation[] };

/** A picked colour, 0 to 255 per component, and the tolerance its ranges were made with, in percent of each span. */
export interface ColourPick { rgb: [number, number, number]; tolerance: number }

/** Li's iteration stops when t moves less than this, in grey values (half a step of an integer image). */
const LI_TOLERANCE = 0.5;
const LI_MAX_ITERATIONS = 1000;

// MARK: the histogram

/** The number of pixels of each value, 0 to M, of a grey image; only pixels where `region` is 1, when given, and never those outside the image. */
export function histogram(raster: Raster, region?: Uint8Array | null): Float64Array {
  if (raster.channels !== 1) throw new Error("A histogram needs a grey image.");
  const counts = new Float64Array(maxValue(raster.bitDepth) + 1);
  const data = raster.data, within = withinImage(raster, region ?? null);
  for (let i = 0; i < data.length; i++) if (!within || within[i]) counts[data[i]]++;
  return counts;
}

// MARK: automatic methods

/**
 * Otsu (1979): the t that maximises the between-class variance w0 · w1 · (μ0 − μ1)², where class 0 is v ≤ t and
 * class 1 is v > t. Computed from running sums over the histogram; on a tie the smallest t is taken. A histogram of
 * one value returns that value.
 */
export function otsuThreshold(counts: Float64Array): number {
  let total = 0, sum = 0;
  for (let v = 0; v < counts.length; v++) { total += counts[v]; sum += v * counts[v]; }
  if (!total) return 0;
  let n0 = 0, sum0 = 0, best = -1, bestT = 0;
  for (let t = 0; t < counts.length - 1; t++) {
    n0 += counts[t];
    sum0 += t * counts[t];
    const n1 = total - n0;
    if (!n0 || !n1) continue;
    const mu0 = sum0 / n0, mu1 = (sum - sum0) / n1;
    const between = (n0 / total) * (n1 / total) * (mu0 - mu1) ** 2;
    if (between > best) { best = between; bestT = t; }
  }
  if (best < 0) for (let v = 0; v < counts.length; v++) if (counts[v]) return v;
  return bestT;
}

/** Mean (Glasbey 1993, as ImageJ names it): t = ⌊mean of all values⌋. */
export function meanThreshold(counts: Float64Array): number {
  let total = 0, sum = 0;
  for (let v = 0; v < counts.length; v++) { total += counts[v]; sum += v * counts[v]; }
  return total ? Math.floor(sum / total) : 0;
}

/**
 * Li (Li and Tam 1998), minimum cross-entropy by iteration: from t = mean, repeat
 * t ← (μb − μf) / (ln μb − ln μf), the logarithmic mean of μb and μf, the means of v ≤ t and v > t, until t moves
 * less than half a grey value; the result is ⌊t⌋. The values are used as they are, since the logarithmic mean does not
 * survive a shift; when the background mean is 0 the formula's limit, 0, is taken. An image of one value returns that
 * value.
 */
export function liThreshold(counts: Float64Array): number {
  let total = 0, sum = 0, first = -1;
  for (let v = 0; v < counts.length; v++) { total += counts[v]; sum += v * counts[v]; if (first < 0 && counts[v]) first = v; }
  if (!total) return 0;
  let t = sum / total;
  for (let iteration = 0; iteration < LI_MAX_ITERATIONS; iteration++) {
    let nb = 0, sb = 0, nf = 0, sf = 0;
    for (let v = 0; v < counts.length; v++) {
      if (v <= t) { nb += counts[v]; sb += v * counts[v]; } else { nf += counts[v]; sf += v * counts[v]; }
    }
    if (!nb || !nf) return first;
    const mb = sb / nb, mf = sf / nf;
    const next = mb === 0 ? 0 : (mb - mf) / (Math.log(mb) - Math.log(mf));
    const moved = Math.abs(next - t);
    t = next;
    if (moved < LI_TOLERANCE) break;
  }
  return Math.floor(t);
}

// The methods below follow the Auto Threshold family (Landini) as the papers define them. Each returns t with the same
// meaning as above (v ≤ t one class, v > t the other); an empty histogram gives 0 and one of a single value gives that
// value, as Otsu does, so each method's own rule only sees two values or more.

/** Iterative methods stop after this many rounds; smoothing for two peaks after `SMOOTHING_ROUNDS`. */
const METHOD_ITERATIONS = 1000;
const SMOOTHING_ROUNDS = 10000;

/** A histogram as shares: the count, the first and last values present, and each value's share p. */
interface Shares { total: number; first: number; last: number; p: Float64Array }

/** A method that needs two values or more, given the histogram's shares; the empty and single-value cases are answered here. */
const twoOrMore = (rule: (counts: Float64Array, shares: Shares) => number) => (counts: Float64Array): number => {
  let total = 0, first = -1, last = -1;
  for (let v = 0; v < counts.length; v++) if (counts[v]) { total += counts[v]; if (first < 0) first = v; last = v; }
  if (first < 0) return 0;
  if (first === last) return first;
  return rule(counts, { total, first, last, p: counts.map((n) => n / total) });
};

/** The value t from `from` to `to` − 1 with the largest score; the smallest on a tie. Scores that are not finite are passed over. */
function argmax(from: number, to: number, score: (t: number) => number): number {
  let best = -Infinity, bestT = from;
  for (let t = from; t < to; t++) { const value = score(t); if (Number.isFinite(value) && value > best + 1e-12) { best = value; bestT = t; } }
  return bestT;
}

/**
 * IsoData (Ridler and Calvard 1978): from t = ⌊mean⌋, repeat t ← ⌊(μ0 + μ1) / 2⌋, the means of v ≤ t and v > t, until
 * t stays the same (at most 1000 times).
 */
export const isodataThreshold = twoOrMore((counts) => {
  let t = meanThreshold(counts);
  for (let iteration = 0; iteration < METHOD_ITERATIONS; iteration++) {
    let n0 = 0, s0 = 0, n1 = 0, s1 = 0;
    for (let v = 0; v < counts.length; v++) { if (v <= t) { n0 += counts[v]; s0 += v * counts[v]; } else { n1 += counts[v]; s1 += v * counts[v]; } }
    const next = Math.floor((s0 / n0 + s1 / n1) / 2);
    if (!n0 || !n1 || next === t) break;
    t = next;
  }
  return t;
});

/** The t from the first value present whose share of pixels at or below it is closest to `share`; the smallest on a tie. */
function closestShare(shares: Shares, share: number): number {
  let seen = 0;
  const cumulative = shares.p.map((p) => (seen += p));
  return argmax(shares.first, shares.last + 1, (t) => -Math.abs(cumulative[t] - share));
}

/** Percentile (Doyle 1962): the t whose share of pixels at or below it is closest to half; the smallest on a tie. */
export const percentileThreshold = twoOrMore((_, shares) => closestShare(shares, 0.5));

/**
 * Triangle (Zack, Rogers and Latt 1977): a line from the histogram's peak to the end of its longer tail, one value
 * past the last value present; t is the value farthest below that line (the first on a tie). On a tail to the right
 * t is one less, so the value found joins the tail's class (v > t) as it does on the left (v ≤ t).
 */
export const triangleThreshold = twoOrMore((counts, { first, last }) => {
  let peak = first;
  for (let v = first; v <= last; v++) if (counts[v] > counts[peak]) peak = v;
  const left = peak - first >= last - peak;
  const end = left ? Math.max(0, first - 1) : Math.min(counts.length - 1, last + 1);
  if (end === peak) return peak;
  const below = (v: number) => counts[end] + ((counts[peak] - counts[end]) * (v - end)) / (peak - end) - counts[v];
  const split = left ? argmax(end, peak + 1, below) : argmax(peak, end + 1, below);
  return left ? split : Math.max(0, split - 1);
});

const isPeak = (h: Float64Array, v: number) => h[v - 1] < h[v] && h[v + 1] < h[v];

/** The histogram smoothed by a running mean of three until it has exactly two peaks, and those peaks; null when it never does. */
function twoPeaks(counts: Float64Array): { h: Float64Array; peaks: [number, number] } | null {
  const h = Float64Array.from(counts), n = h.length;
  for (let round = 0; round < SMOOTHING_ROUNDS; round++) {
    const peaks: number[] = [];
    for (let v = 1; v < n - 1 && peaks.length < 3; v++) if (isPeak(h, v)) peaks.push(v);
    if (peaks.length === 2) return { h, peaks: peaks as [number, number] };
    let previous = 0, current = 0, next = h[0];
    for (let v = 0; v < n - 1; v++) { previous = current; current = next; next = h[v + 1]; h[v] = (previous + current + next) / 3; }
    h[n - 1] = (current + next) / 3;
  }
  return null;
}

/**
 * Intermodes (Prewitt and Mendelsohn 1966): the histogram smoothed until it has two peaks, then t = ⌊(j + k) / 2⌋, j
 * and k the peaks. A histogram that never has two peaks gives its first value present.
 */
export const intermodesThreshold = twoOrMore((counts, { first }) => {
  const found = twoPeaks(counts);
  return found ? Math.floor((found.peaks[0] + found.peaks[1]) / 2) : first;
});

/** Minimum (Prewitt and Mendelsohn 1966): the histogram smoothed until it has two peaks, then t is the first valley between them. */
export const minimumThreshold = twoOrMore((counts, { first }) => {
  const found = twoPeaks(counts);
  if (!found) return first;
  const { h, peaks } = found;
  for (let v = peaks[0] + 1; v < peaks[1]; v++) if (h[v - 1] > h[v] && h[v + 1] >= h[v]) return v;
  return first;
});

/**
 * Moments (Tsai 1985): the two-level image with the same first three moments has its lower level on a share p0 of the
 * pixels; t is the value whose share at or below it is closest to p0.
 */
export const momentsThreshold = twoOrMore((_, shares) => {
  let m1 = 0, m2 = 0, m3 = 0;
  shares.p.forEach((p, v) => { m1 += v * p; m2 += v * v * p; m3 += v * v * v * p; });
  const cd = m2 - m1 * m1, c0 = (-m2 * m2 + m1 * m3) / cd, c1 = (m1 * m2 - m3) / cd;
  const root = Math.sqrt(Math.max(0, c1 * c1 - 4 * c0));
  const z0 = 0.5 * (-c1 - root), z1 = 0.5 * (-c1 + root);
  return closestShare(shares, (z1 - m1) / (z1 - z0));
});

/**
 * MaxEntropy (Kapur, Sahoo and Wong 1985): the t that maximises the entropy of v ≤ t plus that of v > t, each class's
 * histogram normalised to its own share P. A class's entropy is ln P − (Σ p ln p) / P, so running sums make it one pass.
 * The smallest t on a tie.
 */
export const maxEntropyThreshold = twoOrMore((_, { first, last, p }) => {
  const plogp = p.map((value) => (value > 0 ? value * Math.log(value) : 0));
  const all = plogp.reduce((a, b) => a + b, 0);
  let share = 0, sum = 0;
  const below = new Float64Array(p.length), sums = new Float64Array(p.length);
  for (let t = 0; t < p.length; t++) { share += p[t]; sum += plogp[t]; below[t] = share; sums[t] = sum; }
  return argmax(first, last, (t) => {
    const P = below[t], Q = 1 - P;
    return P > 0 && Q > 0 ? Math.log(P) - sums[t] / P + Math.log(Q) - (all - sums[t]) / Q : -Infinity;
  });
});

/**
 * Yen (Yen, Chang and Chang 1995): the t that maximises the correlation criterion
 * −ln(Σ_{v≤t} p² · Σ_{v>t} p²) + 2 ln(P · (1 − P)), P the share at or below t. The smallest t on a tie.
 */
export const yenThreshold = twoOrMore((_, { first, last, p }) => {
  const squares = p.reduce((sum, value) => sum + value * value, 0);
  let share = 0, squared = 0;
  const below = new Float64Array(p.length), squaresBelow = new Float64Array(p.length);
  for (let t = 0; t < p.length; t++) { share += p[t]; squared += p[t] * p[t]; below[t] = share; squaresBelow[t] = squared; }
  return argmax(first, last, (t) => -Math.log(squaresBelow[t] * (squares - squaresBelow[t])) + 2 * Math.log(below[t] * (1 - below[t])));
});

/**
 * ImageJ's Default, IJ IsoData: the values 0 and M are left out (erased areas), then from the lowest value present t
 * moves up until it passes the midpoint of the two classes' means; t is that midpoint rounded. With one value or none
 * between 0 and M (an image of 0s and Ms) it gives the middle of the scale, as ImageJ does.
 */
export const ijIsodataThreshold = twoOrMore((counts) => {
  const M = counts.length - 1, h = Float64Array.from(counts);
  h[0] = 0; h[M] = 0;
  let min = 0, max = M;
  while (!h[min] && min < M) min++;
  while (!h[max] && max > 0) max--;
  if (min >= max) return Math.floor(counts.length / 2);
  // Running sums of v ≤ moving; the rest is the total less them.
  let total = 0, totalSum = 0;
  for (let v = min; v <= max; v++) { total += h[v]; totalSum += v * h[v]; }
  let moving = min, result = 0, n1 = 0, s1 = 0;
  for (let v = min; v < moving; v++) { n1 += h[v]; s1 += v * h[v]; }
  do {
    n1 += h[moving]; s1 += moving * h[moving];
    result = (s1 / n1 + (totalSum - s1) / (total - n1)) / 2;
    moving++;
  } while (moving + 1 <= result && moving < max - 1);
  return Math.round(result);
});

/**
 * The quadratic methods (Huang, Shanbhag) on a 16-bit histogram with more than this many values present run on this
 * many equal bins; t is the top value of the bin found, so the time stays a fraction of a second.
 */
const QUADRATIC_BINS = 2048;

/** Run a method on the histogram, or on `QUADRATIC_BINS` bins of it when it has more values present than that. */
function binned(rule: (counts: Float64Array) => number): (counts: Float64Array) => number {
  return (counts) => {
    let present = 0;
    for (const n of counts) if (n) present++;
    if (present <= QUADRATIC_BINS) return rule(counts);
    const width = Math.ceil(counts.length / QUADRATIC_BINS), bins = new Float64Array(Math.ceil(counts.length / width));
    counts.forEach((n, v) => { bins[Math.floor(v / width)] += n; });
    return Math.min(counts.length - 1, (rule(bins) + 1) * width - 1);
  };
}

/** The values present, in order. */
const present = (counts: Float64Array): number[] => { const values: number[] = []; counts.forEach((n, v) => { if (n) values.push(v); }); return values; };

/**
 * Huang (Huang and Wang 1995), as ImageJ computes it: the t with the least fuzzy entropy, each value's membership of its
 * class 1 / (1 + |v − μ| / (last − first)), μ its class's mean, entropy by Shannon's function. The smallest t on a tie;
 * only values present are tried (between them the entropy does not change), and 0 for "every value above t".
 */
export const huangThreshold = binned(twoOrMore((counts, { first, last }) => {
  const n = counts.length, term = 1 / (last - first), values = present(counts);
  const below = new Float64Array(n), above = new Float64Array(n);
  let sum = 0, count = 0;
  for (let v = first; v < n; v++) { sum += v * counts[v]; count += counts[v]; below[v] = sum / count; }
  sum = 0; count = 0;
  for (let v = last; v > 0; v--) { sum += v * counts[v]; count += counts[v]; above[v - 1] = sum / count; }
  const shannon = (mu: number) => (mu < 1e-6 || mu > 0.999999 ? 0 : -mu * Math.log(mu) - (1 - mu) * Math.log(1 - mu));
  let best = Infinity, bestT = -1;
  for (const t of first > 0 ? [0, ...values] : values) {
    let entropy = 0;
    for (const v of values) entropy += counts[v] * shannon(1 / (1 + term * Math.abs(v - (v <= t ? below[t] : above[t]))));
    if (entropy < best) { best = entropy; bestT = t; }
  }
  return bestT;
}));

/**
 * MinError(I) (Kittler and Illingworth 1986), as ImageJ iterates it: from the mean, t is the lower crossing of the two
 * normal curves fitted to v ≤ t and v > t, until t stays the same. When the fit has no crossing it stops where it is.
 */
export const minErrorThreshold = twoOrMore((counts) => {
  const M = counts.length - 1, a = new Float64Array(counts.length), b = new Float64Array(counts.length), c = new Float64Array(counts.length);
  let sa = 0, sb = 0, sc = 0;
  counts.forEach((n, v) => { sa += n; sb += v * n; sc += v * v * n; a[v] = sa; b[v] = sb; c[v] = sc; });
  let t = meanThreshold(counts), previous = -2;
  for (let iteration = 0; t !== previous && iteration < METHOD_ITERATIONS; iteration++) {
    if (t < 0 || t >= M || !a[t] || a[M] === a[t]) break;
    const mu = b[t] / a[t], nu = (b[M] - b[t]) / (a[M] - a[t]);
    const p = a[t] / a[M], q = (a[M] - a[t]) / a[M];
    const sigma2 = c[t] / a[t] - mu * mu, tau2 = (c[M] - c[t]) / (a[M] - a[t]) - nu * nu;
    const w0 = 1 / sigma2 - 1 / tau2, w1 = mu / sigma2 - nu / tau2;
    const w2 = (mu * mu) / sigma2 - (nu * nu) / tau2 + Math.log10((sigma2 * q * q) / (tau2 * p * p));
    const root = w1 * w1 - w0 * w2;
    if (root < 0) break;
    previous = t;
    const next = (w1 + Math.sqrt(root)) / w0;
    if (Number.isNaN(next)) break;
    t = Math.floor(next);
  }
  return Math.min(M, Math.max(0, t));
});

/** The shares at or below each value (P1) and above it (P2), and the first and last t where both classes have pixels. */
function classShares(p: Float64Array): { below: Float64Array; above: Float64Array; from: number; to: number } {
  const below = new Float64Array(p.length), above = new Float64Array(p.length);
  let share = 0;
  p.forEach((value, v) => { share += value; below[v] = share; above[v] = 1 - share; });
  let from = 0, to = p.length - 1;
  while (from < p.length && Math.abs(below[from]) < Number.EPSILON) from++;
  while (to > from && Math.abs(above[to]) < Number.EPSILON) to--;
  return { below, above, from, to };
}

/**
 * RenyiEntropy (Kapur, Sahoo and Wong 1985; Sahoo, Wilkins and Yeager 1997), as ImageJ combines it: the t of greatest
 * Rényi entropy for α = 0.5, 1 and 2, sorted, then weighted by the shares between them (weights 1, 2, 1 or 0, 1, 3 or
 * 3, 1, 0, as the three lie within 5 values of each other on 8 bits, the same share of the scale on 16). Running sums make each α one pass. Where no split has
 * any entropy (two values only) every order gives 0, and so does the method, as in ImageJ.
 */
export const renyiEntropyThreshold = twoOrMore((_, { p }) => {
  const { below, above, from, to } = classShares(p);
  const sums = (f: (value: number) => number) => { let s = 0; const out = new Float64Array(p.length); p.forEach((value, v) => { s += value > 0 ? f(value) : 0; out[v] = s; }); return out; };
  const plogp = sums((value) => value * Math.log(value)), roots = sums(Math.sqrt), squares = sums((value) => value * value);
  // As ImageJ: the greatest above 0, else 0. Its loops give exactly 0 where the sums here leave rounding, hence the margin.
  const best = (score: (t: number) => number) => { let most = 1e-12, at = 0; for (let t = from; t <= to; t++) { const e = score(t); if (e > most) { most = e; at = t; } } return at; };
  const all = p.length - 1;
  // α = 1: Shannon entropy of each class, ln P − Σ p ln p / P.
  const shannon = best((t) => (below[t] > 0 ? Math.log(below[t]) - plogp[t] / below[t] : 0) + (above[t] > 0 ? Math.log(above[t]) - (plogp[all] - plogp[t]) / above[t] : 0));
  const renyi = (alpha: number, sum: Float64Array, power: (share: number) => number) => best((t) => {
    const product = (sum[t] / power(below[t])) * ((sum[all] - sum[t]) / power(above[t]));
    return (1 / (1 - alpha)) * (product > 0 ? Math.log(product) : 0);
  });
  const half = renyi(0.5, roots, Math.sqrt), two = renyi(2, squares, (share) => share * share);
  const [t1, t2, t3] = [half, shannon, two].sort((x, y) => x - y);
  // ImageJ's 5 values are of a 256-value histogram; a 16-bit one takes the same share of its scale.
  const near = 5 * (p.length / 256);
  const near12 = Math.abs(t1 - t2) <= near, near23 = Math.abs(t2 - t3) <= near;
  const [beta1, beta2, beta3] = near12 ? (near23 ? [1, 2, 1] : [0, 1, 3]) : near23 ? [3, 1, 0] : [1, 2, 1];
  const omega = below[t3] - below[t1];
  return Math.trunc(t1 * (below[t1] + 0.25 * omega * beta1) + 0.25 * t2 * omega * beta2 + t3 * (above[t3] + 0.25 * omega * beta3));
});

/**
 * Shanbhag (1994), as ImageJ computes it: the t where the fuzzy information of the two classes is most nearly equal,
 * each value's membership falling with its share's distance from t. The smallest t on a tie; only values present are tried.
 */
export const shanbhagThreshold = binned(twoOrMore((counts, { p }) => {
  const { below, above, from, to } = classShares(p);
  const values = present(counts);
  let best = Infinity, bestT = -1;
  for (const t of values.filter((v) => v >= from && v <= to)) {
    let back = 0, object = 0;
    const termBack = 0.5 / below[t], termObject = 0.5 / above[t];
    for (const v of values) {
      if (v >= 1 && v <= t) back -= p[v] * Math.log(1 - termBack * below[v - 1]);
      else if (v > t) object -= p[v] * Math.log(1 - termObject * above[v]);
    }
    const difference = Math.abs(back * termBack - object * termObject);
    if (difference < best) { best = difference; bestT = t; }
  }
  return bestT;
}));

export function automaticThreshold(method: ThresholdMethod, counts: Float64Array): number {
  switch (method) {
    case "otsu": return otsuThreshold(counts);
    case "mean": return meanThreshold(counts);
    case "li": return liThreshold(counts);
    case "isodata": return isodataThreshold(counts);
    case "percentile": return percentileThreshold(counts);
    case "triangle": return triangleThreshold(counts);
    case "intermodes": return intermodesThreshold(counts);
    case "minimum": return minimumThreshold(counts);
    case "moments": return momentsThreshold(counts);
    case "maxentropy": return maxEntropyThreshold(counts);
    case "yen": return yenThreshold(counts);
    case "ijisodata": return ijIsodataThreshold(counts);
    case "huang": return huangThreshold(counts);
    case "minerror": return minErrorThreshold(counts);
    case "renyientropy": return renyiEntropyThreshold(counts);
    case "shanbhag": return shanbhagThreshold(counts);
  }
}

// MARK: ranges and masks

/** The range a threshold keeps on an image of maximum M, and the value t an automatic method found. */
export function thresholdRange(threshold: Exclude<Threshold, { mode: "colour" }>, counts: Float64Array): { low: number; high: number; t: number | null } {
  const M = counts.length - 1;
  if (threshold.mode === "manual") return { low: Math.max(0, threshold.low), high: Math.min(M, threshold.high), t: null };
  const t = automaticThreshold(threshold.mode, counts);
  return threshold.objects === "light" ? { low: t + 1, high: M, t } : { low: 0, high: t, t };
}

/** Why a threshold cannot be applied to this image, or null. Thresholds need a grey image and low ≤ high. */
export function thresholdProblem(threshold: Threshold, raster: Pick<Raster, "channels" | "bitDepth">): string | null {
  if (threshold.mode === "colour") return raster.channels === 3 ? colourRangesProblem(threshold.model, threshold.ranges) : "A colour threshold needs a colour image. Remove the Convert to grey step, or use a grey threshold.";
  if (raster.channels !== 1) return "Thresholds need a grey image. Add a Convert to grey step first.";
  if (threshold.mode === "manual") {
    const M = maxValue(raster.bitDepth);
    if (!Number.isFinite(threshold.low) || !Number.isFinite(threshold.high)) return "The range needs two numbers.";
    if (threshold.low > threshold.high) return "The low value must not be above the high value.";
    if (threshold.low > M) return `The range lies above the image's values, which end at ${M}.`;
  }
  return null;
}

/** The mask of a range: 1 where low ≤ v ≤ high. */
export function rangeMask(raster: Raster, low: number, high: number): Uint8Array {
  const mask = new Uint8Array(raster.widthPx * raster.heightPx);
  const data = raster.data;
  for (let i = 0; i < mask.length; i++) { const v = data[i]; mask[i] = v >= low && v <= high ? 1 : 0; }
  return mask;
}

/** For a colour threshold, low and high are 0 and t is null: the ranges are the threshold's own. */
export interface ThresholdResult { low: number; high: number; t: number | null; mask: Uint8Array; count: number }

/** Apply a threshold to a grey working image: its range, the value an automatic method found, the mask and its count. */
export function applyThreshold(raster: Raster, threshold: Threshold): ThresholdResult {
  const problem = thresholdProblem(threshold, raster);
  if (problem) throw new Error(problem);
  let low = 0, high = 0, t: number | null = null, mask: Uint8Array;
  if (threshold.mode === "colour") mask = colourMask(raster, threshold.model, threshold.ranges);
  else {
    ({ low, high, t } = thresholdRange(threshold, histogram(raster)));
    mask = rangeMask(raster, low, high);
  }
  // Pixels a Canvas step added are not the image: no range takes them, mask operations see them as background (as past
  // the image's edge, whatever the canvas value), and no dilate at the edge grows into them.
  const outside = raster.outside;
  const clearOutside = () => { if (outside) for (let i = 0; i < mask.length; i++) if (outside[i]) mask[i] = 0; };
  clearOutside();
  if (threshold.operations?.length) mask = applyMaskOperations(mask, raster.widthPx, raster.heightPx, threshold.operations);
  clearOutside();
  let count = 0;
  for (let i = 0; i < mask.length; i++) count += mask[i];
  return { low, high, t, mask, count };
}

// MARK: reading and writing

export class ThresholdError extends Error {}

/** A stored threshold, checked; null when the image has none. */
export function parseThreshold(raw: unknown): Threshold | null {
  if (raw === undefined || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const threshold = parseRange(data);
  if (data.operations !== undefined) {
    if (!Array.isArray(data.operations)) throw new ThresholdError("The document has invalid mask operations.");
    threshold.operations = data.operations.map((item) => {
      const fields = item as Record<string, unknown>;
      const operation = { kind: fields?.kind, iterations: fields?.iterations ?? 1, ...(fields?.count !== undefined && fields.count !== 1 ? { count: fields.count } : {}) } as MaskOperation;
      if (!MASK_OPERATION_KINDS.includes(operation.kind) || maskOperationProblem(operation)) throw new ThresholdError("The document has an invalid mask operation.");
      return operation;
    });
  }
  return threshold;
}

function parseRange(data: Record<string, unknown>): Threshold {
  if (data.mode === "manual") {
    if (typeof data.low !== "number" || typeof data.high !== "number" || !Number.isFinite(data.low) || !Number.isFinite(data.high) || data.low > data.high) {
      throw new ThresholdError("The document has an invalid threshold range.");
    }
    return { mode: "manual", low: data.low, high: data.high };
  }
  if (data.mode === "colour") {
    const ranges = data.ranges as [Range, Range, Range];
    if (!COLOUR_MODELS.includes(data.model as ColourModel3) || colourRangesProblem(data.model as ColourModel3, Array.isArray(ranges) ? ranges : [])) throw new ThresholdError("The document has an invalid colour threshold.");
    const pick = data.pick as ColourPick | undefined;
    if (pick !== undefined && !(Array.isArray(pick?.rgb) && pick.rgb.length === 3 && pick.rgb.every((v) => typeof v === "number" && v >= 0 && v <= 255)
      && typeof pick.tolerance === "number" && pick.tolerance >= 0 && pick.tolerance <= 100)) throw new ThresholdError("The document has an invalid picked colour.");
    return { mode: "colour", model: data.model as ColourModel3, ranges: ranges.map((range) => [range[0], range[1]]) as [Range, Range, Range], ...(pick ? { pick: { rgb: [pick.rgb[0], pick.rgb[1], pick.rgb[2]], tolerance: pick.tolerance } } : {}) };
  }
  if (THRESHOLD_METHODS.includes(data.mode as ThresholdMethod)) {
    if (data.objects !== "light" && data.objects !== "dark") throw new ThresholdError("The document has a threshold without light or dark objects.");
    return { mode: data.mode as ThresholdMethod, objects: data.objects };
  }
  throw new ThresholdError(`The document has a threshold of an unknown kind (${String(data.mode)}).`);
}

export function thresholdRecord(threshold: Threshold): Record<string, unknown> {
  const record: Record<string, unknown> = threshold.mode === "manual" ? { mode: "manual", low: threshold.low, high: threshold.high }
    : threshold.mode === "colour" ? { mode: "colour", model: threshold.model, ranges: threshold.ranges.map((range) => [range[0], range[1]]), ...(threshold.pick ? { pick: { rgb: [...threshold.pick.rgb], tolerance: threshold.pick.tolerance } } : {}) }
    : { mode: threshold.mode, objects: threshold.objects };
  if (threshold.operations?.length) record.operations = threshold.operations.map((operation) => ({ kind: operation.kind, iterations: operation.iterations, ...(operation.count !== undefined && operation.count !== 1 ? { count: operation.count } : {}) }));
  return record;
}
