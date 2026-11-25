// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The crop box of a drag: corners in either order, rounding to whole pixels, clamping to the image, and no box
// when the drag has no whole pixel in one direction.
import assert from "node:assert/strict";
import test from "node:test";
import { applyStep, applySteps, cropFromDrag, cropFromRoi, maskCount, moveRoi, newStep, roiMask, wholeCropBox, type Raster, type Roi, type Step } from "../../source/engine";

test("a drag gives the box between its corners, whichever way it was drawn", () => {
  assert.deepEqual(cropFromDrag([10, 20], [50, 60], 100, 100), { x: 10, y: 20, width: 40, height: 40 });
  assert.deepEqual(cropFromDrag([50, 60], [10, 20], 100, 100), { x: 10, y: 20, width: 40, height: 40 });
});

test("corners round to whole pixels, half a pixel rounding up", () => {
  assert.deepEqual(cropFromDrag([10.4, 20.6], [50.5, 60.4], 100, 100), { x: 10, y: 21, width: 41, height: 39 });
});

test("a box outside the image is clamped to its edges", () => {
  assert.deepEqual(cropFromDrag([-20, -5], [30, 40], 100, 80), { x: 0, y: 0, width: 30, height: 40 });
  assert.deepEqual(cropFromDrag([90, 70], [150, 200], 100, 80), { x: 90, y: 70, width: 10, height: 10 });
});

test("a box with no whole pixel in one direction is no crop, on both sides of one pixel", () => {
  assert.equal(cropFromDrag([10, 10], [10, 50], 100, 100), null);
  assert.equal(cropFromDrag([10, 10], [10.4, 50], 100, 100), null);
  assert.deepEqual(cropFromDrag([10, 10], [10.6, 50], 100, 100), { x: 10, y: 10, width: 1, height: 40 });
  assert.equal(cropFromDrag([120, 10], [150, 50], 100, 100), null);
});

// MARK: crop to region

const image: Raster = { widthPx: 20, heightPx: 10, channels: 1, bitDepth: 8, data: Uint16Array.from({ length: 200 }, (_, i) => i % 251) };

test("crop to region keeps the region's bounding box widened to whole pixels, cut to the image", () => {
  assert.deepEqual(cropFromRoi({ id: "r", name: "R", type: "rectangle", x: 2.5, y: 1.2, width: 4, height: 3 }, 20, 10), { x: 2, y: 1, width: 5, height: 4 });
  assert.deepEqual(cropFromRoi({ id: "p", name: "P", type: "polygon", points: [[15, 5], [25, 8], [18, 12]] }, 20, 10), { x: 15, y: 5, width: 5, height: 5 });
  // A horizontal line keeps one row; a region outside the image is no crop.
  assert.deepEqual(cropFromRoi({ id: "l", name: "L", type: "line", points: [[3, 4], [9, 4]] }, 20, 10), { x: 3, y: 4, width: 6, height: 1 });
  assert.equal(cropFromRoi({ id: "o", name: "O", type: "rectangle", x: 30, y: 2, width: 4, height: 4 }, 20, 10), null);
});

test("after crop to region, the moved region covers the same pixels with the same values", () => {
  const roi: Roi = { id: "e", name: "E", type: "ellipse", x: 3.3, y: 1.6, width: 9.1, height: 6.2 };
  const box = cropFromRoi(roi, 20, 10)!;
  const step = { ...newStep("crop", [], { widthPx: 20, heightPx: 10, channels: 1, bitDepth: 8 }), ...box } as Step;
  const cropped = applySteps(image, [step]).raster;
  const moved = moveRoi(roi, -box.x, -box.y);
  const before = roiMask(roi, image)!, after = roiMask(moved, cropped)!;
  assert.equal(maskCount(after), maskCount(before));
  const values = (raster: Raster, mask: Uint8Array) => [...raster.data].filter((_, i) => mask[i]);
  assert.deepEqual(values(cropped, after), values(image, before));
});

// MARK: handles (roadmap I9)

test("a box dragged with the shell's editor gives the box the typed numbers give", () => {
  assert.deepEqual(wholeCropBox({ x: 9.6, y: 20.4, width: 30.2, height: 39.7 }, 100, 100), { x: 10, y: 20, width: 30, height: 40 });
  // The dragged box run as a Crop step gives the same pixels as the step typed with those numbers.
  const raster = { widthPx: 100, heightPx: 100, channels: 1 as const, bitDepth: 8 as const, data: Uint16Array.from({ length: 10000 }, (_, i) => i % 251) };
  const dragged = wholeCropBox({ x: 8.2, y: 16.6, width: 31.9, height: 43.3 }, 100, 100);
  const typed = { ...newStep("crop", [], raster), x: 8, y: 17, width: 32, height: 43 } as Step;
  assert.deepEqual(applyStep(raster, { ...typed, ...dragged } as Step), applyStep(raster, typed));
});

test("a dragged box stays inside the image and keeps one pixel each way", () => {
  assert.deepEqual(wholeCropBox({ x: -3, y: 95, width: 120, height: 20 }, 100, 100), { x: 0, y: 95, width: 100, height: 5 });
  assert.deepEqual(wholeCropBox({ x: 10, y: 20, width: 0.2, height: 0 }, 100, 100), { x: 10, y: 20, width: 1, height: 1 });
  assert.deepEqual(wholeCropBox({ x: 100, y: 100, width: 5, height: 5 }, 100, 100), { x: 99, y: 99, width: 1, height: 1 });
});
