// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Plots: series of ranges of cells, the row number as X, legacy series, axis ranges, ticks and labels, the layout of a plot's parts,
// and the document's plot records.
import assert from "node:assert/strict";
import test from "node:test";
import {
  addSeries, axisScale, axisTicks, axisTitle, buildTable, describeData, emptyProject, layoutPlot, newPlot, newProjectData, DEFAULT_READ,
  niceStep, parseProject, parseRowsInput, plotScale, rowsText, PLOT_SIZE, PLOT_STYLE, PT, seriesData, seriesName, serializeProject, setSeriesRows, tickLabel,
  newNamedRange, axisFraction, scaleLabel, scaleTicks, minorParts, minorStepFits, type CellRange, type PlotAxis, type SeriesPair, seriesColour } from "../../source/engine";

const auto: PlotAxis = { title: null, min: null, max: null, step: null, minorStep: null, log: false };
// The file as it is: the heading row is row 1 (index 0), the numbers below it.
const table = () => buildTable({ rows: [["Distance (mm)", "Hardness (HRC)", "Fit (HRC)", "Note", "Time (s)", "T (°C)"], [3, 71.5, 71.2, "a", 0, 20], [6, 70, null, "b", 1, 35], [9, 68, 68.1, null, 2, 48]] });
const at = (letter: string, rows: { first: number; last: number } | null = null, data = "data-1"): CellRange => ({ data, column: `Column ${letter}`, rows });
const tables = (id: string) => (id === "data-1" ? table() : null);
const pairs: SeriesPair[] = [{ x: at("A"), y: at("B") }, { x: at("A"), y: at("C") }, { x: at("E"), y: at("F") }];

test("a new plot takes the report charts' look: black square markers first, then the next colour and shape", () => {
  const plot = newPlot([], "scatter", pairs, { x: 32, y: 48 });
  assert.equal(plot.id, "plot-1");
  assert.equal(plot.name, "Plot 1");
  assert.deepEqual([plot.x, plot.y, plot.width, plot.height], [32, 48, PLOT_SIZE.width, PLOT_SIZE.height]);
  assert.equal(plot.legend, true, "several series have a legend");
  assert.deepEqual(plot.series.map((series) => [seriesColour(plot, series), series.symbol, series.symbolSize, series.lineWidth, series.dash]),
    [["#000000", "square", 3, 1, "solid"], ["#C0504D", "circle", 3, 1, "solid"], ["#4F81BD", "triangle", 3, 1, "solid"]]);
  assert.deepEqual(plot.series.map((series) => series.connect), ["straight", "straight", "straight"], "points are joined straight");
  assert.equal(newPlot([plot], "line", [pairs[0]], { x: 0, y: 0 }).name, "Plot 2");
  assert.equal(newPlot([], "line", [pairs[0]], { x: 0, y: 0 }).legend, false, "one series has none");
  assert.deepEqual(newPlot([], "line", [], { x: 0, y: 0 }).series, [], "a plot made from the toolbar starts empty");
  assert.equal(addSeries(plot, { x: null, y: at("B", null, "data-2") }, "line").id, "s4");
});

test("the style is the report charts': Libertinus Serif (the system's serif after it), 11 pt title, 10 pt text, 0.75 pt lines, major ticks across, minor inside", () => {
  assert.equal(PLOT_STYLE.font, '"Libertinus Serif", serif');
  assert.deepEqual([PLOT_STYLE.titlePt, PLOT_STYLE.textPt, PLOT_STYLE.linePt, PLOT_STYLE.majorTick, PLOT_STYLE.minorTick, PLOT_STYLE.ink], [11, 10, 0.75, "cross", "in", "#000000"]);
  assert.equal(PT, 4 / 3);
});

test("a series reads its cells; a heading or gap breaks it; names label it; a missing or text range says why", () => {
  const plot = newPlot([], "line", pairs, { x: 0, y: 0 });
  const data = seriesData(plot.series[1], tables);
  assert.ok(typeof data !== "string");
  assert.deepEqual([...data.xs].slice(1), [3, 6, 9]);
  assert.ok(Number.isNaN(data.xs[0]), "the heading row holds no number");
  assert.ok(Number.isNaN(data.ys[2]));
  assert.equal(data.yName, null, "unnamed cells have no name");
  assert.equal(seriesName(plot.series[0], data.yName, "Sheet!C"), "Sheet!C", "unnamed: its reference");
  const names = [newNamedRange([], at("C"), "Fit", "HRC"), newNamedRange([], at("A", { first: 1, last: 3 }), "Distance", "mm")];
  names[1].id = "range-2";
  const named = seriesData(plot.series[1], tables, names);
  assert.ok(typeof named !== "string");
  assert.equal(seriesName(plot.series[1], named.yName, "Sheet!C"), "Fit", "a whole column's name labels any rows of it");
  assert.equal(named.xName, null, "a name of some rows does not label others");
  assert.equal(axisTitle(auto, names[1]), "Distance (mm)", "Axis name (unit)");
  assert.equal(axisTitle({ ...auto, title: "" }, names[1]), "");
  assert.match(String(seriesData({ ...plot.series[0], y: at("Z") }, tables)), /^No column Column Z\.$/);
  assert.match(String(seriesData({ ...plot.series[0], y: at("D") }, tables)), /D holds no numbers/);
  assert.match(String(seriesData({ ...plot.series[0], y: at("B", null, "gone") }, tables)), /^Worksheet missing\.$/);
});

test("a Y alone is plotted against the row number; X and Y of different lengths pair to the shorter", () => {
  const alone = seriesData(newPlot([], "line", [{ x: null, y: at("B", { first: 1, last: 3 }) }], { x: 0, y: 0 }).series[0], tables);
  assert.ok(typeof alone !== "string");
  assert.deepEqual([[...alone.xs], [...alone.ys]], [[2, 3, 4], [71.5, 70, 68]], "the sheet's row numbers, from 1");
  const uneven = seriesData(newPlot([], "line", [{ x: at("A", { first: 1, last: 3 }), y: at("B", { first: 2, last: 3 }) }], { x: 0, y: 0 }).series[0], tables);
  assert.ok(typeof uneven !== "string");
  assert.deepEqual([[...uneven.xs], [...uneven.ys]], [[3, 6], [70, 68]]);
});

test("steps are 1, 2 or 5 times a power of ten; ranges round out to them; positive data starts at zero as in Excel", () => {
  assert.equal(niceStep(100), 20);
  assert.equal(niceStep(0.37), 0.05);
  assert.equal(niceStep(7), 1);
  assert.deepEqual(axisScale(auto, [20, 71.5]), { min: 0, max: 80, step: 10 });
  assert.deepEqual(axisScale(auto, [350, 375]), { min: 350, max: 375, step: 5 }, "a narrow span keeps its own start");
  assert.deepEqual(axisScale(auto, [-3.2, 4.1]), { min: -4, max: 5, step: 1 });
  assert.deepEqual(axisScale({ ...auto, min: 10 }, [20, 71.5]), { min: 10, max: 80, step: 10 }, "a set end is kept");
  assert.deepEqual(axisScale({ ...auto, min: 0, max: 82, step: 10 }, [3, 80]), { min: 0, max: 82, step: 10 });
  assert.deepEqual(axisScale(auto, [5, 5]), { min: 4.4, max: 5.6, step: 0.2 }, "a single value is padded");
  assert.deepEqual(axisScale(auto, null), { min: 0, max: 1, step: 0.2 });
  assert.deepEqual(axisScale({ ...auto, step: 0.000001 }, [0, 100]).step, 20, "a step that would make too many ticks is not taken");
});

test("minor ticks split a major step into round parts, as published plots do", () => {
  assert.deepEqual([1, 2, 5, 10, 0.25, 2.5, 3, 20, 50].map((step) => step / minorParts(step, null)), [0.2, 0.5, 1, 2, 0.05, 0.5, 1, 5, 10], "auto: fifths, quarters, halves or thirds, whichever is a round 1, 2 or 5");
  assert.equal(minorParts(7, null), 1, "no round part of 7: no minor ticks");
  assert.equal(minorParts(10, 0), 1, "none");
  assert.equal(minorParts(10, 2.5), 4, "a typed step that divides the major step");
  assert.equal(minorParts(10, 3), 5, "one that does not is drawn as auto");
  assert.deepEqual([minorStepFits(1, 0.25), minorStepFits(1, 0.3), minorStepFits(1, 1)], [true, false, false]);
  const scale = { min: 0, max: 2, step: 1, log: false };
  assert.deepEqual(scaleTicks(scale, null).minor, [0.2, 0.4, 0.6, 0.8, 1.2, 1.4, 1.6, 1.8]);
  assert.deepEqual(scaleTicks(scale, 0.5).minor, [0.5, 1.5]);
  assert.deepEqual(scaleTicks(scale, 0).minor, []);
});

test("ticks: majors on whole steps, minors between them; labels have the step's decimals and a true minus", () => {
  assert.deepEqual(axisTicks(0, 80, 10, 1).major, [0, 10, 20, 30, 40, 50, 60, 70, 80]);
  assert.deepEqual(axisTicks(0, 80, 10, 1).minor.slice(0, 3), [5, 15, 25]);
  assert.deepEqual(axisTicks(0, 82, 10, 1).minor.at(-1), 75, "no minor tick past the axis' end at 82");
  assert.deepEqual(axisTicks(0, 1, 0.2, 0), { major: [0, 0.2, 0.4, 0.6, 0.8, 1], minor: [] });
  assert.deepEqual(axisTicks(0, 0.3, 0.1, 0).major, [0, 0.1, 0.2, 0.3], "no float error in the values");
  assert.equal(tickLabel(0.30000000000000004, 0.1), "0.3");
  assert.equal(tickLabel(-5, 5), "−5");
  assert.equal(tickLabel(1e-17, 0.1), "0.0");
  assert.equal(tickLabel(70, 10), "70");
  assert.equal(tickLabel(0.25, 0.05), "0.25");
});

/** Ink from character counts: 0.6 em a character, 0.7 em above the baseline, 0.2 em below. */
const measure = (text: string, pt: number) => ({ width: text.length * pt * PT * 0.6, ascent: pt * PT * 0.7, descent: pt * PT * 0.2 });

test("the layout: title on top, Y title and labels at the left, X labels and title below, the plot area in the rest", () => {
  const box = { x: 100, y: 50, width: 480, height: 320 };
  const parts = { title: "Hardness", xTitle: "Distance (mm)", yTitle: "Hardness (HRC)", y2Title: "", yLabels: ["0", "80.0"], y2Labels: null, firstXLabel: "0", lastXLabel: "80" };
  const full = layoutPlot(box, parts, measure);
  const bare = layoutPlot(box, { ...parts, title: "", xTitle: "", yTitle: "", yLabels: ["0"], lastXLabel: "1" }, measure);
  assert.equal(full.scale, 1);
  assert.ok(full.title && Math.abs(full.title.x - (full.area.x + full.area.width / 2)) < 1e-9, "the title is centred on the plot area");
  assert.ok(full.area.y > bare.area.y && full.area.x > bare.area.x && full.area.y + full.area.height < bare.area.y + bare.area.height);
  assert.equal(bare.title, null);
  assert.ok(full.yTitle!.x < full.yLabelsRight && full.yLabelsRight < full.area.x);
  assert.ok(full.xLabelsMiddle > full.area.y + full.area.height && full.xTitle!.y > full.xLabelsMiddle);
  const tiny = layoutPlot({ x: 0, y: 0, width: 40, height: 40 }, { ...parts, title: "T", xTitle: "X", yTitle: "Y", yLabels: ["1000000"], lastXLabel: "1" }, measure);
  assert.ok(tiny.area.width >= 9.99 && tiny.area.height >= 9.99, "the plot area keeps a quarter of the box");
});

test("spacing by belonging: one outer margin, labels close to ticks, titles a step further, the plot area using the room", () => {
  const box = { x: 0, y: 0, width: 480, height: 320 };
  const u = PT, s = PLOT_STYLE, text = s.textPt * u, title = s.titlePt * u, ink = 0.9, near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  assert.ok(s.tickGapPt < s.titleGapPt && s.titleGapPt < s.headGapPt && s.headGapPt <= s.padPt, "closer for parts that belong together");
  const parts = { title: "Hardness", xTitle: "Distance (mm)", yTitle: "Hardness (HRC)", y2Title: "", yLabels: ["0", "80"], y2Labels: null, firstXLabel: "0", lastXLabel: "30" };
  const one = layoutPlot(box, parts, measure);
  const tickOut = s.majorTickPt * u, lastHalf = measure("30", s.textPt).width / 2;
  assert.ok(near(one.yTitle!.x - (text * ink) / 2, s.padPt * u), "the Y title keeps the outer margin from the left border");
  assert.ok(near(one.title!.y, one.area.y / 2), "the title's letters centred between the top edge and the top axis");
  assert.ok(near(box.height - (one.xTitle!.y + (text * ink) / 2), s.padPt * u), "and the X title from the bottom");
  const widest = measure("80", s.textPt).width;
  assert.ok(near(box.width - (one.area.x + one.area.width), one.area.x - widest / 2), "without right numbers, the right axis stands in as far as the left, less half the left's widest number");
  assert.ok(lastHalf > 0);
  assert.ok(near(one.area.x - tickOut - one.yLabelsRight, s.tickGapPt * u), "labels one tick gap past the ticks");
  const labelsLeft = one.yLabelsRight - measure("80", s.textPt).width, yTitleRight = one.yTitle!.x + (text * ink) / 2;
  assert.ok(near(labelsLeft - yTitleRight, s.titleGapPt * u), "the Y title a title gap from its labels");
  // Top and bottom by the Y axes' rule turned: the top as far in as the bottom, less half the X numbers' height, and
  // at least a head gap below the title.
  const labelHeight = text * ink, bottomIn = box.height - (one.area.y + one.area.height);
  assert.ok(near(one.area.y, Math.max(bottomIn - labelHeight / 2, s.padPt * u + title * ink + s.headGapPt * u + labelHeight / 2)), "the top by the bottom, less half the numbers' height");
  assert.ok(one.title!.y - (title * ink) / 2 >= s.padPt * u / 2, "the title clear of the top edge");
  const untitled = layoutPlot(box, { ...parts, title: "" }, measure);
  assert.ok(near(untitled.area.y, box.height - (untitled.area.y + untitled.area.height) - labelHeight / 2), "without a title, exactly the bottom's distance less half the numbers' height");
  assert.ok(near(one.title!.x, one.area.x + one.area.width / 2) && near(one.xTitle!.x, one.title!.x), "titles centred on the plot area");
  const two = layoutPlot(box, { ...parts, y2Title: "Temperature (°C)", y2Labels: ["0", "500"] }, measure);
  assert.ok(two.y2Title && near(box.width - (two.y2Title.x + (text * ink) / 2), s.padPt * u), "the right Y title keeps the outer margin from the right border");
  assert.ok(near(two.y2LabelsLeft - (two.area.x + two.area.width), two.area.x - two.yLabelsRight), "both label columns sit a tick gap past the ticks");
  // With numbers on both sides, both axes stand in equally from their edges, as far as the side that needs more.
  const narrow = layoutPlot(box, { ...parts, yTitle: "", yLabels: ["0", "8"], y2Title: "", y2Labels: ["0", "50000"] }, measure);
  const wide = measure("50000", s.textPt).width;
  assert.ok(near(box.width - (narrow.area.x + narrow.area.width), s.padPt * u + wide + s.tickGapPt * u + tickOut), "the wide side by its own numbers");
  assert.ok(near(narrow.area.x, box.width - (narrow.area.x + narrow.area.width)), "the narrow side as far in as the wide one");
  const titled = layoutPlot(box, { ...parts, yTitle: "Hardness (HRC)", y2Title: "", y2Labels: ["0", "80"] }, measure);
  assert.ok(near(titled.area.x, box.width - (titled.area.x + titled.area.width)), "a side without a title as far in as the side with one");
  // The same along X with a top axis: the top axis as far from the top edge as the bottom one from the bottom, its
  // missing title's room kept; a plot title adds its own room above.
  const topped = layoutPlot(box, { ...parts, title: "", x2Labels: { first: "0", last: "30" }, x2Title: "" }, measure);
  assert.ok(near(topped.area.y, box.height - (topped.area.y + topped.area.height)), "the top X axis as far from the top as the bottom one from the bottom");
  const headed = layoutPlot(box, { ...parts, x2Labels: { first: "0", last: "30" }, x2Title: "" }, measure);
  assert.ok(near(headed.area.y - topped.area.y, title * ink + s.headGapPt * u), "a plot title adds its room above");
  assert.ok(near(headed.title!.y, (headed.area.y - tickOut - s.tickGapPt * u - labelHeight) / 2), "above a top axis, centred between the edge and that axis' numbers");
});

test("with Scale with plot size off, text, lines and gaps keep their size at every plot size; the plot area takes the room; a right Y axis takes the right margin", () => {
  const parts = { title: "Hardness", xTitle: "Distance (mm)", yTitle: "Hardness (HRC)", y2Title: "", yLabels: ["0", "80"], y2Labels: null, firstXLabel: "0", lastXLabel: "80" };
  assert.equal(plotScale({ width: 960, height: 640 }), 2);
  assert.equal(plotScale({ width: 960, height: 320 }), 1, "the lesser ratio, so the text fits");
  const one = layoutPlot({ x: 0, y: 0, width: 480, height: 320 }, parts, measure), two = layoutPlot({ x: 0, y: 0, width: 960, height: 640 }, parts, measure);
  // Twice the size: the 10 pt labels and titles stay 10 pt, so the plot area grows more than twice.
  assert.ok(two.area.width > one.area.width * 2 && two.area.height > one.area.height * 2, "the plot area takes the room the text leaves");
  assert.ok(Math.abs((two.xLabelsMiddle - two.area.y - two.area.height) - (one.xLabelsMiddle - one.area.y - one.area.height)) < 1e-9, "gaps keep their size too");
  assert.equal(two.scale, 1);
  const right = layoutPlot({ x: 0, y: 0, width: 480, height: 320 }, { ...parts, y2Title: "Temperature (°C)", y2Labels: ["0", "500"] }, measure);
  assert.ok(right.area.width < one.area.width, "the right axis' labels and title make room");
  assert.ok(right.y2Title && right.y2Title.x > right.y2LabelsLeft && right.y2LabelsLeft > right.area.x + right.area.width);
  assert.equal(layoutPlot({ x: 0, y: 0, width: 480, height: 320 }, { ...parts, y2Title: "T" }, measure).y2Title, null, "no right axis, no right title");
});

test("plots round-trip in the document; a document without plots writes none; a removed worksheet's series is kept", () => {
  const project = emptyProject();
  project.data.push(newProjectData([], "/lab/h.csv", "h.csv", describeData(new TextEncoder().encode("a,b\n1,2\n")), DEFAULT_READ, [], { x: 0, y: 0, width: 240, height: 192 }));
  assert.ok(!("plots" in JSON.parse(serializeProject(project, "/lab/a.pfg"))));
  const plot = newPlot([], "line-symbol", [{ x: at("A"), y: at("B") }], { x: 256, y: 0 });
  plot.title = "Hardness";
  plot.yAxis = { title: "HRC", min: 10, max: null, step: 10, minorStep: 2, log: false };
  plot.series[0].dash = "dash";
  plot.series[0].name = "Measured";
  setSeriesRows(plot.series[0], { first: 2, last: 9 });
  plot.series[0].connect = "spline";
  project.plots.push(plot);
  const second = newPlot([plot], "line", [{ x: at("A"), y: at("B") }, { x: null, y: at("C") }], { x: 0, y: 0 });
  second.series[1].axis = "y2";
  second.y2Axis.max = 500;
  project.plots.push(second);
  const text = serializeProject(project, "/lab/a.pfg");
  const stored = JSON.parse(text).plots[0];
  assert.deepEqual([stored.series[0].x, stored.series[0].y], [{ data: "data-1", column: "Column A", rows: [2, 9] }, { data: "data-1", column: "Column B", rows: [2, 9] }], "a range's rows are stored as table indices");
  assert.equal(stored.series[0].connect, "spline");
  assert.ok(!("connect" in JSON.parse(text).plots[1].series[0]), "straight is left out");
  assert.equal(JSON.parse(text).plots[1].series[1].x, null, "the row number is stored as no X");
  assert.deepEqual(stored.xAxis, {}, "automatic settings are left out");
  assert.deepEqual(stored.yAxis, { title: "HRC", min: 10, step: 10, minorStep: 2 });
  assert.ok(!("y2Axis" in stored) && !("axis" in stored.series[0]), "no right axis is stored while none is used");
  const right = JSON.parse(text).plots[1];
  assert.deepEqual([right.y2Axis, right.series[1].axis], [{ max: 500 }, "y2"]);
  const back = parseProject(text, "/lab/a.pfg");
  assert.deepEqual(back.plots, project.plots);
  // A document from before the minor step kept a count: none stays none, any other count turns automatic.
  const counted = JSON.parse(text);
  counted.plots[0].yAxis = { minor: 0 }; counted.plots[0].xAxis = { minor: 4 };
  const before = parseProject(JSON.stringify(counted), "/lab/a.pfg").plots[0];
  assert.deepEqual([before.yAxis.minorStep, before.xAxis.minorStep], [0, null]);
  assert.equal(serializeProject(back, "/lab/a.pfg"), text);
  const orphan = JSON.parse(text);
  orphan.data = [];
  assert.equal(parseProject(JSON.stringify(orphan), "/lab/a.pfg").plots[0].series[0].y.data, "data-1");
  const legacy = JSON.parse(text);
  legacy.plots[0].series[0] = { ...legacy.plots[0].series[0], data: "data-1", x: "Time (s)", y: "T", rows: [1, 4] };
  delete legacy.plots[0].series[0].connect;
  const old = parseProject(JSON.stringify(legacy), "/lab/a.pfg").plots[0].series[0];
  assert.deepEqual([old.x, old.y, old.connect], [{ data: "data-1", column: "Time (s)", rows: { first: 1, last: 4 } }, { data: "data-1", column: "T", rows: { first: 1, last: 4 } }, "straight"], "a series from before ranges opens");
  for (const [change, message] of [
    [(raw: any) => { raw.plots[0].series[0].kind = "bar"; }, /invalid kind/],
    [(raw: any) => { raw.plots[0].series[0].ownColour = "red"; }, /invalid colour/],
    [(raw: any) => { raw.plots[0].yAxis.step = 0; }, /invalid Y axis step/],
    [(raw: any) => { raw.plots[0].width = -1; }, /invalid width/],
    [(raw: any) => { raw.plots[0].series[0].y.rows = [5, 2]; }, /invalid y/],
    [(raw: any) => { raw.plots[0].series[0].connect = "wavy"; }, /invalid connect/],
    [(raw: any) => { raw.plots[0].series[0].axis = "y3"; }, /invalid axis/],
    [(raw: any) => { raw.plots[1].y2Axis.step = -1; }, /invalid right Y axis step/],
    [(raw: any) => { raw.plots[1] = raw.plots[0]; }, /two plots with the same id/],
  ] as const) {
    const raw = JSON.parse(text);
    change(raw);
    assert.throws(() => parseProject(JSON.stringify(raw), "/lab/a.pfg"), message);
  }
});

test("a series with rows takes those rows only; rows past the table's end are left out; rows read and show from 1", () => {
  const plot = newPlot([], "line", [{ x: at("A"), y: at("B") }], { x: 0, y: 0 });
  setSeriesRows(plot.series[0], { first: 2, last: 5 });
  assert.deepEqual([plot.series[0].x?.rows, plot.series[0].y.rows], [{ first: 2, last: 5 }, { first: 2, last: 5 }], "X and Y take the rows alike");
  const data = seriesData(plot.series[0], tables);
  assert.ok(typeof data !== "string");
  assert.deepEqual([...data.xs], [6, 9]);
  assert.deepEqual([...data.ys], [70, 68]);
  assert.match(String(seriesData({ ...plot.series[0], y: at("B", { first: 7, last: 9 }) }, tables)), /^No row 8\.$/);
  assert.deepEqual([rowsText(null), rowsText({ first: 3, last: 3 }), rowsText({ first: 0, last: 19 })], ["All", "4", "1–20"]);
  assert.deepEqual([parseRowsInput(""), parseRowsInput(" all "), parseRowsInput("7"), parseRowsInput("20-1"), parseRowsInput("1:20"), parseRowsInput("1–20")],
    [null, null, { first: 6, last: 6 }, { first: 0, last: 19 }, { first: 0, last: 19 }, { first: 0, last: 19 }]);
  assert.throws(() => parseRowsInput("0-4"), /counted from 1/);
  assert.throws(() => parseRowsInput("a-b"), /not a row range/);
});

test("a log axis: ends at powers of ten around the positive data, ticks at each power with 2 to 9 between, labels written out", () => {
  const log: PlotAxis = { ...auto, log: true };
  const scale = axisScale(log, [0.03, 450]);
  assert.deepEqual(scale, { min: 0.01, max: 1000, step: 1, log: true });
  const ticks = scaleTicks(scale, null);
  assert.deepEqual(ticks.major, [0.01, 0.1, 1, 10, 100, 1000]);
  assert.equal(ticks.minor.length, 5 * 8, "2 to 9 times each power, between the ends");
  assert.deepEqual(scaleTicks(scale, 0).minor, [], "no minor ticks");
  assert.deepEqual(ticks.major.map((value) => scaleLabel(scale, value)), ["0.01", "0.1", "1", "10", "100", "1000"]);
  const wide = axisScale(log, [3, 180000]);
  assert.deepEqual(scaleTicks(wide, 0).major.map((value) => scaleLabel(wide, value)), ["10⁰", "10¹", "10²", "10³", "10⁴", "10⁵", "10⁶"], "one style on an axis beyond 10000");
  assert.equal(scaleLabel(axisScale(log, [1e-6, 1]), 1e-6), "10⁻⁶");
  assert.equal(axisFraction(scale, 1), 0.4);
  assert.ok(Number.isNaN(axisFraction(scale, 0)), "0 is not on a log axis");
  assert.deepEqual(axisScale({ ...log, min: 5 }, null), { min: 5, max: 10, step: 1, log: true }, "a set end is kept; no data takes a decade");
  const project = emptyProject();
  const plot = newPlot([], "line", pairs.slice(0, 1), { x: 0, y: 0 });
  plot.yAxis.log = true;
  project.plots.push(plot);
  const text = serializeProject(project, "/lab/a.pfg");
  assert.deepEqual(JSON.parse(text).plots[0].yAxis, { log: true });
  assert.equal(parseProject(text, "/lab/a.pfg").plots[0].yAxis.log, true);
});
