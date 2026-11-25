// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Filters on hand-worked images: the circular neighbourhood of the rank filters, smoothing, the median against a
// speck, minimum and maximum, variance, the Gaussian's weights and its sum, unsharp mask and sharpen on flat images,
// Sobel edges, a convolve kernel applied as written, colour per channel, the limits, and filter steps in documents.
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFilter, applySteps, circleOffsets, FILTER_DEFAULTS, filterProblem, gaussianKernel, newStep, parseStep, stepRecord,
  type FilterKind, type Raster, type Step,
} from "../../source/engine";

const grey = (width: number, values: number[], bitDepth: 8 | 16 = 8): Raster => ({ widthPx: width, heightPx: values.length / width, channels: 1, bitDepth, data: Uint16Array.from(values) });
const run = (raster: Raster, kind: FilterKind, options: Partial<typeof FILTER_DEFAULTS> = {}) => [...applyFilter(raster, kind, { ...FILTER_DEFAULTS, ...options }).data];
const flat = (width: number, height: number, value: number, bitDepth: 8 | 16 = 8) => grey(width, Array(width * height).fill(value), bitDepth);
/** A width × height image of 0 with `value` at (x, y). */
const speck = (width: number, height: number, x: number, y: number, value: number, bitDepth: 8 | 16 = 8) => {
  const values = Array(width * height).fill(0);
  values[y * width + x] = value;
  return grey(width, values, bitDepth);
};

test("the rank filters' neighbourhood is ImageJ's circle: 5, 9 and 21 pixels for radius 0.5, 1 and 2", () => {
  assert.equal(circleOffsets(0.5).length, 5);
  assert.equal(circleOffsets(1).length, 9);
  assert.equal(circleOffsets(2).length, 21);
  assert.equal(circleOffsets(3).length, 37);
});

test("smooth is the 3 × 3 mean, edge pixels repeating", () => {
  const out = run(speck(3, 3, 1, 1, 90), "smooth");
  assert.deepEqual(out, Array(9).fill(10));
  // A corner repeats itself: its neighbourhood holds itself four times.
  assert.equal(run(speck(3, 3, 0, 0, 90), "smooth")[0], 40);
});

test("the median removes a speck; the mean spreads it", () => {
  assert.deepEqual(run(speck(5, 5, 2, 2, 255), "median", { radius: 1 }), Array(25).fill(0));
  assert.equal(run(speck(5, 5, 2, 2, 90), "mean", { radius: 1 })[12], 10);
});

test("maximum grows a light pixel by the neighbourhood; minimum takes it away", () => {
  const out = run(speck(5, 5, 2, 2, 200), "max", { radius: 1 });
  assert.equal(out.filter((v) => v === 200).length, 9);
  assert.deepEqual(run(speck(5, 5, 2, 2, 200), "min", { radius: 1 }), Array(25).fill(0));
  // Radius 0.5 is the plus shape: 5 pixels.
  assert.equal(run(speck(5, 5, 2, 2, 200), "max", { radius: 0.5 }).filter((v) => v === 200).length, 5);
});

test("variance is the population variance of the neighbourhood", () => {
  // At the speck, radius 0.5: values 10, 0, 0, 0, 0; mean 2; variance 100 / 5 − 4 = 16.
  assert.equal(run(speck(5, 5, 2, 2, 10), "variance", { radius: 0.5 })[12], 16);
  assert.deepEqual(run(flat(4, 4, 77), "variance", { radius: 2 }), Array(16).fill(0));
});

test("the Gaussian's weights are normalised, cut at 4 sigma, and spread a speck by them", () => {
  const weights = gaussianKernel(1);
  assert.equal(weights.length, 9);
  assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  // The centre of a speck of 10000 keeps 10000 · w0², w0 = 1 / Σ exp(−i² / 2) for i from −4 to 4.
  let sum = 0;
  for (let i = -4; i <= 4; i++) sum += Math.exp(-(i * i) / 2);
  const out = run(speck(21, 21, 10, 10, 10000, 16), "gaussian", { radius: 1 });
  assert.equal(out[10 * 21 + 10], Math.round(10000 / (sum * sum)));
  // The total stays within rounding of the speck.
  assert.ok(Math.abs(out.reduce((a, b) => a + b, 0) - 10000) <= 81);
  assert.deepEqual(run(flat(6, 6, 123), "gaussian", { radius: 2.5 }), Array(36).fill(123));
});

test("unsharp mask and sharpen leave a flat image as it is, and sharpen raises a speck", () => {
  assert.deepEqual(run(flat(5, 5, 100), "unsharp", { radius: 1, weight: 0.6 }), Array(25).fill(100));
  assert.deepEqual(run(flat(5, 5, 100), "sharpen"), Array(25).fill(100));
  // Sharpen at a speck of 40: 12 · 40 / 4 = 120; beside it, −40 / 4 clipped to 0.
  const out = run(speck(5, 5, 2, 2, 40), "sharpen");
  assert.equal(out[12], 120);
  assert.equal(out[11], 0);
});

test("find edges is the magnitude of the Sobel gradients", () => {
  // Columns 0, 0, 10, 10 on 16 bits: gx = 4 · 10 next to the step, 0 away from it.
  const step = grey(4, [0, 0, 10, 10, 0, 0, 10, 10, 0, 0, 10, 10], 16);
  assert.deepEqual(run(step, "edges").slice(4, 8), [0, 40, 40, 0]);
});

test("convolve applies its kernel as written, not mirrored, and normalises by the sum", () => {
  const image = grey(3, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(run(image, "convolve"), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // The weight left of centre takes the pixel on the left: the image moves one pixel right.
  assert.deepEqual(run(image, "convolve", { kernel: [0, 0, 0, 1, 0, 0, 0, 0, 0] }), [1, 1, 2, 4, 4, 5, 7, 7, 8]);
  // Weights summing to 2, normalised and not.
  assert.deepEqual(run(image, "convolve", { kernel: [0, 0, 0, 0, 2, 0, 0, 0, 0] }), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(run(image, "convolve", { kernel: [0, 0, 0, 0, 2, 0, 0, 0, 0], normalize: false }), [2, 4, 6, 8, 10, 12, 14, 16, 18]);
});

test("colour images are filtered per channel, and the input is never changed", () => {
  const rgb: Raster = { widthPx: 3, heightPx: 1, channels: 3, bitDepth: 8, data: Uint16Array.from([0, 30, 90, 0, 30, 90, 0, 30, 90]) };
  const before = [...rgb.data];
  assert.deepEqual([...applyFilter(rgb, "smooth").data], before);
  assert.deepEqual([...rgb.data], before);
});

test("the limits: radius from 0.5, sigma above 0, weight from 0.1 to 0.9, odd square kernels", () => {
  const ok = (kind: FilterKind, options: Partial<typeof FILTER_DEFAULTS>) => filterProblem(kind, { ...FILTER_DEFAULTS, ...options }) === null;
  assert.ok(ok("median", { radius: 0.5 })); assert.ok(!ok("median", { radius: 0.4 }));
  assert.ok(ok("gaussian", { radius: 0.1 })); assert.ok(!ok("gaussian", { radius: 0 }));
  assert.ok(ok("unsharp", { weight: 0.9 })); assert.ok(!ok("unsharp", { weight: 0.95 })); assert.ok(!ok("unsharp", { weight: 0.05 }));
  assert.ok(ok("convolve", { kernel: Array(25).fill(1) })); assert.ok(!ok("convolve", { kernel: Array(4).fill(1) })); assert.ok(!ok("convolve", { kernel: Array(8).fill(1) }));
});

test("a filter step runs in the list, is passed over when its options cannot run, and is saved with only what it reads", () => {
  const shape = { widthPx: 5, heightPx: 5, channels: 1, bitDepth: 8 } as const;
  const step = { ...newStep("filter", [], shape), filter: "median", radius: 1 } as Step;
  assert.deepEqual([...applySteps(speck(5, 5, 2, 2, 255), [step]).raster.data], Array(25).fill(0));
  const bad = { ...step, radius: 0.2 } as Step;
  const { problems } = applySteps(speck(5, 5, 2, 2, 255), [bad]);
  assert.equal(problems.length, 1);
  assert.deepEqual(stepRecord(step), { id: step.id, type: "filter", enabled: true, filter: "median", radius: 1 });
  assert.deepEqual(parseStep(stepRecord(step)), step);
  const convolve = { ...step, filter: "convolve", kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], normalize: false } as Step;
  // Options the filter does not read are not saved, and open as their defaults.
  assert.deepEqual(parseStep(stepRecord(convolve)), { ...convolve, radius: FILTER_DEFAULTS.radius });
  assert.throws(() => parseStep({ ...stepRecord(step), filter: "blur" }), /invalid filter/);
  assert.throws(() => parseStep({ ...stepRecord(convolve), kernel: [1, "a"] }), /invalid kernel/);
});

// MARK: despeckle and outliers (roadmap I19)

test("despeckle is the 3 × 3 median: a single speck goes, a flat image stays", () => {
  assert.deepEqual(run(speck(5, 5, 2, 2, 200), "despeckle"), Array(25).fill(0));
  assert.deepEqual(run(flat(4, 4, 33), "despeckle"), Array(16).fill(33));
});

test("removing outliers replaces values beyond the threshold from the median, on one side only", () => {
  // A bright speck of 10 over 0: 10 above its median of 0.
  assert.deepEqual(run(speck(5, 5, 2, 2, 10), "bright-outliers", { radius: 1, threshold: 5 }), Array(25).fill(0));
  assert.equal(run(speck(5, 5, 2, 2, 10), "bright-outliers", { radius: 1, threshold: 10 })[12], 10); // not more than 10
  assert.equal(run(speck(5, 5, 2, 2, 10), "dark-outliers", { radius: 1, threshold: 5 })[12], 10); // bright, so kept
  // A dark pixel of 0 in 50: 50 below its median.
  const pit = grey(5, Array.from({ length: 25 }, (_, i) => (i === 12 ? 0 : 50)));
  assert.deepEqual(run(pit, "dark-outliers", { radius: 1, threshold: 20 }), Array(25).fill(50));
  assert.equal(run(pit, "bright-outliers", { radius: 1, threshold: 20 })[12], 0);
  assert.ok(filterProblem("bright-outliers", { ...FILTER_DEFAULTS, threshold: -1 }));
  assert.equal(filterProblem("dark-outliers", { ...FILTER_DEFAULTS, threshold: 0 }), null);
});

test("an outlier step saves its radius and threshold; despeckle saves neither", () => {
  const shape = { widthPx: 5, heightPx: 5, channels: 1, bitDepth: 8 } as const;
  const step = { ...newStep("filter", [], shape), filter: "bright-outliers", radius: 1, threshold: 12 } as Step;
  assert.deepEqual(stepRecord(step), { id: step.id, type: "filter", enabled: true, filter: "bright-outliers", radius: 1, threshold: 12 });
  assert.deepEqual(parseStep(stepRecord(step)), step);
  const despeckle = { ...step, filter: "despeckle", radius: FILTER_DEFAULTS.radius, threshold: FILTER_DEFAULTS.threshold } as Step;
  assert.deepEqual(stepRecord(despeckle), { id: step.id, type: "filter", enabled: true, filter: "despeckle" });
  assert.deepEqual(parseStep(stepRecord(despeckle)), despeckle);
});
