// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The crop box of a drag on an image: the two corners of the drag, in pixels of the image the crop receives, rounded to
// whole pixels and kept inside it. A box smaller than one pixel in either direction is no crop. Crop to region takes
// a region's bounding box, and regions move with the crop so they stay over the same pixels.
import { isBox, roiBounds, type Roi } from "./roi";

export interface CropBox { x: number; y: number; width: number; height: number }

/** The crop box of a drag from `a` to `b`, in an image `widthPx` by `heightPx`; null when the box has no whole pixel. */
export function cropFromDrag(a: readonly [number, number], b: readonly [number, number], widthPx: number, heightPx: number): CropBox | null {
  const clamp = (value: number, max: number) => Math.min(max, Math.max(0, Math.round(value)));
  const x0 = clamp(Math.min(a[0], b[0]), widthPx), x1 = clamp(Math.max(a[0], b[0]), widthPx);
  const y0 = clamp(Math.min(a[1], b[1]), heightPx), y1 = clamp(Math.max(a[1], b[1]), heightPx);
  const width = x1 - x0, height = y1 - y0;
  return width >= 1 && height >= 1 ? { x: x0, y: y0, width, height } : null;
}

/**
 * The crop box of a region: its bounding rectangle widened to whole pixels (every pixel the outline touches is kept)
 * and cut to the image; null when nothing of it is inside. A line keeps the pixels along it, at least one wide.
 */
export function cropFromRoi(roi: Roi, widthPx: number, heightPx: number): CropBox | null {
  const bounds = roiBounds(roi);
  const x0 = Math.max(0, Math.floor(bounds.x)), y0 = Math.max(0, Math.floor(bounds.y));
  const x1 = Math.min(widthPx, Math.max(Math.ceil(bounds.x + bounds.width), Math.floor(bounds.x) + 1));
  const y1 = Math.min(heightPx, Math.max(Math.ceil(bounds.y + bounds.height), Math.floor(bounds.y) + 1));
  return x1 - x0 >= 1 && y1 - y0 >= 1 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

/** A region moved by (dx, dy) pixels, as regions are after a crop that starts at (−dx, −dy). */
export function moveRoi(roi: Roi, dx: number, dy: number): Roi {
  if (isBox(roi)) return { ...roi, x: roi.x + dx, y: roi.y + dy };
  return { ...roi, points: roi.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
}

// MARK: handles (roadmap I9)

/**
 * A box dragged with the shell's box editor (`attachBoxEdit`), in whole pixels of the image the crop receives: each edge
 * rounded, inside the image, and at least one pixel each way. The result is the box the same numbers typed into the
 * Crop step give.
 */
export function wholeCropBox(box: CropBox, widthPx: number, heightPx: number): CropBox {
  const x0 = Math.min(widthPx - 1, Math.max(0, Math.round(box.x))), y0 = Math.min(heightPx - 1, Math.max(0, Math.round(box.y)));
  const x1 = Math.max(x0 + 1, Math.min(widthPx, Math.round(box.x + box.width))), y1 = Math.max(y0 + 1, Math.min(heightPx, Math.round(box.y + box.height)));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
