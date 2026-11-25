// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The .pfg document: round trips byte for byte, relative image paths, validation, write permission and layout.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  contains, describeImage, emptyProject, isWritableProjectPath, newProjectImage, objectAt, parseProject, placeNew, PLACEMENT_GAP_STEPS,
  relativePath, resolvePath, serializeProject, snapValue, newStep, shapeOf, type Project, toBase64, fromBase64,
} from "../../source/engine";

const source = describeImage(new Uint8Array(readFileSync("tests/fixtures/rgb-6x4.png"))).source;

function sample(): Project {
  const project = emptyProject();
  project.images.push(newProjectImage(project, "/Users/lab/run 1/images/cells.png", "cells.png", source, 0, 0));
  project.images.push(newProjectImage(project, "/Users/lab/shared/cells.png", "cells.png", source, 48, 16));
  // The first image carries one step of every type, one of them disabled.
  const shape = { widthPx: 6, heightPx: 4, channels: 3 as const, bitDepth: 8 as const };
  const steps = project.images[0].steps;
  for (const type of ["grey", "8-bit", "crop", "rotate", "flip", "levels", "invert"] as const) steps.push(newStep(type, steps, shape));
  steps[2].enabled = false;
  return project;
}

test("a document round-trips: text to project to the same text, byte for byte", () => {
  const text = serializeProject(sample(), "/Users/lab/run 1/plate.pfg");
  const again = serializeProject(parseProject(text, "/Users/lab/run 1/plate.pfg"), "/Users/lab/run 1/plate.pfg");
  assert.equal(again, text);
  assert.deepEqual(parseProject(text, "/Users/lab/run 1/plate.pfg"), sample());
});

test("image paths are stored relative to the document's folder, with forward slashes", () => {
  const data = JSON.parse(serializeProject(sample(), "/Users/lab/run 1/plate.pfg"));
  assert.deepEqual(data.images.map((image: { path: string }) => image.path), ["images/cells.png", "../shared/cells.png"]);
  assert.equal(data.format, "plotforge");
  assert.equal(data.version, 2);
  // Moved with its folder, the document finds its images in the new place.
  const moved = parseProject(serializeProject(sample(), "/Users/lab/run 1/plate.pfg"), "/Volumes/Backup/run 1/plate.pfg");
  assert.equal(moved.images[0].path, "/Volumes/Backup/run 1/images/cells.png");
});

test("relative paths: same folder, below, above, Windows drives and another drive", () => {
  assert.equal(relativePath("/a/b", "/a/b/c.png"), "c.png");
  assert.equal(relativePath("/a/b", "/a/c/d.png"), "../c/d.png");
  assert.equal(relativePath("/a/b", "/x.png"), "../../x.png");
  assert.equal(relativePath("C:\\Data\\Run", "c:\\data\\run\\img\\a.tif"), "img/a.tif");
  assert.equal(relativePath("C:\\Data", "D:\\a.tif"), "D:\\a.tif");
  assert.equal(resolvePath("/a/b", "../c/d.png"), "/a/c/d.png");
  assert.equal(resolvePath("/a/b", "/abs.png"), "/abs.png");
  assert.equal(resolvePath("C:\\Data\\Run", "img/a.tif"), "C:\\Data\\Run\\img\\a.tif");
  // Going above the root stops at the root.
  assert.equal(resolvePath("/a", "../../x.png"), "/x.png");
});

test("names and ids stay unique as images are added", () => {
  const project = sample();
  assert.deepEqual(project.images.map((image) => [image.id, image.name]), [["image-1", "cells"], ["image-2", "cells 2"]]);
  project.images.splice(0, 1);
  const third = newProjectImage(project, null, "cells.png", source, 0, 0);
  assert.equal(third.name, "cells");
  assert.notEqual(third.id, "image-2");
});

test("an empty file, as Explorer's New menu makes, opens as a blank document", () => {
  assert.deepEqual(parseProject("", null), emptyProject());
  assert.deepEqual(parseProject(" \n", null), emptyProject());
});

test("a document that is not PlotForge's, is newer, or is damaged is refused with a sentence", () => {
  assert.throws(() => parseProject("not json", null), /not valid JSON/);
  assert.throws(() => parseProject(JSON.stringify({ format: "other", version: 1 }), null), /not a PlotForge document/);
  assert.throws(() => parseProject(JSON.stringify({ format: "plotforge", version: 3 }), null), /newer PlotForge \(format 3\)/);
  assert.doesNotThrow(() => parseProject(JSON.stringify({ format: "plotforge", version: 2 }), null));
  assert.doesNotThrow(() => parseProject(JSON.stringify({ format: "plotforge", version: 1 }), null));
  assert.throws(() => parseProject(JSON.stringify({ format: "plotforge", version: 0 }), null), /no valid version/);
  const bad = JSON.parse(serializeProject(sample(), null));
  bad.images[0].x = "left";
  assert.throws(() => parseProject(JSON.stringify(bad), null), /invalid image position/);
  bad.images[0].x = 0; bad.images[1].id = bad.images[0].id;
  assert.throws(() => parseProject(JSON.stringify(bad), null), /same id/);
});

test("only a .pfg path may be written; an image path never", () => {
  for (const path of ["/a/plate.pfg", "/a/PLATE.PFG", "C:\\a\\b.pfg"]) assert.ok(isWritableProjectPath(path), path);
  for (const path of ["/a/cells.png", "/a/cells.tif", "/a/cells.jpg", "/a/plate.pfg.png", "/a/pfg", "/a/plate.pf"]) assert.ok(!isWritableProjectPath(path), path);
});

// MARK: layout

test("snapping takes the nearest grid point, halves rounding up", () => {
  assert.equal(snapValue(7.9, 16), 0);
  assert.equal(snapValue(8, 16), 16);
  assert.equal(snapValue(-8.1, 16), -16);
  assert.equal(snapValue(24, 16), 32);
});

test("an image owns its left and top edges, not its right and bottom ones", () => {
  const box = { x: 10, y: 20, width: 6, height: 4 };
  assert.ok(contains(box, 10, 20));
  assert.ok(contains(box, 15.99, 23.99));
  assert.ok(!contains(box, 16, 20));
  assert.ok(!contains(box, 10, 24));
  assert.ok(!contains(box, 9.99, 20));
});

test("the topmost image is the one picked where images overlap", () => {
  const images = [{ id: "a", x: 0, y: 0, width: 10, height: 10 }, { id: "b", x: 5, y: 5, width: 10, height: 10 }];
  assert.equal(objectAt(images, 6, 6)?.id, "b");
  assert.equal(objectAt(images, 2, 2)?.id, "a");
  assert.equal(objectAt(images, 20, 20), null);
});

test("a new image goes at the origin, then right of the others with a gap, on the grid", () => {
  assert.deepEqual(placeNew([], 16), { x: 0, y: 0 });
  assert.deepEqual(placeNew([{ x: 0, y: 0, width: 100, height: 50 }], 16), { x: 112 + PLACEMENT_GAP_STEPS * 16, y: 0 });
  assert.deepEqual(placeNew([{ x: 0, y: 0, width: 96, height: 50 }], 16), { x: 96 + PLACEMENT_GAP_STEPS * 16, y: 0 });
});

// MARK: steps in the document (format 2)

test("a version 1 document opens with no steps, and is written as version 2 with its steps", () => {
  const v2 = JSON.parse(serializeProject(sample(), "/Users/lab/run 1/plate.pfg"));
  const v1 = { ...v2, version: 1, images: v2.images.map(({ steps, ...image }: { steps: unknown }) => image) };
  const opened = parseProject(JSON.stringify(v1), "/Users/lab/run 1/plate.pfg");
  assert.deepEqual(opened.images.map((image) => image.steps), [[], []]);
  assert.equal(JSON.parse(serializeProject(opened, null)).version, 2);
});

test("steps are stored in order with their enabled flags and parameters", () => {
  const data = JSON.parse(serializeProject(sample(), "/Users/lab/run 1/plate.pfg"));
  assert.deepEqual(data.images[0].steps.map((step: { type: string }) => step.type), ["grey", "8-bit", "crop", "rotate", "flip", "levels", "invert"]);
  assert.deepEqual(data.images[0].steps.map((step: { enabled: boolean }) => step.enabled), [true, true, false, true, true, true, true]);
  assert.deepEqual(data.images[0].steps[2], { id: "step-3", type: "crop", enabled: false, x: 0, y: 0, width: 6, height: 4 });
  assert.deepEqual(data.images[1].steps, []);
});

test("a damaged step is refused with a sentence", () => {
  const data = JSON.parse(serializeProject(sample(), null));
  const withStep = (step: unknown) => JSON.stringify({ ...data, images: [{ ...data.images[0], steps: [step] }] });
  assert.throws(() => parseProject(withStep({ id: "s", type: "blur" }), null), /unknown type \(blur\)/);
  assert.throws(() => parseProject(withStep({ id: "s", type: "rotate", quarterTurns: 4 }), null), /rotate step has an invalid quarterTurns/);
  assert.throws(() => parseProject(withStep({ id: "s", type: "grey", method: "hue" }), null), /grey step has an invalid method/);
  assert.throws(() => parseProject(withStep({ id: "s", type: "levels", black: 0, white: "255", gamma: 1 }), null), /levels step has an invalid white/);
  assert.throws(() => parseProject(withStep({ type: "invert" }), null), /step without an id/);
  assert.throws(() => parseProject(JSON.stringify({ ...data, images: [{ ...data.images[0], steps: {} }] }), null), /invalid step list/);
  assert.throws(() => parseProject(JSON.stringify({ ...data, images: [{ ...data.images[0], steps: [{ id: "a", type: "invert" }, { id: "a", type: "invert" }] }] }), null), /two steps with the same id/);
  // A step stored without its enabled flag is enabled.
  assert.equal(parseProject(withStep({ id: "s", type: "invert" }), null).images[0].steps[0].enabled, true);
});

test("new steps take unique ids and the defaults of the image they receive", () => {
  const shape = shapeOf({ widthPx: 9, heightPx: 7, channels: 1, bitDepth: 16, data: new Uint16Array(63) });
  const steps = [newStep("crop", [], shape)];
  assert.deepEqual(steps[0], { id: "step-1", enabled: true, type: "crop", x: 0, y: 0, width: 9, height: 7 });
  steps.push(newStep("levels", steps, shape));
  assert.deepEqual(steps[1], { id: "step-2", enabled: true, type: "levels", black: 0, white: 65535, gamma: 1 });
  steps.splice(0, 1);
  assert.equal(newStep("invert", steps, shape).id, "step-3");
});

test("base64 round-trips every length and refuses what is not base64", () => {
  for (let n = 0; n < 8; n++) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 13) % 256);
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  }
  assert.equal(toBase64(new TextEncoder().encode("Man")), "TWFu");
  assert.equal(toBase64(new TextEncoder().encode("Ma")), "TWE=");
  assert.equal(fromBase64("TWF"), null);
  assert.equal(fromBase64("TW@u"), null);
});

test("a pasted image is kept inside the document, has no path, and a damaged copy is refused", () => {
  const bytes = new Uint8Array(readFileSync("tests/fixtures/rgb-6x4.png"));
  const project = emptyProject();
  const image = newProjectImage(project, null, "Pasted.png", describeImage(bytes).source, 0, 0);
  image.embedded = bytes;
  project.images.push(image);
  const text = serializeProject(project, "/lab/a.pfg");
  const saved = JSON.parse(text).images[0];
  assert.equal(saved.path, null);
  assert.equal(saved.file, "Pasted.png");
  const reopened = parseProject(text, "/lab/b/c.pfg").images[0];
  assert.equal(reopened.path, null);
  assert.equal(reopened.name, "Pasted");
  assert.deepEqual(reopened.embedded, bytes);
  assert.equal(serializeProject(parseProject(text, "/lab/a.pfg"), "/lab/a.pfg"), text);
  const damaged = JSON.parse(text);
  damaged.images[0].embedded = toBase64(bytes.map((b, i) => (i === 40 ? b ^ 1 : b)));
  assert.throws(() => parseProject(JSON.stringify(damaged), "/lab/a.pfg"), /damaged/);
});
