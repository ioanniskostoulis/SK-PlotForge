// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Overlay text (roadmap I14): labels are checked, kept with their image in the document and read back the same.
import assert from "node:assert/strict";
import test from "node:test";
import { emptyProject, LABEL_MAX_LENGTH, labelProblem, newLabelId, newProjectImage, parseProject, serializeProject } from "../../source/engine";

test("a label needs a position and text of at most the limit", () => {
  assert.equal(labelProblem({ x: 0, y: 0, text: "Grain 1" }), null);
  assert.match(labelProblem({ x: Number.NaN, y: 0, text: "A" })!, /position/);
  assert.match(labelProblem({ x: 0, y: 0, text: "  " })!, /some text/);
  assert.equal(labelProblem({ x: 0, y: 0, text: "x".repeat(LABEL_MAX_LENGTH) }), null);
  assert.match(labelProblem({ x: 0, y: 0, text: "x".repeat(LABEL_MAX_LENGTH + 1) })!, /at most/);
  assert.equal(newLabelId([{ id: "label-1", x: 0, y: 0, text: "a" }]), "label-2");
});

test("labels and a density standard are saved with the image and read back the same", () => {
  const project = emptyProject();
  const image = newProjectImage(project, "/data/a.png", "a.png", { format: "png", widthPx: 2, heightPx: 1, bitDepth: 8, colour: "grey", channels: 1, bytes: 10, crc32: "00000000", orientation: 1 }, 0, 0);
  image.labels = [{ id: "label-1", x: 12.5, y: 40, text: "Grain, 1 \"a\"" }];
  image.density = { fit: "linear", points: [{ grey: 10, od: 2 }, { grey: 200, od: 0.1 }] };
  project.images.push(image);
  const text = serializeProject(project, "/data/a.pfg");
  const back = parseProject(text, "/data/a.pfg").images[0];
  assert.deepEqual(back.labels, image.labels);
  assert.deepEqual(back.density, image.density);
  assert.equal(serializeProject(parseProject(text, "/data/a.pfg"), "/data/a.pfg"), text);
  assert.throws(() => parseProject(text.replace('"text": "Grain', '"text": "   ", "x2": "'), "/data/a.pfg"), /invalid label/);
  assert.throws(() => parseProject(text.replace('"fit": "linear"', '"fit": "cubic"'), "/data/a.pfg"), /density standard/);
});
