// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Calibration: the scale from a known length or units per pixel, the aspect ratio, which calibration applies, the
// quarter turns that swap a pixel's sides, both sides of every limit, and the rule that a calibration changes
// reported lengths and areas and nothing else.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import {
  applySteps, areaOf, calibrationProblem, decodeImage, describeImage, directScale, emptyProject, formatArea, formatLength, formatMeasure, knownLength,
  lengthOf, newProjectImage, newStep, parseProject, pixelAt, PIXELS, positionOf, resolveCalibration, scaleAfterSteps, scaleOf, serializeProject, shapeOf,
  traceShapes, followCalibrationLine, lineCalibration, linePixelLength, type Step,
} from "../../source/engine";

const inflate = async (data: Uint8Array) => new Uint8Array(inflateSync(data));
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);

// MARK: the scale

test("a known length sets the scale: 200 px spanning 50 µm is 0.25 µm per pixel", () => {
  const scale = scaleOf(knownLength(200, 50, "µm"));
  assert.deepEqual(scale, { x: 0.25, y: 0.25, unit: "µm" });
  // The same scale entered directly.
  assert.deepEqual(scaleOf(directScale(0.25, "µm")), scale);
});

test("the aspect ratio makes a pixel taller than wide: y = x · aspect", () => {
  assert.deepEqual(scaleOf(knownLength(100, 10, "mm", 2)), { x: 0.1, y: 0.2, unit: "mm" });
  assert.deepEqual(scaleOf(directScale(3, "nm", 0.5)), { x: 3, y: 1.5, unit: "nm" });
});

test("no calibration, or one that cannot be used, measures in pixels", () => {
  assert.deepEqual(scaleOf(null), PIXELS);
  assert.deepEqual(scaleOf(knownLength(0, 50, "µm")), PIXELS);
});

test("lengths, areas and positions follow the scale", () => {
  const scale = scaleOf(knownLength(100, 10, "mm", 2)); // 0.1 mm wide, 0.2 mm tall
  close(lengthOf(30, 0, scale), 3);
  close(lengthOf(0, 30, scale), 6);
  close(lengthOf(30, 20, scale), 5); // √(3² + 4²)
  close(areaOf(50, scale), 1); // 50 · 0.1 · 0.2
  assert.deepEqual(positionOf(0, 0, scale), [0, 0]);
  const [x, y] = positionOf(10, 5, scale);
  close(x, 1); close(y, 1);
  // In pixels, a length is the pixel distance and an area the pixel count.
  assert.equal(lengthOf(3, 4, PIXELS), 5);
  assert.equal(areaOf(120, PIXELS), 120);
});

// MARK: limits

test("every length and the aspect ratio must be above 0: 0 is refused, the smallest positive value is not", () => {
  const ok = knownLength(200, 50, "µm");
  assert.equal(calibrationProblem(ok), null);
  assert.match(calibrationProblem({ ...ok, pixelLength: 0 })!, /pixel length must be above 0/);
  assert.equal(calibrationProblem({ ...ok, pixelLength: Number.MIN_VALUE }), null);
  assert.match(calibrationProblem({ ...ok, realLength: 0 })!, /real length must be above 0/);
  assert.match(calibrationProblem({ ...ok, realLength: -1 })!, /real length must be above 0/);
  assert.equal(calibrationProblem({ ...ok, realLength: 1e-9 }), null);
  assert.match(calibrationProblem({ ...ok, aspect: 0 })!, /aspect ratio must be above 0/);
  assert.equal(calibrationProblem({ ...ok, aspect: 1e-6 }), null);
  assert.match(calibrationProblem({ ...ok, realLength: Infinity })!, /real length/);
  assert.match(calibrationProblem({ ...ok, realLength: NaN })!, /real length/);
  assert.match(calibrationProblem({ ...ok, unit: "furlong" as never })!, /unit is one of/);
});

// MARK: which calibration applies

test("an image's own calibration comes first, then the document's default, then pixels", () => {
  const own = directScale(2, "mm"), document = directScale(5, "µm");
  assert.deepEqual(resolveCalibration(own, document), { calibration: own, from: "image" });
  assert.deepEqual(resolveCalibration(null, document), { calibration: document, from: "document" });
  assert.deepEqual(resolveCalibration(null, null), { calibration: null, from: "none" });
  // "pixels" keeps an image in pixels even when the document has a default.
  assert.deepEqual(resolveCalibration("pixels", document), { calibration: null, from: "none" });
});

// MARK: steps

test("an odd number of quarter turns swaps a pixel's width and height; an even number does not", () => {
  const scale = scaleOf(directScale(1, "µm", 3)); // 1 × 3 µm
  const shape = { widthPx: 4, heightPx: 2, channels: 1 as const, bitDepth: 8 as const };
  const turn = (quarterTurns: 1 | 2 | 3, enabled = true): Step => ({ ...newStep("rotate", [], shape), quarterTurns, enabled } as Step);
  assert.deepEqual(scaleAfterSteps(scale, [turn(1)]), { x: 3, y: 1, unit: "µm" });
  assert.deepEqual(scaleAfterSteps(scale, [turn(3)]), { x: 3, y: 1, unit: "µm" });
  assert.deepEqual(scaleAfterSteps(scale, [turn(2)]), scale);
  assert.deepEqual(scaleAfterSteps(scale, [turn(1), turn(1)]), scale);
  assert.deepEqual(scaleAfterSteps(scale, [turn(1), turn(2)]), { x: 3, y: 1, unit: "µm" });
  // A disabled turn does not count; crops and flips never change a pixel's size.
  assert.deepEqual(scaleAfterSteps(scale, [turn(1, false)]), scale);
  assert.deepEqual(scaleAfterSteps(scale, [newStep("crop", [], shape), newStep("flip", [], shape)]), scale);
});

test("changing the calibration changes measurements and nothing else", async () => {
  const bytes = new Uint8Array(readFileSync("tests/fixtures/png-grey16-9x9-adam7.png"));
  const { raster } = await decodeImage(bytes, { inflate });
  const shape = shapeOf(raster);
  const steps: Step[] = [];
  steps.push({ ...newStep("crop", steps, shape), x: 1, y: 2, width: 5, height: 4 } as Step);
  steps.push(newStep("rotate", steps, shape));
  steps.push({ ...newStep("levels", steps, shape), black: 1000, white: 50000 } as Step);
  const project = emptyProject();
  const image = newProjectImage(project, "/lab/a.png", "a.png", describeImage(bytes).source, 0, 0);
  image.steps = steps;
  project.images.push(image);
  const results = [null, knownLength(200, 50, "µm"), directScale(3, "mm", 2), "pixels" as const].map((calibration) => {
    image.calibration = calibration;
    project.calibration = directScale(7, "nm");
    // What the steps make, read back from a saved document, is the same whatever the calibration.
    const reopened = parseProject(serializeProject(project, "/lab/a.pfg"), "/lab/a.pfg").images[0];
    const result = applySteps(raster, reopened.steps).raster;
    const scale = scaleAfterSteps(scaleOf(resolveCalibration(reopened.calibration, project.calibration).calibration), reopened.steps);
    return { pixels: [...result.data], shape: shapeOf(result), shapes: traceShapes(shape, reopened.steps), readout: pixelAt(result, 2, 3), length: lengthOf(4, 0, scale), area: areaOf(10, scale), unit: scale.unit };
  });
  for (const result of results.slice(1)) {
    assert.deepEqual(result.pixels, results[0].pixels);
    assert.deepEqual(result.shape, results[0].shape);
    assert.deepEqual(result.shapes, results[0].shapes);
    assert.deepEqual(result.readout, results[0].readout);
  }
  // The measurements differ: the document's 7 nm, 0.25 µm, 3 × 6 mm turned to 6 × 3 mm, and pixels.
  assert.deepEqual(results.map((result) => [result.length, result.area, result.unit]), [[28, 490, "nm"], [1, 0.625, "µm"], [24, 180, "mm"], [4, 10, "px"]]);
});

// MARK: in the document

test("calibrations are saved with the document: the default, an image's own, pixels and following", () => {
  const source = describeImage(new Uint8Array(readFileSync("tests/fixtures/rgb-6x4.png"))).source;
  const project = emptyProject();
  project.calibration = knownLength(120, 10, "µm", 1.5);
  for (let i = 0; i < 3; i++) project.images.push(newProjectImage(project, `/lab/${i}.png`, `${i}.png`, source, 0, 0));
  project.images[1].calibration = directScale(0.5, "mm");
  project.images[2].calibration = "pixels";
  const text = serializeProject(project, "/lab/a.pfg");
  assert.equal(serializeProject(parseProject(text, "/lab/a.pfg"), "/lab/a.pfg"), text);
  const data = JSON.parse(text);
  assert.deepEqual(data.calibration, { mode: "known", pixelLength: 120, realLength: 10, unit: "µm", aspect: 1.5 });
  assert.deepEqual(data.images.map((image: { calibration: unknown }) => image.calibration), [null, { mode: "scale", pixelLength: 1, realLength: 0.5, unit: "mm", aspect: 1 }, "pixels"]);
});

test("a document without calibrations opens in pixels; a damaged calibration is refused with a sentence", () => {
  const project = parseProject(JSON.stringify({ format: "plotforge", version: 1, images: [] }), null);
  assert.equal(project.calibration, null);
  const base = { format: "plotforge", version: 2, images: [] };
  assert.throws(() => parseProject(JSON.stringify({ ...base, calibration: { pixelLength: 0, realLength: 1, unit: "µm" } }), null), /pixel length must be above 0/);
  assert.throws(() => parseProject(JSON.stringify({ ...base, calibration: { pixelLength: 1, realLength: "1", unit: "µm" } }), null), /invalid realLength/);
  assert.throws(() => parseProject(JSON.stringify({ ...base, calibration: { pixelLength: 1, realLength: 1, unit: "ft" } }), null), /unit is one of/);
  // A stored calibration without an aspect ratio has square pixels.
  assert.equal(parseProject(JSON.stringify({ ...base, calibration: { mode: "known", pixelLength: 2, realLength: 1, unit: "mm" } }), null).calibration!.aspect, 1);
});

// MARK: wording

test("measured values keep four significant digits and their unit after a space", () => {
  assert.equal(formatMeasure(0.25), "0.25");
  assert.equal(formatMeasure(12.3456), "12.35");
  assert.equal(formatMeasure(1234), "1234");
  assert.equal(formatMeasure(1234.5678), "1235");
  assert.equal(formatMeasure(0.000123456), "0.0001235");
  assert.equal(formatMeasure(0.0000123456), "0.00001235");
  assert.equal(formatMeasure(1234567), "1.235e+6");
  assert.equal(formatMeasure(1200000.5), "1.2e+6");
  assert.equal(formatMeasure(0), "0");
  assert.equal(formatMeasure(1 / 3), "0.3333");
  assert.equal(formatLength(0.25, "µm"), "0.25 µm");
  assert.equal(formatArea(40, "µm"), "40 µm²");
});

// MARK: from a drawn line

test("a line's pixel length is its length along the original x; the scale then gives the entered length back", () => {
  // The micrograph scale bar: 169 px spans 20 µm.
  const bar = [[21, 910], [190, 910]] as [number, number][];
  assert.equal(linePixelLength(bar, []), 169);
  const calibration = lineCalibration("roi-1", bar, [], 20, "µm");
  close(scaleOf(calibration).x, 20 / 169);
  close(lengthOf(169, 0, scaleOf(calibration)), 20);
  // A slanted 3-4-5 line and a polyline add up their segments.
  assert.equal(linePixelLength([[0, 0], [3, 4]], []), 5);
  assert.equal(linePixelLength([[0, 0], [3, 4], [3, 10]], []), 11);
});

test("a line drawn after a quarter turn or on non-square pixels still gives back its real length", () => {
  const rotate = { ...newStep("rotate", [], { widthPx: 10, heightPx: 10, channels: 1, bitDepth: 8 }), quarterTurns: 1 } as Step;
  for (const aspect of [1, 2]) {
    for (const steps of [[], [rotate]]) {
      const line = [[2, 3], [8, 11]] as [number, number][];
      const calibration = lineCalibration("l", line, steps, 7, "mm", aspect);
      const scale = scaleAfterSteps(scaleOf(calibration), steps);
      close(lengthOf(6, 8, scale), 7);
    }
  }
  // Two pixels down on pixels twice as tall as wide is four widths; after a quarter turn, the same line runs along x.
  assert.equal(linePixelLength([[0, 0], [0, 2]], [], 2), 4);
  assert.equal(linePixelLength([[0, 0], [0, 2]], [rotate], 2), 2);
});

test("a calibration from a line follows the line, and stops following when the line is gone", () => {
  const project = emptyProject();
  const source = describeImage(new Uint8Array(readFileSync("tests/fixtures/rgb-6x4.png"))).source;
  const image = newProjectImage(project, "/a.png", "a.png", source, 0, 0);
  image.rois.push({ id: "roi-1", name: "Line 1", type: "line", points: [[0, 0], [100, 0]] });
  image.calibration = lineCalibration("roi-1", [[0, 0], [100, 0]], [], 50, "µm");
  assert.equal(followCalibrationLine(image), false);
  (image.rois[0] as { points: [number, number][] }).points = [[0, 0], [200, 0]];
  assert.equal(followCalibrationLine(image), true);
  assert.equal((image.calibration as { pixelLength: number }).pixelLength, 200);
  close(scaleOf(image.calibration).x, 0.25);
  // Saved and opened, the link stays; a calibration without one is written as before.
  project.images.push(image);
  const text = serializeProject(project, "/a.pfg");
  assert.equal(serializeProject(parseProject(text, "/a.pfg"), "/a.pfg"), text);
  assert.equal(parseProject(text, "/a.pfg").images[0].calibration && (parseProject(text, "/a.pfg").images[0].calibration as { line?: string }).line, "roi-1");
  assert.ok(!JSON.stringify(knownLength(1, 1, "µm")).includes("line"));
  image.rois = [];
  assert.equal(followCalibrationLine(image), true);
  assert.equal((image.calibration as { line?: string }).line, undefined);
  assert.equal((image.calibration as { pixelLength: number }).pixelLength, 200);
});
