// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Measurements and the results table: area fraction is masked over region pixels, areas, grey statistics, centroids
// and perimeters on hand-built images, calibration, line lengths, rows measured again from their records (also after
// saving), and the CSV.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import {
  applySteps, applyThreshold, convexHullArea, formatDecimals, formatMeasure, decodeImage, outlineCorners, describeImage, directScale, emptyProject, maskCount, measureRecord, measureRegion, newProjectImage, newStep,
  parseProject, PIXELS, resultsCsv, roiMask, scaleOf, serializeProject, shapeOf, type Raster, type ResultRecord, type ResultRow, type Roi, type Step,
} from "../../source/engine";

const inflate = async (data: Uint8Array) => new Uint8Array(inflateSync(data));
const close = (a: number | null, b: number, tolerance = 1e-9) => assert.ok(a !== null && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} ≠ ${b}`);
const grey = (width: number, values: number[]): Raster => ({ widthPx: width, heightPx: values.length / width, channels: 1, bitDepth: 8, data: Uint16Array.from(values) });
const maskOf = (width: number, cells: string) => Uint8Array.from(cells.replace(/\s/g, "").split("").map((c) => (c === "#" ? 1 : 0)));

// 4 × 4, values 0 to 150 by 10.
const image = grey(4, Array.from({ length: 16 }, (_, i) => i * 10));

test("the whole image without a threshold: everything is region and masked", () => {
  const values = measureRegion(image, null, null, PIXELS);
  assert.deepEqual([values.regionPixels, values.maskedPixels, values.area, values.areaFraction, values.min, values.max], [16, 16, 16, 100, 0, 150]);
  close(values.mean, 75);
  close(values.centroidX, 2); close(values.centroidY, 2);
  assert.equal(values.perimeter, 16); // the 4 × 4 square's outline
});

test("area fraction is masked pixels over region pixels, times 100", () => {
  const mask = maskOf(4, `
    ##..
    ##..
    ....
    ...#`);
  const values = measureRegion(image, null, mask, PIXELS);
  assert.deepEqual([values.regionPixels, values.maskedPixels, values.area], [16, 5, 5]);
  close(values.areaFraction, (5 / 16) * 100);
  // Within a region of the left half (8 pixels), 4 of the masked pixels count.
  const region = maskOf(4, `
    ##..
    ##..
    ##..
    ##..`);
  const inRegion = measureRegion(image, region, mask, PIXELS);
  assert.deepEqual([inRegion.regionPixels, inRegion.maskedPixels], [8, 4]);
  close(inRegion.areaFraction, 50);
  // Grey statistics are of the region's pixels, not only the masked ones: 0, 10, 40, 50, 80, 90, 120, 130.
  close(inRegion.mean, 65);
  assert.deepEqual([inRegion.min, inRegion.max], [0, 130]);
  // An empty region has no fraction.
  assert.equal(measureRegion(image, new Uint8Array(16), mask, PIXELS).areaFraction, null);
});

test("centroids are the mean of masked pixel centres; perimeters count edges facing outside", () => {
  const mask = maskOf(4, `
    .##.
    .##.
    ....
    ....`);
  const values = measureRegion(image, null, mask, PIXELS);
  close(values.centroidX, 2); close(values.centroidY, 1);
  assert.equal(values.perimeter, 8);
  // Two separate pixels: 4 edges each.
  assert.equal(measureRegion(image, null, maskOf(4, "#... .... .... ...#"), PIXELS).perimeter, 8);
  // A pixel at the image's border: its outer edges still count.
  assert.equal(measureRegion(image, null, maskOf(4, "#... .... .... ...."), PIXELS).perimeter, 4);
  // No masked pixels: no centroid, no area, no perimeter.
  const none = measureRegion(image, null, new Uint8Array(16), PIXELS);
  assert.deepEqual([none.area, none.centroidX, none.perimeter], [0, null, 0]);
});

test("calibration scales area, centroid and perimeter, per axis, and nothing else", () => {
  const mask = maskOf(4, ".##. .##. .... ....");
  const scale = scaleOf(directScale(0.5, "µm", 4)); // 0.5 µm wide, 2 µm tall
  const values = measureRegion(image, null, mask, scale);
  close(values.area, 4 * 0.5 * 2);
  close(values.centroidX, 2 * 0.5); close(values.centroidY, 1 * 2);
  // Top and bottom: 2 + 2 edges of 0.5 µm; left and right: 2 + 2 edges of 2 µm.
  close(values.perimeter, 4 * 0.5 + 4 * 2);
  const plain = measureRegion(image, null, mask, PIXELS);
  assert.deepEqual([values.regionPixels, values.maskedPixels, values.areaFraction, values.mean], [plain.regionPixels, plain.maskedPixels, plain.areaFraction, plain.mean]);
});

test("colour images have no grey statistics", () => {
  const rgb: Raster = { widthPx: 1, heightPx: 2, channels: 3, bitDepth: 8, data: Uint16Array.from([1, 2, 3, 4, 5, 6]) };
  const values = measureRegion(rgb, null, null, PIXELS);
  assert.deepEqual([values.mean, values.min, values.max, values.area], [null, null, null, 2]);
});

// MARK: rows from their records

async function fixture() {
  const bytes = new Uint8Array(readFileSync("tests/fixtures/threshold-bimodal8.png"));
  const { raster } = await decodeImage(bytes, { inflate });
  const shape = shapeOf(raster);
  const steps: Step[] = [];
  steps.push({ ...newStep("crop", steps, shape), x: 4, y: 2, width: 40, height: 30 } as Step);
  steps.push(newStep("rotate", steps, shape));
  const roi: Roi = { id: "roi-1", name: "Ellipse 1", type: "ellipse", x: 3, y: 4, width: 20.5, height: 25 };
  const record: ResultRecord = {
    imageId: "image-1", imageName: "bimodal8", file: "bimodal8.png", crc32: describeImage(bytes).source.crc32, steps, roi,
    threshold: { mode: "otsu", objects: "light" }, calibration: directScale(0.25, "µm"), measured: ["area", "areaFraction", "mean", "minMax", "centroid", "perimeter"],
  };
  return { bytes, raster, record };
}

test("a row's area fraction equals the masked pixels of its region over the region's pixels", async () => {
  const { raster, record } = await fixture();
  const { values, unit } = measureRecord(raster, record);
  // Computed here without measureRegion: the steps, the ellipse's mask, Otsu's mask, and their overlap.
  const working = applySteps(raster, record.steps).raster;
  const region = roiMask(record.roi!, working)!, mask = applyThreshold(working, record.threshold!).mask;
  const both = region.reduce((sum, value, i) => sum + (value && mask[i] ? 1 : 0), 0);
  assert.equal(values.regionPixels, maskCount(region));
  assert.equal(values.maskedPixels, both);
  close(values.areaFraction, (both / maskCount(region)) * 100);
  close(values.area, both * 0.25 * 0.25);
  assert.equal(unit, "µm");
});

test("each row is measured again from its record, also after the document is saved and opened", async () => {
  const { raster, record } = await fixture();
  const first = measureRecord(raster, record);
  assert.deepEqual(measureRecord(raster, record), first);
  const project = emptyProject();
  project.results.push({ id: "row-1", ...record, ...first });
  const text = serializeProject(project, "/lab/a.pfg");
  const reopened = parseProject(text, "/lab/a.pfg");
  assert.equal(serializeProject(reopened, "/lab/a.pfg"), text);
  const row = reopened.results[0];
  assert.deepEqual(measureRecord(raster, row), { unit: row.unit, values: row.values, ...(row.mask ? { mask: row.mask } : {}) });
});

test("a line region reports its length only", async () => {
  const { raster, record } = await fixture();
  const line: ResultRecord = { ...record, roi: { id: "l", name: "Line 1", type: "line", points: [[0, 0], [3, 4]] }, threshold: null };
  const { values } = measureRecord(raster, line);
  close(values.length, 5 * 0.25);
  assert.deepEqual([values.area, values.areaFraction, values.perimeter], [null, null, null]);
});

test("the CSV has a header, one row per result with its record, and quotes what needs quoting", async () => {
  const { raster, record } = await fixture();
  const row: ResultRow = { id: "row-1", ...record, imageName: 'cells, "plate" 2', measured: ["area"], ...measureRecord(raster, record) };
  const lines = resultsCsv([row]).split("\r\n");
  assert.equal(lines[0], "Row,Image,Region,Phase,Area (µm²),Area fraction (%),Mean grey,Min grey,Max grey,Centroid X (µm),Centroid Y (µm),Perimeter (µm),Std dev grey,Modal grey,Median grey,"
    + "Integrated density,Raw integrated density,Centre of mass X (µm),Centre of mass Y (µm),Mean optical density,Bounding X (µm),Bounding Y (µm),Bounding width (µm),Bounding height (µm),"
    + "Circularity,Aspect ratio,Roundness,Solidity,Skewness,Kurtosis,Ellipse major (µm),Ellipse minor (µm),Ellipse angle,Feret (µm),Min Feret (µm),Feret angle,Length (µm),Unit,File,CRC-32,Steps,Threshold,Mask CRC-32,Limit to threshold,Density standard,Calibration");
  assert.ok(lines[1].startsWith(`1,"cells, ""plate"" 2",Ellipse 1,,${row.values.area},${",".repeat(32)}µm,bimodal8.png,`), lines[1]);
  assert.equal(lines.at(-1), "");
});

// MARK: the measurement set

test("grey statistics of the region: sample std dev, modal, median, integrated density, centre of mass, optical density", () => {
  const values = measureRegion(image, null, null, PIXELS);
  // 0 to 150 by 10: Σ(v − 75)² = 100 · 16 · (16² − 1) / 12 = 34000, over n − 1 = 15.
  close(values.stdDev, Math.sqrt(34000 / 15));
  assert.equal(values.modal, 0); // every value once: the lowest
  assert.equal(values.median, 75); // (70 + 80) / 2
  assert.equal(values.rawIntDen, 1200);
  close(values.intDen, 1200);
  // Column x sums to 40x + 240; Σ (40x + 240)(x + 0.5) over x = 0 to 3 is 2600, over a total of 1200.
  close(values.massX, 2600 / 1200);
  close(values.massY, (Array.from({ length: 4 }, (_, y) => (10 * (4 * 4 * y + 6)) * (y + 0.5)).reduce((a, b) => a + b, 0)) / 1200);
  // log10(255 / v), with 0 counting as 1.
  close(values.opticalDensity, Array.from({ length: 16 }, (_, i) => Math.log10(255 / Math.max(1, i * 10))).reduce((a, b) => a + b, 0) / 16);
  // Calibration scales the integrated density by a pixel's area and the centre of mass by the pixel's sides.
  const scaled = measureRegion(image, null, null, scaleOf(directScale(0.5, "µm", 4)));
  close(scaled.intDen, 1200 * 0.5 * 2);
  close(scaled.massX, (2600 / 1200) * 0.5);
  assert.equal(scaled.rawIntDen, 1200);
  // One pixel: a standard deviation of 0. A colour image: none of these.
  assert.equal(measureRegion(image, maskOf(4, "#... .... .... ...."), null, PIXELS).stdDev, 0);
  const rgb: Raster = { widthPx: 1, heightPx: 1, channels: 3, bitDepth: 8, data: Uint16Array.from([1, 2, 3]) };
  const colour = measureRegion(rgb, null, null, PIXELS);
  assert.deepEqual([colour.stdDev, colour.modal, colour.median, colour.intDen, colour.massX, colour.opticalDensity], [null, null, null, null, null, null]);
});

test("the median of an even count is the mean of the middle two; the modal takes the lowest on a tie", () => {
  const values = measureRegion(grey(4, [5, 7, 9, 9, 9, 2, 2, 2]), null, null, PIXELS);
  assert.equal(values.median, 6); // 2 2 2 5 7 9 9 9
  assert.equal(values.modal, 2); // 2 and 9 three times each
});

test("the bounding rectangle is of the masked pixels, in calibrated units", () => {
  const mask = maskOf(4, ".... .##. .#.. ....");
  const values = measureRegion(image, null, mask, PIXELS);
  assert.deepEqual([values.boundX, values.boundY, values.boundWidth, values.boundHeight], [1, 1, 2, 2]);
  const scaled = measureRegion(image, null, mask, scaleOf(directScale(0.5, "µm", 4)));
  assert.deepEqual([scaled.boundX, scaled.boundY, scaled.boundWidth, scaled.boundHeight], [0.5, 2, 1, 4]);
});

/** A width × height mask of the pixels whose centres satisfy `keep`. */
const shape = (width: number, height: number, keep: (x: number, y: number) => boolean): Raster & { mask: Uint8Array } => {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) mask[y * width + x] = keep(x + 0.5, y + 0.5) ? 1 : 0;
  return { widthPx: width, heightPx: height, channels: 1, bitDepth: 8, data: new Uint16Array(width * height), mask };
};

test("outline corners: 4 for a pixel, 8 for two touching at a corner, 4 for a block", () => {
  const corners = (width: number, cells: string) => { const mask = maskOf(width, cells); return outlineCorners((i) => mask[i] === 1, width, mask.length / width); };
  assert.equal(corners(3, "... .#. ..."), 4);
  assert.equal(corners(3, "#.. .#. ..."), 8);
  assert.equal(corners(3, "##. ##. ..."), 4);
  assert.equal(corners(3, "##. #.. ..."), 6);
});

test("shape: a square's circularity is 4π · area over the cut perimeter squared; a disk's is near 1; an ellipse's aspect ratio is its axes' ratio", () => {
  const square = shape(120, 120, (x, y) => x > 10 && x < 110 && y > 10 && y < 110);
  const sq = measureRegion(square, null, square.mask, PIXELS);
  const cut = 400 - 4 * (2 - Math.SQRT2);
  close(sq.circularity, (4 * Math.PI * 10000) / (cut * cut));
  close(sq.aspectRatio, 1, 1e-9);
  const disk = shape(120, 120, (x, y) => (x - 60) ** 2 + (y - 60) ** 2 < 50 ** 2);
  const d = measureRegion(disk, null, disk.mask, PIXELS);
  assert.ok(d.circularity! > 0.9 && d.circularity! <= 1, String(d.circularity));
  assert.ok(Math.abs(d.aspectRatio! - 1) < 0.01, String(d.aspectRatio));
  const ellipse = shape(200, 100, (x, y) => ((x - 100) / 90) ** 2 + ((y - 50) / 30) ** 2 < 1);
  const e = measureRegion(ellipse, null, ellipse.mask, PIXELS);
  assert.ok(Math.abs(e.aspectRatio! - 3) < 0.03, String(e.aspectRatio));
  close(e.roundness, 1 / e.aspectRatio!);
  assert.ok(e.circularity! < d.circularity!);
  // A tilted ellipse keeps its ratio: the moments do not depend on the axes.
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const tilted = shape(200, 200, (x, y) => { const u = (x - 100) * c + (y - 100) * s, v = -(x - 100) * s + (y - 100) * c; return (u / 90) ** 2 + (v / 30) ** 2 < 1; });
  assert.ok(Math.abs(measureRegion(tilted, null, tilted.mask, PIXELS).aspectRatio! - 3) < 0.03);
  // On pixels twice as tall as wide, the same pixels are a shape twice as tall: a 2:1 block in pixels is square in µm.
  const block = shape(40, 40, (x, y) => x > 0 && x < 20 && y > 0 && y < 10);
  close(measureRegion(block, null, block.mask, scaleOf(directScale(1, "µm", 2))).aspectRatio, 1, 1e-9);
});

test("rows saved before the measurement set grew open with the new values empty", async () => {
  const { raster, record } = await fixture();
  const project = emptyProject();
  project.results.push({ id: "row-1", ...record, ...measureRecord(raster, record) });
  const saved = JSON.parse(serializeProject(project, "/lab/a.pfg"));
  for (const key of ["stdDev", "modal", "circularity"]) delete saved.results[0].values[key];
  const reopened = parseProject(JSON.stringify(saved), "/lab/a.pfg");
  assert.deepEqual([reopened.results[0].values.stdDev, reopened.results[0].values.modal, reopened.results[0].values.circularity], [null, null, null]);
});

// MARK: solidity, limit to threshold, decimal places (roadmap I18)

test("solidity: 1 for a filled rectangle; an L of three pixels is 3 over its hull of 3.5", () => {
  const block = shape(10, 10, (x, y) => x > 2 && x < 7 && y > 1 && y < 5);
  close(measureRegion(block, null, block.mask, PIXELS).solidity, 1);
  const l = maskOf(2, "## #.");
  const raster = grey(2, [0, 0, 0, 0]);
  close(convexHullArea((i) => l[i] === 1, 2, 2), 3.5);
  close(measureRegion(raster, null, l, PIXELS).solidity, 3 / 3.5);
  // Calibration scales area and hull alike, so solidity does not change.
  close(measureRegion(raster, null, l, scaleOf(directScale(0.5, "µm", 2))).solidity, 3 / 3.5);
  // A ring of 8 pixels round a hole: hull 9, solidity 8 / 9.
  close(measureRegion(grey(3, new Array(9).fill(0)), null, maskOf(3, "### #.# ###"), PIXELS).solidity, 8 / 9);
  assert.equal(measureRegion(raster, null, new Uint8Array(4), PIXELS).solidity, null);
});

test("limit to threshold takes the grey statistics over the masked pixels; off, over the region's", () => {
  const raster = grey(4, [10, 20, 30, 40]);
  const mask = Uint8Array.from([0, 1, 1, 0]);
  const plain = measureRegion(raster, null, mask, PIXELS), limited = measureRegion(raster, null, mask, PIXELS, { limitToThreshold: true });
  close(plain.mean, 25); close(limited.mean, 25);
  assert.deepEqual([plain.min, plain.max, limited.min, limited.max], [10, 40, 20, 30]);
  close(limited.stdDev, Math.sqrt(50)); close(limited.rawIntDen, 50); close(limited.median, 25);
  // Area and area fraction do not change with it.
  assert.deepEqual([limited.area, limited.areaFraction], [plain.area, plain.areaFraction]);
  // Without a threshold there is nothing to limit to.
  assert.deepEqual(measureRegion(raster, null, null, PIXELS, { limitToThreshold: true }), measureRegion(raster, null, null, PIXELS));
  // An empty mask leaves no grey pixels: the statistics are none.
  assert.equal(measureRegion(raster, null, new Uint8Array(4), PIXELS, { limitToThreshold: true }).mean, null);
});

test("decimal places: fixed places when set, four significant digits when not; whole numbers stay whole", () => {
  assert.equal(formatDecimals(3.14159, 2, formatMeasure), "3.14");
  assert.equal(formatDecimals(3.14159, 0, formatMeasure), "3");
  assert.equal(formatDecimals(2.5, 9, formatMeasure), "2.500000000");
  assert.equal(formatDecimals(3.14159, null, formatMeasure), "3.142");
  assert.equal(formatDecimals(12, 3, formatMeasure), "12");
});

// MARK: skewness, kurtosis and the fitted ellipse (roadmap I18)

test("skewness and kurtosis: 0, 0, 0, 10 gives 2 / √3 and −2 / 3; one value gives none", () => {
  const values = measureRegion(grey(4, [0, 0, 0, 10]), null, null, PIXELS);
  close(values.skewness, 2 / Math.sqrt(3));
  close(values.kurtosis, -2 / 3);
  // Symmetric values have no skew.
  close(measureRegion(grey(4, [10, 20, 30, 40]), null, null, PIXELS).skewness, 0);
  const one = measureRegion(grey(2, [7, 7]), null, null, PIXELS);
  assert.deepEqual([one.skewness, one.kurtosis], [null, null]);
  assert.equal(measureRegion({ widthPx: 1, heightPx: 1, channels: 3, bitDepth: 8, data: Uint16Array.from([1, 2, 3]) }, null, null, PIXELS).skewness, null);
});

test("the fitted ellipse of a w × h rectangle has axes 2w / √π and 2h / √π, and the rectangle's area", () => {
  const wide = maskOf(10, "##########".repeat(4));
  const values = measureRegion(grey(10, new Array(40).fill(0)), null, wide, PIXELS);
  close(values.major, 20 / Math.sqrt(Math.PI)); close(values.minor, 8 / Math.sqrt(Math.PI));
  close((Math.PI * values.major! * values.minor!) / 4, 40);
  close(values.angle, 0);
  // Tall: the major axis is vertical.
  const tall = maskOf(4, "####".repeat(10));
  close(measureRegion(grey(4, new Array(40).fill(0)), null, tall, PIXELS).angle, 90);
  // The diagonal from top left to bottom right runs down to the right: 135° counter-clockwise with y up.
  const diagonal = maskOf(5, "#.... .#... ..#.. ...#. ....#");
  close(measureRegion(grey(5, new Array(25).fill(0)), null, diagonal, PIXELS).angle, 135);
  // Calibration scales both axes.
  const scaled = measureRegion(grey(10, new Array(40).fill(0)), null, wide, scaleOf(directScale(0.5, "µm", 2)));
  close(scaled.major, 10 / Math.sqrt(Math.PI));
});

// MARK: Feret's diameter (roadmap I18)

test("Feret's diameter: a 3 × 2 box gives √13 and 2; a diagonal runs at 135°; calibration scales it", () => {
  const box = measureRegion(grey(3, new Array(6).fill(0)), null, maskOf(3, "### ###"), PIXELS);
  close(box.feret, Math.sqrt(13)); close(box.minFeret, 2);
  // A pixel's square: the diagonal √2, the width 1.
  const one = measureRegion(grey(1, [0]), null, null, PIXELS);
  close(one.feret, Math.SQRT2); close(one.minFeret, 1);
  // The diagonal from top left to bottom right: corners (0, 0) to (5, 5), down to the right, 135° with y up.
  const diagonal = measureRegion(grey(5, new Array(25).fill(0)), null, maskOf(5, "#.... .#... ..#.. ...#. ....#"), PIXELS);
  close(diagonal.feret, 5 * Math.SQRT2); close(diagonal.feretAngle, 135);
  close(diagonal.minFeret, Math.SQRT2);
  // A long row lies along x; pixels twice as wide double the lengths along x only.
  const row = measureRegion(grey(10, new Array(10).fill(0)), null, null, PIXELS);
  close(row.feret, Math.hypot(10, 1)); close(row.minFeret, 1);
  const wide = measureRegion(grey(10, new Array(10).fill(0)), null, null, scaleOf(directScale(2, "µm", 0.5)));
  close(wide.feret, Math.hypot(20, 1)); close(wide.minFeret, 1);
});
