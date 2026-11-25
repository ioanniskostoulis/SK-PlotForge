// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Regions of interest (roadmap I4): rectangles, ellipses, polygons, freehand outlines and lines, drawn on an image and
// stored with it. Coordinates are pixels of the result of the image's steps, from its top-left corner, and may be
// fractional. A region has an exact geometric area, and a mask: the pixels whose centres lie inside it, which is what
// measurements (I6) count. Calibration changes reported areas and lengths, never the mask.
import { areaOf, lengthOf, type Scale } from "./calibration";
import type { Shape } from "./steps";

// MARK: given values

export type RoiType = "rectangle" | "ellipse" | "polygon" | "freehand" | "line";
export const ROI_TYPES: readonly RoiType[] = ["rectangle", "ellipse", "polygon", "freehand", "line"];
export type Point = [x: number, y: number];

interface RoiBase { id: string; name: string }
/** A rectangle, or the ellipse inscribed in it: the box's top-left corner and size. */
export type BoxRoi = RoiBase & { type: "rectangle" | "ellipse"; x: number; y: number; width: number; height: number };
/** A closed outline (polygon, freehand) or a line of two points. */
export type PointsRoi = RoiBase & { type: "polygon" | "freehand" | "line"; points: Point[] };
export type Roi = BoxRoi | PointsRoi;

/** A rectangle or an ellipse, given by its box. */
export const isBox = (roi: Roi): roi is BoxRoi => roi.type === "rectangle" || roi.type === "ellipse";

/** Freehand points closer than this to the previous one, in image pixels, are left out while drawing. */
export const FREEHAND_STEP_PX = 1;

// MARK: new regions

/** A name for a new region of a type: `Rectangle 1`, the smallest number not yet used for that type. */
export function newRoiName(type: RoiType, rois: readonly Roi[]): string {
  const base = type[0].toUpperCase() + type.slice(1);
  const used = new Set(rois.map((roi) => roi.name));
  let n = 1;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** A new id unique within `rois`. */
export function newRoiId(rois: readonly Roi[]): string {
  const used = new Set(rois.map((roi) => roi.id));
  let n = rois.length + 1;
  while (used.has(`roi-${n}`)) n++;
  return `roi-${n}`;
}

/** The box from two corners dragged in any direction. */
export function boxFrom(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) };
}

/**
 * The convex hull of points (Andrew's monotone chain), counter-clockwise on screen from the leftmost point, without
 * repeated or collinear points; fewer than three distinct points give those points.
 */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted.map((p) => [p[0], p[1]]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const chain: Point[] = [];
    for (const p of list) { while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) chain.pop(); chain.push(p); }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())].map((p) => [p[0], p[1]]);
}

/** The convex hull of a polygon or freehand region, as a new polygon's points; null for any other region. */
export function hullOf(roi: Roi): Point[] | null {
  if (roi.type !== "polygon" && roi.type !== "freehand") return null;
  return convexHull(roi.points);
}

/** Why a region cannot be kept, or null: a box needs a size, an outline three distinct points, a line two. */
export function roiProblem(roi: Roi): string | null {
  const finite = (...values: number[]) => values.every(Number.isFinite);
  if (isBox(roi)) {
    if (!finite(roi.x, roi.y, roi.width, roi.height)) return "The region has an invalid position or size.";
    if (!(roi.width > 0 && roi.height > 0)) return "The region needs a width and a height above 0.";
    return null;
  }
  if (!roi.points.every((point) => point.length === 2 && finite(point[0], point[1]))) return "The region has an invalid point.";
  const distinct = new Set(roi.points.map(([x, y]) => `${x} ${y}`)).size;
  if (roi.type === "line") return roi.points.length === 2 && distinct === 2 ? null : "A line needs two different points.";
  if (distinct < 3) return "An outline needs at least three different points.";
  if (polygonArea(roi.points) === 0) return "The outline encloses no area.";
  return null;
}

// MARK: geometry

/** The shoelace formula: half the absolute sum of x_i · y_{i+1} − x_{i+1} · y_i around the closed outline. */
export function polygonArea(points: readonly Point[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
    twice += x0 * y1 - x1 * y0;
  }
  return Math.abs(twice) / 2;
}

/** The exact area enclosed, in px² (a line encloses none): w · h, π · (w/2) · (h/2), or the shoelace area. */
export function roiAreaPx(roi: Roi): number {
  if (isBox(roi)) return roi.type === "rectangle" ? roi.width * roi.height : Math.PI * (roi.width / 2) * (roi.height / 2);
  return roi.type === "line" ? 0 : polygonArea(roi.points);
}

/** The exact area in calibrated units squared (px² without a calibration). */
export const roiArea = (roi: Roi, scale: Scale): number => areaOf(roiAreaPx(roi), scale);

/**
 * The boundary length in calibrated units, or the length of a line. An ellipse uses Ramanujan's second
 * approximation, π (a + b) (1 + 3h / (10 + √(4 − 3h))), h = ((a − b) / (a + b))², which is exact for a circle, within
 * 5 · 10⁻¹⁰ relative at an axis ratio of 2 and 1.2 · 10⁻⁵ at 10 (against the numerical integral); a and b are the semi-axes in calibrated units, so a non-square pixel is allowed for.
 */
export function roiPerimeter(roi: Roi, scale: Scale): number {
  if (isBox(roi) && roi.type === "rectangle") return 2 * (roi.width * scale.x + roi.height * scale.y);
  if (isBox(roi)) {
    const a = (roi.width / 2) * scale.x, b = (roi.height / 2) * scale.y;
    const h = ((a - b) / (a + b)) ** 2;
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  }
  const closed = roi.type !== "line";
  let total = 0;
  const n = roi.points.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [x0, y0] = roi.points[i], [x1, y1] = roi.points[(i + 1) % n];
    total += lengthOf(x1 - x0, y1 - y0, scale);
  }
  return total;
}

/** Is the point inside the region? Boxes are half-open, [x, x + w) × [y, y + h); outlines use the even-odd rule. */
export function roiContains(roi: Roi, px: number, py: number): boolean {
  if (isBox(roi)) {
    if (roi.type === "rectangle") return px >= roi.x && px < roi.x + roi.width && py >= roi.y && py < roi.y + roi.height;
    const a = roi.width / 2, b = roi.height / 2;
    return ((px - roi.x - a) / a) ** 2 + ((py - roi.y - b) / b) ** 2 <= 1;
  }
  if (roi.type === "line") return false;
  let inside = false;
  const points = roi.points;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The distance from a point to the segment a–b. */
export function segmentDistance(px: number, py: number, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}

/**
 * Does a click at (px, py) take the region: within `tolerance` of its outline (a line, a box's edges, an ellipse's
 * curve, an outline's closed edges)? The inside does not take it, so that the picture under a region stays reachable.
 */
export function roiHit(roi: Roi, px: number, py: number, tolerance: number): boolean {
  return roiEdgeDistance(roi, px, py) <= tolerance;
}

/** The distance from a point to the region's outline, in its pixels. */
export function roiEdgeDistance(roi: Roi, px: number, py: number): number {
  let points: Point[];
  let closed = true;
  if (isBox(roi)) {
    const { x, y, width: w, height: h } = roi;
    if (roi.type === "rectangle") points = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    else {
      // The curve as a fine polygon: a segment for about every pixel of its length, at least 64.
      const a = w / 2, b = h / 2, n = Math.max(64, Math.ceil(Math.PI * (a + b)));
      points = Array.from({ length: n }, (_, i) => [x + a + a * Math.cos((2 * Math.PI * i) / n), y + b + b * Math.sin((2 * Math.PI * i) / n)] as Point);
    }
  } else {
    points = roi.points;
    closed = roi.type !== "line";
  }
  let best = Infinity;
  for (let i = 0; i < (closed ? points.length : points.length - 1); i++) best = Math.min(best, segmentDistance(px, py, points[i], points[(i + 1) % points.length]));
  return best;
}

/** The region's bounding box. */
export function roiBounds(roi: Roi): { x: number; y: number; width: number; height: number } {
  if (isBox(roi)) return { x: roi.x, y: roi.y, width: roi.width, height: roi.height };
  const xs = roi.points.map(([x]) => x), ys = roi.points.map(([, y]) => y);
  return boxFrom([Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]);
}

// MARK: the mask

/**
 * The region's pixels: 1 where the centre of pixel (x, y), at (x + 0.5, y + 0.5), lies inside, for an image of
 * `shape`. Parts outside the image are left out. A line has no mask (null).
 */
export function roiMask(roi: Roi, shape: Pick<Shape, "widthPx" | "heightPx">): Uint8Array | null {
  if (roi.type === "line") return null;
  const { widthPx: W, heightPx: H } = shape;
  const mask = new Uint8Array(W * H);
  const box = roiBounds(roi);
  const x0 = Math.max(0, Math.floor(box.x)), x1 = Math.min(W, Math.ceil(box.x + box.width));
  const y0 = Math.max(0, Math.floor(box.y)), y1 = Math.min(H, Math.ceil(box.y + box.height));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (roiContains(roi, x + 0.5, y + 0.5)) mask[y * W + x] = 1;
  return mask;
}

/** The number of pixels in a mask. */
export const maskCount = (mask: Uint8Array): number => mask.reduce((sum, value) => sum + value, 0);

// MARK: reading and writing

export class RoiError extends Error {}

/** A region from a document, checked; anything else is refused with a sentence. */
export function parseRoi(raw: unknown): Roi {
  const data = raw as Record<string, unknown>;
  if (!data || typeof data !== "object") throw new RoiError("The document has an invalid region.");
  const { id, name, type } = data as { id: unknown; name: unknown; type: RoiType };
  if (typeof id !== "string" || !id) throw new RoiError("The document has a region without an id.");
  if (typeof name !== "string" || !name) throw new RoiError("The document has a region without a name.");
  if (!ROI_TYPES.includes(type)) throw new RoiError(`The document has a region of an unknown type (${String(type)}).`);
  const roi = (type === "rectangle" || type === "ellipse")
    ? { id, name, type, x: data.x, y: data.y, width: data.width, height: data.height } as BoxRoi
    : { id, name, type, points: Array.isArray(data.points) ? data.points.map((point) => (Array.isArray(point) ? [point[0], point[1]] : [NaN, NaN])) : [] } as PointsRoi;
  const problem = roiProblem(roi);
  if (problem) throw new RoiError(`The region ${name} is not valid. ${problem}`);
  return roi;
}

/** A region with its fields in a fixed order, so that writing a document twice gives the same bytes. */
export function roiRecord(roi: Roi): Record<string, unknown> {
  if (isBox(roi)) return { id: roi.id, name: roi.name, type: roi.type, x: roi.x, y: roi.y, width: roi.width, height: roi.height };
  return { id: roi.id, name: roi.name, type: roi.type, points: roi.points.map(([x, y]) => [x, y]) };
}
