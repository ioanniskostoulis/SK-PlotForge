// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Smoothing and fits: exact recoveries of known curves, R², the ends of a smoothing, points a model cannot take, the
// equations as written, and the document's records.
import assert from "node:assert/strict";
import test from "node:test";
import { buildTable, DEFAULT_FIT, emptyProject, fitLegendName, plotScene, tablesOnly, type CellRange, type SceneItem, fitLabelText, fitNumber, fitSeries, latexEquation, plainEquation, newPlot, parseProject, polyfit, rSquared, serializeProject, type FitKind } from "../../source/engine";

const fit = (kind: FitKind, extra: Partial<typeof DEFAULT_FIT> = {}) => ({ ...DEFAULT_FIT, id: "f1", kind, ...extra });
const close = (a: number, b: number, digits = 6) => assert.ok(Math.abs(a - b) < 10 ** -digits, `${a} ≈ ${b}`);
const xs = [1, 2, 3, 4, 5, 6];

test("linear and polynomial fits recover their curves exactly, with R² 1, written highest power first", () => {
  const line = fitSeries(xs, xs.map((x) => 2 * x + 1), fit("linear"));
  assert.ok(typeof line !== "string");
  assert.equal(line.equation, "y = 2x + 1");
  close(line.r2!, 1);
  assert.equal(line.xs.length, 200);
  const parabola = fitSeries(xs, xs.map((x) => 0.5 * x * x - 3 * x + 2), fit("polynomial", { order: 2 }));
  assert.ok(typeof parabola !== "string");
  assert.equal(parabola.equation, "y = 0.5x² − 3x + 2");
  const c = polyfit([1000, 1001, 1002, 1003], [1, 8, 27, 64].map((v, i) => v + 0 * i), 3);
  assert.ok(c, "high x stays well conditioned");
  assert.match(String(fitSeries([1, 2], [1, 2], fit("polynomial", { order: 2 }))), /needs 3 points/);
});

test("exponential, power and logarithmic fits, as Excel fits them on logarithms; points they cannot take are left out", () => {
  const exp = fitSeries(xs, xs.map((x) => 3 * Math.exp(0.5 * x)), fit("exponential"));
  assert.ok(typeof exp !== "string");
  assert.equal(exp.equation, "y = 3e^(0.5x)");
  close(exp.r2!, 1);
  const power = fitSeries(xs, xs.map((x) => 2 * x ** 1.5), fit("power"));
  assert.ok(typeof power !== "string" && power.equation === "y = 2x^1.5");
  const log = fitSeries(xs, xs.map((x) => 4 - 2 * Math.log(x)), fit("logarithmic"));
  assert.ok(typeof log !== "string" && log.equation === "y = −2 ln(x) + 4");
  const some = fitSeries([0, ...xs], [0, ...xs.map((x) => 3 * Math.exp(0.5 * x))], fit("exponential"));
  assert.ok(typeof some !== "string" && /1 point left out/.test(String(some.equation)));
  assert.match(String(fitSeries([1, 2], [-1, -2], fit("power"))), /above 0/);
});

test("smoothings follow the data point by point: a moving average evens a step; Savitzky–Golay keeps a parabola", () => {
  const average = fitSeries([1, 2, 3, 4, 5], [0, 0, 3, 0, 0], fit("average", { window: 3 }));
  assert.ok(typeof average !== "string");
  assert.deepEqual([...average.ys], [0, 1, 1, 1, 0], "near the ends, of the points there are");
  assert.equal(average.equation, null);
  const sg = fitSeries(xs, xs.map((x) => x * x), fit("savitzky-golay", { window: 5, order: 2 }));
  assert.ok(typeof sg !== "string");
  sg.ys.forEach((value, i) => close(value, xs[i] ** 2));
  const gaps = fitSeries([1, 2, NaN, 4], [1, NaN, 3, 4], fit("average", { window: 3 }));
  assert.ok(typeof gaps !== "string" && gaps.xs.length === 2 ? true : typeof gaps === "string", "points missing a value are left out");
});

test("R², numbers as written, and fits stored with the series", () => {
  close(rSquared([1, 2, 3], [1, 2, 3]), 1);
  close(rSquared([1, 2, 3], [2, 2, 2]), 0);
  assert.deepEqual([fitNumber(-0.012345), fitNumber(123456), fitNumber(0.00001234)], ["−0.01235", "1.235 × 10⁵", "1.234 × 10⁻⁵"]);
  const project = emptyProject();
  const plot = newPlot([], "scatter", [{ x: null, y: { data: "data-1", column: "Column A", rows: null } }], { x: 0, y: 0 });
  plot.series[0].fits = [fit("savitzky-golay", { window: 7, order: 3, equation: true })];
  project.plots.push(plot);
  const text = serializeProject(project, "/lab/a.pfg");
  assert.deepEqual(JSON.parse(text).plots[0].series[0].fits, [{ id: "f1", kind: "savitzky-golay", window: 7, order: 3, dash: "dash", equation: true, format: "latex" }]);
  assert.deepEqual(parseProject(text, "/lab/a.pfg").plots[0].series[0].fits, plot.series[0].fits);
  const bad = JSON.parse(text);
  bad.plots[0].series[0].fits[0].window = 4;
  assert.throws(() => parseProject(JSON.stringify(bad), "/lab/a.pfg"), /fit window/);
});

test("a series saved with one fit, before fits were a list, opens with that fit as it looked: solid, plain text, top left", () => {
  const project = emptyProject();
  project.plots.push(newPlot([], "scatter", [{ x: null, y: { data: "data-1", column: "Column A", rows: null } }], { x: 0, y: 0 }));
  const old = JSON.parse(serializeProject(project, "/lab/a.pfg"));
  old.plots[0].series[0].fit = { kind: "linear", equation: true };
  const [series] = parseProject(JSON.stringify(old), "/lab/a.pfg").plots[0].series;
  assert.equal(series.fits.length, 1);
  assert.deepEqual([series.fits[0].kind, series.fits[0].dash, series.fits[0].format, series.fits[0].place, series.fits[0].equation, series.fits[0].colour], ["linear", "solid", "plain", "auto", true, null]);
  assert.ok(series.fits[0].id, "it is given an id");
});

test("an equation is written as typeset mathematics or as computer notation", () => {
  assert.equal(plainEquation("y = 0.5x² − 3x + 2"), "y = 0.5*x^2 - 3*x + 2");
  assert.equal(plainEquation("y = 1.2 × 10⁻⁵x³ + 4"), "y = 1.2E-5*x^3 + 4");
  assert.equal(plainEquation("y = 2.1e^(−0.3x)"), "y = 2.1*exp(-0.3*x)");
  assert.equal(plainEquation("y = 1.2 ln(x) − 3"), "y = 1.2*ln(x) - 3");
  assert.equal(latexEquation("y = 0.5x² − 3x + 2"), "$y = 0.5x^{2} − 3x + 2$");
  assert.equal(latexEquation("y = 1 + 2e^(−(x − 3)²/(2·1.5²))"), "$y = 1 + 2e^{−(x − 3)^{2}/(2\\cdot 1.5^{2})}$");
  assert.equal(latexEquation("y = 2x^1.5"), "$y = 2x^{1.5}$");
  const line = fitSeries(xs, xs.map((x) => 2 * x + 1), fit("linear", { equation: true }));
  assert.ok(typeof line !== "string");
  assert.equal(fitLabelText(fit("linear", { equation: true }), line), "$y = 2x + 1,\\quad R^{2} = 1$");
  assert.equal(fitLabelText(fit("linear", { equation: true, format: "plain", stats: false }), line), "y = 2*x + 1");
  assert.equal(fitLabelText(fit("linear"), line), null, "nothing while the label is off");
});

test("a fit shown in the legend has a row of its own under its series, and the choice is saved", () => {
  const table = buildTable({ rows: [["X", "Y"], [1, 2], [2, 4], [3, 6]] });
  const at = (column: string): CellRange => ({ data: "data-1", column, rows: { first: 1, last: 3 } });
  const plot = newPlot([], "scatter", [{ x: at("Column A"), y: at("Column B") }], { x: 0, y: 0 });
  plot.legend = true;
  plot.series[0].name = "Copper";
  const measure = (text: string, pt: number) => ({ width: text.length * pt * 0.6, ascent: pt * 0.7, descent: pt * 0.2 });
  const texts = () => plotScene(plot, tablesOnly(() => table), measure).items.flatMap((item: SceneItem) => (item.kind === "text" ? [item.text] : []));
  plot.series[0].fits = [fit("linear")];
  assert.ok(!texts().includes("Linear fit of Copper"), "left out by default");
  plot.series[0].fits = [fit("linear", { legend: true })];
  const shown = texts();
  assert.ok(shown.indexOf("Linear fit of Copper") > shown.indexOf("Copper"), "under its series");
  assert.equal(fitLegendName(fit("average"), "Copper"), "Moving average of Copper");
  const project = emptyProject();
  project.plots.push(plot);
  assert.equal(parseProject(serializeProject(project, null), null).plots[0].series[0].fits[0].legend, true);
});
