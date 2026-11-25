// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Optical density calibration and labelled peaks (roadmap I20): fits that recover known lines and parabolas, R², the
// point counts on both sides of each fit's minimum, OD measured through a standard, and peaks of a hand-made lane.
import assert from "node:assert/strict";
import test from "node:test";
import { densityAt, densityProblem, describeFit, fitDensity, formatMeasure, labelledPeaks, measureRegion, peakArea, type Raster } from "../../source/engine";

const near = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} is not ${b}`);

test("a linear fit recovers OD = 2 − 0.008 v exactly, with R² = 1", () => {
  const points = [0, 50, 125, 250].map((grey) => ({ grey, od: 2 - 0.008 * grey }));
  const fitted = fitDensity({ fit: "linear", points });
  near(fitted.coefficients[0], 2); near(fitted.coefficients[1], -0.008); near(fitted.rSquared, 1);
  near(densityAt(fitted, 100), 1.2);
  assert.equal(describeFit(fitted, 4, formatMeasure), "OD = 2 − 0.008v (linear, R² = 1, 4 points, grey 0 to 250)");
});

test("a quadratic fit recovers a parabola; a linear fit of it has R² below 1", () => {
  const points = [10, 60, 120, 200, 240].map((grey) => ({ grey, od: 3 - 0.02 * grey + 0.00004 * grey * grey }));
  const quadratic = fitDensity({ fit: "quadratic", points });
  near(quadratic.coefficients[0], 3, 1e-9); near(quadratic.coefficients[1], -0.02, 1e-11); near(quadratic.coefficients[2], 0.00004, 1e-13);
  assert.ok(fitDensity({ fit: "linear", points }).rSquared < 1);
});

test("R² of a hand-worked scatter: points (0, 0), (1, 1), (2, 1) give 0.75", () => {
  near(fitDensity({ fit: "linear", points: [{ grey: 0, od: 0 }, { grey: 1, od: 1 }, { grey: 2, od: 1 }] }).rSquared, 0.75);
});

test("each fit needs its number of different grey values", () => {
  const p = (...greys: number[]) => greys.map((grey) => ({ grey, od: grey / 100 }));
  assert.match(densityProblem({ fit: "linear", points: p(10) })!, /at least 2 .* there is 1/);
  assert.match(densityProblem({ fit: "linear", points: p(10, 10) })!, /there is 1/);
  assert.equal(densityProblem({ fit: "linear", points: p(10, 20) }), null);
  assert.match(densityProblem({ fit: "quadratic", points: p(10, 20) })!, /at least 3 .* there are 2/);
  assert.equal(densityProblem({ fit: "quadratic", points: p(10, 20, 30) }), null);
  assert.match(densityProblem({ fit: "linear", points: [{ grey: -1, od: 0 }, { grey: 2, od: 1 }] })!, /grey value of 0 or more/);
});

test("mean optical density uses the standard when there is one", () => {
  const raster: Raster = { widthPx: 2, heightPx: 1, channels: 1, bitDepth: 8, data: Uint16Array.from([100, 200]) };
  const scale = { x: 1, y: 1, unit: "px" as const };
  near(measureRegion(raster, null, null, scale).opticalDensity!, (Math.log10(255 / 100) + Math.log10(255 / 200)) / 2);
  const fitted = fitDensity({ fit: "linear", points: [{ grey: 0, od: 2 }, { grey: 250, od: 0 }] });
  near(measureRegion(raster, null, null, scale, { density: fitted }).opticalDensity!, (1.2 + 0.4) / 2);
});

test("labelled peaks of a lane: tops in order, their valleys, and the prominence limit on both sides", () => {
  const values = [0, 2, 6, 2, 1, 1, 4, 9, 4, 3, 5, 3, 0];
  const profile = { distances: values.map((_, i) => i + 0.5), values, unit: "px" as const };
  const peaks = labelledPeaks(profile, 0);
  assert.deepEqual(peaks.map((p) => [p.label, p.top, p.from, p.to, p.prominence]), [[1, 2, 0, 4, 5], [2, 7, 5, 9, 6], [3, 10, 9, 12, 2]]);
  near(peaks[0].area, peakArea(profile, 0, 4));
  assert.deepEqual(labelledPeaks(profile, 2).map((p) => p.top), [2, 7, 10]);
  assert.deepEqual(labelledPeaks(profile, 2.01).map((p) => [p.label, p.top]), [[1, 2], [2, 7]]);
  // A flat top counts once; a flat profile has none.
  assert.deepEqual(labelledPeaks({ ...profile, values: [0, 3, 3, 0] }, 0).map((p) => p.top), [1]);
  assert.deepEqual(labelledPeaks({ ...profile, values: [2, 2, 2] }, 0), []);
});
