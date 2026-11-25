// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Steps that read another image (roadmap I21 and I31): every image calculator operation on a hand-worked fixture,
// clipping, division by zero, the size, channel and depth refusals on both sides, dependency cycles, and paste into a
// selection with the inputs unchanged.
import assert from "node:assert/strict";
import test from "node:test";
import { applyCalculator, applySteps, calculatorProblem, dependencyCycle, newStep, pasteInto, stepDependencies, type CalculatorOperation, type Raster, type Step } from "../../source/engine";

const grey = (values: number[], width = values.length, bitDepth: 8 | 16 = 8): Raster => ({ widthPx: width, heightPx: values.length / width, channels: 1, bitDepth, data: Uint16Array.from(values) });
const a = grey([0, 10, 200, 255, 12, 7]), b = grey([0, 3, 100, 10, 0, 7]);

test("each calculator operation matches the hand-worked values", () => {
  const expected: Record<CalculatorOperation, number[]> = {
    add: [0, 13, 255, 255, 12, 14], subtract: [0, 7, 100, 245, 12, 0], multiply: [0, 30, 255, 255, 0, 49],
    divide: [0, 3, 2, 26, 255, 1], and: [0, 2, 64, 10, 0, 7], or: [0, 11, 236, 255, 12, 7], xor: [0, 9, 172, 245, 12, 0],
    min: [0, 3, 100, 10, 0, 7], max: [0, 10, 200, 255, 12, 7], average: [0, 7, 150, 133, 6, 7], difference: [0, 7, 100, 245, 12, 0],
  };
  for (const [operation, values] of Object.entries(expected)) assert.deepEqual([...applyCalculator(a, b, operation as CalculatorOperation).raster.data], values, operation);
});

test("clipping is counted; the inputs are not changed", () => {
  assert.equal(applyCalculator(a, b, "add").clipped, 2);
  assert.equal(applyCalculator(a, b, "multiply").clipped, 2);
  assert.equal(applyCalculator(b, a, "subtract").clipped, 4);
  assert.equal(applyCalculator(a, b, "min").clipped, 0);
  assert.deepEqual([...a.data], [0, 10, 200, 255, 12, 7]);
});

test("16-bit images clip at 65535", () => {
  const out = applyCalculator(grey([65000, 2], 2, 16), grey([1000, 3], 2, 16), "add");
  assert.deepEqual([...out.raster.data], [65535, 5]);
});

test("a size, channel or depth mismatch is refused; the same shape is not", () => {
  const shape = { widthPx: 4, heightPx: 3, channels: 1 as const, bitDepth: 8 as const };
  assert.equal(calculatorProblem(shape, shape, "B"), null);
  assert.match(calculatorProblem(shape, { ...shape, widthPx: 5 }, "B")!, /B is 5 × 3 px and this image is 4 × 3 px/);
  assert.match(calculatorProblem(shape, { ...shape, heightPx: 2 }, "B")!, /same size/);
  assert.match(calculatorProblem(shape, { ...shape, channels: 3 }, "B")!, /colour/);
  assert.match(calculatorProblem(shape, { ...shape, bitDepth: 16 }, "B")!, /16 bits/);
});

test("a calculator step reads the other image through the resolver, and is passed over with a reason without it", () => {
  const step = { ...newStep("calculator", [], { widthPx: 6, heightPx: 1, channels: 1, bitDepth: 8 }), imageId: "b", operation: "difference" } as Step;
  const run = applySteps(a, [step], (id) => (id === "b" ? { name: "B", raster: b } : "missing"));
  assert.deepEqual([...run.raster.data], [0, 7, 100, 245, 12, 0]);
  assert.deepEqual(run.problems, []);
  const wrong = applySteps(a, [step], () => ({ name: "B", raster: grey([1, 2]) }));
  assert.equal(wrong.raster, a);
  assert.match(wrong.problems[0].message, /same size/);
  assert.match(applySteps(a, [step]).problems[0].message, /not available/);
  assert.match(applySteps(a, [{ ...step, imageId: "" } as Step]).problems[0].message, /Choose the other image/);
});

test("dependencies are listed once, disabled steps left out, and cycles found", () => {
  const calc = (imageId: string, enabled = true) => ({ type: "calculator", enabled, imageId });
  assert.deepEqual(stepDependencies([calc("b"), calc("b"), calc("c", false), { type: "paste", enabled: true, imageId: "d" }]), ["b", "d"]);
  const images = [{ id: "a", steps: [calc("b")] }, { id: "b", steps: [calc("c")] }, { id: "c", steps: [] as ReturnType<typeof calc>[] }];
  assert.equal(dependencyCycle(images, "a"), false);
  assert.equal(dependencyCycle(images, "c", [calc("a")]), true);
  assert.equal(dependencyCycle(images, "a", [calc("a")]), true);
  assert.equal(dependencyCycle(images, "c", [calc("a", false)]), false);
});

test("paste into a selection replaces only the pixels inside it and under the pasted image", () => {
  const target = grey(new Array(16).fill(0), 4), pasted = grey([1, 2, 3, 4, 5, 6, 7, 8, 9], 3);
  const region = { id: "r", name: "R", type: "rectangle" as const, x: 1, y: 1, width: 2, height: 3 };
  const out = pasteInto(target, pasted, region);
  assert.deepEqual([...out.data], [0, 0, 0, 0, 0, 1, 2, 0, 0, 4, 5, 0, 0, 7, 8, 0]);
  assert.deepEqual([...target.data], new Array(16).fill(0));
  // Past the image's edge nothing is written.
  const edge = pasteInto(target, pasted, { ...region, x: 3, y: 3, width: 1, height: 1 });
  assert.deepEqual([...edge.data].map((v, i) => (v ? i : -1)).filter((i) => i >= 0), [15]);
  // Grey into colour fills the three channels; colour into grey takes the luminance.
  const colour: Raster = { widthPx: 1, heightPx: 1, channels: 3, bitDepth: 8, data: Uint16Array.from([0, 0, 0]) };
  const one = { ...region, x: 0, y: 0, width: 1, height: 1 };
  assert.deepEqual([...pasteInto(colour, grey([9]), one).data], [9, 9, 9]);
  assert.deepEqual([...pasteInto(grey([0]), { ...colour, data: Uint16Array.from([255, 0, 0]) }, one).data], [76]);
  assert.throws(() => pasteInto(target, grey([1], 1, 16), region), /16 bits/);
  assert.throws(() => pasteInto(target, pasted, { id: "l", name: "L", type: "line", points: [[0, 0], [2, 2]] }), /line/);
});
