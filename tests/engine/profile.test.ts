// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Histograms, line and lane profiles and peak areas on hand-worked images.
import assert from "node:assert/strict";
import test from "node:test";
import { directScale, histogramOf, interpolate, laneProfile, lineProfile, peakArea, PIXELS, scaleOf, type Raster } from "../../source/engine";

const grey = (width: number, values: number[], bitDepth: 8 | 16 = 8): Raster => ({ widthPx: width, heightPx: values.length / width, channels: 1, bitDepth, data: Uint16Array.from(values) });
const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("a histogram counts every value in its bin, with the statistics of the values", () => {
  const image = grey(4, [0, 0, 1, 2, 64, 65, 128, 255]);
  const h = histogramOf(image);
  assert.equal(h.counts.length, 256);
  assert.deepEqual([h.counts[0], h.counts[1], h.counts[2], h.counts[255]], [2, 1, 1, 1]);
  assert.deepEqual([h.count, h.min, h.max, h.modal], [8, 0, 255, 0]);
  close(h.mean, 515 / 8);
  // Four bins of 64 values: 0 to 63, 64 to 127, 128 to 191, 192 to 255.
  assert.deepEqual(histogramOf(image, null, 4).counts, [4, 2, 1, 1]);
  // A region counts only its pixels.
  assert.deepEqual(histogramOf(image, Uint8Array.from([0, 0, 0, 0, 1, 1, 0, 0]), 4).counts, [0, 2, 0, 0]);
  // 16-bit images bin 65536 values.
  assert.equal(histogramOf(grey(1, [65535], 16), null, 256).counts[255], 1);
  assert.throws(() => histogramOf(image, null, 0));
});

test("interpolation is bilinear between pixel centres", () => {
  const image = grey(2, [0, 100, 200, 100]);
  close(interpolate(image, 0.5, 0.5), 0);
  close(interpolate(image, 1, 0.5), 50);
  close(interpolate(image, 1, 1), 100);
  close(interpolate(image, 0, 0), 0); // beyond the centres, the edge pixel
});

test("a line profile samples once per pixel of length, with calibrated distances", () => {
  const image = grey(5, [0, 10, 20, 30, 40]);
  const profile = lineProfile(image, [[0.5, 0.5], [4.5, 0.5]], PIXELS);
  assert.deepEqual(profile.values, [0, 10, 20, 30, 40]);
  assert.deepEqual(profile.distances, [0, 1, 2, 3, 4]);
  const scaled = lineProfile(image, [[0.5, 0.5], [4.5, 0.5]], scaleOf(directScale(0.25, "µm")));
  assert.deepEqual(scaled.distances, [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(scaled.unit, "µm");
  // A polyline does not repeat the point where its segments meet.
  assert.equal(lineProfile(image, [[0.5, 0.5], [2.5, 0.5], [4.5, 0.5]], PIXELS).values.length, 5);
});

test("a lane profile averages across the short side, along the long side", () => {
  const image = grey(3, [1, 2, 3, 3, 4, 5]);
  assert.deepEqual(laneProfile(image, { x: 0, y: 0, width: 3, height: 2 }, PIXELS).values, [2, 3, 4]);
  const tall = grey(2, [1, 3, 5, 7, 9, 11]);
  const lane = laneProfile(tall, { x: 0, y: 0, width: 2, height: 3 }, PIXELS);
  assert.deepEqual(lane.values, [2, 6, 10]);
  assert.deepEqual(lane.distances, [0.5, 1.5, 2.5]);
});

test("peak area is the area above the straight baseline, by the trapezoid rule", () => {
  // A triangle of height 10 over a flat baseline of 5, 4 units wide: 20.
  const profile = { distances: [0, 1, 2, 3, 4], values: [5, 10, 15, 10, 5], unit: "px" };
  close(peakArea(profile, 0, 4), 20);
  close(peakArea(profile, 4, 0), 20);
  // A sloped baseline from 0 to 10 under a straight line: nothing above it.
  close(peakArea({ distances: [0, 1, 2], values: [0, 5, 10], unit: "px" }, 0, 2), 0);
  assert.throws(() => peakArea(profile, 0, 5));
});
