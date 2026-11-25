// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The convex hull of a region (roadmap I23) and Save XY coordinates (roadmap I26), on hand-built shapes and images.
import assert from "node:assert/strict";
import test from "node:test";
import { convexHull, hullOf, MAX_XY_PIXELS, xyCoordinatesCsv, xyProblem, type Raster, type Roi } from "../../source/engine";

const grey = (width: number, values: number[]): Raster => ({ widthPx: width, heightPx: values.length / width, channels: 1, bitDepth: 8, data: Uint16Array.from(values) });

test("the convex hull drops inner and collinear points, keeping the corners", () => {
  // A square with a point inside, one on an edge and one repeated.
  const hull = convexHull([[0, 0], [4, 0], [2, 0], [4, 4], [0, 4], [2, 2], [0, 0]]);
  assert.equal(hull.length, 4);
  assert.deepEqual(new Set(hull.map((p) => p.join(","))), new Set(["0,0", "4,0", "4,4", "0,4"]));
  // A dart (concave) loses its notch.
  assert.deepEqual(new Set(convexHull([[0, 0], [4, 2], [0, 4], [1, 2]]).map((p) => p.join(","))), new Set(["0,0", "4,2", "0,4"]));
});

test("a hull is made of polygon and freehand regions only", () => {
  const polygon: Roi = { id: "r", name: "Polygon 1", type: "polygon", points: [[0, 0], [4, 2], [0, 4], [1, 2]] };
  assert.equal(hullOf(polygon)!.length, 3);
  assert.equal(hullOf({ ...polygon, type: "freehand" })!.length, 3);
  assert.equal(hullOf({ id: "r", name: "Rectangle 1", type: "rectangle", x: 0, y: 0, width: 2, height: 2 }), null);
  assert.equal(hullOf({ ...polygon, type: "line", points: [[0, 0], [1, 1]] }), null);
});

test("XY coordinates: every pixel in reading order, or the region's only; colour has three value columns", () => {
  const image = grey(2, [5, 6, 7, 8]);
  assert.deepEqual(xyCoordinatesCsv(image, null), { csv: "X,Y,Value\r\n0,0,5\r\n1,0,6\r\n0,1,7\r\n1,1,8\r\n", pixels: 4 });
  assert.deepEqual(xyCoordinatesCsv(image, Uint8Array.from([0, 1, 1, 0])), { csv: "X,Y,Value\r\n1,0,6\r\n0,1,7\r\n", pixels: 2 });
  const colour: Raster = { widthPx: 1, heightPx: 1, channels: 3, bitDepth: 8, data: Uint16Array.from([1, 2, 3]) };
  assert.equal(xyCoordinatesCsv(colour, null).csv, "X,Y,Red,Green,Blue\r\n0,0,1,2,3\r\n");
});

test("XY coordinates refuse an empty region and more pixels than the limit", () => {
  const image = grey(2, [5, 6, 7, 8]);
  assert.equal(xyProblem(image, null), null);
  assert.match(xyProblem(image, new Uint8Array(4))!, /no pixel/);
  const big = { widthPx: MAX_XY_PIXELS + 1, heightPx: 1, channels: 1, bitDepth: 8, data: new Uint16Array(0) } as Raster;
  assert.match(xyProblem(big, null)!, /smaller region/);
});
