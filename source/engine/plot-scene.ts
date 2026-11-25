// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A plot as a vector scene (2026-11-16): its paper, frame, ticks, labels, titles, series and legend as rectangles,
// paths and text in content pixels from the plot's top-left corner. One scene is drawn three ways: on the work surface's
// canvas at any zoom, as an SVG file, and rasterised at a print resolution as PNG or JPEG, so that what is exported is
// what is shown, and nothing is a scaled bitmap. Text sits on its alphabetic baseline at an offset the scene computes,
// so that the canvas and SVG viewers place it alike.
import {
  axisFraction, axisScale, axisTitle, categoryScale, scaleLabel, scaleTicks, DASH_PATTERNS, extent, inkCentre, inkHeight, labelPlacement, layoutPlot, PLOT_STYLE, PT, seriesData, seriesName, tickLabel,
  calloutAt, seriesColour, type AxisScale, type PlotAxis, type SeriesXAxis, type LineConnect, type MeasureText, type TextInk, type PlotKind, type PlotLayout, type PlotNudge, type PlotSeries, type ProjectPlot, type SeriesAxis, type SeriesData, type SymbolShape,
} from "./plot";
import type { DataTable } from "./table";
import { rangeReference, rangeTexts, type CellRange, type NamedRange } from "./ranges";
import { generalNumber } from "./number-format";
import { fitSeries, FIT_NAMES, fitLabelText, fitLegendName, fitNumber, type FitLabelPlace, type FitResult, type SeriesFit } from "./fits";
import { textFamilies, textFamily, textScale } from "./plot-text";
import { hasMath, layoutMath, withMath, type TextRun } from "forge-shell/app/text-math";
import { jpegWithDpi, pngWithDpi } from "forge-shell/app/raster-export";
import { sortTargets, textBox, unionBox, type PartBox, type PartPoint, type PlotTarget } from "./plot-parts";

export interface Stroke { colour: string; width: number; dash: readonly number[] }

/** Path commands; `C` is a cubic Bezier to (x, y), `circle` a full circle. Coordinates are content pixels from the plot's top-left corner. */
export type PathOp = { op: "M" | "L"; x: number; y: number } | { op: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: "Z" } | { op: "circle"; x: number; y: number; r: number };

export type SceneItem =
  /** `crisp` lines are put on whole device pixels by a raster renderer, so a frame and its ticks stay sharp. */
  /** `series` marks a series' own drawing (its columns, error bars, line and markers), so the work surface can show it chosen. */
  | { kind: "rect"; x: number; y: number; width: number; height: number; fill?: string; stroke?: Stroke; crisp?: boolean; series?: string }
  | { kind: "path"; ops: PathOp[]; fill?: string; stroke?: Stroke; crisp?: boolean; cap: "butt" | "square"; join: "miter" | "round"; series?: string; fit?: string }
  /** Text at (x, y), turned by `rotate` degrees about it; `dy` is the baseline's offset along the turned text's up–down.
   * A text with mathematics has `runs`, each from (x, y) as anchored, which are drawn instead of `text`. */
  | { kind: "text"; text: string; x: number; y: number; dy: number; size: number; anchor: "start" | "middle" | "end"; rotate: number; colour: string; family: string; runs?: TextRun[] }
  | { kind: "clip"; x: number; y: number; width: number; height: number; items: SceneItem[] };

export interface PlotScene {
  width: number;
  height: number;
  items: SceneItem[];
  /** Where a plot none of whose series can be drawn says why; the work surface shows it, an export does not. */
  message: { text: string; x: number; y: number; size: number } | null;
  /** Where the parts went, and the legend's backing; for tools that point at them, such as the plot lab. */
  layout: PlotLayout;
  legend: { x: number; y: number; width: number; height: number } | null;
  /** Steps added above an automatic Y axis so that the legend clears the data (resolvePlot's headroom). */
  headroom: number;
  /** Where each part was drawn, in the order a click finds them (plot-parts.ts). */
  targets: PlotTarget[];
}

/** Where a plot's numbers and labels come from: the worksheets' tables, the document's named ranges and the sheets' names. */
export interface PlotSources { table(id: string): DataTable | null; names: readonly NamedRange[]; sheet(id: string): string }

/** Sources of tables alone, without names; sheets are called Sheet. */
export const tablesOnly = (table: (id: string) => DataTable | null, names: readonly NamedRange[] = []): PlotSources => ({ table, names, sheet: () => "Sheet" });

/** A series' Y range as the legend calls it without a name: "Sheet!B2:B40". */
export function seriesReference(series: PlotSeries, sources: PlotSources): string {
  return rangeReference(series.y, sources.sheet(series.y.data), sources.table(series.y.data));
}

/**
 * What a point says while the pointer rests on it (2026-11-19): its series' name, then its X and Y as their cells show
 * them, each by its range's name with its unit ("Distance", "5 mm"), its error (± …) and its label when it has them.
 * Null for a series or point that is not there.
 */
export function pointInfo(plot: ProjectPlot, seriesId: string, index: number, sources: PlotSources): { title: string; rows: { name: string; value: string }[] } | null {
  const series = plot.series.find((item) => item.id === seriesId);
  const data = series ? seriesData(series, (id) => sources.table(id), sources.names) : null;
  if (!series || !data || typeof data === "string" || index < 0 || index >= data.ys.length) return null;
  const shown = (cells: CellRange | null | undefined) => { const texts = cells ? rangeTexts(cells, sources.table(cells.data)) : null; return typeof texts === "string" ? null : texts; };
  const cell = (cells: CellRange | null | undefined, value: number) => shown(cells)?.[index]?.trim() || generalNumber(value);
  const unit = (name: NamedRange | null) => (name?.unit ? ` ${name.unit}` : "");
  const x = data.categories ? data.categories[index] ?? "" : series.x ? cell(series.x, data.xs[index]) : String(data.xs[index]);
  const rows = [
    { name: data.xName?.name ?? (series.x ? "X" : "Row"), value: `${x}${unit(data.xName)}` },
    { name: data.yName?.name ?? "Y", value: `${cell(series.y, data.ys[index])}${unit(data.yName)}` },
  ];
  if (data.es && Number.isFinite(data.es[index])) rows.push({ name: "Error", value: `± ${cell(series.error, data.es[index])}${unit(data.yName)}` });
  const label = data.labels?.[index]?.trim();
  if (label) rows.push({ name: "Label", value: label });
  return { title: seriesName(series, data.yName, seriesReference(series, sources)), rows };
}

/** A point's description as hover details take it: the series' name, then one value per line ("Distance = 5 mm"). */
export function pointLines(info: ReturnType<typeof pointInfo>): string[] | null {
  return info ? [info.title, ...info.rows.map((row) => `${row.name} = ${row.value}`)] : null;
}

/** A fit of a series as computed now: its result, or why it cannot be made. */
export interface DrawnFit { fit: SeriesFit; result: FitResult | string }
/** A series that can be drawn, with its points, and each of its fits. */
export interface DrawnSeries { series: PlotSeries; data: SeriesData; fits: DrawnFit[] }

function* positives(all: Iterable<number>): Generator<number> { for (const value of all) if (value > 0) yield value; }

/** Every finite value of some columns, without copying them. */
function* values(arrays: readonly Float64Array[]): Generator<number> { for (const array of arrays) yield* array; }

/**
 * What a plot shows: its drawable series, the reasons the others cannot be drawn, and its scales. The right Y axis
 * (`y2`) is there while a series is on it; each Y axis fits the series on it.
 */
export function resolvePlot(plot: ProjectPlot, sources: PlotSources, headroom = 0) {
  const drawn: DrawnSeries[] = [], problems: { series: PlotSeries; reason: string }[] = [];
  for (const series of plot.series) {
    const data = seriesData(series, (id) => sources.table(id), sources.names);
    if (typeof data === "string") problems.push({ series, reason: data }); else drawn.push({ series, data, fits: series.fits.map((fit) => ({ fit, result: fitSeries(data.xs, data.ys, fit) })) });
  }
  const on = (axis: SeriesAxis) => drawn.filter((item) => item.series.axis === axis);
  // A log axis fits the data above 0 only.
  const fit = (axis: { log: boolean }, arrays: Float64Array[]) => extent(axis.log ? positives(values(arrays)) : values(arrays));
  // Text X cells make a category axis; columns stand on 0, so a Y axis with columns reaches it, and a numeric X axis
  // with columns reaches half a spacing beyond the first and last, so that the outer columns are whole.
  // Each X axis (bottom, and top while a series is on it) fits the series drawn against it.
  const xScale = (axis: PlotAxis, series: readonly DrawnSeries[]): AxisScale => {
    const categories = series.find((item) => item.data.categories)?.data.categories ?? null;
    if (categories) return categoryScale(categories);
    const columnSeries = series.filter((item) => item.series.kind === "column");
    const xArrays = series.map((item) => item.data.xs);
    if (columnSeries.length) {
      const spread = extent(values(columnSeries.map((item) => item.data.xs)));
      const half = columnSpacing(columnSeries.map((item) => item.data.xs)) / 2;
      if (spread) xArrays.push(Float64Array.of(spread[0] - half, spread[1] + half));
    }
    return axisScale(axis, fit(axis, xArrays), series.length > 0 && series.every((item) => item.data.xDates));
  };
  const onX = (axis: SeriesXAxis) => drawn.filter((item) => item.series.xAxis === axis);
  const yReach = (item: DrawnSeries) => (item.series.kind === "column" ? [...reach(item.data), Float64Array.of(0)] : reach(item.data));
  const x = xScale(plot.xAxis, onX("x"));
  const x2 = plot.series.some((series) => series.xAxis === "x2") ? xScale(plot.x2Axis, onX("x2")) : null;
  // Headroom: steps added to an automatic Y axis' end, so that the legend clears the data (plotScene asks for it).
  const raise = (scale: AxisScale, axis: { max: number | null }): AxisScale => (headroom && axis.max === null
    ? { ...scale, max: Number((scale.log ? scale.max * 10 ** headroom : scale.max + headroom * scale.step).toPrecision(12)) } : scale);
  const dated = (items: readonly DrawnSeries[]) => items.length > 0 && items.every((item) => item.data.yDates);
  const y = raise(axisScale(plot.yAxis, fit(plot.yAxis, on("y").flatMap(yReach)), dated(on("y"))), plot.yAxis);
  const y2Base = plot.series.some((series) => series.axis === "y2") ? axisScale(plot.y2Axis, fit(plot.y2Axis, on("y2").flatMap(yReach)), dated(on("y2"))) : null;
  const y2 = y2Base ? raise(y2Base, plot.y2Axis) : null;
  /** The name each axis takes its automatic title from: that of the first series drawn on it. */
  const columns = { x: onX("x")[0]?.data.xName ?? null, y: on("y")[0]?.data.yName ?? null, y2: on("y2")[0]?.data.yName ?? null, x2: onX("x2")[0]?.data.xName ?? null };
  return { drawn, problems, x, y, y2, x2, columns };
}

/** The values a series reaches on its Y axis: its points, and with error bars their ends. */
function reach(data: SeriesData): Float64Array[] {
  if (!data.es) return [data.ys];
  const es = data.es;
  return [data.ys, data.ys.map((value, i) => value - Math.abs(es[i])), data.ys.map((value, i) => value + Math.abs(es[i]))];
}

/** How much of the data a box covers: the columns it overlaps and the points of lines and markers inside it. */
function covered(box: { x: number; y: number; width: number; height: number }, data: readonly SceneItem[], markers: readonly SceneItem[]): number {
  const inside = (x: number, y: number) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
  let count = 0;
  for (const item of [...data, ...markers]) {
    if (item.kind === "rect") { if (item.x < box.x + box.width && item.x + item.width > box.x && item.y < box.y + box.height && item.y + item.height > box.y) count++; }
    else if (item.kind === "path") for (const op of item.ops) if ("x" in op && "y" in op && inside(op.x, op.y)) count++;
  }
  return count;
}

/** The least distance between two neighbouring X values of columns, in data units; 1 when there is none. */
function columnSpacing(arrays: readonly Float64Array[]): number {
  const all = [...new Set(arrays.flatMap((array) => [...array].filter(Number.isFinite)))].sort((a, b) => a - b);
  let least = Infinity;
  for (let i = 1; i < all.length; i++) least = Math.min(least, all[i] - all[i - 1]);
  return Number.isFinite(least) && least > 0 ? least : 1;
}

const hasLine = (kind: PlotKind) => kind !== "scatter" && kind !== "column";

type Point = readonly [number, number];

/**
 * A line through a run of points as path commands, joined as Origin's Connect does: straight; a spline through every
 * point (a natural cubic spline of y on x while x keeps one direction, else a Catmull–Rom curve); a cubic B-spline the
 * points steer, held to the first and last; a Bezier curve of every three steps (each fourth point is on the curve,
 * the two between steer it); or steps across, then up or down. The curves are cubic Bezier segments, so the canvas,
 * the SVG and the print draw the same line.
 */
export function connectOps(points: readonly Point[], connect: LineConnect): PathOp[] {
  const n = points.length;
  if (!n) return [];
  const ops: PathOp[] = [{ op: "M", x: points[0][0], y: points[0][1] }];
  const line = (p: Point) => ops.push({ op: "L", x: p[0], y: p[1] });
  const curve = (a: Point, b: Point, p: Point) => ops.push({ op: "C", x1: a[0], y1: a[1], x2: b[0], y2: b[1], x: p[0], y: p[1] });
  if (connect === "straight" || n < 3 && connect !== "step") { for (let i = 1; i < n; i++) line(points[i]); return ops; }
  if (connect === "step") { for (let i = 1; i < n; i++) { line([points[i][0], points[i - 1][1]]); line(points[i]); } return ops; }
  if (connect === "spline") {
    const slopes = splineSlopes(points);
    if (slopes) {
      for (let i = 0; i + 1 < n; i++) {
        const [x0, y0] = points[i], [x1, y1] = points[i + 1], h = (x1 - x0) / 3;
        curve([x0 + h, y0 + slopes[i] * h], [x1 - h, y1 - slopes[i + 1] * h], points[i + 1]);
      }
      return ops;
    }
    for (let i = 0; i + 1 < n; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
      curve([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2);
    }
    return ops;
  }
  if (connect === "bspline") {
    const p = [points[0], points[0], ...points, points[n - 1], points[n - 1]];
    const mix = (a: Point, b: Point, c: Point, wa: number, wb: number, wc: number): Point => [(a[0] * wa + b[0] * wb + c[0] * wc) / 6, (a[1] * wa + b[1] * wb + c[1] * wc) / 6];
    for (let i = 0; i + 3 < p.length; i++) {
      const b = p[i + 1], c = p[i + 2], d = p[i + 3];
      curve(mix(b, c, c, 4, 2, 0), mix(b, c, c, 2, 4, 0), mix(b, c, d, 1, 4, 1));
    }
    return ops;
  }
  // Bezier: cubic pieces from every third point; one or two points left over close with a line or a quadratic piece.
  let i = 0;
  for (; i + 3 < n; i += 3) curve(points[i + 1], points[i + 2], points[i + 3]);
  if (n - 1 - i === 2) {
    const [a, q, b] = [points[i], points[i + 1], points[i + 2]];
    curve([a[0] + (2 / 3) * (q[0] - a[0]), a[1] + (2 / 3) * (q[1] - a[1])], [b[0] + (2 / 3) * (q[0] - b[0]), b[1] + (2 / 3) * (q[1] - b[1])], b);
  } else if (n - 1 - i === 1) line(points[n - 1]);
  return ops;
}

/** The slopes of the natural cubic spline of y on x at each point, or null when x does not keep one direction. */
function splineSlopes(points: readonly Point[]): number[] | null {
  const n = points.length, h: number[] = [];
  for (let i = 0; i + 1 < n; i++) h.push(points[i + 1][0] - points[i][0]);
  if (!(h.every((step) => step > 0) || h.every((step) => step < 0))) return null;
  const d = h.map((step, i) => (points[i + 1][1] - points[i][1]) / step);
  // Second derivatives M, zero at the ends: h[i-1] M[i-1] + 2 (h[i-1] + h[i]) M[i] + h[i] M[i+1] = 6 (d[i] - d[i-1]).
  const m = new Array<number>(n).fill(0), c = new Array<number>(n).fill(0), r = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const diagonal = 2 * (h[i - 1] + h[i]) - h[i - 1] * c[i - 1];
    c[i] = h[i] / diagonal;
    r[i] = (6 * (d[i] - d[i - 1]) - h[i - 1] * r[i - 1]) / diagonal;
  }
  for (let i = n - 2; i >= 1; i--) m[i] = r[i] - c[i] * m[i + 1];
  return points.map((_, i) => (i < n - 1 ? d[i] - (h[i] * (2 * m[i] + m[i + 1])) / 6 : d[n - 2] + (h[n - 2] * (m[n - 2] + 2 * m[n - 1])) / 6));
}
const hasSymbol = (kind: PlotKind) => kind !== "line" && kind !== "column";

/** A series' line at a scale: its colour, width and dash, the dash in multiples of the width. */
/** A series with the colour it is drawn in (`seriesColour`): its picked one or the data palette's. */
type PaintedSeries = PlotSeries & { colour: string };

function seriesStroke(series: PaintedSeries, k: number): Stroke {
  const width = series.lineWidth * PT * k;
  return { colour: series.colour, width, dash: DASH_PATTERNS[series.dash].map((part) => part * width) };
}

/** A marker centred on a point, `size` across, as path commands; cross and plus are stroked, the rest filled. */
function symbolOps(ops: PathOp[], shape: SymbolShape, x: number, y: number, size: number): void {
  const r = size / 2;
  if (shape === "square") ops.push({ op: "M", x: x - r, y: y - r }, { op: "L", x: x + r, y: y - r }, { op: "L", x: x + r, y: y + r }, { op: "L", x: x - r, y: y + r }, { op: "Z" });
  else if (shape === "circle") ops.push({ op: "circle", x, y, r });
  else if (shape === "triangle") { const h = r * 1.15; ops.push({ op: "M", x, y: y - h }, { op: "L", x: x + h, y: y + h * 0.75 }, { op: "L", x: x - h, y: y + h * 0.75 }, { op: "Z" }); }
  else if (shape === "diamond") { const h = r * 1.3; ops.push({ op: "M", x, y: y - h }, { op: "L", x: x + h, y }, { op: "L", x, y: y + h }, { op: "L", x: x - h, y }, { op: "Z" }); }
  else if (shape === "cross") ops.push({ op: "M", x: x - r, y: y - r }, { op: "L", x: x + r, y: y + r }, { op: "M", x: x + r, y: y - r }, { op: "L", x: x - r, y: y + r });
  else ops.push({ op: "M", x: x - r, y }, { op: "L", x: x + r, y }, { op: "M", x, y: y - r }, { op: "L", x, y: y + r });
}

/** A series' markers as one path item. */
function symbolsItem(series: PaintedSeries, points: readonly [number, number][], k: number, minLine: number): SceneItem {
  const ops: PathOp[] = [], size = series.symbolSize * PT * k;
  for (const [x, y] of points) symbolOps(ops, series.symbol, x, y, size);
  const stroked = series.symbol === "cross" || series.symbol === "plus";
  return stroked
    ? { kind: "path", ops, stroke: { colour: series.colour, width: Math.max(minLine, size * 0.2), dash: [] }, cap: "butt", join: "miter" }
    : { kind: "path", ops, fill: series.colour, cap: "butt", join: "miter" };
}

/** One point's marker as its series draws it, in a colour: for showing a chosen point on the work surface. */
export function pointMarker(series: PlotSeries, x: number, y: number, scene: PlotScene, colour: string): SceneItem {
  const k = scene.layout.scale, item = symbolsItem({ ...series, colour }, [[x, y]], k, PLOT_STYLE.linePt * PT * k);
  return item;
}

/**
 * A plot's scene, every size at the plot's scale (plotScale): the paper and its border, the title, the plot area's
 * frame, ticks, labels and axis titles (the right Y axis' while a series is on it), the series' lines clipped to the
 * plot area and their markers whole, and the legend on white in its top-right corner. `measure` gives text widths in the plot's font.
 */
export function plotScene(plot: ProjectPlot, sources: PlotSources, plainMeasure: MeasureText, nudge: PlotNudge = {}, headroom = 0): PlotScene {
  // Text between dollar signs is mathematics (forge-shell text-math), measured piece by piece.
  const measure = withMath(plainMeasure, PT, textFamilies);
  const s = PLOT_STYLE, box = { x: 0, y: 0, width: plot.width, height: plot.height };
  const { drawn, problems, x: xs, y: ys, y2: y2s, x2: x2s, columns } = resolvePlot(plot, sources, headroom);
  const xTicks = scaleTicks(xs, plot.xAxis.minorStep), yTicks = scaleTicks(ys, plot.yAxis.minorStep);
  const y2Ticks = y2s ? scaleTicks(y2s, plot.y2Axis.minorStep) : null;
  const xLabels = xTicks.major.map((value) => scaleLabel(xs, value)), yLabels = yTicks.major.map((value) => scaleLabel(ys, value));
  const y2Labels = y2s && y2Ticks ? y2Ticks.major.map((value) => scaleLabel(y2s, value)) : null;
  const x2Ticks = x2s ? scaleTicks(x2s, plot.x2Axis.minorStep) : null;
  const x2Labels = x2s && x2Ticks ? x2Ticks.major.map((value) => scaleLabel(x2s, value)) : null;
  const x2Title = x2s ? axisTitle(plot.x2Axis, columns.x2) : "";
  const xTitle = axisTitle(plot.xAxis, columns.x), yTitle = axisTitle(plot.yAxis, columns.y), y2Title = y2s ? axisTitle(plot.y2Axis, columns.y2) : "";
  // "{sheet}" in a title is the plot's worksheet's name, as batch plotting writes it.
  const title = plot.title.includes("{sheet}") && plot.series[0] ? plot.title.replace(/\{sheet\}/g, sources.sheet(plot.series[0].y.data)) : plot.title;
  const angles = { x: plot.xAxis.angle ?? 0, y: plot.yAxis.angle ?? 0, y2: plot.y2Axis.angle ?? 0, x2: plot.x2Axis.angle ?? 0 };
  const layout = layoutPlot(box, { title, xTitle, yTitle, y2Title, yLabels, y2Labels, firstXLabel: xLabels[0] ?? "", lastXLabel: xLabels.at(-1) ?? "", xLabels,
    x2Title, x2Labels: x2Labels ? { first: x2Labels[0] ?? "", last: x2Labels.at(-1) ?? "", all: x2Labels } : null, angles }, measure, nudge);
  // Residuals asked for (2026-11-19): a small plot under the plot area, on the same x, takes the area's lower part; the
  // X axis' numbers and title stay at the bottom, under it, as residual plots are drawn in papers.
  const residualFits = drawn.flatMap(({ series, fits }) => fits.flatMap(({ fit, result }) => (fit.enabled && fit.residuals && typeof result !== "string" && result.residuals?.length ? [{ series, fit, result }] : [])));
  let panel: { x: number; y: number; width: number; height: number } | null = null;
  if (residualFits.length) {
    const full = layout.area, room = s.textPt * PT * textScale(layout.scale) * 1.4, strip = Math.round(full.height * 0.28);
    if (full.height - strip - room > full.height * 0.4) {
      panel = { x: full.x, width: full.width, y: full.y + full.height - strip, height: strip };
      layout.area = { ...full, height: full.height - strip - room };
      const shift = (full.height - layout.area.height) / 2;
      if (layout.yTitle) layout.yTitle = { ...layout.yTitle, y: layout.yTitle.y - shift };
      if (layout.y2Title) layout.y2Title = { ...layout.y2Title, y: layout.y2Title.y - shift };
    }
  }
  const { area, scale: k } = layout;
  const line = s.linePt * PT * k, ink: Stroke = { colour: s.ink, width: line, dash: [] };
  // Text keeps its size at every plot size: 11 pt title, 10 pt for everything else.
  const ts = textScale(k), textSize = s.textPt * PT * ts, titleSize = s.titlePt * PT * ts;
  /** A text whose letters are centred on (x, y) across its baseline, by its own ink or by `ink` shared with its row. */
  const text = (value: string, x: number, y: number, size: number, anchor: "start" | "middle" | "end", rotate = 0, ink?: TextInk): SceneItem => {
    const item: SceneItem = { kind: "text", text: value, x, y, dy: inkCentre(ink ?? measure(value, size / PT)), size, anchor, rotate, colour: s.ink, family: textFamily(value) };
    if (!hasMath(value)) return item;
    const laid = layoutMath(value, size, PT, plainMeasure, textFamilies());
    const start = anchor === "start" ? 0 : anchor === "end" ? -laid.ink.width : -laid.ink.width / 2;
    return { ...item, runs: laid.runs.map((run) => ({ ...run, dx: run.dx + start })) };
  };
  const items: SceneItem[] = [
    { kind: "rect", x: 0, y: 0, width: box.width, height: box.height, fill: s.paper },
    { kind: "rect", x: line / 2, y: line / 2, width: box.width - line, height: box.height - line, stroke: ink, crisp: true },
  ];
  /** The box a text item's ink covers, for pointing at its part. */
  const inkBox = (item: SceneItem | null): PartBox | null => (item?.kind === "text" ? textBox(item.text, item.x, item.y, item.dy, item.size, item.anchor, item.rotate, measure, PT) : null);
  const targets: PlotTarget[] = [{ part: { kind: "area" }, box: { ...area } }];
  const placed = (item: SceneItem | null, part: Extract<PlotTarget, { box: PartBox }>["part"]) => {
    const box = inkBox(item);
    if (item) items.push(item);
    if (box) targets.push({ part, box });
  };
  placed(layout.title ? text(title, layout.title.x, layout.title.y, titleSize, "middle") : null, { kind: "title" });
  placed(layout.xTitle ? text(xTitle, layout.xTitle.x, layout.xTitle.y, textSize, "middle") : null, { kind: "axis-title", axis: "x" });
  placed(layout.yTitle ? text(yTitle, layout.yTitle.x, layout.yTitle.y, textSize, "middle", -90) : null, { kind: "axis-title", axis: "y" });
  placed(layout.y2Title ? text(y2Title, layout.y2Title.x, layout.y2Title.y, textSize, "middle", -90) : null, { kind: "axis-title", axis: "y2" });
  placed(layout.x2Title ? text(x2Title, layout.x2Title.x, layout.x2Title.y, textSize, "middle") : null, { kind: "axis-title", axis: "x2" });
  const across = (range: AxisScale) => (value: number) => area.x + axisFraction(range, value) * area.width;
  const X = across(xs), X2 = x2s ? across(x2s) : X;
  const along = (range: AxisScale) => (value: number) => area.y + area.height - axisFraction(range, value) * area.height;
  const Y = along(ys), Y2 = y2s ? along(y2s) : Y;
  // The frame, then the ticks on the bottom, left and right axes: major across the axis, minor inside.
  const left = area.x, right = area.x + area.width, top = area.y, bottom = area.y + area.height;
  items.push({ kind: "path", ops: [{ op: "M", x: left, y: top }, { op: "L", x: right, y: top }, { op: "L", x: right, y: bottom }, { op: "L", x: left, y: bottom }, { op: "Z" }], stroke: ink, crisp: true, cap: "square", join: "miter" });
  const major = s.majorTickPt * PT * k, minor = s.minorTickPt * PT * k, out = s.majorTick === "cross" ? major : 0;
  const ticks: PathOp[] = [];
  const tick = (x1: number, y1: number, x2: number, y2: number) => ticks.push({ op: "M", x: x1, y: y1 }, { op: "L", x: x2, y: y2 });
  for (const value of xTicks.major) tick(X(value), bottom - major, X(value), bottom + out);
  for (const value of xTicks.minor) tick(X(value), bottom - minor, X(value), bottom);
  for (const value of yTicks.major) tick(left + major, Y(value), left - out, Y(value));
  for (const value of yTicks.minor) tick(left + minor, Y(value), left, Y(value));
  if (y2Ticks) {
    for (const value of y2Ticks.major) tick(right - major, Y2(value), right + out, Y2(value));
    for (const value of y2Ticks.minor) tick(right - minor, Y2(value), right, Y2(value));
  }
  if (x2Ticks) {
    for (const value of x2Ticks.major) tick(X2(value), top + major, X2(value), top - out);
    for (const value of x2Ticks.minor) tick(X2(value), top + minor, X2(value), top);
  }
  items.push({ kind: "path", ops: ticks, stroke: ink, crisp: true, cap: "butt", join: "miter" });
  // Tick labels on their anchors, level or turned (labelPlacement).
  const at = layout.labelAnchors, place = { x: labelPlacement("x", angles.x), y: labelPlacement("y", angles.y), y2: labelPlacement("y2", angles.y2), x2: labelPlacement("x2", angles.x2) };
  const xLabelItems = xTicks.major.map((value, index) => text(xLabels[index], X(value), at.x, textSize, place.x.anchor, place.x.rotate));
  const yLabelItems = yTicks.major.map((value, index) => text(yLabels[index], at.y, Y(value), textSize, place.y.anchor, place.y.rotate));
  const y2LabelItems = y2Ticks && y2Labels ? y2Ticks.major.map((value, index) => text(y2Labels[index], at.y2, Y2(value), textSize, place.y2.anchor, place.y2.rotate)) : [];
  const x2LabelItems = x2Ticks && x2Labels ? x2Ticks.major.map((value, index) => text(x2Labels[index], X2(value), at.x2, textSize, place.x2.anchor, place.x2.rotate)) : [];
  items.push(...xLabelItems, ...yLabelItems, ...y2LabelItems, ...x2LabelItems);
  // An axis is its ticks and their labels.
  const axisBox = (labels: SceneItem[], band: PartBox) => unionBox([band, ...labels.map(inkBox)])!;
  targets.push({ part: { kind: "axis", axis: "x" }, box: axisBox(xLabelItems, { x: left, y: bottom - major, width: area.width, height: major + out }) });
  targets.push({ part: { kind: "axis", axis: "y" }, box: axisBox(yLabelItems, { x: left - out, y: top, width: out + major, height: area.height }) });
  if (x2Ticks) targets.push({ part: { kind: "axis", axis: "x2" }, box: axisBox(x2LabelItems, { x: left, y: top - out, width: area.width, height: out + major }) });
  if (y2Ticks) targets.push({ part: { kind: "axis", axis: "y2" }, box: axisBox(y2LabelItems, { x: right - major, y: top, width: out + major, height: area.height }) });
  // The series: lines broken at a missing value, clipped to the plot area; then the markers over them, drawn whole, as
  // Excel does, so that a point on the frame (the end of an automatic axis) is not cut in half. A point outside the
  // plot area (beyond an axis end that was set) has no marker.
  const edge = 1e-6 * Math.max(area.width, area.height);
  const within = (px: number, py: number) => px >= area.x - edge && px <= area.x + area.width + edge && py >= area.y - edge && py <= area.y + area.height + edge;
  const data: SceneItem[] = [], markers: SceneItem[] = [], callouts: SceneItem[] = [];
  // Columns side by side, as Excel's clustered columns: together 60 % of the least spacing between X values, each
  // series its share, standing on 0 (on a log axis, on its start).
  const group = drawn.filter((item) => item.series.kind === "column");
  const spacingPx = Math.abs(X(xs.min + columnSpacing(group.map((item) => item.data.xs))) - X(xs.min)) || area.width / 4;
  const barWidth = (spacingPx * 0.6) / Math.max(1, group.length);
  const baseOf = (scale: AxisScale, V: (value: number) => number) => V(scale.log ? scale.min : Math.min(Math.max(0, scale.min), scale.max));
  // Each series drawn in its colour (a picked one, or the data palette's for its place), as a painted copy so that
  // the scene's series stay the plot's own for choosing.
  const painted = new Map(plot.series.map((series): [PlotSeries, PaintedSeries] => [series, { ...series, colour: seriesColour(plot, series) }]));
  const paint = (series: PlotSeries): PaintedSeries => painted.get(series) ?? { ...series, colour: seriesColour(plot, series) };
  for (const { series, data: points, fits } of drawn) {
    const index = group.findIndex((item) => item.series === series);
    const V = series.axis === "y2" ? Y2 : Y;
    const pen: Pen = {
      X: series.xAxis === "x2" ? X2 : X, V, area, k, line, within,
      ...(index >= 0 ? { bar: { offset: (index - (group.length - 1) / 2) * barWidth, width: barWidth, base: baseOf(series.axis === "y2" && y2s ? y2s : ys, V) } } : {}),
    };
    targets.push(seriesTarget(series, points, pen));
    callouts.push(...calloutItems(series, points, pen, sources, measure, text));
    const drawnSeries = seriesItems(paint(series), points, pen);
    data.push(...drawnSeries.under);
    if (drawnSeries.markers) markers.push(drawnSeries.markers);
    for (const { fit, result } of fits) if (fit.enabled && typeof result !== "string") {
      const curve = fitItem(paint(series), fit, result, pen);
      if (!curve || curve.kind !== "path") continue;
      data.push(curve);
      // The curve as a part of the plot, within the plot area as it is clipped there.
      const runs: { x: number; y: number }[][] = [];
      let open = false;
      for (const op of curve.ops) {
        if (op.op !== "M" && op.op !== "L") continue;
        if (!within(op.x, op.y)) { open = false; continue; }
        if (op.op === "M" || !open) runs.push([]);
        runs.at(-1)!.push({ x: op.x, y: op.y });
        open = true;
      }
      targets.push({ part: { kind: "fit", of: series.id, fit: fit.id }, runs: runs.filter((run) => run.length > 1) });
    }
  }
  items.push({ kind: "clip", x: area.x, y: area.y, width: area.width, height: area.height, items: data }, ...markers);
  for (const { series, data: points } of drawn) {
    const pen = { X: series.xAxis === "x2" ? X2 : X, V: series.axis === "y2" ? Y2 : Y, area, k, line, within };
    if (points.labels) items.push(...labelItems(series, points, pen, measure, text));
  }
  items.push(...callouts);
  if (panel) items.push(...residualItems(panel, X, xTicks, residualFits.map(({ series, fit, result }) => ({ series: paint(series), fit, result })), layout, k, line, ink, textSize, measure, text));
  const legendNames = drawn.map(({ series, data }) => seriesName(series, data.yName, seriesReference(series, sources)));
  // The legend in its corner; on Auto, the top corner that covers less of the data: the right one, unless the left covers less.
  // Each series' row, then a row for each of its fits shown in the legend.
  const legendRows: LegendRow[] = drawn.flatMap(({ series, fits }, index) => [
    { name: legendNames[index], series: paint(series) },
    ...fits.filter(({ fit, result }) => fit.enabled && fit.legend && typeof result !== "string").map(({ fit }) => ({ name: fitLegendName(fit, legendNames[index]), series: paint(series), fit })),
  ]);
  const legendAt = (corner: "right" | "left", edge: "top" | "bottom" = "top") => (plot.legend && drawn.length ? legendItems(legendRows, area, k, line, measure, text, layout.legendShift, corner, edge) : []);
  const where = plot.legendPlace;
  let legend = where === "auto" ? legendAt("right") : legendAt(where.endsWith("left") ? "left" : "right", where.startsWith("bottom") ? "bottom" : "top");
  if (where === "auto" && legend[0]?.kind === "rect" && covered(legend[0], data, markers) > 0) {
    const other = legendAt("left");
    if (other[0]?.kind === "rect" && covered(other[0], data, markers) < covered(legend[0], data, markers)) legend = other;
    // Still over the data: a step more of an automatic Y axis' range above it, up to two, as a chart leaves headroom.
    if (legend[0]?.kind === "rect" && covered(legend[0], data, markers) > 0 && headroom < 2 && (plot.yAxis.max === null || (y2s && plot.y2Axis.max === null))) {
      return plotScene(plot, sources, plainMeasure, nudge, headroom + 1);
    }
  }
  // Without a backing, the white is left out and the data shows through.
  items.push(...(plot.legendBack === "none" ? legend.slice(1) : legend));
  items.push(...fitLabels(plot, drawn, area, k, line, textSize, legend[0]?.kind === "rect" ? legend[0] : null, measure, text));
  if (legend[0]?.kind === "rect") targets.push({ part: { kind: "legend" }, box: { x: legend[0].x, y: legend[0].y, width: legend[0].width, height: legend[0].height } });
  const message = !plot.series.length || (!drawn.length && problems.length)
    ? { text: !plot.series.length ? "Choose cells to plot" : plot.series.length === 1 ? problems[0].reason.replace(/\.$/, "") : "No series to draw", x: area.x + area.width / 2, y: area.y + area.height / 2, size: textSize }
    : null;
  const backing = legend[0]?.kind === "rect" ? { x: legend[0].x, y: legend[0].y, width: legend[0].width, height: legend[0].height } : null;
  return { width: box.width, height: box.height, items, message, layout, legend: backing, headroom, targets: sortTargets(targets) };
}

/** How a series is placed in the plot area: its X and Y scales in content pixels, the area, the scale and frame width. */
interface Pen {
  X(value: number): number; V(value: number): number;
  area: { x: number; y: number; width: number; height: number }; k: number; line: number;
  within(px: number, py: number): boolean;
  /** A column series' place in its group: its offset from the X value and width, and the line it stands on, in pixels. */
  bar?: { offset: number; width: number; base: number };
}

/**
 * A series' line (broken at a missing value, or one at or below 0 on a log axis, and joined by its Connect) and error
 * bars (± the error about each point, capped as wide as the marker), both to be clipped to the plot area; and its
 * markers, drawn whole over them as Excel does, so that a point on the frame is not cut in half. A point outside the
 * plot area (beyond an axis end that was set) has no marker.
 */
function seriesItems(series: PaintedSeries, points: SeriesData, pen: Pen): { under: SceneItem[]; markers: SceneItem | null } {
  const { X, V, area, k, line } = pen;
  const finite: [number, number][] = [], ops: PathOp[] = [];
  let run: [number, number][] = [];
  const close = () => { ops.push(...connectOps(run, series.connect)); run = []; };
  for (let i = 0; i < points.xs.length; i++) {
    const point: [number, number] = [X(points.xs[i]), V(points.ys[i])];
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) { close(); continue; }
    finite.push(point);
    run.push(point);
  }
  close();
  const under: SceneItem[] = [];
  const shift = pen.bar?.offset ?? 0;
  if (pen.bar) {
    const { width, base } = pen.bar;
    for (const [px, py] of finite) under.push({ kind: "rect", x: px + shift - width / 2, y: Math.min(py, base), width, height: Math.abs(py - base), fill: series.colour });
  }
  if (points.es) {
    const bars: PathOp[] = [], cap = Math.max(series.symbolSize, 3) * PT * k / 2;
    for (let i = 0; i < points.xs.length; i++) {
      const px = X(points.xs[i]), py = V(points.ys[i]), ve = Math.abs(points.es[i]);
      if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(ve) || ve === 0) continue;
      const high = V(points.ys[i] + ve), below = V(points.ys[i] - ve), low = Number.isFinite(below) ? below : area.y + area.height, at = px + shift;
      bars.push({ op: "M", x: at, y: low }, { op: "L", x: at, y: high }, { op: "M", x: at - cap, y: low }, { op: "L", x: at + cap, y: low }, { op: "M", x: at - cap, y: high }, { op: "L", x: at + cap, y: high });
    }
    if (bars.length) under.push({ kind: "path", ops: bars, stroke: { colour: series.colour, width: Math.max(line, series.lineWidth * 0.75 * PT * k), dash: [] }, cap: "butt", join: "miter" });
  }
  if (hasLine(series.kind) && ops.length) under.push({ kind: "path", ops, stroke: seriesStroke(series, k), cap: "butt", join: "round" });
  const shown = finite.filter(([px, py]) => pen.within(px, py));
  const own = (item: SceneItem): SceneItem => ({ ...item, series: series.id } as SceneItem);
  return { under: under.map(own), markers: hasSymbol(series.kind) && shown.length ? own(symbolsItem(series, shown, k, line)) : null };
}

/**
 * Where a series' points were drawn, for pointing at it: each point inside the plot area (its column with it), in runs
 * that a missing value or a point outside breaks, as its line is; a marker's half width is how near counts as on it.
 */
function seriesTarget(series: PlotSeries, points: SeriesData, pen: Pen): PlotTarget {
  const shift = pen.bar?.offset ?? 0, found: PartPoint[] = [];
  let run = 0, open = false;
  for (let i = 0; i < points.xs.length; i++) {
    const px = pen.X(points.xs[i]), py = pen.V(points.ys[i]);
    if (!Number.isFinite(px) || !Number.isFinite(py) || !pen.within(px, py)) { if (open) run++; open = false; continue; }
    open = true;
    const bar = pen.bar ? { x: px + shift - pen.bar.width / 2, y: Math.min(py, pen.bar.base), width: pen.bar.width, height: Math.abs(py - pen.bar.base) } : undefined;
    found.push({ x: px + shift, y: py, index: i, run, ...(bar ? { bar } : {}) });
  }
  return { part: { kind: "series", series: series.id }, points: found, line: hasLine(series.kind), radius: hasSymbol(series.kind) ? (series.symbolSize * PT * pen.k) / 2 : 0 };
}

/**
 * A fit over its series, in the series' colour: a smoothing as a line through its smoothed points, a regression as a
 * curve across the data's x. A value off a log axis breaks the curve there.
 */
function fitItem(series: PaintedSeries, own: SeriesFit, fit: FitResult, pen: Pen): SceneItem | null {
  const ops: PathOp[] = [];
  let open = false;
  for (let i = 0; i < fit.xs.length; i++) {
    const px = pen.X(fit.xs[i]), py = pen.V(fit.ys[i]);
    if (!Number.isFinite(px) || !Number.isFinite(py)) { open = false; continue; }
    ops.push({ op: open ? "L" : "M", x: px, y: py });
    open = true;
  }
  return ops.length ? { kind: "path", ops, stroke: fitStroke(series, own, pen.k, pen.line), cap: "butt", join: "round", fit: own.id } : null;
}

/** A fit line's stroke: its own colour, width and dash, or its series' colour and width. */
function fitStroke(series: PaintedSeries, own: SeriesFit, k: number, line: number): Stroke {
  const width = Math.max(line, (own.lineWidth ?? series.lineWidth) * PT * k);
  return { colour: own.colour ?? series.colour, width, dash: DASH_PATTERNS[own.dash].map((part) => part * width) };
}

/** A round number at least as large as `value`: 1, 2, 2.5 or 5 times a power of ten. */
function roundUp(value: number): number {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].map((f) => f * power).find((step) => step >= value * (1 - 1e-12))!;
}

/**
 * The residual plot (2026-11-19): each fit's residuals, y less the fit, as its series' markers in the fit line's
 * colour, about a dashed zero line, framed under the plot area on the same x; its Y axis is symmetric about zero, with
 * ticks at its ends and at zero, and the bottom axis' ticks below it.
 */
function residualItems(panel: { x: number; y: number; width: number; height: number }, X: (value: number) => number, xTicks: { major: number[]; minor: number[] },
  fits: readonly { series: PaintedSeries; fit: SeriesFit; result: FitResult }[], layout: PlotLayout, k: number, line: number, ink: Stroke, size: number, measure: MeasureText,
  text: (value: string, x: number, y: number, size: number, anchor: "start" | "middle" | "end", rotate?: number) => SceneItem): SceneItem[] {
  const s = PLOT_STYLE, major = s.majorTickPt * PT * k, minor = s.minorTickPt * PT * k, out = s.majorTick === "cross" ? major : 0;
  const reach = roundUp(Math.max(0, ...fits.flatMap(({ result }) => result.residuals!.map((point) => Math.abs(point.residual)).filter(Number.isFinite))));
  const left = panel.x, right = panel.x + panel.width, top = panel.y, bottom = panel.y + panel.height;
  const V = (value: number) => top + panel.height / 2 - (value / reach) * (panel.height / 2);
  const items: SceneItem[] = [];
  const points: SceneItem[] = [{ kind: "path", ops: [{ op: "M", x: left, y: V(0) }, { op: "L", x: right, y: V(0) }], stroke: { colour: s.ink, width: line, dash: [4 * line, 3 * line] }, cap: "butt", join: "miter" }];
  for (const { series, fit, result } of fits) {
    const at = result.residuals!.map((point): [number, number] => [X(point.x), V(point.residual)]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (at.length) points.push(symbolsItem({ ...series, colour: fit.colour ?? series.colour, symbolSize: series.symbolSize * 0.8, symbol: series.kind === "line" || series.kind === "column" ? "circle" : series.symbol }, at, k, line));
  }
  items.push({ kind: "clip", x: left, y: top, width: panel.width, height: panel.height, items: points });
  items.push({ kind: "path", ops: [{ op: "M", x: left, y: top }, { op: "L", x: right, y: top }, { op: "L", x: right, y: bottom }, { op: "L", x: left, y: bottom }, { op: "Z" }], stroke: ink, crisp: true, cap: "square", join: "miter" });
  const ticks: PathOp[] = [];
  const tick = (x1: number, y1: number, x2: number, y2: number) => ticks.push({ op: "M", x: x1, y: y1 }, { op: "L", x: x2, y: y2 });
  for (const value of xTicks.major) if (X(value) >= left - 0.5 && X(value) <= right + 0.5) tick(X(value), bottom - major, X(value), bottom + out);
  for (const value of xTicks.minor) if (X(value) >= left - 0.5 && X(value) <= right + 0.5) tick(X(value), bottom - minor, X(value), bottom);
  for (const value of [-reach, 0, reach]) tick(left + major, V(value), left - out, V(value));
  items.push({ kind: "path", ops: ticks, stroke: ink, crisp: true, cap: "butt", join: "miter" });
  for (const value of [-reach, 0, reach]) items.push(text(tickLabel(value, reach), layout.yLabelsRight, V(value), size, "end"));
  if (layout.yTitle) {
    const title = measure("Residual", size / PT).width <= panel.height ? "Residual" : "Res.";
    items.push(text(title, layout.yTitle.x, top + panel.height / 2, size, "middle", -90));
  }
  return items;
}

/**
 * The fits' labels (2026-11-19): each fit whose label is shown writes its equation, as mathematics or plain text, in its
 * line's colour, in its corner of the plot area, one row under another. Auto takes the top corner the legend leaves
 * free. A white backing sits behind a label that asks for one, as the legend's does.
 */
function fitLabels(plot: ProjectPlot, drawn: readonly DrawnSeries[], area: { x: number; y: number; width: number; height: number }, k: number, line: number, size: number,
  legend: { x: number; y: number; width: number; height: number } | null, measure: MeasureText,
  text: (value: string, x: number, y: number, size: number, anchor: "start" | "end") => SceneItem): SceneItem[] {
  const s = PLOT_STYLE, inset = s.legendInsetPt * PT * k, gap = s.tickGapPt * PT * k;
  const legendCorner = legend ? `${legend.y + legend.height / 2 < area.y + area.height / 2 ? "top" : "bottom"}-${legend.x + legend.width / 2 < area.x + area.width / 2 ? "left" : "right"}` : null;
  const auto: Exclude<FitLabelPlace, "auto"> = legendCorner === "top-left" ? "top-right" : "top-left";
  const corners = new Map<Exclude<FitLabelPlace, "auto">, { text: string; colour: string; back: boolean; ink: TextInk }[]>();
  for (const { series, fits } of drawn) for (const { fit, result } of fits) {
    if (!fit.enabled || typeof result === "string") continue;
    const label = fitLabelText(fit, result);
    if (!label) continue;
    const corner = fit.place === "auto" ? auto : fit.place;
    const rows = corners.get(corner) ?? [];
    rows.push({ text: label, colour: fit.colour ?? seriesColour(plot, series), back: fit.back === "white", ink: measure(label, size / PT) });
    corners.set(corner, rows);
  }
  const items: SceneItem[] = [];
  for (const [corner, rows] of corners) {
    const left = corner.endsWith("left"), top = corner.startsWith("top");
    // Below the legend when it shares the corner, so that neither covers the other.
    const shared = legend && legendCorner === corner;
    const heights = rows.map((row) => Math.max(inkHeight(row.ink), size)), total = heights.reduce((sum, h) => sum + h, 0) + gap * (rows.length - 1);
    let y = top ? (shared ? legend!.y + legend!.height + gap : area.y + inset) : (shared ? legend!.y - gap : area.y + area.height - inset) - total;
    rows.forEach((row, index) => {
      const middle = y + heights[index] / 2, x = left ? area.x + inset : area.x + area.width - inset;
      if (row.back) {
        const from = left ? x : x - row.ink.width;
        const backLeft = Math.max(area.x + line, from - gap), backTop = Math.max(area.y + line, y - gap / 2);
        items.push({ kind: "rect", x: backLeft, y: backTop, width: Math.min(area.x + area.width - line, from + row.ink.width + gap) - backLeft, height: Math.min(area.y + area.height - line, y + heights[index] + gap / 2) - backTop, fill: s.paper });
      }
      items.push({ ...text(row.text, x, middle, size, left ? "start" : "end"), colour: row.colour } as SceneItem);
      y += heights[index] + gap;
    });
  }
  return items;
}

/**
 * Data labels, as Excel's at Right: each point's text from its label cells, just right of its marker (left of it where
 * it would run past the plot area's right edge), centred on it, in the figure's ink. Points outside the plot area and
 * empty cells have none.
 */
function labelItems(series: PlotSeries, points: SeriesData, pen: Pen, measure: MeasureText, text: (value: string, x: number, y: number, size: number, anchor: "start" | "end") => SceneItem): SceneItem[] {
  const s = PLOT_STYLE, size = s.textPt * PT * textScale(pen.k), items: SceneItem[] = [];
  const offset = (hasSymbol(series.kind) ? (series.symbolSize * PT * pen.k) / 2 : 0) + s.tickGapPt * PT * pen.k;
  for (let i = 0; i < points.xs.length; i++) {
    const label = (points.labels?.[i] ?? "").trim(), px = pen.X(points.xs[i]), py = pen.V(points.ys[i]);
    if (!label || !Number.isFinite(px) || !Number.isFinite(py) || !pen.within(px, py)) continue;
    const fits = px + offset + measure(label, size / PT).width <= pen.area.x + pen.area.width;
    items.push(fits ? text(label, px + offset, py, size, "start") : text(label, px - offset, py, size, "end"));
  }
  return items;
}

/**
 * Callouts, in the academic way: the figure's font and ink, no box or arrowhead, centred just above each point's
 * marker (below it where it would cross the plot area's top, set in from a side it would cross). A point says its Y value as its cell shows it with the
 * range's unit ("52.8 HRC"), its X and Y values ("(3, 60)"), or its label cell (its Y value without one). A label
 * already written by the series' data labels is not written twice.
 */
function calloutItems(series: PlotSeries, points: SeriesData, pen: Pen, sources: PlotSources, measure: MeasureText, text: (value: string, x: number, y: number, size: number, anchor: "middle" | "start" | "end") => SceneItem): SceneItem[] {
  if (!series.callouts.all && !series.callouts.points.some((point) => point.text)) return [];
  const s = PLOT_STYLE, size = s.textPt * PT * textScale(pen.k), items: SceneItem[] = [];
  const shown = (cells: typeof series.y | null) => { const texts = cells ? rangeTexts(cells, sources.table(cells.data)) : null; return typeof texts === "string" ? null : texts; };
  const yTexts = shown(series.y), xTexts = points.categories ?? shown(series.x), unit = points.yName?.unit ?? "";
  const yText = (i: number) => (yTexts?.[i]?.trim() || fitNumber(points.ys[i]));
  const xText = (i: number) => (xTexts?.[i]?.trim() || fitNumber(points.xs[i]));
  const reach = (hasSymbol(series.kind) ? (series.symbolSize * PT * pen.k) / 2 : 0) + s.tickGapPt * PT * pen.k + size / 2;
  for (let i = 0; i < points.xs.length; i++) {
    const kind = calloutAt(series, i), px = pen.X(points.xs[i]) + (pen.bar?.offset ?? 0), py = pen.V(points.ys[i]);
    if (!kind || !Number.isFinite(px) || !Number.isFinite(py) || !pen.within(px, py)) continue;
    const label = (points.labels?.[i] ?? "").trim();
    if (kind === "label" && label && points.labels) continue;
    const value = kind === "xy" ? `(${xText(i)}, ${yText(i)})` : kind === "label" && label ? label : `${yText(i)}${unit ? ` ${unit}` : ""}`;
    const above = pen.bar ? Math.min(py, pen.bar.base) - reach : py - reach;
    // Kept inside the plot area: a callout of a point near a side is set in from it rather than over the axis.
    const half = measure(value, size / PT).width / 2, inset = s.tickGapPt * PT * pen.k, y = above - size / 2 < pen.area.y ? py + reach : above;
    if (px - half < pen.area.x + inset) items.push(text(value, pen.area.x + inset, y, size, "start"));
    else if (px + half > pen.area.x + pen.area.width - inset) items.push(text(value, pen.area.x + pen.area.width - inset, y, size, "end"));
    else items.push(text(value, px, y, size, "middle"));
  }
  return items;
}

/** A row of the legend: a series, or one of its fits drawn as its line. */
interface LegendRow { name: string; series: PaintedSeries; fit?: SeriesFit }

/**
 * The legend in the plot area's top-right corner, without a border: each series' sample and its name, on the paper's
 * white, so that it reads over the data. It stands in from the frame's top and right alike (legendInsetPt); its rows
 * are as close as a label to its tick and share one baseline offset, so the names line up.
 */
function legendItems(rows: readonly LegendRow[], area: { x: number; y: number; width: number; height: number }, k: number, line: number, measure: MeasureText,
  text: (value: string, x: number, y: number, size: number, anchor: "start", rotate: number, ink: TextInk) => SceneItem, shift: { dx: number; dy: number }, corner: "right" | "left" = "right", edge: "top" | "bottom" = "top"): SceneItem[] {
  const s = PLOT_STYLE, pad = s.legendInsetPt * PT * k, sample = 16.5 * PT * k, gap = s.tickGapPt * PT * k;
  const inks = rows.map((row) => measure(row.name, s.textPt * textScale(k)));
  const shared: TextInk = { width: Math.max(...inks.map((ink) => ink.width)), ascent: Math.max(...inks.map((ink) => ink.ascent)), descent: Math.max(...inks.map((ink) => ink.descent)) };
  const marker = Math.max(...rows.map(({ series, fit }) => (!fit && hasSymbol(series.kind) ? series.symbolSize * PT * k : 0)));
  const rowInk = Math.max(inkHeight(shared), marker), pitch = rowInk + gap;
  const width = shared.width + gap + sample;
  const top = (edge === "top" ? area.y + pad : area.y + area.height - pad - (pitch * rows.length - gap)) + shift.dy;
  const right = corner === "right" ? area.x + area.width - pad + shift.dx : area.x + pad + width + shift.dx;
  const left = right - width;
  const backLeft = Math.max(area.x + line, left - gap), backTop = Math.max(area.y + line, top - gap);
  const items: SceneItem[] = [{
    kind: "rect", x: backLeft, y: backTop, fill: s.paper,
    width: Math.min(area.x + area.width - line, right + gap) - backLeft, height: Math.min(area.y + area.height - line, top + pitch * rows.length - gap + gap) - backTop,
  }];
  rows.forEach(({ series, fit, name }, index) => {
    const y = top + rowInk / 2 + pitch * index;
    if (fit) {
      items.push({ kind: "path", ops: [{ op: "M", x: left, y }, { op: "L", x: left + sample, y }], stroke: fitStroke(series, fit, k, line), cap: "butt", join: "round" });
      items.push(text(name, left + sample + gap, y, s.textPt * PT * textScale(k), "start", 0, shared));
      return;
    }
    if (hasLine(series.kind)) items.push({ kind: "path", ops: [{ op: "M", x: left, y }, { op: "L", x: left + sample, y }], stroke: seriesStroke(series, k), cap: "butt", join: "round" });
    if (hasSymbol(series.kind)) items.push(symbolsItem(series, [[left + sample / 2, y]], k, line));
    if (series.kind === "column") { const size = inkHeight(shared); items.push({ kind: "rect", x: left + sample / 2 - size / 2, y: y - size / 2, width: size, height: size, fill: series.colour }); }
    items.push(text(name, left + sample + gap, y, s.textPt * PT * textScale(k), "start", 0, shared));
  });
  return items;
}

// MARK: SVG

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (value: number) => String(Number(value.toFixed(3)));

function pathData(ops: readonly PathOp[]): string {
  return ops.map((op) => op.op === "Z" ? "Z" : op.op === "C" ? `C${n(op.x1)} ${n(op.y1)} ${n(op.x2)} ${n(op.y2)} ${n(op.x)} ${n(op.y)}` : op.op === "circle"
    ? `M${n(op.x - op.r)} ${n(op.y)}a${n(op.r)} ${n(op.r)} 0 1 0 ${n(op.r * 2)} 0a${n(op.r)} ${n(op.r)} 0 1 0 ${n(-op.r * 2)} 0Z`
    : `${op.op}${n(op.x)} ${n(op.y)}`).join("");
}

function strokeAttributes(stroke: Stroke | undefined): string {
  if (!stroke) return ` stroke="none"`;
  return ` stroke="${stroke.colour}" stroke-width="${n(stroke.width)}"${stroke.dash.length ? ` stroke-dasharray="${stroke.dash.map(n).join(" ")}"` : ""}`;
}

function svgItems(items: readonly SceneItem[], clips: { count: number }): string[] {
  return items.flatMap((item): string[] => {
    if (item.kind === "rect") return [`<rect x="${n(item.x)}" y="${n(item.y)}" width="${n(item.width)}" height="${n(item.height)}" fill="${item.fill ?? "none"}"${strokeAttributes(item.stroke)}/>`];
    if (item.kind === "path") return [`<path d="${pathData(item.ops)}" fill="${item.fill ?? "none"}"${strokeAttributes(item.stroke)} stroke-linecap="${item.cap}" stroke-linejoin="${item.join}"/>`];
    if (item.kind === "text") {
      const family = escapeXml(item.family.replace(/"/g, "'"));
      const turn = item.rotate ? ` rotate(${item.rotate})` : "";
      if (item.runs) {
        // Each run placed on its own, so that viewers without the maths layout show it as drawn.
        const runs = item.runs.map((run) => `<tspan x="${n(run.dx)}" y="${n(item.dy + run.dy)}" font-family="${escapeXml(run.family.replace(/"/g, "'"))}" font-size="${n(run.size)}">${escapeXml(run.text)}</tspan>`);
        return [`<text transform="translate(${n(item.x)} ${n(item.y)})${turn}" xml:space="preserve" fill="${item.colour}">${runs.join("")}</text>`];
      }
      return [`<text transform="translate(${n(item.x)} ${n(item.y)})${turn}" y="${n(item.dy)}" font-family="${family}" font-size="${n(item.size)}" text-anchor="${item.anchor}" fill="${item.colour}">${escapeXml(item.text)}</text>`];
    }
    const id = `clip${++clips.count}`;
    return [`<clipPath id="${id}"><rect x="${n(item.x)}" y="${n(item.y)}" width="${n(item.width)}" height="${n(item.height)}"/></clipPath>`, `<g clip-path="url(#${id})">`, ...svgItems(item.items, clips), "</g>"];
  });
}

/**
 * A scene as an SVG file. Its size is given in points (72 to the inch, as the plot is laid out at 96 px to the inch), so
 * that an SVG placed in a document or a drawing program takes the plot's print size.
 */
export function plotSvg(scene: PlotScene): string {
  const w = scene.width * 0.75, h = scene.height * 0.75;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}pt" height="${n(h)}pt" viewBox="0 0 ${n(scene.width)} ${n(scene.height)}">`,
    ...svgItems(scene.items, { count: 0 }),
    `</svg>`, "",
  ].join("\n");
}

// MARK: print resolution

/** The resolutions a plot is rasterised at, in dots per inch; the plot's content pixels are 96 to the inch. */
export const PLOT_DPIS: readonly number[] = [150, 300, 600];

// The PNG and JPEG resolution stamps are the shell's (forge-shell raster-export), re-exported for the app and tests.
export { jpegWithDpi, pngWithDpi };
