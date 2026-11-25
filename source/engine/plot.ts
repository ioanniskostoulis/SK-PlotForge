// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Plots (2026-11-15): line and scatter graphs of worksheet columns, each an object on the work surface as a graph window
// is in Origin. A plot keeps its series (each a Y range of cells against an X range, or against the row number, from any
// worksheet: ranges.ts), its axes, title and legend; the
// numbers are read from the worksheets whenever it is drawn, so a plot follows its data. The default look is that of
// the owner's Excel report charts (PLOT_STYLE): Cambria, an 11 pt title and 10 pt for everything else, a black frame
// and axes of 0.75 pt, major ticks across the axis and minor ticks inside, no gridlines, a legend without a border on
// white, black square markers and 1 pt lines; all of it at 480 × 320 px, and in proportion at any other size. A series
// is drawn against the left Y axis or the right one, its points joined straight, by a curve (spline, B-spline or Bezier,
// as Origin's Connect offers) or in steps. Axis titles read "Name (unit)" from named ranges unless one is written.
import type { DataTable } from "./table";
import { DEFAULT_DATA_PALETTE, dataColour } from "forge-shell/app/data-palettes";
import { fitRecord, parseFits, type SeriesFit } from "./fits";
import { fontFamily } from "forge-shell/app/font-choice";
import type { MeasureText, TextInk } from "forge-shell/app/text-math";
import { formatNumber, NOTATIONS, DECIMALS_MAX, type NumberFormat } from "forge-shell/app/number-format";
import { plotText, textScale } from "./plot-text";
import { cellsRecord, parseCells, rangeName, rangeTexts, rangeTitle, rangeValues, sameCells, type CellRange, type NamedRange } from "./ranges";

export type PlotKind = "line" | "scatter" | "line-symbol" | "column";
export const PLOT_KINDS: readonly PlotKind[] = ["scatter", "line", "line-symbol", "column"];
export const PLOT_KIND_NAMES: Record<PlotKind, string> = { scatter: "Scatter", line: "Line", "line-symbol": "Line + symbol", column: "Column" };

export type SymbolShape = "square" | "circle" | "triangle" | "diamond" | "cross" | "plus";
export const SYMBOL_SHAPES: readonly SymbolShape[] = ["square", "circle", "triangle", "diamond", "cross", "plus"];
export const SYMBOL_NAMES: Record<SymbolShape, string> = { square: "Square", circle: "Circle", triangle: "Triangle", diamond: "Diamond", cross: "Cross", plus: "Plus" };

/** How a series' line joins its points, as Origin's Connect: straight, a spline through every point, a B-spline or
 * Bezier curve that the points steer, or steps (across, then up or down). */
export type LineConnect = "straight" | "spline" | "bspline" | "bezier" | "step";
export const LINE_CONNECTS: readonly LineConnect[] = ["straight", "spline", "bspline", "bezier", "step"];
export const CONNECT_NAMES: Record<LineConnect, string> = { straight: "Straight", spline: "Spline", bspline: "B-spline", bezier: "Bezier", step: "Step" };

export type LineDash = "solid" | "dash" | "dot" | "dash-dot";
export const LINE_DASHES: readonly LineDash[] = ["solid", "dash", "dot", "dash-dot"];
export const DASH_NAMES: Record<LineDash, string> = { solid: "Solid", dash: "Dash", dot: "Dot", "dash-dot": "Dash dot" };
/** Dash patterns in multiples of the line width, as Office draws its preset dashes. */
export const DASH_PATTERNS: Record<LineDash, readonly number[]> = { solid: [], dash: [4, 3], dot: [1, 2], "dash-dot": [4, 3, 1, 3] };

/** Points to content pixels: a plot is laid out at 96 pixels per inch, so 100% zoom shows it at print size. */
export const PT = 96 / 72;

/** The default look of a plot, from the owner's Excel report charts. Sizes are in points. */
export const PLOT_STYLE = {
  /** The figure font (Settings › Plots › Text, plot-text.ts), shared with the calibration bar; serif faces after it. */
  get font(): string { return fontFamily(plotText().font, "text"); },
  /** The title's and all other text's sizes (Settings › Plots › Text): 11 pt and 10 pt by default, at every plot size. */
  get titlePt(): number { return plotText().titlePt; },
  get textPt(): number { return plotText().textPt; },
  /** The chart area's border, the plot area's frame and the axes. */
  linePt: 0.75,
  majorTick: "cross" as const,
  minorTick: "in" as const,
  /** How far a tick reaches from the axis, on each side it is drawn. */
  majorTickPt: 3.5,
  minorTickPt: 2.25,
  ink: "#000000",
  paper: "#FFFFFF",
  seriesLinePt: 1,
  symbolPt: 3,
  /**
   * Spacing by how closely things belong together: a tick label right by its tick, an axis title a little further
   * from its labels, the plot's title further from the plot, and the outer margin, the same on all four sides, framing
   * the figure. The legend stands in from the frame and its rows are as close as a label to its tick.
   */
  padPt: 8,
  tickGapPt: 3,
  titleGapPt: 4.5,
  headGapPt: 6,
  legendInsetPt: 6,
};

export interface PlotSeries {
  id: string;
  /** The X cells, or null for the row number (1, 2, 3 … along the Y cells), as Origin plots a Y alone. */
  x: CellRange | null;
  /** The Y cells. X and Y are paired in order; the longer is cut to the shorter. */
  y: CellRange;
  /** Error bars: ± these cells' values about each Y, in order; null for none. */
  error: CellRange | null;
  /** Labels: these cells' text written by each point, in order, as Excel's data labels; null for none. */
  labels: CellRange | null;
  /** Smoothings and fits drawn over the series, in order (fits.ts); empty for none. */
  fits: SeriesFit[];
  kind: PlotKind;
  connect: LineConnect;
  /** A colour picked for this series; null: the app's data palette colour for its place, which follows the palette. */
  colour: string | null;
  symbol: SymbolShape;
  /** Marker size and line width in points. */
  symbolSize: number;
  lineWidth: number;
  dash: LineDash;
  /** The legend's text; null takes the Y range's name, or its reference. */
  name: string | null;
  /** The Y axis it is drawn against: the left one, or the right (secondary) one. */
  axis: SeriesAxis;
  /** The X axis it is drawn against: the bottom one, or the top (secondary) one. */
  xAxis: SeriesXAxis;
  /** Values written by points (callouts): for every point, and for single points, which overrule it (null hides one). */
  callouts: SeriesCallouts;
}

/** What a callout says: the point's Y value with its unit, its X and Y values, or its label cell. */
export type CalloutText = "y" | "xy" | "label";
export const CALLOUT_TEXTS: readonly CalloutText[] = ["y", "xy", "label"];
export const CALLOUT_NAMES: Record<CalloutText, string> = { y: "Y value", xy: "X, Y values", label: "Label" };
export interface SeriesCallouts { all: CalloutText | null; points: { index: number; text: CalloutText | null }[] }

/** The callout a point of a series shows, if any: its own, else the series'. */
export function calloutAt(series: PlotSeries, index: number): CalloutText | null {
  const own = series.callouts.points.find((point) => point.index === index);
  return own ? own.text : series.callouts.all;
}

/**
 * Set callouts: for one point (`index`), kept only while it differs from the series'; or for the whole series
 * (`index` null), which clears the points' own.
 */
export function setCallout(series: PlotSeries, index: number | null, text: CalloutText | null): void {
  if (index === null) { series.callouts = { all: text, points: [] }; return; }
  const points = series.callouts.points.filter((point) => point.index !== index);
  if (text !== series.callouts.all) points.push({ index, text });
  series.callouts = { all: series.callouts.all, points: points.sort((a, b) => a.index - b.index) };
}

/** A series' Y axis: "y" at the left, "y2" at the right, as Excel's secondary axis or Origin's right Y. */
export type SeriesAxis = "y" | "y2";
export const SERIES_AXES: readonly SeriesAxis[] = ["y", "y2"];
export const SERIES_AXIS_NAMES: Record<SeriesAxis, string> = { y: "Left", y2: "Right" };

/** A series' X axis: "x" at the bottom, "x2" at the top, as Excel's secondary horizontal axis or Origin's top X. */
export type SeriesXAxis = "x" | "x2";
export const SERIES_X_AXES: readonly SeriesXAxis[] = ["x", "x2"];
export const SERIES_X_AXIS_NAMES: Record<SeriesXAxis, string> = { x: "Bottom", x2: "Top" };

/**
 * Swap a plot's sides, as one mirror: every series on the left Y axis goes to the right one and back (`"y"`), or on
 * the bottom X axis to the top one and back (`"x"`), and the two axes swap their settings with them.
 */
export function swapAxes(plot: ProjectPlot, which: "x" | "y"): void {
  if (which === "y") {
    for (const series of plot.series) series.axis = series.axis === "y" ? "y2" : "y";
    [plot.yAxis, plot.y2Axis] = [plot.y2Axis, plot.yAxis];
  } else {
    for (const series of plot.series) series.xAxis = series.xAxis === "x" ? "x2" : "x";
    [plot.xAxis, plot.x2Axis] = [plot.x2Axis, plot.xAxis];
  }
}

/** A series' rows: table indices from `first` to `last`, both included. The interface counts them from 1. */
export interface SeriesRows { first: number; last: number }

/** The cells of a new series: Y against X, or against the row number (null). */
export interface SeriesPair { x: CellRange | null; y: CellRange; error?: CellRange | null; labels?: CellRange | null }

export interface PlotAxis {
  /** The axis title; null takes "Name (unit)" from the first series' column. An empty title shows none. */
  title: string | null;
  /** The ends of the axis; null is automatic, from the data. */
  min: number | null;
  max: number | null;
  /** The major tick step; null is automatic. */
  step: number | null;
  /**
   * The minor tick step, as Excel's minor unit: null is automatic (a round part of the major step, see minorParts), 0
   * shows none. One that does not divide the major step evenly is drawn as automatic. On a log axis, any but 0 shows
   * 2 to 9 times each power of ten.
   */
  minorStep: number | null;
  /** A logarithmic axis: powers of ten equally spaced; values at or below 0 are left out. */
  log: boolean;
  /** How tick labels read (absent: automatic, a date axis for date cells, else numbers). */
  format?: AxisFormat;
  /**
   * How the tick labels' numbers are written (forge-shell number-format); absent is automatic: as many decimals as the
   * step has (on a log axis, powers of ten). Not used on a date or category axis.
   */
  numbers?: NumberFormat;
  /** The tick labels' turn, in degrees counter-clockwise (absent: 0, level). */
  angle?: LabelAngle;
}

/** The turns a tick label can take: level, slanted, or upright. */
export type LabelAngle = 0 | 45 | 90;
export const LABEL_ANGLES: readonly LabelAngle[] = [0, 45, 90];
/** A number format kept on an axis: automatic notation and decimals is the axis' own automatic, so none is kept. */
export const axisNumbers = (format: NumberFormat): NumberFormat | undefined => (format.notation === "auto" && format.decimals === null && !format.unit ? undefined : { notation: format.notation, decimals: format.decimals });

/**
 * How an axis' tick labels read: automatic (dates for date cells, else numbers), numbers, percentages (0.25 reads
 * 25%, as Excel's percentage format) or dates and times (the cells' values, milliseconds since 1970, in UTC).
 */
export type AxisFormat = "auto" | "number" | "percent" | "date";
export const AXIS_FORMATS: readonly AxisFormat[] = ["auto", "number", "percent", "date"];
export const AXIS_FORMAT_NAMES: Record<AxisFormat, string> = { auto: "Automatic", number: "Number", percent: "Percentage", date: "Date" };

/**
 * An axis as drawn: its ends and major step (a log axis: in decades, ends at powers of ten). A category axis, of text X
 * cells, has its categories at 1, 2, 3 … and runs half a step beyond the first and last.
 */
export interface AxisScale { min: number; max: number; step: number; log?: boolean; categories?: readonly string[]; format?: "percent" | "date"; numbers?: NumberFormat }

/** A category axis for these names: each at its place from 1, the axis half a place beyond the ends. */
export function categoryScale(categories: readonly string[]): AxisScale {
  return { min: 0.5, max: Math.max(1, categories.length) + 0.5, step: 1, categories };
}

export interface ProjectPlot {
  id: string;
  name: string;
  /** The plot on the work surface: position and size in content pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The title above the plot area; empty shows none. */
  title: string;
  xAxis: PlotAxis;
  yAxis: PlotAxis;
  /** The right Y axis, drawn while a series is on it. */
  y2Axis: PlotAxis;
  /** The top X axis, drawn while a series is on it. */
  x2Axis: PlotAxis;
  legend: boolean;
  /** Where the legend stands in the plot area: the top corner that covers less data ("auto"), or a corner. */
  legendPlace: LegendPlace;
  /** The legend's backing: the paper's white, so it reads over the data, or none. */
  legendBack: LegendBack;
  series: PlotSeries[];
  /** How the plot is exported: SVG, or PNG or JPEG rasterised at `exportDpi`. */
  exportFormat: PlotExportFormat;
  exportDpi: number;
}

export type LegendPlace = "auto" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export const LEGEND_PLACES: Record<LegendPlace, string> = { auto: "Auto", "top-left": "Top left", "top-right": "Top right", "bottom-left": "Bottom left", "bottom-right": "Bottom right" };
export type LegendBack = "white" | "none";
export const LEGEND_BACKS: Record<LegendBack, string> = { white: "White", none: "None" };

/** A plot's export formats: SVG keeps it a drawing; PNG and JPEG are pictures at a print resolution. */
export type PlotExportFormat = "svg" | "png" | "jpeg";
export const PLOT_EXPORT_FORMATS: readonly PlotExportFormat[] = ["png", "jpeg", "svg"];
export const PLOT_EXPORT_NAMES: Record<PlotExportFormat, string> = { png: "PNG", jpeg: "JPEG", svg: "SVG" };
/** A new plot exports as a PNG at 300 dpi, the resolution journals and reports print at. */
export const PLOT_EXPORT_DEFAULT = { format: "png" as PlotExportFormat, dpi: 300 };

/** A new plot is 5 × 3⅓ inches, near Excel's default chart; it is never smaller than this. */
export const PLOT_SIZE = { width: 480, height: 320, minWidth: 192, minHeight: 128 };

/**
 * How large a plot's type, lines, ticks, markers and spacing are, as one ratio to the 480 × 320 plot they are set for:
 * the lesser of its width and height ratios, so a plot resized keeps its proportions and its text always fits.
 */
export function plotScale(box: { width: number; height: number }): number {
  return Math.min(box.width / PLOT_SIZE.width, box.height / PLOT_SIZE.height);
}

/**
 * The scale a plot's text, lines, ticks, markers, caps and spacing are drawn at, all together: its `plotScale` with
 * Scale with plot size on (Settings › Plots), else 1, so they keep their sizes in points and only the plot area grows.
 */
export function drawScale(box: { width: number; height: number }): number {
  return plotText().sizing === "scaled" ? plotScale(box) : 1;
}

export class PlotError extends Error {}

const defaultAxis = (): PlotAxis => ({ title: null, min: null, max: null, step: null, minorStep: null, log: false });

/** The look of the n-th series of a plot: black square markers first, then the next colour and shape. */
export function seriesStyle(index: number, kind: PlotKind): Omit<PlotSeries, "id" | "x" | "y" | "error" | "labels" | "name"> {
  return {
    axis: "y", xAxis: "x", callouts: { all: null, points: [] }, kind, connect: "straight", fits: [], colour: null, symbol: SYMBOL_SHAPES[index % SYMBOL_SHAPES.length],
    symbolSize: PLOT_STYLE.symbolPt, lineWidth: PLOT_STYLE.seriesLinePt, dash: "solid",
  };
}

/** A new plot of ranges of cells, named Plot n and unique in the document; without any, an empty plot waiting for cells. */
export function newPlot(existing: readonly ProjectPlot[], kind: PlotKind, pairs: readonly SeriesPair[], box: { x: number; y: number }): ProjectPlot {
  const names = new Set(existing.map((plot) => plot.name.toLowerCase()));
  let number = existing.length + 1;
  while (names.has(`plot ${number}`)) number++;
  return {
    id: nextPlotId(existing), name: `Plot ${number}`, x: box.x, y: box.y, width: PLOT_SIZE.width, height: PLOT_SIZE.height, title: "",
    xAxis: defaultAxis(), yAxis: defaultAxis(), y2Axis: defaultAxis(), x2Axis: defaultAxis(), legend: pairs.length > 1, legendPlace: "auto", legendBack: "white",
    exportFormat: PLOT_EXPORT_DEFAULT.format, exportDpi: PLOT_EXPORT_DEFAULT.dpi,
    series: pairs.map((pair, index) => ({ id: `s${index + 1}`, x: pair.x, y: pair.y, error: pair.error ?? null, labels: pair.labels ?? null, name: null, ...seriesStyle(index, kind) })),
  };
}

/** An id no plot of the document has. */
export function nextPlotId(existing: readonly ProjectPlot[]): string {
  const ids = new Set(existing.map((plot) => plot.id));
  let n = existing.length + 1;
  while (ids.has(`plot-${n}`)) n++;
  return `plot-${n}`;
}

/** A series added to a plot, in the next shape; its colour is the data palette's for its place (`seriesColour`). */
export function addSeries(plot: ProjectPlot, pair: SeriesPair, kind: PlotKind): PlotSeries {
  const ids = new Set(plot.series.map((series) => series.id));
  let n = plot.series.length + 1;
  while (ids.has(`s${n}`)) n++;
  const series: PlotSeries = { id: `s${n}`, x: pair.x, y: pair.y, error: pair.error ?? null, labels: pair.labels ?? null, name: null, ...seriesStyle(plot.series.length, kind) };
  plot.series.push(series);
  return series;
}

/** The app's data palette (the shell's `data-palettes`, Settings › General › Data colours), which series draw in. */
let dataPalette: string = DEFAULT_DATA_PALETTE;
/** Draw series in this palette from now on; the caller draws again, so every plot follows it at once. */
export function setDataPalette(id: string): void { dataPalette = id; }
export const currentDataPalette = (): string => dataPalette;

/**
 * The colour a series is drawn in: its picked colour, else the data palette's for its place among the plot's series
 * (a set gives its colours in turn; a spectrum spreads over them all, so adding a series shifts the others).
 */
export function seriesColour(plot: Pick<ProjectPlot, "series">, series: PlotSeries): string {
  return series.colour ?? dataColour(dataPalette, Math.max(0, plot.series.indexOf(series)), plot.series.length);
}

// MARK: data

/** A series' points, and the names of its X and Y cells (null: unnamed); a point missing either value breaks a line there. */
export interface SeriesData {
  xs: Float64Array; ys: Float64Array; es: Float64Array | null; labels: string[] | null; xName: NamedRange | null; yName: NamedRange | null;
  /** The X or Y cells are dates, so that an automatic axis reads them as dates. */
  xDates: boolean; yDates: boolean;
  /** Text X cells: the categories, each at its place from 1 (xs); null for numbers. */
  categories: string[] | null;
  /** How many values each range gave before the longer were cut to the shortest (X absent for the row number). */
  counts: { x: number | null; y: number; error: number | null; labels: number | null };
}

/**
 * The points of a series from its worksheets, or why it cannot be drawn: Y against X in order, or against the row
 * number (the worksheet's, counted from 1) without X. The longer range is cut to the shorter.
 */
/** Whether a range's column holds dates. */
const dateCells = (range: CellRange, table: DataTable | null): boolean => table?.columns.find((column) => column.key === range.column)?.kind === "date";

export function seriesData(series: PlotSeries, tableOf: (id: string) => DataTable | null, names: readonly NamedRange[] = []): SeriesData | string {
  const y = rangeValues(series.y, tableOf(series.y.data));
  if (typeof y === "string") return y;
  let xs: Float64Array, categories: string[] | null = null;
  if (series.x) {
    const x = rangeValues(series.x, tableOf(series.x.data));
    // X cells of text are categories, as Origin and Excel take a text X: each at its place from 1.
    const texts = typeof x === "string" && x.endsWith("holds no numbers.") ? rangeTexts(series.x, tableOf(series.x.data)) : null;
    if (typeof x === "string" && (!texts || typeof texts === "string")) return x;
    if (typeof x !== "string") xs = x.values;
    else { categories = texts as string[]; xs = Float64Array.from(categories, (_, index) => index + 1); }
  } else xs = Float64Array.from(y.values, (_, index) => y.first + index + 1);
  let es: Float64Array | null = null;
  if (series.error) {
    const error = rangeValues(series.error, tableOf(series.error.data));
    if (typeof error === "string") return `Its error bars: ${error.charAt(0).toLowerCase()}${error.slice(1)}`;
    es = error.values;
  }
  let labels: string[] | null = null;
  if (series.labels) {
    const texts = rangeTexts(series.labels, tableOf(series.labels.data));
    if (typeof texts === "string") return `Its labels: ${texts.charAt(0).toLowerCase()}${texts.slice(1)}`;
    labels = texts;
  }
  const count = Math.min(xs.length, y.values.length, es ? es.length : Infinity);
  const counts = { x: series.x ? xs.length : null, y: y.values.length, error: es ? es.length : null, labels: labels ? labels.length : null };
  return { xs: xs.subarray(0, count), ys: y.values.subarray(0, count), es: es ? es.subarray(0, count) : null, labels, counts, categories: categories ? categories.slice(0, count) : null, xName: series.x ? rangeName(names, series.x) : null, yName: rangeName(names, series.y),
    xDates: !!series.x && !categories && dateCells(series.x, tableOf(series.x.data)), yDates: dateCells(series.y, tableOf(series.y.data)) };
}

/** Set a series' rows: its Y range's, and its X range's the same, as Origin's Plot Setup sets a plot's range. */
export function setSeriesRows(series: PlotSeries, rows: SeriesRows | null): void {
  series.y = { ...series.y, rows };
  if (series.x) series.x = { ...series.x, rows };
  if (series.error) series.error = { ...series.error, rows };
  if (series.labels) series.labels = { ...series.labels, rows };
}

/** Whether a series uses these cells. */
export function seriesUses(series: PlotSeries, cells: CellRange): boolean {
  return sameCells(series.y, cells) || (!!series.x && sameCells(series.x, cells)) || (!!series.error && sameCells(series.error, cells)) || (!!series.labels && sameCells(series.labels, cells));
}

/** A series' rows as the interface shows them, counted from 1: "All", "4" or "1–20". */
export function rowsText(rows: SeriesRows | null): string {
  return !rows ? "All" : rows.first === rows.last ? String(rows.first + 1) : `${rows.first + 1}–${rows.last + 1}`;
}

/** Rows typed in the interface ("all", empty, "7", "1-20", "1:20" or "1–20", counted from 1) as a series' rows. */
export function parseRowsInput(text: string): SeriesRows | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed || trimmed === "all") return null;
  const match = /^(\d+)\s*(?:[-–:]\s*(\d+))?$/.exec(trimmed);
  if (!match) throw new PlotError(`"${text.trim()}" is not a row range. Enter rows such as 1–20, one row, or all.`);
  const a = Number(match[1]), b = match[2] === undefined ? a : Number(match[2]);
  if (a < 1 || b < 1) throw new PlotError("Rows are counted from 1.");
  return { first: Math.min(a, b) - 1, last: Math.max(a, b) - 1 };
}

/** The finite extent of some values, or null without any. */
export function extent(values: Iterable<number>): [number, number] | null {
  let low = Infinity, high = -Infinity;
  for (const value of values) if (Number.isFinite(value)) { if (value < low) low = value; if (value > high) high = value; }
  return low <= high ? [low, high] : null;
}

// MARK: axes

/** A step of 1, 2 or 5 times a power of ten that cuts a span into at most about `count` parts, as Excel's axes do. */
export function niceStep(span: number, count = 8): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const rough = span / count, power = 10 ** Math.floor(Math.log10(rough)), fraction = rough / power;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

/** Whole steps are counted from zero, so that the ticks land on round numbers; the small error of floats is taken off. */
const clean = (value: number, step: number) => Number((Math.round(value / step) * step).toPrecision(12));

/**
 * An axis' range and major step from its data and its settings. Automatic ends round outwards to the step; as in Excel,
 * an axis of positive values starts at zero when its data spans more than a sixth of its largest value. A set end is kept.
 */
export function axisScale(axis: PlotAxis, data: [number, number] | null, dates = false): AxisScale {
  const numbers = axis.numbers ? { numbers: axis.numbers } : {};
  if (axis.log) return { ...logScale(axis, data), ...numbers };
  const format = axis.format && axis.format !== "auto" ? axis.format : dates ? "date" : "number";
  if (format === "date") return dateScale(axis, data);
  if (format === "percent") return { ...numberScale(axis, data), format: "percent", ...numbers };
  return { ...numberScale(axis, data), ...numbers };
}

function numberScale(axis: PlotAxis, data: [number, number] | null): AxisScale {
  let [low, high] = data ?? [0, 1];
  if (axis.min !== null) low = axis.min;
  if (axis.max !== null) high = axis.max;
  if (axis.min === null && axis.max === null && data && low >= 0 && high > 0 && (high - low) / high > 1 / 6) low = 0;
  if (high < low) [low, high] = [high, low];
  if (high === low) { const pad = low ? Math.abs(low) * 0.1 : 1; if (axis.min === null) low -= pad; if (axis.max === null) high += pad; if (high === low) high = low + 1; }
  const step = axis.step !== null && axis.step > 0 && (high - low) / axis.step <= 200 ? axis.step : niceStep(high - low);
  const min = axis.min !== null ? axis.min : Math.floor(low / step + 1e-9) * step;
  const max = axis.max !== null ? axis.max : Math.ceil(high / step - 1e-9) * step;
  return { min: Number(min.toPrecision(12)), max: Number((max > min ? max : min + step).toPrecision(12)), step };
}

/**
 * A log axis' range: automatic ends round out to powers of ten around the positive data (one decade when it has none);
 * a set end above 0 is kept. Its step is one decade.
 */
function logScale(axis: PlotAxis, data: [number, number] | null): AxisScale {
  const low = axis.min !== null && axis.min > 0 ? axis.min : 10 ** Math.floor(Math.log10(data && data[0] > 0 ? data[0] : 1) + 1e-9);
  let high = axis.max !== null && axis.max > 0 ? axis.max : 10 ** Math.ceil(Math.log10(data && data[1] > 0 ? data[1] : 10) - 1e-9);
  if (high <= low) high = low * 10;
  return { min: Number(low.toPrecision(12)), max: Number(high.toPrecision(12)), step: 1, log: true };
}

// MARK: date axes

const SECOND = 1000, MINUTE = 60 * SECOND, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
/** The steps a date axis counts in: round seconds, minutes, hours and days, then weeks, months and years of days. */
const DATE_STEPS = [SECOND, 5 * SECOND, 15 * SECOND, 30 * SECOND, MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 91 * DAY, 182 * DAY, 365 * DAY, 730 * DAY, 1826 * DAY, 3652 * DAY];

/**
 * A date axis: automatic ends round out to the step, which is the first round time unit giving at most eight ticks.
 * A typed step is in days (0.25 is six hours), as Excel's date axis.
 */
function dateScale(axis: PlotAxis, data: [number, number] | null): AxisScale {
  let [low, high] = data ?? [0, DAY];
  if (axis.min !== null) low = axis.min;
  if (axis.max !== null) high = axis.max;
  if (high < low) [low, high] = [high, low];
  if (high === low) { low -= DAY / 2; high += DAY / 2; }
  const typed = axis.step !== null && axis.step > 0 && (high - low) / (axis.step * DAY) <= 200 ? axis.step * DAY : null;
  const step = typed ?? DATE_STEPS.find((item) => (high - low) / item <= 8) ?? DATE_STEPS[DATE_STEPS.length - 1];
  const min = axis.min !== null ? axis.min : Math.floor(low / step + 1e-9) * step;
  const max = axis.max !== null ? axis.max : Math.ceil(high / step - 1e-9) * step;
  return { min, max: max > min ? max : min + step, step, format: "date" };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date tick by its step: the time under a day (with the day when the axis spans days), the day under a year, else the month and year. */
function dateLabel(scale: AxisScale, value: number): string {
  const date = new Date(value);
  const two = (n: number) => String(n).padStart(2, "0");
  const time = `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}${scale.step < MINUTE ? `:${two(date.getUTCSeconds())}` : ""}`;
  const day = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  if (scale.step < DAY) return scale.max - scale.min > DAY ? `${day} ${time}` : time;
  if (scale.step < 365 * DAY) return scale.max - scale.min > 365 * DAY ? `${day} ${date.getUTCFullYear()}` : day;
  return String(date.getUTCFullYear());
}

/** Where a value falls along an axis, from 0 at its start to 1 at its end; NaN off a log axis (at or below 0). */
export function axisFraction(scale: AxisScale, value: number): number {
  if (scale.log) return value > 0 ? (Math.log10(value) - Math.log10(scale.min)) / (Math.log10(scale.max) - Math.log10(scale.min)) : NaN;
  return (value - scale.min) / (scale.max - scale.min);
}

/** A mantissa of 1, 2 or 5: a step a reader counts in. */
function round125(value: number): boolean {
  const mantissa = value / 10 ** Math.floor(Math.log10(value) + 1e-9);
  return [1, 2, 5, 10].some((item) => Math.abs(mantissa - item) < 1e-6 * item);
}

/**
 * The parts a major step is split into by minor ticks, as published plots tick: a typed minor step that divides the
 * major step evenly; else (or automatic) the first of fifths, quarters, halves and thirds whose part is a round 1, 2 or
 * 5 (step 1: every 0.2; 2: every 0.5; 5: every 1; 3: every 1); 1 is none.
 */
export function minorParts(step: number, minorStep: number | null): number {
  if (minorStep === 0) return 1;
  if (minorStep !== null && minorStep > 0) {
    const parts = Math.round(step / minorStep);
    if (parts >= 2 && parts <= 50 && Math.abs(parts * minorStep - step) <= 1e-9 * step) return parts;
  }
  return [5, 4, 2, 3].find((parts) => round125(step / parts)) ?? 1;
}

/** Whether a typed minor step divides the major step evenly (so it is drawn, not replaced by the automatic one). */
export function minorStepFits(step: number, minorStep: number): boolean {
  const parts = Math.round(step / minorStep);
  return parts >= 2 && parts <= 50 && Math.abs(parts * minorStep - step) <= 1e-9 * step;
}

/** An axis' ticks: on whole steps, or on a log axis at each power of ten with 2 to 9 times it between. */
export function scaleTicks(scale: AxisScale, minorStep: number | null): { major: number[]; minor: number[] } {
  if (scale.categories) return { major: scale.categories.map((_, index) => index + 1), minor: [] };
  // A date axis' steps are time units, which minor ticks would split into odd parts.
  if (scale.format === "date") return axisTicks(scale.min, scale.max, scale.step, 0);
  if (!scale.log) return axisTicks(scale.min, scale.max, scale.step, minorParts(scale.step, minorStep) - 1);
  const minor = minorStep === 0 ? 0 : 1;
  const major: number[] = [], minors: number[] = [];
  const first = Math.floor(Math.log10(scale.min) - 1e-9), last = Math.ceil(Math.log10(scale.max) + 1e-9);
  for (let k = first; k <= last && major.length <= 60; k++) {
    const power = Number((10 ** k).toPrecision(12));
    if (power >= scale.min * (1 - 1e-9) && power <= scale.max * (1 + 1e-9)) major.push(power);
    if (minor > 0) for (let j = 2; j <= 9; j++) { const value = Number((j * 10 ** k).toPrecision(12)); if (value > scale.min && value < scale.max) minors.push(value); }
  }
  return { major, minor: minors };
}

/**
 * A tick label on an axis: by its step; on a log axis, powers of ten written out (0.01, 1000) while the whole axis lies
 * within 0.001 to 10000, else all as 10ⁿ, so that one axis keeps one style.
 */
export function scaleLabel(scale: AxisScale, value: number): string {
  if (scale.categories) return scale.categories[Math.round(value) - 1] ?? "";
  if (scale.format === "date") return dateLabel(scale, value);
  if (scale.numbers) return formattedLabel(scale, scale.numbers, value);
  if (scale.format === "percent") return `${tickLabel(value * 100, scale.step * 100)}%`;
  if (!scale.log) return tickLabel(value, scale.step);
  const k = Math.round(Math.log10(value));
  if (Math.abs(value - 10 ** k) > 1e-9 * value) return Number(value.toPrecision(6)).toString();
  if (scale.min >= 1e-3 * (1 - 1e-9) && scale.max <= 1e4 * (1 + 1e-9)) return k < 0 ? (10 ** k).toFixed(-k) : String(10 ** k);
  const superscript = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  return `10${k < 0 ? "⁻" : ""}${String(Math.abs(k)).split("").map((digit) => superscript[Number(digit)]).join("")}`;
}

/**
 * A tick label in a chosen number format. One axis keeps one style: automatic notation is decided for the whole axis
 * (scientific when its larger end is from 10⁶ or below 10⁻⁴, as forge-shell's automatic), and fixed numbers without set
 * decimals take as many as the step has; a percentage axis writes its numbers times 100 with %.
 */
function formattedLabel(scale: AxisScale, numbers: NumberFormat, value: number): string {
  const percent = scale.format === "percent", times = percent ? 100 : 1, shown = Math.abs(value) < scale.step * 1e-9 ? 0 : value * times;
  const size = Math.max(Math.abs(scale.min), Math.abs(scale.max)) * times;
  const notation = numbers.notation !== "auto" ? numbers.notation : size !== 0 && (size >= 1e6 || size < 1e-4) ? "scientific" : "fixed";
  const decimals = numbers.decimals ?? (notation === "fixed" ? Math.min(DECIMALS_MAX, scale.log ? decimalsOf(value) : decimalsOf(scale.step * times)) : null);
  return formatNumber(shown, { notation, decimals, ...(percent ? { unit: "%" } : {}) });
}

/** Major ticks on whole steps within the range, and `minor` ticks between each two (and beyond the ends, within it). */
export function axisTicks(min: number, max: number, step: number, minor: number): { major: number[]; minor: number[] } {
  const major: number[] = [], minors: number[] = [];
  const first = Math.ceil(min / step - 1e-9), last = Math.floor(max / step + 1e-9);
  for (let k = first; k <= last && major.length <= 200; k++) major.push(clean(k * step, step));
  const parts = Math.max(0, Math.round(minor)) + 1, sub = step / parts;
  if (parts > 1) for (let k = first - 1; k <= last; k++) for (let j = 1; j < parts; j++) {
    const value = k * step + j * sub;
    if (value > min + sub * 1e-6 && value < max - sub * 1e-6) minors.push(Number(value.toPrecision(12)));
  }
  return { major, minor: minors };
}

/** A tick label: as many decimals as the step has, and a true minus sign. */
export function tickLabel(value: number, step: number): string {
  const text = (Math.abs(value) < step * 1e-9 ? 0 : value).toFixed(Math.min(10, decimalsOf(step)));
  return text.startsWith("-") ? `−${text.slice(1)}` : text;
}
/** The decimals a number is written with at ten significant digits (0.25: 2; 5e-7: 7). */
function decimalsOf(step: number): number {
  const text = Number(step.toPrecision(10)).toString();
  if (/e-/.test(text)) return Number(text.split("e-")[1]) + (text.split("e")[0].split(".")[1]?.length ?? 0);
  return text.split(".")[1]?.length ?? 0;
}

/** An axis' title as shown: its own, or "Name (unit)" of the named range of the first series on that axis. */
export function axisTitle(axis: PlotAxis, name: Pick<NamedRange, "name" | "unit"> | null): string {
  return axis.title ?? (name ? rangeTitle(name) : "");
}

/** A series' legend text: its own name, its Y range's name, or `fallback` (the range's reference). */
export function seriesName(series: PlotSeries, y: Pick<NamedRange, "name"> | null, fallback: string): string {
  return series.name ?? y?.name ?? fallback;
}

// MARK: layout

/** A text's ink and its measure (forge-shell text-math): its advance width and how far its letters reach above and below
 * the baseline, in content pixels for a size in points, in its own font or in a given family. */
export type { MeasureText, TextInk } from "forge-shell/app/text-math";

/** The height of a text's ink. */
export const inkHeight = (ink: TextInk) => ink.ascent + ink.descent;
/** The baseline's offset from the middle of a text's ink, so that the letters are centred on a point. */
export const inkCentre = (ink: TextInk) => (ink.ascent - ink.descent) / 2;

export interface PlotLayout {
  /** The ratio to the 480 × 320 plot (plotScale) every size of the plot is drawn at. */
  scale: number;
  /** The plot area, where the data is drawn, in content pixels. */
  area: { x: number; y: number; width: number; height: number };
  /** The centres of the titles' ink; the plot's title and the axis titles are centred on the plot area. */
  title: { x: number; y: number } | null;
  xTitle: { x: number; y: number } | null;
  yTitle: { x: number; y: number } | null;
  y2Title: { x: number; y: number } | null;
  x2Title: { x: number; y: number } | null;
  /** Where tick labels sit: the middle of the X labels' ink, the right edge of the Y labels, the left edge of the right Y labels. */
  xLabelsMiddle: number;
  yLabelsRight: number;
  y2LabelsLeft: number;
  /** The middle of the top X labels' ink. */
  x2LabelsMiddle: number;
  /**
   * Where each axis' tick labels are anchored across it (a y for the X axes, an x for the Y axes), as labelPlacement
   * turns and aligns them; level labels are anchored at the fields above.
   */
  labelAnchors: { x: number; y: number; y2: number; x2: number };
  /** The legend's offset from its corner, in content pixels. */
  legendShift: { dx: number; dy: number };
}

/**
 * Hand moves of a plot's parts, in points at 480 × 320 (scaled with the plot as everything else is): the plot area's
 * edges (right and down are positive), and the titles' and legend's offsets. The plot lab uses them to find the
 * proportions the owner wants; none is stored yet.
 */
export interface PlotNudge {
  left?: number; right?: number; top?: number; bottom?: number;
  title?: { dx: number; dy: number }; xTitle?: { dx: number; dy: number }; yTitle?: { dx: number; dy: number }; y2Title?: { dx: number; dy: number }; x2Title?: { dx: number; dy: number };
  legend?: { dx: number; dy: number };
}

/** What a plot shows around its plot area. Without a right axis, `y2Labels` is null; without a top one, `x2Labels`. */
export interface PlotParts {
  title: string;
  xTitle: string;
  yTitle: string;
  y2Title: string;
  yLabels: readonly string[];
  y2Labels: readonly string[] | null;
  firstXLabel: string;
  lastXLabel: string;
  x2Title?: string;
  /** The top X axis' first and last labels, which reach past the plot area's corners, and all of them (for turned ones). */
  x2Labels?: { first: string; last: string; all?: readonly string[] } | null;
  /** All the bottom X axis' labels, which turned labels hang down by; absent: the first and last. */
  xLabels?: readonly string[];
  /** The tick labels' turns (absent: level). */
  angles?: Partial<Record<"x" | "y" | "y2" | "x2", LabelAngle>>;
}

/**
 * How an axis' tick labels are turned and aligned on their anchor (PlotLayout.labelAnchors): level labels are centred
 * under or over their tick, or end at it beside a Y axis; turned ones (counter-clockwise) end at the tick below the
 * plot area and start at it above and to the right; upright labels beside a Y axis are centred on their tick.
 */
export function labelPlacement(axis: "x" | "y" | "y2" | "x2", angle: LabelAngle = 0): { anchor: "start" | "middle" | "end"; rotate: number } {
  const rotate = -angle;
  if (axis === "x") return { anchor: angle ? "end" : "middle", rotate };
  if (axis === "x2") return { anchor: angle ? "start" : "middle", rotate };
  if (angle === 90) return { anchor: "middle", rotate };
  return { anchor: axis === "y" ? "end" : "start", rotate };
}

/**
 * Where the parts of a plot go inside its box, at its scale. The figure is framed by one outer margin (padPt) on all
 * four sides, from the border to the nearest letters or line; inside it, parts are spaced by how closely they belong
 * together (tickGapPt < titleGapPt < headGapPt), so each axis reads as one group with its labels and title. The plot
 * area takes all the room the parts leave, and the title and X axis title are centred on it; the title sits halfway
 * between the top edge and the top axis. Text is placed by its ink
 * (TextInk), so the spaces are the ones seen. The plot area is never smaller than a quarter of the box.
 */
export function layoutPlot(box: { x: number; y: number; width: number; height: number }, parts: PlotParts, measure: MeasureText, nudge: PlotNudge = {}): PlotLayout {
  const s = PLOT_STYLE, k = drawScale(box), u = PT * k, pad = s.padPt * u, tickGap = s.tickGapPt * u, titleGap = s.titleGapPt * u, headGap = s.headGapPt * u;
  const tickOut = s.majorTick === "cross" ? s.majorTickPt * u : 0;
  const none: TextInk = { width: 0, ascent: 0, descent: 0 };
  // Text is at its own size whatever the plot's (unless set to scale with it); lines, ticks, markers and gaps follow the plot's scale.
  const ink = (text: string, pt: number) => (text ? measure(text, pt * textScale(k)) : none);
  const title = ink(parts.title, s.titlePt), xTitle = ink(parts.xTitle, s.textPt), yTitle = ink(parts.yTitle, s.textPt);
  const y2Title = parts.y2Labels ? ink(parts.y2Title, s.textPt) : none;
  const yLabels = parts.yLabels.map((label) => ink(label, s.textPt)), y2Labels = (parts.y2Labels ?? []).map((label) => ink(label, s.textPt));
  const firstX = ink(parts.firstXLabel, s.textPt), lastX = ink(parts.lastXLabel, s.textPt);
  // A top X axis: its labels above the plot area and its title above them, below the plot's title.
  const top2 = parts.x2Labels ?? null;
  const firstX2 = top2 ? ink(top2.first, s.textPt) : none, lastX2 = top2 ? ink(top2.last, s.textPt) : none;
  const x2Title = top2 ? ink(parts.x2Title ?? "", s.textPt) : none;
  const widest = (labels: readonly TextInk[]) => Math.max(0, ...labels.map((label) => label.width));
  // The labels' row: as tall as the tallest label's ink; a Y label is centred on its tick, so half of it reaches past
  // the plot area's top.
  const labelHeight = Math.max(0, ...[...yLabels, ...y2Labels, firstX, lastX, firstX2, lastX2].map(inkHeight));
  // Turned labels (labelPlacement), each by its own ink along it and the row's height across it: an X row is as deep
  // as its longest label reaches down (or up, on top), a Y column as wide as its longest reaches out.
  const angles = parts.angles ?? {}, rad = (angle: LabelAngle | undefined) => ((angle ?? 0) * Math.PI) / 180;
  const half = labelHeight / 2;
  const xRow = (angle: LabelAngle | undefined, labels: readonly TextInk[]) => (angle ? widest(labels) * Math.sin(rad(angle)) + labelHeight * Math.cos(rad(angle)) : labelHeight);
  const xAnchor = (angle: LabelAngle | undefined) => (angle ? half * Math.cos(rad(angle)) : half);
  const yColumn = (angle: LabelAngle | undefined, labels: readonly TextInk[]) => (angle ? Math.max(0, ...labels.map((label) => label.width * Math.cos(rad(angle)))) + labelHeight * Math.sin(rad(angle)) : widest(labels));
  const yAnchor = (angle: LabelAngle | undefined) => (angle === 90 ? half : angle ? half * Math.sin(rad(angle)) : 0);
  const allX = parts.xLabels ? parts.xLabels.map((label) => ink(label, s.textPt)) : [firstX, lastX];
  const allX2 = top2 ? (top2.all ? top2.all.map((label) => ink(label, s.textPt)) : [firstX2, lastX2]) : [];
  const xDeep = xRow(angles.x, allX), x2Deep = top2 ? xRow(angles.x2, allX2) : 0;
  // How far the end labels reach past the plot area's sides: a level one by half its width; a turned one below hangs
  // to the left (above: to the right) by its length.
  const reachSide = (angle: LabelAngle | undefined, label: TextInk, along: boolean) => (!angle ? label.width / 2 : (along ? label.width * Math.cos(rad(angle)) : 0) + half * Math.sin(rad(angle)));
  const reachLeft = Math.max(reachSide(angles.x, firstX, true), top2 ? reachSide(angles.x2, firstX2, false) : 0);
  const reachRight = Math.max(reachSide(angles.x, lastX, false), top2 ? reachSide(angles.x2, lastX2, true) : 0);
  // How far the Y labels reach above the top tick: half the row level; upright, half the longest; slanted, half the row
  // on the left, and on the right (which slants up) the longest label's rise too.
  const reachUp = (angle: LabelAngle | undefined, labels: readonly TextInk[], right: boolean) => (!angle ? half : angle === 90 ? widest(labels) / 2 : half * Math.cos(rad(angle)) + (right ? widest(labels) * Math.sin(rad(angle)) : 0));
  const up = Math.max(reachUp(angles.y, yLabels, false), parts.y2Labels ? reachUp(angles.y2, y2Labels, true) : 0);
  // The axes' distances from the edges (the owner's rules, 2026-11-17 and 2026-11-18). With numbers on one side alone,
  // the other axis stands in from its edge as far as the numbered one does from its own, less half its widest number
  // (along X: less half the numbers' height). With numbers on both sides, both axes stand in equally from their edges,
  // as far as the side that needs more (its title, gaps and numbers), so the plot area sits balanced between them. A
  // plot title above needs its own room, and adds it at the top.
  const side = (titleInk: TextInk, width: number) => pad + (titleInk.width ? inkHeight(titleInk) + titleGap : 0) + (width ? width + tickGap : 0) + tickOut;
  const leftWidest = yColumn(angles.y, yLabels), rightWidest = yColumn(angles.y2, y2Labels);
  const leftOwn = side(yTitle, leftWidest);
  const leftSide = parts.y2Labels ? Math.max(leftOwn, side(y2Title, rightWidest)) : leftOwn;
  const rightSide = parts.y2Labels ? leftSide : leftOwn - leftWidest / 2;
  const left = Math.min(Math.max(leftSide, pad + reachLeft), box.width * 0.375);
  const right = Math.min(Math.max(rightSide, pad + reachRight), box.width * 0.375);
  const head = pad + (title.width ? inkHeight(title) + headGap : 0);
  const along = (titleInk: TextInk, row: number) => (titleInk.width ? inkHeight(titleInk) + titleGap : 0) + row + tickGap + tickOut;
  const deeper = top2 ? Math.max(along(xTitle, xDeep), along(x2Title, x2Deep)) : along(xTitle, xDeep);
  const bottom = pad + deeper;
  const top = top2 ? head + deeper : Math.max(bottom - xDeep + half, head + up);
  const move = (offset: { dx: number; dy: number } | undefined) => ({ dx: (offset?.dx ?? 0) * u, dy: (offset?.dy ?? 0) * u });
  let x = box.x + left + (nudge.left ?? 0) * u, y = box.y + top + (nudge.top ?? 0) * u;
  let areaRight = box.x + box.width - right + (nudge.right ?? 0) * u;
  let areaBottom = box.y + box.height - bottom + (nudge.bottom ?? 0) * u;
  if (areaRight - x < box.width / 4) { const middle = (x + areaRight) / 2; x = middle - box.width / 8; areaRight = middle + box.width / 8; }
  if (areaBottom - y < box.height / 4) areaBottom = y + box.height / 4;
  const area = { x, y, width: areaRight - x, height: areaBottom - y };
  const centre = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
  const at = (point: { x: number; y: number }, offset: { dx: number; dy: number } | undefined) => { const shift = move(offset); return { x: point.x + shift.dx, y: point.y + shift.dy }; };
  // The plot's title is centred between the top edge and the top axis (the owner's rule, 2026-11-19): its letters' middle
  // halfway down, so its baseline is half its letters' height below that. With a top X axis, between the edge and that
  // axis' title or numbers.
  const under = !top2 ? y : x2Title.width ? box.y + head : y - tickOut - tickGap - x2Deep;
  return {
    scale: k, area,
    title: title.width ? at({ x: centre.x, y: (box.y + under) / 2 }, nudge.title) : null,
    xTitle: xTitle.width ? at({ x: centre.x, y: box.y + box.height - pad - inkHeight(xTitle) / 2 }, nudge.xTitle) : null,
    yTitle: yTitle.width ? at({ x: area.x - tickOut - (yLabels.length ? leftWidest + tickGap : 0) - titleGap - inkHeight(yTitle) / 2, y: centre.y }, nudge.yTitle) : null,
    x2Title: x2Title.width ? at({ x: centre.x, y: box.y + head + inkHeight(x2Title) / 2 }, nudge.x2Title) : null,
    y2Title: y2Title.width ? at({ x: areaRight + tickOut + (y2Labels.length ? rightWidest + tickGap : 0) + titleGap + inkHeight(y2Title) / 2, y: centre.y }, nudge.y2Title) : null,
    legendShift: move(nudge.legend),
    xLabelsMiddle: areaBottom + tickOut + tickGap + xDeep / 2,
    yLabelsRight: area.x - tickOut - tickGap,
    y2LabelsLeft: areaRight + tickOut + tickGap,
    x2LabelsMiddle: y - tickOut - tickGap - x2Deep / 2,
    labelAnchors: {
      x: areaBottom + tickOut + tickGap + xAnchor(angles.x), y: area.x - tickOut - tickGap - yAnchor(angles.y),
      y2: areaRight + tickOut + tickGap + yAnchor(angles.y2), x2: y - tickOut - tickGap - xAnchor(angles.x2),
    },
  };
}

// MARK: the document's records

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const COLOUR = /^#[0-9a-f]{6}$/i;

function parseAxis(raw: any, what: string): PlotAxis {
  if (raw === undefined) return defaultAxis();
  if (!raw || typeof raw !== "object") throw new PlotError(`The document has a plot with an invalid ${what}.`);
  const end = (value: unknown) => { if (value === undefined || value === null) return null; if (!isNumber(value)) throw new PlotError(`The document has a plot with an invalid ${what}.`); return value; };
  const step = end(raw.step);
  if (step !== null && step <= 0) throw new PlotError(`The document has a plot with an invalid ${what} step.`);
  if (raw.title !== undefined && raw.title !== null && typeof raw.title !== "string") throw new PlotError(`The document has a plot with an invalid ${what} title.`);
  // Documents before the minor step kept a count of minor ticks: none stays none, any other count turns automatic.
  const minorStep = raw.minorStep !== undefined ? end(raw.minorStep) : raw.minor === 0 ? 0 : null;
  if (minorStep !== null && minorStep < 0) throw new PlotError(`The document has a plot with an invalid ${what} minor step.`);
  if (raw.log !== undefined && typeof raw.log !== "boolean") throw new PlotError(`The document has a plot with an invalid ${what} scale.`);
  const numbers = raw.numbers === undefined ? undefined : parseNumbers(raw.numbers, what);
  if (raw.angle !== undefined && !LABEL_ANGLES.includes(raw.angle)) throw new PlotError(`The document has a plot with an invalid ${what} label angle.`);
  return { title: raw.title ?? null, min: end(raw.min), max: end(raw.max), step, minorStep, log: raw.log === true,
    ...(AXIS_FORMATS.includes(raw.format) && raw.format !== "auto" ? { format: raw.format as AxisFormat } : {}),
    ...(numbers ? { numbers } : {}), ...(raw.angle ? { angle: raw.angle as LabelAngle } : {}) };
}

/** An axis' number format as the document keeps it: a notation and decimals (null: automatic). */
function parseNumbers(raw: any, what: string): NumberFormat | undefined {
  const decimals = raw?.decimals ?? null;
  if (!raw || typeof raw !== "object" || !NOTATIONS.includes(raw.notation) || (decimals !== null && (!Number.isInteger(decimals) || decimals < 0 || decimals > DECIMALS_MAX)))
    throw new PlotError(`The document has a plot with an invalid ${what} number format.`);
  return axisNumbers({ notation: raw.notation, decimals });
}

/** An axis in a fixed key order, each setting left out while it is automatic. */
function axisRecord(axis: PlotAxis): Record<string, unknown> {
  return {
    ...(axis.title !== null ? { title: axis.title } : {}), ...(axis.min !== null ? { min: axis.min } : {}),
    ...(axis.max !== null ? { max: axis.max } : {}), ...(axis.step !== null ? { step: axis.step } : {}), ...(axis.minorStep !== null ? { minorStep: axis.minorStep } : {}),
    ...(axis.log ? { log: true } : {}), ...(axis.format && axis.format !== "auto" ? { format: axis.format } : {}),
    ...(axis.numbers ? { numbers: { notation: axis.numbers.notation, decimals: axis.numbers.decimals } } : {}), ...(axis.angle ? { angle: axis.angle } : {}),
  };
}

/** A plot as the document stores it, keys in a fixed order. */
export function plotRecord(plot: ProjectPlot): Record<string, unknown> {
  return {
    id: plot.id, name: plot.name, x: plot.x, y: plot.y, width: plot.width, height: plot.height,
    ...(plot.title ? { title: plot.title } : {}), xAxis: axisRecord(plot.xAxis), yAxis: axisRecord(plot.yAxis),
    ...(Object.keys(axisRecord(plot.y2Axis)).length || plot.series.some((series) => series.axis === "y2") ? { y2Axis: axisRecord(plot.y2Axis) } : {}),
    ...(Object.keys(axisRecord(plot.x2Axis)).length || plot.series.some((series) => series.xAxis === "x2") ? { x2Axis: axisRecord(plot.x2Axis) } : {}), legend: plot.legend,
    ...(plot.legendPlace !== "auto" ? { legendPlace: plot.legendPlace } : {}), ...(plot.legendBack !== "white" ? { legendBack: plot.legendBack } : {}),
    series: plot.series.map((series) => ({
      id: series.id, x: series.x ? cellsRecord(series.x) : null, y: cellsRecord(series.y), ...(series.error ? { error: cellsRecord(series.error) } : {}), ...(series.labels ? { labels: cellsRecord(series.labels) } : {}), kind: series.kind,
      ...(series.connect !== "straight" ? { connect: series.connect } : {}), ...(series.colour ? { ownColour: series.colour } : {}), symbol: series.symbol,
      symbolSize: series.symbolSize, lineWidth: series.lineWidth, dash: series.dash, ...(series.name !== null ? { name: series.name } : {}),
      ...(series.axis !== "y" ? { axis: series.axis } : {}), ...(series.xAxis !== "x" ? { xAxis: series.xAxis } : {}),
      ...(series.callouts.all || series.callouts.points.length ? { callouts: { ...(series.callouts.all ? { all: series.callouts.all } : {}), ...(series.callouts.points.length ? { points: series.callouts.points.map((point) => ({ ...point })) } : {}) } } : {}), ...(series.fits.length ? { fits: series.fits.map(fitRecord) } : {}),
    })),
    ...(plot.exportFormat !== PLOT_EXPORT_DEFAULT.format ? { exportFormat: plot.exportFormat } : {}),
    ...(plot.exportDpi !== PLOT_EXPORT_DEFAULT.dpi ? { exportDpi: plot.exportDpi } : {}),
  };
}

function parseCallouts(raw: any, bad: () => Error): SeriesCallouts {
  if (raw === undefined) return { all: null, points: [] };
  const text = (value: unknown) => { if (value === null || value === undefined) return null; if (!CALLOUT_TEXTS.includes(value as CalloutText)) throw bad(); return value as CalloutText; };
  if (!raw || typeof raw !== "object" || (raw.points !== undefined && !Array.isArray(raw.points))) throw bad();
  const points = (raw.points ?? []).map((point: any) => {
    if (!point || !Number.isInteger(point.index) || point.index < 0) throw bad();
    return { index: point.index as number, text: text(point.text) };
  });
  return { all: text(raw.all), points };
}

/** A series of a plot from the document; `plot` names the plot in messages. */
function parseSeries(entry: any, plot: string): PlotSeries {
  const bad = (what: string) => new PlotError(`The plot ${plot} has a series with an invalid ${what}.`);
  if (!entry || typeof entry !== "object") throw bad("record");
  if (typeof entry.id !== "string" || !entry.id) throw bad("id");
  // A series from before ranges (2026-11-17) names a data file, two columns and rows they share.
  const legacy = typeof entry.data === "string";
  const rows = entry.rows;
  if (legacy && rows !== undefined && !(Array.isArray(rows) && rows.length === 2 && rows.every((row: unknown) => Number.isInteger(row) && (row as number) >= 0) && rows[0] <= rows[1])) throw bad("row range");
  const old = (column: unknown) => (typeof column === "string" && column ? parseCells({ data: entry.data, column, ...(rows ? { rows } : {}) }) : null);
  const x = legacy ? old(entry.x) : entry.x === null ? null : parseCells(entry.x), y = legacy ? old(entry.y) : parseCells(entry.y);
  if (!y || (x === null && (legacy || entry.x !== null))) throw bad(!y ? "y" : "x");
  const error = entry.error === undefined ? null : parseCells(entry.error);
  if (entry.error !== undefined && !error) throw bad("error range");
  const labels = entry.labels === undefined ? null : parseCells(entry.labels);
  if (entry.labels !== undefined && !labels) throw bad("label range");
  if (!PLOT_KINDS.includes(entry.kind)) throw bad("kind");
  if (entry.connect !== undefined && !LINE_CONNECTS.includes(entry.connect)) throw bad("connect");
  // Only a picked colour is kept (`ownColour`, since forge-shell 4.7.0); the `colour` every series stored before is
  // left out, so that an earlier document's series follow the data palette too.
  if (entry.ownColour !== undefined && (typeof entry.ownColour !== "string" || !COLOUR.test(entry.ownColour))) throw bad("colour");
  if (!SYMBOL_SHAPES.includes(entry.symbol)) throw bad("symbol");
  if (!LINE_DASHES.includes(entry.dash)) throw bad("dash");
  for (const key of ["symbolSize", "lineWidth"] as const) if (!isNumber(entry[key]) || entry[key] <= 0 || entry[key] > 72) throw bad(key);
  if (entry.name !== undefined && typeof entry.name !== "string") throw bad("name");
  if (entry.axis !== undefined && !SERIES_AXES.includes(entry.axis)) throw bad("axis");
  if (entry.xAxis !== undefined && !SERIES_X_AXES.includes(entry.xAxis)) throw bad("X axis");
  const callouts = parseCallouts(entry.callouts, () => bad("callouts"));
  return {
    id: entry.id, x, y, error, labels, kind: entry.kind, connect: entry.connect ?? "straight", colour: entry.ownColour ?? null, symbol: entry.symbol, symbolSize: entry.symbolSize,
    lineWidth: entry.lineWidth, dash: entry.dash, name: entry.name ?? null, axis: entry.axis ?? "y", xAxis: entry.xAxis ?? "x", callouts, fits: parseFits(entry.fits, entry.fit, bad, entry.id),
  };
}
/**
 * The plots of a document; one stored without them has none. A series whose data file the document no longer links
 * (the worksheet was deleted) is kept, and shown as not drawn, so that the document still opens.
 */
export function parsePlots(raw: unknown): ProjectPlot[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new PlotError("The document has an invalid plot list.");
  const plots = raw.map((item: any): ProjectPlot => {
    if (!item || typeof item !== "object") throw new PlotError("The document has an invalid plot.");
    for (const key of ["id", "name"] as const) if (typeof item[key] !== "string" || !item[key]) throw new PlotError(`The document has a plot with an invalid ${key}.`);
    for (const key of ["x", "y"] as const) if (!isNumber(item[key])) throw new PlotError(`The document has a plot with an invalid ${key}.`);
    for (const key of ["width", "height"] as const) if (!isNumber(item[key]) || item[key] <= 0) throw new PlotError(`The document has a plot with an invalid ${key}.`);
    if (item.title !== undefined && typeof item.title !== "string") throw new PlotError("The document has a plot with an invalid title.");
    if (!Array.isArray(item.series)) throw new PlotError(`The plot ${item.name} has an invalid series list.`);
    const series = item.series.map((entry: any) => parseSeries(entry, item.name));
    if (item.exportFormat !== undefined && !PLOT_EXPORT_FORMATS.includes(item.exportFormat)) throw new PlotError(`The plot ${item.name} has an invalid export format.`);
    if (item.exportDpi !== undefined && !(Number.isInteger(item.exportDpi) && item.exportDpi >= 72 && item.exportDpi <= 1200)) throw new PlotError(`The plot ${item.name} has an invalid export resolution.`);
    if (new Set(series.map((entry: PlotSeries) => entry.id)).size !== series.length) throw new PlotError(`The plot ${item.name} has two series with the same id.`);
    return {
      id: item.id, name: item.name, x: item.x, y: item.y, width: item.width, height: item.height, title: item.title ?? "",
      xAxis: parseAxis(item.xAxis, "X axis"), yAxis: parseAxis(item.yAxis, "Y axis"), y2Axis: parseAxis(item.y2Axis, "right Y axis"), x2Axis: parseAxis(item.x2Axis, "top X axis"), legend: item.legend !== false,
      legendPlace: item.legendPlace in LEGEND_PLACES ? item.legendPlace : "auto", legendBack: item.legendBack === "none" ? "none" : "white", series,
      exportFormat: item.exportFormat ?? PLOT_EXPORT_DEFAULT.format, exportDpi: item.exportDpi ?? PLOT_EXPORT_DEFAULT.dpi,
    };
  });
  if (new Set(plots.map((plot) => plot.id)).size !== plots.length) throw new PlotError("The document has two plots with the same id.");
  return plots;
}
