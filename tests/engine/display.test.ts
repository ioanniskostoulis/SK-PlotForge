// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Display, maths and contrast on hand-worked values: levels through a display range, the lookup tables' ends and
// middles, colour images per channel, auto range, saving; maths with a constant, clipping, gamma and log; normalise
// and equalise. Display never changes the raster.
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyContrast, applyMath, applySteps, autoRange, DEFAULT_DISPLAY, displayLevel, displayProblem, displayRecord, displayRgba, lutColours, mathClipped, mathProblem,
  newStep, parseDisplay, parseStep, stepRecord, type Raster, type Step,
} from "../../source/engine";

const grey = (width: number, values: number[], bitDepth: 8 | 16 = 8): Raster => ({ widthPx: width, heightPx: values.length / width, channels: 1, bitDepth, data: Uint16Array.from(values) });
const rgbAt = (table: Uint8Array, level: number) => [...table.slice(level * 3, level * 3 + 3)];

test("a display range spreads min to max over 256 levels, clipping outside", () => {
  assert.equal(displayLevel(100, 100, 200), 0);
  assert.equal(displayLevel(150, 100, 200), 128); // 127.5 rounds up
  assert.equal(displayLevel(200, 100, 200), 255);
  assert.equal(displayLevel(20, 100, 200), 0);
  assert.equal(displayLevel(250, 100, 200), 255);
  // Without a range, a 16-bit image shows its whole depth.
  const rgba = displayRgba(grey(2, [0, 65535], 16));
  assert.deepEqual([...rgba], [0, 0, 0, 255, 255, 255, 255, 255]);
});

test("lookup tables: Grays and Inverted run between black and white; Black and white splits at the middle; Spectrum runs red to magenta", () => {
  const grays = lutColours({ lut: "grays", stops: [] });
  assert.deepEqual([rgbAt(grays, 0), rgbAt(grays, 128), rgbAt(grays, 255)], [[0, 0, 0], [128, 128, 128], [255, 255, 255]]);
  const inverted = lutColours({ lut: "inverted", stops: [] });
  assert.deepEqual([rgbAt(inverted, 0), rgbAt(inverted, 255)], [[255, 255, 255], [0, 0, 0]]);
  const split = lutColours({ lut: "blackWhite", stops: [] });
  assert.deepEqual([rgbAt(split, 127), rgbAt(split, 128)], [[0, 0, 0], [255, 255, 255]]);
  const spectrum = lutColours({ lut: "spectrum", stops: [] });
  assert.deepEqual([rgbAt(spectrum, 0), rgbAt(spectrum, 255)], [[255, 0, 0], [255, 0, 255]]);
  const fire = lutColours({ lut: "fire", stops: [] });
  assert.deepEqual([rgbAt(fire, 0), rgbAt(fire, 255)], [[0, 0, 0], [255, 255, 255]]);
  // Custom: three colours, the middle one at level 127.5, so level 255 is the last.
  const custom = lutColours({ lut: "custom", stops: ["#ff0000", "#00ff00", "#0000ff"] });
  assert.deepEqual([rgbAt(custom, 0), rgbAt(custom, 255)], [[255, 0, 0], [0, 0, 255]]);
});

test("a grey image is drawn through the range and the table; a colour image keeps its colours, per channel; values never change", () => {
  const image = grey(2, [100, 200]);
  const before = [...image.data];
  const rgba = displayRgba(image, { ...DEFAULT_DISPLAY, lut: "inverted", min: 100, max: 200 });
  assert.deepEqual([...rgba], [255, 255, 255, 255, 0, 0, 0, 255]);
  assert.deepEqual([...image.data], before);
  const rgb: Raster = { widthPx: 1, heightPx: 1, channels: 3, bitDepth: 8, data: Uint16Array.from([50, 100, 150]) };
  assert.deepEqual([...displayRgba(rgb, { ...DEFAULT_DISPLAY, lut: "fire", min: 50, max: 150 })], [0, 128, 255, 255]);
});

test("auto range leaves the saturated share outside, half at each end", () => {
  const counts = new Float64Array(256);
  counts[0] = 1; counts[10] = 498; counts[200] = 500; counts[255] = 1;
  assert.deepEqual(autoRange(counts, 0.35), { min: 10, max: 200 });
  assert.deepEqual(autoRange(counts, 0), { min: 0, max: 255 });
  const flat = new Float64Array(256); flat[7] = 10;
  assert.equal(autoRange(flat), null);
});

test("display settings are checked and saved; Custom keeps its colours", () => {
  assert.equal(displayProblem({ ...DEFAULT_DISPLAY, min: 10, max: 5 }, 8) !== null, true);
  assert.equal(displayProblem({ ...DEFAULT_DISPLAY, min: 0, max: 300 }, 8) !== null, true);
  assert.equal(displayProblem({ ...DEFAULT_DISPLAY, min: 0, max: 300 }, 16), null);
  assert.equal(displayProblem({ ...DEFAULT_DISPLAY, lut: "custom", stops: ["#000000"] }, 8) !== null, true);
  const custom = { lut: "custom" as const, min: 5, max: 250, stops: ["#000000", "#ff8800"] };
  assert.deepEqual(parseDisplay(displayRecord(custom), 8), custom);
  assert.deepEqual(displayRecord({ ...custom, lut: "fire" }), { lut: "fire", min: 5, max: 250 });
  assert.throws(() => parseDisplay({ lut: "rainbow", min: null, max: null }, 8));
});

test("maths with a constant: each operation by hand, rounded and clipped", () => {
  const image = grey(4, [0, 10, 100, 250]);
  const run = (operation: Parameters<typeof applyMath>[1], value: number) => [...applyMath(image, operation, value).data];
  assert.deepEqual(run("add", 10), [10, 20, 110, 255]);
  assert.deepEqual(run("subtract", 20), [0, 0, 80, 230]);
  assert.deepEqual(run("multiply", 1.5), [0, 15, 150, 255]);
  assert.deepEqual(run("divide", 4), [0, 3, 25, 63]); // 2.5 and 62.5 round up
  assert.deepEqual(run("min", 50), [50, 50, 100, 250]);
  assert.deepEqual(run("max", 50), [0, 10, 50, 50]);
  assert.deepEqual(run("set", 7), [7, 7, 7, 7]);
  assert.deepEqual(run("gamma", 2), [0, Math.round(255 * (10 / 255) ** 2), Math.round(255 * (100 / 255) ** 2), Math.round(255 * (250 / 255) ** 2)]);
  assert.deepEqual(run("log", 0), [0, Math.round((255 * Math.log(10)) / Math.log(255)), Math.round((255 * Math.log(100)) / Math.log(255)), Math.round((255 * Math.log(250)) / Math.log(255))]);
  assert.equal(mathClipped(image, "add", 10), 1);
  assert.equal(mathClipped(image, "subtract", 20), 2);
  assert.equal(mathProblem("divide", 0) !== null, true);
  assert.equal(mathProblem("gamma", 0) !== null, true);
});

test("normalise stretches the range to the full depth; equalise follows the cumulative count", () => {
  const image = grey(4, [50, 100, 100, 150]);
  assert.deepEqual([...applyContrast(image, "normalize", 0).data], [0, 128, 128, 255]);
  // C(50) = 1, C(100) = 3, C(150) = 4; N = 4: 255 · (C − 1) / 3.
  assert.deepEqual([...applyContrast(image, "equalize", 0).data], [0, 170, 170, 255]);
  // One value: nothing to stretch.
  assert.deepEqual([...applyContrast(grey(2, [9, 9]), "normalize", 0.35).data], [9, 9]);
});

test("maths and contrast steps run in the list and are saved", () => {
  const shape = { widthPx: 4, heightPx: 1, channels: 1, bitDepth: 8 } as const;
  const math = { ...newStep("math", [], shape), operation: "multiply", value: 2 } as Step;
  const contrast = { ...newStep("contrast", [math], shape), method: "equalize" } as Step;
  assert.deepEqual([...applySteps(grey(4, [1, 2, 3, 4]), [math]).raster.data], [2, 4, 6, 8]);
  assert.deepEqual(parseStep(stepRecord(math)), math);
  assert.deepEqual(stepRecord(contrast), { id: contrast.id, type: "contrast", enabled: true, method: "equalize" });
  assert.equal(applySteps(grey(4, [1, 2, 3, 4]), [{ ...math, operation: "divide", value: 0 } as Step]).problems.length, 1);
});
