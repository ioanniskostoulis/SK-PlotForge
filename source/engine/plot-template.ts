// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Plot templates and batch plotting (2026-11-17), as Excel's chart templates and Origin's batch plotting. A template is
// a plot's look without its cells: size, title, axes, legend, export, and each series' style and fit, applied to
// another plot series by series. Batch plotting makes the same plot of other worksheets: each range of the plot's
// sheet is taken at the same column and rows of the other sheet, as files of the same layout have them.
import { axisTitle, nextPlotId, parsePlots, plotRecord, type ProjectPlot, type PlotSeries } from "./plot";
import { rangeName, type CellRange, type NamedRange } from "./ranges";

/** A template: a name, and a plot whose cells are placeholders; only its look is applied. */
export interface PlotTemplate { name: string; plot: ProjectPlot }

const PLACEHOLDER: CellRange = { data: "template", column: "Column A", rows: null };
type SeriesLook = Omit<PlotSeries, "id" | "x" | "y" | "error" | "labels">;
const lookOf = (series: PlotSeries): SeriesLook => {
  const { id: _id, x: _x, y: _y, error: _error, labels: _labels, ...look } = series;
  // A template's callouts are for every point; single points' are of its own data.
  return structuredClone({ ...look, callouts: { all: look.callouts.all, points: [] } });
};

/** A template of a plot's look, under a name. */
export function plotTemplate(plot: ProjectPlot, name: string): PlotTemplate {
  const copy = structuredClone(plot);
  copy.series = copy.series.map((series) => ({ ...series, x: series.x ? PLACEHOLDER : null, y: PLACEHOLDER, error: null, labels: null }));
  return { name: name.trim(), plot: { ...copy, id: "template", name: name.trim(), x: 0, y: 0 } };
}

/**
 * Give a plot a template's look, keeping its own place, name and cells: its size, title, axes, legend and export,
 * and series by series the style and fit of the template's series in order (the last one's for series beyond them).
 */
export function applyTemplate(plot: ProjectPlot, template: PlotTemplate): void {
  const look = template.plot;
  Object.assign(plot, {
    width: look.width, height: look.height, title: look.title, legend: look.legend, legendPlace: look.legendPlace, legendBack: look.legendBack, exportFormat: look.exportFormat, exportDpi: look.exportDpi,
    xAxis: structuredClone(look.xAxis), yAxis: structuredClone(look.yAxis), y2Axis: structuredClone(look.y2Axis), x2Axis: structuredClone(look.x2Axis),
  });
  if (!look.series.length) return;
  plot.series = plot.series.map((series, index) => ({ ...series, ...lookOf(look.series[Math.min(index, look.series.length - 1)]), name: series.name }));
}

export function templateRecord(template: PlotTemplate): Record<string, unknown> {
  return { name: template.name, plot: plotRecord(template.plot) };
}

/** A template from storage, or null when it is damaged (it is then left out, not an error). */
export function parseTemplate(raw: any): PlotTemplate | null {
  if (!raw || typeof raw !== "object" || typeof raw.name !== "string" || !raw.name.trim()) return null;
  try { const [plot] = parsePlots([raw.plot]); return plot ? { name: raw.name, plot } : null; } catch { return null; }
}

/** The worksheet a plot is of: that of its first series' Y. */
export const plotSheet = (plot: ProjectPlot): string | null => plot.series[0]?.y.data ?? null;

/**
 * The same plot of other worksheets, one per sheet: each range of the plot's sheet is taken at the same column and
 * rows of the other sheet; ranges of a third sheet stay. Labels that came from names of the plot's cells are kept as
 * written (a series' legend name, an axis title), as the other sheet's cells have no names. Each is named after its
 * sheet, and "{sheet}" in the title becomes the sheet's name. Placed by `place`, in order.
 */
export function batchPlots(plot: ProjectPlot, sheets: readonly { id: string; name: string }[], existing: readonly ProjectPlot[], names: readonly NamedRange[], place: (index: number) => { x: number; y: number }): ProjectPlot[] {
  const from = plotSheet(plot);
  if (!from) return [];
  const made: ProjectPlot[] = [];
  const taken = new Set(existing.map((item) => item.name.toLowerCase()));
  sheets.filter((sheet) => sheet.id !== from).forEach((sheet, index) => {
    const copy = structuredClone(plot);
    const move = (cells: CellRange | null) => (cells && cells.data === from ? { ...cells, data: sheet.id } : cells);
    // Labels from names, frozen before the cells move.
    const firstX = plot.series[0]?.x ? rangeName(names, plot.series[0].x) : null;
    const firstY = (axis: "y" | "y2") => { const series = plot.series.find((item) => item.axis === axis); return series ? rangeName(names, series.y) : null; };
    copy.xAxis.title = copy.xAxis.title ?? (firstX ? axisTitle(copy.xAxis, firstX) : null);
    copy.yAxis.title = copy.yAxis.title ?? (firstY("y") ? axisTitle(copy.yAxis, firstY("y")) : null);
    copy.y2Axis.title = copy.y2Axis.title ?? (firstY("y2") ? axisTitle(copy.y2Axis, firstY("y2")) : null);
    const topX = plot.series.find((item) => item.xAxis === "x2")?.x ?? null, firstX2 = topX ? rangeName(names, topX) : null;
    copy.x2Axis.title = copy.x2Axis.title ?? (firstX2 ? axisTitle(copy.x2Axis, firstX2) : null);
    copy.series = copy.series.map((series) => ({ ...series, name: series.name ?? rangeName(names, series.y)?.name ?? null, x: move(series.x), y: move(series.y)!, error: move(series.error), labels: move(series.labels) }));
    let name = `${plot.name} (${sheet.name})`;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${plot.name} (${sheet.name}) ${n}`;
    taken.add(name.toLowerCase());
    const at = place(index);
    made.push({ ...copy, id: nextPlotId([...existing, ...made]), name, title: copy.title.replace(/\{sheet\}/g, sheet.name), x: at.x, y: at.y });
  });
  return made;
}
