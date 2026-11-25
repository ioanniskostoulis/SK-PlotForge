// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The Threshold step (IMAGE-ANALYSIS.md, Threshold as a step): grey steps before it, mask steps after it, each mask step
// on every phase's mask separately; and documents from before it, whose phases open as a Threshold step and mask steps.
import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMaskOperations, applySteps, applyThreshold, crc32, emptyProject, insertIndex, measureRecord, newProjectImage, newStep, parseProject, rangeMask,
  serializeProject, shapeOf, stepPhases, withLegacyPhases, type Phase, type Raster, type ResultRecord, type Step,
} from "../../source/engine";

// 7 × 7 grey: a dark square (value 20) at the left and a light one (value 200) at the right, on 100.
const W = 7, H = 7;
const raster: Raster = {
  widthPx: W, heightPx: H, channels: 1, bitDepth: 8,
  data: Uint16Array.from({ length: W * H }, (_, i) => { const x = i % W, y = Math.floor(i / W); return y >= 2 && y <= 4 ? (x >= 1 && x <= 2 ? 20 : x >= 4 && x <= 5 ? 200 : 100) : 100; }),
};
const dark: Phase = { id: "phase-1", name: "Dark", colour: "blue", threshold: { mode: "manual", low: 0, high: 50 } };
const light: Phase = { id: "phase-2", name: "Light", colour: "orange", threshold: { mode: "manual", low: 150, high: 255 } };
const thresholdStep = (phases: Phase[] = [dark, light], id = "step-t"): Step => ({ id, type: "threshold", enabled: true, phases });
const mask = (id: string, operation: "erode" | "dilate" | "open" | "close" | "outline" | "fill", iterations = 1, phase?: string): Step =>
  ({ id, type: "mask", enabled: true, operation, iterations, ...(phase ? { phase } : {}) });
const count = (bits: Uint8Array) => bits.reduce((sum, bit) => sum + bit, 0);

test("the working image is the grey result before the Threshold step; the step makes one mask per phase", () => {
  const steps: Step[] = [{ id: "step-1", type: "invert", enabled: true }, thresholdStep()];
  const { raster: working, problems } = applySteps(raster, steps);
  assert.deepEqual(problems, []);
  assert.equal(working.data[0], 255 - 100);
  const phases = stepPhases(steps);
  assert.deepEqual(phases.map((phase) => phase.name), ["Dark", "Light"]);
  // Inverted, the light square (200 → 55) is in neither range; the dark one (20 → 235) and the background (155) are in Light's.
  assert.deepEqual(phases.map((phase) => applyThreshold(working, phase.threshold).count), [0, 43]);
  assert.deepEqual(shapeOf(working), shapeOf(raster));
});

test("a mask step after the Threshold step acts on each phase's mask separately; phases never mix", () => {
  const steps = [thresholdStep(), mask("step-2", "dilate")];
  const working = applySteps(raster, steps).raster;
  const [a, b] = stepPhases(steps).map((phase) => applyThreshold(working, phase.threshold).mask);
  // Each 2 × 3 square grows to 4 × 5 on its own; the gap column x = 3 joins both, as each dilates its own mask.
  assert.equal(count(a), 20);
  assert.equal(count(b), 20);
  assert.deepEqual(a, applyMaskOperations(rangeMask(working, 0, 50), W, H, [{ kind: "dilate", iterations: 1 }]));
  assert.deepEqual(b, applyMaskOperations(rangeMask(working, 150, 255), W, H, [{ kind: "dilate", iterations: 1 }]));
  // Close on the union would bridge the gap column (15 px); on each phase alone there is nothing to bridge.
  const closed = stepPhases([thresholdStep(), mask("step-2", "close")]).map((phase) => applyThreshold(working, phase.threshold).count);
  assert.deepEqual(closed, [6, 6]);
});

test("a mask step that names a phase acts on that phase only; off or after a removed phase, on none", () => {
  const working = raster;
  const counts = (steps: Step[]) => stepPhases(steps).map((phase) => applyThreshold(working, phase.threshold).count);
  assert.deepEqual(counts([thresholdStep(), mask("step-2", "dilate", 1, "phase-2")]), [6, 20]);
  assert.deepEqual(counts([thresholdStep(), { ...mask("step-2", "dilate"), enabled: false }]), [6, 6]);
  const orphan = [thresholdStep(), mask("step-2", "dilate", 1, "phase-9")];
  assert.deepEqual(counts(orphan), [6, 6]);
  assert.match(applySteps(raster, orphan).problems[0].message, /no longer in the Threshold step/);
  // A Threshold step that is off makes no masks, so every pixel is measured.
  assert.deepEqual(stepPhases([{ ...thresholdStep(), enabled: false }, mask("step-2", "dilate")]), []);
});

test("steps on the wrong side of the Threshold step are passed over with their reason", () => {
  const steps: Step[] = [mask("step-1", "erode"), thresholdStep(), { id: "step-3", type: "invert", enabled: true }, thresholdStep([dark], "step-4"), mask("step-5", "dilate")];
  const { raster: working, problems } = applySteps(raster, steps);
  assert.deepEqual(problems.map((problem) => problem.id), ["step-1", "step-3", "step-4"]);
  assert.match(problems[0].message, /Move it below the Threshold step/);
  assert.match(problems[1].message, /only mask steps apply/);
  assert.match(problems[2].message, /one Threshold step/);
  // The invert after the Threshold step did not run, and the mask step before it does not reach the phases.
  assert.deepEqual(working.data, raster.data);
  assert.deepEqual(stepPhases(steps).map((phase) => applyThreshold(working, phase.threshold).count), [20, 20]);
});

test("new steps: a Threshold step with one phase, grey steps placed before it, mask steps after", () => {
  const before = shapeOf(raster);
  const step = newStep("threshold", [], before);
  assert.deepEqual(step.type === "threshold" && step.phases, [{ id: "phase-1", name: "Phase 1", colour: "magenta", threshold: { mode: "otsu", objects: "light" } }]);
  const colour = newStep("threshold", [], { ...before, channels: 3 });
  assert.equal(colour.type === "threshold" && colour.phases[0].threshold.mode, "colour");
  const steps: Step[] = [{ id: "step-1", type: "invert", enabled: true }, thresholdStep(), mask("step-3", "open")];
  assert.equal(insertIndex(steps, "levels"), 1);
  assert.equal(insertIndex(steps, "mask"), 3);
  assert.equal(insertIndex([{ id: "step-1", type: "invert", enabled: true }], "threshold"), 1);
  assert.equal(insertIndex([], "crop"), 0);
});

/** A one-image document as stored before the Threshold step, with `image` fields over the defaults. */
function legacyDocument(fields: Record<string, unknown>): string {
  const project = emptyProject();
  project.images.push(newProjectImage(project, "/lab/a.png", "a.png", { format: "png", widthPx: W, heightPx: H, bitDepth: 8, colour: "grey", channels: 1, bytes: 10, crc32: "00000000", orientation: 1 }, 0, 0));
  const data = JSON.parse(serializeProject(project, "/lab/a.pfg"));
  data.images[0] = { ...data.images[0], steps: [{ id: "step-1", type: "invert", enabled: true }], ...fields };
  return JSON.stringify(data);
}

test("a document with phases opens as a Threshold step and mask steps that make the same masks", () => {
  const phases = [
    { ...dark, threshold: { ...dark.threshold, operations: [{ kind: "dilate", iterations: 1 }] } },
    { ...light, threshold: { ...light.threshold, operations: [{ kind: "open", iterations: 2 }, { kind: "fill", iterations: 1 }] } },
  ];
  const image = parseProject(legacyDocument({ phases }), "/lab/a.pfg").images[0];
  assert.deepEqual(image.steps.map((step) => step.type), ["invert", "threshold", "mask", "mask", "mask"]);
  assert.deepEqual(image.steps.slice(2).map((step) => step.type === "mask" && [step.operation, step.iterations, step.phase]), [["dilate", 1, "phase-1"], ["open", 2, "phase-2"], ["fill", 1, "phase-2"]]);
  assert.equal(new Set(image.steps.map((step) => step.id)).size, image.steps.length);
  // Each phase's threshold, with the mask steps folded in, is the one the document stored.
  assert.deepEqual(stepPhases(image.steps), phases);
  // The same operations on every phase become steps on every phase.
  const shared = phases.map((phase) => ({ ...phase, threshold: { ...phase.threshold, operations: [{ kind: "close", iterations: 1 }] } }));
  const sharedSteps = parseProject(legacyDocument({ phases: shared }), null).images[0].steps;
  assert.deepEqual(sharedSteps.slice(1).map((step) => step.type === "mask" ? `mask ${step.operation} ${step.phase ?? "all"}` : step.type), ["threshold", "mask close all"]);
  assert.deepEqual(stepPhases(sharedSteps), shared);
  // Saved again, the document has no phases beside the steps.
  const again = JSON.parse(serializeProject(parseProject(legacyDocument({ phases }), "/lab/a.pfg"), "/lab/a.pfg"));
  assert.equal(again.images[0].phases, undefined);
  assert.equal(again.images[0].steps[1].phases[1].threshold.operations, undefined);
});

test("a document with one threshold, from before phases, opens as a Threshold step with Phase 1", () => {
  const image = parseProject(legacyDocument({ threshold: { mode: "manual", low: 3, high: 9, operations: [{ kind: "outline" }] }, settings: { maskColour: "cyan" } }), null).images[0];
  assert.deepEqual(image.steps.slice(1), [
    { id: "step-2", type: "threshold", enabled: true, phases: [{ id: "phase-1", name: "Phase 1", colour: "cyan", threshold: { mode: "manual", low: 3, high: 9 } }] },
    { id: "step-3", type: "mask", enabled: true, operation: "outline", iterations: 1 },
  ]);
  assert.deepEqual(parseProject(legacyDocument({}), null).images[0].steps.map((step) => step.type), ["invert"]);
  assert.throws(() => parseProject(legacyDocument({ phases: [{ ...dark, colour: "teal" }] }), null), /unknown colour/);
  assert.throws(() => parseProject(legacyDocument({ threshold: { mode: "manual", low: 5, high: 4 } }), null), /invalid threshold range/);
  // A Threshold step already in the list wins over phases stored beside it.
  assert.deepEqual(withLegacyPhases([thresholdStep([light])], [dark]), [thresholdStep([light])]);
});

test("a results row from before the Threshold step measures the same mask as the opened document's phase", () => {
  const operations = [{ kind: "dilate" as const, iterations: 1 }];
  const old: ResultRecord = {
    imageId: "image-1", imageName: "a", file: "a.png", crc32: "00000000", steps: [{ id: "step-1", type: "invert", enabled: true }],
    threshold: { ...light.threshold, operations }, phase: "Light", roi: null, calibration: null, measured: ["area", "areaFraction"],
  };
  const stored = measureRecord(raster, old);
  const image = parseProject(legacyDocument({ phases: [dark, { ...light, threshold: old.threshold }] }), null).images[0];
  const phase = stepPhases(image.steps).find((item) => item.name === "Light")!;
  const now = measureRecord(raster, { ...old, steps: image.steps, threshold: phase.threshold });
  assert.deepEqual(now, stored);
  const working = applySteps(raster, image.steps).raster;
  assert.equal(stored.mask?.crc32, crc32(applyThreshold(working, phase.threshold).mask));
});
