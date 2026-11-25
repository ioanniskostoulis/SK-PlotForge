// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Thresholds: masks against hand-built images on both sides of each bound, the light and dark object ranges, Otsu,
// Mean and Li against references computed from their definitions (tests/fixtures/make-threshold-fixtures.py), and
// thresholds in the document.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import {
  applyThreshold, decodeImage, describeImage, emptyProject, histogram, liThreshold, meanThreshold, newProjectImage, otsuThreshold, parseProject,
  rangeMask, serializeProject, thresholdProblem, thresholdRange, type Raster, stepPhases
} from "../../source/engine";

const inflate = async (data: Uint8Array) => new Uint8Array(inflateSync(data));
const grey = (values: number[], bitDepth: 8 | 16 = 8, width = values.length): Raster => ({ widthPx: width, heightPx: values.length / width, channels: 1, bitDepth, data: Uint16Array.from(values) });
const count = (mask: Uint8Array) => mask.reduce((sum, v) => sum + v, 0);

// MARK: masks by hand

test("a range keeps both ends: low − 1 and high + 1 are out, low and high are in", () => {
  const image = grey([99, 100, 101, 149, 150, 151]);
  assert.deepEqual([...rangeMask(image, 100, 150)], [0, 1, 1, 1, 1, 0]);
  assert.deepEqual([...rangeMask(image, 101, 101)], [0, 0, 1, 0, 0, 0]);
  assert.equal(count(rangeMask(image, 152, 255)), 0);
  assert.equal(count(rangeMask(image, 0, 255)), 6);
});

test("16-bit ranges are in 16-bit values", () => {
  const image = grey([0, 255, 256, 40000, 65534, 65535], 16);
  assert.deepEqual([...rangeMask(image, 256, 65534)], [0, 0, 1, 1, 1, 0]);
  assert.equal(applyThreshold(image, { mode: "manual", low: 40000, high: 65535 }).count, 3);
});

test("light objects are v > t and dark objects v ≤ t, so together they cover the image once", () => {
  // Two groups, 10 and 200: Otsu's split is the top of the lower group.
  const image = grey([10, 10, 10, 200, 200, 10]);
  const light = applyThreshold(image, { mode: "otsu", objects: "light" });
  const dark = applyThreshold(image, { mode: "otsu", objects: "dark" });
  assert.equal(light.t, 10);
  assert.deepEqual([light.low, light.high, dark.low, dark.high], [11, 255, 0, 10]);
  assert.deepEqual([...light.mask], [0, 0, 0, 1, 1, 0]);
  assert.equal(light.count + dark.count, 6);
  for (let i = 0; i < 6; i++) assert.equal(light.mask[i] + dark.mask[i], 1);
});

test("a hand-built image: counts for manual and automatic thresholds", () => {
  // 4 × 3: values 0 to 110 in steps of 10.
  const image = grey([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110], 8, 4);
  assert.equal(applyThreshold(image, { mode: "manual", low: 30, high: 70 }).count, 5);
  // Mean 55: light objects are 60 and above.
  const mean = applyThreshold(image, { mode: "mean", objects: "light" });
  assert.deepEqual([mean.t, mean.count], [55, 6]);
  // A uniform spread: Otsu splits it in half.
  const otsu = applyThreshold(image, { mode: "otsu", objects: "dark" });
  assert.deepEqual([otsu.t, otsu.count], [50, 6]);
});

// MARK: automatic methods against the references

interface Expected { name: string; otsu: number; mean: number; li: number; count_above_otsu: number; pixels: number }
const references: Expected[] = JSON.parse(readFileSync("tests/fixtures/threshold-expected.json", "utf8"));

for (const reference of references) {
  test(`${reference.name}: Otsu, Mean and Li match their definitions computed on the pixels`, async () => {
    const { raster } = await decodeImage(new Uint8Array(readFileSync(`tests/fixtures/${reference.name}`)), { inflate });
    assert.equal(raster.widthPx * raster.heightPx, reference.pixels);
    const counts = histogram(raster);
    assert.equal(otsuThreshold(counts), reference.otsu);
    assert.equal(meanThreshold(counts), reference.mean);
    assert.equal(liThreshold(counts), reference.li);
    assert.equal(applyThreshold(raster, { mode: "otsu", objects: "light" }).count, reference.count_above_otsu);
  });
}

test("on a bimodal image Otsu falls between the two groups", () => {
  const eight = references.find((item) => item.name === "threshold-bimodal8.png")!;
  assert.ok(eight.otsu > 60 && eight.otsu < 170, `Otsu ${eight.otsu} between the peaks at 60 and 170`);
});

test("edge cases: one value, an empty histogram, two values", () => {
  const flat = histogram(grey([77, 77, 77]));
  assert.deepEqual([otsuThreshold(flat), meanThreshold(flat), liThreshold(flat)], [77, 77, 77]);
  const empty = new Float64Array(256);
  assert.deepEqual([otsuThreshold(empty), meanThreshold(empty), liThreshold(empty)], [0, 0, 0]);
  // Two values, 0 and 255: every method splits them.
  const two = histogram(grey([0, 0, 255, 255]));
  for (const t of [otsuThreshold(two), meanThreshold(two), liThreshold(two)]) assert.ok(t >= 0 && t < 255, String(t));
});

// MARK: problems and ranges

test("thresholds need a grey image, and a manual range needs low ≤ high within the image", () => {
  assert.match(thresholdProblem({ mode: "otsu", objects: "light" }, { channels: 3, bitDepth: 8 })!, /grey image/);
  assert.equal(thresholdProblem({ mode: "manual", low: 10, high: 10 }, { channels: 1, bitDepth: 8 }), null);
  assert.match(thresholdProblem({ mode: "manual", low: 11, high: 10 }, { channels: 1, bitDepth: 8 })!, /must not be above/);
  assert.equal(thresholdProblem({ mode: "manual", low: 255, high: 300 }, { channels: 1, bitDepth: 8 }), null);
  assert.match(thresholdProblem({ mode: "manual", low: 256, high: 300 }, { channels: 1, bitDepth: 8 })!, /end at 255/);
  // A range beyond the image's values is cut to them.
  assert.deepEqual(thresholdRange({ mode: "manual", low: 200, high: 1000 }, new Float64Array(256)), { low: 200, high: 255, t: null });
  const rgb: Raster = { widthPx: 1, heightPx: 1, channels: 3, bitDepth: 8, data: Uint16Array.from([1, 2, 3]) };
  assert.throws(() => applyThreshold(rgb, { mode: "mean", objects: "light" }), /grey image/);
});

// MARK: in the document

test("thresholds are saved with each image; none, damaged ones refused", () => {
  const source = describeImage(new Uint8Array(readFileSync("tests/fixtures/rgb-6x4.png"))).source;
  const project = emptyProject();
  for (let i = 0; i < 3; i++) project.images.push(newProjectImage(project, `/lab/${i}.png`, `${i}.png`, source, 0, 0));
  project.images[0].steps = [{ id: "step-1", type: "threshold", enabled: true, phases: [{ id: "phase-1", name: "Phase 1", colour: "magenta", threshold: { mode: "manual", low: 12, high: 200 } }] }];
  project.images[1].steps = [{ id: "step-1", type: "threshold", enabled: true, phases: [{ id: "phase-1", name: "Phase 1", colour: "magenta", threshold: { mode: "li", objects: "dark" } }] }];
  const text = serializeProject(project, "/lab/a.pfg");
  assert.equal(serializeProject(parseProject(text, "/lab/a.pfg"), "/lab/a.pfg"), text);
  assert.deepEqual(parseProject(text, "/lab/a.pfg").images.map((image) => stepPhases(image.steps)[0]?.threshold ?? null), [{ mode: "manual", low: 12, high: 200 }, { mode: "li", objects: "dark" }, null]);
  const data = JSON.parse(text);
  // A threshold as documents before phases stored it, which opens as Phase 1.
  const withThreshold = (threshold: unknown) => JSON.stringify({ ...data, images: [{ ...data.images[0], steps: [], threshold }] });
  assert.throws(() => parseProject(withThreshold({ mode: "manual", low: 5, high: 4 }), null), /invalid threshold range/);
  assert.throws(() => parseProject(withThreshold({ mode: "otsu" }), null), /without light or dark objects/);
  assert.throws(() => parseProject(withThreshold({ mode: "kittler", objects: "light" }), null), /unknown kind \(kittler\)/);
});
