// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A plot's parts as they can be pointed at on the work surface (2026-11-17): the plot, its plot area, title, legend,
// axes, axis titles, series and points. The scene (plotScene) records where each part was drawn as a target; a click
// finds the part under it, and repeated clicks go a level deeper as in a spreadsheet's charts: the plot, then a part,
// then a point of the series chosen. Esc goes back up. A chosen part opens its section in the inspector; the inspector
// and the Terminal stay where a part is changed.
import type { MeasureText } from "./plot";

export type PlotAxisKey = "x" | "y" | "y2" | "x2";

export type PlotPart =
  | { kind: "plot" } | { kind: "area" } | { kind: "title" } | { kind: "legend" }
  | { kind: "axis"; axis: PlotAxisKey } | { kind: "axis-title"; axis: PlotAxisKey }
  | { kind: "series"; series: string } | { kind: "point"; series: string; index: number }
  /** A fit of a series (`of`), drawn over it; named `of`, not `series`, as it is not one of the series' own marks. */
  | { kind: "fit"; of: string; fit: string }
  /** Several points of one series, chosen with Cmd/Ctrl or Shift, or all of them; in the order they were chosen. */
  | { kind: "points"; series: string; indices: number[] };

export interface PartBox { x: number; y: number; width: number; height: number }

/** A series' point where it was drawn: its row in the series' data, the run of joined points it is in, and its column. */
export interface PartPoint { x: number; y: number; index: number; run: number; bar?: PartBox }

/** Where a part was drawn, in content pixels from the plot's top-left corner. */
export type PlotTarget =
  | { part: Exclude<PlotPart, { kind: "series" } | { kind: "point" } | { kind: "points" } | { kind: "fit" }>; box: PartBox }
  | { part: { kind: "series"; series: string }; points: PartPoint[]; line: boolean; radius: number }
  /** A fit's curve, in its runs (a value off a log axis breaks it). */
  | { part: { kind: "fit"; of: string; fit: string }; runs: { x: number; y: number }[][] };

/** The order parts are found in where they overlap: what is drawn over the others first. */
// A fit's curve comes after its series, so a point or the series' own line is found before the curve over it.
const PRIORITY: Record<PlotPart["kind"], number> = { legend: 0, title: 1, "axis-title": 2, series: 3, point: 3, points: 3, fit: 3.5, axis: 4, area: 5, plot: 6 };

export function sortTargets(targets: PlotTarget[]): PlotTarget[] {
  return targets.sort((a, b) => PRIORITY[a.part.kind] - PRIORITY[b.part.kind]);
}

/** The box a text's ink covers, as plotScene places it: at (x, y) turned by `rotate`, its baseline `dy` along it. */
export function textBox(text: string, x: number, y: number, dy: number, size: number, anchor: "start" | "middle" | "end", rotate: number, measure: MeasureText, pt: number): PartBox {
  const ink = measure(text, size / pt);
  const left = anchor === "start" ? 0 : anchor === "end" ? -ink.width : -ink.width / 2;
  const corners: [number, number][] = [[left, dy - ink.ascent], [left + ink.width, dy - ink.ascent], [left, dy + ink.descent], [left + ink.width, dy + ink.descent]];
  const turn = (rotate * Math.PI) / 180, cos = Math.cos(turn), sin = Math.sin(turn);
  const xs = corners.map(([cx, cy]) => x + cx * cos - cy * sin), ys = corners.map(([cx, cy]) => y + cx * sin + cy * cos);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
}

/** The smallest box around some boxes; null for none. */
export function unionBox(boxes: readonly (PartBox | null)[]): PartBox | null {
  const some = boxes.filter((box): box is PartBox => !!box);
  if (!some.length) return null;
  const x = Math.min(...some.map((box) => box.x)), y = Math.min(...some.map((box) => box.y));
  return { x, y, width: Math.max(...some.map((box) => box.x + box.width)) - x, height: Math.max(...some.map((box) => box.y + box.height)) - y };
}

const inBox = (box: PartBox, x: number, y: number, reach = 0) => x >= box.x - reach && x <= box.x + box.width + reach && y >= box.y - reach && y <= box.y + box.height + reach;

function segmentDistance(x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0;
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

/**
 * The part under a point (content pixels from the plot's top-left), the deepest there is: on a series' marker or
 * column, that point; on its line, the series; else the first box around it in drawing order, else the plot itself
 * while the point is on it. `reach` is how far from a line or marker still counts (a few view pixels at the zoom).
 */
export function partAt(targets: readonly PlotTarget[], size: { width: number; height: number }, x: number, y: number, reach: number): PlotPart | null {
  for (const target of targets) {
    const found = "points" in target ? seriesPartAt(target, x, y, reach)
      : "runs" in target ? (target.runs.some((run) => run.some((b, i) => i > 0 && segmentDistance(x, y, run[i - 1], b) <= reach)) ? target.part : null)
      : inBox(target.box, x, y, target.part.kind === "area" ? 0 : reach / 2) ? target.part : null;
    if (found) return found;
  }
  return x >= 0 && y >= 0 && x <= size.width && y <= size.height ? { kind: "plot" } : null;
}

type SeriesTarget = Extract<PlotTarget, { points: PartPoint[] }>;

/** On a series: its nearest point within reach of its marker (or inside its column), else the series on its line. */
function seriesPartAt(target: SeriesTarget, x: number, y: number, reach: number): PlotPart | null {
  let index = -1, best = Infinity;
  for (const point of target.points) {
    const distance = point.bar && inBox(point.bar, x, y) ? 0 : Math.hypot(x - point.x, y - point.y);
    if (distance <= target.radius + reach && distance < best) { index = point.index; best = distance; }
  }
  if (index >= 0) return { kind: "point", series: target.part.series, index };
  const onLine = target.line && runs(target.points).some((run) => run.some((b, i) => i > 0 && segmentDistance(x, y, run[i - 1], b) <= reach));
  return onLine ? target.part : null;
}

/** A series' points in their runs, as its line joins them; runs of one point have no line. */
function runs(points: readonly PartPoint[]): PartPoint[][] {
  const all: PartPoint[][] = [];
  for (const point of points) {
    const last = all.at(-1);
    if (last && last[0].run === point.run) last.push(point);
    else all.push([point]);
  }
  return all.filter((run) => run.length > 1);
}

export const samePart = (a: PlotPart | null, b: PlotPart | null): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * The part a click chooses, given the part chosen before (null: the plot was not selected) and the part under it: a
 * point at once, as the pointer resting on it lights it (owner, 2026-11-19); once the plot is selected, the part under
 * the pointer (Properties follow the selection, forge-shell 9.0.0): a series or a fit on its line, an axis (its title
 * too), the legend or the title; the plot area is the plot's.
 */
export function nextPart(current: PlotPart | null, hit: PlotPart): PlotPart {
  if (hit.kind === "point") return hit;
  if (!current) return { kind: "plot" };
  if (hit.kind === "axis-title") return { kind: "axis", axis: hit.axis };
  return hit.kind === "series" || hit.kind === "fit" || hit.kind === "axis" || hit.kind === "legend" || hit.kind === "title" ? hit : { kind: "plot" };
}

/** The points of a series a part chooses: a point's, or several; none for anything else. */
export function chosenPoints(part: PlotPart | null): number[] {
  return part?.kind === "point" ? [part.index] : part?.kind === "points" ? part.indices : [];
}

/** Points of a series as a part: none is the series, one a point, more `points`. */
export function pointsPart(series: string, indices: readonly number[]): PlotPart {
  const unique = [...new Set(indices)];
  return !unique.length ? { kind: "series", series } : unique.length === 1 ? { kind: "point", series, index: unique[0] } : { kind: "points", series, indices: unique };
}

/**
 * A click with a modifier on a point of the chosen series (or of a chosen point's), as a file list's: Cmd (Ctrl
 * elsewhere) adds the point or takes it out; Shift adds the run from the point chosen last to it, of the points
 * drawn (`drawn`, in order). Elsewhere a modified click chooses as a plain one does.
 */
export function choosePoints(current: PlotPart | null, hit: PlotPart, mode: "add" | "toggle", drawn: readonly number[]): PlotPart {
  if (hit.kind !== "point" || !current || !("series" in current) || current.series !== hit.series) return current ? nextPart(current, hit) : { kind: "plot" };
  const now = chosenPoints(current);
  if (mode === "toggle") return pointsPart(hit.series, now.includes(hit.index) ? now.filter((index) => index !== hit.index) : [...now, hit.index]);
  const anchor = now.at(-1) ?? hit.index, low = Math.min(anchor, hit.index), high = Math.max(anchor, hit.index);
  const run = drawn.filter((index) => index >= low && index <= high);
  return pointsPart(hit.series, [...now, ...(anchor <= hit.index ? run : run.reverse())]);
}

/** The part a level up (Esc): a point's or a fit's series, any other part's plot; null above the plot. */
export function parentPart(part: PlotPart): PlotPart | null {
  if (part.kind === "point" || part.kind === "points") return { kind: "series", series: part.series };
  if (part.kind === "fit") return { kind: "series", series: part.of };
  return part.kind === "plot" ? null : { kind: "plot" };
}

/** The inspector section a part is changed in. */
export function partSection(part: PlotPart): "subject" | "xaxis" | "yaxis" | "y2axis" | "x2axis" | "series" {
  if (part.kind === "axis" || part.kind === "axis-title") return `${part.axis}axis`;
  return part.kind === "series" || part.kind === "point" || part.kind === "points" || part.kind === "fit" ? "series" : "subject";
}

const AXIS_NAMES: Record<PlotAxisKey, string> = { x: "X axis", y: "Y axis", y2: "Right Y axis", x2: "Top X axis" };

/** A plot's series as parts are named after them: by number, and their points by the worksheet row of their Y. */
export type PartSeries = readonly { id: string; y: { rows: { first: number } | null } }[];

/** The worksheet row (from 1) of a series' point. */
export function pointRow(series: PartSeries, id: string, index: number): number {
  return (series.find((item) => item.id === id)?.y.rows?.first ?? 0) + index + 1;
}

/** A part in words, its series by number and a point by its row: "Title", "Series 2", "Point at row 5 of series 2". */
export function partName(part: PlotPart, series: PartSeries): string {
  const number = (id: string) => series.findIndex((item) => item.id === id) + 1;
  switch (part.kind) {
    case "plot": return "Plot";
    case "area": return "Plot area";
    case "title": return "Title";
    case "legend": return "Legend";
    case "axis": return AXIS_NAMES[part.axis];
    case "axis-title": return `${AXIS_NAMES[part.axis]} title`;
    case "series": return `Series ${number(part.series)}`;
    case "point": return `Point at row ${pointRow(series, part.series, part.index)} of series ${number(part.series)}`;
    case "points": return `${part.indices.length} points of series ${number(part.series)}`;
    case "fit": return `Fit of series ${number(part.of)}`;
  }
}

/** The words the Terminal takes for a part: plot part title, plot part x axis, plot part series 2, plot part point 2 5. */
export const PART_WORDS = "plot, series N, point N ROW";

/** A part typed in the Terminal (PART_WORDS), against the plot's series; a point by its worksheet row. Throws with what was wrong. */
export function parsePart(text: string, all: PartSeries): PlotPart {
  const seriesIds = all.map((item) => item.id);
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const [first, second, third] = words;
  const series = (word: string | undefined) => {
    const n = Number(word);
    if (!Number.isInteger(n) || n < 1 || n > seriesIds.length) throw new Error(seriesIds.length ? `Give a series from 1 to ${seriesIds.length}.` : "The plot has no series.");
    return seriesIds[n - 1];
  };
  if (words.length === 1 && first === "plot") return { kind: "plot" };
  if (first === "series" && words.length === 2) return { kind: "series", series: series(second) };
  if (first === "point" && words.length === 3) {
    const id = series(second), row = Number(third), index = row - pointRow(all, id, 0);
    if (!Number.isInteger(row) || index < 0) throw new Error(`Give the point's worksheet row, from ${pointRow(all, id, 0)}.`);
    return { kind: "point", series: id, index };
  }
  throw new Error(`Name a part: ${PART_WORDS}.`);
}

/** What to outline for a part: boxes, rings about points and lines through them, in content pixels from the plot's corner. */
export interface PartOutline { boxes: PartBox[]; rings: { x: number; y: number; r: number }[]; lines: PartPoint[][] }

export function partOutline(targets: readonly PlotTarget[], part: PlotPart, size: { width: number; height: number }): PartOutline {
  const outline: PartOutline = { boxes: [], rings: [], lines: [] };
  if (part.kind === "plot") { outline.boxes.push({ x: 0, y: 0, ...size }); return outline; }
  if (part.kind === "fit") {
    const found = targets.find((item) => "runs" in item && samePart(item.part, part));
    if (found && "runs" in found) outline.lines.push(...found.runs.map((run) => run.map((point, index) => ({ ...point, index, run: 0 }))));
    return outline;
  }
  if (part.kind !== "series" && part.kind !== "point") {
    const found = targets.find((item) => "box" in item && samePart(item.part, part));
    if (found && "box" in found) outline.boxes.push(found.box);
    return outline;
  }
  const target = targets.find((item): item is SeriesTarget => "points" in item && item.part.series === part.series);
  if (!target) return outline;
  const points = part.kind === "point" ? target.points.filter((point) => point.index === part.index) : target.points;
  for (const point of points) {
    if (point.bar) outline.boxes.push(point.bar);
    else outline.rings.push({ x: point.x, y: point.y, r: target.radius });
  }
  if (part.kind === "series" && target.line) outline.lines.push(...runs(target.points));
  return outline;
}
