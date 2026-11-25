// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Plots in the interface: each is drawn on the work surface as a figure on paper, white with black ink in every
// appearance, at print size at 100% (plot.ts lays it out in points), and the inspector's Plot mode edits its title,
// legend, axes, series and placement. The numbers come from the worksheets each time the plot is drawn.
import { createCheckRow, createField, createRow } from "forge-shell/app/builders";
import { createDataColourControl } from "forge-shell/app/data-colour";
import { setTip } from "forge-shell/app/tips";

import { roleFont } from "forge-shell/app/fonts";
import { drawTextRuns } from "forge-shell/app/text-math";
import { canvasBytes, rasterSize } from "forge-shell/app/raster-export";
import { showContextMenu, type MenuEntry } from "forge-shell/app/context-menu";
import { createPartLine, createPartList, type PartStep } from "forge-shell/app/properties";
import { createNumberFormatField, DEFAULT_NUMBER_FORMAT } from "forge-shell/app/number-format";
import {
  axisTitle, CONNECT_NAMES, DASH_NAMES, LINE_CONNECTS, rangeLabel, rangeName, parseReference, type ReferenceSheet, seriesName, seriesReference, setSeriesRows, LINE_DASHES, PLOT_KIND_NAMES, PLOT_KINDS, PLOT_SIZE, PLOT_STYLE, plotScene, plotSvg,
  PT, resolvePlot, AXIS_FORMATS, AXIS_FORMAT_NAMES, type AxisFormat, LABEL_ANGLES, type LabelAngle, axisNumbers, SERIES_AXES, SERIES_AXIS_NAMES, SERIES_X_AXES, SERIES_X_AXIS_NAMES, type SeriesXAxis, rowsText, parseRowsInput, SYMBOL_NAMES, SYMBOL_SHAPES, scaleLabel, SHEET, type AxisScale, minorParts, minorStepFits, tickLabel,
  type CellRange, type LineConnect, type PlotSources, type DrawnSeries, type SeriesData, type FitKind, type FitResult, type SeriesFit,
  pointMarker, chosenPoints, LEGEND_PLACES, LEGEND_BACKS, type LegendPlace, type LegendBack, swapAxes, textFamily, type PlotPart, DEFAULT_FIT, FIT_KINDS, FIT_NAMES, FIT_WINDOWS, hasOrder, isSmoothing, plotSheet, type LineDash, type MeasureText, type PlotAxis, type PlotKind, type PlotScene, type PlotSeries, type ProjectData, type ProjectPlot, type SceneItem,
  type SeriesAxis, type SymbolShape, samePart, seriesColour, partName, type PlotAxisKey,
} from "../engine";
import { renderPlacement as placementRows } from "./placement-view";
import { selectField } from "./settings-view";
import { crisp } from "./crisp";
import { modelName, plotColours, renderFit, renderSeriesFits } from "./fitting-view";

const font = (px: number, family: string = PLOT_STYLE.font) => `${px}px ${family}`;

/** A text's ink in content pixels in the plot's font, from a context: its advance width and its letters' reach. */
export function plotMeasure(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): MeasureText {
  return (text, pt, family) => {
    ctx.font = font(pt * PT, family ?? textFamily(text));
    const metrics = ctx.measureText(text);
    return { width: metrics.width, ascent: metrics.actualBoundingBoxAscent, descent: metrics.actualBoundingBoxDescent };
  };
}

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draw a scene on a canvas, its origin at (x, y) in the context's space. Crisp lines are put on whole device pixels
 * under the context's transform, so the frame and ticks stay sharp at any zoom and in a print-resolution export;
 * everything else is drawn as vectors, so nothing is a scaled bitmap.
 */
export function drawScene(ctx: Context, scene: PlotScene, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  drawItems(ctx, scene.items);
  ctx.restore();
}

function drawItems(ctx: Context, items: readonly SceneItem[]): void {
  for (const item of items) {
    if (item.kind === "clip") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(item.x, item.y, item.width, item.height);
      ctx.clip();
      drawItems(ctx, item.items);
      ctx.restore();
      continue;
    }
    if (item.kind === "text") {
      ctx.save();
      ctx.translate(item.x, item.y);
      if (item.rotate) ctx.rotate((item.rotate * Math.PI) / 180);
      ctx.font = font(item.size, item.family);
      ctx.fillStyle = item.colour;
      ctx.textAlign = item.anchor === "start" ? "left" : item.anchor === "end" ? "right" : "center";
      ctx.textBaseline = "alphabetic";
      if (item.runs) drawTextRuns(ctx, item.runs, 0, item.dy);
      else ctx.fillText(item.text, 0, item.dy);
      ctx.restore();
      continue;
    }
    // Crisp lines: a width of whole device pixels, and positions on them.
    const pen = item.crisp && item.stroke ? crisp(ctx as CanvasRenderingContext2D, item.stroke.width) : null;
    const px = (value: number) => (pen ? pen.x(value) : value), py = (value: number) => (pen ? pen.y(value) : value);
    ctx.beginPath();
    if (item.kind === "rect") ctx.rect(px(item.x), py(item.y), px(item.x + item.width) - px(item.x), py(item.y + item.height) - py(item.y));
    else for (const op of item.ops) {
      if (op.op === "Z") ctx.closePath();
      else if (op.op === "circle") { ctx.moveTo(op.x + op.r, op.y); ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2); }
      else if (op.op === "M") ctx.moveTo(px(op.x), py(op.y));
      else if (op.op === "C") ctx.bezierCurveTo(px(op.x1), py(op.y1), px(op.x2), py(op.y2), px(op.x), py(op.y));
      else ctx.lineTo(px(op.x), py(op.y));
    }
    if (item.fill) { ctx.fillStyle = item.fill; ctx.fill(); }
    if (item.stroke) {
      ctx.strokeStyle = item.stroke.colour;
      ctx.lineWidth = pen ? pen.width : item.stroke.width;
      ctx.setLineDash(item.stroke.dash as number[]);
      ctx.lineCap = item.kind === "path" ? item.cap : "butt";
      ctx.lineJoin = item.kind === "path" ? item.join : "miter";
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

/**
 * A chosen series or point drawn again in the selection colour, over the plot, as it is drawn (so it keeps its size
 * and place at any zoom): a series' line, error bars, columns and markers; a point's marker or column.
 */
export function chosenItems(scene: PlotScene, plot: ProjectPlot, part: PlotPart, colour: string): SceneItem[] {
  if (part.kind === "series") {
    const recolour = (item: SceneItem): SceneItem | null => {
      if (item.kind === "clip") { const inner = item.items.map(recolour).filter((each): each is SceneItem => !!each); return inner.length ? { ...item, items: inner } : null; }
      if ((item.kind !== "rect" && item.kind !== "path") || item.series !== part.series) return null;
      return { ...item, ...(item.fill ? { fill: colour } : {}), ...(item.stroke ? { stroke: { ...item.stroke, colour } } : {}) };
    };
    return scene.items.map(recolour).filter((each): each is SceneItem => !!each);
  }
  if (part.kind === "fit") {
    const recolour = (item: SceneItem): SceneItem | null => {
      if (item.kind === "clip") { const inner = item.items.map(recolour).filter((each): each is SceneItem => !!each); return inner.length ? { ...item, items: inner } : null; }
      return item.kind === "path" && item.fit === part.fit && item.stroke ? { ...item, stroke: { ...item.stroke, colour } } : null;
    };
    return scene.items.map(recolour).filter((each): each is SceneItem => !!each);
  }
  // An axis, the legend or the title: a thin frame about where it was drawn, in the selection colour.
  if (part.kind === "axis" || part.kind === "legend" || part.kind === "title") {
    const target = scene.targets.find((item) => "box" in item && samePart(item.part, part));
    if (!target || !("box" in target)) return [];
    const { x, y, width, height } = target.box, pad = 2;
    return [{ kind: "rect", x: x - pad, y: y - pad, width: width + 2 * pad, height: height + 2 * pad, stroke: { colour, width: 1, dash: [] } }];
  }
  const indices = chosenPoints(part);
  const series = "series" in part ? plot.series.find((item) => item.id === part.series) : undefined;
  const target = series ? scene.targets.find((item) => "points" in item && item.part.series === series.id) : undefined;
  if (!series || !target || !("points" in target)) return [];
  return target.points.filter((point) => indices.includes(point.index))
    .map((point): SceneItem => (point.bar ? { kind: "rect", ...point.bar, fill: colour } : pointMarker(series, point.x, point.y, scene, colour)));
}

/** The resize grip's reach from the bottom-right corner, in view pixels. */
const GRIP_PX = 14;

/** Whether a point (content pixels) is on a plot's resize grip, at the view's scale. */
export function onPlotGrip(plot: ProjectPlot, x: number, y: number, scale: number): boolean {
  const reach = GRIP_PX / scale;
  return x <= plot.x + plot.width && y <= plot.y + plot.height && x >= plot.x + plot.width - reach && y >= plot.y + plot.height - reach;
}

/**
 * Draw a plot on the work surface in content pixels (the context carries the view's zoom), from its scene (plotScene),
 * so that it is what an export gives. A plot none of whose series can be drawn says why, as a worksheet's missing note does; an export
 * leaves the plot area empty. The grip shows while it is
 * selected.
 */
export function drawPlot(ctx: CanvasRenderingContext2D, plot: ProjectPlot, sources: PlotSources, selected: boolean, scale: number, quiet: string, chosen: { part: PlotPart; colour: string } | null = null,
  hovered: { part: PlotPart; colour: string } | null = null): PlotScene {
  const box = plot, scene = plotScene(plot, sources, plotMeasure(ctx));
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  drawScene(ctx, scene, box.x, box.y);
  if (chosen) drawScene(ctx, { ...scene, items: chosenItems(scene, plot, chosen.part, chosen.colour) }, box.x, box.y);
  // The point under the pointer, drawn again in the selection colour as a chosen point is.
  if (hovered) drawScene(ctx, { ...scene, items: chosenItems(scene, plot, hovered.part, hovered.colour) }, box.x, box.y);
  if (scene.message) {
    // A note to the user, not part of the figure: as a worksheet's "is missing" note, in the interface face at its size
    // and weight and the quiet colour; never exported.
    ctx.font = roleFont("ui", SHEET.font);
    ctx.fillStyle = quiet;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(scene.message.text, box.x + scene.message.x, box.y + scene.message.y);
  }
  if (selected) {
    ctx.strokeStyle = quiet;
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    for (const inset of [5, 10]) { ctx.moveTo(box.x + box.width - inset / scale, box.y + box.height - 3 / scale); ctx.lineTo(box.x + box.width - 3 / scale, box.y + box.height - inset / scale); }
    ctx.stroke();
  }
  ctx.restore();
  return scene;
}

/**
 * A plot as the bytes of its export: an SVG of its scene, or the scene rasterised on white at the plot's resolution
 * (its content pixels are 96 to the inch) as PNG or JPEG, with that resolution recorded, so that it is placed at
 * print size.
 */
export async function plotExportBytes(plot: ProjectPlot, sources: PlotSources, jpegQuality = 92): Promise<Uint8Array> {
  const probe = new OffscreenCanvas(1, 1).getContext("2d")!;
  const scene = plotScene(plot, sources, plotMeasure(probe));
  if (plot.exportFormat === "svg") return new TextEncoder().encode(plotSvg(scene));
  // The pixel size at the print resolution, refused with a sentence when it is too large to draw (forge-shell raster-export).
  const size = rasterSize(scene.width, scene.height, plot.exportDpi);
  if ("error" in size) throw new Error(size.error);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = PLOT_STYLE.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(canvas.width / scene.width, canvas.height / scene.height);
  drawScene(ctx, scene, 0, 0);
  return canvasBytes(canvas, plot.exportFormat === "jpeg" ? "jpeg" : "png", { quality: jpegQuality, dpi: plot.exportDpi });
}

// MARK: the inspector's Plot mode

export interface PlotSectionsHost {
  /** The selected part's Properties section, its path first (`InspectorSections.properties`). */
  properties(path: readonly PartStep[]): HTMLElement;
  /** The part of the plot chosen (the plot itself until a part is chosen). */
  part: PlotPart;
  /** Choose a part of the plot, as a click on it on the plot does: the inspector then shows its Properties. */
  choose(part: PlotPart): void;
  /** Mark a part on the plot while the pointer is over its line in the inspector; null clears the mark. */
  mark(part: PlotPart | null): void;
  /** A part's context menu, the same on the plot and on its line (`partMenu`). */
  menu(part: PlotPart): MenuEntry[];
  /** A group that folds under its heading inside a section (the shell's `InspectorSections.group`); returns its body. */
  group(parent: HTMLElement, title: string, key: string): HTMLElement;
  nameRow(name: string, rename: { current(): string; validate(next: string): string | null; apply(next: string): void }): HTMLElement;
  /** Change the plot as one undoable edit. */
  edit(id: string, change: (plot: ProjectPlot) => void): void;
  report(text: string, kind: "info" | "error"): void;
  /** An action button, disabled with its tip saying why. */
  button(label: string, primary: boolean, enabled: boolean, action: () => void, tip: string): HTMLButtonElement;
  buttons(items: HTMLButtonElement[]): HTMLElement;
  /** The cells last chosen in a worksheet, one range per column, and how they are written; null with none. */
  chosenCells(): { ranges: CellRange[]; text: string } | null;
  /** Add the chosen cells to the plot as series. */
  addChosen(plotId: string): void;
  /** Wait for cells chosen in a worksheet to become a series' X, Y or error; the field waiting, if any. */
  pick(plotId: string, seriesId: string | null, which: "x" | "y" | "error" | "labels" | null): void;
  /** The field waiting for cells; seriesId null: the plot waits for cells to make new series of. */
  picking: { seriesId: string | null; which: "x" | "y" | "error" | "labels" } | null;
  /** The worksheets, for typed references (Sheet!B2:B40). */
  sheets: readonly ReferenceSheet[];
  /** Saved templates by name; save this plot's look, give it one; batch plotting of the ticked sheets. */
  templates: readonly string[];
  /** The app's data palette (Settings › General › Data colours). */
  dataPalette: string;
  saveTemplate(plotId: string): void;
  applyTemplate(plotId: string, name: string): void;
  batchPlot(plotId: string, sheetIds: string[]): void;
  /** Sheets unticked for batch plotting, this session. */
  batchOff: Set<string>;
  /** Add a fit of a kind to a series and make it the series' current fit. */
  addFit(plotId: string, seriesId: string, kind: FitKind): void;
  /** Draw the inspector again (a fit chosen in a list, which is not an edit). */
  refresh(): void;
  copy(text: string, what: string): void;
}

/** A number typed in a field, or null for empty or "auto"; NaN when it cannot be read. */
/** A date typed for a date axis' end: 2026-03-01, or with a time, 2026-03-01 14:30, in UTC as the cells are read; NaN otherwise. */
export function parseAxisDate(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed || /^auto$/i.test(trimmed)) return null;
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(trimmed);
  return match ? Date.UTC(+match[1], +match[2] - 1, +match[3], +(match[4] ?? 0), +(match[5] ?? 0), +(match[6] ?? 0)) : NaN;
}

export function parseAxisValue(text: string): number | null {
  const trimmed = text.trim().replace(/^−/, "-");
  if (!trimmed || /^auto$/i.test(trimmed)) return null;
  return /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(trimmed) ? Number(trimmed) : NaN;
}

const AXIS_KEYS = { x: "xAxis", y: "yAxis", y2: "y2Axis", x2: "x2Axis" } as const;

/**
 * The selected plot's Properties (forge-shell 9.0.0, Properties follow the selection): only the chosen part's rows, under
 * its path (Plot › Series 2). The plot itself lists its parts (title, legend, axes, series) as one line each, so the
 * inspector stays one screen tall however many series there are; a line or the part on the plot chooses it.
 */
export function renderPlotSections(host: PlotSectionsHost, plot: ProjectPlot, others: readonly ProjectPlot[], sources: PlotSources): void {
  // The axes as drawn: with the headroom the scene left for the legend.
  const headroom = plotScene(plot, sources, plotMeasure(new OffscreenCanvas(1, 1).getContext("2d")!)).headroom;
  const { problems, x, y, y2, x2, columns, drawn } = resolvePlot(plot, sources, headroom);
  const label = (series: PlotSeries) => seriesName(series, rangeName(sources.names, series.y), seriesReference(series, sources));
  const axisLabels: Record<PlotAxisKey, string> = { x: x2 ? "Bottom X axis" : "X axis", x2: "Top X axis", y: y2 ? "Left Y axis" : "Y axis", y2: "Right Y axis" };
  const scales = { x, y, x2, y2 }, axisColumns = { x: columns.x, y: columns.y, x2: columns.x2, y2: columns.y2 };
  let part = host.part;
  // A part no longer there (an axis removed, a fit deleted) leaves the plot chosen.
  if (part.kind === "axis" && !scales[part.axis]) part = { kind: "plot" };
  const given = part;
  const seriesId = "series" in given ? given.series : given.kind === "fit" ? given.of : null;
  const partSeries = seriesId ? plot.series.find((item) => item.id === seriesId) : undefined;
  const partFit = given.kind === "fit" ? partSeries?.fits.find((fit) => fit.id === given.fit) : undefined;
  if ((("series" in part) || part.kind === "fit") && !partSeries) part = { kind: "plot" };
  if (part.kind === "fit" && !partFit) part = partSeries ? { kind: "series", series: partSeries.id } : { kind: "plot" };
  const chosen = part;
  const seriesIndex = partSeries ? plot.series.indexOf(partSeries) : -1;
  const path: PartStep[] = [{ label: plot.name, select: () => host.choose({ kind: "plot" }) }];
  if (chosen.kind === "axis") path.push({ label: axisLabels[chosen.axis] });
  else if (chosen.kind === "title" || chosen.kind === "legend") path.push({ label: chosen.kind === "title" ? "Title" : "Legend" });
  else if (partSeries) {
    path.push({ label: `Series ${seriesIndex + 1}`, select: () => host.choose({ kind: "series", series: partSeries.id }) });
    if (chosen.kind === "fit" && partFit) path.push({ label: `Fit ${partSeries.fits.indexOf(partFit) + 1}` });
    else if (chosen.kind === "point" || chosen.kind === "points") path.push({ label: partName(chosen, plot.series).replace(/ of series \d+$/, "") });
  }
  // The last step is the part itself, never a link.
  delete path[path.length - 1].select;
  const section = host.properties(path);
  const line = (target: PlotPart, name: string, options: { detail?: string; swatch?: string; shown?: boolean; onShow?: (on: boolean) => void } = {}) => createPartLine({
    name, ...options, select: () => host.choose(target), hover: (on) => host.mark(on ? target : null), menu: () => host.menu(target),
  });
  if (chosen.kind === "plot") {
    const name = host.nameRow(plot.name, {
      current: () => plot.name,
      validate: (next) => (others.some((other) => other !== plot && other.name.toLowerCase() === next.trim().toLowerCase()) ? `The name ${next.trim()} is already used.` : null),
      apply: (next) => host.edit(plot.id, (target) => { target.name = next.trim(); }),
    });
    const axisLine = (key: PlotAxisKey) => { const scale = scales[key]!; return line({ kind: "axis", axis: key }, axisLabels[key], { detail: scale.categories ? "Categories" : plot[AXIS_KEYS[key]].log ? "Log" : scale.format === "date" ? "Date" : "Linear" }); };
    const parts = [
      line({ kind: "title" }, "Title", { detail: plot.title || "None" }),
      line({ kind: "legend" }, "Legend", { detail: LEGEND_PLACES[plot.legendPlace], shown: plot.legend, onShow: (on) => host.edit(plot.id, (target) => { target.legend = on; }) }),
      axisLine("x"), ...(x2 ? [axisLine("x2")] : []), axisLine("y"), ...(y2 ? [axisLine("y2")] : []),
      ...plot.series.map((series, index) => {
        const points = drawn.find((item) => item.series === series)?.data.xs.length;
        const problem = problems.find((item) => item.series === series);
        return line({ kind: "series", series: series.id }, `${index + 1}. ${label(series)}`, { detail: problem ? "Not drawn" : points !== undefined ? `${points} point${points === 1 ? "" : "s"}` : "", swatch: seriesColour(plot, series) });
      }),
    ];
    section.append(name, createPartList("Parts of the plot", parts), host.buttons([chooseCellsButton(host, plot)]));
    renderBatch(host, host.group(section, "Template and batch", `${plot.id}/batch`), plot);
    renderPlacement(host, host.group(section, "Placement", `${plot.id}/placement`), plot);
    return;
  }
  if (chosen.kind === "title") {
    const title = createRow("Title", plot.title || "None", document, {
      current: () => plot.title, label: "Plot title", validate: () => null,
      apply: (next) => host.edit(plot.id, (target) => { target.title = next.trim(); }),
      onError: (message) => host.report(message, "error"),
    });
    setTip(title, "The title above the plot, in 11 pt; empty shows none.");
    section.append(title);
    return;
  }
  if (chosen.kind === "legend") {
    const legend = createCheckRow("Show legend", plot.legend, (on) => host.edit(plot.id, (target) => { target.legend = on; }));
    setTip(legend, "Name each series in a corner of the plot area.");
    const place = selectField<LegendPlace>("Place", (Object.keys(LEGEND_PLACES) as LegendPlace[]).map((key) => [key, LEGEND_PLACES[key]] as const), plot.legendPlace, (next) => host.edit(plot.id, (target) => { target.legendPlace = next; }), !plot.legend);
    setTip(place, "Auto takes the top corner that covers less of the data; or a corner of the plot area.");
    const back = selectField<LegendBack>("Background", (Object.keys(LEGEND_BACKS) as LegendBack[]).map((key) => [key, LEGEND_BACKS[key]] as const), plot.legendBack, (next) => host.edit(plot.id, (target) => { target.legendBack = next; }), !plot.legend);
    setTip(back, "White backs the legend with the paper, so it reads over the data; None lets the data show through.");
    section.append(legend, place, back);
    return;
  }
  if (chosen.kind === "axis") {
    renderAxis(host, plot, AXIS_KEYS[chosen.axis], axisLabels[chosen.axis], section, scales[chosen.axis]!, axisColumns[chosen.axis], label);
    return;
  }
  if (!partSeries) return;
  const fitHost = {
    group: (parent: HTMLElement, title: string, key: string) => host.group(parent, title, key), editPlot: (change: (plot: ProjectPlot) => void) => host.edit(plot.id, change), editSeries: () => undefined,
    addFit: (seriesId: string, kind: FitKind) => host.addFit(plot.id, seriesId, kind), refresh: () => host.refresh(), report: (text: string, kind: "info" | "error") => host.report(text, kind), copy: (text: string, what: string) => host.copy(text, what),
    seriesColour: "", name: "", dataPalette: host.dataPalette, usedColours: [],
  };
  if (chosen.kind === "fit" && partFit) {
    renderFit(fitHost, section, plot, partSeries, partFit, drawn, () => host.choose({ kind: "series", series: partSeries.id }));
    return;
  }
  renderOneSeries(host, section, plot, partSeries, seriesIndex, sources, problems, drawn);
  // A series' fits fold inside it, closed until opened (GUIDELINES-CORE: a part's less used rows), one line each.
  renderSeriesFits(fitHost, host.group(section, "Fitting", `${plot.id}/${partSeries.id}/fitting`), plot, partSeries, drawn, (fit) => ({
    select: () => host.choose({ kind: "fit", of: partSeries.id, fit: fit.id }), hover: (on: boolean) => host.mark(on ? { kind: "fit", of: partSeries.id, fit: fit.id } : null),
    menu: () => host.menu({ kind: "fit", of: partSeries.id, fit: fit.id }),
  }));
}

/**
 * The secondary axis actions, first in an axis section: on the X or Y axis, Add top X axis or Add right Y axis puts a
 * series on a new one (a menu asks which while there are several); on the top or right one, Remove puts its series
 * back on the main axis, keeping the secondary axis' settings for when one is added again.
 */
function secondaryActions(host: PlotSectionsHost, plot: ProjectPlot, key: "xAxis" | "yAxis" | "y2Axis" | "x2Axis", seriesLabel: (series: PlotSeries) => string): HTMLElement[] {
  const horizontal = key === "xAxis" || key === "x2Axis";
  const on = (series: PlotSeries) => (horizontal ? series.xAxis === "x2" : series.axis === "y2");
  const move = (ids: readonly string[], secondary: boolean) => host.edit(plot.id, (target) => {
    for (const series of target.series) if (ids.includes(series.id)) { if (horizontal) series.xAxis = secondary ? "x2" : "x"; else series.axis = secondary ? "y2" : "y"; }
  });
  const name = horizontal ? "top X axis" : "right Y axis";
  if (key === "x2Axis" || key === "y2Axis") {
    const swap = host.button("Swap", false, true, () => host.edit(plot.id, (target) => swapAxes(target, horizontal ? "x" : "y")),
      horizontal ? "Swap the bottom and top X axes: each series goes to the other one, and the axes trade their titles and ranges." : "Swap the left and right Y axes: each series goes to the other side, and the axes trade their titles and ranges.");
    const remove = host.button("Remove", false, true, () => move(plot.series.map((series) => series.id), false), `Put every series on the ${name} back on the ${horizontal ? "bottom X" : "left Y"} axis.`);
    return [host.buttons([swap, remove])];
  }
  if (plot.series.some(on)) return [];
  const candidates = plot.series;
  const add = host.button(`Add ${name}`, false, candidates.length > 0, () => {
    if (candidates.length === 1) { move([candidates[0].id], true); return; }
    const rect = add.getBoundingClientRect();
    showContextMenu(rect.left, rect.bottom + 2, candidates.map((series, index) => ({ label: `${index + 1}. ${seriesLabel(series)}`, action: () => move([series.id], true) })), rect.top);
  }, candidates.length ? `Draw a series against a ${name} with its own range and title, as Excel's secondary axis.` : "Add a series first.");
  return [host.buttons([add])];
}

function renderAxis(host: PlotSectionsHost, plot: ProjectPlot, key: "xAxis" | "yAxis" | "y2Axis" | "x2Axis", label: string, into: HTMLElement, scale: AxisScale, column: { name: string; unit: string } | null, seriesLabel: (series: PlotSeries) => string): void {
  // `column` is the named range the axis is titled from (ranges.ts).
  const axis = plot[key], shown = axisTitle(axis, column);
  const target = (change: (axis: PlotAxis) => void) => host.edit(plot.id, (next) => change(next[key]));
  const title = createRow("Title", shown || "None", document, {
    current: () => shown, label: `${label} title`, validate: () => null,
    apply: (next) => target((item) => { const text = next.trim(); item.title = !text || (column && text === axisTitle({ ...item, title: null }, column)) ? null : text; }),
    onError: (message) => host.report(message, "error"),
  });
  setTip(title, column ? `Empty takes the range's name and unit: ${axisTitle({ ...axis, title: null }, column)}.` : "The axis title; empty takes the name and unit of the first series' range, once it is named.");
  // On a date axis the ends are dates (2026-03-01) and the step is in days, as Excel's date axis.
  const dated = scale.format === "date";
  const isoOf = (value: number) => new Date(value).toISOString().slice(0, 16).replace("T", " ").replace(/ 00:00$/, "");
  const shownValue = (field: "min" | "max" | "step", value: number) => (dated && field !== "step" ? isoOf(value) : String(value));
  const parse = (field: "min" | "max" | "step", text: string) => (dated && field !== "step" ? parseAxisDate(text) : parseAxisValue(text));
  const number = (field: "min" | "max" | "step", text: string, auto: number) => {
    const automatic = field === "step" && axis.log ? "decade" : field === "step" && dated ? `${Number((auto / 86400000).toPrecision(6))} d` : scaleLabel(scale, auto);
    const row = createRow(text, axis[field] === null ? `Auto (${automatic})` : shownValue(field, axis[field]!), document, {
      current: () => (axis[field] === null ? "" : shownValue(field, axis[field]!)), label: `${label} ${text.toLowerCase()}`,
      validate: (next) => { const value = parse(field, next); return Number.isNaN(value) || (field === "step" && value !== null && value <= 0) ? `Invalid ${text.toLowerCase()}. Enter ${dated && field !== "step" ? "a date such as 2026-03-01" : `a number${field === "step" ? (dated ? " of days above 0" : " above 0") : ""}`}, or leave it empty for auto.` : null; },
      apply: (next) => target((item) => { item[field] = parse(field, next); }),
      onError: (message) => host.report(message, "error"),
    });
    setTip(row, field === "step" ? "The distance between major ticks; empty picks a round step." : `The axis' ${field === "min" ? "start" : "end"}; empty rounds the data's ${field === "min" ? "least" : "greatest"} value out to a major tick.`);
    return row;
  };
  const minor = minorField(axis, scale, label, target, host);
  // The tick labels' turn, for long numbers, dates or categories.
  const angle = selectField<`${LabelAngle}`>("Label angle", LABEL_ANGLES.map((item) => [`${item}`, `${item}°`] as const), `${axis.angle ?? 0}`, (next) => target((item) => {
    const turn = Number(next) as LabelAngle;
    if (turn) item.angle = turn; else delete item.angle;
  }));
  setTip(angle, "Turns the tick labels counter-clockwise, so that long numbers, dates or categories fit side by side; the axis makes room for them.");
  // A category axis (text X) is placed by its categories: it has a title, and nothing to set of its range.
  if (scale.categories) {
    const count = createRow("Categories", String(scale.categories.length));
    setTip(count, `The X cells hold text, so each is a category at its own place: ${scale.categories.slice(0, 6).join(", ")}${scale.categories.length > 6 ? "…" : ""}.`);
    into.append(title, count, angle, ...secondaryActions(host, plot, key, seriesLabel));
    return;
  }
  const log = selectField<"linear" | "log">("Scale", [["linear", "Linear"], ["log", "Log"]], axis.log ? "log" : "linear", (next) => target((item) => { item.log = next === "log"; }));
  setTip(log, "Log spaces powers of ten equally, with 2 to 9 times each between them; values at or below 0 are left out.");
  const format = selectField<AxisFormat>("Format", AXIS_FORMATS.map((item) => [item, AXIS_FORMAT_NAMES[item]] as const), axis.format ?? "auto", (next) => target((item) => {
    // The ends and step mean other things in another format, so they turn automatic.
    if ((next === "date") !== (scale.format === "date")) { item.min = null; item.max = null; item.step = null; }
    item.format = next === "auto" ? undefined : next;
  }));
  setTip(format, "How tick labels read: Automatic shows dates for date cells, else numbers; Percentage shows 0.25 as 25%.");
  // How the numbers are written (forge-shell number-format); automatic takes the step's decimals. Dates have their own.
  const numbers = dated ? [] : [createNumberFormatField({
    value: axis.numbers ?? DEFAULT_NUMBER_FORMAT, sample: scale.max * (scale.format === "percent" ? 100 : 1), label: `${label} numbers`,
    onChange: (next) => target((item) => { const kept = axisNumbers(next); if (kept) item.numbers = kept; else delete item.numbers; }),
  }).element];
  if (numbers[0]) setTip(numbers[0], "How the tick labels' numbers are written: Automatic notation and decimals take as many decimals as the step has; Fixed, Scientific, Engineering or SI prefix (4.7 k, 12 µ) with set decimals write every label alike.");
  into.append(title, format, ...numbers, angle, log, number("min", "Min", scale.min), number("max", "Max", scale.max), ...(axis.log ? [] : [number("step", "Step", scale.step)]), minor, ...secondaryActions(host, plot, key, seriesLabel));
}

/**
 * Minor ticks, as Excel's minor unit: a step that divides the major step evenly; empty is automatic (a round fifth,
 * quarter, half or third of it), None shows none. On a log axis: 2 to 9 times each power of ten, or none.
 */
function minorField(axis: PlotAxis, scale: AxisScale, label: string, target: (change: (axis: PlotAxis) => void) => void, host: PlotSectionsHost): HTMLElement {
  if (axis.log) {
    const field = selectField<"auto" | "none">("Minor ticks", [["auto", "2 to 9 × each power"], ["none", "None"]], axis.minorStep === 0 ? "none" : "auto", (next) => target((item) => { item.minorStep = next === "none" ? 0 : null; }));
    setTip(field, "Minor ticks at 2 to 9 times each power of ten, drawn inside the plot area.");
    return field;
  }
  const auto = scale.step / minorParts(scale.step, null);
  const fits = axis.minorStep === null || axis.minorStep === 0 || minorStepFits(scale.step, axis.minorStep);
  const shown = axis.minorStep === null ? (minorParts(scale.step, null) > 1 ? `Auto (${tickLabel(auto, auto)})` : "Auto (none)") : axis.minorStep === 0 ? "None" : fits ? String(axis.minorStep) : `${axis.minorStep}, uneven: Auto`;
  const row = createRow("Minor step", shown, document, {
    current: () => (axis.minorStep === null ? "" : axis.minorStep === 0 ? "none" : String(axis.minorStep)), label: `${label} minor step`,
    validate: (next) => {
      if (/^\s*none\s*$/i.test(next)) return null;
      const value = parseAxisValue(next);
      if (value === null) return null;
      if (Number.isNaN(value) || value <= 0) return "Invalid minor step. Enter a number above 0, none, or leave it empty for auto.";
      return minorStepFits(scale.step, value) ? null : `A minor step of ${value} does not divide the major step ${scaleLabel(scale, scale.step)} evenly. Enter a part of it, such as ${tickLabel(auto, auto)}.`;
    },
    apply: (next) => target((item) => { item.minorStep = /^\s*none\s*$/i.test(next) ? 0 : parseAxisValue(next); }),
    onError: (message) => host.report(message, "error"),
  });
  setTip(row, fits
    ? "The distance between minor ticks, drawn inside the plot area; it divides the major step evenly. Empty takes a round fifth, quarter or half of it; none shows none."
    : `${axis.minorStep} does not divide the major step ${scaleLabel(scale, scale.step)} evenly, so the automatic minor step is drawn.`);
  return row;
}

/**
 * The Series section, as Origin's Plot Setup: each series' Y and X cells (a named range, the cells chosen in a
 * worksheet, or for X the row number), the rows it takes, its axis, kind, how its points are joined and its look.
 * Choose cells adds the cells chosen in a worksheet as series, or waits for them; Remove takes a series out.
 */
/**
 * Choose cells: one action for new series, always the same accented full-width button: cells already chosen in a
 * worksheet are added at once; otherwise it waits for the next cells chosen in any worksheet (an empty plot from the
 * toolbar starts waiting), and a second click or Esc stops waiting.
 */
function chooseCellsButton(host: PlotSectionsHost, plot: ProjectPlot): HTMLButtonElement {
  const chosen = host.chosenCells();
  const waiting = host.picking?.seriesId === null;
  const choose = host.button(waiting ? "Choosing cells…" : "Choose cells", true, true,
    () => (waiting ? host.pick(plot.id, null, null) : chosen ? host.addChosen(plot.id) : host.pick(plot.id, null, "y")),
    waiting ? "Choose cells in any worksheet to add them as series; one range plots against the row number. Esc stops."
      : chosen ? `Add ${chosen.text} as series: one range is a Y against the first series' X; with more, the first is X.`
      : "Then choose cells in any worksheet to add them as series: one range plots against the row number; with more, the first is X.");
  choose.classList.toggle("picking", waiting);
  return choose;
}

/** A series' own rows: its name, cells, rows, axes, kind and look, then Remove. */
function renderOneSeries(host: PlotSectionsHost, body: HTMLElement, plot: ProjectPlot, series: PlotSeries, index: number, sources: PlotSources, problems: readonly { series: PlotSeries; reason: string }[], drawn: readonly DrawnSeries[]): void {
  const problem = problems.find((item) => item.series === series);
  const label = seriesName(series, rangeName(sources.names, series.y), seriesReference(series, sources));
  const status = problem ? createRow("Status", "Not drawn") : null;
  if (status && problem) setTip(status, problem.reason);
  const edit = (change: (target: PlotSeries) => void) => host.edit(plot.id, (target) => { const found = target.series.find((item) => item.id === series.id); if (found) change(found); });
  // The series' own name, shown in the legend; empty gives it back its cells' name.
  const ownName = createRow("Name", label, document, {
    current: () => series.name ?? "", label: `Series ${index + 1} name`, validate: () => null,
    apply: (next) => edit((target) => { target.name = next.trim() || null; }),
    onError: (message) => host.report(message, "error"),
  });
  setTip(ownName, series.name !== null ? "The series' name in the legend; empty gives it back its cells' name." : "The series' name in the legend, now its cells' name; type another to rename it.");
  // Each range has its own rows (typed in its field, or chosen in a worksheet while it has the focus); All rows sets them together, and says Mixed while they differ.
  const ranges = [series.y, series.x, series.error, series.labels].filter((item): item is CellRange => item !== null);
  const same = ranges.every((item) => rowsText(item.rows) === rowsText(series.y.rows));
  const rows = createRow("All rows", same ? rowsText(series.y.rows) : "Mixed", document, {
    current: () => (same && series.y.rows ? rowsText(series.y.rows) : ""), label: `Series ${index + 1} rows`,
    validate: (next) => { try { parseRowsInput(next); return null; } catch (error) { return (error as Error).message; } },
    apply: (next) => edit((target) => setSeriesRows(target, parseRowsInput(next))),
    onError: (message) => host.report(message, "error"),
  });
  setTip(rows, same ? "The worksheet rows of the series' X, Y, error and labels, counted from 1, such as 2–40; empty or all takes every row. Type a range's own rows in its field (B2:B20) to set them apart." : "The series' ranges have rows of their own (see each field). Type rows here, such as 2–40, to give them all the same.");
  // Points paired, and when the ranges differ in length, how many each gave: the longer are cut to the shortest.
  const counts = drawn.find((item) => item.series === series)?.data.counts;
  const pointsRow = counts ? pointsField(counts) : null;
  // The data colour menu (forge-shell data-colour): Automatic, the palette chosen in Settings by place, the colours this
  // plot already uses, and Custom…, which opens the colour picker.
  const colour = createField("Colour", createDataColourControl({
    label: "Colour", palette: host.dataPalette, index, count: plot.series.length, colour: series.colour, used: plotColours(plot),
    onChange: (next) => edit((target) => { target.colour = next; }),
  }).element);
  const connect = selectField<LineConnect>("Connect", LINE_CONNECTS.map((item) => [item, CONNECT_NAMES[item]] as const), series.connect, (next) => edit((target) => { target.connect = next; }));
  setTip(connect, "How the line joins the points: straight; Spline, a smooth curve through every point; B-spline and Bezier, smooth curves the points steer; Step, across then up or down.");
  // A curve the points only steer is said so, so that it is not read as the data in a report.
  const steered = series.kind !== "scatter" && (series.connect === "bspline" || series.connect === "bezier");
  const curve = createRow("Curve", "Near the points");
  setTip(curve, "This curve is pulled toward the points but does not pass through them; use Spline for a smooth line through every point.");
  const remove = host.buttons([host.button("Remove", false, true, () => host.edit(plot.id, (target) => { target.series = target.series.filter((item) => item.id !== series.id); }),
    `Take ${label} out of ${plot.name}; its cells are unchanged. A plot may be left empty.`)]);
  const pickOf = (which: "x" | "y" | "error" | "labels") => ({ waiting: host.picking?.seriesId === series.id && host.picking.which === which, pick: (on: boolean) => host.pick(plot.id, series.id, on ? which : null) });
  // A series' axes are chosen only while the plot has a top or right one; Add top X axis or Add right Y axis makes it.
  const top = plot.series.some((item) => item.xAxis === "x2"), right = plot.series.some((item) => item.axis === "y2");
  body.append(...(status ? [status] : []), ownName,
    referenceField(host, "X", series.x, "Row number", sources, series.y.data, pickOf("x"), (next) => edit((target) => { target.x = next; })),
    referenceField(host, "Y", series.y, null, sources, series.y.data, pickOf("y"), (next) => edit((target) => { if (next) target.y = next; })),
    referenceField(host, "Error", series.error, "None", sources, series.y.data, pickOf("error"), (next) => edit((target) => { target.error = next; })),
    referenceField(host, "Labels", series.labels, "None", sources, series.y.data, pickOf("labels"), (next) => edit((target) => { target.labels = next; })),
    rows,
    ...(pointsRow ? [pointsRow] : []),
    ...(top ? [xAxisField(series, (next) => edit((target) => { target.xAxis = next; }))] : []),
    ...(right ? [axisField(series, (next) => edit((target) => { target.axis = next; }))] : []),
    selectField<PlotKind>("Kind", PLOT_KINDS.map((kind) => [kind, PLOT_KIND_NAMES[kind]] as const), series.kind, (next) => edit((target) => { target.kind = next; })),
    colour,
    ...(series.kind === "line" || series.kind === "column" ? [] : [selectField<SymbolShape>("Symbol", SYMBOL_SHAPES.map((shape) => [shape, SYMBOL_NAMES[shape]] as const), series.symbol, (next) => edit((target) => { target.symbol = next; }))]),
    ...(series.kind === "scatter" || series.kind === "column" ? [] : [selectField<LineDash>("Line", LINE_DASHES.map((dash) => [dash, DASH_NAMES[dash]] as const), series.dash, (next) => edit((target) => { target.dash = next; })), connect]),
    ...(steered ? [curve] : []),
    remove);
}

/** Points paired, and when the ranges differ in length, how many each gave: the longer are cut to the shortest. */
function pointsField(counts: SeriesData["counts"]): HTMLElement {
  const given = [counts.x, counts.y, counts.error, counts.labels].filter((value): value is number => value !== null);
  const same = given.every((value) => value === given[0]);
  const parts = [counts.x !== null ? `X ${counts.x}` : null, `Y ${counts.y}`, counts.error !== null ? `error ${counts.error}` : null, counts.labels !== null ? `labels ${counts.labels}` : null].filter(Boolean);
  const row = createRow("Points", same ? String(given[0]) : `${Math.min(counts.x ?? Infinity, counts.y, counts.error ?? Infinity)} (${parts.join(", ")})`);
  setTip(row, same ? "The points the series draws." : "The ranges differ in length; the series pairs them in order and stops at the shortest of X, Y and error. Labels beyond the points are not shown.");
  return row;
}

/** Cells as the interface calls them: their name, or "Sheet!B2:B40". */
function cellsLabel(cells: CellRange, sources: PlotSources): string {
  return rangeLabel(sources.names, cells, sources.sheet(cells.data), sources.table(cells.data));
}

/**
 * A series' X, Y, error or labels cells in a text field, as Excel's reference boxes: type a name of the document, or
 * cells of one column, B2:B40 in the series' own sheet or Sheet!B2:B40 in any; empty is the row number (X), no error
 * bars or no labels. While the field has the focus, cells chosen in any worksheet fill it instead.
 */
function referenceField(host: PlotSectionsHost, label: "X" | "Y" | "Error" | "Labels", current: CellRange | null, empty: string | null, sources: PlotSources, sheet: string, picker: { waiting: boolean; pick: (on: boolean) => void }, apply: (cells: CellRange | null) => void): HTMLElement {
  const shown = current ? cellsLabel(current, sources) : "";
  const row = document.createElement("label");
  row.className = "field reference-field";
  const caption = document.createElement("span");
  caption.className = "label";
  caption.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.value = shown;
  input.placeholder = empty ?? "";
  input.setAttribute("aria-label", `Series ${label}`);
  if (picker.waiting) input.classList.add("picking");
  row.append(caption, input);
  const names = sources.names.map((name) => name.name).join(", ");
  const none = label === "Labels" ? "no labels" : label === "Error" ? "no error bars" : "the row number";
  setTip(row, `Click here, then choose the cells in any worksheet; or type a name${names ? ` (${names})` : ""}, or cells such as B2:B40 or Sheet!B2:B40, each with its own rows${empty ? `; empty is ${none}` : ""}.`);
  // A press on the work surface while the field has the focus is the cells being chosen: the field keeps waiting for
  // them through its blur, until the press ends (cells chosen fill it then). Any other press ends the wait.
  let surface = false;
  const down = (event: PointerEvent) => {
    surface = event.target instanceof HTMLCanvasElement;
    if (surface) window.addEventListener("pointerup", () => setTimeout(() => picker.pick(false)), { once: true });
  };
  const commit = () => {
    const text = input.value.trim();
    if (text === shown) return;
    if (!text && !empty) { input.value = shown; host.report("A series needs its Y cells.", "error"); return; }
    const read = text ? parseReference(text, host.sheets, sources.names, sheet) : null;
    if (typeof read === "string") { input.value = shown; input.classList.add("invalid"); host.report(read, "error"); return; }
    apply(read);
  };
  input.addEventListener("focus", () => {
    surface = false;
    document.addEventListener("pointerdown", down, true);
    input.select();
    input.classList.add("picking");
    picker.pick(true);
  });
  input.addEventListener("blur", () => {
    document.removeEventListener("pointerdown", down, true);
    input.classList.remove("picking");
    if (surface) return;
    picker.pick(false);
    commit();
  });
  input.addEventListener("input", () => input.classList.remove("invalid"));
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); input.blur(); }
    else if (event.key === "Escape") { event.preventDefault(); input.value = shown; input.blur(); }
  });
  return row;
}

/**
 * Template and batch: Save as template (this plot's look, under its name, for any document) and Apply a saved one, as
 * Excel's chart templates; then the other worksheets, ticked, and Plot alike, as Origin's batch plotting: the same
 * plot of each, its cells at the same columns and rows. "{sheet}" in the title becomes each sheet's name.
 */
function renderBatch(host: PlotSectionsHost, section: HTMLElement, plot: ProjectPlot): void {
  section.append(host.buttons([host.button("Save as template", false, true, () => host.saveTemplate(plot.id),
    `Save ${plot.name}'s size, axes, legend, export and series styles as the template ${plot.name}, for plots in any document. Rename the plot to name the template.`)]));
  if (host.templates.length) {
    const apply = selectField("Apply", [["", "Choose a template…"], ...host.templates.map((name) => [name, name] as const)], "", (name) => { if (name) host.applyTemplate(plot.id, name); });
    setTip(apply, "Give this plot a saved template's look, keeping its cells, place and name.");
    section.append(apply);
  }
  const own = plotSheet(plot);
  const others = host.sheets.filter((sheet) => sheet.id !== own);
  if (!others.length) return;
  for (const sheet of others) {
    const row = createCheckRow(sheet.name, !host.batchOff.has(sheet.id), (on) => { if (on) host.batchOff.delete(sheet.id); else host.batchOff.add(sheet.id); });
    setTip(row, `Plot ${sheet.name} alike: the same columns and rows of it.`);
    section.append(row);
  }
  const ticked = () => others.filter((sheet) => !host.batchOff.has(sheet.id)).map((sheet) => sheet.id);
  section.append(host.buttons([host.button("Plot alike", false, true, () => host.batchPlot(plot.id, ticked()),
    `Make ${plot.name} of each ticked worksheet, its cells at the same columns and rows, placed below it. Write {sheet} in the title to name each plot's sheet.`)]));
}

/** A series' X axis: Bottom or Top. */
function xAxisField(series: PlotSeries, apply: (axis: SeriesXAxis) => void): HTMLElement {
  const field = selectField<SeriesXAxis>("X axis", SERIES_X_AXES.map((axis) => [axis, SERIES_X_AXIS_NAMES[axis]] as const), series.xAxis, apply);
  setTip(field, "The X axis the series is drawn against: the bottom one, or a top one with its own range, as Excel's secondary horizontal axis.");
  return field;
}

/** A series' Y axis: Left or Right. */
function axisField(series: PlotSeries, apply: (axis: SeriesAxis) => void): HTMLElement {
  const field = selectField<SeriesAxis>("Y axis", SERIES_AXES.map((axis) => [axis, SERIES_AXIS_NAMES[axis]] as const), series.axis, apply);
  setTip(field, "The Y axis the series is drawn against: the left one, or a right one with its own range, as Excel's secondary axis.");
  return field;
}

function renderPlacement(host: PlotSectionsHost, into: HTMLElement, plot: ProjectPlot): void {
  placementRows(into, {
    noun: "the plot", box: plot, min: { width: PLOT_SIZE.minWidth, height: PLOT_SIZE.minHeight },
    tips: { width: "The plot's width in pixels, 96 to the inch; drag its bottom-right corner to resize it.", height: "The plot's height in pixels, 96 to the inch; drag its bottom-right corner to resize it." },
    apply: (key, value) => host.edit(plot.id, (target) => { target[key] = value; }), report: (message) => host.report(message, "error"),
  });
}
