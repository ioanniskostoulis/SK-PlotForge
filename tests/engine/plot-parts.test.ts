// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A plot's parts on the work surface: where the scene drew them, the part under a point, and the click levels (plot,
// part, point) with Esc back up, the inspector section each opens and the Terminal's words for them.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTable, calloutAt, choosePoints, swapAxes, PT, chosenPoints, newNamedRange, newPlot, setCallout, nextPart, parsePlots, plotRecord, resolvePlot, parentPart, parsePart, partAt, partName, partOutline, partSection, plotScene, tablesOnly, textBox,
  type CellRange, type NamedRange, type PlotPart, type PlotTarget,
} from "../../source/engine";

const measure = (text: string, pt: number) => ({ width: text.length * pt * 0.8, ascent: pt * 0.93, descent: pt * 0.27 });
const table = buildTable({ rows: [["Distance (mm)", "Hardness (HRC)", "T (°C)"], [0, 72, 20], [5, 70, 120], [10, 64, 300]] });
const at = (letter: string): CellRange => ({ data: "data-1", column: `Column ${letter}`, rows: { first: 1, last: 3 } });
const names: NamedRange[] = [["A", "Distance", "mm"], ["B", "Hardness", "HRC"], ["C", "T", "°C"]].reduce<NamedRange[]>((list, [letter, name, unit]) => [...list, newNamedRange(list, at(letter), name, unit)], []);
const sources = tablesOnly(() => table, names);
const plotOf = () => { const plot = newPlot([], "line-symbol", [{ x: at("A"), y: at("B") }], { x: 200, y: 100 }); plot.title = "Jominy"; plot.legend = true; return plot; };
const boxOf = (targets: readonly PlotTarget[], kind: PlotPart["kind"]) => { const found = targets.find((target) => target.part.kind === kind); return found && "box" in found ? found.box : null; };
const middle = (box: { x: number; y: number; width: number; height: number }) => [box.x + box.width / 2, box.y + box.height / 2] as const;

test("the scene records where its parts went: title, axes and their titles, plot area, legend and each series' points", () => {
  const plot = plotOf(), scene = plotScene(plot, sources, measure);
  const kinds = scene.targets.map((target) => target.part.kind);
  for (const kind of ["title", "axis-title", "axis", "area", "series", "legend"] as const) assert.ok(kinds.includes(kind), kind);
  // In the order a click finds them: the legend over the series, the series over the axes and the plot area.
  assert.ok(kinds.indexOf("legend") < kinds.indexOf("series") && kinds.indexOf("series") < kinds.indexOf("axis") && kinds.indexOf("axis") < kinds.indexOf("area"));
  const series = scene.targets.find((target) => target.part.kind === "series");
  assert.ok(series && "points" in series && series.points.length === 3 && series.line && series.radius > 0);
  assert.deepEqual(series.points.map((point) => point.index), [0, 1, 2]);
  const title = boxOf(scene.targets, "title")!, area = boxOf(scene.targets, "area")!;
  assert.ok(title.y + title.height < area.y, "the title is above the plot area");
});

test("a turned text's box is upright: a Y axis title is taller than it is wide", () => {
  const box = textBox("Hardness (HRC)", 20, 160, 3, 13, "middle", -90, measure, 1);
  assert.ok(box.height > box.width);
  assert.ok(Math.abs(box.y + box.height / 2 - 160) < 1, "centred along the axis");
});

test("the part under a point is the deepest there: a point on its marker, the series on its line, else the box, else the plot", () => {
  const plot = plotOf(), scene = plotScene(plot, sources, measure), id = plot.series[0].id;
  const series = scene.targets.find((target) => "points" in target)!;
  assert.ok("points" in series);
  const [first, second] = series.points;
  assert.deepEqual(partAt(scene.targets, plot, first.x, first.y, 3), { kind: "point", series: id, index: 0 });
  assert.deepEqual(partAt(scene.targets, plot, (first.x + second.x) / 2, (first.y + second.y) / 2, 3), { kind: "series", series: id }, "between markers, on the line");
  assert.deepEqual(partAt(scene.targets, plot, ...middle(boxOf(scene.targets, "title")!), 3), { kind: "title" });
  const xAxis = scene.targets.find((target) => target.part.kind === "axis" && target.part.axis === "x");
  assert.ok(xAxis && "box" in xAxis);
  assert.deepEqual(partAt(scene.targets, plot, xAxis.box.x + 5, xAxis.box.y + xAxis.box.height - 1, 3), { kind: "axis", axis: "x" }, "on a tick label");
  assert.deepEqual(partAt(scene.targets, plot, 3, plot.height - 3, 3), { kind: "plot" }, "the paper's corner");
  assert.equal(partAt(scene.targets, plot, -10, 10, 3), null, "off the plot");
});

test("clicks: a point at once, a line the plot then its series; Esc goes back up", () => {
  const point: PlotPart = { kind: "point", series: "s1", index: 4 };
  assert.deepEqual(nextPart(null, point), point, "a point is chosen at once, the plot selected with it");
  assert.deepEqual(nextPart({ kind: "series", series: "s2" }, point), point, "whatever was chosen before");
  assert.deepEqual(nextPart(null, { kind: "series", series: "s1" }), { kind: "plot" }, "a line's first click selects the plot");
  assert.deepEqual(nextPart({ kind: "plot" }, { kind: "series", series: "s1" }), { kind: "series", series: "s1" });
  assert.deepEqual(nextPart({ kind: "series", series: "s1" }, { kind: "title" }), { kind: "title" }, "once the plot is selected, a title, axis or legend is chosen (Properties follow the selection)");
  assert.deepEqual(nextPart({ kind: "plot" }, { kind: "axis", axis: "x" }), { kind: "axis", axis: "x" });
  assert.deepEqual(nextPart({ kind: "plot" }, { kind: "axis-title", axis: "y" }), { kind: "axis", axis: "y" }, "an axis title chooses its axis");
  assert.deepEqual(nextPart(null, { kind: "axis", axis: "x" }), { kind: "plot" }, "a first click selects the plot");
  assert.deepEqual(nextPart({ kind: "plot" }, { kind: "area" }), { kind: "plot" });
  assert.deepEqual(nextPart({ kind: "plot" }, { kind: "fit", of: "s1", fit: "f1" }), { kind: "fit", of: "s1", fit: "f1" });
  assert.deepEqual(parentPart({ kind: "fit", of: "s1", fit: "f1" }), { kind: "series", series: "s1" });
  assert.deepEqual(parentPart(point), { kind: "series", series: "s1" });
  assert.deepEqual(parentPart({ kind: "legend" }), { kind: "plot" });
  assert.equal(parentPart({ kind: "plot" }), null);
});

test("each part opens its inspector section, is named in words and can be typed in the Terminal", () => {
  assert.equal(partSection({ kind: "title" }), "subject");
  assert.equal(partSection({ kind: "axis-title", axis: "y2" }), "y2axis");
  assert.equal(partSection({ kind: "point", series: "s1", index: 0 }), "series");
  const ids = [{ id: "s1", y: { rows: { first: 1 } } }, { id: "s2", y: { rows: { first: 1 } } }];
  assert.equal(partName({ kind: "point", series: "s2", index: 3 }, ids), "Point at row 5 of series 2", "a point by its worksheet row: its range starts at row 2");
  assert.deepEqual(parsePart("Point 2 5", ids), { kind: "point", series: "s2", index: 3 });
  assert.throws(() => parsePart("point 2 1", ids), /from 2/);
  assert.deepEqual(parsePart("plot", ids), { kind: "plot" });
  assert.throws(() => parsePart("legend", ids), /Name a part/);
  assert.throws(() => parsePart("series 3", ids), /from 1 to 2/);
  assert.throws(() => parsePart("frame", ids), /Name a part/);
});

test("a chosen series is outlined by rings about its markers and a line along them; a point by its ring alone", () => {
  const plot = plotOf(), scene = plotScene(plot, sources, measure), id = plot.series[0].id;
  const whole = partOutline(scene.targets, { kind: "series", series: id }, plot);
  assert.equal(whole.rings.length, 3);
  assert.equal(whole.lines.length, 1);
  const one = partOutline(scene.targets, { kind: "point", series: id, index: 1 }, plot);
  assert.deepEqual([one.rings.length, one.lines.length], [1, 0]);
  assert.deepEqual(partOutline(scene.targets, { kind: "title" }, plot).boxes, [boxOf(scene.targets, "title")]);
});

test("a column's point is its column", () => {
  const plot = newPlot([], "column", [{ x: at("A"), y: at("B") }], { x: 0, y: 0 });
  const scene = plotScene(plot, sources, measure), series = scene.targets.find((target) => "points" in target);
  assert.ok(series && "points" in series && series.points.every((point) => point.bar) && !series.line);
  const bar = series.points[1].bar!;
  assert.deepEqual(partAt(scene.targets, plot, bar.x + bar.width / 2, bar.y + bar.height - 2, 2), { kind: "point", series: plot.series[0].id, index: 1 });
});

test("a series on the top X axis gives the plot a top axis with its own range, ticks, labels and title, above the plot area", () => {
  const plot = newPlot([], "line-symbol", [{ x: at("A"), y: at("B") }, { x: at("C"), y: at("B") }], { x: 0, y: 0 });
  const plain = plotScene(plot, sources, measure);
  plot.series[1].xAxis = "x2";
  const { x, x2, columns } = resolvePlot(plot, sources);
  assert.deepEqual([x.min, x.max], [0, 10], "the bottom axis fits Distance alone");
  assert.ok(x2 && x2.max >= 300, "the top axis fits T");
  assert.equal(columns.x2?.name, "T");
  const scene = plotScene(plot, sources, measure);
  const area = boxOf(scene.targets, "area")!, before = boxOf(plain.targets, "area")!;
  assert.ok(area.y > before.y, "the plot area moves down to make room");
  const top = scene.targets.find((target) => target.part.kind === "axis" && target.part.axis === "x2");
  const title = scene.targets.find((target) => target.part.kind === "axis-title" && target.part.axis === "x2");
  assert.ok(top && "box" in top && top.box.y < area.y - 5, "the top axis' labels are above the plot area");
  assert.ok(title && "box" in title && title.box.y < top.box.y, "its title above its labels");
  const texts = scene.items.flatMap((item) => (item.kind === "text" ? [item.text] : []));
  assert.ok(texts.includes("T (°C)") && texts.includes("300"));
  assert.equal(partSection({ kind: "axis", axis: "x2" }), "x2axis");
});

test("a series' X axis and the top axis' settings are saved, and left out while they are the default", () => {
  const plot = plotOf();
  assert.ok(!("x2Axis" in plotRecord(plot)) && !("xAxis" in (plotRecord(plot).series as Record<string, unknown>[])[0]));
  plot.series[0].xAxis = "x2";
  plot.x2Axis.title = "Time (s)";
  const [back] = parsePlots([JSON.parse(JSON.stringify(plotRecord(plot)))]);
  assert.equal(back.series[0].xAxis, "x2");
  assert.equal(back.x2Axis.title, "Time (s)");
  assert.equal(parsePlots([{ ...plotRecord(plotOf()), x2Axis: undefined }])[0].x2Axis.title, null, "an older document has a default top axis");
});

test("callouts: every point of a series, or one point overruling it; written above the marker in the figure's ink", () => {
  const plot = plotOf(), series = plot.series[0];
  const textsOf = () => plotScene(plot, sources, measure).items.flatMap((item) => (item.kind === "text" ? [item.text] : []));
  setCallout(series, 1, "y");
  assert.deepEqual(series.callouts, { all: null, points: [{ index: 1, text: "y" }] });
  assert.ok(textsOf().includes("70 HRC"), "the Y value as its cell shows it, with the range's unit");
  setCallout(series, null, "xy");
  assert.deepEqual(series.callouts, { all: "xy", points: [] }, "a series' callout clears its points' own");
  setCallout(series, 2, null);
  assert.equal(calloutAt(series, 0), "xy");
  assert.equal(calloutAt(series, 2), null, "a point can hide its callout");
  const texts = textsOf();
  assert.ok(texts.includes("(0, 72)") && texts.includes("(5, 70)") && !texts.includes("(10, 64)"));
  setCallout(series, 2, "xy");
  assert.deepEqual(series.callouts.points, [], "a point like its series keeps nothing of its own");
  const scene = plotScene(plot, sources, measure), target = scene.targets.find((item) => "points" in item)!;
  const callout = scene.items.find((item) => item.kind === "text" && item.text === "(5, 70)");
  assert.ok("points" in target && callout?.kind === "text" && callout.y < target.points[1].y && callout.x === target.points[1].x, "centred above its point");
  const first = scene.items.find((item) => item.kind === "text" && item.text === "(0, 72)"), area = boxOf(scene.targets, "area")!;
  assert.ok(first?.kind === "text" && first.anchor === "start" && first.x > area.x, "a point on the Y axis has its callout set in from it, not over the axis");
  const [back] = parsePlots([JSON.parse(JSON.stringify(plotRecord(plot)))]);
  assert.deepEqual(back.series[0].callouts, series.callouts);
  setCallout(series, null, null);
  assert.ok(!("callouts" in (plotRecord(plot).series as Record<string, unknown>[])[0]), "none is not stored");
});

test("several points of a series: Cmd or Ctrl adds or takes one out, Shift adds a run of the points drawn, Esc goes to the series", () => {
  const point = (index: number): PlotPart => ({ kind: "point", series: "s1", index });
  const drawn = [0, 1, 2, 4, 5];
  const two = choosePoints(point(1), point(4), "toggle", drawn);
  assert.deepEqual(two, { kind: "points", series: "s1", indices: [1, 4] });
  assert.deepEqual(choosePoints(two, point(1), "toggle", drawn), point(4), "taking one out of two leaves a point");
  assert.deepEqual(choosePoints(point(4), point(4), "toggle", drawn), { kind: "series", series: "s1" }, "and of one, the series");
  assert.deepEqual(choosePoints(point(1), point(5), "add", drawn), { kind: "points", series: "s1", indices: [1, 2, 4, 5] }, "a run skips a point not drawn");
  assert.deepEqual(choosePoints({ kind: "series", series: "s1" }, point(2), "toggle", drawn), point(2));
  assert.deepEqual(choosePoints(point(1), { kind: "point", series: "s2", index: 0 }, "toggle", drawn), { kind: "point", series: "s2", index: 0 }, "on another series, that point alone");
  assert.deepEqual(parentPart(two), { kind: "series", series: "s1" });
  assert.equal(partSection(two), "series");
  assert.deepEqual(chosenPoints(two), [1, 4]);
  assert.equal(partName(two, [{ id: "s1", y: { rows: null } }]), "2 points of series 1");
});

test("swapping axes mirrors the plot: series change sides and the axes trade their settings", () => {
  const plot = newPlot([], "line-symbol", [{ x: at("A"), y: at("B") }, { x: at("A"), y: at("C") }], { x: 0, y: 0 });
  plot.series[1].axis = "y2";
  plot.yAxis.title = "Hardness";
  plot.y2Axis.max = 400;
  swapAxes(plot, "y");
  assert.deepEqual(plot.series.map((series) => series.axis), ["y2", "y"]);
  assert.deepEqual([plot.yAxis.max, plot.y2Axis.title], [400, "Hardness"]);
  swapAxes(plot, "x");
  assert.deepEqual(plot.series.map((series) => series.xAxis), ["x2", "x2"], "every series to the top");
  assert.ok(resolvePlot(plot, sources).x2, "the top axis is drawn");
});

test("text is 11 pt for the title and 10 pt for the rest, at any plot size", () => {
  for (const [width, height] of [[480, 320], [960, 640], [240, 160]]) {
    const plot = plotOf();
    Object.assign(plot, { width, height });
    setCallout(plot.series[0], null, "y");
    const texts = plotScene(plot, sources, measure).items.filter((item) => item.kind === "text");
    const title = texts.find((item) => item.kind === "text" && item.text === "Jominy");
    assert.ok(title?.kind === "text" && Math.abs(title.size - 11 * PT) < 1e-9, `title at ${width} × ${height}`);
    assert.ok(texts.every((item) => item.kind !== "text" || item === title || Math.abs(item.size - 10 * PT) < 1e-9), `the rest at ${width} × ${height}`);
  }
});
