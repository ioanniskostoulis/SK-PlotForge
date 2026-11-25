// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Binary operations on a threshold's mask (IMAGE-ANALYSIS.md, Mask operations), run in order after the range is
// applied. Objects are the mask's 1 pixels, 8-connected; the background is 4-connected, so a hole is a part of the
// background that no 4-connected path joins to the image's edge. Outside the image counts as background, so erosion
// wears objects away at the edge and dilation never grows from it.
//
// - Erode: an object pixel goes when at least `count` of its 8 neighbours are background. Dilate: a background pixel
//   joins when at least `count` of its 8 neighbours are object pixels. Count is 1 to 8, 1 by default, as ImageJ's Binary
//   Options; a higher count wears away and grows only at corners and specks. Each repeats `iterations` times.
// - Open is erode then dilate, `iterations` times each; close is dilate then erode. Open removes specks and thin
//   bridges; close fills small gaps and notches.
// - Outline keeps the object pixels with a background pixel among their 4 neighbours: a line one pixel wide.
// - Fill holes turns every hole into object pixels.
// - Skeletonize thins each object to lines one pixel wide along its middle, keeping its connections and its holes:
//   Zhang and Suen's thinning (1984), its two sub-passes repeated until nothing changes. An object the rule would wear
//   away whole (a 2 × 2 block) keeps its first pixel in reading order. ImageJ's Skeletonize thins by its own lookup
//   table, so a skeleton can differ from ImageJ's by a pixel where two thin evenly.

export type MaskOperationKind = "erode" | "dilate" | "open" | "close" | "outline" | "fill" | "skeleton";
export const MASK_OPERATION_KINDS: readonly MaskOperationKind[] = ["erode", "dilate", "open", "close", "outline", "fill", "skeleton"];
/** The operations that repeat. */
export const REPEATED_OPERATIONS: readonly MaskOperationKind[] = ["erode", "dilate", "open", "close"];
export const MAX_ITERATIONS = 100;
export const MAX_COUNT = 8;

/** An operation; `count` (erode, dilate, open, close) is 1 when absent. */
export interface MaskOperation { kind: MaskOperationKind; iterations: number; count?: number }

/** Why an operation cannot run, or null: iterations are whole numbers from 1 to 100. */
export function maskOperationProblem(operation: MaskOperation): string | null {
  if (!MASK_OPERATION_KINDS.includes(operation.kind)) return "The mask operation is not known.";
  if (!(Number.isInteger(operation.iterations) && operation.iterations >= 1 && operation.iterations <= MAX_ITERATIONS)) return `Iterations are whole numbers from 1 to ${MAX_ITERATIONS}.`;
  const count = operation.count ?? 1;
  if (!(Number.isInteger(count) && count >= 1 && count <= MAX_COUNT)) return `The count is a whole number from 1 to ${MAX_COUNT}.`;
  return null;
}

const NEIGHBOURS_8: readonly [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const NEIGHBOURS_4: readonly [number, number][] = [[0, -1], [-1, 0], [1, 0], [0, 1]];

/** One erosion, or one dilation, with a neighbour count from 1 to 8. */
function step(mask: Uint8Array, W: number, H: number, erode: boolean, count: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!!mask[i] !== erode) { out[i] = mask[i]; continue; }
      // Erode counts background neighbours (outside the image is background); dilate counts object neighbours.
      let n = 0;
      for (const [dx, dy] of NEIGHBOURS_8) {
        const nx = x + dx, ny = y + dy;
        const object = nx >= 0 && ny >= 0 && nx < W && ny < H && mask[ny * W + nx] === 1;
        if (object !== erode) n++;
      }
      out[i] = erode ? (n >= count ? 0 : 1) : (n >= count ? 1 : 0);
    }
  }
  return out;
}

export function erode(mask: Uint8Array, W: number, H: number, iterations = 1, count = 1): Uint8Array {
  let out = mask;
  for (let n = 0; n < iterations; n++) out = step(out, W, H, true, count);
  return out === mask ? mask.slice() : out;
}

export function dilate(mask: Uint8Array, W: number, H: number, iterations = 1, count = 1): Uint8Array {
  let out = mask;
  for (let n = 0; n < iterations; n++) out = step(out, W, H, false, count);
  return out === mask ? mask.slice() : out;
}

export function outline(mask: Uint8Array, W: number, H: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      for (const [dx, dy] of NEIGHBOURS_4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !mask[ny * W + nx]) { out[i] = 1; break; }
      }
    }
  }
  return out;
}

/** Fill holes: background not reached from the image's edge by 4-connected background becomes object. */
export function fillHoles(mask: Uint8Array, W: number, H: number): Uint8Array {
  const outside = new Uint8Array(mask.length);
  const stack: number[] = [];
  const seed = (i: number) => { if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop()!, x = i % W, y = (i - x) / W;
    if (x > 0) seed(i - 1);
    if (x < W - 1) seed(i + 1);
    if (y > 0) seed(i - W);
    if (y < H - 1) seed(i + W);
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

/** Skeletonize: Zhang and Suen's thinning to lines one pixel wide, never wearing an object away whole. */
export function skeletonize(mask: Uint8Array, W: number, H: number): Uint8Array {
  const out = mask.slice();
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? out[y * W + x] : 0);
  const marked = new Uint8Array(mask.length);
  for (let changed = true; changed;) {
    changed = false;
    for (const pass of [0, 1]) {
      let any = false;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          marked[i] = 0;
          if (!out[i]) continue;
          // p2 to p9 clockwise from the pixel above.
          const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const b = p.reduce((sum, v) => sum + v, 0);
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
          const [n, , e, , s, , w] = p;
          const keep = pass === 0 ? n * e * s || e * s * w : n * e * w || n * s * w;
          if (b >= 2 && b <= 6 && a === 1 && !keep) { marked[i] = 1; any = true; }
        }
      }
      if (!any) continue;
      keepWholeObjects(out, marked, W, H);
      for (let i = 0; i < out.length; i++) if (marked[i]) { out[i] = 0; changed = true; }
    }
  }
  return out;
}

/** Unmark the first pixel of each 8-connected object whose every pixel is marked, so no object vanishes. */
function keepWholeObjects(mask: Uint8Array, marked: Uint8Array, W: number, H: number): void {
  const seen = new Uint8Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start] || !marked[start]) continue;
    let whole = true;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i - x) / W;
      if (!marked[i]) whole = false;
      for (const [dx, dy] of NEIGHBOURS_8) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (whole) marked[start] = 0;
  }
}

/** One operation on a copy of the mask. */
export function applyMaskOperation(mask: Uint8Array, W: number, H: number, operation: MaskOperation): Uint8Array {
  const n = operation.iterations, k = operation.count ?? 1;
  switch (operation.kind) {
    case "erode": return erode(mask, W, H, n, k);
    case "dilate": return dilate(mask, W, H, n, k);
    case "open": return dilate(erode(mask, W, H, n, k), W, H, n, k);
    case "close": return erode(dilate(mask, W, H, n, k), W, H, n, k);
    case "outline": return outline(mask, W, H);
    case "fill": return fillHoles(mask, W, H);
    case "skeleton": return skeletonize(mask, W, H);
  }
}

/** The operations in order; one that cannot run is passed over. */
export function applyMaskOperations(mask: Uint8Array, W: number, H: number, operations: readonly MaskOperation[]): Uint8Array {
  let out = mask;
  for (const operation of operations) if (!maskOperationProblem(operation)) out = applyMaskOperation(out, W, H, operation);
  return out;
}
