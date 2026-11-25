// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Mathematics between dollar signs in a plot's text: parsed, laid out in runs, drawn on the canvas and in the SVG alike.
import assert from "node:assert/strict";
import test from "node:test";
import { buildTable, hasMath, layoutMath, newPlot, plotScene, plotSvg, PT, tablesOnly, type CellRange, type SceneItem } from "../../source/engine";

const measure = (text: string, pt: number) => ({ width: [...text].length * pt * PT * 0.5, ascent: pt * PT * 0.7, descent: pt * PT * 0.2 });
const families = { text: "Text", math: "Math" };
const runs = (text: string) => layoutMath(text, 10, PT, measure, families).runs;

test("dollar signs: a pair is mathematics, \\$ and a lone one are text", () => {
  assert.equal(hasMath("Stress $\\sigma$ (MPa)"), true);
  assert.equal(hasMath("Cost in $"), false);
  assert.equal(hasMath("\\$5 and \\$10"), true, "laid out, to write the dollar signs");
  assert.equal(hasMath("Plain"), false);
  assert.deepEqual(runs("\\$5").map((run) => run.text), ["$5"]);
});

test("maths: italic letters, Greek, symbols, operators spaced, functions and \\mathrm upright", () => {
  const all = (text: string) => runs(text).map((run) => run.text).join("");
  assert.equal(all("$x$"), "𝑥");
  assert.equal(all("$h$"), "ℎ");
  assert.equal(all("$\\alpha\\Delta$"), "𝛼Δ");
  assert.equal(all("$a+b=c$"), "𝑎 + 𝑏 = 𝑐");
  assert.equal(all("$-1$"), "−1", "a leading minus is unary, unspaced");
  assert.equal(all("$\\sin\\theta$"), "sin𝜃");
  assert.equal(all("$\\mathrm{Fe_3C}$").replace(/[^A-Za-z]/g, ""), "FeC");
  assert.equal(all("$\\text{max load}$"), "max load");
  assert.equal(all("$\\frac{a}{b}$"), "𝑎/𝑏");
  assert.equal(all("$\\frac{a+b}{2}$"), "(𝑎 + 𝑏)/2");
  assert.equal(all("$5\\times10^{3}$"), "5 × 103");
  assert.equal(all("$\\foo$"), "\\foo", "an unknown command shows as written");
  const mixed = runs("Area ($\\mu$m$^2$)");
  assert.deepEqual(mixed.map((run) => run.family), ["Text", "Math", "Text", "Math", "Text"]);
});

test("scripts: smaller, raised or dropped, stacked when both, nested smaller still", () => {
  const [base, sup] = runs("$x^2$");
  assert.equal(base.size, 10);
  assert.ok(sup.size < base.size && sup.dy < 0 && sup.dx > base.dx);
  const [, sub] = runs("$x_i$");
  assert.ok(sub.dy > 0);
  const [, low, high] = runs("$x_i^2$");
  assert.equal(low.dx, high.dx, "a subscript and superscript stacked");
  assert.ok(high.dy < 0 && low.dy > sub.dy, "the subscript drops further under a superscript");
  const nested = runs("$e^{x^2}$");
  assert.ok(nested[2].size < nested[1].size && nested[2].dy < nested[1].dy);
  const { ink } = layoutMath("$x^2$", 10, PT, measure, families);
  assert.ok(ink.ascent > measure("x", 10 / PT).ascent, "a superscript reaches higher than the letters");
});

test("a plot draws mathematics in runs, on the canvas and in the SVG", () => {
  const table = buildTable({ rows: [["X", "Y"], [0, 1], [1, 2]] });
  const at = (column: string): CellRange => ({ data: "data-1", column, rows: { first: 1, last: 2 } });
  const plot = newPlot([], "scatter", [{ x: at("Column A"), y: at("Column B") }], { x: 0, y: 0 });
  plot.title = "Fit $R^2$";
  plot.yAxis.title = "$\\sigma$ (MPa)";
  const scene = plotScene(plot, tablesOnly(() => table), (text, pt) => measure(text, pt));
  const texts = scene.items.flatMap((item: SceneItem) => (item.kind === "text" ? [item] : []));
  const title = texts.find((item) => item.text === "Fit $R^2$")!;
  assert.ok(title.runs && title.runs.length === 3);
  const width = title.runs.at(-1)!.dx + measure(title.runs.at(-1)!.text, title.runs.at(-1)!.size / PT).width - title.runs[0].dx;
  assert.ok(Math.abs(title.runs[0].dx + width / 2) < 1e-9, "centred as one text");
  const svg = plotSvg(scene);
  assert.match(svg, /<tspan [^>]*>𝑅<\/tspan>/);
  assert.doesNotMatch(svg, /\$R\^2\$/);
  assert.ok(texts.find((item) => item.text === "$\\sigma$ (MPa)")?.runs, "axis titles too");
});
