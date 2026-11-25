// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Mask operations on hand-drawn masks: erode and dilate with the image's edge as background, open and close,
// iterations, outline, fill holes with 4-connected background, the threshold that runs them, and saving them.
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMaskOperation, applyThreshold, dilate, erode, fillHoles, maskOperationProblem, outline, parseThreshold, skeletonize, thresholdRecord, type MaskOperation, type Raster,
} from "../../source/engine";

/** A mask from rows of `#` (object) and `.` (background). */
const draw = (rows: string) => { const lines = rows.trim().split(/\s+/); return { W: lines[0].length, H: lines.length, mask: Uint8Array.from(lines.join("").split("").map((c) => (c === "#" ? 1 : 0))) }; };
const show = (mask: Uint8Array, W: number) => Array.from({ length: mask.length / W }, (_, y) => [...mask.slice(y * W, y * W + W)].map((v) => (v ? "#" : ".")).join("")).join(" ");

test("erode keeps a pixel only when all 8 neighbours are objects; the edge counts as background", () => {
  const { W, H, mask } = draw(`
    .....
    .###.
    .###.
    .###.
    .....`);
  assert.equal(show(erode(mask, W, H), W), "..... ..... ..#.. ..... .....");
  const full = draw("### ### ###");
  assert.equal(show(erode(full.mask, 3, 3), 3), "... .#. ...");
});

test("dilate adds every pixel with an object among its 8 neighbours, and repeats", () => {
  const { W, H, mask } = draw(".... .... ..#. .... ....".replace(/ /g, "\n"));
  assert.equal(show(dilate(mask, W, H), W), ".... .### .### .### ....");
  assert.equal(show(dilate(mask, W, H, 2), W), "#### #### #### #### ####");
});

test("open removes a speck and keeps a block; close fills a one-pixel gap", () => {
  const block = draw(`
    #......
    .......
    ..###..
    ..###..
    ..###..
    .......`);
  assert.equal(show(applyMaskOperation(block.mask, block.W, block.H, { kind: "open", iterations: 1 }), block.W), "....... ....... ..###.. ..###.. ..###.. .......");
  const gap = draw(`
    .......
    .##.##.
    .##.##.
    .......`);
  assert.equal(show(applyMaskOperation(gap.mask, gap.W, gap.H, { kind: "close", iterations: 1 }), gap.W), "....... .#####. .#####. .......");
});

test("outline keeps object pixels with background among their 4 neighbours", () => {
  const { W, H, mask } = draw(`
    .....
    .###.
    .###.
    .###.
    .....`);
  assert.equal(show(outline(mask, W, H), W), "..... .###. .#.#. .###. .....");
  // At the image's edge, outside is background, so the edge pixels stay.
  assert.equal(show(outline(draw("### ### ###").mask, 3, 3), 3), "### #.# ###");
});

test("fill holes fills background closed off from the edge, and a diagonal gap closes a hole for 4-connected background", () => {
  const ring = draw(`
    .....
    .###.
    .#.#.
    .###.
    .....`);
  assert.equal(show(fillHoles(ring.mask, ring.W, ring.H), ring.W), "..... .###. .###. .###. .....");
  // Open to the edge: not a hole.
  const cup = draw(`
    .....
    .#.#.
    .#.#.
    .###.
    .....`);
  assert.equal(show(fillHoles(cup.mask, cup.W, cup.H), cup.W), show(cup.mask, cup.W));
  // Corners touching diagonally still close the hole: background only passes through edges.
  const diamond = draw(`
    ..#..
    .#.#.
    ..#..`);
  assert.equal(show(fillHoles(diamond.mask, diamond.W, diamond.H), diamond.W), "..#.. .###. ..#..");
});

test("iterations are whole numbers from 1 to 100", () => {
  const ok = (operation: MaskOperation) => maskOperationProblem(operation) === null;
  assert.ok(ok({ kind: "erode", iterations: 1 })); assert.ok(ok({ kind: "erode", iterations: 100 }));
  assert.ok(!ok({ kind: "erode", iterations: 0 })); assert.ok(!ok({ kind: "erode", iterations: 101 })); assert.ok(!ok({ kind: "erode", iterations: 1.5 }));
});

test("a threshold runs its operations in order, counts the result, and saves them; none are saved when there are none", () => {
  const raster: Raster = { widthPx: 5, heightPx: 5, channels: 1, bitDepth: 8, data: Uint16Array.from([
    0, 0, 0, 0, 200,
    0, 200, 200, 200, 0,
    0, 200, 0, 200, 0,
    0, 200, 200, 200, 0,
    0, 0, 0, 0, 0,
  ]) };
  const plain = applyThreshold(raster, { mode: "manual", low: 100, high: 255 });
  assert.equal(plain.count, 9);
  const filled = applyThreshold(raster, { mode: "manual", low: 100, high: 255, operations: [{ kind: "fill", iterations: 1 }] });
  assert.equal(filled.count, 10);
  const opened = applyThreshold(raster, { mode: "manual", low: 100, high: 255, operations: [{ kind: "fill", iterations: 1 }, { kind: "open", iterations: 1 }] });
  assert.equal(show(opened.mask, 5), "..... .###. .###. .###. .....");
  const threshold = { mode: "otsu" as const, objects: "light" as const, operations: [{ kind: "erode" as const, iterations: 2 }] };
  assert.deepEqual(parseThreshold(thresholdRecord(threshold)), threshold);
  assert.deepEqual(thresholdRecord({ mode: "otsu", objects: "light", operations: [] }), { mode: "otsu", objects: "light" });
  assert.throws(() => parseThreshold({ mode: "otsu", objects: "light", operations: [{ kind: "watershed" }] }), /invalid mask operation/);
});

// MARK: the neighbour count (roadmap I16)

test("erode and dilate with a count: only pixels with at least that many differing neighbours change", () => {
  const { W, H, mask } = draw(`
    .....
    .###.
    .###.
    .###.
    .....`);
  // Count 4: the square's corners have 5 background neighbours and go; its edge middles have 3 and stay.
  assert.equal(show(erode(mask, W, H, 1, 4), W), "..... ..#.. .###. ..#.. .....");
  // Count 3: only the background pixels beside an edge's middle touch 3 object pixels.
  assert.equal(show(dilate(mask, W, H, 1, 3), W), "..#.. .###. ##### .###. ..#..");
  // Count 1 is the plain operation.
  assert.deepEqual(erode(mask, W, H, 1, 1), erode(mask, W, H));
  assert.deepEqual(applyMaskOperation(mask, W, H, { kind: "erode", iterations: 1, count: 4 }), erode(mask, W, H, 1, 4));
});

test("the count is 1 to 8, saved only when it is not 1", () => {
  assert.equal(maskOperationProblem({ kind: "erode", iterations: 1, count: 8 }), null);
  assert.ok(maskOperationProblem({ kind: "erode", iterations: 1, count: 9 }));
  assert.ok(maskOperationProblem({ kind: "dilate", iterations: 1, count: 0 }));
  const threshold = { mode: "otsu" as const, objects: "light" as const, operations: [{ kind: "close" as const, iterations: 2, count: 3 }, { kind: "erode" as const, iterations: 1 }] };
  assert.deepEqual(thresholdRecord(threshold).operations, [{ kind: "close", iterations: 2, count: 3 }, { kind: "erode", iterations: 1 }]);
  assert.deepEqual(parseThreshold(thresholdRecord(threshold)), threshold);
  assert.throws(() => parseThreshold({ mode: "otsu", objects: "light", operations: [{ kind: "erode", iterations: 1, count: 12 }] }), /invalid mask operation/);
});

// MARK: skeletonize (roadmap I16)

/** The 8-connected objects of a mask, and whether any 2 × 2 block is whole (a line more than one pixel wide). */
const objects = (mask: Uint8Array, W: number, H: number) => {
  const seen = new Uint8Array(mask.length);
  let count = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    count++;
    const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
  }
  return count;
};
const thick = (mask: Uint8Array, W: number, H: number) => {
  for (let y = 0; y + 1 < H; y++) for (let x = 0; x + 1 < W; x++) if (mask[y * W + x] && mask[y * W + x + 1] && mask[(y + 1) * W + x] && mask[(y + 1) * W + x + 1]) return true;
  return false;
};

test("skeletonize thins a bar to its middle line, one pixel wide", () => {
  const { W, H, mask } = draw(`
    ...........
    .#########.
    .#########.
    .#########.
    ...........`);
  const out = skeletonize(mask, W, H);
  assert.equal(show(out, W).split(" ").filter((row) => row.includes("#")).length, 1, show(out, W));
  assert.match(show(out, W).split(" ")[2], /^\.\.#####+\.\.?\.?$|^\.#+\.$/);
  assert.equal(objects(out, W, H), 1);
});

test("skeletonize keeps connections, holes and lone objects, and changes a line not at all", () => {
  // A ring two pixels thick keeps its hole: filling the skeleton's holes adds pixels.
  const ring = draw(`
    ........
    .######.
    .######.
    .##..##.
    .##..##.
    .######.
    .######.
    ........`);
  const thin = skeletonize(ring.mask, ring.W, ring.H);
  assert.equal(objects(thin, ring.W, ring.H), 1);
  assert.ok(!thick(thin, ring.W, ring.H), show(thin, ring.W));
  assert.ok(fillHoles(thin, ring.W, ring.H).reduce((a, b) => a + b, 0) > thin.reduce((a, b) => a + b, 0), "the hole is kept");
  // Two blocks stay two objects; a 2 × 2 block, which the rule would wear away whole, keeps a pixel.
  const two = draw("##..### ##..### ....###");
  const kept = skeletonize(two.mask, two.W, two.H);
  assert.equal(objects(kept, two.W, two.H), 2);
  assert.equal(show(skeletonize(draw("## ##").mask, 2, 2), 2), "#. ..");
  // A one-pixel line and a lone pixel are already skeletons.
  const line = draw("#..... .#.... ..####");
  assert.equal(show(skeletonize(line.mask, line.W, line.H), line.W), show(line.mask, line.W));
  assert.equal(show(applyMaskOperation(draw(".#.").mask, 3, 1, { kind: "skeleton", iterations: 1 }), 3), ".#.");
});
