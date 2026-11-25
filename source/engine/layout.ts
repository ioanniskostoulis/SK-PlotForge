// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Placing objects on the work surface: snapping to the dot grid, finding the object under the pointer, and the space
// a new image takes. Coordinates are content pixels; the view's zoom and pan are applied by the shell's Viewport.

export interface Box { x: number; y: number; width: number; height: number }
/** A box that may be turned: `angle` in degrees clockwise about its centre (an image's placement); absent or 0 is upright. */
export type TurnedBox = Box & { angle?: number };

/** Degrees as radians. */
export const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** A point turned by `degrees` clockwise (on screen, y down) about a centre. */
export function turnPoint(x: number, y: number, cx: number, cy: number, degrees: number): [number, number] {
  if (!degrees) return [x, y];
  const a = radians(degrees), cos = Math.cos(a), sin = Math.sin(a), dx = x - cx, dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/** A work-surface point in a turned box's own upright frame: turned back about the box's centre. */
export function unturn(box: TurnedBox, x: number, y: number): [number, number] {
  return turnPoint(x, y, box.x + box.width / 2, box.y + box.height / 2, -(box.angle ?? 0));
}

/**
 * After a turned box's upright box changed (`before` to `box`, a content point at the same upright place in both), move
 * the box so that this content stays where it was on the surface: a turned box turns about its centre, and its centre
 * moved. An upright box is left as it is.
 */
export function keepTurnedPlace(box: TurnedBox, before: Box): void {
  if (!box.angle) return;
  const dx = box.x + box.width / 2 - (before.x + before.width / 2), dy = box.y + box.height / 2 - (before.y + before.height / 2);
  const [tx, ty] = turnPoint(dx, dy, 0, 0, box.angle);
  box.x += tx - dx;
  box.y += ty - dy;
}

/** The upright box around a turned box: the box itself when it is upright. */
export function turnedBounds(box: TurnedBox): Box {
  if (!box.angle) return { x: box.x, y: box.y, width: box.width, height: box.height };
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]].map(([x, y]) => turnPoint(x, y, cx, cy, box.angle!));
  const xs = corners.map(([x]) => x), ys = corners.map(([, y]) => y);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

/** The gap left between a new image and the images already placed, in grid steps. */
export const PLACEMENT_GAP_STEPS = 2;

/** The nearest grid point to a coordinate. */
export function snapValue(value: number, spacing: number): number {
  return Math.round(value / spacing) * spacing;
}

/** Does the box contain the point? The left and top edges belong to it, the right and bottom ones to its neighbour. A turned box is asked in its own frame. */
export function contains(box: TurnedBox, x: number, y: number): boolean {
  if (box.angle) [x, y] = unturn(box, x, y);
  return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
}

/** The topmost object under a point (the last one drawn), or null. */
export function objectAt<T extends TurnedBox>(objects: readonly T[], x: number, y: number): T | null {
  for (let index = objects.length - 1; index >= 0; index--) if (contains(objects[index], x, y)) return objects[index];
  return null;
}

/** The box around all the objects, or null when there are none. */
export function boundsOf(boxes: readonly TurnedBox[]): Box | null {
  if (!boxes.length) return null;
  const objects = boxes.map(turnedBounds);
  const left = Math.min(...objects.map((o) => o.x)), top = Math.min(...objects.map((o) => o.y));
  const right = Math.max(...objects.map((o) => o.x + o.width)), bottom = Math.max(...objects.map((o) => o.y + o.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Where a new object goes: at the origin on an empty surface, otherwise to the right of everything, on the grid. */
export function placeNew(objects: readonly TurnedBox[], spacing: number): { x: number; y: number } {
  const bounds = boundsOf(objects);
  if (!bounds) return { x: 0, y: 0 };
  return { x: Math.ceil((bounds.x + bounds.width) / spacing) * spacing + PLACEMENT_GAP_STEPS * spacing, y: snapValue(bounds.y, spacing) };
}
