// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The pixels a Canvas step adds around the image are a transparent canvas, as in a design app: they hold the step's
// background value for export, and histograms, thresholds, measurements and XY export pass over them.
import assert from "node:assert/strict";
import test from "node:test";
import {
  applySteps, applyThreshold, columnHeading, histogram, imagePixels, measureRegion, phaseCoverage, RESULT_COLUMNS, xyCoordinatesCsv, xyProblem,
  type Raster, type ResultRow, type Step,
} from "../../source/engine";

const grey = (width: number, values: number[]): Raster => ({ widthPx: width, heightPx: values.length / width, channels: 1, bitDepth: 8, data: Uint16Array.from(values) });
const base = { enabled: true };
const canvasStep = (width: number, height: number, x: number, y: number, value = 0): Step => ({ ...base, id: "c", type: "canvas", width, height, x, y, value });
const px = { x: 1, y: 1, unit: "px" as const };

// A 2 × 2 image of 200s placed at (1, 0) on a 4 × 2 canvas of 0: columns 0 and 3 are outside.
const placed = () => applySteps(grey(2, [200, 200, 200, 200]), [canvasStep(4, 2, 1, 0)]).raster;

test("a Canvas step marks the pixels it adds as outside, and keeps its value in them", () => {
  const out = placed();
  assert.deepEqual([...out.data], [0, 200, 200, 0, 0, 200, 200, 0]);
  assert.deepEqual([...out.outside!], [1, 0, 0, 1, 1, 0, 0, 1]);
  assert.equal(imagePixels(out), 4);
  // A canvas that only cuts adds nothing outside.
  assert.equal(applySteps(grey(2, [1, 2, 3, 4]), [canvasStep(1, 1, 0, 0)]).raster.outside, undefined);
});

test("crop, rotate and flip move the outside pixels with the image; other steps keep them", () => {
  const steps: Step[] = [canvasStep(4, 2, 1, 0), { ...base, id: "f", type: "flip", axis: "horizontal" }];
  assert.deepEqual([...applySteps(grey(2, [1, 2, 3, 4]), [canvasStep(3, 2, 1, 0), steps[1]]).raster.outside!], [0, 0, 1, 0, 0, 1]);
  const rotated = applySteps(grey(2, [1, 2, 3, 4]), [canvasStep(3, 2, 1, 0), { ...base, id: "r", type: "rotate", quarterTurns: 1 }]).raster;
  assert.equal(rotated.widthPx, 2);
  assert.equal(rotated.outside!.reduce((a, b) => a + b, 0), 2);
  const cropped = applySteps(grey(2, [1, 2, 3, 4]), [canvasStep(4, 2, 1, 0), { ...base, id: "k", type: "crop", x: 1, y: 0, width: 2, height: 2 }]).raster;
  assert.equal(cropped.outside, undefined, "a crop to the image leaves nothing outside");
  const inverted = applySteps(grey(2, [1, 2, 3, 4]), [canvasStep(4, 2, 1, 0), { ...base, id: "i", type: "invert" }]).raster;
  assert.deepEqual([...inverted.outside!], [1, 0, 0, 1, 1, 0, 0, 1]);
});

test("histograms, automatic thresholds and masks leave the outside pixels out", () => {
  const out = placed();
  assert.equal(histogram(out)[0], 0);
  assert.equal(histogram(out)[200], 4);
  // A range that takes 0 still masks no outside pixel, and a dilate does not grow into them.
  const range = applyThreshold(out, { mode: "manual", low: 0, high: 255 });
  assert.deepEqual([...range.mask], [0, 1, 1, 0, 0, 1, 1, 0]);
  assert.equal(range.count, 4);
  const dilated = applyThreshold(out, { mode: "manual", low: 200, high: 255, operations: [{ kind: "dilate", iterations: 2 }] });
  assert.equal(dilated.count, 4);
  assert.deepEqual(phaseCoverage([dilated.mask], 8, out.outside), { overlap: 0, unassigned: 0 });
});

test("measurements count only the image's pixels in the region and its area fraction", () => {
  const out = placed();
  const values = measureRegion(out, null, applyThreshold(out, { mode: "manual", low: 200, high: 255 }).mask, px);
  assert.equal(values.regionPixels, 4);
  assert.equal(values.areaFraction, 100);
  assert.equal(values.mean, 200);
});

test("XY export writes the image's pixels only", () => {
  const out = placed();
  assert.equal(xyCoordinatesCsv(out, null).pixels, 4);
  assert.equal(xyProblem(out, Uint8Array.from([1, 0, 0, 0, 1, 0, 0, 0])), "The region covers no pixel centre.");
});

test("result headings carry the unit, squared for areas, or 'unit' when the rows differ", () => {
  const column = (key: string) => RESULT_COLUMNS.find((item) => item.key === key)!;
  const row = (unit: ResultRow["unit"]) => ({ unit }) as ResultRow;
  assert.equal(columnHeading(column("area"), [row("mm")]), "Area (mm²)");
  assert.equal(columnHeading(column("perimeter"), [row("mm"), row("mm")]), "Perimeter (mm)");
  assert.equal(columnHeading(column("area"), [row("mm"), row("px")]), "Area (unit²)");
  assert.equal(columnHeading(column("mean"), [row("mm")]), "Mean grey");
  assert.equal(columnHeading(column("angle"), [row("mm")]), "Ellipse angle");
});

test("mask operations treat the canvas around the image as background, even when its value is in the range", () => {
  // A 3 × 3 image placed at (1, 1) on a 5 × 5 canvas: an erode works as it does on the image alone, which keeps its centre.
  const alone = applyThreshold(grey(3, Array(9).fill(200)), { mode: "manual", low: 200, high: 255, operations: [{ kind: "erode", iterations: 1, count: 1 }] });
  assert.equal(alone.count, 1);
  const onCanvas = applySteps(grey(3, Array(9).fill(200)), [canvasStep(5, 5, 1, 1, 200)]).raster;
  assert.equal(applyThreshold(onCanvas, { mode: "manual", low: 200, high: 255, operations: [{ kind: "erode", iterations: 1, count: 1 }] }).count, 1);
  // A canvas in the range does not dilate into the image.
  const dark = applySteps(grey(3, Array(9).fill(0)), [canvasStep(5, 5, 1, 1, 200)]).raster;
  assert.equal(applyThreshold(dark, { mode: "manual", low: 200, high: 255, operations: [{ kind: "dilate", iterations: 1, count: 1 }] }).count, 0);
});

test("Translate (a canvas of the image's own size) marks only the uncovered edge as outside", () => {
  const moved = applySteps(grey(3, [1, 2, 3, 4, 5, 6]), [canvasStep(3, 2, 1, 0, 9)]).raster;
  assert.deepEqual([...moved.data], [9, 1, 2, 9, 4, 5]);
  assert.deepEqual([...moved.outside!], [1, 0, 0, 1, 0, 0]);
  assert.equal(imagePixels(moved), 4);
  assert.equal(histogram(moved)[9], 0);
});
