// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Fitting (2026-11-19), in the inspector under each series, as an image's steps are: a list of the series' fits, each
// drawn or not, with Add fit and Remove, and the current fit's Model (its kind, order or window, a custom formula,
// weights, x range and starting values), Line (colour, width and dash), Label (its equation as mathematics or plain
// text, R², corner and backing) and Results (each parameter with its standard error and 95% interval, R², adjusted R²,
// SSE, RMSE and the points, with Copy and the residual plot). A fit belongs to its series and is computed from the
// series' cells on every change, so what is shown is always the fit as it is now. It replaces the Fits pane of
// 2026-11-18, which stood beside Results.
import { createButton, createButtonGroup, createCheckRow, createEmptyNote, createField, createRow } from "forge-shell/app/builders";
import { createPartLine, createPartList } from "forge-shell/app/properties";
import { createDataColourControl } from "forge-shell/app/data-colour";
import { showContextMenu, type MenuEntry } from "forge-shell/app/context-menu";
import { setTip } from "forge-shell/app/tips";
import type { ConsoleListItem } from "forge-shell/app/terminal";
import {
  DASH_NAMES, FIT_FORMATS, FIT_GROUPS, FIT_LABEL_BACKS, FIT_LABEL_PLACES, FIT_NAMES, FIT_WEIGHT_NAMES, FIT_WEIGHTS, FIT_WINDOWS, LINE_DASHES,
  DEFAULT_EXPRESSION, fitNumber, fitParameterNames, hasOrder, isSmoothing, refit, resolvePlot,
  seriesColour, type DrawnSeries, type FitFormat, type FitKind, type FitLabelBack, type FitLabelPlace, type FitResult, type FitWeights, type LineDash, type PlotSeries, type PlotSources, type ProjectPlot, type SeriesFit,
} from "../engine";
import { selectField } from "./settings-view";

// MARK: wording

/** One fit of the document: its plot, its series (and the series' number on the plot), the fit, its number among the series' fits, and the fit as computed now. */
export interface FitEntry { plot: ProjectPlot; series: PlotSeries; number: number; fit: SeriesFit; fitNumber: number; result: FitResult | string }

/** Every fit of the plots, in plot, series and list order: regressions only, as a smoothing has no parameters or statistics. */
export function documentFits(plots: readonly ProjectPlot[], sources: PlotSources): FitEntry[] {
  const out: FitEntry[] = [];
  for (const plot of plots) {
    if (!plot.series.some((series) => series.fits.some((fit) => !isSmoothing(fit.kind)))) continue;
    const resolved = resolvePlot(plot, sources);
    plot.series.forEach((series, index) => {
      const drawn = resolved.drawn.find((item) => item.series === series);
      const problem = resolved.problems.find((item) => item.series === series)?.reason ?? "The series cannot be drawn.";
      series.fits.forEach((fit, at) => {
        if (isSmoothing(fit.kind)) return;
        out.push({ plot, series, number: index + 1, fit, fitNumber: at + 1, result: drawn?.fits.find((item) => item.fit === fit)?.result ?? problem });
      });
    });
  }
  return out;
}

/** A fit's name: its plot and series, and its number when the series has more than one. */
export const fitName = (entry: FitEntry): string => `${entry.plot.name}, series ${entry.number}${entry.series.fits.length > 1 ? `, fit ${entry.fitNumber}` : ""}`;
/** A fit's model, with its order, peaks or window. */
export function modelName(fit: SeriesFit): string {
  if (fit.kind === "polynomial") return `Polynomial, order ${fit.order}`;
  if (fit.kind === "gaussians") return `${fit.order} Gaussian peaks`;
  if (isSmoothing(fit.kind)) return `${FIT_NAMES[fit.kind]}, ${fit.window} points`;
  return FIT_NAMES[fit.kind];
}
/** Whether a fit stands: Fitted, Did not converge, or why it cannot be made. */
export function fitStatus(result: FitResult | string): string {
  if (typeof result === "string") return result;
  return result.converged === false ? "Did not converge" : "Fitted";
}
const number = (value: number | null | undefined) => (value === null || value === undefined || !Number.isFinite(value) ? "—" : fitNumber(value));
const r2Text = (value: number | null | undefined) => (value === null || value === undefined ? "—" : value.toFixed(4));
const rangeText = (fit: SeriesFit) => (fit.from == null && fit.to == null ? "All points" : `${fit.from == null ? "the first x" : fitNumber(fit.from)} to ${fit.to == null ? "the last x" : fitNumber(fit.to)}`);

/** A fit's parameters and statistics as the Terminal lists them (`fit info`). */
export function fitInfoLines(entry: FitEntry): (string | ConsoleListItem)[] {
  const row = (label: string, comment: string): ConsoleListItem => ({ label, comment, labelWidth: 18, subdued: true });
  const lines: (string | ConsoleListItem)[] = [row("Model", modelName(entry.fit))];
  if (typeof entry.result === "string") return [...lines, row("Fit", entry.result)];
  const { parameters = [], statistics } = entry.result;
  if (entry.result.equation) lines.push(row("Equation", entry.result.equation));
  for (const parameter of parameters) {
    lines.push(row(parameter.name, parameter.fixed ? `${number(parameter.value)} (fixed)`
      : `${number(parameter.value)} ± ${number(parameter.se)}, 95% from ${number(parameter.low)} to ${number(parameter.high)}`));
  }
  if (statistics) {
    lines.push(row("R²", r2Text(statistics.r2)), row("Adjusted R²", r2Text(statistics.adjR2)), row("SSE", number(statistics.sse)), row("RMSE", number(statistics.rmse)),
      row("Points", `${statistics.n}, ${statistics.dof} degrees of freedom`));
  }
  lines.push(row("Weights", FIT_WEIGHT_NAMES[entry.fit.weights ?? "none"]), row("X range", rangeText(entry.fit)));
  if (entry.result.note) lines.push(row("Note", entry.result.note));
  return lines;
}

/** A fit's table as tab-separated text, for Copy: its parameters, then its statistics. */
export function fitTableText(name: string, fit: SeriesFit, result: FitResult | string): string {
  const lines = [`${name}\t${modelName(fit)}`];
  if (typeof result === "string") return [...lines, result].join("\n");
  if (result.equation) lines.push(result.equation);
  if (result.parameters?.length) {
    lines.push(["Parameter", "Value", "Standard error", "95% low", "95% high"].join("\t"));
    for (const p of result.parameters) lines.push([p.name, p.value, p.se ?? "", p.low ?? "", p.high ?? ""].join("\t"));
  }
  const s = result.statistics;
  if (s) lines.push(`R²\t${s.r2}`, `Adjusted R²\t${s.adjR2}`, `SSE\t${s.sse}`, `RMSE\t${s.rmse}`, `Points\t${s.n}`, `Degrees of freedom\t${s.dof}`);
  return lines.join("\n");
}

/** The Add fit menu: a submenu per group of models (Smoothing, Basic, … Custom), as Add step's. */
export function addFitMenu(add: (kind: FitKind) => void): MenuEntry[] {
  return FIT_GROUPS.map(([group, kinds]) => ({ label: group, items: kinds.map((kind) => ({ label: FIT_NAMES[kind], action: () => add(kind) })) }));
}

// MARK: the current fit

// The fit each series shows in full, by series id, for the session: the one last chosen, added, or else the first.
const current = new Map<string, string>();
export function chooseFit(seriesId: string, fitId: string): void { current.set(seriesId, fitId); }
export function currentFit(series: PlotSeries): SeriesFit | null {
  return series.fits.find((fit) => fit.id === current.get(series.id)) ?? series.fits[0] ?? null;
}

// MARK: the inspector

export interface FittingHost {
  /** A group that folds under its heading inside `parent`; returns its body. */
  group(parent: HTMLElement, title: string, key: string): HTMLElement;
  /** Change the plot as one undoable edit. */
  editPlot(change: (plot: ProjectPlot) => void): void;
  /** Change the shown series as one undoable edit (set by renderFitting). */
  editSeries(change: (series: PlotSeries) => void): void;
  /** Add a fit of a kind to a series and make it current. */
  addFit(seriesId: string, kind: FitKind): void;
  /** Redraw the inspector (after choosing another fit, which is not an edit). */
  refresh(): void;
  report(text: string, kind: "info" | "error"): void;
  copy(text: string, what: string): void;
  /** The colour the shown series is drawn in now, and its plot and number, for names (set by renderFitting). */
  seriesColour: string;
  name: string;
  /** The data palette chosen in Settings, and the colours the plot already uses (set by renderFitting). */
  dataPalette: string;
  usedColours: readonly string[];
}

/** Whole-point line widths a fit offers, besides following its series. */
const FIT_WIDTHS: readonly number[] = [0.5, 0.75, 1, 1.5, 2, 2.5, 3];
const SERIES = "series";

/** What a fit's line in its series' list does: choose the fit, mark it on the plot, open its menu. */
export interface FitLine { select(): void; hover(on: boolean): void; menu(): MenuEntry[] }

/** The host for one series' fits: its name, colour and edits filled in from the plot. */
function seriesHost(given: FittingHost, plot: ProjectPlot, series: PlotSeries): FittingHost {
  return {
    ...given, name: `${plot.name}, series ${plot.series.indexOf(series) + 1}`, seriesColour: seriesColour(plot, series), usedColours: plotColours(plot),
    editSeries: (change) => given.editPlot((target) => { const found = target.series.find((item) => item.id === series.id); if (found) change(found); }),
  };
}

/**
 * A series' Fitting group (forge-shell 9.0.0: a closed group inside its series): Add fit, then its fits as part lines,
 * each with the eye that draws it or not; a line, or the fit's curve on the plot, chooses the fit, whose Properties
 * hold its model, line, label and results.
 */
export function renderSeriesFits(given: FittingHost, body: HTMLElement, plot: ProjectPlot, series: PlotSeries, drawn: readonly DrawnSeries[], lineOf: (fit: SeriesFit) => FitLine): void {
  const host = seriesHost(given, plot, series);
  const fits = drawn.find((item) => item.series === series)?.fits ?? null;
  const add = createButton({ label: "Add fit", onClick: () => {
    const rect = add.getBoundingClientRect();
    showContextMenu(rect.left, rect.bottom + 2, addFitMenu((kind) => host.addFit(series.id, kind)), rect.top);
  } });
  setTip(add, "Fit a model to the series' points, or smooth them; a series may have several fits.");
  body.append(createButtonGroup([add]));
  if (!series.fits.length) { body.append(createEmptyNote("No fits")); return; }
  body.append(createPartList("Fits", series.fits.map((fit, index) => {
    const result = fits?.find((item) => item.fit === fit)?.result ?? null;
    const actions = lineOf(fit);
    return createPartLine({
      name: `${index + 1}. ${modelName(fit)}`, swatch: fit.colour ?? host.seriesColour,
      detail: result === null ? "" : typeof result === "string" ? "Not drawn" : result.r2 !== null ? `R² ${result.r2.toFixed(4)}` : "",
      shown: fit.enabled, onShow: (on) => host.editSeries((target) => { const found = target.fits.find((item) => item.id === fit.id); if (found) found.enabled = on; }),
      select: actions.select, hover: actions.hover, menu: actions.menu,
    });
  })));
}

/** A fit's Properties: Remove, then its Model, Line, Label and Results groups. `removed` chooses its series after Remove. */
export function renderFit(given: FittingHost, body: HTMLElement, plot: ProjectPlot, series: PlotSeries, chosen: SeriesFit, drawn: readonly DrawnSeries[], removed: () => void): void {
  const host = seriesHost(given, plot, series);
  const key = `${plot.id}/fitting`;
  chooseFit(series.id, chosen.id);
  const remove = createButton({ label: "Remove", onClick: () => { host.editSeries((target) => { target.fits = target.fits.filter((fit) => fit.id !== chosen.id); }); removed(); } });
  setTip(remove, "Remove this fit; the data are unchanged.");
  const shown = createCheckRow("Draw fit", chosen.enabled, (on) => host.editSeries((target) => { const found = target.fits.find((item) => item.id === chosen.id); if (found) found.enabled = on; }));
  setTip(shown, "Draw this fit on the plot; clear it to hide the fit and its label.");
  body.append(createButtonGroup([remove]), shown);
  const result = drawn.find((item) => item.series === series)?.fits.find((item) => item.fit === chosen)?.result ?? "The series cannot be drawn.";
  const set = (patch: Partial<SeriesFit>) => edit((fit) => ({ ...fit, ...patch }));
  const edit = (change: (fit: SeriesFit) => SeriesFit) => host.editSeries((target) => { target.fits = target.fits.map((fit) => (fit.id === chosen.id ? change(fit) : fit)); });
  modelGroup(host, host.group(body, "Model", `${key}/model`), chosen, result, set, edit);
  lineGroup(host, host.group(body, "Line", `${key}/line`), chosen, set);
  if (!isSmoothing(chosen.kind)) labelGroup(host.group(body, "Label", `${key}/label`), chosen, set);
  resultsGroup(host, host.group(body, "Results", `${key}/results`), chosen, result, set);
}

/** An editable row: its value shown, typed into on a click; `apply` gets the text, `check` refuses it with a reason. */
function textRow(host: FittingHost, label: string, shown: string, current: string, check: (text: string) => string | null, apply: (text: string) => void): HTMLElement {
  return createRow(label, shown, document, { current: () => current, label, validate: (text) => check(text.trim()), apply: (text) => apply(text.trim()), onError: (message) => host.report(message, "error") });
}

function modelGroup(host: FittingHost, body: HTMLElement, fit: SeriesFit, result: FitResult | string, set: (patch: Partial<SeriesFit>) => void, edit: (change: (fit: SeriesFit) => SeriesFit) => void): void {
  const kinds = FIT_GROUPS.flatMap(([, items]) => items).map((kind) => [kind, FIT_NAMES[kind]] as const);
  const model = selectField<FitKind>("Model", kinds, fit.kind, (kind) => edit((current) => refit(current, kind)));
  setTip(model, "A smoothing follows the data; the other models are fitted to the points by least squares.");
  body.append(model);
  if (isSmoothing(fit.kind)) {
    const window = selectField("Window", FIT_WINDOWS.map((value) => [String(value), `${value} points`] as const), String(fit.window), (next) => set({ window: Number(next) }));
    setTip(window, "How many points each smoothed point is taken from, centred on it; more smooths more.");
    body.append(window);
  }
  if (hasOrder(fit.kind)) {
    const orders = fit.kind === "savitzky-golay" ? [1, 2, 3, 4] : [2, 3, 4, 5, 6];
    const order = selectField(fit.kind === "gaussians" ? "Peaks" : "Order", orders.map((value) => [String(value), String(value)] as const), String(fit.order), (next) => set({ order: Number(next), start: undefined, fixed: undefined }));
    setTip(order, fit.kind === "polynomial" ? "The polynomial's highest power: 2 is a parabola." : fit.kind === "gaussians" ? "How many Gaussian peaks are fitted together, on one baseline." : "The power of the polynomial fitted in each window; 2 or 3 keeps peaks better than a moving average.");
    body.append(order);
  }
  if (fit.kind === "custom") {
    const text = fit.expression ?? DEFAULT_EXPRESSION;
    const formula = textRow(host, "Formula", `y = ${text}`, text, (next) => (next ? null : "Write a formula in x, such as a * exp(-b * x) + c."),
      (next) => set({ expression: next, start: undefined, fixed: undefined }));
    setTip(formula, "A formula in x, this series' own: + − * / ^, brackets, pi, e and exp, ln, log, sqrt, abs, sin, cos, tan, asin, acos, atan, sinh, cosh, tanh. Every other name is a parameter to fit.");
    body.append(formula);
  }
  if (isSmoothing(fit.kind)) return;
  const weights = selectField<FitWeights>("Weights", FIT_WEIGHTS.map((value) => [value, FIT_WEIGHT_NAMES[value]] as const), fit.weights ?? "none", (next) => set({ weights: next === "none" ? undefined : next }));
  setTip(weights, "How much each point counts: all alike, by 1/y as counts are (Poisson), or by 1/y² for an error that grows with y.");
  body.append(weights);
  const end = (label: "From x" | "To x", value: number | null | undefined, which: "from" | "to") => {
    const row = textRow(host, label, value == null ? (which === "from" ? "First point" : "Last point") : fitNumber(value), value == null ? "" : String(value),
      (text) => (!text || Number.isFinite(Number(text.replace("−", "-"))) ? null : `${label} takes a number, or nothing for the ${which === "from" ? "first" : "last"} point.`),
      (text) => set({ [which]: text ? Number(text.replace("−", "-")) : undefined }));
    setTip(row, "Fit only the points with x in this range; empty takes the data's end.");
    return row;
  };
  body.append(end("From x", fit.from, "from"), end("To x", fit.to, "to"));
  // Each parameter's starting value (empty: the model's own guess from the data) and whether it is held there.
  const names = fitParameterNames(fit);
  const fitted = typeof result === "string" ? [] : result.parameters ?? [];
  const keep = (values: Record<string, number>) => { const kept = Object.fromEntries(Object.entries(values).filter(([name]) => names.includes(name))); return Object.keys(kept).length ? kept : undefined; };
  for (const name of names) {
    const given = fit.fixed?.[name] ?? fit.start?.[name];
    const start = textRow(host, `Start ${name}`, given === undefined ? "Auto" : fitNumber(given), given === undefined ? "" : String(given),
      (text) => (!text || /^auto$/i.test(text) || Number.isFinite(Number(text.replace("−", "-"))) ? null : `The start of ${name} is a number, or empty for the model's guess.`),
      (text) => edit((current) => {
        const value = !text || /^auto$/i.test(text) ? null : Number(text.replace("−", "-"));
        const starts = { ...(current.start ?? {}) }, fixed = { ...(current.fixed ?? {}) };
        if (value === null) delete starts[name]; else starts[name] = value;
        if (name in fixed) { if (value === null) delete fixed[name]; else fixed[name] = value; }
        return { ...current, start: keep(starts), fixed: keep(fixed) };
      }));
    setTip(start, `Where the fit starts ${name} from; Auto takes the model's guess from the data. Type a value near the answer when a fit does not converge.`);
    const held = createCheckRow(`Hold ${name}`, typeof fit.fixed?.[name] === "number", (on) => edit((current) => {
      const fixed = { ...(current.fixed ?? {}) };
      if (on) fixed[name] = current.start?.[name] ?? fitted.find((item) => item.name === name)?.value ?? 1; else delete fixed[name];
      return { ...current, fixed: keep(fixed) };
    }));
    setTip(held, `Keep ${name} at its start value instead of fitting it.`);
    body.append(start, held);
  }
}

/**
 * A fit line's colour: the data colour menu (forge-shell data-colour) with Series colour as its Automatic, since a fit
 * follows its series, then the palette chosen in Settings by place, the colours the plot already uses, and Custom….
 */
function fitColourControl(host: FittingHost, current: string | null, onChange: (colour: string | null) => void): HTMLElement {
  return createDataColourControl({
    label: "Colour", palette: host.dataPalette, index: 0, count: 1, colour: current, used: host.usedColours,
    automatic: { label: "Series colour", colour: host.seriesColour },
    onChange: (next) => { if (next !== current) onChange(next); },
  }).element;
}

/** The colours a plot's series and fits are given (not Automatic), offered again by the colour menus. */
export function plotColours(plot: ProjectPlot): string[] {
  return plot.series.flatMap((series) => [series.colour, ...series.fits.map((fit) => fit.colour)]).filter((colour): colour is string => !!colour);
}

function lineGroup(host: FittingHost, body: HTMLElement, fit: SeriesFit, set: (patch: Partial<SeriesFit>) => void): void {
  const colour = createField("Colour", fitColourControl(host, fit.colour, (next) => set({ colour: next })));
  setTip(colour, `The fit line's colour; Series colour follows its series (now ${host.seriesColour}).`);
  const width = selectField("Width", [[SERIES, "Series width"] as const, ...FIT_WIDTHS.map((w) => [String(w), `${w} pt`] as const)], fit.lineWidth === null ? SERIES : String(fit.lineWidth), (next) => set({ lineWidth: next === SERIES ? null : Number(next) }));
  setTip(width, "The fit line's width in points; Series width follows its series.");
  const dash = selectField<LineDash>("Dash", LINE_DASHES.map((item) => [item, DASH_NAMES[item]] as const), fit.dash, (next) => set({ dash: next }));
  setTip(dash, "Solid, or dashed so that the fit reads apart from the data's own line.");
  const legend = createCheckRow("Show in legend", fit.legend, (on) => set({ legend: on }));
  setTip(legend, "Give the fit a row of its own in the legend, under its series, drawn as its line.");
  body.append(colour, width, dash, legend);
}

function labelGroup(body: HTMLElement, fit: SeriesFit, set: (patch: Partial<SeriesFit>) => void): void {
  const shown = createCheckRow("Show on plot", fit.equation, (on) => set({ equation: on }));
  setTip(shown, "Write the fit's equation on the plot, in the fit line's colour.");
  const format = selectField<FitFormat>("Format", (Object.keys(FIT_FORMATS) as FitFormat[]).map((item) => [item, FIT_FORMATS[item]] as const), fit.format, (next) => set({ format: next }), !fit.equation);
  setTip(format, "Mathematics typesets the equation as LaTeX does (y = 0.5x²); Plain text writes it as a spreadsheet or program takes it (y = 0.5*x^2).");
  const stats = createCheckRow("Show R²", fit.stats, (on) => set({ stats: on }));
  setTip(stats, "Write R² after the equation.");
  const place = selectField<FitLabelPlace>("Place", (Object.keys(FIT_LABEL_PLACES) as FitLabelPlace[]).map((item) => [item, FIT_LABEL_PLACES[item]] as const), fit.place, (next) => set({ place: next }), !fit.equation);
  setTip(place, "A corner of the plot area; Auto takes the top corner the legend leaves free. Labels in one corner stand one under another.");
  const back = selectField<FitLabelBack>("Back", (Object.keys(FIT_LABEL_BACKS) as FitLabelBack[]).map((item) => [item, FIT_LABEL_BACKS[item]] as const), fit.back, (next) => set({ back: next }), !fit.equation);
  setTip(back, "White backs the label with the paper, so it reads over the data; Transparent lets the data show through.");
  if (!fit.equation) (stats.querySelector("input") as HTMLInputElement).disabled = true;
  body.append(shown, format, stats, place, back);
}

function resultsGroup(host: FittingHost, body: HTMLElement, fit: SeriesFit, result: FitResult | string, set: (patch: Partial<SeriesFit>) => void): void {
  const copy = createButton({ label: "Copy", disabled: typeof result === "string" || isSmoothing(fit.kind), onClick: () => host.copy(fitTableText(host.name, fit, result), "the fit's parameters and statistics") });
  setTip(copy, "Copy the parameters and statistics as text, to paste into a spreadsheet.");
  body.append(createButtonGroup([copy]));
  if (typeof result === "string") { const why = createRow("Status", "Not drawn"); setTip(why, result); body.append(why); return; }
  if (result.note) { const note = createRow("Note", result.note); setTip(note, result.note); body.append(note); }
  if (isSmoothing(fit.kind)) { body.append(createRow("Points", String(result.count))); return; }
  if (result.equation) { const equation = createRow("Equation", result.equation); setTip(equation, result.equation); body.append(equation); }
  for (const p of result.parameters ?? []) {
    const row = createRow(p.name, p.fixed ? `${number(p.value)} (held)` : `${number(p.value)} ± ${number(p.se)}`);
    setTip(row, p.fixed ? `${p.name} is held at ${number(p.value)}.` : `${p.name} = ${number(p.value)}, standard error ${number(p.se)}; 95% interval ${number(p.low)} to ${number(p.high)}.`);
    body.append(row);
  }
  const s = result.statistics;
  if (s) {
    for (const [label, value, tip] of [
      ["R²", r2Text(s.r2), "The share of the data's variance the fit explains: 1 − SSE over the total sum of squares."],
      ["Adjusted R²", r2Text(s.adjR2), "R² allowing for the number of parameters fitted."],
      ["SSE", number(s.sse), "The sum of the squared residuals (weighted, with weights)."],
      ["RMSE", number(s.rmse), "The residuals' root mean square, over the degrees of freedom."],
      ["Points", `${s.n}, ${s.dof} free`, "The points fitted, and the degrees of freedom: points less the parameters fitted."],
    ] as const) { const row = createRow(label, value); setTip(row, tip); body.append(row); }
  }
  const residuals = createCheckRow("Plot residuals", fit.residuals, (on) => set({ residuals: on }));
  setTip(residuals, "Draw each point's residual, y less the fit, in a small plot under this one, against the same x.");
  body.append(residuals);
}
