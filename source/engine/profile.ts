// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Histograms and profiles (IMAGE-ANALYSIS.md, Histogram and profile; roadmap I30 and the lane part of I20).
//
// - Histogram: the grey values of the working image, or of a region's pixels, counted in `bins` equal bins from 0 to
//   M + 1 (M the depth's maximum), with the count, mean, sample standard deviation, minimum, maximum and modal value.
//   Bin k holds the values from k · width to (k + 1) · width, the lower end included.
// - Line profile: the grey values along a line region, sampled once per pixel of its length from its first point,
//   by bilinear interpolation between the four nearest pixel centres; a pixel's value lies at its centre (x + 0.5,
//   y + 0.5). Each sample carries its distance from the start, in calibrated units.
// - Lane profile: the mean of each column of a rectangle region wider than tall (each row when it is taller than
//   wide), along its long side, as gel lanes are read. Each sample is at the centre of its column or row.
// - Peak area: the area between a profile and the straight baseline joining its values at two samples, by the
//   trapezoid rule, in grey value times distance. Parts below the baseline count as negative.
import { lengthOf, type Scale } from "./calibration";
import { maxValue, type Raster } from "./raster";
import type { Point } from "./roi";

export interface HistogramResult {
  /** Counts per bin, and the width of a bin in grey values. */
  counts: number[];
  binWidth: number;
  count: number;
  mean: number | null;
  stdDev: number | null;
  min: number | null;
  max: number | null;
  /** The most frequent value (not bin); the lowest on a tie. */
  modal: number | null;
}

export const DEFAULT_BINS = 256;

/** The histogram of a grey image's pixels, or of the pixels where `region` is 1. */
export function histogramOf(raster: Raster, region: Uint8Array | null = null, bins = DEFAULT_BINS): HistogramResult {
  if (raster.channels !== 1) throw new Error("A histogram needs a grey image. Add a Convert to grey step first.");
  if (!(Number.isInteger(bins) && bins >= 1 && bins <= 65536)) throw new Error("The number of bins is a whole number from 1 to 65536.");
  const M = maxValue(raster.bitDepth);
  const values = new Float64Array(M + 1);
  let count = 0, sum = 0, sum2 = 0;
  for (let i = 0; i < raster.data.length; i++) {
    if (region && !region[i]) continue;
    const v = raster.data[i];
    values[v]++; count++; sum += v; sum2 += v * v;
  }
  const binWidth = (M + 1) / bins;
  const counts = new Array<number>(bins).fill(0);
  let min: number | null = null, max: number | null = null, modal: number | null = null;
  for (let v = 0; v <= M; v++) {
    if (!values[v]) continue;
    counts[Math.min(bins - 1, Math.floor(v / binWidth))] += values[v];
    if (min === null) min = v;
    max = v;
    if (modal === null || values[v] > values[modal]) modal = v;
  }
  return {
    counts, binWidth, count, min, max, modal,
    mean: count ? sum / count : null,
    stdDev: count > 1 ? Math.sqrt(Math.max(0, (sum2 - (sum * sum) / count) / (count - 1))) : count ? 0 : null,
  };
}

export interface Profile {
  /** Distance of each sample from the start, in `unit`. */
  distances: number[];
  values: number[];
  unit: string;
}

/** The value at (x, y) between pixel centres, by bilinear interpolation; edge pixels extend outwards. */
export function interpolate(raster: Raster, x: number, y: number): number {
  const W = raster.widthPx, H = raster.heightPx;
  const fx = Math.min(W - 1, Math.max(0, x - 0.5)), fy = Math.min(H - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0, d = raster.data;
  const top = d[y0 * W + x0] * (1 - tx) + d[y0 * W + x1] * tx;
  const bottom = d[y1 * W + x0] * (1 - tx) + d[y1 * W + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

/** The profile along a line or polyline, one sample per pixel of length, its last point included. */
export function lineProfile(raster: Raster, points: readonly Point[], scale: Scale): Profile {
  if (raster.channels !== 1) throw new Error("A profile needs a grey image. Add a Convert to grey step first.");
  const distances: number[] = [], values: number[] = [];
  let travelled = 0;
  for (let s = 1; s < points.length; s++) {
    const [ax, ay] = points[s - 1], [bx, by] = points[s];
    const pixels = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.round(pixels));
    const real = lengthOf(bx - ax, by - ay, scale);
    for (let k = s === 1 ? 0 : 1; k <= steps; k++) {
      const t = k / steps;
      distances.push(travelled + t * real);
      values.push(interpolate(raster, ax + t * (bx - ax), ay + t * (by - ay)));
    }
    travelled += real;
  }
  return { distances, values, unit: scale.unit };
}

/** The lane profile of a rectangle: means across its short side, along its long side; whole pixels inside it. */
export function laneProfile(raster: Raster, box: { x: number; y: number; width: number; height: number }, scale: Scale): Profile {
  if (raster.channels !== 1) throw new Error("A profile needs a grey image. Add a Convert to grey step first.");
  const W = raster.widthPx, H = raster.heightPx;
  const x0 = Math.max(0, Math.round(box.x)), y0 = Math.max(0, Math.round(box.y));
  const x1 = Math.min(W, Math.round(box.x + box.width)), y1 = Math.min(H, Math.round(box.y + box.height));
  const alongX = x1 - x0 >= y1 - y0;
  const distances: number[] = [], values: number[] = [];
  const outer = alongX ? [x0, x1] : [y0, y1], inner = alongX ? [y0, y1] : [x0, x1];
  for (let a = outer[0]; a < outer[1]; a++) {
    let sum = 0;
    for (let b = inner[0]; b < inner[1]; b++) sum += raster.data[alongX ? b * W + a : a * W + b];
    values.push(inner[1] > inner[0] ? sum / (inner[1] - inner[0]) : 0);
    distances.push((a - outer[0] + 0.5) * (alongX ? scale.x : scale.y));
  }
  return { distances, values, unit: scale.unit };
}

/** The area between the profile and the baseline from sample `from` to sample `to`, by the trapezoid rule. */
export function peakArea(profile: Profile, from: number, to: number): number {
  const [a, b] = from <= to ? [from, to] : [to, from];
  if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b < profile.values.length)) throw new Error(`Samples run from 1 to ${profile.values.length}.`);
  const { distances: x, values: y } = profile;
  const span = x[b] - x[a];
  const base = (d: number) => (span ? y[a] + ((y[b] - y[a]) * (d - x[a])) / span : y[a]);
  let area = 0;
  for (let i = a + 1; i <= b; i++) area += ((y[i - 1] - base(x[i - 1]) + (y[i] - base(x[i]))) / 2) * (x[i] - x[i - 1]);
  return area;
}

// MARK: labelled peaks (roadmap I20)

export interface LabelledPeak {
  /** 1, 2, 3 … from the start of the profile. */
  label: number;
  /** Sample of the top, and of the valleys on either side that bound the peak; 0-based. */
  top: number;
  from: number;
  to: number;
  distance: number;
  value: number;
  /** The top above the higher of its two valleys. */
  prominence: number;
  /** Area above the baseline joining the two valleys (`peakArea`). */
  area: number;
}

/**
 * The peaks of a profile, labelled in order: a top is a sample higher than its neighbours (a flat top counts once,
 * at its first sample); its valleys are the nearest local minima on each side, reached by walking downhill (or the
 * profile's end), so neighbouring bands of a lane share a valley and their areas do not overlap. A peak is kept when
 * its prominence, the top above the higher valley, is at least `minProminence`. Dark bands on a light gel are peaks of
 * an inverted image.
 */
export function labelledPeaks(profile: Profile, minProminence: number): LabelledPeak[] {
  const y = profile.values, n = y.length, peaks: LabelledPeak[] = [];
  for (let i = 0; i < n; i++) {
    let j = i;
    while (j + 1 < n && y[j + 1] === y[i]) j++;
    const rises = i === 0 ? false : y[i - 1] < y[i], falls = j === n - 1 ? false : y[j + 1] < y[i];
    if (rises && falls) {
      let from = i, to = j;
      while (from > 0 && y[from - 1] < y[from]) from--;
      while (to < n - 1 && y[to + 1] < y[to]) to++;
      const prominence = y[i] - Math.max(y[from], y[to]);
      if (prominence >= minProminence && prominence > 0) peaks.push({ label: 0, top: i, from, to, distance: profile.distances[i], value: y[i], prominence, area: peakArea(profile, from, to) });
    }
    i = j;
  }
  peaks.forEach((peak, k) => { peak.label = k + 1; });
  return peaks;
}
