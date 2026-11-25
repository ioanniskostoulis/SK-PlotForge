// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The automatic threshold methods beyond Otsu, Mean and Li (roadmap I15), on histograms worked by hand: two spikes,
// a peak with a tail on either side, quarters, and the empty and single-value cases.
import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticThreshold, huangThreshold, ijIsodataThreshold, intermodesThreshold, isodataThreshold, maxEntropyThreshold, minErrorThreshold, minimumThreshold, momentsThreshold, percentileThreshold, renyiEntropyThreshold, shanbhagThreshold,
  THRESHOLD_METHODS, triangleThreshold, yenThreshold,
} from "../../source/engine";

/** An 8-bit histogram with these counts at these values. */
const counts = (entries: Record<number, number>) => { const h = new Float64Array(256); for (const [v, n] of Object.entries(entries)) h[Number(v)] = n; return h; };
const spikes = counts({ 50: 60, 200: 40 });

test("on two spikes of 50 (60 pixels) and 200 (40) every method splits them", () => {
  // RenyiEntropy finds no entropy in any split of two values, so it gives 0, as ImageJ's does.
  assert.equal(automaticThreshold("renyientropy", spikes), 0);
  for (const method of THRESHOLD_METHODS.filter((item) => item !== "renyientropy")) {
    const t = automaticThreshold(method, spikes);
    assert.ok(t >= 50 && t < 200, `${method} gave ${t}`);
  }
  assert.equal(isodataThreshold(spikes), 125); // halfway between the class means
  assert.equal(intermodesThreshold(spikes), 125); // halfway between the peaks
  assert.equal(minimumThreshold(spikes), 51); // the first value of the flat valley
  assert.equal(percentileThreshold(spikes), 50); // 60% at or below, the nearest to half
  assert.equal(momentsThreshold(spikes), 50); // the image is its own two-level image: p0 = 0.6
  assert.equal(maxEntropyThreshold(spikes), 50); // every split between has entropy 0: the smallest
  assert.equal(yenThreshold(spikes), 50);
  assert.equal(triangleThreshold(spikes), 50);
});

test("triangle: the value farthest below the line from the peak to the tail's end, on either side", () => {
  // Peak 10 at 1, tail to 8: the line to (9, 0) is 10 · (9 − v) / 8; 2 at 5 lies 3 below it, the most.
  const right = counts({ 1: 10, 2: 8, 3: 6, 4: 4, 5: 2, 6: 1, 7: 1, 8: 1 });
  assert.equal(triangleThreshold(right), 4); // 5 joins the tail, v > t
  // The mirror image, tail to the left: 4 is the farthest, and joins the tail, v ≤ t.
  const left = counts({ 8: 10, 7: 8, 6: 6, 5: 4, 4: 2, 3: 1, 2: 1, 1: 1 });
  assert.equal(triangleThreshold(left), 4);
});

test("percentile: the share at or below t nearest to half, the smallest on a tie", () => {
  assert.equal(percentileThreshold(counts({ 0: 25, 1: 25, 2: 25, 3: 25 })), 1);
  assert.equal(percentileThreshold(counts({ 0: 10, 9: 90 })), 0); // 10% is nearer half than 100%
});

test("an empty histogram gives 0; one value gives that value", () => {
  for (const method of THRESHOLD_METHODS) {
    assert.equal(automaticThreshold(method, new Float64Array(256)), 0, method);
    assert.equal(automaticThreshold(method, counts({ 7: 12 })), 7, method);
  }
});


test("the methods run in one pass on a 16-bit histogram: two spikes at 1000 and 50000 are split", () => {
  const h = new Float64Array(65536);
  h[1000] = 300; h[50000] = 200;
  const started = performance.now();
  for (const method of ["maxentropy", "yen", "percentile", "moments", "triangle", "isodata"] as const) {
    const t = automaticThreshold(method, h);
    assert.ok(t >= 1000 && t < 50000, `${method} gave ${t}`);
  }
  assert.ok(performance.now() - started < 1000, "the histogram methods took over a second");
});

// MARK: IJ IsoData, Huang, MinError, RenyiEntropy and Shanbhag (roadmap I15)

/** Two normal peaks: 6000 pixels about 60 (σ 10) and 4000 about 170 (σ 15), rounded to whole counts; on 16 bits each 8-bit value spreads over 256. */
const twoNormals = (size = 256, scale = 1) => {
  const h = new Float64Array(size);
  const add = (n: number, mean: number, sd: number) => { for (let v = 0; v < size; v++) h[v] += Math.round((n / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-(((v / scale - mean) / sd) ** 2) / 2)); };
  add(6000, 60, 10); add(4000, 170, 15);
  return h;
};

test("on two normal peaks every method splits them, and MinError finds where the fitted curves cross", () => {
  const h = twoNormals();
  for (const method of THRESHOLD_METHODS) {
    const t = automaticThreshold(method, h);
    assert.ok(t > 60 && t < 170, `${method} gave ${t}`);
  }
  // 0.6 · N(60, 10) = 0.4 · N(170, 15) between the peaks.
  const pdf = (v: number, n: number, mean: number, sd: number) => (n / sd) * Math.exp(-(((v - mean) / sd) ** 2) / 2);
  let crossing = 60;
  while (pdf(crossing, 0.6, 60, 10) > pdf(crossing, 0.4, 170, 15)) crossing++;
  assert.ok(Math.abs(minErrorThreshold(h) - crossing) <= 2, `MinError ${minErrorThreshold(h)}, crossing ${crossing}`);
});

test("IJ IsoData leaves 0 and the maximum out, as ImageJ's Default does", () => {
  const h = counts({ 0: 100, 10: 10, 20: 10, 255: 100 });
  assert.equal(ijIsodataThreshold(h), 15); // between 10 and 20 only
  assert.notEqual(isodataThreshold(h), 15);
  // An image of 0s and 255s has nothing left: the middle of the scale.
  assert.equal(ijIsodataThreshold(counts({ 0: 5, 255: 5 })), 128);
});

test("on a 16-bit histogram the new methods stay quick and split where they do on 8 bits", () => {
  const h = twoNormals(65536, 256);
  assert.ok(h.filter((n) => n > 0).length > 2048, "enough values present to run on bins");
  const started = performance.now();
  for (const method of ["huang", "shanbhag", "renyientropy", "minerror", "ijisodata"] as const) {
    const t = automaticThreshold(method, h);
    assert.ok(t > 60 * 256 && t < 170 * 256, `${method} gave ${t}`);
  }
  assert.ok(performance.now() - started < 2000, "the 16-bit methods took over two seconds");
  // The same peaks on 256 values and on 65536 split at about the same place.
  assert.ok(Math.abs(huangThreshold(h) / 256 - huangThreshold(twoNormals())) <= 3, `Huang ${huangThreshold(h) / 256}`);
  assert.ok(Math.abs(shanbhagThreshold(h) / 256 - shanbhagThreshold(twoNormals())) <= 3, `Shanbhag ${shanbhagThreshold(h) / 256}`);
  assert.equal(ijIsodataThreshold(twoNormals()), isodataThreshold(twoNormals())); // no 0s or 255s to leave out
  assert.ok(Math.abs(renyiEntropyThreshold(h) / 256 - renyiEntropyThreshold(twoNormals())) <= 3, `RenyiEntropy ${renyiEntropyThreshold(h) / 256}`);
});
