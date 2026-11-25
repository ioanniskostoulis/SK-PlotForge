// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Plot templates (a plot's look without its cells) and batch plotting (the same plot of other worksheets).
import assert from "node:assert/strict";
import test from "node:test";
import { applyTemplate, batchPlots, newFit, newNamedRange, newPlot, parseTemplate, plotTemplate, templateRecord, type CellRange } from "../../source/engine";

const at = (letter: string, data = "data-1", rows: { first: number; last: number } | null = { first: 1, last: 9 }): CellRange => ({ data, column: `Column ${letter}`, rows });
const styled = () => {
  const plot = newPlot([], "line-symbol", [{ x: at("A"), y: at("B"), error: at("C") }, { x: at("A"), y: at("D") }], { x: 100, y: 50 });
  Object.assign(plot, { width: 600, height: 400, title: "Jominy {sheet}", legend: false });
  plot.yAxis = { ...plot.yAxis, log: true, min: 1 };
  plot.series[0].colour = "#4F81BD";
  plot.series[0].fits = [newFit("linear", "f1")];
  plot.series[1].connect = "spline";
  return plot;
};

test("a template keeps a plot's look without its cells, and gives it to another plot series by series", () => {
  const template = plotTemplate(styled(), " Report ");
  assert.equal(template.name, "Report");
  assert.ok(template.plot.series.every((series) => series.y.data === "template" && series.error === null), "no cells are kept");
  const other = newPlot([], "scatter", [{ x: null, y: at("E", "data-2") }, { x: null, y: at("F", "data-2") }, { x: null, y: at("G", "data-2") }], { x: 7, y: 8 });
  other.series[0].name = "Kept";
  applyTemplate(other, template);
  assert.deepEqual([other.x, other.y, other.width, other.height, other.title, other.legend, other.yAxis.log], [7, 8, 600, 400, "Jominy {sheet}", false, true]);
  assert.deepEqual(other.series.map((series) => [series.y.column, series.colour, series.connect, series.kind]), [["Column E", "#4F81BD", "straight", "line-symbol"], ["Column F", null, "spline", "line-symbol"], ["Column G", null, "spline", "line-symbol"]], "cells kept; the last style for series beyond; a colour not picked follows the palette");
  assert.equal(other.series[0].name, "Kept");
  assert.equal(other.series[0].fits[0]?.kind, "linear");
  const back = parseTemplate(JSON.parse(JSON.stringify(templateRecord(template))));
  assert.deepEqual(back, template);
  assert.equal(parseTemplate({ name: "x", plot: { broken: true } }), null, "a damaged template is left out");
});

test("batch plotting: the same plot of other sheets, same columns and rows; labels from names kept; {sheet} in titles", () => {
  const plot = styled();
  plot.series[1].y = at("D", "data-9");
  const names = [newNamedRange([], at("B"), "Hardness", "HRC")];
  const sheets = [{ id: "data-1", name: "Bar 1" }, { id: "data-2", name: "Bar 2" }, { id: "data-3", name: "Bar 3" }];
  const made = batchPlots(plot, sheets, [plot], names, (index) => ({ x: index * 10, y: 500 }));
  assert.deepEqual(made.map((item) => [item.id, item.name, item.title, item.x]), [["plot-2", "Plot 1 (Bar 2)", "Jominy Bar 2", 0], ["plot-3", "Plot 1 (Bar 3)", "Jominy Bar 3", 10]], "the plot's own sheet is left out");
  assert.deepEqual([made[0].series[0].x, made[0].series[0].y, made[0].series[0].error], [at("A", "data-2"), at("B", "data-2"), at("C", "data-2")]);
  assert.deepEqual(made[0].series[1].y, at("D", "data-9"), "a range of a third sheet stays");
  assert.deepEqual([made[0].series[0].name, made[0].yAxis.title], ["Hardness", "Hardness (HRC)"], "names' labels kept as written");
  assert.deepEqual(plot.series[0].y, at("B"), "the plot itself is unchanged");
});
