// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Nonlinear fits: each model recovers a known curve from its own starting values, the statistics match a hand
// computation, weights, fixed values and the x range change what is fitted, a custom formula is read safely, and the
// records keep every setting.
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FIT, emptyProject, fitParameterNames, fitSeries, newPlot, parseExpression, parseProject, serializeProject, tQuantile95,
  type FitKind, type FitResult, type SeriesFit,
} from "../../source/engine";

const fit = (kind: FitKind, extra: Partial<SeriesFit> = {}): SeriesFit => ({ ...DEFAULT_FIT, id: "f1", kind, ...extra });
const steps = (from: number, to: number, count: number) => Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
const solved = (result: FitResult | string): FitResult => { assert.equal(typeof result, "object", String(result)); return result as FitResult; };
const value = (result: FitResult, name: string) => result.parameters!.find((parameter) => parameter.name === name)!.value;
const near = (a: number, b: number, tolerance: number) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`);

test("each model recovers its own curve from the starting values it guesses", () => {
  const cases: [FitKind, (x: number) => number, Record<string, number>, number[], Partial<SeriesFit>?][] = [
    ["exponential-1", (x) => 2 + 5 * Math.exp(-x / 3), { y0: 2, A: 5, t: 3 }, steps(0, 15, 40)],
    ["exponential-2", (x) => 1 + 4 * Math.exp(-x / 0.5) + 3 * Math.exp(-x / 6), { y0: 1, t1: 0.5, t2: 6 }, steps(0, 30, 80)],
    ["gaussian", (x) => 1 + 8 * Math.exp(-((x - 4) ** 2) / (2 * 0.7 ** 2)), { y0: 1, A: 8, xc: 4, w: 0.7 }, steps(0, 10, 60)],
    ["lorentzian", (x) => 0.5 + (6 * 1.2 ** 2) / ((x - 5) ** 2 + 1.2 ** 2), { y0: 0.5, A: 6, xc: 5, w: 1.2 }, steps(0, 10, 60)],
    ["boltzmann", (x) => 10 + (1 - 10) / (1 + Math.exp((x - 5) / 0.8)), { A1: 1, A2: 10, x0: 5, dx: 0.8 }, steps(0, 10, 50)],
    ["logistic-4", (x) => 2 + (20 - 2) / (1 + (3 / x) ** 1.5), { bottom: 2, top: 20, EC50: 3, hill: 1.5 }, steps(0.1, 30, 60)],
    ["michaelis-menten", (x) => (12 * x) / (2.5 + x), { Vmax: 12, Km: 2.5 }, steps(0.2, 20, 30)],
    ["gaussians", (x) => 0.2 + 5 * Math.exp(-((x - 3) ** 2) / 0.5) + 3 * Math.exp(-((x - 7) ** 2) / 0.5), { xc1: 3, xc2: 7 }, steps(0, 10, 100), { order: 2 }],
  ];
  for (const [kind, curve, expected, x, extra] of cases) {
    const result = solved(fitSeries(x, x.map(curve), fit(kind, extra)));
    assert.ok(result.converged, kind);
    for (const [name, wanted] of Object.entries(expected)) near(value(result, name), wanted, 1e-3 * Math.max(1, Math.abs(wanted)));
    near(result.statistics!.r2, 1, 1e-9);
  }
});

test("the statistics are those of a hand computation: SSE, R², adjusted R², RMSE and the slope's 95% interval", () => {
  const x = [1, 2, 3, 4, 5], y = [2.1, 3.9, 6.2, 7.8, 10.1];
  const result = solved(fitSeries(x, y, fit("linear")));
  const { statistics } = result;
  // y = 1.99x + 0.05; residuals 0.06, −0.13, 0.18, −0.21, 0.10.
  near(value(result, "slope"), 1.99, 1e-9);
  near(statistics!.sse, 0.107, 1e-9);
  near(statistics!.rmse, Math.sqrt(0.107 / 3), 1e-9);
  near(statistics!.r2, 1 - 0.107 / 39.708, 1e-9);
  near(statistics!.adjR2, 1 - ((1 - statistics!.r2) * 4) / 3, 1e-9);
  const se = Math.sqrt(0.107 / 3 / 10), slope = result.parameters![1];
  near(slope.se!, se, 1e-9);
  near(slope.high! - slope.value, tQuantile95(3) * se, 1e-9);
  near(tQuantile95(3), 3.182446, 1e-5);
  near(tQuantile95(1000), 1.962339, 1e-5);
});

test("weights, fixed values and the x range change what is fitted", () => {
  const x = steps(0, 10, 41), y = x.map((v) => 1 + 8 * Math.exp(-((v - 4) ** 2) / 2) + (v > 8 ? 5 : 0));
  const ranged = solved(fitSeries(x, y, fit("gaussian", { from: 0, to: 7.9 })));
  near(value(ranged, "xc"), 4, 1e-4);
  assert.ok(ranged.count < x.length);
  const held = solved(fitSeries(x, y.map((v, i) => (x[i] > 8 ? v - 5 : v)), fit("gaussian", { fixed: { y0: 0 } })));
  assert.equal(value(held, "y0"), 0);
  assert.equal(held.parameters!.find((p) => p.name === "y0")!.se, null);
  const line = [1, 2, 3, 4], counts = [10, 21, 29, 42];
  const plain = solved(fitSeries(line, counts, fit("linear"))), weighted = solved(fitSeries(line, counts, fit("linear", { weights: "counts" })));
  assert.notEqual(value(plain, "slope"), value(weighted, "slope"));
  assert.match(String(fitSeries([1, 2, 3], [1, 2, 3], fit("gaussian", { from: 10 }))), /x range/);
});

test("a custom formula is read without running code, names its parameters, and fits them", () => {
  const read = parseExpression("a * exp(-b * x) + c");
  assert.ok(typeof read !== "string");
  assert.deepEqual(read.parameters, ["a", "b", "c"]);
  near(read.evaluate(2, [3, 0.5, 1]), 3 * Math.exp(-1) + 1, 1e-12);
  near((parseExpression("-x^2 + 2^-k") as Exclude<ReturnType<typeof parseExpression>, string>).evaluate(3, [1]), -9 + 0.5, 1e-12);
  for (const [text, message] of [["alert(1)", /not a function/], ["x + ", /ends too soon/], ["x; a", /cannot hold ;/], ["2 * x", /no parameter/], ["a * (x", /Expected \)/], ["exp * a", /in brackets/]] as const) {
    assert.match(String(parseExpression(text)), message, text);
  }
  const x = steps(0, 5, 30);
  const result = solved(fitSeries(x, x.map((v) => 4 * Math.exp(-0.7 * v) + 2), fit("custom", { expression: "a * exp(-b * x) + c", start: { a: 1, b: 1, c: 0 } })));
  near(value(result, "b"), 0.7, 1e-5);
  assert.deepEqual(fitParameterNames(fit("custom", { expression: "k * x^n" })), ["k", "n"]);
  assert.match(String(fitSeries(x, x, fit("custom", { expression: "sin(" }))), /ends too soon/);
});

test("a fit that does not converge says so, and a fit with too few points says why", () => {
  assert.match(String(fitSeries([1, 2, 3], [1, 2, 1], fit("logistic-5"))), /needs 5 points/);
  assert.match(String(fitSeries([-1, -2, -3, -4, -5], [1, 2, 3, 4, 5], fit("logistic-4"))), /x above 0/);
});

test("fits keep their formula, starting and fixed values, weights and range in the document", () => {
  const project = emptyProject();
  const plot = newPlot([], "scatter", [{ x: null, y: { data: "data-1", column: "Column A", rows: null } }], { x: 0, y: 0 });
  plot.series[0].fits = [fit("custom", { expression: "a * x + b", start: { a: 2 }, fixed: { b: 1 }, weights: "relative", from: 1, to: 9, equation: true, colour: "#C0504D", lineWidth: 2, place: "bottom-right", back: "white", residuals: true })];
  project.plots.push(plot);
  const text = serializeProject(project, "/lab/a.pfg");
  assert.deepEqual(JSON.parse(text).plots[0].series[0].fits, [{ id: "f1", kind: "custom", expression: "a * x + b", start: { a: 2 }, fixed: { b: 1 }, weights: "relative", from: 1, to: 9,
    colour: "#C0504D", lineWidth: 2, dash: "dash", equation: true, format: "latex", place: "bottom-right", back: "white", residuals: true }]);
  assert.deepEqual(parseProject(text, "/lab/a.pfg").plots[0].series[0].fits, plot.series[0].fits);
  const bad = JSON.parse(text);
  bad.plots[0].series[0].fits[0].weights = "heavy";
  assert.throws(() => parseProject(JSON.stringify(bad), "/lab/a.pfg"), /fit weights/);
});
