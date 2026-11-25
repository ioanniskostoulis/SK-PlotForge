// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Regions of interest: exact areas of analytic shapes, masks that agree with them, the pixel-centre rule on both sides
// of an edge, perimeters and lengths with and without calibration, validation, and save and reopen byte for byte.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  boxFrom, describeImage, directScale, emptyProject, knownLength, maskCount, newProjectImage, newRoiId, newRoiName, parseProject, PIXELS, polygonArea,
  roiArea, roiAreaPx, roiContains, roiHit, roiMask, roiPerimeter, roiProblem, scaleOf, serializeProject, type Point, type Roi,
} from "../../source/engine";

const close = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);
const rect = (x: number, y: number, width: number, height: number): Roi => ({ id: "r", name: "Rectangle 1", type: "rectangle", x, y, width, height });
const ellipse = (x: number, y: number, width: number, height: number): Roi => ({ id: "e", name: "Ellipse 1", type: "ellipse", x, y, width, height });
const polygon = (points: Point[], type: "polygon" | "freehand" = "polygon"): Roi => ({ id: "p", name: "Polygon 1", type, points });
const line = (a: Point, b: Point): Roi => ({ id: "l", name: "Line 1", type: "line", points: [a, b] });
const shape = { widthPx: 200, heightPx: 150 };

// MARK: exact areas

test("exact areas: w · h, π · a · b, and the shoelace formula", () => {
  assert.equal(roiAreaPx(rect(3, 4, 10, 20)), 200);
  close(roiAreaPx(ellipse(0, 0, 40, 20)), Math.PI * 20 * 10);
  // A right triangle with legs 30 and 40: 600 px².
  assert.equal(roiAreaPx(polygon([[0, 0], [30, 0], [0, 40]])), 600);
  // The order of the points, clockwise or not, does not change the area.
  assert.equal(polygonArea([[0, 40], [30, 0], [0, 0]]), 600);
  // A concave L of six points: 20 × 20 less a 10 × 10 corner.
  assert.equal(roiAreaPx(polygon([[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]], "freehand")), 300);
  assert.equal(roiAreaPx(line([0, 0], [3, 4])), 0);
});

// MARK: masks against the exact areas

test("a rectangle on whole pixels covers exactly w · h pixels", () => {
  assert.equal(maskCount(roiMask(rect(10, 20, 30, 40), shape)!), 1200);
});

test("the pixel-centre rule on both sides of an edge", () => {
  // A centre at 10.5 is inside [10, 11) and inside [10.5, …) but not [10.51, …).
  assert.equal(maskCount(roiMask(rect(10, 10, 1, 1), shape)!), 1);
  assert.equal(maskCount(roiMask(rect(10.5, 10, 1, 1), shape)!), 1);
  assert.equal(maskCount(roiMask(rect(10.51, 10, 0.98, 1), shape)!), 0); // [10.51, 11.49) holds neither 10.5 nor 11.5
  // The right edge is open: a box ending exactly on a centre leaves that pixel out.
  assert.equal(maskCount(roiMask(rect(10, 10, 0.5, 1), shape)!), 0);
  assert.equal(maskCount(roiMask(rect(10, 10, 0.51, 1), shape)!), 1);
  assert.ok(roiContains(rect(10, 10, 5, 5), 10, 10));
  assert.ok(!roiContains(rect(10, 10, 5, 5), 15, 10));
});

test("an ellipse's mask matches π · a · b to within its boundary pixels", () => {
  for (const [w, h] of [[100, 100], [160, 60], [41, 23]] as const) {
    const exact = roiAreaPx(ellipse(20, 30, w, h));
    const counted = maskCount(roiMask(ellipse(20, 30, w, h), shape)!);
    // The error of the centre rule is bounded by the pixels the outline crosses, about its length in pixels.
    const bound = roiPerimeter(ellipse(20, 30, w, h), PIXELS);
    assert.ok(Math.abs(counted - exact) <= bound / 2, `${w} × ${h}: ${counted} against ${exact.toFixed(1)}`);
  }
  // A large circle comes within 0.5 % of π r².
  const big = ellipse(0, 0, 140, 140);
  assert.ok(Math.abs(maskCount(roiMask(big, shape)!) / roiAreaPx(big) - 1) < 0.005);
});

test("a polygon's mask matches its shoelace area: exactly for a right triangle on the pixel grid", () => {
  // Legs of 100 on the grid: centres are inside when x + y < 100, so 1 + 2 + … + 99 + the diagonal half pixels give 4950.
  const triangle = polygon([[0, 0], [100, 0], [0, 100]]);
  assert.equal(maskCount(roiMask(triangle, shape)!), 4950);
  assert.equal(roiAreaPx(triangle), 5000);
  // The concave L covers its 300 px² exactly.
  assert.equal(maskCount(roiMask(polygon([[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]]), shape)!), 300);
});

test("parts of a region outside the image are left out of its mask; a line has no mask", () => {
  assert.equal(maskCount(roiMask(rect(-10, -10, 20, 20), shape)!), 100);
  assert.equal(maskCount(roiMask(rect(190, 140, 50, 50), shape)!), 100);
  assert.equal(maskCount(roiMask(rect(300, 0, 10, 10), shape)!), 0);
  assert.equal(roiMask(line([0, 0], [10, 10]), shape), null);
});

// MARK: lengths and calibration

test("perimeters and lengths: rectangle, circle (2πr), polygon, line", () => {
  assert.equal(roiPerimeter(rect(0, 0, 10, 20), PIXELS), 60);
  close(roiPerimeter(ellipse(0, 0, 20, 20), PIXELS), 2 * Math.PI * 10);
  // Ramanujan's approximation against a long ellipse (a = 10, b = 1), whose perimeter by numerical integration of the
  // complete elliptic integral is 40.639742: 40.639272, 1.2 · 10⁻⁵ relative.
  close(roiPerimeter(ellipse(0, 0, 20, 2), PIXELS), 40.639742, 1.5e-5);
  close(roiPerimeter(ellipse(0, 0, 20, 2), PIXELS), 40.639272, 1e-6);
  assert.equal(roiPerimeter(polygon([[0, 0], [3, 0], [3, 4]]), PIXELS), 12);
  assert.equal(roiPerimeter(line([0, 0], [3, 4]), PIXELS), 5);
});

test("calibration scales areas and lengths and leaves the mask alone", () => {
  const scale = scaleOf(knownLength(100, 10, "µm", 2)); // 0.1 µm wide, 0.2 µm tall
  const box = rect(10, 10, 30, 20);
  close(roiArea(box, scale), 600 * 0.1 * 0.2);
  close(roiPerimeter(box, scale), 2 * (3 + 4));
  close(roiPerimeter(line([0, 0], [30, 20]), scale), 5);
  const mask = [...roiMask(box, shape)!];
  for (const other of [PIXELS, scaleOf(directScale(7, "mm"))]) assert.deepEqual([...roiMask(box, shape)!], mask, JSON.stringify(other));
});

// MARK: checking, names, hits

test("a region needs a size, three distinct points or two for a line; 0 is refused, a little more is not", () => {
  assert.equal(roiProblem(rect(0, 0, 1e-6, 1)), null);
  assert.match(roiProblem(rect(0, 0, 0, 1))!, /width and a height above 0/);
  assert.match(roiProblem(ellipse(0, 0, 5, -1))!, /above 0/);
  assert.match(roiProblem(rect(NaN, 0, 1, 1))!, /invalid position/);
  assert.equal(roiProblem(polygon([[0, 0], [1, 0], [0, 1]])), null);
  assert.match(roiProblem(polygon([[0, 0], [1, 0], [1, 0]]))!, /three different points/);
  assert.match(roiProblem(polygon([[0, 0], [1, 1], [2, 2]]))!, /encloses no area/);
  assert.equal(roiProblem(line([0, 0], [0, 1e-9])), null);
  assert.match(roiProblem(line([1, 1], [1, 1]))!, /two different points/);
});

test("new regions take the first free name and a unique id; a box is the same whichever way it is dragged", () => {
  const rois: Roi[] = [rect(0, 0, 1, 1), { ...rect(0, 0, 1, 1), id: "roi-2", name: "Rectangle 3" }];
  assert.equal(newRoiName("rectangle", rois), "Rectangle 2");
  assert.equal(newRoiName("line", rois), "Line 1");
  assert.equal(newRoiId([{ ...rect(0, 0, 1, 1), id: "roi-3" }, { ...rect(0, 0, 1, 1), id: "roi-2" }]), "roi-4");
  assert.deepEqual(boxFrom([10, 20], [4, 2]), { x: 4, y: 2, width: 6, height: 18 });
  assert.deepEqual(boxFrom([4, 2], [10, 20]), boxFrom([10, 20], [4, 2]));
});

test("a click takes a region on its outline, never inside it", () => {
  assert.ok(roiHit(ellipse(0, 0, 10, 10), 10, 5, 0.01));
  assert.ok(roiHit(ellipse(0, 0, 10, 10), 5, 1, 1));
  assert.ok(!roiHit(ellipse(0, 0, 10, 10), 5, 5, 2));
  assert.ok(!roiHit(ellipse(0, 0, 10, 10), 0.5, 0.5, 0.5));
  assert.ok(roiHit(rect(0, 0, 10, 10), 5, 0.5, 1));
  assert.ok(roiHit(rect(0, 0, 10, 10), 11, 5, 1));
  assert.ok(!roiHit(rect(0, 0, 10, 10), 5, 5, 1));
  assert.ok(roiHit(line([0, 0], [10, 0]), 5, 2, 2));
  assert.ok(!roiHit(line([0, 0], [10, 0]), 5, 2.01, 2));
  assert.ok(!roiHit(line([0, 0], [10, 0]), 13, 0, 2));
});

// MARK: in the document

test("regions survive save and reopen byte for byte, with their names and order", () => {
  const source = describeImage(new Uint8Array(readFileSync("tests/fixtures/rgb-6x4.png"))).source;
  const project = emptyProject();
  const image = newProjectImage(project, "/lab/a.png", "a.png", source, 0, 0);
  image.rois = [rect(1, 1, 2.5, 2), { ...ellipse(0, 0, 4, 3), id: "e2" }, { ...polygon([[0, 0], [5, 0], [5, 3.25]]), id: "p2" },
    { ...polygon([[0, 0], [1, 0.5], [2, 2], [0.5, 3]], "freehand"), id: "f2", name: "Freehand 1" }, { ...line([0, 0], [5.5, 3]), id: "l2" }];
  project.images.push(image);
  const text = serializeProject(project, "/lab/a.pfg");
  const reopened = parseProject(text, "/lab/a.pfg");
  assert.equal(serializeProject(reopened, "/lab/a.pfg"), text);
  assert.deepEqual(reopened.images[0].rois, image.rois);
  // A document without regions opens with none.
  assert.deepEqual(parseProject(JSON.stringify({ format: "plotforge", version: 1, images: [] }), null).images, []);
});

test("a damaged region is refused with a sentence", () => {
  const source = describeImage(new Uint8Array(readFileSync("tests/fixtures/rgb-6x4.png"))).source;
  const project = emptyProject();
  project.images.push(newProjectImage(project, "/lab/a.png", "a.png", source, 0, 0));
  const data = JSON.parse(serializeProject(project, null));
  const withRois = (rois: unknown) => JSON.stringify({ ...data, images: [{ ...data.images[0], rois }] });
  assert.throws(() => parseProject(withRois([{ id: "a", name: "A", type: "star" }]), null), /unknown type \(star\)/);
  assert.throws(() => parseProject(withRois([{ id: "a", name: "A", type: "rectangle", x: 0, y: 0, width: 0, height: 1 }]), null), /region A is not valid/);
  assert.throws(() => parseProject(withRois([{ id: "a", name: "A", type: "line", points: [[0, 0]] }]), null), /two different points/);
  assert.throws(() => parseProject(withRois([{ name: "A", type: "line" }]), null), /without an id/);
  assert.throws(() => parseProject(withRois({}), null), /invalid region list/);
  const twice = { id: "a", name: "A", type: "rectangle", x: 0, y: 0, width: 1, height: 1 };
  assert.throws(() => parseProject(withRois([twice, twice]), null), /two regions with the same id/);
});
