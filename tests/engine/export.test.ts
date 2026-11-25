// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Export: the PNG writer reads back to the same samples at every depth and colour (and Pillow agrees, see below),
// exported files take free names, and an original is never a target.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import test from "node:test";
import { exportProblem } from "forge-shell/app/export-plan";
import { applySteps, crc32, decodeImage, decodePng, DEFAULT_EXPORT, scaleBarFor, scaleBarNumber, scaleBarTicks, encodePng, EXPORT_FORMAT_LIST, exportFileNameAs, newStep, shapeOf, toRgb8, type PngImage, type Raster } from "../../source/engine";

const inflate = async (data: Uint8Array) => new Uint8Array(inflateSync(data));
const deflate = async (data: Uint8Array) => new Uint8Array(deflateSync(data));

const images: [string, PngImage][] = [
  ["8-bit grey", { widthPx: 5, heightPx: 3, channels: 1, bitDepth: 8, data: Uint16Array.from({ length: 15 }, (_, i) => (i * 37) % 256) }],
  ["16-bit grey", { widthPx: 4, heightPx: 2, channels: 1, bitDepth: 16, data: Uint16Array.from([0, 1, 255, 256, 40000, 65535, 12345, 54321]) }],
  ["8-bit RGB", { widthPx: 2, heightPx: 2, channels: 3, bitDepth: 8, data: Uint16Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 99, 199]) }],
  ["16-bit RGB", { widthPx: 1, heightPx: 2, channels: 3, bitDepth: 16, data: Uint16Array.from([65535, 1, 300, 0, 65534, 7]) }],
];

for (const [label, image] of images) {
  test(`a ${label} PNG reads back to the same samples`, async () => {
    const bytes = await encodePng(image, deflate);
    const png = await decodePng(bytes, { inflate });
    assert.deepEqual([png.widthPx, png.heightPx, png.bitDepth, png.channels], [image.widthPx, image.heightPx, image.bitDepth, image.channels]);
    assert.deepEqual([...png.samples], [...image.data]);
  });
}

test("Pillow reads the written PNG files with the same samples", (context) => {
  const dir = mkdtempSync(join(tmpdir(), "plotforge-export-"));
  const check = async (name: string, image: PngImage) => writeFileSync(join(dir, name), await encodePng(image, deflate));
  return Promise.all([check("grey16.png", images[1][1]), check("rgb8.png", images[2][1])]).then(() => {
    const script = "import sys; from PIL import Image\nfor name in sys.argv[2:]:\n  im = Image.open(sys.argv[1] + '/' + name)\n  print(name, im.mode, list(im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()))";
    let output: string;
    try { output = execFileSync("python3", ["-I", "-c", script, dir, "grey16.png", "rgb8.png"], { encoding: "utf8" }); }
    catch { context.skip("Python 3 with Pillow is not available."); return; }
    const lines = output.trim().split("\n");
    assert.equal(lines[0], `grey16.png I;16 [${[...images[1][1].data].join(", ")}]`);
    assert.equal(lines[1], "rgb8.png RGB [(255, 0, 0), (0, 255, 0), (0, 0, 255), (9, 99, 199)]");
  });
});

test("an export is the result of the enabled steps, at its own depth, and the original is unchanged", async () => {
  const bytes = new Uint8Array(readFileSync("tests/fixtures/png-grey16-9x9-adam7.png"));
  const before = crc32(bytes);
  const { raster } = await decodeImage(bytes, { inflate });
  const steps = [newStep("rotate", [], shapeOf(raster)), { ...newStep("invert", [], shapeOf(raster)), id: "b", enabled: false }];
  const result = applySteps(raster, steps).raster;
  const written = await decodePng(await encodePng(result, deflate), { inflate });
  assert.equal(written.bitDepth, 16);
  assert.deepEqual([...written.samples], [...result.data]);
  assert.equal(crc32(bytes), before);
});

// Naming, Keep both and the overwrite choices are the shell's (`export-plan.ts`, its own conformance tests); these
// check PlotForge's formats under its rules.
test("PlotForge exports PNG, JPEG and CSV under the shell's rules: never a project file or an original", () => {
  const rules = { formats: EXPORT_FORMAT_LIST, protectedPaths: ["/lab/run 1/cells.png", "C:\\Data\\plate.PNG"], ignoreCase: true };
  assert.equal(exportProblem("/lab/run 1/cells-1.png", rules), null);
  for (const name of ["/lab/r.csv", "/lab/c.JPG", "/lab/c.jpeg"]) assert.equal(exportProblem(name, rules), null, name);
  assert.match(exportProblem("/LAB/run 1/CELLS.png", rules)!, /original/);
  assert.match(exportProblem("c:/data/plate.png", rules)!, /original/);
  assert.match(exportProblem("/lab/cells.tif", rules)!, /PNG, JPEG, CSV or SVG files only/);
  assert.match(exportProblem("/lab/a.pfg", rules)!, /project file/);
});

test("export names follow the format; defaults are PNG, quality 90, no overlays, no calibration bar (checkered, automatic, 4 blocks, medium), ask", () => {
  assert.equal(exportFileNameAs("cells", "jpeg"), "cells.jpg");
  assert.equal(exportFileNameAs("cells", "png"), "cells.png");
  assert.deepEqual(DEFAULT_EXPORT, { format: "png", jpegQuality: 90, includeOverlays: false, scaleBar: "none", scaleBarStyle: "checkered", scaleBarLength: null, scaleBarBlocks: 4, scaleBarSize: "medium", overwrite: "ask" });
});

test("the calibration bar is the longest 1, 2 or 5 times a power of ten in a fifth of the width, and its length in pixels equals the scale", () => {
  // A micrograph: 1280 px wide at 20 / 169 µm per pixel; a fifth is 30.3 µm, so the bar is 20 µm, 169 px.
  const bar = scaleBarFor({ x: 20 / 169, unit: "µm" }, 1280);
  assert.equal(bar.length, 20);
  assert.ok(Math.abs(bar.pixels - 169) < 1e-9);
  assert.deepEqual(scaleBarFor({ x: 1, unit: "px" }, 1000), { length: 200, pixels: 200, unit: "px" });
  assert.equal(scaleBarFor({ x: 0.001, unit: "mm" }, 600).length, 0.1); // a fifth is 0.12 mm
  assert.equal(scaleBarFor({ x: 1, unit: "px" }, 2400).length, 200); // a fifth is 480: 200, not 500
});

test("a fixed bar length is kept as it is, in the image's unit", () => {
  assert.deepEqual(scaleBarFor({ x: 0.5, unit: "nm" }, 1000, 0.2, 20), { length: 20, pixels: 40, unit: "nm" });
  assert.equal(scaleBarFor({ x: 1, unit: "px" }, 1000, 0.2, null).length, 200); // null: automatic
  assert.equal(scaleBarFor({ x: 1, unit: "px" }, 1000, 0.2, -3).length, 200); // not a length: automatic
});

test("a checkered bar halves its left part: 4 blocks of 20 read 0, 2.5, 5, 10, 20", () => {
  assert.deepEqual(scaleBarTicks(4), [0, 0.125, 0.25, 0.5, 1]);
  assert.deepEqual(scaleBarTicks(4).map((fraction) => scaleBarNumber(fraction * 20)), ["0", "2.5", "5", "10", "20"]);
  assert.deepEqual(scaleBarTicks(1), [0, 1]);
  assert.deepEqual(scaleBarTicks(2), [0, 0.5, 1]);
  assert.equal(scaleBarTicks(9).length, 6); // at most 5 blocks
  assert.equal(scaleBarNumber(0.1 * 3), "0.3");
});

test("pictures are 8-bit RGB: grey copied to each channel, 16 bits divided by 257", () => {
  const grey16: Raster = { widthPx: 2, heightPx: 1, channels: 1, bitDepth: 16, data: Uint16Array.from([65535, 128]) };
  assert.deepEqual([...toRgb8(grey16)], [255, 255, 255, 0, 0, 0]); // 128 / 257 = 0.498 → 0
  const edge: Raster = { widthPx: 1, heightPx: 1, channels: 1, bitDepth: 16, data: Uint16Array.from([129]) };
  assert.deepEqual([...toRgb8(edge)], [1, 1, 1]); // 129 / 257 = 0.502 → 1
  const rgb: Raster = { widthPx: 1, heightPx: 1, channels: 3, bitDepth: 8, data: Uint16Array.from([1, 2, 3]) };
  assert.deepEqual([...toRgb8(rgb)], [1, 2, 3]);
});
