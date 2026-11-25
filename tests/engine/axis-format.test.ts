// Licensed under the GNU General Public License v2 or later. See LICENSE.
// An axis' format: numbers, percentages, and dates for date cells.
import assert from "node:assert/strict";
import test from "node:test";
import { axisScale, buildTable, newPlot, parsePlots, plotRecord, resolvePlot, scaleLabel, scaleTicks, tablesOnly, type CellRange, type PlotAxis } from "../../source/engine";

const axis = (patch: Partial<PlotAxis> = {}): PlotAxis => ({ title: null, min: null, max: null, step: null, minorStep: null, log: false, ...patch });
const day = (d: number, h = 0) => Date.UTC(2026, 2, d, h);

test("a percentage axis reads 0.25 as 25% on the same ticks as numbers", () => {
  const scale = axisScale(axis({ format: "percent" }), [0, 0.8]);
  const labels = scaleTicks(scale, null).major.map((value) => scaleLabel(scale, value));
  assert.deepEqual([labels[0], labels[2], labels[labels.length - 1]], ["0%", "20%", "80%"]);
});

test("a date axis counts in round time units and labels its ticks by them", () => {
  const days = axisScale(axis(), [day(1), day(6)], true);
  assert.equal(days.format, "date");
  assert.deepEqual(scaleTicks(days, null).major.map((value) => scaleLabel(days, value)), ["1 Mar", "2 Mar", "3 Mar", "4 Mar", "5 Mar", "6 Mar"]);
  assert.deepEqual(scaleTicks(days, null).minor, []);
  const hours = axisScale(axis(), [day(1, 6), day(1, 18)], true);
  assert.equal(scaleLabel(hours, scaleTicks(hours, null).major[1]), "09:00");
  // A typed step is in days, and an explicit format wins over the cells.
  assert.equal(axisScale(axis({ step: 2 }), [day(1), day(9)], true).step, 2 * 86400000);
  assert.equal(axisScale(axis({ format: "number" }), [day(1), day(9)], true).format, undefined);
});

test("date cells as X give a date axis; the format is kept with the plot only when set", () => {
  const table = buildTable({ rows: [[{ date: day(1) }, 20], [{ date: day(3) }, 24], [{ date: day(5) }, 22]] });
  const at = (column: string): CellRange => ({ data: "d", column, rows: null });
  const plot = newPlot([], "line", [{ x: at(table.columns[0].key), y: at(table.columns[1].key) }], { x: 0, y: 0 });
  assert.equal(resolvePlot(plot, tablesOnly(() => table, [])).x.format, "date");
  assert.ok(!("format" in (plotRecord(plot).yAxis as object)));
  plot.yAxis.format = "percent";
  assert.equal(parsePlots([JSON.parse(JSON.stringify(plotRecord(plot)))])[0].yAxis.format, "percent");
});
