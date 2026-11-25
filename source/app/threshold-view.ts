// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The parameters of the Threshold step and of the mask steps after it, in the inspector's step section (GUIDELINES-SHELL
// section 4: grouped by subject, actions first, readouts above settings, the detail of a value in its tooltip). The
// Threshold step's thresholds are phases (phases.ts), each named and drawn in its own colour, so that a primary and a
// secondary phase can be measured side by side.
// - Threshold step: Add (a phase) and Remove (and Pick, on a colour image). A grey image shows its histogram with each phase's
//   range as a band in the phase's colour. Then the phases as a list, how many pixels lie in no phase and in more than
//   one, and Show as (each phase in its colour, B&W or Over/Under, as ImageJ's threshold dialog). The current phase
//   follows under its own heading: its masked pixels, name, colour and method; on a grey image the range slider, which
//   shows the range an automatic method found and takes over as Manual when dragged, and Dark background for the
//   automatic methods; on a colour image the shell's colour picker, the tolerance and the ranges that follow.
// - Mask step: its operation, its iterations when it repeats, and the phases it acts on: every phase's mask separately,
//   or one phase's.
import { createButton, createButtonGroup, createCheckRow, createField, createGroupHeading, createRow } from "forge-shell/app/builders";
import { rangeSliderRow } from "forge-shell/app/range-slider";
import { createColourPicker } from "forge-shell/app/colour-picker";
import { hsbToRgb, labToRgb, rgbToHex } from "forge-shell/app/colour-models";
import { renderOutline } from "forge-shell/app/outline-list";
import { setTip } from "forge-shell/app/tips";
import { showContextMenu } from "forge-shell/app/context-menu";
import {
  COMPONENT_NAMES, COLOUR_MODELS, MASK_COLOURS, THRESHOLD_METHODS, MODEL_LIMITS, formatMeasure, histogram, imagePixels, maxValue, phaseNameProblem, rangesAround, MASK_OPERATION_KINDS, MAX_ITERATIONS, MAX_COUNT, REPEATED_OPERATIONS,
  type ColourModel3, type MaskColour, type MaskDisplay, type MaskOperation, type MaskOperationKind, type MaskStep, type ObjectKind, type Phase, type Range, type Raster, type Threshold, type ThresholdMethod,
} from "../engine";
import type { MaskState } from "./plot-document";
import { actionsFirst } from "./section-actions";
import { OPERATION_LABELS, OPERATION_TIPS, THRESHOLD_METHOD_LABELS } from "./step-wording";
import { MASK_COLOUR_LABELS, selectField } from "./settings-view";

// MARK: wording

export type ThresholdChoice = "none" | "manual" | ThresholdMethod | "colour";
export const THRESHOLD_LABELS: Record<ThresholdChoice, string> = { none: "None", manual: "Manual", ...THRESHOLD_METHOD_LABELS, colour: "Colour" };
export const MODEL_LABELS: Record<ColourModel3, string> = { rgb: "RGB", hsb: "HSB", lab: "CIELAB" };
const MODEL_TIPS: Record<ColourModel3, string> = {
  rgb: "Red, green and blue, 0 to 255 each.",
  hsb: "Hue 0 to 360°, saturation and brightness 0 to 100%. A hue range with its low end above its high end wraps through red (0°).",
  lab: "CIELAB with the D65 white: lightness L* 0 to 100, a* green to red and b* blue to yellow, about −128 to 127.",
};
/** The eyedropper's tolerance, ± percent of each component's span, and the side of the square it averages. Session only. */
export const picker = { tolerance: 10, size: 3 };
export const OBJECT_LABELS: Record<ObjectKind, string> = { light: "Light objects", dark: "Dark objects" };
const METHOD_TIPS: Record<ThresholdMethod, string> = {
  otsu: "Otsu: the split with the largest variance between background and objects.",
  mean: "Mean: the split at the mean grey value of the image.",
  li: "Li: the split of minimum cross-entropy, found by iteration.",
  isodata: "IsoData: the split halfway between the means of the two sides, found by iteration.",
  percentile: "Percentile: the split with half of the pixels on each side.",
  triangle: "Triangle: the value farthest below a line from the histogram's peak to the end of its longer tail. Suits one peak and a faint tail.",
  intermodes: "Intermodes: the histogram smoothed until it has two peaks; the split halfway between them.",
  minimum: "Minimum: the histogram smoothed until it has two peaks; the split at the valley between them.",
  moments: "Moments: the split that keeps the image's first three moments in a two-level image.",
  maxentropy: "MaxEntropy: the split with the largest total entropy of the two sides.",
  yen: "Yen: the split with the largest correlation criterion of the two sides.",
  ijisodata: "IJ IsoData: ImageJ's Default method, IsoData without the values 0 and the maximum.",
  huang: "Huang: the split of least fuzzy entropy, each value belonging to its side by its distance from the side's mean.",
  minerror: "MinError: the crossing of two normal curves fitted to the two sides, found by iteration. Suits two peaks of different widths.",
  renyientropy: "RenyiEntropy: the splits of greatest Rényi entropy at three orders, weighted together.",
  shanbhag: "Shanbhag: the split where the fuzzy information of the two sides is most nearly equal.",
};

/** A mask operation in a few words: `Erode`, `Open × 2`, `Fill holes`. */
export const operationText = (operation: MaskOperation): string => `${OPERATION_LABELS[operation.kind]}${operation.iterations > 1 ? ` × ${operation.iterations}` : ""}${(operation.count ?? 1) > 1 ? `, count ${operation.count}` : ""}`;

/** A threshold in a few words: `Otsu, light objects`, `Manual 40 to 200`, `None`, with its mask operations after a semicolon. */
export function thresholdSummary(threshold: Threshold | null): string {
  if (!threshold) return "None";
  const base = threshold.mode === "manual" ? `Manual ${threshold.low} to ${threshold.high}`
    : threshold.mode === "colour" ? `${MODEL_LABELS[threshold.model]} ${threshold.ranges.map((range) => `${range[0]}–${range[1]}`).join(", ")}`
    : `${THRESHOLD_LABELS[threshold.mode]}, ${OBJECT_LABELS[threshold.objects].toLowerCase()}`;
  return threshold.operations?.length ? `${base}; ${threshold.operations.map(operationText).join(", ").toLowerCase()}` : base;
}

/** The threshold a choice starts from: an automatic method keeps the object kind, a manual range starts from the current one. */
export function startThreshold(choice: ThresholdChoice, current: Threshold | null, mask: MaskState | null, M: number): Threshold | null {
  if (choice === "none") return null;
  // The mask operations stay when the range changes how it is set.
  const operations = current?.operations?.length ? { operations: current.operations.map((operation) => ({ ...operation })) } : {};
  if (choice === "manual") return { ...(mask?.result ? { mode: "manual", low: mask.result.low, high: Math.min(M, mask.result.high) } : { mode: "manual", low: Math.round(M / 2), high: M }), ...operations } as Threshold;
  if (choice === "colour") return { mode: "colour", model: current?.mode === "colour" ? current.model : "hsb", ranges: (current?.mode === "colour" ? current.ranges : MODEL_LIMITS.hsb).map((range) => [...range]) as [Range, Range, Range], ...operations };
  return { mode: choice, objects: current && "objects" in current ? current.objects : "light", ...operations };
}

// MARK: the Threshold section

export const DISPLAY_LABELS: Record<MaskDisplay, string> = { colours: "Colours", bw: "B&W", overUnder: "Over/Under" };
const DISPLAY_TIPS: Record<MaskDisplay, string> = {
  colours: "Each phase drawn over the image in its colour.",
  bw: "The current phase black on white, the rest hidden.",
  overUnder: "The current phase's range shows the image; values below it blue, above it green.",
};

export interface ThresholdViewOptions {
  phases: readonly Phase[];
  current: Phase | null;
  /** The result of the steps; null while the image cannot be shown. */
  working: Raster | null;
  /** The current phase's mask, every phase's mask (for the masked pixels and the histogram bands), and the coverage. */
  mask: MaskState | null;
  maskOf(phase: Phase): MaskState | null;
  coverage: { overlap: number; unassigned: number; pixels: number } | null;
  display: MaskDisplay;
  addPhase(): void;
  removePhase(id: string): void;
  selectPhase(id: string): void;
  renamePhase(id: string, name: string): void;
  setColour(id: string, colour: MaskColour): void;
  setDisplay(mode: MaskDisplay): void;
  /** The current phase's threshold: set (one undo step), or drawn live while a slider moves and recorded on release. */
  set(next: Threshold): void;
  beginPreview(): string;
  preview(next: Threshold): void;
  endPreview(before: string): void;
  /** The eyedropper, a colour chosen in the picker ± a tolerance, and the eyedropper's size choice. */
  pickColour(): void;
  pickFrom(rgb: [number, number, number], tolerance: number): void;
  sizeSelect(): HTMLButtonElement;
  report(message: string): void;
}

const percent = (count: number, total: number) => `${total ? (Math.round((count / total) * 1000) / 10).toFixed(1) : "0.0"}%`;

export function renderThreshold(section: HTMLElement, options: ThresholdViewOptions): void {
  const { phases, current, working, coverage } = options;
  const colourImage = !!working && working.channels === 3;
  const add = createButton({ label: "Add", disabled: !working, onClick: () => options.addPhase() });
  setTip(add, "Add a threshold as a new phase, in its own colour, starting from the image's threshold method.");
  const remove = createButton({ label: "Remove", disabled: !current, onClick: () => { if (current) options.removePhase(current.id); } });
  setTip(remove, "Remove the current phase and its mask.");
  const pick = createButton({ label: "Pick", disabled: !working, onClick: () => options.pickColour() });
  setTip(pick, "Click the image to keep the colours near the one under the pointer, in the current phase (or a new one).");
  actionsFirst(section, createButtonGroup(colourImage ? [add, pick, remove] : [add, remove]));

  if (working && !colourImage) section.append(histogramChart(working, phases, current, options.maskOf));
  if (!phases.length) {
    const none = createRow("Phases", "None");
    setTip(none, colourImage ? "Add a phase, or pick a colour on the image." : "Add a phase to keep the pixels in a range of grey values.");
    section.append(none);
    return;
  }
  const list = document.createElement("div");
  list.setAttribute("aria-label", "Phases");
  renderOutline(list, phases.map((phase) => ({ title: phase.name, level: 1, id: phase.id })), current?.id ?? null, (id) => options.selectPhase(id));
  section.append(list);
  if (coverage) {
    const unassigned = createRow("In no phase", percent(coverage.unassigned, coverage.pixels));
    setTip(unassigned, `${coverage.unassigned} of ${coverage.pixels} px lie in no phase.`);
    section.append(unassigned);
    if (coverage.overlap) {
      const overlap = createRow("In two or more", percent(coverage.overlap, coverage.pixels));
      setTip(overlap, `${coverage.overlap} px lie in more than one phase and are counted in each, so the phases' fractions add up to more than 100%.`);
      section.append(overlap);
    }
  }
  const displayRow = selectField<MaskDisplay>("Show as", (["colours", "bw", "overUnder"] as const).map((mode) => [mode, DISPLAY_LABELS[mode]]), options.display, options.setDisplay);
  setTip(displayRow, `${DISPLAY_TIPS[options.display]} Display only.`);
  section.append(displayRow);
  if (current) renderPhase(section, current, options);
}

/** The current phase under its own heading: readouts, then name, colour, method, and its range or colour. */
function renderPhase(section: HTMLElement, phase: Phase, options: ThresholdViewOptions): void {
  const { working, mask } = options;
  const threshold = phase.threshold;
  section.append(createGroupHeading(phase.name));
  const total = working ? imagePixels(working) : 0;
  if (mask?.result) {
    const masked = createRow("Masked", `${percent(mask.result.count, total)}`);
    setTip(masked, `${mask.result.count} of ${total} px; region measurements come with the results table.`);
    section.append(masked);
    if (mask.result.t !== null) {
      const split = createRow("Split", String(mask.result.t));
      setTip(split, "The grey value the method found; the range keeps one side of it.");
      section.append(split);
    }
  } else if (mask?.problem) {
    const row = createRow("Masked", "None");
    setTip(row, mask.problem);
    section.append(row);
  }
  const name = createRow("Name", phase.name, document, {
    current: () => phase.name, label: "Phase name",
    validate: (text) => phaseNameProblem(text, options.phases.filter((other) => other.id !== phase.id)),
    apply: (text) => options.renamePhase(phase.id, text.trim()), onError: options.report,
  });
  setTip(name, "The phase's name, as results rows show it. Click to change it.");
  // B&W and Over/Under draw the image in fixed colours, so a phase's colour shows only with Show as Colours.
  const shown = options.display === "colours";
  const colourRow = selectField("Colour", Object.entries(MASK_COLOUR_LABELS) as [MaskColour, string][], phase.colour, (colour) => options.setColour(phase.id, colour), !shown);
  setTip(colourRow, shown ? "The colour this phase is drawn in; display only." : `Not used while Show as is ${DISPLAY_LABELS[options.display]}; set Show as to Colours to draw each phase in its colour.`);
  section.append(name, colourRow);
  if (threshold.mode === "colour") { renderColourPhase(section, threshold, options); return; }
  if (!working || working.channels !== 1) return;

  const M = maxValue(working.bitDepth);
  const methods = (["manual", ...THRESHOLD_METHODS] as const).map((value): [ThresholdChoice, string] => [value, THRESHOLD_LABELS[value]]);
  const methodRow = selectField("Method", methods, threshold.mode as ThresholdChoice, (choice) => options.set(startThreshold(choice, threshold, mask, M)!));
  setTip(methodRow, threshold.mode === "manual" ? "Manual: the range set by the slider. Or let a method find the split." : METHOD_TIPS[threshold.mode]);
  section.append(methodRow);
  // The range in effect: the manual one, or the one the method found. Dragging it makes the range manual.
  const range: [number, number] = threshold.mode === "manual" ? [threshold.low, threshold.high] : mask?.result ? [mask.result.low, mask.result.high] : [0, M];
  let before = "";
  const operations = threshold.operations?.length ? { operations: threshold.operations } : {};
  const { row } = rangeSliderRow("Range", range, 0, M, ([low, high]) => options.preview({ mode: "manual", low: Math.round(low), high: Math.round(high), ...operations }), {
    step: 1, format: (v) => String(Math.round(v)),
    undo: { begin: () => { before = options.beginPreview(); }, end: () => options.endPreview(before) }, reset: () => [0, M],
  });
  setTip(row, "The grey values kept, both ends included. Drag an end, or focus it and use the arrow keys or the wheel; the method becomes Manual.");
  section.append(row);
  if (threshold.mode !== "manual") {
    const dark = createCheckRow("Dark background", threshold.objects === "light", (on) => options.set({ ...threshold, objects: on ? "light" : "dark" }));
    setTip(dark, "On: the objects are lighter than the background, so the values above the split are kept. Off: the split and the values below it.");
    section.append(dark);
  }
}

/** A colour phase: model, the shell's colour picker (no target), the tolerance and pick size, then the ranges as readouts. */
function renderColourPhase(section: HTMLElement, colour: Extract<Threshold, { mode: "colour" }>, options: ThresholdViewOptions): void {
  const modelRow = selectField("Model", COLOUR_MODELS.map((value): [ColourModel3, string] => [value, MODEL_LABELS[value]]), colour.model, (next) => {
    options.set(colour.pick ? { ...colour, model: next, ranges: rangesAround(next, colour.pick.rgb, colour.pick.tolerance) } : { ...colour, model: next, ranges: MODEL_LIMITS[next].map((range) => [...range]) as [Range, Range, Range] });
  });
  setTip(modelRow, MODEL_TIPS[colour.model]);
  section.append(modelRow);
  const tolerance = colour.pick?.tolerance ?? picker.tolerance;
  const shown = colour.pick?.rgb ?? rangesCentre(colour.model, colour.ranges);
  const wheel = createColourPicker({
    value: shown ? rgbToHex({ r: shown[0], g: shown[1], b: shown[2] }) : { h: 0, s: 0, b: 0.5 }, label: "Phase colour range",
    onCommit: (chosen) => options.pickFrom([chosen.rgb.r, chosen.rgb.g, chosen.rgb.b], tolerance),
  });
  setTip(wheel.element, colour.pick ? "The colour the ranges are set around. Choose another to move them." : "The middle of the ranges. Choose a colour to set the ranges around it.");
  section.append(wheel.element);
  const toleranceRow = createRow("Tolerance", `± ${formatMeasure(tolerance)}%`, document, {
    current: () => String(tolerance), label: "Tolerance",
    validate: (text) => (/^\s*\d+(\.\d+)?\s*$/.test(text) && Number(text) <= 100 ? null : "Enter a percentage from 0 to 100."),
    apply: (text) => { picker.tolerance = Number(text); if (shown) options.pickFrom(shown, picker.tolerance); },
    onError: options.report,
  });
  setTip(toleranceRow, "How far each component may lie from the colour, in percent of its span. Click to change it.");
  const size = createField("Pick size", options.sizeSelect());
  setTip(size, "The square the eyedropper averages; the keys 1, 3 and 5 change it while picking.");
  section.append(toleranceRow, size);
  COMPONENT_NAMES[colour.model].forEach((name, k) => {
    const row = createRow(name, rangeText(colour.ranges[k]));
    const [min, max] = MODEL_LIMITS[colour.model][k];
    setTip(row, `The ${name.replace(/ \(.*\)/, "").toLowerCase()} values kept, both ends included, of ${min} to ${max}.${colour.model === "hsb" && k === 0 && colour.ranges[k][0] > colour.ranges[k][1] ? " The range wraps through 0°." : ""} Type exact ranges with threshold colour in Terminal.`);
    section.append(row);
  });
}

// MARK: the histogram with the phases' bands

const SVG = "http://www.w3.org/2000/svg";
const CHART_W = 220, CHART_H = 64, BINS = 256;

/** The grey histogram of the result, 256 bins, with each grey phase's range as a band in its colour; the current one outlined. */
function histogramChart(working: Raster, phases: readonly Phase[], current: Phase | null, maskOf: (phase: Phase) => MaskState | null): SVGSVGElement {
  const M = maxValue(working.bitDepth), counts = histogram(working);
  const bins = new Float64Array(BINS);
  for (let v = 0; v <= M; v++) bins[Math.floor((v * BINS) / (M + 1))] += counts[v];
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${CHART_W} ${CHART_H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "mini-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Histogram of grey values with the phases' ranges");
  const x = (v: number) => (v / (M + 1)) * CHART_W;
  for (const phase of phases) {
    const result = maskOf(phase)?.result;
    if (!result || phase.threshold.mode === "colour") continue;
    const band = document.createElementNS(SVG, "rect");
    band.setAttribute("x", x(result.low).toFixed(2));
    band.setAttribute("width", Math.max(0.5, x(result.high + 1) - x(result.low)).toFixed(2));
    band.setAttribute("y", "0");
    band.setAttribute("height", String(CHART_H));
    band.setAttribute("fill", MASK_COLOURS[phase.colour]);
    band.setAttribute("class", `phase-band${phase.id === current?.id ? " current" : ""}`);
    svg.append(band);
  }
  const top = Math.max(1, ...bins), step = CHART_W / BINS;
  const bars = document.createElementNS(SVG, "path");
  bars.setAttribute("d", [...bins].map((n, k) => (n ? `M${(k * step).toFixed(2)} ${CHART_H}V${(CHART_H - (n / top) * CHART_H).toFixed(2)}h${step.toFixed(2)}V${CHART_H}z` : "")).join(""));
  bars.setAttribute("class", "mini-chart-fill");
  svg.append(bars);
  return svg;
}

// MARK: a mask step

/** A mask step's parameters: its operation, its iterations when it repeats, and the phase it acts on (or every phase). */
export function renderMaskStep(section: HTMLElement, step: MaskStep, phases: readonly Phase[], change: (patch: Partial<MaskStep>) => void, report: (message: string) => void): void {
  const operation = selectField<MaskOperationKind>("Operation", MASK_OPERATION_KINDS.map((kind) => [kind, OPERATION_LABELS[kind]]), step.operation, (kind) => change({ operation: kind }));
  setTip(operation, OPERATION_TIPS[step.operation]);
  section.append(operation);
  if (REPEATED_OPERATIONS.includes(step.operation)) {
    const iterations = createRow("Iterations", `× ${step.iterations}`, document, {
      current: () => String(step.iterations), label: "Iterations",
      validate: (text) => (/^\s*\d+\s*$/.test(text) && Number(text) >= 1 && Number(text) <= MAX_ITERATIONS ? null : `Enter a whole number from 1 to ${MAX_ITERATIONS}.`),
      apply: (text) => change({ iterations: Number(text) }), onError: report,
    });
    setTip(iterations, "How many times the operation repeats. Click to change it.");
    section.append(iterations);
    const count = createRow("Count", String(step.count ?? 1), document, {
      current: () => String(step.count ?? 1), label: "Count",
      validate: (text) => (/^\s*\d+\s*$/.test(text) && Number(text) >= 1 && Number(text) <= MAX_COUNT ? null : `Enter a whole number from 1 to ${MAX_COUNT}.`),
      apply: (text) => change({ count: Number(text) === 1 ? undefined : Number(text) }), onError: report,
    });
    setTip(count, "How many of the 8 neighbours must differ for a pixel to change: 1 (default) changes every edge pixel, higher counts only corners and specks. Click to change it.");
    section.append(count);
  }
  // A phase the step names that is gone stays listed, so the choice shows what the step holds.
  const choices: [string, string][] = [["", "Every phase"], ...phases.map((phase): [string, string] => [phase.id, phase.name])];
  if (step.phase !== undefined && !phases.some((phase) => phase.id === step.phase)) choices.push([step.phase, "A removed phase"]);
  const target = selectField<string>("Acts on", choices, step.phase ?? "", (id) => change({ phase: id || undefined }));
  setTip(target, "Every phase's mask, each on its own, so phases never mix; or only one phase's mask.");
  section.append(target);
}

// MARK: colour helpers

/** A range as a readout: `244 to 316`, in at most two decimals; a wrapped hue range reads through 0°. */
const rangeText = ([low, high]: Range) => `${formatMeasure(Math.round(low * 100) / 100)} to ${formatMeasure(Math.round(high * 100) / 100)}`;

/** The colour at the middle of a threshold's three ranges, 0 to 255 per component; null when it lies outside sRGB. */
export function rangesCentre(model: ColourModel3, ranges: readonly Range[]): [number, number, number] | null {
  const mid = ranges.map(([low, high], k) => (model === "hsb" && k === 0 && low > high ? ((low + high + 360) / 2) % 360 : (low + high) / 2));
  const rgb = model === "rgb" ? { r: mid[0], g: mid[1], b: mid[2] }
    : model === "hsb" ? hsbToRgb({ h: mid[0], s: mid[1] / 100, b: mid[2] / 100 })
    : labToRgb({ l: mid[0], a: mid[1], b: mid[2] });
  return rgb ? [rgb.r, rgb.g, rgb.b] : null;
}

