// Licensed under the GNU General Public License v2 or later. See LICENSE.
// An image turned on the work surface: its angle is placement only, kept with the document, and its box is hit and
// framed as it is drawn.
import assert from "node:assert/strict";
import test from "node:test";
import { contains, keepTurnedPlace, turnPoint, emptyProject, newProjectImage, normalAngle, objectAt, parseProject, serializeProject, turnedBounds, unturn, type ImageSource } from "../../source/engine";

const box = { x: 0, y: 0, width: 200, height: 100 };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("a turned box is hit in its own frame, about its centre", () => {
  const turned = { ...box, angle: 90 };
  // Turned a quarter clockwise, the 200 × 100 box stands 100 wide and 200 high about its centre (100, 50).
  assert.ok(contains(turned, 100, -40), "above the upright box, inside the turned one");
  assert.ok(!contains(turned, 10, 50), "inside the upright box, outside the turned one");
  assert.equal(objectAt([turned], 100, 140), turned);
  const [x, y] = unturn(turned, 100, -40);
  assert.ok(near(x, 10) && near(y, 50), "a point turned back lands where the upright box has it");
});

test("a turned box is framed by the upright box around it", () => {
  const b = turnedBounds({ ...box, angle: 90 });
  assert.ok(near(b.x, 50) && near(b.y, -50) && near(b.width, 100) && near(b.height, 200));
  assert.deepEqual(turnedBounds(box), box, "an upright box is its own bounds");
});

test("angles are kept one way, from −180 to 180", () => {
  assert.equal(normalAngle(370), 10);
  assert.equal(normalAngle(-190), 170);
  assert.equal(normalAngle(180), 180);
});

test("an image's angle is saved only when it is turned, and read back", () => {
  const source: ImageSource = { format: "png", widthPx: 20, heightPx: 10, bitDepth: 8, colour: "grey", channels: 1, bytes: 100, crc32: "00000000", orientation: 1 };
  const project = emptyProject();
  project.images.push(newProjectImage(project, "/lab/a.png", "a.png", source, 0, 0));
  assert.ok(!("angle" in JSON.parse(serializeProject(project, "/lab/p.pfg")).images[0]), "an upright image keeps no angle");
  project.images[0].angle = -12.5;
  const again = parseProject(serializeProject(project, "/lab/p.pfg"), "/lab/p.pfg");
  assert.equal(again.images[0].angle, -12.5);
});

test("a turned image cropped keeps what it shows where it was on the surface", () => {
  // Content at upright (60, 40) of a 200 × 100 image turned 30°; the crop keeps the part from (40, 20), 100 × 60.
  const before = { x: 0, y: 0, width: 200, height: 100 }, angle = 30;
  const shown = (box: { x: number; y: number; width: number; height: number }, px: number, py: number) => turnPoint(px, py, box.x + box.width / 2, box.y + box.height / 2, angle);
  const [wx, wy] = shown(before, 60, 40);
  const after = { x: 40, y: 20, width: 100, height: 60, angle };
  keepTurnedPlace(after, before);
  // The same content is at (20, 20) of the crop, so at upright (after.x + 20, after.y + 20).
  const [ax, ay] = shown(after, after.x + 20, after.y + 20);
  assert.ok(near(ax, wx) && near(ay, wy), `${ax}, ${ay} is ${wx}, ${wy}`);
});
