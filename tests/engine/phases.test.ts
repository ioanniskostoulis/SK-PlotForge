// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Phases: new phases take free names and colours, names are checked, overlap and unassigned pixels are counted on
// hand-built masks, Over/Under classes both sides of each bound, and phases round-trip in the document, a document
// from before phases opening its one threshold as Phase 1.
import assert from "node:assert/strict";
import test from "node:test";
import { emptyProject, newPhase, newProjectImage, overUnder, parseProject, phaseCoverage, phaseNameProblem, PHASE_COLOURS, serializeProject, stepPhases, type Phase, type Raster } from "../../source/engine";

const manual = { mode: "manual" as const, low: 0, high: 100 };

test("a new phase takes the next free name and id, the preferred colour when free, else the first free one", () => {
  const first = newPhase([], manual, "orange");
  assert.deepEqual([first.id, first.name, first.colour], ["phase-1", "Phase 1", "orange"]);
  const second = newPhase([first], manual, "orange");
  assert.deepEqual([second.id, second.name, second.colour], ["phase-2", "Phase 2", "magenta"]);
  // Every colour taken: the colours cycle.
  const all: Phase[] = PHASE_COLOURS.map((colour, i) => ({ id: `p${i}`, name: `P${i}`, colour, threshold: manual }));
  assert.equal(newPhase(all, manual).colour, PHASE_COLOURS[all.length % PHASE_COLOURS.length]);
  assert.equal(newPhase([{ ...first, name: "Phase 2" }], manual).name, "Phase 3");
});

test("phase names need text, at most 60 characters, and differ from the others ignoring case", () => {
  const others: Phase[] = [{ id: "a", name: "Primary", colour: "magenta", threshold: manual }];
  assert.equal(phaseNameProblem("Secondary", others), null);
  assert.match(phaseNameProblem("  ", others)!, /needs a name/);
  assert.match(phaseNameProblem("primary", others)!, /already called/);
  assert.equal(phaseNameProblem("x".repeat(60), others), null);
  assert.match(phaseNameProblem("x".repeat(61), others)!, /at most 60/);
});

test("coverage counts pixels in two or more phases and in none", () => {
  const a = Uint8Array.from([1, 1, 0, 0, 1]), b = Uint8Array.from([0, 1, 1, 0, 1]), c = Uint8Array.from([0, 0, 0, 0, 1]);
  assert.deepEqual(phaseCoverage([a, b], 5), { overlap: 2, unassigned: 1 });
  assert.deepEqual(phaseCoverage([a, b, c], 5), { overlap: 2, unassigned: 1 });
  assert.deepEqual(phaseCoverage([], 5), { overlap: 0, unassigned: 5 });
});

test("Over/Under: below the low end 1, above the high end 2, both ends in the range", () => {
  const raster: Raster = { widthPx: 6, heightPx: 1, channels: 1, bitDepth: 8, data: Uint16Array.from([0, 49, 50, 150, 151, 255]) };
  assert.deepEqual([...overUnder(raster, 50, 150)], [1, 1, 0, 0, 2, 2]);
  assert.deepEqual([...overUnder(raster, 0, 255)], [0, 0, 0, 0, 0, 0]);
});

test("phases round-trip in the Threshold step; bad phases are refused", () => {
  const project = emptyProject();
  const image = newProjectImage(project, "/data/a.png", "a.png", { format: "png", widthPx: 2, heightPx: 1, bitDepth: 8, colour: "grey", channels: 1, bytes: 10, crc32: "00000000", orientation: 1 }, 0, 0);
  const phases: Phase[] = [
    { id: "phase-1", name: "Primary", colour: "green", threshold: { mode: "otsu", objects: "dark" } },
    { id: "phase-2", name: "Secondary", colour: "orange", threshold: { mode: "manual", low: 150, high: 255 } },
  ];
  image.steps = [
    { id: "step-1", type: "threshold", enabled: true, phases },
    { id: "step-2", type: "mask", enabled: true, operation: "open", iterations: 2, phase: "phase-2" },
  ];
  image.maskDisplay = "bw";
  project.images.push(image);
  const text = serializeProject(project, "/data/a.pfg");
  const back = parseProject(text, "/data/a.pfg").images[0];
  assert.deepEqual(back.steps, image.steps);
  assert.deepEqual(stepPhases(back.steps).map((phase) => phase.threshold), [phases[0].threshold, { ...phases[1].threshold, operations: [{ kind: "open", iterations: 2 }] }]);
  assert.equal(back.maskDisplay, "bw");
  assert.equal(serializeProject(parseProject(text, "/data/a.pfg"), "/data/a.pfg"), text);
  const data = JSON.parse(text);
  // An outline colour from before regions took the shell's palette opens, and is dropped.
  const outlined = { ...data, images: [{ ...data.images[0], settings: { maskColour: "cyan", outlineColour: "white" } }] };
  assert.deepEqual(parseProject(JSON.stringify(outlined), null).images[0].settings, { maskColour: "cyan" });
  assert.throws(() => parseProject(text.replace('"colour": "green"', '"colour": "teal"'), null), /unknown colour/);
  assert.throws(() => parseProject(text.replace('"id": "phase-2"', '"id": "phase-1"'), null), /same id/);
  assert.throws(() => parseProject(text.replace('"maskDisplay": "bw"', '"maskDisplay": "grey"'), null), /mask display/);
  assert.throws(() => parseProject(text.replace('"operation": "open"', '"operation": "shrink"'), null), /mask step has an invalid operation/);
});
