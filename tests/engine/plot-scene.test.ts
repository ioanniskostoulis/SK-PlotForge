// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A plot's vector scene, its lines joined straight, as curves or in steps, its SVG, the resolution recorded in a PNG or JPEG export, and a plot's export settings.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTable, connectOps, crc32, resolvePlot, emptyProject, jpegWithDpi, newNamedRange, newPlot, parseProject, plotScene, plotSvg, pngWithDpi, serializeProject, tablesOnly,
  type CellRange, type NamedRange, type PathOp, type SceneItem,
  seriesColour, pointInfo, newFit,
} from "../../source/engine";

const measure = (text: string, pt: number) => ({ width: text.length * pt * 0.8, ascent: pt * 0.93, descent: pt * 0.27 });
const table = buildTable({ rows: [["Distance (mm)", "Hardness (HRC)", "T (°C)"], [0, 72, 20], [5, 70, 120], [10, 64, 300]] });
const at = (letter: string): CellRange => ({ data: "data-1", column: `Column ${letter}`, rows: { first: 1, last: 3 } });
const names: NamedRange[] = [["A", "Distance", "mm"], ["B", "Hardness", "HRC"], ["C", "T", "°C"]].reduce<NamedRange[]>((list, [letter, name, unit]) => [...list, newNamedRange(list, at(letter), name, unit)], []);
const sources = tablesOnly(() => table, names);
const plotOf = () => newPlot([], "line-symbol", [{ x: at("A"), y: at("B") }, { x: at("A"), y: at("C") }], { x: 200, y: 100 });
const flat = (items: readonly SceneItem[]): SceneItem[] => items.flatMap((item) => (item.kind === "clip" ? [item, ...flat(item.items)] : [item]));

test("a scene is drawn from the plot's corner: paper, frame, titles, labels, series clipped to the plot area, legend", () => {
  const plot = plotOf();
  plot.title = "Jominy";
  const scene = plotScene(plot, sources, measure);
  assert.deepEqual([scene.width, scene.height], [480, 320]);
  assert.deepEqual(scene.items[0], { kind: "rect", x: 0, y: 0, width: 480, height: 320, fill: "#FFFFFF" }, "the paper, from the plot's own corner");
  const texts = flat(scene.items).filter((item) => item.kind === "text").map((item) => item.kind === "text" ? item.text : "");
  for (const text of ["Jominy", "Distance (mm)", "Hardness (HRC)", "Hardness", "T"]) assert.ok(texts.includes(text), text);
  const at = scene.items.findIndex((item) => item.kind === "clip"), clip = scene.items[at];
  assert.ok(clip.kind === "clip" && clip.items.length === 2, "two lines, clipped to the plot area");
  assert.deepEqual(scene.items.slice(at + 1, at + 3).map((item) => item.kind), ["path", "path"], "two marker sets after them, drawn whole");
  // The last point (10, 64) is on the X axis' end, the frame's right edge: its marker reaches past the frame, not cut.
  const marks = scene.items[at + 1];
  const right = clip.kind === "clip" ? clip.x + clip.width : 0;
  assert.ok(marks.kind === "path" && marks.ops.some((op) => "x" in op && op.x > right + 1), "the marker on the frame is whole");
  plot.xAxis.max = 5;
  const cut = plotScene(plot, sources, measure), cutAt = cut.items.findIndex((item) => item.kind === "clip");
  const kept = cut.items[cutAt + 1];
  assert.ok(kept.kind === "path" && kept.ops.every((op) => !("x" in op) || op.x < right + 20), "a point beyond a set axis end has no marker");
  plot.xAxis.max = null;
  assert.equal(scene.message, null);
  assert.match(String(plotScene(plot, tablesOnly(() => null), measure).message?.text), /No series to draw/);
});

test("unnamed cells are called by their reference in the legend, and give no axis title", () => {
  const scene = plotScene(plotOf(), tablesOnly(() => table), measure);
  const texts = flat(scene.items).flatMap((item) => (item.kind === "text" ? [item.text] : []));
  assert.ok(texts.includes("Sheet!B2:B4") && texts.includes("Sheet!C2:C4"));
  assert.ok(!texts.includes("Distance (mm)"));
});

const P = (x: number, y: number) => [x, y] as const;
const ends = (ops: PathOp[]) => ops.flatMap((op) => (op.op === "M" || op.op === "L" || op.op === "C" ? [[op.x, op.y]] : []));

test("lines join their points straight, by a spline through them, a B-spline or Bezier they steer, or in steps", () => {
  const points = [P(0, 0), P(10, 10), P(20, 0), P(30, 10), P(40, 0)];
  assert.deepEqual(connectOps(points, "straight").map((op) => op.op), ["M", "L", "L", "L", "L"]);
  const spline = connectOps(points, "spline");
  assert.deepEqual(spline.map((op) => op.op), ["M", "C", "C", "C", "C"]);
  assert.deepEqual(ends(spline), points.map((p) => [...p]), "a spline passes through every point");
  const first = spline[1];
  assert.ok(first.op === "C" && Math.abs(first.x1 - 10 / 3) < 1e-9 && Math.abs(first.x2 - 20 / 3) < 1e-9, "a spline of y on x steps a third of the way in x");
  const loop = connectOps([P(0, 0), P(10, 10), P(0, 20)], "spline");
  assert.deepEqual(ends(loop), [[0, 0], [10, 10], [0, 20]], "x turning back: still through every point");
  const bspline = connectOps(points, "bspline");
  assert.deepEqual([ends(bspline)[0], ends(bspline).at(-1)], [[0, 0], [40, 0]], "a B-spline is held to the first and last points");
  assert.ok(!ends(bspline).some(([x, y]) => x === 10 && y === 10), "and steered by the others, not through them");
  const bezier = connectOps(points, "bezier");
  assert.deepEqual(bezier.map((op) => op.op), ["M", "C", "L"], "every three steps a cubic piece; one left over is a line");
  assert.deepEqual(ends(bezier), [[0, 0], [30, 10], [40, 0]]);
  assert.deepEqual(connectOps(points.slice(0, 3), "bezier").map((op) => op.op), ["M", "C"], "two left over: a quadratic piece");
  assert.deepEqual(ends(connectOps(points.slice(0, 3), "step")), [[0, 0], [10, 0], [10, 10], [20, 10], [20, 0]], "across, then up or down");
  assert.deepEqual(connectOps([P(1, 2), P(3, 4)], "spline").map((op) => op.op), ["M", "L"], "two points are a straight line");
});

test("a curve is a path of C commands in the SVG; a gap in the data starts a new curve", () => {
  const plot = plotOf();
  plot.series[0].connect = "spline";
  const svg = plotSvg(plotScene(plot, sources, measure));
  assert.match(svg, /<path d="M[\d.]+ [\d.]+C[\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+C/);
});

test("the SVG is the scene: its print size in points, text in the figure font, the series clipped", () => {
  const plot = plotOf();
  plot.series[1].axis = "y2";
  plot.title = "A & B <test>";
  const svg = plotSvg(plotScene(plot, sources, measure));
  assert.match(svg, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="360pt" height="240pt" viewBox="0 0 480 320">/);
  assert.match(svg, /font-family="'Libertinus Serif', serif"/);
  assert.match(svg, />A &amp; B &lt;test&gt;</, "text is escaped");
  assert.match(svg, /<clipPath id="clip1"><rect /);
  assert.match(svg, /<g clip-path="url\(#clip1\)">/);
  assert.match(svg, /rotate\(-90\)[^>]*>T \(°C\)</, "the right axis' title");
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test("a PNG export records its resolution in a pHYs chunk after IHDR; a JPEG in its JFIF header", () => {
  const ihdr = new Uint8Array([0, 0, 0, 13, 73, 72, 68, 82, ...new Array(13).fill(0), 0, 0, 0, 0]);
  const end = new Uint8Array([0, 0, 0, 0, 73, 69, 78, 68, 0xae, 0x42, 0x60, 0x82]);
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...ihdr, ...end]);
  const out = pngWithDpi(png, 300);
  assert.equal(out.length, png.length + 21);
  assert.equal(String.fromCharCode(...out.subarray(37, 41)), "pHYs");
  const view = new DataView(out.buffer);
  assert.deepEqual([view.getUint32(41), view.getUint32(45), out[49]], [11811, 11811, 1], "300 dpi is 11811 dots per metre");
  assert.equal(view.getUint32(50).toString(16).padStart(8, "0"), crc32(out.subarray(37, 50)));
  assert.equal(pngWithDpi(out, 600).length, out.length, "a pHYs written before is replaced");
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const marked = jpegWithDpi(jpeg, 300);
  assert.deepEqual([...marked.subarray(13, 18)], [1, 1, 44, 1, 44]);
  assert.equal(jpeg[13], 0, "the input is not changed");
});

test("a plot exports as a 300 dpi PNG unless set; a set format and resolution are saved", () => {
  const plot = plotOf();
  assert.deepEqual([plot.exportFormat, plot.exportDpi], ["png", 300]);
  const project = emptyProject();
  project.plots.push(plot);
  assert.ok(!("exportFormat" in JSON.parse(serializeProject(project, "/lab/a.pfg")).plots[0]));
  plot.exportFormat = "svg";
  plot.exportDpi = 600;
  const text = serializeProject(project, "/lab/a.pfg");
  assert.deepEqual([JSON.parse(text).plots[0].exportFormat, JSON.parse(text).plots[0].exportDpi], ["svg", 600]);
  assert.deepEqual(parseProject(text, "/lab/a.pfg").plots[0], plot);
  const bad = JSON.parse(text);
  bad.plots[0].exportDpi = 5;
  assert.throws(() => parseProject(JSON.stringify(bad), "/lab/a.pfg"), /invalid export resolution/);
});

test("error bars: ± the error cells about each point, capped, and the Y axis reaches their ends; stored with the series", () => {
  const plot = newPlot([], "scatter", [{ x: at("A"), y: at("B"), error: at("A") }], { x: 0, y: 0 });
  const scene = plotScene(plot, sources, measure);
  const clip = scene.items.find((item) => item.kind === "clip");
  assert.ok(clip?.kind === "clip");
  const bars = clip.items.find((item) => item.kind === "path" && item.ops.length === 12);
  assert.ok(bars, "a bar and two caps, six commands apiece, for the two points whose error is not 0");
  const texts = flat(scene.items).flatMap((item) => (item.kind === "text" ? [item.text] : []));
  assert.ok(texts.includes("80"), "Y reaches 75 at the top of an error bar, so the axis runs to 80");
  const project = emptyProject();
  project.plots.push(plot);
  const back = parseProject(serializeProject(project, "/lab/a.pfg"), "/lab/a.pfg");
  assert.deepEqual(back.plots[0].series[0].error, at("A"));
});

test("on a log axis a value at or below 0 breaks the line and has no marker; the rest are drawn", () => {
  const plot = plotOf();
  plot.xAxis.log = true;
  const svg = plotSvg(plotScene(plot, sources, measure));
  assert.doesNotMatch(svg, /NaN/);
  assert.match(svg, />10</, "powers of ten label the axis");
});

test("a fit is drawn over its series in its own line; its label is written when asked, as mathematics or plain text; a fit that cannot be made is not drawn", () => {
  const plot = newPlot([], "scatter", [{ x: at("A"), y: at("B") }], { x: 0, y: 0 });
  plot.series[0].fits = [{ ...newFit("linear", "f1"), equation: true, format: "plain", colour: "#C0504D", back: "white" }];
  const scene = plotScene(plot, sources, measure);
  const texts = flat(scene.items).flatMap((item) => (item.kind === "text" ? [item.text] : []));
  assert.ok(texts.some((text) => /^y = -0\.8\*x \+ 72\.67, R\^2 = 0\.9231$/.test(text)), texts.join(" | "));
  const label = flat(scene.items).find((item) => item.kind === "text" && item.text.startsWith("y ="));
  assert.equal(label?.kind === "text" && label.colour, "#C0504D", "in the fit line's colour");
  const curve = (scene.items.find((item) => item.kind === "clip") as { items: SceneItem[] }).items.find((item) => item.kind === "path" && item.ops.length === 200);
  assert.ok(curve?.kind === "path" && curve.stroke?.colour === "#C0504D" && curve.stroke.dash.length === 2, "dashed, in its colour");
  plot.series[0].fits[0].format = "latex";
  assert.ok(flat(plotScene(plot, sources, measure).items).some((item) => item.kind === "text" && item.text.startsWith("$y = −0.8x + 72.67")), "as mathematics");
  plot.series[0].fits[0].enabled = false;
  assert.ok(!flat(plotScene(plot, sources, measure).items).some((item) => item.kind === "text" && item.text.startsWith("$y")), "a fit not drawn has no label");
  plot.series[0].fits[0].enabled = true;
  const clip = scene.items.find((item) => item.kind === "clip");
  assert.ok(clip?.kind === "clip" && clip.items.some((item) => item.kind === "path" && item.ops.length === 200), "the fitted line, 200 points");
  plot.series[0].fits = [{ ...newFit("exponential", "f1"), equation: true }];
  plot.series[0].y = { ...at("B"), rows: { first: 0, last: 0 } };
  assert.doesNotMatch(plotSvg(plotScene(plot, sources, measure)), /NaN/);
});

test("{sheet} in a plot's title is its worksheet's name", () => {
  const plot = plotOf();
  plot.title = "Jominy {sheet}";
  const named = { ...sources, sheet: () => "Bar 2" };
  assert.ok(flat(plotScene(plot, named, measure).items).some((item) => item.kind === "text" && item.text === "Jominy Bar 2"));
});

test("data labels: each point's text right of its marker; ranges of their own rows pair in order to the shortest", () => {
  const plot = newPlot([], "scatter", [{ x: at("A"), y: at("B"), labels: { data: "data-1", column: "Column C", rows: { first: 1, last: 2 } } }], { x: 0, y: 0 });
  const scene = plotScene(plot, sources, measure);
  const texts = flat(scene.items).flatMap((item) => (item.kind === "text" ? [item.text] : []));
  assert.ok(texts.includes("20") && texts.includes("120") && !texts.includes("300"), "labels for the first two points only");
  plot.series[0].x = { data: "data-1", column: "Column A", rows: { first: 2, last: 3 } };
  const data = resolvePlot(plot, sources).drawn[0].data;
  assert.deepEqual([[...data.xs], [...data.ys], data.counts], [[5, 10], [72, 70], { x: 2, y: 3, error: null, labels: 2 }], "X of its own rows pairs with Y's first rows");
  const project = emptyProject();
  project.plots.push(plot);
  assert.deepEqual(parseProject(serializeProject(project, "/lab/a.pfg"), "/lab/a.pfg").plots[0].series[0].labels, plot.series[0].labels);
});

test("columns: text X is a category axis; columns of two series stand side by side on 0; the legend shows a swatch", () => {
  const grades = buildTable({ rows: [["Steel", "Hardness", "Tough"], ["1020", 24, 60], ["1045", 38, 40], ["1095", 56, 15]] });
  const cell = (letter: string): CellRange => ({ data: "data-1", column: `Column ${letter}`, rows: { first: 1, last: 3 } });
  const plot = newPlot([], "column", [{ x: cell("A"), y: cell("B") }, { x: cell("A"), y: cell("C") }], { x: 0, y: 0 });
  const grade = tablesOnly(() => grades);
  const { x, drawn } = resolvePlot(plot, grade);
  assert.deepEqual([x.min, x.max, x.categories], [0.5, 3.5, ["1020", "1045", "1095"]]);
  assert.deepEqual(drawn[0].data.categories, ["1020", "1045", "1095"]);
  const scene = plotScene(plot, grade, measure);
  const clip = scene.items.find((item) => item.kind === "clip");
  const bars = clip?.kind === "clip" ? clip.items.filter((item) => item.kind === "rect") : [];
  assert.equal(bars.length, 6, "three columns of each series");
  const [a, b] = [bars[0], bars[3]];
  assert.ok(a.kind === "rect" && b.kind === "rect" && a.x + a.width <= b.x + 1e-6, "series side by side in a category");
  assert.ok(a.kind === "rect" && Math.abs(a.y + a.height - (clip!.kind === "clip" ? clip.y + clip.height : 0)) < 1e-6, "standing on 0, the axis' start");
  const texts = flat(scene.items).flatMap((item) => (item.kind === "text" ? [item.text] : []));
  assert.ok(["1020", "1045", "1095"].every((name) => texts.includes(name)), "category labels along X");
  plot.legend = true;
  assert.ok(plotScene(plot, grade, measure).items.filter((item) => item.kind === "rect" && item.fill === seriesColour(plot, plot.series[1])).length >= 1);
});

test("the legend takes the top corner that covers less of the data: right by default, left when the data is high at the right", () => {
  const rising = buildTable({ rows: [["x", "a", "b"], [1, 1, 1], [2, 2, 2], [3, 9, 9]] });
  const cell = (letter: string): CellRange => ({ data: "data-1", column: `Column ${letter}`, rows: { first: 1, last: 3 } });
  const plot = newPlot([], "column", [{ x: cell("A"), y: cell("B") }, { x: cell("A"), y: cell("C") }], { x: 0, y: 0 });
  const backing = plotScene(plot, tablesOnly(() => rising), measure).legend!;
  const area = plotScene(plot, tablesOnly(() => rising), measure).layout.area;
  assert.ok(backing.x < area.x + area.width / 2, "high columns at the right: the legend goes left");
  const falling = buildTable({ rows: [["x", "a", "b"], [1, 9, 9], [2, 2, 2], [3, 1, 1]] });
  const right = plotScene(plot, tablesOnly(() => falling), measure).legend!;
  assert.ok(right.x > area.x + area.width / 2, "high at the left: it stays right");
});

test("a point's values for the hover tip: the series' name, X and Y by their names and units, as the cells show them", () => {
  const plot = plotOf();
  const info = pointInfo(plot, plot.series[0].id, 1, sources);
  assert.deepEqual(info, { title: "Hardness", rows: [{ name: "Distance", value: "5 mm" }, { name: "Hardness", value: "70 HRC" }] });
  assert.equal(pointInfo(plot, plot.series[0].id, 9, sources), null);
  assert.equal(pointInfo(plot, "missing", 0, sources), null);
  const unnamed = newPlot([], "scatter", [{ x: null, y: at("B") }], { x: 0, y: 0 });
  assert.deepEqual(pointInfo(unnamed, unnamed.series[0].id, 0, tablesOnly(() => table))?.rows, [{ name: "Row", value: "2" }, { name: "Y", value: "72" }], "the worksheet row, as the X axis counts it");
  const extras = newPlot([], "scatter", [{ x: at("A"), y: at("B"), error: at("C"), labels: at("A") }], { x: 0, y: 0 });
  assert.deepEqual(pointInfo(extras, extras.series[0].id, 2, sources)?.rows.slice(2), [{ name: "Error", value: "± 300 HRC" }, { name: "Label", value: "10" }], "its error and label too");
});

test("residuals asked for: a small plot under the plot area, on the same x, about zero; the plot area gives up the room", () => {
  const plot = newPlot([], "scatter", [{ x: at("A"), y: at("B") }], { x: 0, y: 0 });
  plot.series[0].fits = [newFit("linear", "f1")];
  const before = plotScene(plot, sources, measure);
  plot.series[0].fits[0].residuals = true;
  const after = plotScene(plot, sources, measure);
  const areaOf = (scene: typeof before) => scene.targets.find((target) => target.part.kind === "area" && "box" in target) as { box: { height: number } };
  assert.ok(areaOf(after).box.height < areaOf(before).box.height * 0.75, "the plot area is shorter");
  const texts = flat(after.items).flatMap((item) => (item.kind === "text" ? [item.text] : []));
  assert.ok(texts.includes("0") && texts.some((text) => text === "Residual" || text === "Res."), texts.join(" | "));
  const clips = after.items.filter((item) => item.kind === "clip");
  assert.equal(clips.length, 2, "the data's and the residuals'");
  plot.series[0].fits[0].enabled = false;
  assert.equal(plotScene(plot, sources, measure).items.filter((item) => item.kind === "clip").length, 1, "a fit not drawn has no residuals");
});
