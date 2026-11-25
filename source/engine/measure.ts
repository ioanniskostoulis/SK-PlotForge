// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Measurements and the results table (IMAGE-ANALYSIS.md, Percentages and areas, Measurements, Results table;
// roadmap I6). A measurement is taken of a region (a region of interest's mask, or the whole image) and of the masked
// pixels in it (the threshold's mask within the region, or the whole region without a threshold):
//   area           masked pixels · sx · sy, in the calibrated unit squared
//   area fraction  masked pixels / region pixels · 100
//   mean, min, max grey of the region's pixels, in the image's own values (grey images only)
//   centroid       mean position of the masked pixels' centres, (x + 0.5) · sx and (y + 0.5) · sy
//   perimeter      the masked pixels' edges that face an unmasked pixel or the image's border, sx for each
//                  horizontal edge and sy for each vertical one. Exact for shapes along the pixel grid; a diagonal
//                  edge counts as a staircase, up to √2 times its length (about 27% on a circle)
// The measurement set (roadmap I18), over the same two sets of pixels:
//   std dev, modal, median grey   of the region's pixels, like the mean: the sample standard deviation (n − 1),
//                  the most frequent value (the lowest on a tie) and the median (the mean of the middle two)
//   integrated density            the sum of the region's values times the area of a pixel; the raw integrated
//                  density is the sum itself
//   centre of mass the region's pixel centres weighted by their grey values
//   optical density the mean of log10(M / v) over the region's pixels, M the depth's maximum; 0 counts as 1, the
//                  smallest value light can give. Uncalibrated: no density standard is applied
//   bounding rectangle of the masked pixels: left, top, width, height
//   shape          circularity 4π · area / P², at most 1, with P the perimeter with its corners cut as ImageJ's
//                  traced outlines are (each turn of the outline takes sx + sy − √(sx² + sy²) off); aspect ratio,
//                  the major over the minor axis of the ellipse with the masked pixels' second moments; roundness,
//                  4 · area / (π · major²), which for that ellipse is minor / major; solidity, the area over the
//                  area of the convex hull of the masked pixels' squares (their corners), so 1 for a filled
//                  rectangle. Over all masked pixels of the region together: for one value per object, use particle
//                  analysis
//   skewness, kurtosis of the region's grey values: the third and fourth central moments over the population
//                  standard deviation cubed and to the fourth, kurtosis less 3 (excess kurtosis), as ImageJ gives
//                  them; null for a region of one value
//   fitted ellipse the ellipse with the masked pixels' second moments, scaled to their area: major and minor axis
//                  (full lengths) and the angle of the major axis, 0 to 180 degrees counter-clockwise from the x axis
//   Feret          the caliper diameters of the masked pixels' squares, taken on the convex hull of their corners in
//                  real units: Feret, the longest distance between two corners, and its angle (0 to 180 degrees
//                  counter-clockwise from x, as the ellipse's); min Feret, the narrowest width over all directions
//                  (rotating calipers: one side of the hull lies on a caliper at the minimum). A 3 × 2 px box gives
//                  √13 and 2, as ImageJ's Feret on its traced outline does
// Limit to threshold: the grey statistics (mean to optical density above) are taken over the masked pixels of the
// region instead of all of its pixels, as ImageJ's option of that name does. With a density standard (density.ts),
// optical density is the mean of the fitted OD of the pixels' values instead of log10(M / v).
// Each results row keeps a copy of everything it was measured from, so that it can be measured again.
import { scaleAfterSteps, scaleOf, type Calibration, type LengthUnit, type Scale } from "./calibration";
import { maxValue, withinImage, type Raster } from "./raster";
import { convexHull, roiMask, roiPerimeter, type Roi } from "./roi";
import { applySteps, type OtherImages, type Step } from "./steps";
import { applyThreshold, thresholdProblem, type Threshold } from "./threshold";
import { densityAt, densityProblem, fitDensity, type DensityStandard, type FittedDensity } from "./density";
import { crc32 } from "./checksum";

// MARK: given values

export type MeasureKey = "area" | "areaFraction" | "mean" | "minMax" | "centroid" | "perimeter"
  | "stdDev" | "modal" | "median" | "integratedDensity" | "centreOfMass" | "opticalDensity" | "boundingRect" | "shape"
  | "skewness" | "kurtosis" | "ellipse" | "feret";
export const MEASURE_KEYS: readonly MeasureKey[] = [
  "area", "areaFraction", "mean", "minMax", "centroid", "perimeter", "stdDev", "modal", "median", "integratedDensity", "centreOfMass", "opticalDensity", "boundingRect", "shape",
  "skewness", "kurtosis", "ellipse", "feret",
];
/** The measurements on by default (IMAGE-ANALYSIS.md, Measurements). */
export const DEFAULT_MEASUREMENTS: readonly MeasureKey[] = ["area", "areaFraction", "mean"];

export interface MeasureValues {
  regionPixels: number;
  maskedPixels: number;
  area: number | null;
  areaFraction: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  centroidX: number | null;
  centroidY: number | null;
  perimeter: number | null;
  /** A line region's length; null for areas. */
  length: number | null;
  stdDev: number | null;
  modal: number | null;
  median: number | null;
  intDen: number | null;
  rawIntDen: number | null;
  massX: number | null;
  massY: number | null;
  opticalDensity: number | null;
  boundX: number | null;
  boundY: number | null;
  boundWidth: number | null;
  boundHeight: number | null;
  circularity: number | null;
  aspectRatio: number | null;
  roundness: number | null;
  solidity: number | null;
  skewness: number | null;
  kurtosis: number | null;
  major: number | null;
  minor: number | null;
  angle: number | null;
  feret: number | null;
  minFeret: number | null;
  feretAngle: number | null;
}

/** How a region is measured, besides its pixels: limit the grey statistics to the mask, and a density standard. */
export interface MeasureOptions { limitToThreshold?: boolean; density?: FittedDensity | null }

/** The value fields of a row, in the order they are saved. */
export const VALUE_KEYS: readonly (keyof MeasureValues)[] = [
  "regionPixels", "maskedPixels", "area", "areaFraction", "mean", "min", "max", "centroidX", "centroidY", "perimeter", "length",
  "stdDev", "modal", "median", "intDen", "rawIntDen", "massX", "massY", "opticalDensity", "boundX", "boundY", "boundWidth", "boundHeight", "circularity", "aspectRatio", "roundness", "solidity",
  "skewness", "kurtosis", "major", "minor", "angle", "feret", "minFeret", "feretAngle",
];

// MARK: measuring

/**
 * Measure a region of a working image. `region` is 1 for the region's pixels (null: the whole image); `mask` is the
 * threshold's mask (null: every pixel). Grey statistics need a grey image and are null otherwise.
 */
export function measureRegion(raster: Raster, region: Uint8Array | null, mask: Uint8Array | null, scale: Scale, options: MeasureOptions = {}): MeasureValues {
  const { widthPx: W, heightPx: H } = raster;
  // Pixels a Canvas step added are not the image's: they count in neither the region nor its area fraction.
  region = withinImage(raster, region);
  const grey = raster.channels === 1;
  const M = maxValue(raster.bitDepth);
  const inside = (i: number) => (!region || region[i] === 1) && (!mask || mask[i] === 1);
  let regionPixels = 0, maskedPixels = 0, sum = 0, sum2 = 0, min = Infinity, max = -Infinity, sumX = 0, sumY = 0;
  let sumXX = 0, sumYY = 0, sumXY = 0, massX = 0, massY = 0, density = 0;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  let horizontalEdges = 0, verticalEdges = 0;
  const counts = grey ? new Float64Array(M + 1) : null;
  const limit = !!options.limitToThreshold && !!mask, standard = options.density ?? null;
  let greyPixels = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (region && region[i] !== 1) continue;
      regionPixels++;
      if (grey && (!limit || mask![i] === 1)) {
        greyPixels++;
        const v = raster.data[i];
        sum += v; sum2 += v * v; counts![v]++;
        if (v < min) min = v;
        if (v > max) max = v;
        massX += v * (x + 0.5); massY += v * (y + 0.5);
        density += standard ? densityAt(standard, v) : Math.log10(M / Math.max(1, v));
      }
      if (!inside(i)) continue;
      maskedPixels++;
      sumX += x + 0.5;
      sumY += y + 0.5;
      sumXX += (x + 0.5) ** 2; sumYY += (y + 0.5) ** 2; sumXY += (x + 0.5) * (y + 0.5);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      // Each side of the pixel facing outside the masked set is part of the boundary.
      if (x === 0 || !inside(i - 1)) verticalEdges++;
      if (x === W - 1 || !inside(i + 1)) verticalEdges++;
      if (y === 0 || !inside(i - W)) horizontalEdges++;
      if (y === H - 1 || !inside(i + W)) horizontalEdges++;
    }
  }
  const pixelArea = scale.x * scale.y, area = maskedPixels * pixelArea;
  const greySums = { n: greyPixels, sum, sum2, min, max, massX, massY, density };
  const masked = maskedPixels ? { n: maskedPixels, sumX, sumY, sumXX, sumYY, sumXY, left, top, right, bottom, horizontalEdges, verticalEdges } : null;
  return {
    regionPixels, maskedPixels,
    area,
    areaFraction: regionPixels ? (maskedPixels / regionPixels) * 100 : null,
    perimeter: horizontalEdges * scale.x + verticalEdges * scale.y,
    length: null,
    ...(counts && greyPixels ? greyValues(greySums, counts, scale) : NO_GREY),
    ...(masked ? maskedValues(masked, inside, W, H, scale) : NO_MASKED),
  };
}

type GreyKey = "mean" | "min" | "max" | "stdDev" | "modal" | "median" | "intDen" | "rawIntDen" | "massX" | "massY" | "opticalDensity" | "skewness" | "kurtosis";
type MaskedKey = "centroidX" | "centroidY" | "boundX" | "boundY" | "boundWidth" | "boundHeight" | "circularity" | "aspectRatio" | "roundness" | "solidity" | "major" | "minor" | "angle" | "feret" | "minFeret" | "feretAngle";
const nulls = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((key) => [key, null])) as Record<K, null>;
const NO_GREY = nulls<GreyKey>(["mean", "min", "max", "stdDev", "modal", "median", "intDen", "rawIntDen", "massX", "massY", "opticalDensity", "skewness", "kurtosis"]);
const NO_MASKED = nulls<MaskedKey>(["centroidX", "centroidY", "boundX", "boundY", "boundWidth", "boundHeight", "circularity", "aspectRatio", "roundness", "solidity", "major", "minor", "angle", "feret", "minFeret", "feretAngle"]);

/** The grey statistics of the counted pixels (at least one), from their sums and their histogram. */
function greyValues(
  g: { n: number; sum: number; sum2: number; min: number; max: number; massX: number; massY: number; density: number }, counts: Float64Array, scale: Scale,
): Pick<MeasureValues, GreyKey> {
  const { n, sum } = g, mean = sum / n, moments = centralMoments(counts, mean, n), spread = moments.m2 > 0;
  return {
    mean, min: g.min, max: g.max,
    stdDev: n > 1 ? Math.sqrt(Math.max(0, (g.sum2 - (sum * sum) / n) / (n - 1))) : 0,
    modal: modalOf(counts),
    median: medianOf(counts, n),
    intDen: sum * scale.x * scale.y,
    rawIntDen: sum,
    massX: sum > 0 ? (g.massX / sum) * scale.x : null,
    massY: sum > 0 ? (g.massY / sum) * scale.y : null,
    opticalDensity: g.density / n,
    skewness: spread ? moments.m3 / moments.m2 ** 1.5 : null,
    kurtosis: spread ? moments.m4 / (moments.m2 * moments.m2) - 3 : null,
  };
}

/** The position and shape of the masked pixels (at least one), from their sums. */
function maskedValues(
  m: { n: number; sumX: number; sumY: number; sumXX: number; sumYY: number; sumXY: number; left: number; top: number; right: number; bottom: number; horizontalEdges: number; verticalEdges: number },
  inside: (i: number) => boolean, W: number, H: number, scale: Scale,
): Pick<MeasureValues, MaskedKey> {
  const pixelArea = scale.x * scale.y, area = m.n * pixelArea;
  const shape = shapeOf(inside, W, H, scale, area, m.horizontalEdges, m.verticalEdges, m);
  return {
    centroidX: (m.sumX / m.n) * scale.x,
    centroidY: (m.sumY / m.n) * scale.y,
    boundX: m.left * scale.x,
    boundY: m.top * scale.y,
    boundWidth: (m.right - m.left + 1) * scale.x,
    boundHeight: (m.bottom - m.top + 1) * scale.y,
    circularity: shape.circularity, aspectRatio: shape.aspectRatio, roundness: shape.roundness,
    solidity: area / (convexHullArea(inside, W, H) * pixelArea),
    major: shape.major, minor: shape.minor, angle: shape.angle,
    ...feretOf(maskHull(inside, W, H), scale),
  };
}

/** The most frequent value; the lowest on a tie. */
function modalOf(counts: Float64Array): number {
  let best = 0;
  for (let v = 1; v < counts.length; v++) if (counts[v] > counts[best]) best = v;
  return best;
}

/** The median of the counted values: the middle one, or the mean of the middle two. */
function medianOf(counts: Float64Array, n: number): number {
  const valueAt = (rank: number) => { let seen = 0; for (let v = 0; v < counts.length; v++) { seen += counts[v]; if (seen > rank) return v; } return counts.length - 1; };
  return n % 2 ? valueAt((n - 1) / 2) : (valueAt(n / 2 - 1) + valueAt(n / 2)) / 2;
}

/** The second, third and fourth central moments of the counted values (population: over n). */
function centralMoments(counts: Float64Array, mean: number, n: number): { m2: number; m3: number; m4: number } {
  let m2 = 0, m3 = 0, m4 = 0;
  for (let v = 0; v < counts.length; v++) {
    if (!counts[v]) continue;
    const d = v - mean, d2 = d * d;
    m2 += counts[v] * d2; m3 += counts[v] * d2 * d; m4 += counts[v] * d2 * d2;
  }
  return { m2: m2 / n, m3: m3 / n, m4: m4 / n };
}

/** The turns of the masked set's outline: at each grid corner, one where 1 or 3 of its 4 pixels are masked, two where 2 are, diagonally. */
export function outlineCorners(inside: (i: number) => boolean, W: number, H: number): number {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && inside(y * W + x);
  let corners = 0;
  for (let y = 0; y <= H; y++) {
    for (let x = 0; x <= W; x++) {
      const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x - 1, y), d = at(x, y);
      const k = +a + +b + +c + +d;
      if (k === 1 || k === 3) corners++;
      else if (k === 2 && a === d) corners += 2;
    }
  }
  return corners;
}

/** Circularity, aspect ratio, roundness and the fitted ellipse of the masked pixels (see the head of this file). */
function shapeOf(
  inside: (i: number) => boolean, W: number, H: number, scale: Scale, area: number, horizontalEdges: number, verticalEdges: number,
  sums: { n: number; sumX: number; sumY: number; sumXX: number; sumYY: number; sumXY: number },
): { circularity: number; aspectRatio: number; roundness: number; major: number; minor: number; angle: number } {
  const { x: sx, y: sy } = scale;
  const cut = sx + sy - Math.hypot(sx, sy);
  const traced = horizontalEdges * sx + verticalEdges * sy - outlineCorners(inside, W, H) * cut;
  const circularity = traced > 0 ? Math.min(1, (4 * Math.PI * area) / (traced * traced)) : 0;
  // Second central moments in real units; each pixel adds its own spread, 1/12 of its side squared.
  const { n } = sums, cx = sums.sumX / n, cy = sums.sumY / n;
  const uxx = (sums.sumXX / n - cx * cx + 1 / 12) * sx * sx;
  const uyy = (sums.sumYY / n - cy * cy + 1 / 12) * sy * sy;
  const uxy = (sums.sumXY / n - cx * cy) * sx * sy;
  const half = (uxx + uyy) / 2, spread = Math.sqrt(((uxx - uyy) / 2) ** 2 + uxy * uxy);
  const major = half + spread, minor = Math.max(half - spread, Number.MIN_VALUE);
  const aspectRatio = Math.sqrt(major / minor);
  // A filled ellipse of axes a and b has second moments a²/16 and b²/16 along them; scale its area, π · a · b / 4, to the area.
  const fit = Math.sqrt(area / (4 * Math.PI * Math.sqrt(major * minor)));
  // The major axis's direction, turned counter-clockwise with y up (the image's y runs down).
  let angle = (-0.5 * Math.atan2(2 * uxy, uxx - uyy) * 180) / Math.PI;
  if (angle < 0) angle += 180;
  if (angle >= 180 || spread < 1e-12 * half) angle = 0;
  return { circularity, aspectRatio, roundness: 1 / aspectRatio, major: 4 * Math.sqrt(major) * fit, minor: 4 * Math.sqrt(minor) * fit, angle };
}

/**
 * The area, in pixels, of the convex hull of the squares of the pixels where `inside` holds: only the outer corners of
 * each row's first and last pixel can be on the hull, so the hull is taken of those (Andrew's monotone chain).
 */
export function convexHullArea(inside: (i: number) => boolean, W: number, H: number): number {
  const hull = maskHull(inside, W, H);
  if (hull.length < 3) return 0;
  let twice = 0;
  for (let i = 0; i < hull.length; i++) { const [x0, y0] = hull[i], [x1, y1] = hull[(i + 1) % hull.length]; twice += x0 * y1 - x1 * y0; }
  return Math.abs(twice) / 2;
}

/** The convex hull, in pixels, of the squares of the pixels where `inside` holds (their outer corners row by row). */
function maskHull(inside: (i: number) => boolean, W: number, H: number): [number, number][] {
  const points: [number, number][] = [];
  for (let y = 0; y < H; y++) {
    let first = -1, last = -1;
    for (let x = 0; x < W; x++) if (inside(y * W + x)) { if (first < 0) first = x; last = x; }
    if (first >= 0) points.push([first, y], [first, y + 1], [last + 1, y], [last + 1, y + 1]);
  }
  return points.length < 3 ? points : convexHull(points) as [number, number][];
}

/**
 * Feret's diameter of a convex hull in pixels, scaled to real units: the longest distance between two of its corners and
 * that line's angle, and the narrowest caliper width (the least, over the hull's sides, of the farthest corner from it).
 */
export function feretOf(hull: readonly (readonly [number, number])[], scale: Pick<Scale, "x" | "y">): { feret: number; minFeret: number; feretAngle: number } {
  const points = hull.map(([x, y]) => [x * scale.x, y * scale.y] as const);
  let feret = 0, dx = 1, dy = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[j][0] - points[i][0], points[j][1] - points[i][1]);
      if (d > feret) { feret = d; dx = points[j][0] - points[i][0]; dy = points[j][1] - points[i][1]; }
    }
  }
  let minFeret = points.length < 3 ? 0 : Infinity;
  for (let i = 0; i < points.length && points.length >= 3; i++) {
    const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length], side = Math.hypot(bx - ax, by - ay);
    if (!side) continue;
    let width = 0;
    for (const [px, py] of points) width = Math.max(width, Math.abs((bx - ax) * (py - ay) - (by - ay) * (px - ax)) / side);
    minFeret = Math.min(minFeret, width);
  }
  // The angle counter-clockwise with y up (the image's y runs down), 0 to 180 degrees.
  let feretAngle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (feretAngle < 0) feretAngle += 180;
  if (feretAngle >= 180) feretAngle -= 180;
  return { feret, minFeret, feretAngle };
}

// MARK: results rows

/** What a row was measured from: enough to measure it again from the original file. */
export interface ResultRecord {
  imageId: string;
  imageName: string;
  file: string;
  /** CRC-32 of the original at measurement, so a changed file can be noticed. */
  crc32: string;
  steps: Step[];
  threshold: Threshold | null;
  /** The region, copied; null for the whole image. */
  roi: Roi | null;
  calibration: Calibration | null;
  /** The measurements chosen when it was measured; the others are not reported. */
  measured: MeasureKey[];
  /** The phase whose threshold this is (phases.ts), by name; absent for an image without phases. */
  phase?: string;
  /** Grey statistics over the masked pixels only (Limit to threshold); absent: off. */
  limitToThreshold?: boolean;
  /** The density standard in effect, copied; absent: uncalibrated optical density. */
  density?: DensityStandard;
  /** The threshold's mask when measured, CRC-32 of its bytes and its pixel count, so a re-measure can show it is the same. */
  mask?: { crc32: string; count: number };
}

export interface ResultRow extends ResultRecord { id: string; unit: LengthUnit | "px"; values: MeasureValues }

/**
 * Take one row: the record's steps, threshold, region and calibration applied to the original's working image. Steps
 * that read another image read it through `others`. `mask` is the threshold's mask's check, to keep in the record and
 * to compare with the record's own.
 */
export function measureRecord(original: Raster, record: ResultRecord, others?: OtherImages): { unit: LengthUnit | "px"; values: MeasureValues; mask?: { crc32: string; count: number } } {
  const working = applySteps(original, record.steps, others).raster;
  const scale = scaleAfterSteps(scaleOf(record.calibration), record.steps);
  if (record.roi?.type === "line") {
    const empty = measureRegion(working, new Uint8Array(working.widthPx * working.heightPx), null, scale);
    return { unit: scale.unit, values: { ...empty, ...Object.fromEntries(VALUE_KEYS.filter((key) => key !== "regionPixels" && key !== "maskedPixels").map((key) => [key, null])), length: roiPerimeter(record.roi, scale) } as MeasureValues };
  }
  const region = record.roi ? roiMask(record.roi, working) : null;
  const result = record.threshold && !thresholdProblem(record.threshold, working) ? applyThreshold(working, record.threshold) : null;
  const density = record.density && !densityProblem(record.density) ? fitDensity(record.density) : null;
  const values = measureRegion(working, region, result?.mask ?? null, scale, { limitToThreshold: record.limitToThreshold, density });
  return { unit: scale.unit, values, ...(result ? { mask: { crc32: crc32(result.mask), count: result.count } } : {}) };
}

/** A new row id unique within the table. */
export function newResultId(rows: readonly ResultRow[]): string {
  const used = new Set(rows.map((row) => row.id));
  let n = rows.length + 1;
  while (used.has(`row-${n}`)) n++;
  return `row-${n}`;
}

// MARK: CSV

/** The columns of the results table and its CSV, in order: a heading and how to read a row's value. */
/** `dimension` marks a column in the row's unit (1, a length or position) or its square (2, an area). */
export const RESULT_COLUMNS: readonly { key: string; heading: string; measure?: MeasureKey; dimension?: 1 | 2; value(row: ResultRow): number | string | null }[] = [
  { key: "image", heading: "Image", value: (row) => row.imageName },
  { key: "region", heading: "Region", value: (row) => row.roi?.name ?? "Whole image" },
  { key: "phase", heading: "Phase", value: (row) => row.phase ?? null },
  { key: "area", heading: "Area", measure: "area", dimension: 2, value: (row) => row.values.area },
  { key: "areaFraction", heading: "Area fraction (%)", measure: "areaFraction", value: (row) => row.values.areaFraction },
  { key: "mean", heading: "Mean grey", measure: "mean", value: (row) => row.values.mean },
  { key: "min", heading: "Min grey", measure: "minMax", value: (row) => row.values.min },
  { key: "max", heading: "Max grey", measure: "minMax", value: (row) => row.values.max },
  { key: "centroidX", heading: "Centroid X", measure: "centroid", dimension: 1, value: (row) => row.values.centroidX },
  { key: "centroidY", heading: "Centroid Y", measure: "centroid", dimension: 1, value: (row) => row.values.centroidY },
  { key: "perimeter", heading: "Perimeter", measure: "perimeter", dimension: 1, value: (row) => row.values.perimeter },
  { key: "stdDev", heading: "Std dev grey", measure: "stdDev", value: (row) => row.values.stdDev },
  { key: "modal", heading: "Modal grey", measure: "modal", value: (row) => row.values.modal },
  { key: "median", heading: "Median grey", measure: "median", value: (row) => row.values.median },
  { key: "intDen", heading: "Integrated density", measure: "integratedDensity", value: (row) => row.values.intDen },
  { key: "rawIntDen", heading: "Raw integrated density", measure: "integratedDensity", value: (row) => row.values.rawIntDen },
  { key: "massX", heading: "Centre of mass X", measure: "centreOfMass", dimension: 1, value: (row) => row.values.massX },
  { key: "massY", heading: "Centre of mass Y", measure: "centreOfMass", dimension: 1, value: (row) => row.values.massY },
  { key: "opticalDensity", heading: "Mean optical density", measure: "opticalDensity", value: (row) => row.values.opticalDensity },
  { key: "boundX", heading: "Bounding X", measure: "boundingRect", dimension: 1, value: (row) => row.values.boundX },
  { key: "boundY", heading: "Bounding Y", measure: "boundingRect", dimension: 1, value: (row) => row.values.boundY },
  { key: "boundWidth", heading: "Bounding width", measure: "boundingRect", dimension: 1, value: (row) => row.values.boundWidth },
  { key: "boundHeight", heading: "Bounding height", measure: "boundingRect", dimension: 1, value: (row) => row.values.boundHeight },
  { key: "circularity", heading: "Circularity", measure: "shape", value: (row) => row.values.circularity },
  { key: "aspectRatio", heading: "Aspect ratio", measure: "shape", value: (row) => row.values.aspectRatio },
  { key: "roundness", heading: "Roundness", measure: "shape", value: (row) => row.values.roundness },
  { key: "solidity", heading: "Solidity", measure: "shape", value: (row) => row.values.solidity },
  { key: "skewness", heading: "Skewness", measure: "skewness", value: (row) => row.values.skewness },
  { key: "kurtosis", heading: "Kurtosis", measure: "kurtosis", value: (row) => row.values.kurtosis },
  { key: "major", heading: "Ellipse major", measure: "ellipse", dimension: 1, value: (row) => row.values.major },
  { key: "minor", heading: "Ellipse minor", measure: "ellipse", dimension: 1, value: (row) => row.values.minor },
  { key: "angle", heading: "Ellipse angle", measure: "ellipse", value: (row) => row.values.angle },
  { key: "feret", heading: "Feret", measure: "feret", dimension: 1, value: (row) => row.values.feret },
  { key: "minFeret", heading: "Min Feret", measure: "feret", dimension: 1, value: (row) => row.values.minFeret },
  { key: "feretAngle", heading: "Feret angle", measure: "feret", value: (row) => row.values.feretAngle },
  { key: "length", heading: "Length", dimension: 1, value: (row) => row.values.length },
  { key: "unit", heading: "Unit", value: (row) => row.unit },
];

/**
 * A column's heading with its unit, as a design or analysis app labels its fields: "Area (mm²)", "Perimeter (mm)". When
 * the rows are in different units, the heading says "unit" and the Unit column names each row's.
 */
export function columnHeading(column: (typeof RESULT_COLUMNS)[number], rows: readonly ResultRow[]): string {
  if (!column.dimension) return column.heading;
  const units = new Set(rows.map((row) => row.unit));
  const unit = units.size === 1 ? [...units][0] : "unit";
  return `${column.heading} (${unit}${column.dimension === 2 ? "²" : ""})`;
}

/** A row's value in a column, or null when it was not measured or does not apply. */
export function cellValue(row: ResultRow, column: (typeof RESULT_COLUMNS)[number]): number | string | null {
  if (column.measure && !row.measured.includes(column.measure)) return null;
  return column.value(row);
}

/** RFC 4180: a field with a comma, quote or line break is quoted, and quotes inside it are doubled. */
const csvField = (value: number | string | null) => {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The results as CSV: one header row, then a row per result with its record (file, steps, threshold, calibration). */
export function resultsCsv(rows: readonly ResultRow[]): string {
  const headings = ["Row", ...RESULT_COLUMNS.map((column) => columnHeading(column, rows)), "File", "CRC-32", "Steps", "Threshold", "Mask CRC-32", "Limit to threshold", "Density standard", "Calibration"];
  const lines = rows.map((row, index) => [
    index + 1, ...RESULT_COLUMNS.map((column) => cellValue(row, column)), row.file, row.crc32,
    JSON.stringify(row.steps), row.threshold ? JSON.stringify(row.threshold) : "", row.mask?.crc32 ?? "", row.limitToThreshold ? "yes" : "no",
    row.density ? JSON.stringify(row.density) : "", row.calibration ? JSON.stringify(row.calibration) : "",
  ].map(csvField).join(","));
  return `${[headings.map(csvField).join(","), ...lines].join("\r\n")}\r\n`;
}

/**
 * A number for the Results pane: with `decimals` (0 to 9), fixed to that many places; with null, four significant
 * digits (formatMeasure). Whole numbers stay whole either way. The CSV keeps every digit.
 */
export function formatDecimals(value: number, decimals: number | null, fallback: (value: number) => string): string {
  if (decimals === null || Number.isInteger(value)) return fallback(value);
  return value.toFixed(decimals);
}
