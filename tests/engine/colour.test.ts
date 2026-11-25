// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Colour thresholds (roadmap I11): HSB and CIELAB conversions against published reference values (CIELAB of the sRGB
// primaries with the D65 white, as Lindbloom's calculator gives them), masks per model on hand-built colour fixtures
// on both sides of each bound, the hue range that wraps, the picker, and the threshold in the document.
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyThreshold, colourMask, colourRangesProblem, emptyProject, inRange, newProjectImage, parseProject, rangesAround, rgbToHsb, rgbToLab, sampleColour,
  serializeProject, thresholdProblem, type ColourModel3, type Raster, type Threshold, rangeOnly, stepPhases } from "../../source/engine";

const rgb = (pixels: [number, number, number][], bitDepth: 8 | 16 = 8): Raster => ({ widthPx: pixels.length, heightPx: 1, channels: 3, bitDepth, data: Uint16Array.from(pixels.flat()) });
const close = (actual: readonly number[], expected: readonly number[], tolerance: number) =>
  actual.forEach((value, k) => assert.ok(Math.abs(value - expected[k]) <= tolerance, `component ${k}: ${value} is not ${expected[k]}`));

test("HSB of reference colours", () => {
  close(rgbToHsb(255, 0, 0), [0, 100, 100], 1e-9);
  close(rgbToHsb(0, 255, 0), [120, 100, 100], 1e-9);
  close(rgbToHsb(0, 0, 255), [240, 100, 100], 1e-9);
  close(rgbToHsb(255, 255, 0), [60, 100, 100], 1e-9);
  close(rgbToHsb(128, 0, 128), [300, 100, (128 / 255) * 100], 1e-9);
  close(rgbToHsb(255, 128, 0), [60 * (128 / 255), 100, 100], 1e-9);
  // A grey pixel has hue 0 and saturation 0; black has brightness 0.
  close(rgbToHsb(100, 100, 100), [0, 0, (100 / 255) * 100], 1e-9);
  close(rgbToHsb(0, 0, 0), [0, 0, 0], 1e-9);
});

test("CIELAB (D65) of the sRGB primaries, white, black and mid grey match the references to 0.01", () => {
  close(rgbToLab(255, 0, 0), [53.2408, 80.0925, 67.2032], 0.01);
  close(rgbToLab(0, 255, 0), [87.7347, -86.1827, 83.1793], 0.01);
  close(rgbToLab(0, 0, 255), [32.2970, 79.1875, -107.8602], 0.01);
  close(rgbToLab(255, 255, 255), [100, 0, 0], 0.01);
  close(rgbToLab(0, 0, 0), [0, 0, 0], 1e-9);
  close(rgbToLab(128, 128, 128), [53.5850, 0, 0], 0.01);
});

test("RGB ranges keep both ends: one below and one above each bound are out", () => {
  const image = rgb([[99, 50, 50], [100, 50, 50], [150, 50, 50], [151, 50, 50], [120, 49, 50], [120, 61, 50]]);
  assert.deepEqual([...colourMask(image, "rgb", [[100, 150], [50, 60], [0, 255]])], [0, 1, 1, 0, 0, 0]);
});

test("a 16-bit colour image is read in 0 to 255", () => {
  const image = rgb([[65535, 0, 0], [32896, 0, 0]], 16);
  assert.deepEqual([...colourMask(image, "rgb", [[200, 255], [0, 0], [0, 0]])], [1, 0]);
});

test("HSB ranges, and a hue range that wraps through 0°", () => {
  // Hues 0 (red), 120 (green), 240 (blue), 350 (a red with a little blue), and grey.
  const image = rgb([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 0, 43], [128, 128, 128]]);
  const hue = (low: number, high: number) => [...colourMask(image, "hsb", [[low, high], [0, 100], [0, 100]])];
  assert.deepEqual(hue(100, 140), [0, 1, 0, 0, 0]);
  assert.deepEqual(hue(340, 10), [1, 0, 0, 1, 1]); // grey has hue 0, so a saturation range is needed to leave it out
  assert.deepEqual([...colourMask(image, "hsb", [[340, 10], [1, 100], [0, 100]])], [1, 0, 0, 1, 0]);
  assert.deepEqual(hue(121, 239), [0, 0, 0, 0, 0]);
  assert.equal(inRange(5, [350, 10], true), true);
  assert.equal(inRange(11, [350, 10], true), false);
  assert.equal(inRange(5, [350, 10], false), false);
});

test("CIELAB ranges select the primaries by a* and b*", () => {
  const image = rgb([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]]);
  assert.deepEqual([...colourMask(image, "lab", [[0, 100], [60, 127], [0, 127]])], [1, 0, 0, 0]);
  assert.deepEqual([...colourMask(image, "lab", [[0, 100], [-128, -80], [0, 127]])], [0, 1, 0, 0]);
  assert.deepEqual([...colourMask(image, "lab", [[99, 100], [-1, 1], [-1, 1]])], [0, 0, 0, 1]);
});

test("ranges outside a model's limits, or reversed, are refused; a reversed hue is allowed", () => {
  assert.equal(colourRangesProblem("rgb", [[0, 255], [0, 255], [0, 255]]), null);
  assert.match(colourRangesProblem("rgb", [[0, 256], [0, 255], [0, 255]])!, /Red takes values from 0 to 255/);
  assert.match(colourRangesProblem("rgb", [[10, 9], [0, 255], [0, 255]])!, /must not be above/);
  assert.equal(colourRangesProblem("hsb", [[350, 10], [0, 100], [0, 100]]), null);
  assert.match(colourRangesProblem("hsb", [[0, 360], [0, 101], [0, 100]])!, /Saturation/);
  assert.match(colourRangesProblem("lab", [[0, 100], [-129, 0], [0, 0]])!, /a\*/);
});

test("a colour threshold needs a colour image; a grey threshold needs a grey one", () => {
  const colour = { mode: "colour", model: "rgb", ranges: [[0, 255], [0, 255], [0, 255]] } as const;
  assert.match(thresholdProblem({ ...colour, ranges: [[0, 255], [0, 255], [0, 255]] }, { channels: 1, bitDepth: 8 })!, /needs a colour image/);
  assert.equal(thresholdProblem({ ...colour, ranges: [[0, 255], [0, 255], [0, 255]] }, { channels: 3, bitDepth: 8 }), null);
  const result = applyThreshold(rgb([[10, 20, 30], [200, 20, 30]]), { mode: "colour", model: "rgb", ranges: [[0, 100], [0, 255], [0, 255]] });
  assert.equal(result.count, 1);
});

test("a picked colour lies inside its own ranges in every model, at tolerance 0 and above", () => {
  const image = rgb([[200, 40, 90], [10, 220, 30], [255, 0, 3]]);
  for (const model of ["rgb", "hsb", "lab"] as ColourModel3[]) {
    for (const tolerance of [0, 5, 20]) {
      for (let x = 0; x < 3; x++) {
        const picked = sampleColour(image, x, 0)!;
        const mask = colourMask(image, model, rangesAround(model, picked, tolerance));
        assert.equal(mask[x], 1, `${model} at ${tolerance}% leaves out pixel ${x}`);
      }
    }
  }
  // At 0 the other, distant colours are out.
  assert.deepEqual([...colourMask(image, "lab", rangesAround("lab", sampleColour(image, 0, 0)!, 0))], [1, 0, 0]);
});

test("the picker averages a square cut to the image, and reads nothing outside it or on grey", () => {
  const image: Raster = { widthPx: 2, heightPx: 2, channels: 3, bitDepth: 8, data: Uint16Array.from([0, 0, 0, 100, 100, 100, 200, 200, 200, 40, 40, 40]) };
  close(sampleColour(image, 0, 0, 3)!, [85, 85, 85], 1e-9);
  close(sampleColour(image, 1.9, 1.2, 1)!, [40, 40, 40], 1e-9);
  assert.equal(sampleColour(image, 2, 0), null);
  assert.equal(sampleColour(image, -0.1, 0), null);
  assert.equal(sampleColour({ ...image, channels: 1, data: new Uint16Array(4) }, 0, 0), null);
});

test("a colour threshold is saved with the image and read back the same", () => {
  const project = emptyProject();
  const image = newProjectImage(project, "/data/a.png", "a.png", { format: "png", widthPx: 2, heightPx: 1, bitDepth: 8, colour: "rgb", channels: 3, bytes: 10, crc32: "00000000", orientation: 1 }, 0, 0);
  const threshold: Threshold = { mode: "colour", model: "hsb", ranges: [[340, 20], [10, 100], [5, 95]], pick: { rgb: [200.5, 40, 60], tolerance: 10 }, operations: [{ kind: "open", iterations: 1 }] };
  image.steps = [
    { id: "step-1", type: "threshold", enabled: true, phases: [{ id: "phase-1", name: "Primary", colour: "green", threshold: rangeOnly(threshold) }] },
    { id: "step-2", type: "mask", enabled: true, operation: "open", iterations: 1 },
  ];
  project.images.push(image);
  const text = serializeProject(project, "/data/a.pfg");
  const back = parseProject(text, "/data/a.pfg");
  assert.deepEqual(stepPhases(back.images[0].steps)[0].threshold, threshold);
  assert.equal(serializeProject(back, "/data/a.pfg"), text);
  assert.throws(() => parseProject(text.replace('"model": "hsb"', '"model": "cmyk"'), "/data/a.pfg"), /invalid colour threshold/);
  assert.throws(() => parseProject(text.replace('"tolerance": 10', '"tolerance": 101'), "/data/a.pfg"), /invalid picked colour/);
  assert.doesNotThrow(() => parseProject(text.replace('"tolerance": 10', '"tolerance": 100'), "/data/a.pfg"));
});
