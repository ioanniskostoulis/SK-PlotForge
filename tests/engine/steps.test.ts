// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The step list: each step against values worked by hand, both sides of every boundary, replay to the same pixels,
// a disabled step equal to its absence, shapes without pixels, and the input never changed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import {
  applySteps, clampCrop, decodeImage, emptyProject, newProjectImage, describeImage, newStep, parseProject, serializeProject, shapeOf, stepProblem, parseStep, stepRecord,
  traceShapes, type Raster, type Shape, type Step,
} from "../../source/engine";

const inflate = async (data: Uint8Array) => new Uint8Array(inflateSync(data));
const grey8 = (w: number, h: number, values: number[]): Raster => ({ widthPx: w, heightPx: h, channels: 1, bitDepth: 8, data: Uint16Array.from(values) });
const grey16 = (w: number, h: number, values: number[]): Raster => ({ widthPx: w, heightPx: h, channels: 1, bitDepth: 16, data: Uint16Array.from(values) });
const rgb8 = (w: number, h: number, values: number[]): Raster => ({ widthPx: w, heightPx: h, channels: 3, bitDepth: 8, data: Uint16Array.from(values) });
const run = (raster: Raster, ...steps: Step[]) => applySteps(raster, steps).raster;
const values = (raster: Raster) => [...raster.data];
/** A step of a type with the given parameters, for an image of this shape. */
function step<T extends Step["type"]>(type: T, shape: Shape, change: Partial<Extract<Step, { type: T }>> = {}, id = `s-${type}`): Step {
  return { ...newStep(type, [], shape), ...change, id } as Step;
}

// 3 × 2, values 0 to 5, so every pixel can be followed:  0 1 2
//                                                        3 4 5
const small = grey8(3, 2, [0, 1, 2, 3, 4, 5]);

// MARK: grey

test("convert to grey: luminance by Rec. 601, a channel, or the mean", () => {
  const image = rgb8(2, 1, [255, 0, 0, 10, 20, 31]);
  // 0.299 · 255 = 76.245 → 76; 0.299 · 10 + 0.587 · 20 + 0.114 · 31 = 18.264 → 18.
  assert.deepEqual(values(run(image, step("grey", image))), [76, 18]);
  assert.deepEqual(values(run(image, step("grey", image, { method: "green" }))), [0, 20]);
  assert.deepEqual(values(run(image, step("grey", image, { method: "blue" }))), [0, 31]);
  // (10 + 20 + 31) / 3 = 20.33 → 20; (255 + 0 + 0) / 3 = 85.
  assert.deepEqual(values(run(image, step("grey", image, { method: "mean" }))), [85, 20]);
  // White stays white at both depths: the weights add up to 1.
  assert.deepEqual(values(run(rgb8(1, 1, [255, 255, 255]), step("grey", image))), [255]);
  const white16: Raster = { widthPx: 1, heightPx: 1, channels: 3, bitDepth: 16, data: Uint16Array.from([65535, 65535, 65535]) };
  assert.deepEqual(values(run(white16, step("grey", white16))), [65535]);
  // A grey image is already grey.
  assert.equal(run(small, step("grey", small)), small);
});

// MARK: 8-bit

test("convert to 8-bit: min-max of the image, or a fixed range with clipping", () => {
  const image = grey16(4, 1, [1000, 2000, 3000, 5000]);
  // Min-max: (v − 1000) · 255 / 4000: 0, 63.75 → 64, 127.5 → 128, 255.
  assert.deepEqual(values(run(image, step("8-bit", image))), [0, 64, 128, 255]);
  // Range 2000 to 3000: below and at the low end 0, at and above the high end 255, halfway 127.5 → 128.
  const ranged = run(grey16(5, 1, [1999, 2000, 2500, 3000, 3001]), step("8-bit", image, { mapping: "range", low: 2000, high: 3000 }));
  assert.deepEqual(values(ranged), [0, 0, 128, 255, 255]);
  assert.equal(ranged.bitDepth, 8);
  // One value only: no range to stretch, so 0.
  assert.deepEqual(values(run(grey16(2, 1, [7, 7]), step("8-bit", image))), [0, 0]);
  // An 8-bit image is left as it is.
  assert.equal(run(small, step("8-bit", small)), small);
});

test("a fixed range needs low below high, within the image's values", () => {
  const shape = shapeOf(grey16(1, 1, [0]));
  assert.equal(stepProblem(step("8-bit", shape, { mapping: "range", low: 0, high: 1 }), shape), null);
  assert.match(stepProblem(step("8-bit", shape, { mapping: "range", low: 1, high: 1 }), shape)!, /low value below the high value/);
  assert.equal(stepProblem(step("8-bit", shape, { mapping: "range", low: 0, high: 65535 }), shape), null);
  assert.match(stepProblem(step("8-bit", shape, { mapping: "range", low: 0, high: 65536 }), shape)!, /from 0 to 65535/);
});

// MARK: crop

test("crop keeps the rectangle, cut to the image", () => {
  assert.deepEqual(values(run(small, step("crop", small, { x: 1, y: 0, width: 2, height: 2 }))), [1, 2, 4, 5]);
  assert.deepEqual(values(run(small, step("crop", small, { x: 2, y: 1, width: 5, height: 5 }))), [5]);
  assert.deepEqual(values(run(small, step("crop", small, { x: -1, y: -1, width: 2, height: 2 }))), [0]);
  const whole = run(small, step("crop", small));
  assert.deepEqual([whole.widthPx, whole.heightPx, ...values(whole)], [3, 2, 0, 1, 2, 3, 4, 5]);
});

test("a crop at the edge keeps one pixel; one pixel further is outside and the step is passed over", () => {
  const shape = shapeOf(small);
  assert.deepEqual(clampCrop({ x: 2, y: 1, width: 1, height: 1 }, shape), { x: 2, y: 1, width: 1, height: 1 });
  assert.equal(clampCrop({ x: 3, y: 0, width: 1, height: 1 }, shape), null);
  assert.equal(clampCrop({ x: 0, y: 2, width: 1, height: 1 }, shape), null);
  assert.deepEqual(clampCrop({ x: -1, y: 0, width: 2, height: 1 }, shape), { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(clampCrop({ x: -1, y: 0, width: 1, height: 1 }, shape), null);
  const outside = step("crop", shape, { x: 3, y: 0, width: 1, height: 1 });
  const result = applySteps(small, [outside]);
  assert.equal(result.raster, small);
  assert.deepEqual(result.problems, [{ id: outside.id, message: "The crop lies outside the image, which is 3 × 2 px." }]);
  assert.match(stepProblem(step("crop", shape, { width: 0 }), shape)!, /empty/);
});

// MARK: rotate and flip

test("rotate by quarter turns clockwise", () => {
  // 0 1 2      3 0       5 4 3      2 5
  // 3 4 5  →   4 1   or  2 1 0  or  1 4
  //            5 2                  0 3
  const once = run(small, step("rotate", small));
  assert.deepEqual([once.widthPx, once.heightPx, ...values(once)], [2, 3, 3, 0, 4, 1, 5, 2]);
  assert.deepEqual(values(run(small, step("rotate", small, { quarterTurns: 2 }))), [5, 4, 3, 2, 1, 0]);
  const thrice = run(small, step("rotate", small, { quarterTurns: 3 }));
  assert.deepEqual([thrice.widthPx, thrice.heightPx, ...values(thrice)], [2, 3, 2, 5, 1, 4, 0, 3]);
  // Four quarter turns, in two steps of two, come back to the start; so does a quarter turn and three.
  assert.deepEqual(values(run(small, step("rotate", small, { quarterTurns: 2 }, "a"), step("rotate", small, { quarterTurns: 2 }, "b"))), values(small));
  assert.deepEqual(values(run(small, step("rotate", small, {}, "a"), step("rotate", small, { quarterTurns: 3 }, "b"))), values(small));
});

test("flip mirrors across the vertical or horizontal middle, and twice is no change", () => {
  assert.deepEqual(values(run(small, step("flip", small))), [2, 1, 0, 5, 4, 3]);
  assert.deepEqual(values(run(small, step("flip", small, { axis: "vertical" }))), [3, 4, 5, 0, 1, 2]);
  assert.deepEqual(values(run(small, step("flip", small, {}, "a"), step("flip", small, {}, "b"))), values(small));
  // RGB pixels move whole.
  assert.deepEqual(values(run(rgb8(2, 1, [1, 2, 3, 4, 5, 6]), step("flip", small))), [4, 5, 6, 1, 2, 3]);
});

// MARK: levels and invert

test("levels: the black point and below become 0, the white point and above the maximum", () => {
  const image = grey8(6, 1, [49, 50, 51, 150, 199, 200]);
  // t = (v − 50) / 150; v' = round(255 t): 51 → 1.7 → 2, 150 → 170.
  assert.deepEqual(values(run(image, step("levels", image, { black: 50, white: 200 }))), [0, 0, 2, 170, 253, 255]);
  // Gamma 2 brightens: t = 64 / 255 = 0.251, t^(1/2) = 0.501, 255 · 0.501 = 127.75 → 128.
  assert.deepEqual(values(run(grey8(1, 1, [64]), step("levels", image, { black: 0, white: 255, gamma: 2 }))), [128]);
  const quarter = grey16(1, 1, [16384]);
  assert.deepEqual(values(run(quarter, step("levels", quarter, { black: 0, white: 65535, gamma: 2 }))), [Math.round(65535 * Math.sqrt(16384 / 65535))]);
  // Default levels (0, maximum, gamma 1) change nothing.
  assert.deepEqual(values(run(image, step("levels", image))), values(image));
});

test("levels needs black below white, within the image's values, and a gamma above 0", () => {
  const shape = shapeOf(small);
  assert.equal(stepProblem(step("levels", shape, { black: 254, white: 255 }), shape), null);
  assert.match(stepProblem(step("levels", shape, { black: 255, white: 255 }), shape)!, /black point below the white point/);
  assert.match(stepProblem(step("levels", shape, { black: 0, white: 256 }), shape)!, /from 0 to 255/);
  assert.match(stepProblem(step("levels", shape, { black: -1, white: 255 }), shape)!, /from 0 to 255/);
  assert.match(stepProblem(step("levels", shape, { gamma: 0 }), shape)!, /gamma above 0/);
  assert.equal(stepProblem(step("levels", shape, { gamma: 0.01 }), shape), null);
});

test("invert subtracts each value from the maximum of its depth", () => {
  assert.deepEqual(values(run(small, step("invert", small))), [255, 254, 253, 252, 251, 250]);
  assert.deepEqual(values(run(grey16(2, 1, [0, 65535]), step("invert", small))), [65535, 0]);
});

// MARK: the list

const shape = shapeOf(small);
const list = (): Step[] => [step("crop", shape, { x: 1, width: 2 }, "a"), step("rotate", shape, {}, "b"), step("invert", shape, {}, "c")];

test("steps run in order, and their order matters", () => {
  // Crop to 1 2 / 4 5, rotate to 4 1 / 5 2, invert.
  assert.deepEqual(values(applySteps(small, list()).raster), [251, 254, 250, 253]);
  const [crop, rotate, invert] = list();
  // Rotated first (3 0 / 4 1 / 5 2), the same crop (x 1, width 2, height 2) takes column 1 of the top two rows: 0 1.
  const other = applySteps(small, [rotate, crop, invert]).raster;
  assert.deepEqual([other.widthPx, other.heightPx, ...values(other)], [1, 2, 255, 254]);
});

test("disabling a step gives the result without it", () => {
  for (let i = 0; i < 3; i++) {
    const steps = list();
    steps[i].enabled = false;
    const without = list().filter((_, j) => j !== i);
    assert.deepEqual(values(applySteps(small, steps).raster), values(applySteps(small, without).raster), `step ${i + 1} disabled`);
  }
  const off = list().map((item) => ({ ...item, enabled: false }));
  assert.equal(applySteps(small, off).raster, small);
});

test("steps replay to the same pixels, also after the document is saved and opened", async () => {
  const bytes = new Uint8Array(readFileSync("tests/fixtures/png-rgb16-4x3.png"));
  const { raster } = await decodeImage(bytes, { inflate });
  const project = emptyProject();
  const image = newProjectImage(project, "/lab/a.png", "a.png", describeImage(bytes).source, 0, 0);
  const s = shapeOf(raster);
  for (const type of ["grey", "levels", "crop", "rotate", "flip", "8-bit", "invert"] as const) image.steps.push(newStep(type, image.steps, traceShapes(s, image.steps).at(-1)!));
  Object.assign(image.steps[1], { black: 5000, white: 60000, gamma: 1.4 });
  Object.assign(image.steps[2], { x: 1, y: 1, width: 3, height: 2 });
  project.images.push(image);
  const first = applySteps(raster, image.steps).raster;
  const again = applySteps(raster, image.steps).raster;
  assert.deepEqual(values(again), values(first));
  const reopened = parseProject(serializeProject(project, "/lab/a.pfg"), "/lab/a.pfg").images[0];
  const replayed = applySteps((await decodeImage(bytes, { inflate })).raster, reopened.steps).raster;
  assert.deepEqual([replayed.widthPx, replayed.heightPx, replayed.channels, replayed.bitDepth], [2, 3, 1, 8]);
  assert.deepEqual(values(replayed), values(first));
});

test("the input image is never changed by any step", () => {
  const image = rgb8(3, 2, [...Array(18).keys()]);
  const copy = values(image);
  const s = shapeOf(image);
  for (const type of ["grey", "8-bit", "crop", "rotate", "flip", "levels", "invert"] as const) run(image, step(type, s, type === "crop" ? { width: 2 } : {}));
  assert.deepEqual(values(image), copy);
});

test("the shape of each stage is known without pixels, and matches the pixels", () => {
  const image = rgb8(5, 3, Array(45).fill(9));
  const steps: Step[] = [step("crop", shapeOf(image), { x: 1, width: 3 }, "a"), step("rotate", shapeOf(image), {}, "b"), step("grey", shapeOf(image), {}, "c")];
  const shapes = traceShapes(shapeOf(image), steps);
  assert.deepEqual(shapes.map((item) => [item.widthPx, item.heightPx, item.channels]), [[5, 3, 3], [3, 3, 3], [3, 3, 3], [3, 3, 1]]);
  const result = applySteps(image, steps).raster;
  assert.deepEqual(shapeOf(result), shapes.at(-1));
  // A disabled step, and one that cannot run, leave the shape as it was.
  steps[1].enabled = false;
  assert.deepEqual(traceShapes(shapeOf(image), steps)[2], shapes[1]);
});

test("a fill step sets a region's pixels, or everything outside it, in every channel; a line cannot be filled", () => {
  const rgb: Raster = { widthPx: 3, heightPx: 2, channels: 3, bitDepth: 8, data: Uint16Array.from({ length: 18 }, () => 100) };
  const region = { id: "r", name: "Rectangle 1", type: "rectangle" as const, x: 0, y: 0, width: 1, height: 2 };
  const inside = { ...newStep("fill", [], shapeOf(rgb)), region, value: 7, outside: false } as Step;
  const filled = applySteps(rgb, [inside]).raster;
  assert.deepEqual([...filled.data.slice(0, 6)], [7, 7, 7, 100, 100, 100]);
  const cleared = applySteps(rgb, [{ ...inside, outside: true, value: 255 } as Step]).raster;
  assert.deepEqual([...cleared.data.slice(0, 6)], [100, 100, 100, 255, 255, 255]);
  assert.deepEqual([...rgb.data.slice(0, 3)], [100, 100, 100]);
  assert.deepEqual(parseStep(stepRecord(inside)), inside);
  const line = { ...inside, region: { id: "l", name: "Line 1", type: "line" as const, points: [[0, 0], [2, 1]] as [number, number][] } } as Step;
  assert.equal(applySteps(rgb, [line]).problems.length, 1);
  assert.equal(applySteps(rgb, [{ ...inside, value: 256 } as Step]).problems.length, 1);
});

// MARK: canvas size and translate (roadmap I25)

test("canvas: the image placed at x, y on a canvas of the background value; what falls outside is cut", () => {
  const image = grey8(3, 2, [0, 1, 2, 3, 4, 5]);
  const shape = shapeOf(image);
  // Larger, image at 1, 1, background 9.
  assert.deepEqual(values(run(image, step("canvas", shape, { width: 5, height: 3, x: 1, y: 1, value: 9 }))), [
    9, 9, 9, 9, 9,
    9, 0, 1, 2, 9,
    9, 3, 4, 5, 9,
  ]);
  // Translate: the same size, moved right by 1 and up by 1.
  assert.deepEqual(values(run(image, step("canvas", shape, { x: 1, y: -1 }))), [0, 3, 4, 0, 0, 0]);
  // Smaller: a crop from the top-left.
  assert.deepEqual(values(run(image, step("canvas", shape, { width: 2, height: 1 }))), [0, 1]);
  // Moved off the canvas entirely: only background.
  assert.deepEqual(values(run(image, step("canvas", shape, { x: 3, value: 7 }))), Array(6).fill(7));
  // Colour keeps its channels; the background is in every channel.
  assert.deepEqual(values(run(rgb8(1, 1, [10, 20, 30]), step("canvas", { widthPx: 1, heightPx: 1, channels: 3, bitDepth: 8 }, { width: 2, value: 5 }))), [10, 20, 30, 5, 5, 5]);
});

test("canvas: the limits, its shape and its record", () => {
  const shape: Shape = { widthPx: 3, heightPx: 2, channels: 1, bitDepth: 8 };
  assert.equal(stepProblem(step("canvas", shape), shape), null);
  assert.ok(stepProblem(step("canvas", shape, { width: 0 }), shape));
  assert.ok(stepProblem(step("canvas", shape, { x: 0.5 }), shape));
  assert.ok(stepProblem(step("canvas", shape, { value: 256 }), shape));
  assert.equal(stepProblem(step("canvas", shape, { value: 255, x: -4 }), shape), null);
  assert.deepEqual(traceShapes(shape, [step("canvas", shape, { width: 7, height: 9 })]).at(-1), { ...shape, widthPx: 7, heightPx: 9 });
  const canvas = step("canvas", shape, { width: 4, height: 5, x: -1, y: 2, value: 3 });
  assert.deepEqual(stepRecord(canvas), { id: canvas.id, type: "canvas", enabled: true, width: 4, height: 5, x: -1, y: 2, value: 3 });
  assert.deepEqual(parseStep(stepRecord(canvas)), canvas);
  assert.throws(() => parseStep({ ...stepRecord(canvas), width: "4" }), /invalid width/);
});

test("a mask step keeps its count when it is not 1, and refuses one outside 1 to 8", () => {
  const shape: Shape = { widthPx: 3, heightPx: 2, channels: 1, bitDepth: 8 };
  const mask = step("mask", shape, { operation: "dilate", iterations: 2, count: 5 });
  assert.deepEqual(stepRecord(mask), { id: mask.id, type: "mask", enabled: true, operation: "dilate", iterations: 2, count: 5 });
  assert.deepEqual(parseStep(stepRecord(mask)), mask);
  assert.deepEqual(stepRecord({ ...mask, count: 1 } as Step), { id: mask.id, type: "mask", enabled: true, operation: "dilate", iterations: 2 });
  assert.throws(() => parseStep({ ...stepRecord(mask), count: 9 }), /invalid count/);
});
