// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The inspector follows the content selection: with nothing selected it shows the document's settings, with one image
// the image's properties, its step list and the parameters of the current step, and with several the size of the
// selection. Rows, fields, sliders and rearranging come from the shell's kit.
import { createButton, createButtonGroup, createCheckRow, createEmptyNote, createField, createRow } from "forge-shell/app/builders";
import { showContextMenu, type MenuEntry } from "forge-shell/app/context-menu";
import { InspectorSections } from "forge-shell/app/inspector-sections";
import { createPartLine, createPartList, partMenu } from "forge-shell/app/properties";
import { editableValue, sliderRow } from "forge-shell/app/inspector-widgets";
import { type RenameOptions, validateName } from "forge-shell/app/rename";
import { attachReorder } from "forge-shell/app/reorder";
import { setTip } from "forge-shell/app/tips";
import { shortcutText } from "forge-shell/app/menus";
import { createUnitField } from "forge-shell/app/unit-field";
import { stepPhases, thresholdStep, type MaskDisplay, type Phase, DENSITY_FITS, densityProblem, describeFit, fitDensity, labelledPeaks, dependencyCycle, CALCULATOR_OPERATIONS, type DensityStandard, type TextLabel, BUILT_IN_EXPORT, BUILT_IN_IMAGE, effective, maxValue, FILTER_VALUES, SIGMA_FILTERS, formatMeasure, histogramOf, isBox, type DisplaySettings, laneProfile, lineProfile, roiMask, type HistogramResult, type Profile, resolveCalibration, type Calibration, type ImageSettings, type MeasureKey, type Roi, type Threshold, scaleAfterSteps, scaleOf, traceShapes, workingShape, type ImageCalibration, type DataReadOptions, type ColourModel, type ImageFormat, type ProjectImage, type Shape, type Step, type ProjectPlot, type DataTable, selectionEmpty, selectionPlan, selectionRanges, namesFromFirstRow, rangeLabel, rangeName, rangeReference, RANGE_ROLES, RANGE_ROLE_NAMES, TEXT_ROLES, type CellRange, type NamedRange, type RangeRole, type SheetSelection, type FitKind } from "../engine";
import { selectField } from "./settings-view";
import type { PlotDocument } from "./plot-document";
import { EXPORT_KEY, IMPORT_KEY } from "./menu-bar";
import { renderCalibration } from "./calibration-view";
import { renderRegions } from "./roi-view";
import { renderPlacement } from "./placement-view";
import { renderMaskStep, renderThreshold } from "./threshold-view";
import { renderDisplay } from "./display-view";
import { renderHistogram, renderProfile, tableText } from "./chart-view";
import { MEASURE_KEY, renderMeasurements } from "./results-view";
import { CALCULATOR_LABELS, CALCULATOR_TIPS, STEP_GROUPS, stepGroupItems, AXIS_LABELS, CONTRAST_LABELS, MATH_LABELS, MATH_TIPS, conversionText, FILTER_LABELS, FILTER_TIPS, kernelText, parseKernel, parseNumber, GREY_METHOD_LABELS, MAPPING_LABELS, phaseNameIn, stepName, stepSummary, TURN_LABELS } from "./step-wording";
import { actionsFirst } from "./section-actions";
import { renderDataSections } from "./data-view";
import { renderPlotSections } from "./plot-view";
import type { PlotPart } from "../engine";

export type SectionKey = "document" | "subject" | "placement" | "steps" | "step" | "measurements" | "calibration" | "density" | "regions" | "labels" | "display" | "reading" | "cells" | "batch" | "columns" | "column" | "xaxis" | "yaxis" | "y2axis" | "x2axis" | "series" | "fitting";
const SECTION_KEYS: readonly SectionKey[] = ["document", "subject", "placement", "steps", "step", "measurements", "calibration", "density", "regions", "labels", "display", "reading", "cells", "batch", "columns", "column", "xaxis", "yaxis", "y2axis", "x2axis", "series", "fitting"];

export interface InspectorHost {
  /** Rename an unsaved document: the name its first Save offers. */
  renameDocument(name: string): void;
  renameImage(id: string, name: string): void;
  setSnap(on: boolean): void;
  moveImage(id: string, x: number, y: number): void;
  turnImage(id: string, degrees: number): void;
  /** Add a step to the selected image, by the id of its Add step menu item. */
  addStep(item: string): void;
  removeStep(stepId: string): void;
  setStepEnabled(stepId: string, enabled: boolean): void;
  /** Move the step at `from` to before the step at `to` (which may be the number of steps). */
  moveStep(from: number, to: number): void;
  selectStep(stepId: string): void;
  /** Change a step's parameters, as one undoable edit. */
  changeStep(stepId: string, change: Partial<Step>): void;
  /** While a slider is dragged: the state before it, the live change (shown, not yet recorded), and its end. */
  beginPreview(): string;
  previewStep(stepId: string, change: Partial<Step>): void;
  endPreview(before: string): void;
  /** The Document section's actions: File › Import… (images and data files) and File › Export image…. */
  importImages(): void;
  /** Data mode: a data file's read options, and its name. */
  setDataRead(id: string, patch: Partial<DataReadOptions>): void;
  /** Choose a named range's cells in its worksheet. */
  selectName(name: NamedRange): void;
  /** Name the chosen cells (one column), or rename their name; give it a unit; remove it. */
  nameChosen(name: string): void;
  setNameUnit(id: string, unit: string): void;
  removeName(id: string): void;
  /** Name the chosen columns' cells from their first row, as Excel's Create from Selection. */
  nameFromFirstRow(): void;
  /** Add the chosen cells to a plot as series. */
  addChosenToPlot(plotId: string): void;
  /** Plot templates (app preferences): their names, the one new plots take, saving, applying; batch plotting. */
  templates(): string[];
  /** The app's data palette (Settings › General › Data colours), whose colours a series is offered first. */
  dataPalette(): string;
  saveTemplate(plotId: string): void;
  applyTemplate(plotId: string, name: string): void;
  batchPlot(plotId: string, sheetIds: string[]): void;
  /**
   * Wait for cells chosen in a worksheet to become a series' X, Y, error or labels, while its field has the focus
   * (quietly, the inspector kept as it is); null stops waiting.
   */
  pick(plotId: string, seriesId: string | null, which: "x" | "y" | "error" | "labels" | null): void;
  /** Give a chosen range a role for plotting (X, Y, Y error, Skip), for the session. */
  setCellRole(cells: CellRange, role: RangeRole): void;
  renameData(id: string, name: string): void;
  /** A worksheet's position or size on the work surface, as one undoable edit. */
  placeData(id: string, box: Partial<{ x: number; y: number; width: number; height: number }>): void;
  /** Change a plot as one undoable edit. */
  editPlot(id: string, change: (plot: ProjectPlot) => void): void;
  /** Add a fit of a kind to a plot's series, make it the series' current fit and show it. */
  addFit(plotId: string, seriesId: string, kind: FitKind): void;
  /** Choose a part of the selected plot, as a click on it does; mark one while the pointer is on its line; its context menu. */
  choosePart(plotId: string, part: PlotPart): void;
  markPart(plotId: string, part: PlotPart | null): void;
  partMenu(plotId: string, part: PlotPart): MenuEntry[];
  exportSelection(): void;
  /** The app's image settings and default calibration, read-only here: they are set in Settings (an app preference). */
  appImageSettings(): Partial<ImageSettings>;
  appCalibration(): Calibration | null;
  /** The selected image's overrides: set one, or reset one (or all, null). */
  setImageSetting<K extends keyof ImageSettings>(key: K, value: ImageSettings[K]): void;
  resetImageSetting(key: keyof ImageSettings | null): void;
  /** The current phase's threshold: set (one undo step), drawn live while a slider moves, and recorded on release. */
  setThreshold(next: Threshold | null): void;
  /** The selected image's phases: add one, remove one, make one current, rename or recolour one; how masks are shown. */
  addPhase(): void;
  removePhase(id: string): void;
  selectPhase(id: string): void;
  changePhase(id: string, patch: Partial<Pick<Phase, "name" | "colour">>): void;
  setMaskDisplay(mode: MaskDisplay): void;
  /** Show the measurement set, in the Results tab. */
  showMeasurementSet(): void;
  previewThreshold(next: Threshold): void;
  /** The selected image's measurement set, and Measure. */
  setMeasurements(next: MeasureKey[]): void;
  measure(): void;
  /** Add a Convert to grey step, for a colour image to be thresholded. */
  addGreyStep(): void;
  /** Regions of the selected image. */
  selectRoi(roiId: string): void;
  removeRoi(roiId: string): void;
  /** Turn on the Crop tool, which shows the current Crop step's image uncropped with its box and handles. */
  editCrop(): void;
  /** Crop the selected image to a region's bounding box; calibrate it by a line region's length. */
  cropToRegion(roiId: string): void;
  calibrateFromLine(roiId: string): void;
  renameRoi(roiId: string, name: string): void;
  changeRoi(roiId: string, patch: Partial<Roi>): void;
  /** Set the selected image's calibration ("image") or the document's default ("document"). */
  setCalibration(target: "image" | "document", next: ImageCalibration): void;
  /** Whether a section is open, as a person last left it; remembered. */
  foldOpen(key: SectionKey): boolean | undefined;
  /** Put text on the clipboard and say what was copied. */
  copyText(text: string, what: string): void;
  /** Set the selected image's display settings as one edit, or show them while a slider moves. */
  setDisplay(next: DisplaySettings | undefined): void;
  previewDisplay(next: DisplaySettings): void;
  setFold(key: SectionKey, open: boolean): void;
  /** Report a result or a rejected value: status bar and Messages. */
  report(text: string, kind: "info" | "error"): void;
  /** Turn on the eyedropper for the selected image's colour threshold; set the ranges around a chosen colour; its size choice. */
  pickColour(): void;
  pickFrom(rgb: [number, number, number], tolerance: number): void;
  eyedropperSizeSelect(): HTMLButtonElement;
  /** The selected image's density standard: set it (undefined removes it), or add a point from the selected region. */
  setDensity(next: DensityStandard | undefined): void;
  addDensityPoint(): void;
  /** The selected image's overlay text. */
  addLabel(): void;
  changeLabel(id: string, patch: Partial<TextLabel>): void;
  removeLabel(id: string): void;
}

// MARK: sections


/** Sections folded until opened: the rarely changed ones. Every other section starts open. */
export const FOLDED_BY_DEFAULT: ReadonlySet<SectionKey> = new Set(["display", "placement"]);

// MARK: wording

export const FORMAT_LABELS: Record<ImageFormat, string> = { png: "PNG", jpeg: "JPEG", tiff: "TIFF" };
export const COLOUR_LABELS: Record<ColourModel, string> = { grey: "Grey", "grey-alpha": "Grey with alpha", rgb: "RGB", rgba: "RGB with alpha", palette: "Palette", cmyk: "CMYK", ycbcr: "YCbCr" };

/** A file size with a binary unit and a space before it: 84 B, 12.1 KB, 3.4 MB. */
/** The Add step menu: a submenu per group (Convert, Geometry, Adjust, Filters, Combine), as Document › Add step. */
export function addStepMenu(add: (id: string) => void): MenuEntry[] {
  return STEP_GROUPS.map((group) => ({ label: group, items: stepGroupItems(group).map((item) => ({ label: item.label, action: () => add(item.id) })) }));
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** Content pixels: whole numbers, with the unit after a space. */
const formatPx = (value: number, unit: string) => `${Math.round(value)} ${unit}`;
const parsePx = (text: string) => { const match = /^\s*(-?\d+(?:\.\d+)?)\s*(px)?\s*$/i.exec(text); return match ? Math.round(Number(match[1])) : NaN; };
/** Grey values: whole numbers without a unit. */
const formatValue = (value: number) => String(Math.round(value));
const parseValue = (text: string) => (/^\s*\d+(\.\d+)?\s*$/.test(text) ? Math.round(Number(text)) : NaN);
/** Gamma: two decimals at most. */
const formatGamma = (value: number) => String(Math.round(value * 100) / 100);
const parseGamma = (text: string) => (/^\s*\d*\.?\d+\s*$/.test(text) && Number(text) > 0 ? Number(text) : NaN);
/** The gamma slider's range; the field takes any value above 0. */
const GAMMA_MIN = 0.1, GAMMA_MAX = 5;

// MARK: rendering

/** A filter's number fields: label, key, unit, tip and the message for a value that cannot be read. */
const FILTER_FIELDS: Record<"sigma" | "radius" | "weight" | "threshold", [string, "radius" | "weight" | "threshold", string, string, string]> = {
  sigma: ["Sigma", "radius", "px", "The standard deviation of the Gaussian, in pixels; the kernel reaches 4 sigma.", "Invalid sigma. Enter a number of pixels above 0."],
  radius: ["Radius", "radius", "px", "The radius of the circular neighbourhood, in pixels, as ImageJ's rank filters take it.", "Invalid radius. Enter a number of pixels from 0.5."],
  weight: ["Weight", "weight", "", "How much of the blur is taken away, from 0.1 to 0.9; the result is divided by 1 minus the weight.", "Invalid weight. Enter a number from 0.1 to 0.9."],
  threshold: ["Threshold", "threshold", "", "How far from the neighbourhood's median a value must be to be replaced, in the image's own values.", "Invalid threshold. Enter a number from 0."],
};

export class Inspector {
  private readonly sections: InspectorSections<SectionKey>;
  /** Groups opened or closed this session, by key; the others take their default. */
  private readonly groups = new Map<string, boolean>();
  /** Where the person last scrolled the inspector, kept across rebuilds as a design app keeps its panels still. */
  private wantedScroll = 0;
  /** The position the inspector last set itself, to tell its own scroll events from the person's. */
  private placedScroll = 0;

  constructor(private readonly root: HTMLElement, private readonly host: InspectorHost) {
    root.setAttribute("aria-label", "Inspector");
    // Only the person's own scrolling moves the remembered position; a scroll the browser makes when a rebuild is
    // briefly shorter (a step's result still being computed) is not taken as theirs.
    root.addEventListener("scroll", () => { if (Math.abs(root.scrollTop - this.placedScroll) > 1) this.wantedScroll = root.scrollTop; this.placedScroll = root.scrollTop; });
    this.sections = new InspectorSections<SectionKey>({
      root, keys: SECTION_KEYS, isOpen: (key) => host.foldOpen(key) ?? !FOLDED_BY_DEFAULT.has(key), setOpen: (key, open) => host.setFold(key, open),
      // A part's less used rows fold inside it, closed until opened: a series' Fitting, a plot's template and placement,
      // a fit's line and label (GUIDELINES-CORE, Properties follow the selection).
      isGroupOpen: (key) => this.groups.get(key) ?? !/\/(?:fitting|batch|placement|fitting\/line|fitting\/label)$/.test(key),
      setGroupOpen: (key, open) => { this.groups.set(key, open); },
    });
  }

  /**
   * Rebuild the inspector for the document and its selection: one list of sections grouped by subject, each with its
   * own actions as its first row (shell 4.0.0, Inspector philosophy). A section that does not apply to the selection is
   * left out. With no document the document's rows stay, dimmed.
   */
  render(doc: PlotDocument | null): void {
    this.lastDoc = doc;
    this.root.replaceChildren();
    const selected = doc?.selectedImages() ?? [];
    // The document always comes first; what is selected follows it with its own sections.
    this.renderDocument(doc);
    const data = doc?.selectedData() ?? null;
    if (doc && data) renderDataSections({
      section: (title, key) => this.section(title, key), nameRow: (name, rename) => this.nameRow(name, { ...rename, label: "Data name", onError: (message) => this.host.report(message, "error") }),
      setRead: (id, patch) => this.host.setDataRead(id, patch), selectName: (name) => this.host.selectName(name), rename: (id, name) => this.host.renameData(id, name),
      report: (text, kind) => this.host.report(text, kind), fileSize, place: (id, box) => this.host.placeData(id, box),
      actions: (table) => this.cellRows(doc, data.id, data.name, table, doc.selectedColumn?.id === data.id ? doc.selectedColumn.cells : null),
    }, data, doc.project.data, doc.tables.get(data.id), doc.selectedColumn?.id === data.id ? doc.selectedColumn.column : null, doc.project.ranges);
    const plot = doc?.selectedPlot() ?? null;
    if (data) { /* the worksheet's sections are drawn above */ }
    else if (doc && plot) renderPlotSections({
      properties: (path) => this.sections.properties(path, "subject"), part: doc.selectedPart() ?? { kind: "plot" },
      choose: (part) => this.host.choosePart(plot.id, part), mark: (part) => this.host.markPart(plot.id, part), menu: (part) => this.host.partMenu(plot.id, part),
      group: (parent, title, key) => this.sections.group(parent, title, key), nameRow: (name, rename) => this.nameRow(name, { ...rename, label: "Plot name", onError: (message) => this.host.report(message, "error") }),
      edit: (id, change) => this.host.editPlot(id, change), report: (text, kind) => this.host.report(text, kind),
      button: (label, primary, enabled, action, tip) => this.actionButton(label, primary, enabled, action, tip), buttons: (items) => createButtonGroup(items),
      chosenCells: () => {
        const last = doc.lastCells, table = last ? doc.table(last.id) : null, link = last ? doc.dataLink(last.id) : null;
        const ranges = last && table && link ? selectionRanges(table, last.cells, last.id) : [];
        return ranges.length ? { ranges, text: ranges.map((cells) => rangeReference(cells, link!.name, table)).join(", ") } : null;
      },
      addChosen: (id) => this.host.addChosenToPlot(id),
      pick: (plotId, seriesId, which) => this.host.pick(plotId, seriesId, which),
      picking: doc.picking?.plotId === plot.id ? { seriesId: doc.picking.seriesId, which: doc.picking.which } : null,
      sheets: doc.project.data.map((link) => ({ id: link.id, name: link.name, table: doc.table(link.id) })),
      templates: this.host.templates(), dataPalette: this.host.dataPalette(),
      saveTemplate: (id) => this.host.saveTemplate(id), applyTemplate: (id, name) => this.host.applyTemplate(id, name),
      batchPlot: (id, sheets) => this.host.batchPlot(id, sheets),
      batchOff: this.batchOff,
      addFit: (plotId, seriesId, kind) => this.host.addFit(plotId, seriesId, kind),
      refresh: () => this.render(this.lastDoc), copy: (text, what) => this.host.copyText(text, what),
    }, plot, doc.project.plots, doc.plotSources());
    else if (doc && selected.length === 1 && doc.selection.size === 1) this.renderImage(doc, selected[0]);
    else if (doc && doc.selection.size > 1) this.renderSelection(doc.selectedObjects());
    else {
      // The selection's section stays in its place with nothing selected, showing Nothing selected. (GUIDELINES-CORE,
      // Inspector), so the inspector does not jump as the selection comes and goes.
      this.section("Selection", "subject").append(createEmptyNote());
      this.renderDocumentCalibration(doc);
    }
    // A rebuild that is shorter for a moment clamps the position; the next full one returns to where the person was.
    this.root.scrollTop = this.wantedScroll;
    this.placedScroll = this.root.scrollTop;
    this.renderCharts();
    this.renderMeasure();
  }

  /** Open and show the chosen part's Properties (a part chosen on the plot, a fit added, Properties…). */
  revealPart(doc: PlotDocument | null): void {
    if (!doc?.selectedPlot()) return;
    this.reveal("subject");
  }

  /** Open a section and bring it into view (`InspectorSections.reveal`), keeping the scroll the person then has. */
  reveal(key: SectionKey): void {
    this.sections.reveal(key);
    requestAnimationFrame(() => { this.wantedScroll = this.placedScroll = this.root.scrollTop; });
  }

  /** The bottom panel's Charts tab, drawn with the inspector because it follows the same selection. */
  private chartsPane: HTMLElement | null = null;
  attachCharts(pane: HTMLElement): void {
    this.chartsPane = pane;
  }

  /** Worksheets left out of batch plotting this session (they are ticked by default). */
  private readonly batchOff = new Set<string>();

  private section(title: string, key: SectionKey): HTMLElement {
    return this.sections.create(title, key);
  }

  /** A text action with its tooltip, and the shared symbol before its label where the action has one (Copy). */
  private actionButton(label: string, primary: boolean, enabled: boolean, onClick: () => void, tip: string, icon: string | null = null): HTMLButtonElement {
    const button = createButton({ label, primary, disabled: !enabled, onClick });
    if (icon) { button.textContent = ""; button.insertAdjacentHTML("beforeend", icon); button.append(Object.assign(document.createElement("span"), { textContent: label })); }
    setTip(button, tip);
    return button;
  }

  /**
   * The Document section, first in every mode (documentation/INSPECTOR-LAYOUT.md): Import… and Export…, then
   * the document's Name (editable while unsaved), File, Images and Grid, and Snap to grid. An action that does not apply
   * is disabled, its tip saying why. Copy, Duplicate and Delete are Edit's (Cmd+C, Cmd+D, Backspace).
   */
  private renderDocument(doc: PlotDocument | null): void {
    const section = this.section("Document", "document");
    const selected = doc?.selectedImages() ?? [], shown = selected.filter((image) => doc!.ready(image.id));
    const plots = doc ? doc.project.plots.filter((plot) => doc.selection.has(plot.id)) : [];
    section.append(createButtonGroup([
      this.actionButton("Import…", false, !!doc, () => this.host.importImages(), doc ? `Import images or data files (CSV, text, Excel)… (${shortcutText(IMPORT_KEY)})` : "Open or create a document first."),
      this.actionButton("Export…", true, shown.length > 0 || plots.length > 0, () => this.host.exportSelection(),
        shown.length ? `Export image… (${shortcutText(EXPORT_KEY)}): the result of the steps; the original is never written.`
          : plots.length ? `Export ${plots.length === 1 ? "the plot" : "the plots"}… (${shortcutText(EXPORT_KEY)}) with the options of Settings › Export › Plots.`
          : "Select images or plots on the work surface to export them."),
    ]));
    // A saved document keeps its file's name (renaming it on disk is not offered yet); an unsaved one renames here.
    const name = this.nameRow(doc?.name ?? "", doc && !doc.path ? {
      current: () => doc.name, label: "Document name",
      validate: (next) => validateName(next), apply: (next) => this.host.renameDocument(next.trim()),
      onError: (message) => this.host.report(message, "error"),
    } : null);
    const file = createRow("File", doc?.path ? doc.path.split(/[\\/]/).pop()! : "Not saved");
    if (doc?.path) setTip(file, `Saved at ${doc.path}.`);
    // A toggle of the subject sits at the foot of its section.
    const snap = createCheckRow("Snap to grid", doc?.project.grid.snap ?? true, (on) => this.host.setSnap(on));
    setTip(snap, "Move images in grid steps; hold Option while dragging to place them freely.");
    section.append(name, file, createRow("Images", String(doc?.project.images.length ?? 0)), ...(doc?.project.data.length ? [createRow("Data", String(doc.project.data.length))] : []), createRow("Grid", `${doc?.project.grid.spacing ?? 16} px`), snap);
  }

  /**
   * The worksheet's rows for the cells chosen in it: each range's role in a plot (X, Y, Y error, Label, Skip), where
   * they are (Sheet!B2:B40) and, for one column, their Name and Unit, as Excel's Name Box; Name from row n, as Excel's
   * Create from Selection. Plots are made from the toolbar's plot kinds, as Excel's Insert › Chart; none with no cells.
   */
  private cellRows(doc: PlotDocument, id: string, sheet: string, table: DataTable | null, cells: SheetSelection | null): HTMLElement {
    const group = document.createElement("div");
    group.className = "inspector-action-rows";
    const chosen = !selectionEmpty(cells);
    const ranges = table && chosen ? selectionRanges(table, cells, id) : [];
    const plan = table && chosen ? selectionPlan(table, cells, id, doc.roleOf) : { ranges: [], pairs: [] };
    const label = (range: CellRange) => rangeLabel(doc.project.ranges, range, sheet, table).replace(/^.*!/, "");
    if (!table || !ranges.length) return group;
    // What each chosen range is to a plot, as Origin's Plot Setup designates columns; plots are made from the toolbar.
    for (const item of plan.ranges) {
      const field = selectField<RangeRole>(label(item.cells), (item.numeric ? RANGE_ROLES : TEXT_ROLES).map((role) => [role, RANGE_ROLE_NAMES[role]] as const), item.role,
        (role) => this.host.setCellRole(item.cells, role));
      setTip(field, item.numeric ? "What these cells are to the plot: X, Y (against the nearest X chosen before it), Y error (± bars for the Y before it), Label (text by each point of the Y before it) or Skip." : "These cells hold text: Label writes it by each point of the Y before it; Skip leaves them out.");
      group.append(field);
    }
    const reference = createRow("Cells", ranges.map((range) => rangeReference(range, sheet, table).replace(/^.*!/, "")).join(", "));
    setTip(reference, `${ranges.length === 1 ? "The chosen cells" : "The chosen columns"} of ${sheet}, as Origin and Excel write them.`);
    if (ranges.length === 1) group.append(reference);
    if (ranges.length === 1) {
      const names = doc.project.ranges, own = names.find((name) => name.data === id && name.column === ranges[0].column && (name.rows === null ? ranges[0].rows === null : !!ranges[0].rows && name.rows.first === ranges[0].rows.first && name.rows.last === ranges[0].rows.last));
      const labelled = own ?? rangeName(names, ranges[0]);
      const name = createRow("Name", own?.name ?? "", document, {
        current: () => own?.name ?? "", label: "Name of the chosen cells", validate: () => null,
        apply: (next) => this.host.nameChosen(next), onError: (message) => this.host.report(message, "error"),
      });
      setTip(name, own ? "The name in the legend and axis titles; empty removes it. Type =B1 to take a cell's text." : `Name these cells to label them in plots${labelled ? ` (now labelled ${labelled.name} by their column's name)` : ""}. Type a name, or =B1 to take a cell's text.`);
      group.append(name);
      if (own) {
        const unit = createRow("Unit", own.unit, document, {
          current: () => own.unit, label: "Unit of the chosen cells", validate: () => null,
          apply: (next) => this.host.setNameUnit(own.id, next.trim()), onError: (message) => this.host.report(message, "error"),
        });
        setTip(unit, `The unit in axis titles: ${own.unit ? `${own.name} (${own.unit})` : own.name}. Type =C1 to take a cell's text.`);
        group.append(unit);
      }
    }
    // Offered only when the chosen cells start with a heading: text above numbers, named here before it is pressed.
    const headings = namesFromFirstRow(ranges, table);
    if (headings.length) {
      const first = (ranges[0].rows?.first ?? 0) + 1;
      const names = headings.map((item) => (item.unit ? `${item.name} (${item.unit})` : item.name)).join(", ");
      group.append(createButtonGroup([this.actionButton(`Name from row ${first}`, false, true, () => this.host.nameFromFirstRow(),
        `Name the cells below row ${first} by its text, as Excel's Create from Selection: ${names}.`)]));
    }
    return group;
  }

  /** A Name row that renames in place (click or F2); a plain row without `options`. */
  private nameRow(name: string, options: RenameOptions | null): HTMLElement {
    return createRow("Name", name, document, options ?? undefined);
  }

  /** The document's default calibration, with nothing selected. */
  private renderDocumentCalibration(doc: PlotDocument | null): void {
    renderCalibration(this.section("Default calibration", "calibration"), {
      target: "document", own: doc?.project.calibration ?? null, documentDefault: doc?.project.calibration ?? null,
      apply: (next) => this.host.setCalibration("document", next), report: (message) => this.host.report(message, "error"),
    });
  }

  /**
   * One image, below the Document section, in the order of the work: the image with its file, its calibration, the
   * steps, the analysis, how it is displayed, then its placement, which changes least.
   */
  private renderImage(doc: PlotDocument, image: ProjectImage): void {
    this.renderImageHeader(doc, image);
    this.renderImageCalibration(doc, image);
    this.renderSteps(doc, image);
    this.renderAnalysis(doc, image);
    this.renderView(doc, image);
    this.renderPlacement(image);
  }

  /** The Image section: its name, then its file and what was read from it. */
  private renderImageHeader(doc: PlotDocument, image: ProjectImage): void {
    const name = this.nameRow(image.name, {
      current: () => image.name, label: "Image name",
      validate: (next) => validateName(next, { taken: doc.project.images.filter((other) => other !== image).map((other) => other.name) }),
      apply: (next) => this.host.renameImage(image.id, next.trim()), onError: (message) => this.host.report(message, "error"),
    });
    const state = doc.images.get(image.id);
    const file = createRow("File", image.file);
    setTip(file, image.embedded ? "Pasted, and kept inside the document; it has no file of its own." : image.path ? `Read-only original at ${image.path}.` : "Read-only original; the browser preview gives no folder.");
    this.section("Image", "subject").append(name, file,
      createRow("Status", state?.kind === "missing" ? "Missing" : state?.kind === "unreadable" ? "Unreadable" : state?.kind === "loading" ? "Loading" : image.embedded ? "Inside the document" : "Linked, read-only"),
      createRow("Format", FORMAT_LABELS[image.source.format]),
      createRow("Pixels", `${image.source.widthPx} × ${image.source.heightPx}`),
      createRow("Bit depth", `${image.source.bitDepth} bit`),
      createRow("Colour", COLOUR_LABELS[image.source.colour]),
      createRow("File size", fileSize(image.source.bytes)));
  }

  /** Where the image sits on the work surface; folded, as it changes least. */
  private renderPlacement(image: ProjectImage): void {
    renderPlacement(this.section("Placement", "placement"), {
      noun: "the image", box: image, editable: ["x", "y"],
      apply: (key, value) => this.host.moveImage(image.id, key === "x" ? value : image.x, key === "y" ? value : image.y),
      tips: { width: "The image's width in pixels, after its steps; it is drawn a pixel to a pixel.", height: "The image's height in pixels, after its steps; it is drawn a pixel to a pixel." },
      angle: { value: image.angle ?? 0, apply: (degrees) => this.host.turnImage(image.id, degrees) },
      report: (message) => this.host.report(message, "error"),
    });
  }

  /** How the image is drawn, its histogram and a profile; left out while the image cannot be shown. */
  private renderView(doc: PlotDocument, image: ProjectImage): void {
    if (!doc.ready(image.id)) return;
    renderDisplay(this.section("Display", "display"), {
      display: image.display, working: doc.ready(image.id)?.working ?? null, set: (next) => this.host.setDisplay(next),
      beginPreview: () => this.host.beginPreview(), preview: (next) => this.host.previewDisplay(next), endPreview: (before) => this.host.endPreview(before),
      report: (message) => this.host.report(message, "error"),
    });
  }

  /** Histograms are drawn on a log scale while this is on; session only. */
  private histogramLog = false;
  /** The least prominence of a labelled peak; null: a tenth of the profile's range. Session only. */
  private peakProminence: number | null = null;
  private lastDoc: PlotDocument | null = null;
  /** The kind Plot makes of chosen cells: the one last chosen, for the session. */

  /** A section of the Charts tab: a plain heading (the tab has no folds), then its contents. */
  private chartSection(pane: HTMLElement, title: string): HTMLElement {
    const section = Object.assign(document.createElement("div"), { className: "section" });
    section.append(Object.assign(document.createElement("div"), { className: "section-title chart-title", textContent: title }));
    pane.append(section);
    return section;
  }

  /**
   * The Charts tab: the histogram of the selected region and the profile of a selected line or rectangle, side by side.
   * Read-outs rather than settings, so they sit in the bottom panel, not the inspector. Drawn only while the tab shows.
   */
  renderCharts(): void {
    const pane = this.chartsPane;
    if (!pane || pane.hidden) return;
    pane.replaceChildren();
    const doc = this.lastDoc;
    const selected = doc?.selectedImages() ?? [];
    const image = selected.length === 1 ? selected[0] : null;
    const working = doc && image ? doc.ready(image.id)?.working ?? null : null;
    const roi = doc && image && doc.selectedRoi?.imageId === image.id ? image.rois.find((item) => item.id === doc.selectedRoi!.roiId) ?? null : null;
    // Histograms and profiles are of grey values; the whole image's histogram is the Threshold section's.
    const why = !image ? "Select one image, then a region on it, to chart it."
      : !working ? "The image must be shown before it can be charted."
      : working.channels !== 1 ? "Charts are of grey values; add a Convert to grey step to chart a colour image."
      : !roi ? "Select a region on the image to chart it: its histogram, and the profile of a line or rectangle." : null;
    if (why || !doc || !image || !working || !roi) {
      pane.append(Object.assign(document.createElement("div"), { className: "pane-empty", textContent: why ?? "" }));
      return;
    }
    const scale = scaleAfterSteps(scaleOf(resolveCalibration(image.calibration, doc.project.calibration, this.host.appCalibration()).calibration), image.steps);
    const histogram: HistogramResult | string = histogramOf(working, roi && roi.type !== "line" ? roiMask(roi, working) : null);
    const title = roi && roi.type !== "line" ? `Histogram of ${roi.name}` : "Histogram";
    renderHistogram(this.chartSection(pane, title), histogram, this.histogramLog, (on) => { this.histogramLog = on; this.renderCharts(); }, () => {
      if (typeof histogram === "string") return;
      const h = histogram;
      this.host.copyText(tableText(["Bin start", "Count"], h.counts.map((n, k) => [formatMeasure(k * h.binWidth), n])), "the histogram");
    });
    if (!roi || (roi.type !== "line" && roi.type !== "rectangle")) return;
    const profile: Profile | string = roi.type === "line" ? lineProfile(working, roi.points, scale) : isBox(roi) ? laneProfile(working, roi, scale) : "";
    const kind = roi.type === "line" ? "Line profile" : "Lane profile";
    renderProfile(this.chartSection(pane, `Profile of ${roi.name}`), profile, kind, () => {
      if (typeof profile === "string") return;
      const p = profile;
      this.host.copyText(tableText([`Distance (${p.unit})`, "Value"], p.values.map((v, i) => [p.distances[i], v])), "the profile");
    }, roi.type === "rectangle" && typeof profile !== "string" ? (() => {
      const span = Math.max(...profile.values) - Math.min(...profile.values);
      const minProminence = this.peakProminence ?? Math.round(span * 0.1 * 100) / 100;
      return {
        list: labelledPeaks(profile, minProminence), minProminence,
        setMinProminence: (text: string) => { this.peakProminence = Number(text); this.renderCharts(); },
        report: (message: string) => this.host.report(message, "error"),
      };
    })() : undefined);
  }

  /** The image's calibration: its own, or the document's default it follows. */
  private renderImageCalibration(doc: PlotDocument, image: ProjectImage): void {
    const resolved = resolveCalibration(image.calibration, doc.project.calibration, this.host.appCalibration()).calibration;
    const result = traceShapes(workingShape(image.source), image.steps).at(-1)!;
    const selectedRoi = doc.selectedRoi?.imageId === image.id ? image.rois.find((roi) => roi.id === doc.selectedRoi!.roiId) ?? null : null;
    const own = image.calibration && image.calibration !== "pixels" ? image.calibration : null;
    renderCalibration(this.section("Calibration", "calibration"), {
      target: "image", own: image.calibration, documentDefault: doc.project.calibration ?? this.host.appCalibration(),
      result: { scale: scaleAfterSteps(scaleOf(resolved), image.steps), widthPx: result.widthPx, heightPx: result.heightPx },
      apply: (next) => this.host.setCalibration("image", next), report: (message) => this.host.report(message, "error"),
      selectedLine: selectedRoi?.type === "line" ? { id: selectedRoi.id, name: selectedRoi.name } : null,
      followedLine: own?.line !== undefined ? image.rois.find((roi) => roi.id === own.line)?.name ?? null : null,
      useLine: (roiId) => this.host.calibrateFromLine(roiId),
    });
  }

  /** The image's labels; its threshold is with its steps, its regions and measurements in the Measure tab. */
  private renderAnalysis(_doc: PlotDocument, image: ProjectImage): void {
    // The threshold is the Threshold step's parameters, shown with the step list (renderStep). Labels appear once the
    // image has some (Document › Add label); its regions and measurements are in the bottom panel's Measure tab.
    if (image.labels?.length) this.renderLabels(image);
  }

  /** The bottom panel's Measure tab: the selected image's regions, what Measure takes, and its density standard. */
  private measurePane: HTMLElement | null = null;
  attachMeasure(pane: HTMLElement): void {
    this.measurePane = pane;
  }

  renderMeasure(): void {
    const pane = this.measurePane;
    if (!pane || pane.hidden) return;
    pane.replaceChildren();
    const doc = this.lastDoc;
    const selected = doc?.selectedImages() ?? [];
    const image = doc && selected.length === 1 && doc.selection.size === 1 ? selected[0] : null;
    if (!doc || !image) {
      pane.append(Object.assign(document.createElement("div"), { className: "pane-empty", textContent: "Select one image to measure it and to list its regions." }));
      return;
    }
    const working = doc.ready(image.id)?.working ?? null;
    const resolved = resolveCalibration(image.calibration, doc.project.calibration, this.host.appCalibration()).calibration;
    const ready = doc.ready(image.id);
    const current = doc.selectedRoi?.imageId === image.id ? image.rois.find((roi) => roi.id === doc.selectedRoi!.roiId) ?? null : null;
    renderRegions(this.chartSection(pane, "Regions"), {
      image, current, result: ready ? ready.working : null, scale: scaleAfterSteps(scaleOf(resolved), image.steps),
      select: (id: string) => this.host.selectRoi(id), remove: (id: string) => this.host.removeRoi(id),
      rename: (id: string, name: string) => this.host.renameRoi(id, name), change: (id: string, patch: Partial<Roi>) => this.host.changeRoi(id, patch),
      cropTo: (id: string) => this.host.cropToRegion(id), report: (message: string) => this.host.report(message, "error"),
    });
    const imageSettings = effective(BUILT_IN_IMAGE, this.host.appImageSettings(), image.settings);
    const measurements = this.chartSection(pane, "Measurements");
    const grey = !!working && working.channels === 1;
    measurements.append(createButtonGroup([
      this.actionButton("Measure", true, !!working, () => this.host.measure(), working ? `Measure (${shortcutText(MEASURE_KEY)})` : "The image must be shown before it can be measured."),
      ...(grey && !image.density ? [this.actionButton("OD standard", false, true, () => this.host.addDensityPoint(), "Calibrate optical density against a density standard: add its first point from the selected region's mean grey value.")] : []),
    ]));
    renderMeasurements(measurements, {
      measurements: imageSettings.measurements, phases: stepPhases(image.steps).length,
      limitToThreshold: imageSettings.limitToThreshold, setLimit: (on) => this.host.setImageSetting("limitToThreshold", on),
      chooseInResults: () => this.host.showMeasurementSet(),
    });
    if (grey && image.density) this.renderDensity(image, doc, this.chartSection(pane, "Density standard"));
  }

  /** The density standard (I20): its actions first, its fit stated, then a row per point, each typed in as "grey OD". */
  private renderDensity(image: ProjectImage, doc: PlotDocument, section: HTMLElement): void {
    const standard = image.density;
    const roi = doc.selectedRoi?.imageId === image.id ? image.rois.find((item) => item.id === doc.selectedRoi!.roiId) : undefined;
    const add = createButton({ label: "Add point", onClick: () => this.host.addDensityPoint() });
    setTip(add, roi && roi.type !== "line" ? `Add a point with the mean grey value of ${roi.name}; then type its known optical density.` : "Add a point with the mean grey value of the selected region (or of the image); then type its known optical density.");
    const remove = createButton({ label: "Remove last", disabled: !standard?.points.length, onClick: () => this.host.setDensity(standard!.points.length > 1 ? { ...standard!, points: standard!.points.slice(0, -1) } : undefined) });
    setTip(remove, "Remove the last point; removing the only one removes the standard.");
    actionsFirst(section, createButtonGroup([add, remove]));
    if (!standard) {
      const none = createRow("Standard", "None");
      setTip(none, "Without a standard, optical density is log10(M / v), M the depth's maximum: uncalibrated.");
      section.append(none);
      return;
    }
    // Readouts first: the fit found, as an equation, its R² and the grey values it covers; the detail is the tooltip.
    const problem = densityProblem(standard);
    if (problem) {
      const row = createRow("Fit", "Not enough points");
      setTip(row, `${problem} Until then, optical density stays uncalibrated.`);
      section.append(row);
    } else {
      const fitted = fitDensity(standard);
      const equation = describeFit(fitted, standard.points.length, formatMeasure);
      const [a, b, c] = fitted.coefficients;
      const term = (k: number, text: string) => ` ${k < 0 ? "−" : "+"} ${formatMeasure(Math.abs(k))}${text}`;
      const od = createRow("OD", `${formatMeasure(a)}${term(b, " v")}${c === undefined ? "" : term(c, " v²")}`);
      setTip(od, `${equation}. Grey values outside the standard's range are extrapolated.`);
      const r2 = createRow("R²", formatMeasure(fitted.rSquared));
      setTip(r2, "1 − residual over total sum of squares of the standard's points.");
      const covers = createRow("Grey range", `${formatMeasure(fitted.low)} to ${formatMeasure(fitted.high)}`);
      setTip(covers, "The grey values the standard covers; outside them the fit is extrapolated.");
      section.append(od, r2, covers);
    }
    const fit = selectField("Fit", DENSITY_FITS.map((item) => [item, item === "linear" ? "Linear" : "Quadratic"]), standard.fit, (item) => this.host.setDensity({ ...standard, fit: item as DensityStandard["fit"] }));
    setTip(fit, "Least squares of OD against the grey value: linear needs 2 grey values, quadratic 3.");
    section.append(fit);
    standard.points.forEach((point, index) => {
      const row = createRow(`${index + 1}. Grey ${formatMeasure(point.grey)}`, `OD ${formatMeasure(point.od)}`, document, {
        current: () => `${point.grey} ${point.od}`, label: "Grey value and OD",
        validate: (text) => { const parts = text.trim().split(/[\s,]+/).map(Number); return parts.length === 2 && parts.every(Number.isFinite) && parts[0] >= 0 ? null : "Enter the grey value and its known optical density, separated by a space."; },
        apply: (text) => { const [grey, od] = text.trim().split(/[\s,]+/).map(Number); this.host.setDensity({ ...standard, points: standard.points.map((item, i) => (i === index ? { grey, od } : item)) }); },
        onError: (message) => this.host.report(message, "error"),
      });
      setTip(row, "A grey value of the standard and its known optical density. Click to type both, separated by a space.");
      section.append(row);
    });
  }

  /** Overlay text (I14): Add label and Remove as the first row, then each label, its text and its place typed in. */
  private renderLabels(image: ProjectImage): void {
    const section = this.section("Labels", "labels");
    const labels = image.labels ?? [];
    const add = createButton({ label: "Add label", onClick: () => this.host.addLabel() });
    setTip(add, "Add a text label at the centre of the selected region, or of the image. Labels are drawn over the image and kept out of its pixels.");
    const remove = createButton({ label: "Remove last", disabled: !labels.length, onClick: () => this.host.removeLabel(labels.at(-1)!.id) });
    setTip(remove, "Remove the last label.");
    actionsFirst(section, createButtonGroup([add, remove]));
    if (!labels.length) section.append(createRow("Labels", "None"));
    labels.forEach((label, index) => {
      const text = createRow(`${index + 1}. Text`, label.text, document, {
        current: () => label.text, label: "Label text", validate: (value) => (value.trim() && value.length <= 200 ? null : "Enter some text, at most 200 characters."),
        apply: (value) => this.host.changeLabel(label.id, { text: value }), onError: (message) => this.host.report(message, "error"),
      });
      const place = createRow("At", `${formatMeasure(label.x)}, ${formatMeasure(label.y)} px`, document, {
        current: () => `${label.x} ${label.y}`, label: "Label position",
        validate: (value) => { const parts = value.trim().split(/[\s,]+/).map(Number); return parts.length === 2 && parts.every(Number.isFinite) ? null : "Enter x and y in pixels, separated by a space."; },
        apply: (value) => { const [x, y] = value.trim().split(/[\s,]+/).map(Number); this.host.changeLabel(label.id, { x, y }); }, onError: (message) => this.host.report(message, "error"),
      });
      setTip(text, "Click to change the text.");
      setTip(place, "The label's left end, at its baseline, in pixels of the result of the steps. Click to type x and y.");
      section.append(text, place);
    });
  }

  // MARK: steps

  /** The step list: what import changed, then each step with its enabled box, then Add step and Remove. */
  private renderSteps(doc: PlotDocument, image: ProjectImage): void {
    const ready = doc.ready(image.id);
    const section = this.section("Steps", "steps");
    if (ready?.decoded.conversions.length) {
      const row = createRow("On import", conversionText(ready.decoded.conversions));
      setTip(row, "Import made these changes to reach a grey or RGB image; the file is unchanged.");
      section.append(row);
    }
    const current = doc.currentStep.get(image.id);
    const problems = new Map((ready?.problems ?? []).map((problem) => [problem.id, problem.message]));
    // Each step is a part line (forge-shell 9.0.0): its number and name, its summary, and the eye that runs it or not;
    // a click, Enter or Space makes it current, a right-click opens its menu, and a drag reorders the list.
    const lines = image.steps.map((step, index) => {
      const problem = problems.get(step.id);
      const line = createPartLine({
        name: `${index + 1}. ${stepName(step)}`, selected: step.id === current,
        detail: problem ? "Not run" : stepSummary(step, (id) => doc.image(id)?.name ?? "a missing image", phaseNameIn(image.steps)),
        shown: step.enabled, onShow: (on) => this.host.setStepEnabled(step.id, on),
        select: () => { this.host.selectStep(step.id); this.focusCurrent = true; },
        menu: () => partMenu({
          actions: [{ label: "Step enabled", checked: step.enabled, action: () => this.host.setStepEnabled(step.id, !step.enabled) }],
          edit: [{ label: "Remove step", action: () => this.host.removeStep(step.id) }],
          arrange: [
            index > 0 ? { label: "Move step up", action: () => this.host.moveStep(index, index - 1) } : { label: "Move step up", title: "This is the first step." },
            index < image.steps.length - 1 ? { label: "Move step down", action: () => this.host.moveStep(index, index + 1) } : { label: "Move step down", title: "This is the last step." },
          ],
        }),
      });
      if (problem) setTip(line, problem);
      return line;
    });
    const list = createPartList("Steps", lines);
    if (!image.steps.length) list.append(createEmptyNote("No steps"));
    attachReorder(list, { items: () => [...list.querySelectorAll<HTMLElement>(".part-line")], axis: "y", onMove: (from, to) => this.host.moveStep(from, to) });
    section.append(list);
        const add = createButton({ label: "Add step", onClick: () => {
      const rect = add.getBoundingClientRect();
      showContextMenu(rect.left, rect.bottom + 2, addStepMenu((id) => this.host.addStep(id)), rect.top);
    } });
    add.disabled = !ready;
    setTip(add, ready ? "Add a step at the end of the list." : "The image must be shown before steps can be added.");
    const remove = createButton({ label: "Remove", disabled: !current, onClick: () => { if (current) this.host.removeStep(current); } });
    setTip(remove, "Remove the current step.");
    actionsFirst(section, createButtonGroup([add, remove]));
    if (this.focusCurrent) { this.focusCurrent = false; requestAnimationFrame(() => list.querySelector<HTMLElement>('.part-line[aria-selected="true"]')?.focus()); }

    const step = image.steps.find((item) => item.id === current);
    if (step) this.renderStep(image, step, traceShapes(ready ? ready.decoded.raster : workingShape(image.source), image.steps)[image.steps.indexOf(step)]);
  }

  /** Keyboard moves in the step list rebuild the inspector; the current row takes the focus back. */
  private focusCurrent = false;

  /** The parameters of the current step, for the image it receives (`before`). */
  private renderStep(image: ProjectImage, step: Step, before: Shape): void {
    const section = this.section(stepName(step), "step");
    const change = (patch: Partial<Step>) => this.host.changeStep(step.id, patch);
    const report = (message: string) => this.host.report(message, "error");
    const M = maxValue(before.bitDepth);
    const valueField = (label: string, key: string, value: number, unit: string, tip: string, invalid: string) => {
      const field = createUnitField({
        label, unit, value, format: unit ? formatPx : formatValue, parse: unit ? parsePx : parseValue,
        apply: (next) => change({ [key]: next } as Partial<Step>), reportError: report, invalidMessage: invalid,
      });
      setTip(field.row, tip);
      section.append(field.row);
    };
    if (step.type === "grey") {
      const row = selectField("Method", Object.entries(GREY_METHOD_LABELS), step.method, (method) => change({ method } as Partial<Step>));
      setTip(row, "Luminance weighs red, green and blue by 0.299, 0.587 and 0.114 (Rec. 601).");
      section.append(row);
    } else if (step.type === "8-bit") {
      const row = selectField("Mapping", Object.entries(MAPPING_LABELS), step.mapping, (mapping) => change({ mapping } as Partial<Step>));
      setTip(row, "Min-max stretches the image's own range to 0 to 255; a fixed range clips outside it.");
      section.append(row);
      // The range's ends apply only to a fixed range: left out otherwise, not greyed (Applies or absent).
      if (step.mapping === "range") {
        valueField("Low", "low", step.low, "", `The value that becomes 0, from 0 to ${M}.`, "Invalid low value. Enter a whole number.");
        valueField("High", "high", step.high, "", `The value that becomes 255, from 0 to ${M}.`, "Invalid high value. Enter a whole number.");
      }
    } else if (step.type === "crop") {
      const edit = createButton({ label: "Edit on image", onClick: () => this.host.editCrop() });
      setTip(edit, "Turn on the Crop tool: the image is shown uncropped with the box; drag the box, an edge or a corner to change it. Esc or the Select tool shows it cropped again.");
      actionsFirst(section, createButtonGroup([edit]));
      const input = createRow("Image", `${before.widthPx} × ${before.heightPx} px`);
      setTip(input, "The image this step receives; the image stays shown cropped unless the Crop tool is on.");
      section.append(input);
      valueField("X", "x", step.x, "px", "The left edge of the rectangle, in pixels of the image this step receives.", "Invalid X. Enter a whole number of pixels.");
      valueField("Y", "y", step.y, "px", "The top edge of the rectangle, in pixels of the image this step receives.", "Invalid Y. Enter a whole number of pixels.");
      valueField("Width", "width", step.width, "px", "The width of the rectangle, in pixels.", "Invalid width. Enter a whole number of pixels.");
      valueField("Height", "height", step.height, "px", "The height of the rectangle, in pixels.", "Invalid height. Enter a whole number of pixels.");
    } else if (step.type === "rotate") {
      section.append(selectField("Angle", Object.entries(TURN_LABELS), String(step.quarterTurns), (turns) => change({ quarterTurns: Number(turns) } as Partial<Step>)));
    } else if (step.type === "canvas") {
      const input = createRow("Image", `${before.widthPx} × ${before.heightPx} px`);
      setTip(input, "The image this step receives. A canvas of the same size with the image moved is a translation.");
      section.append(input);
      valueField("Width", "width", step.width, "px", "The canvas's width, in pixels.", "Invalid width. Enter a whole number of pixels from 1.");
      valueField("Height", "height", step.height, "px", "The canvas's height, in pixels.", "Invalid height. Enter a whole number of pixels from 1.");
      valueField("X", "x", step.x, "px", "Where the image's left edge goes on the canvas; negative cuts the left side off.", "Invalid X. Enter a whole number of pixels.");
      valueField("Y", "y", step.y, "px", "Where the image's top edge goes on the canvas; negative cuts the top off.", "Invalid Y. Enter a whole number of pixels.");
      valueField("Background", "value", step.value, "", `The value of the canvas outside the image, from 0 to ${M}, in every channel.`, "Invalid background. Enter a whole number.");
    } else if (step.type === "flip") {
      section.append(selectField("Axis", Object.entries(AXIS_LABELS), step.axis, (axis) => change({ axis } as Partial<Step>)));
    } else if (step.type === "levels") {
      this.levelSlider(section, step, "black", "Black point", 0, M, `Values at or below this become 0. From 0 to ${M}.`);
      this.levelSlider(section, step, "white", "White point", 0, M, `Values at or above this become ${M}. From 0 to ${M}.`);
      this.levelSlider(section, step, "gamma", "Gamma", GAMMA_MIN, GAMMA_MAX, "Above 1 brightens the middle values, below 1 darkens them.");
    } else if (step.type === "filter") {
      this.renderFilter(section, step, change, report);
    } else if (step.type === "fill") {
      section.append(createRow("Region", step.region.name));
      const area = selectField("Area", [["inside", "Inside the region"], ["outside", "Outside the region"]], step.outside ? "outside" : "inside", (value) => change({ outside: value === "outside" } as Partial<Step>));
      setTip(area, "Fill the region's pixels, or clear everything outside it.");
      section.append(area);
      this.numberRow(section, step.value, "Value", "", (value) => change({ value } as Partial<Step>), `The value given to every channel, from 0 to ${M}.`, `Invalid value. Enter a whole number from 0 to ${M}.`);
    } else if (step.type === "math") {
      const operation = selectField("Operation", Object.entries(MATH_LABELS), step.operation, (value) => change({ operation: value } as Partial<Step>));
      setTip(operation, `${MATH_TIPS[step.operation]} Results are rounded and kept from 0 to ${M}.`);
      section.append(operation);
      if (step.operation !== "log") this.numberRow(section, step.value, "Value", "", (value) => change({ value } as Partial<Step>), "The value the operation uses.", "Invalid value. Enter a number.");
    } else if (step.type === "contrast") {
      const method = selectField("Method", Object.entries(CONTRAST_LABELS), step.method, (value) => change({ method: value } as Partial<Step>));
      setTip(method, step.method === "normalize" ? "Stretch the values to the full range, leaving a few pixels saturated at each end." : "Spread the values so that each level holds about as many pixels.");
      section.append(method);
      if (step.method === "normalize") this.numberRow(section, step.saturated, "Saturated", "%", (saturated) => change({ saturated } as Partial<Step>), "The share of pixels pushed to 0 or the maximum, half at each end.", "Invalid percentage. Enter a number from 0 to below 100.");
    } else if (step.type === "calculator") {
      const doc = this.lastDoc!;
      const operation = selectField("Operation", CALCULATOR_OPERATIONS.map((op) => [op, CALCULATOR_LABELS[op]]), step.operation, (value) => change({ operation: value } as Partial<Step>));
      setTip(operation, `${CALCULATOR_TIPS[step.operation]} Results are rounded and kept from 0 to ${M}.`);
      section.append(operation);
      // An image that reads this one cannot be chosen, so that no image depends on itself.
      const choices = doc.project.images.filter((other) => other.id !== image.id && !dependencyCycle(doc.project.images, image.id, [{ type: "calculator", enabled: true, imageId: other.id }]));
      const other = selectField("Other image", [["", "Choose…"], ...choices.map((item) => [item.id, item.name] as [string, string])], step.imageId, (imageId) => change({ imageId } as Partial<Step>));
      setTip(other, "The image to combine with this one; the result of its own steps is read. It must have the same size, channels and depth.");
      section.append(other);
      const name = doc.image(step.imageId)?.name;
      const reads = createRow("Reads", name ? `${name}, after its steps` : "No image");
      setTip(reads, "This image's result depends on the other image: changing its steps changes this result. Its file is only read.");
      section.append(reads);
    } else if (step.type === "paste") {
      const name = this.lastDoc?.image(step.imageId)?.name;
      const pasted = createRow("Pasted image", name ?? "Missing");
      setTip(pasted, "Kept in the document; its result is read, never changed.");
      const into = createRow("Into", step.region.name);
      setTip(into, "Only the pixels inside this region change, from its top-left corner. The original file is unchanged.");
      section.append(pasted, into);
    } else if (step.type === "threshold") {
      this.renderThresholdStep(section, image, step);
    } else if (step.type === "mask") {
      renderMaskStep(section, step, thresholdStep(image.steps)?.phases ?? [], change, report);
    } else {
      section.append(createRow("Values", `${M} minus each value`));
    }
  }

  /** The Threshold step's parameters: its phases, how they are shown, and the current phase's range or colours. */
  private renderThresholdStep(section: HTMLElement, image: ProjectImage, step: Extract<Step, { type: "threshold" }>): void {
    const doc = this.lastDoc!, working = doc.ready(image.id)?.working ?? null;
    if (!step.enabled) {
      const off = createRow("Phases", `${step.phases.length}, off`);
      setTip(off, "The step is off, so no masks are made and every pixel is measured. Turn it on to see and change its phases.");
      section.append(off);
      return;
    }
    const phase = doc.phase(image);
    renderThreshold(section, {
      phases: stepPhases(image.steps), current: phase, working, mask: phase ? doc.mask(image.id, phase.id) : null, maskOf: (item) => doc.mask(image.id, item.id),
      coverage: doc.coverage(image.id), display: image.maskDisplay ?? "colours",
      addPhase: () => this.host.addPhase(), removePhase: (id) => this.host.removePhase(id), selectPhase: (id) => this.host.selectPhase(id),
      renamePhase: (id, name) => this.host.changePhase(id, { name }), setColour: (id, colour) => this.host.changePhase(id, { colour }), setDisplay: (mode) => this.host.setMaskDisplay(mode),
      set: (next) => this.host.setThreshold(next), beginPreview: () => this.host.beginPreview(), preview: (next) => this.host.previewThreshold(next), endPreview: (before) => this.host.endPreview(before),
      pickColour: () => this.host.pickColour(), pickFrom: (rgb, tolerance) => this.host.pickFrom(rgb, tolerance), sizeSelect: () => this.host.eyedropperSizeSelect(),
      report: (message) => this.host.report(message, "error"),
    });
  }

  /** A number typed in, with an optional unit, in the shared field layout. */
  private numberRow(section: HTMLElement, value: number, label: string, unit: string, apply: (value: number) => void, tip: string, invalid: string): void {
    const field = createUnitField({
      label, unit, value, format: (v, u) => (u ? `${v} ${u}` : String(v)), parse: (text) => parseNumber(text, unit),
      apply: (next) => (Number.isFinite(next) ? apply(next) : this.host.report(invalid, "error")), reportError: (message) => this.host.report(message, "error"), invalidMessage: invalid,
    });
    setTip(field.row, tip);
    section.append(field.row);
  }

  /** A filter step: its kind, then the options that kind reads (`FILTER_VALUES`). */
  private renderFilter(section: HTMLElement, step: Extract<Step, { type: "filter" }>, change: (patch: Partial<Step>) => void, report: (message: string) => void): void {
    const kind = selectField("Filter", Object.entries(FILTER_LABELS), step.filter, (filter) => change({ filter } as Partial<Step>));
    setTip(kind, FILTER_TIPS[step.filter]);
    section.append(kind);
    const numberField = (label: string, key: "radius" | "weight" | "threshold", unit: string, tip: string, invalid: string) => {
      const field = createUnitField({
        label, unit, value: step[key], format: (value, u) => (u ? `${value} ${u}` : String(value)), parse: (text) => parseNumber(text, unit),
        apply: (value) => change({ [key]: value } as Partial<Step>), reportError: report, invalidMessage: invalid,
      });
      setTip(field.row, tip);
      section.append(field.row);
    };
    const sigma = SIGMA_FILTERS.includes(step.filter);
    for (const key of FILTER_VALUES[step.filter]) numberField(...(key === "radius" && sigma ? FILTER_FIELDS.sigma : FILTER_FIELDS[key]));
    if (step.filter === "convolve") {
      const n = Math.round(Math.sqrt(step.kernel.length));
      const text = document.createElement("textarea");
      text.rows = Math.min(7, n);
      text.spellcheck = false;
      text.value = kernelText(step.kernel);
      text.setAttribute("aria-label", "Kernel");
      text.addEventListener("change", () => {
        const kernel = parseKernel(text.value);
        if (!kernel) { report("Invalid kernel. Enter an odd square of numbers, one row per line, such as 3 rows of 3."); text.value = kernelText(step.kernel); return; }
        change({ kernel } as Partial<Step>);
      });
      // A multiline field takes its own full-width row (the shell's area field).
      const row = createField("Kernel", text);
      row.classList.add("area");
      setTip(row, "One row per line, weights separated by spaces; applied as written, centred on each pixel.");
      section.append(row);
      const normalize = createCheckRow("Normalise", step.normalize, (on) => change({ normalize: on } as Partial<Step>));
      setTip(normalize, "Divide by the sum of the weights, when it is not 0, so the brightness stays the same.");
      section.append(normalize);
    }
  }

  /** A levels parameter as a shared slider row; its readout can be typed in. A drag is one undoable change. */
  private levelSlider(section: HTMLElement, step: Extract<Step, { type: "levels" }>, key: "black" | "white" | "gamma", label: string, min: number, max: number, tip: string): void {
    const gamma = key === "gamma";
    const format = gamma ? formatGamma : formatValue;
    let before = "";
    const { row, valueText, slider } = sliderRow(label, step[key], min, max, (value) => {
      const next = gamma ? Math.round(value * 100) / 100 : Math.round(value);
      valueText.textContent = format(next);
      this.host.previewStep(step.id, { [key]: next });
    }, true, [], {
      undo: { begin: () => { before = this.host.beginPreview(); }, end: () => this.host.endPreview(before) },
      reset: () => (key === "black" ? min : key === "white" ? max : 1),
    });
    valueText.textContent = format(step[key]);
    editableValue(valueText, () => format(step[key]), (text) => {
      const value = gamma ? parseGamma(text) : parseValue(text);
      if (!Number.isFinite(value)) { this.host.report(`Invalid ${label.toLowerCase()}. Enter ${gamma ? "a number above 0" : "a whole number"}.`, "error"); return false; }
      this.host.changeStep(step.id, { [key]: value });
      return true;
    }, label);
    setTip(row, tip);
    section.append(row);
  }

  /** Several images, below the Document section: their count, then the box around them on the work surface. */
  private renderSelection(selected: readonly { x: number; y: number; width: number; height: number; read?: unknown; series?: unknown }[]): void {
    const left = Math.min(...selected.map((image) => image.x)), top = Math.min(...selected.map((image) => image.y));
    const right = Math.max(...selected.map((image) => image.x + image.width)), bottom = Math.max(...selected.map((image) => image.y + image.height));
    const sheets = selected.filter((object) => object.read !== undefined).length, plots = selected.filter((object) => object.series !== undefined).length;
    const images = selected.length - sheets - plots;
    const plural = (n: number, noun: string) => (n ? `${n} ${noun}${n === 1 ? "" : "s"}` : "");
    const count = [plural(images, "image"), plural(sheets, "worksheet"), plural(plots, "plot")].filter(Boolean).join(", ");
    const kinds = [images, sheets, plots].filter(Boolean).length;
    this.section(kinds > 1 ? "Selection" : sheets ? "Worksheets" : plots ? "Plots" : "Images", "subject").append(createRow("Selected", count));
    renderPlacement(this.section("Placement", "placement"), {
      noun: "the box around the selection", box: { x: left, y: top, width: right - left, height: bottom - top }, report: (message) => this.host.report(message, "error"),
    });
  }
}
