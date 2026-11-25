// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The interface of PlotForge: the shell's frame (menus, tool strip, document tabs, panels, Terminal, Messages, status
// bar, welcome screen, Help dialogs) around the work surface, where the images of a document are placed on the dot
// grid, each shown as the result of its step list. Menus, toolbar, keys and Terminal run the same actions (`run`,
// `stepAction`). Original images are only read.
import config from "../../forge.config.json";
import type { ForgeDesktopBridge } from "forge-shell/desktop/bridge";
import { menuShortcutGroups, showShortcuts, showWhatsNew, type InfoOptions } from "forge-shell/app/about";
import { showAbout, showLicenses } from "./about";
import { createBottomTabs } from "forge-shell/app/bottom-tabs";
import { consoleTabCommand } from "forge-shell/app/console-tabs";
import { createTextInputState } from "forge-shell/app/text-input";
import { exportFiles, type ExportHost } from "forge-shell/app/export-files";
import { existsRow, formatRow, qualityRow, resolutionRow } from "forge-shell/app/export-settings";
import { generalPage, showSettings, terminalPage, updatesPage, visiblePages, type SettingRow, type SettingsPage } from "forge-shell/app/settings-dialog";
import { commandHelp, generalHelp, helpAlias, invalidUsage } from "forge-shell/app/command-help";
import { moveItem } from "forge-shell/app/content-selection";
import { applyDesktopClasses } from "forge-shell/app/desktop-classes";
import { askToSave, askToSaveAll } from "forge-shell/app/dialogs";
import { closeDocumentTab, confirmWindowClose, hasUnsavedWork, insertDocument, untitledName } from "forge-shell/app/documents";
import { createEmptyState } from "forge-shell/app/empty-state";
import { showUpdateNotice } from "forge-shell/app/updates";
import { openBrowserFiles } from "forge-shell/app/file-open";
import { attachFileDrop } from "forge-shell/app/file-drop";
import { saveDocument } from "forge-shell/app/file-save";
import { listNumber, numberedItem } from "forge-shell/app/listing";
import { setReply, stateReply, takesReply } from "forge-shell/app/replies";
import { MessageLog, MessagesPanel, type MessageKind } from "forge-shell/app/messages";
import { drawsMenubar, renderMenubar, shortcutText, titleBarColors, collectShortcuts, type MenuNode } from "forge-shell/app/menus";
import { createPanelLayout } from "forge-shell/app/panel-layout";
import { settingsStorageKey, terminalHistoryStorageKey, terminalPreferencesStorageKey } from "forge-shell/app/profile";
import { blockStorageKey, migrateBlockStorage } from "forge-shell/app/block-storage";
import { installScrollbars } from "forge-shell/app/scrollbars";
import { installTextCaret } from "forge-shell/app/text-caret";
import { createTerminalPreferences } from "forge-shell/app/terminal-preferences";
import { askToRecover, createAutosave, createRecentFiles, createRecovery, parseAutosave, type AutosaveChoice } from "forge-shell/app/saving";
import { createSettingsStore } from "forge-shell/app/settings";
import { DEFAULT_DATA_PALETTE, dataPaletteOf } from "forge-shell/app/data-palettes";
import { fontSettingRow } from "forge-shell/app/font-choice";
import { createHealthTracker, healthCommand, healthPage } from "forge-shell/app/health";
import { setWindowBusy } from "forge-shell/app/busy-cursor";
import { askExternalChange, externalAction } from "forge-shell/app/external-change";
import { runSharedCommand, type StandardAction } from "forge-shell/app/shared-commands";
import { applyAppearance, APPEARANCES, shellPreferenceCommand, type Appearance } from "forge-shell/app/shell-preferences";
import { shareSettings } from "forge-shell/app/shared-settings";
import { dataColourFromWord, dataColourWords } from "forge-shell/app/data-colour";
import { StatusBar } from "forge-shell/app/status-bar";
import { DocumentTabs } from "forge-shell/app/tabs";
import { TerminalPanel, type ConsoleListItem, type ConsoleResult } from "forge-shell/app/terminal";
import { setTip } from "forge-shell/app/tips";
import { numberFormatFromWords, numberFormatWords, NUMBER_FORMAT_WORDS } from "forge-shell/app/number-format";
import { validateName } from "forge-shell/app/rename";
import { showContextMenu, showFieldPopover, type MenuEntry } from "forge-shell/app/context-menu";
import { TOOL_ICONS, UI_ICONS } from "forge-shell/app/tool-icons";
import { standardItem } from "forge-shell/app/standard-items";
import { createToolStrip } from "forge-shell/app/tool-strip";
import { createFlyoutGroup } from "forge-shell/app/tool-flyout";
import { createToolModes } from "forge-shell/app/tool-modes";
import { createEyedropper, EYEDROPPER_ID } from "forge-shell/app/eyedropper";
import { installWorkspaceKeys } from "forge-shell/app/workspace-keys";
import type { PlotForgeBridge } from "../desktop/plotforge-bridge";
import {
  basename, crc32, dirname, IMAGE_EXTENSIONS, isImagePath, maxValue, newProjectImage, newStep, parseProject, pixelAt, placeNew, PROJECT_EXTENSION, resultSize,
  serializeProject, stem, traceShapes, workingShape, type PixelValue, type ProjectImage, type Step,
  formatArea, formatLength, hullOf, isBox, maskCount, newRoiId, newRoiName, roiArea, roiMask, roiPerimeter, roiProblem, type Roi, type RoiType,
  thresholdProblem, type Threshold, type ThresholdMethod, measureRecord, newResultId, resultsCsv, xyCoordinatesCsv, xyProblem, cellValue, columnHeading, imagePixels, type MeasureKey, type ResultRow,
  BUILT_IN_EXPORT, BUILT_IN_IMAGE, cleanExportSettings, cleanImageSettings, effective, MASK_COLOURS, parseCalibration, resetOverride, setOverride, type ImageSettings,
  EXPORT_FORMATS, EXPORT_FORMAT_LIST, DEFAULT_EXPORT, type ExportOptions, type OverwriteChoice,
  calibrationProblem, directScale, formatMeasure, knownLength, LENGTH_UNITS, positionOf, resolveCalibration, scaleAfterSteps, scaleOf, type Calibration, type CropBox, type ImageCalibration, type Scale,
  cropFromRoi, followCalibrationLine, lineCalibration, moveRoi, type LengthUnit,
  DEFAULT_BINS, histogramOf, laneProfile, lineProfile, peakArea, type Profile,
  scaleBarFor, isScaleBarLength, scaleBarNumber, MATH_OPERATIONS, mathProblem, type MathOperation, DEFAULT_DISPLAY, autoRange, displayProblem, type DisplaySettings, type LutName,
  FILTER_DEFAULTS, FILTER_KINDS, FILTER_VALUES, filterProblem, type FilterKind, maskOperationProblem, type MaskOperationKind, MASK_OPERATION_KINDS, type MaskStep,
  insertIndex, rangeOnly, stepPhases, thresholdStep, type Raster,
  objectAt, newPhase, phaseNameProblem, type MaskDisplay, type Phase, rangesAround, sampleColour, newLabelId, labelProblem, roiBounds, measureRegion, labelledPeaks, dependencyCycle, CALCULATOR_OPERATIONS, COLOUR_MODELS, MODEL_LIMITS,
  newSheetSize, sheetAxes, SHEET, DATA_FORMAT_LABELS, DEFAULT_READ, DELIMITER_NAMES, describeData, isDataPath, newProjectData, parseRangeInput, readData, ROLE_NAMES, PLOTTED_ROLES, type ColumnRole, type DataReadOptions, type Delimiter, type ProjectData,
  PLOT_KINDS, RANGE_ROLES, RANGE_ROLE_NAMES, TEXT_ROLES, selectionPlan, type RangeRole,
  newPlot, nextPlotId, pointInfo, pointLines, resolvePlot, seriesName, rangeName, seriesReference, addSeries, namesFromFirstRow, nameProblem, newNamedRange, rangeLabel, sameCells, selectionRanges, cellAt, type SheetSelection, parseReference, applyTemplate, batchPlots, parseTemplate, plotSheet, plotTemplate, templateRecord, type PlotTemplate, newFit, refit, FIT_NAMES, FIT_KINDS, FIT_GROUPS, FIT_WEIGHTS, hasOrder, isSmoothing, fitParameterNames, type FitKind, type FitWeights, type SeriesFit, cellsKey, cellsText, snapValue, columnLetterOf, splitUnit, type CellRange, type DataTable, type NamedRange, PLOT_EXPORT_DEFAULT, PLOT_EXPORT_FORMATS, PLOT_EXPORT_NAMES, type PlotExportFormat, rowsText, selectionEmpty, selectionPairs, selectedColumns, selectionText, columnLetters, PLOT_KIND_NAMES, PLOT_SIZE, setDataPalette, currentDataPalette, AXIS_FORMAT_NAMES, type AxisFormat, axisNumbers, LABEL_ANGLES, type LabelAngle, axisTitle, tickLabel, scaleLabel, type AxisScale, type LineConnect, type LineDash, type PlotKind, type ProjectPlot, type SymbolShape,
  densityProblem, describeFit, fitDensity, DENSITY_FITS, type DensityStandard, type TextLabel, type ColourModel3, type Range, type CalculatorOperation,
  parentPart, parsePart, partName, type PlotPart, SERIES_AXES, SERIES_AXIS_NAMES, SERIES_X_AXES, SERIES_X_AXIS_NAMES, type PlotSeries,
  LEGEND_PLACES, LEGEND_BACKS, type LegendPlace, type LegendBack,
  BUILT_IN_PLOT_TEXT, cleanPlotText, PLOT_TEXT_SIZES, plotText, setPlotText, type PlotText,
  CALLOUT_NAMES, CALLOUT_TEXTS, calloutAt, setCallout, type CalloutText, pointRow, chosenPoints, swapAxes,
  normalAngle, keepTurnedPlace,
} from "../engine";
import { calibrationSummary, parseUnit, pixelSizeText, startCalibration } from "./calibration-view";
import { ACTIONS, BLOCKS, bindItems, WORKSPACE, CATALOG, COMMANDS, completions, ITEM_VERBS, PANES, PROFILE, REPOSITORY, runItemVerb, STEP_ADD_FORMS, STEP_PARAMETERS, valueProblem } from "./commands";
import { setObjectShadows } from "./crisp";
import { decode, exportPicture, exportPng, loadImage, processed, shownPng, type ScaleBarDrawing } from "./images";
import { ADD_STEP_ITEMS, conversionText, FILTER_LABELS, GREY_METHOD_LABELS, phaseNameIn, STEP_NAMES, stepName, stepSummary } from "./step-wording";
import { addStepMenu, COLOUR_LABELS, fileSize, FORMAT_LABELS, Inspector } from "./inspector";
import { partMenu, workspaceMenu } from "forge-shell/app/properties";
import { EXPORT_KEY, IMPORT_KEY, plotMenus } from "./menu-bar";
import { PlotDocument, type ImageState, type SurfaceObject } from "./plot-document";
import { isPlotTool, Workspace, ZOOM_STEP, type CropEdit, type DrawnRoi, type Tool } from "./workspace";
import { CROP_ICON, CROP_KEY, SELECT_ICON, CROP_LABEL, CROP_MODE_OBJECT, PLOT_CANVAS_TOOLS, ROI_LABELS, ROI_MODE_OBJECTS, ROI_TOOLS, SELECT_KEY } from "./roi-view";
import { canvasToolForKey } from "forge-shell/app/canvas-tools";
import { LUT_LABELS } from "./display-view";
import { picker, startThreshold, thresholdSummary, type ThresholdChoice } from "./threshold-view";
import { cellText, MEASURE_KEY, measurementMenu, ResultsPanel, visibleColumns } from "./results-view";
import { addFitMenu, chooseFit as makeCurrentFit, currentFit, documentFits, fitInfoLines, fitName, fitStatus, modelName, type FitEntry } from "./fitting-view";
import { DATA_ACCEPT, inflateRaw, STATUS_TEXT, tableKey, type DataState } from "./data-view";
import { parseAxisValue, plotExportBytes } from "./plot-view";
import { createHoverDetails } from "forge-shell/app/hover-details";
import { PLOT_KIND_ICONS, PLOT_TOOL_KEYS, plotKindForKey } from "./plot-icons";
import { FORMAT_LABELS as EXPORT_FORMAT_LABELS, MASK_COLOUR_LABELS, SCALE_BAR_LABELS, SCALE_BAR_SIZE_LABELS, SCALE_BAR_STYLE_LABELS, SCALE_BAR_TIPS, scaleBarBlockChoices, scaleBarLengthChoices, THRESHOLD_MODE_LABELS } from "./settings-view";

declare const __APP_LOGO__: string;
declare const __FORGE_VERSION__: string;
declare global { interface Window { forge?: ForgeDesktopBridge<"pfg">; plotforge?: PlotForgeBridge } }

const desktop = window.forge ?? null;
const files = window.plotforge ?? null;
const platform = desktop?.platform ?? (navigator.platform.includes("Mac") ? "darwin" : "browser");
const mac = platform === "darwin";
const $ = (id: string) => document.getElementById(id)!;
const info: InfoOptions = { productName: config.identity.name, legalName: config.identity.productName, summary: config.identity.summary, author: config.identity.author, purpose: config.identity.purpose, logo: __APP_LOGO__.trimEnd(), version: __FORGE_VERSION__ };
const EXT = PROJECT_EXTENSION;
const OPEN_ACCEPT = [EXT, ...IMAGE_EXTENSIONS].map((extension) => `.${extension}`).join(",") + `,${DATA_ACCEPT}`;
const IMPORT_ACCEPT = IMAGE_EXTENSIONS.map((extension) => `.${extension}`).join(",") + `,${DATA_ACCEPT}`;

// MARK: settings

interface Settings {
  appearance: Appearance;
  showInspector: boolean; inspectorSide: "left" | "right"; inspectorWidth: number;
  showBottomPanel: boolean; bottomPanelHeight: number; terminalFontSize: number;
  autosave: AutosaveChoice;
  /** The app layer of the export settings (format, JPEG quality, overlays, if the file exists); a key it leaves out takes the built-in value. */
  exportOptions: Partial<ExportOptions>;
  /** The app layer of the image settings (IMAGE-ANALYSIS.md, Settings layers); a key it leaves out takes the built-in value. */
  imageSettings: Partial<ImageSettings>;
  /** The app's default calibration, beneath each document's; null: pixels. */
  appCalibration: Calibration | null;
  /** The inspector folds a person changed; others keep their defaults. */
  inspectorFolds: Record<string, boolean>;
  /** Plot templates (plot-template.ts), as stored records; a damaged one is left out when read. */
  plotTemplates: unknown[];
  /** The template new plots take, by name; null: the default look. */
  newPlotTemplate: string | null;
  /** The data palette series are coloured from (the shell's data-palettes; Settings › General › Data colours). */
  dataPalette: string;
  /** Plots' text and size (Settings › Plots): sizes, whether a plot's look scales with it, and fonts a person changed; the rest are built in (plot-text.ts). */
  plotText: Partial<PlotText>;
  /** How plots export (Settings › Export › Plots): format and resolution a person changed; the rest are PNG at 300 dpi. */
  plotExport: Partial<PlotExport>;
  /** Whether images, worksheets and plots cast shadows on the work surface (Settings › General › Object shadows); never in exports. */
  objectShadows: boolean;
  /** Whether the item under the pointer is described in a card beside it (shell hover details; Settings › General › Show hover card). */
  hoverCard: boolean;
  /** Whether the shell's caret in text fields fades as it blinks (forge-shell text-caret; Settings › General). */
  smoothFieldCaret: boolean;
}
interface PlotExport { format: PlotExportFormat; dpi: number }
/** The plot export settings a person changed, keeping only values that can be used. */
function cleanPlotExport(raw: unknown): Partial<PlotExport> {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    ...(PLOT_EXPORT_FORMATS.includes(item.format as PlotExportFormat) ? { format: item.format as PlotExportFormat } : {}),
    ...(typeof item.dpi === "number" && Number.isInteger(item.dpi) && item.dpi >= 72 && item.dpi <= 1200 ? { dpi: item.dpi } : {}),
  };
}
const DEFAULTS: Settings = { appearance: "dark", showInspector: true, inspectorSide: "right", inspectorWidth: 246, showBottomPanel: true, bottomPanelHeight: 246, terminalFontSize: 12, autosave: "off", exportOptions: {}, imageSettings: {}, appCalibration: null, inspectorFolds: {}, plotTemplates: [], newPlotTemplate: null, dataPalette: DEFAULT_DATA_PALETTE, plotText: {}, plotExport: {}, objectShadows: true, hoverCard: true, smoothFieldCaret: true };
/** A stored object of string keys, keeping only values of the expected kind. */
function stringRecord<T>(raw: unknown, ok: (value: unknown) => value is T): Record<string, T> {
  return raw && typeof raw === "object" ? Object.fromEntries(Object.entries(raw).filter(([, value]) => ok(value))) as Record<string, T> : {};
}
const number = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
// Recent files and update preferences moved under their blocks in forge-shell 5.0.0; move them once, before any store.
migrateBlockStorage(PROFILE);
const store = createSettingsStore<Settings>(settingsStorageKey(PROFILE), DEFAULTS, (stored) => ({
  appearance: (APPEARANCES as readonly unknown[]).includes(stored.appearance) ? stored.appearance as Appearance : "dark",
  showInspector: stored.showInspector !== false, inspectorSide: stored.inspectorSide === "left" ? "left" : "right",
  inspectorWidth: number(stored.inspectorWidth, DEFAULTS.inspectorWidth), showBottomPanel: stored.showBottomPanel !== false,
  bottomPanelHeight: number(stored.bottomPanelHeight, DEFAULTS.bottomPanelHeight), terminalFontSize: number(stored.terminalFontSize, 12),
  autosave: parseAutosave(stored.autosave) ?? "off",
  exportOptions: cleanExportSettings(stored.exportOptions),
  imageSettings: cleanImageSettings(stored.imageSettings),
  appCalibration: (() => { try { return stored.appCalibration ? parseCalibration(stored.appCalibration) : null; } catch { return null; } })(),
  inspectorFolds: stringRecord(stored.inspectorFolds, (value): value is boolean => typeof value === "boolean"),
  plotTemplates: Array.isArray(stored.plotTemplates) ? stored.plotTemplates.filter((item: unknown) => parseTemplate(item) !== null) : [],
  newPlotTemplate: typeof stored.newPlotTemplate === "string" ? stored.newPlotTemplate : null,
  // The palette was PlotForge's own until forge-shell 4.7.0 (`plotPalette`, for new plots); its former ids still open theirs.
  dataPalette: dataPaletteOf(typeof stored.dataPalette === "string" ? stored.dataPalette : typeof stored.plotPalette === "string" ? stored.plotPalette : undefined).id,
  plotText: cleanPlotText(stored.plotText),
  plotExport: cleanPlotExport(stored.plotExport),
  objectShadows: stored.objectShadows !== false,
  // Before 4.12.0 the card was PlotForge's own point tip (pointTips); a tip turned off stays off.
  hoverCard: typeof stored.hoverCard === "boolean" ? stored.hoverCard : stored.pointTips !== false,
  smoothFieldCaret: stored.smoothFieldCaret !== false,
}));
const { settings } = store;
const recent = createRecentFiles(blockStorageKey(PROFILE, "documents", "recent"));
/** Drafts of unsaved edits, offered again after a crash. */
const recovery = createRecovery(blockStorageKey(PROFILE, "documents", "drafts"));

/** Health: active use, recorded on this device only, and the break reminder (Settings › Health, `health reminder`). */
const health = createHealthTracker({ storageKey: `${config.identity.id}.health` });

/**
 * The window's busy cursor while files are read or made (a workbook parsed, images decoded, an export drawn): the
 * window still takes input. Nested work keeps it until the outermost ends.
 */
let busyDepth = 0;
async function busy<T>(work: () => Promise<T>): Promise<T> {
  if (busyDepth++ === 0) setWindowBusy("progress");
  try { return await work(); } finally { if (--busyDepth === 0) setWindowBusy(null); }
}

// MARK: documents

const documents: PlotDocument[] = [];
let active: PlotDocument | null = null;
/** Messages belong to the active document; this log is used while none is open. */
const welcomeLog = new MessageLog();
const logs = new WeakMap<PlotDocument, MessageLog>();
const logOf = (doc: PlotDocument | null) => (doc ? logs.get(doc) ?? logs.set(doc, new MessageLog()).get(doc)! : welcomeLog);
/** The name the first Save offers, for a document made from an image. */
const suggestedNames = new WeakMap<PlotDocument, string>();

function activate(doc: PlotDocument | null): void {
  if (doc !== active) { active = doc; selectBottom("terminal"); }
  refresh();
}

/** Add a document as the last tab (`insertDocument`); a pristine blank Untitled tab is replaced by an opened file. */
function addDocument(doc: PlotDocument, replaceBlank: boolean): void {
  if (!active) documents.push(doc);
  else insertDocument(documents, active, doc, replaceBlank && !active.path && !active.dirty && !active.project.images.length);
  activate(doc);
}

function createDocument(): void {
  addDocument(new PlotDocument(untitledName(documents)), false);
}

/** File › Open: documents and images. An image opens as a new document that links to it. */
async function open(): Promise<void> {
  if (files) {
    const chosen = await files.openDialog();
    const images = chosen.filter((file) => isImagePath(file.path));
    const data = chosen.filter((file) => isDataPath(file.path));
    for (const file of chosen) if (file.text !== undefined) openDocumentText(file.path, file.text);
    if (images.length) await openImagesAsDocument(images.map((file) => ({ path: file.path, file: basename(file.path) })));
    if (data.length) await openDataAsDocument(data.map((file) => ({ path: file.path, file: basename(file.path) })));
    return;
  }
  openBrowserFiles(OPEN_ACCEPT, async (file) => {
    if (file.name.toLowerCase().endsWith(`.${EXT}`)) openDocumentText(null, await file.text(), file.name);
    else if (isDataPath(file.name)) await openDataAsDocument([{ path: null, file: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }]);
    else await openImagesAsDocument([{ path: null, file: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }]);
  });
}

async function openRecent(path: string): Promise<void> {
  if (!files) return;
  try { openDocumentText(path, await files.readDocument(path)); }
  catch (error) { recent.remove(path); refreshMenus(); report(`Couldn't open ${basename(path)}: ${reason(error)}`, "error"); }
}

/** What each saved document's file held when PlotForge last read or wrote it, to tell a change made outside from its own. */
const onDisk = new WeakMap<PlotDocument, string>();

/**
 * When the window comes back, each saved document is compared with its file: a change made outside PlotForge is taken
 * at once while the document has no unsaved edits, and asked about when it has (Reload, or Keep mine to replace the
 * file at the next save). Desktop only; one check at a time.
 */
let checkingDisk = false;
async function checkOutsideChanges(): Promise<void> {
  if (!files || checkingDisk) return;
  checkingDisk = true;
  try {
    for (const doc of [...documents]) {
      const known = onDisk.get(doc);
      if (!doc.path || known === undefined || !documents.includes(doc)) continue;
      let text: string;
      try { text = await files.readDocument(doc.path); } catch { continue; }
      const action = externalAction(text, known, doc.dirty ? serializeProject(doc.project, doc.path) : known);
      if (action === "none") continue;
      if (action === "ask") {
        activate(doc);
        if (await askExternalChange(doc.name, config.identity.name) === "keep") { onDisk.set(doc, text); continue; }
      }
      try {
        doc.replaceFromDisk(parseProject(text, doc.path));
        onDisk.set(doc, text);
        recovery.clear(doc.draftKey);
        void loadLinkedImages(doc);
        void loadLinkedData(doc);
        refresh();
        report(`${doc.name} changed outside ${config.identity.name}; its new version is shown. Undo goes back.`, "info", doc);
      } catch (error) { report(`${doc.name} changed outside ${config.identity.name}, but couldn't be read: ${reason(error)}`, "warning", doc); }
    }
  } finally { checkingDisk = false; }
}
window.addEventListener("focus", () => void checkOutsideChanges());

/** Open a document from its text; a document already open is shown instead. */
function openDocumentText(path: string | null, text: string, browserName?: string): void {
  const existing = path ? documents.find((doc) => doc.path === path) : undefined;
  if (existing) { activate(existing); return; }
  const name = basename(path ?? browserName ?? `Untitled.${EXT}`);
  try {
    const doc = new PlotDocument(name, path, parseProject(text, path));
    if (!path) doc.markSaved(null);
    else onDisk.set(doc, text);
    addDocument(doc, true);
    if (path) { recent.add(path); desktop?.addRecentDocument(path); }
    void loadLinkedImages(doc);
    void loadLinkedData(doc);
  } catch (error) {
    report(`Couldn't open ${name}: ${reason(error)}`, "error");
  }
}

/** An image to add: a linked file, or (`embed`) bytes kept inside the document, as a pasted image is. */
interface IncomingImage { path: string | null; file: string; bytes?: Uint8Array; embed?: boolean }

/**
 * Edit › Paste (Cmd+V) outside a text field: an image on the clipboard becomes a new image kept inside the document,
 * since it has no file of its own; with no document open, a new one is made for it.
 */
function pasteImage(event: ClipboardEvent): void {
  if (typing() || document.activeElement?.closest?.("#terminal-pane")) return;
  const hasImage = [...(event.clipboardData?.types ?? [])].some((type) => type.startsWith("image/") || type === "Files");
  if (active && pastesObjects(event.clipboardData?.getData("text/plain"), hasImage)) { event.preventDefault(); report(pasteObjects(active), "info"); return; }
  const file = [...(event.clipboardData?.files ?? [])].find((item) => /^image\/(png|jpeg|tiff)$/.test(item.type));
  if (!file) {
    if ([...(event.clipboardData?.types ?? [])].some((type) => type.startsWith("image/") || type === "Files")) report("The clipboard holds no PNG, JPEG or TIFF image to paste.", "error");
    return;
  }
  event.preventDefault();
  void file.arrayBuffer().then((buffer) => pasteBytes(new Uint8Array(buffer), file.type));
}
document.addEventListener("paste", pasteImage);

/** A pasted image: kept inside the open document, or a new one when none is open. */
function pasteBytes(bytes: Uint8Array, type: string): void {
  const extension = type === "image/jpeg" ? "jpg" : type === "image/tiff" ? "tif" : "png";
  const incoming = [{ path: null, file: `Pasted.${extension}`, bytes, embed: true }];
  if (active) void addImages(active, incoming);
  else void openImagesAsDocument(incoming);
}

/** The toolbar's Paste: it reads the clipboard itself, since a click has no paste event. */
async function pasteFromClipboard(): Promise<void> {
  try {
    // A clipboard that cannot be read (no permission) pastes the copied objects, the likelier intent inside PlotForge.
    const text = objectClip ? await navigator.clipboard.readText().catch(() => null) : "";
    if (active && objectClip && (text === null || pastesObjects(text))) { report(pasteObjects(active), "info"); return; }
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((kind) => /^image\/(png|jpeg|tiff)$/.test(kind));
      if (type) { pasteBytes(new Uint8Array(await (await item.getType(type)).arrayBuffer()), type); return; }
    }
    report("The clipboard holds no PNG, JPEG or TIFF image to paste.", "error");
  } catch (error) {
    report(`Couldn't read the clipboard: ${reason(error)}`, "error");
  }
}

/**
 * Cut: the selected objects go on the object clipboard and leave the document, as one undoable edit. In a text field,
 * with text selected, or with nothing selected, Cut is the text's own.
 */
async function cut(): Promise<void> {
  const doc = active;
  if (typing() || window.getSelection()?.toString() || !doc?.selection.size) { document.execCommand("cut"); return; }
  const said = await copyObjects(doc);
  if (!said) return;
  removeSelection(doc);
  report(`${said.replace(/^Copied/, "Cut")} Paste puts it back; Undo too.`, "info");
}
document.addEventListener("cut", (event) => {
  if (typing() || window.getSelection()?.toString() || !active?.selection.size) return;
  event.preventDefault();
  void cut();
});

/**
 * Duplicate the selected images: each copy links the same original (or keeps the same pasted bytes) with its steps,
 * calibration, regions, threshold, settings and display, named and placed as a new image; the copies are selected.
 */
function duplicateImages(): void {
  const doc = active;
  if (!doc?.selection.size) return;
  const originals = doc.selectedImages();
  const plots = doc.project.plots.filter((plot) => doc.selection.has(plot.id));
  const copies: ProjectImage[] = [], plotCopies: ProjectPlot[] = [];
  doc.edit((project) => {
    for (const image of originals) {
      const { x, y } = placeNew([...project.images, ...project.data, ...project.plots], project.grid.spacing);
      const fresh = newProjectImage(project, image.path, image.file, image.source, x, y);
      const copy: ProjectImage = { ...structuredClone({ ...image, embedded: undefined }), id: fresh.id, name: `${image.name} copy`, x: fresh.x, y: fresh.y };
      if (image.embedded) copy.embedded = image.embedded; else delete copy.embedded;
      const taken = new Set(project.images.map((other) => other.name.toLowerCase()));
      for (let n = 2; taken.has(copy.name.toLowerCase()); n++) copy.name = `${image.name} copy ${n}`;
      project.images.push(copy);
      copies.push(copy);
      const ready = doc.ready(image.id);
      if (ready) doc.images.set(copy.id, processed(ready.decoded, copy.steps, copy.display));
    }
    // A plot's copy reads the same columns, with its own name, placed as a new object is.
    for (const plot of plots) {
      const place = placeNew([...project.images, ...project.data, ...project.plots], project.grid.spacing);
      const copy: ProjectPlot = { ...structuredClone(plot), id: nextPlotId(project.plots), name: `${plot.name} copy`, ...place };
      const taken = new Set(project.plots.map((other) => other.name.toLowerCase()));
      for (let n = 2; taken.has(copy.name.toLowerCase()); n++) copy.name = `${plot.name} copy ${n}`;
      project.plots.push(copy);
      plotCopies.push(copy);
    }
  });
  doc.selection = new Set([...copies.map((image) => image.id), ...plotCopies.map((plot) => plot.id)]);
  keepDraft(doc);
  autosave.edited(doc);
  refresh();
  const total = copies.length + plotCopies.length;
  if (!total) return;
  report(total === 1 ? `Duplicated ${originals[0]?.name ?? plots[0].name} as ${copies[0]?.name ?? plotCopies[0].name}.` : `Duplicated ${total} objects.`, "info");
}

// MARK: the object clipboard

/**
 * Objects copied or cut on the work surface (2026-11-19): images, worksheets and plots, with what makes them show at
 * once when pasted (a decoded image, a read table), the worksheets a copied plot reads (`carried`, pasted only into
 * another document that lacks them) and the names of the copied worksheets' cells. The system clipboard holds a line of
 * text that names them; a paste whose text is that line pastes these objects, so that anything copied elsewhere since
 * pastes as itself. It lives for the session and crosses document tabs.
 */
interface ObjectClip {
  marker: string; source: PlotDocument;
  /** Whether the marker reached the system clipboard; when it could not, a paste with no image pastes these objects. */
  written: boolean;
  images: { image: ProjectImage; state: ImageState | undefined }[];
  data: { link: ProjectData; state: DataState | undefined; carried: boolean }[];
  plots: ProjectPlot[]; ranges: NamedRange[];
}
let objectClip: ObjectClip | null = null;

/** The cells a plot reads, by worksheet id. */
const plotSheets = (plot: ProjectPlot) => plot.series.flatMap((series) => [series.x, series.y, series.error, series.labels].flatMap((cells) => (cells ? [cells.data] : [])));

/** Copy the selected objects to the object clipboard; returns what was said. */
async function copyObjects(doc: PlotDocument): Promise<string | null> {
  const images = doc.selectedImages(), plots = doc.project.plots.filter((plot) => doc.selection.has(plot.id));
  const chosen = new Set(doc.project.data.filter((link) => doc.selection.has(link.id)).map((link) => link.id));
  const read = new Set(plots.flatMap(plotSheets));
  const data = doc.project.data.filter((link) => chosen.has(link.id) || read.has(link.id))
    .map((link) => ({ link: structuredClone(link), state: doc.tables.get(link.id), carried: !chosen.has(link.id) }));
  const names = [...images.map((image) => image.name), ...data.filter((item) => !item.carried).map((item) => item.link.name), ...plots.map((plot) => plot.name)];
  if (!names.length) return null;
  objectClip = {
    marker: `PlotForge: ${names.join(", ")}`, source: doc, written: false,
    images: images.map((image) => ({ image: { ...structuredClone({ ...image, embedded: undefined }), ...(image.embedded ? { embedded: image.embedded } : {}) }, state: doc.images.get(image.id) })),
    data, plots: structuredClone(plots), ranges: structuredClone(doc.project.ranges.filter((name) => data.some((item) => item.link.id === name.data))),
  };
  try { await navigator.clipboard.writeText(objectClip.marker); objectClip.written = true; } catch { /* the objects still paste inside PlotForge from this session's clipboard */ }
  return names.length === 1 ? `Copied ${names[0]}.` : `Copied ${names.length} objects.`;
}

/** A name not among `taken` (lower case): the name, or the name with " copy", " copy 2" … when asked to differ. */
function freeName(name: string, taken: Set<string>, copy: boolean): string {
  let next = copy ? `${name} copy` : name;
  for (let n = 2; taken.has(next.toLowerCase()); n++) next = `${name} copy${n === 2 && !copy ? "" : ` ${n}`}`;
  taken.add(next.toLowerCase());
  return next;
}

/**
 * Paste the object clipboard into a document as one undoable edit. In the document it came from, the copies stand two
 * grid steps down and right of the originals and read the same worksheets; in another, the group keeps its arrangement
 * right of everything, and a pasted plot brings the worksheets it reads unless the document links the same file.
 * The pasted objects are selected.
 */
function pasteObjects(doc: PlotDocument): string {
  const clip = objectClip!;
  const same = clip.source === doc, spacing = doc.project.grid.spacing;
  const pasted: string[] = [];
  doc.edit((project) => {
    const boxes = [...clip.images.map((item) => item.image), ...clip.data.filter((item) => !item.carried || !same).map((item) => item.link), ...clip.plots];
    const left = Math.min(...boxes.map((box) => box.x)), top = Math.min(...boxes.map((box) => box.y));
    const at = same ? { x: left + 2 * spacing, y: top + 2 * spacing } : placeNew([...project.images, ...project.data, ...project.plots], spacing);
    const shift = { dx: at.x - left, dy: at.y - top };
    const sheets = new Map<string, string>();
    const sheetNames = new Set(project.data.map((link) => link.name.toLowerCase()));
    for (const { link, state, carried } of clip.data) {
      if (carried && same) { sheets.set(link.id, link.id); continue; }
      const linked = carried ? project.data.find((other) => other.file === link.file && other.path === link.path) : undefined;
      if (linked) { sheets.set(link.id, linked.id); continue; }
      let n = project.data.length + 1;
      while (project.data.some((other) => other.id === `data-${n}`)) n++;
      const copy: ProjectData = { ...structuredClone(link), id: `data-${n}`, name: freeName(link.name, sheetNames, same), x: link.x + shift.dx, y: link.y + shift.dy };
      project.data.push(copy);
      if (state) doc.tables.set(copy.id, state);
      sheets.set(link.id, copy.id);
      if (!carried) pasted.push(copy.id);
    }
    for (const name of clip.ranges) {
      const data = sheets.get(name.data);
      if (!data || data === name.data && same) continue;
      if (project.ranges.some((other) => other.data === data && other.name.toLowerCase() === name.name.toLowerCase())) continue;
      project.ranges.push({ ...newNamedRange(project.ranges, { ...name, data }, name.name, name.unit) });
    }
    const imageNames = new Set(project.images.map((image) => image.name.toLowerCase()));
    for (const { image, state } of clip.images) {
      const fresh = newProjectImage(project, image.path, image.file, image.source, image.x + shift.dx, image.y + shift.dy);
      const copy: ProjectImage = { ...structuredClone({ ...image, embedded: undefined }), id: fresh.id, name: freeName(image.name, imageNames, same), x: fresh.x, y: fresh.y };
      if (image.embedded) copy.embedded = image.embedded; else delete copy.embedded;
      project.images.push(copy);
      if (state?.kind === "ready") doc.images.set(copy.id, processed(state.decoded, copy.steps, copy.display));
      else if (state) doc.images.set(copy.id, state);
      pasted.push(copy.id);
    }
    const plotNames = new Set(project.plots.map((plot) => plot.name.toLowerCase()));
    for (const plot of clip.plots) {
      const copy: ProjectPlot = { ...structuredClone(plot), id: nextPlotId(project.plots), name: freeName(plot.name, plotNames, same), x: plot.x + shift.dx, y: plot.y + shift.dy };
      for (const series of copy.series) for (const cells of [series.x, series.y, series.error, series.labels]) if (cells) cells.data = sheets.get(cells.data) ?? cells.data;
      project.plots.push(copy);
      pasted.push(copy.id);
    }
  });
  doc.selection = new Set(pasted);
  doc.plotPart = null;
  if (!same) { void loadLinkedImages(doc); void syncTables(doc); }
  autosave.edited(doc);
  refresh();
  workspace.reveal();
  return pasted.length === 1 ? `Pasted ${doc.selectedObjects()[0]?.name ?? "1 object"}.` : `Pasted ${pasted.length} objects.`;
}

/**
 * Whether a paste pastes the copied objects: its text is the line the object clipboard wrote, or that line could not
 * be written and the clipboard holds no image of its own.
 */
const pastesObjects = (text: string | undefined, image = false) => !!objectClip && (text?.trim() === objectClip.marker || (!objectClip.written && !image && !text?.trim()));

/**
 * Edit › Copy as image (Shift+Cmd+C): the one selected plot as a PNG at its export resolution, or the one selected
 * image as it is shown, on the system clipboard, to paste into a report or slide.
 */
async function copyAsImage(): Promise<void> {
  const doc = active;
  const plot = doc?.selection.size === 1 ? doc.selectedPlot() : null;
  const image = !plot && doc?.selection.size === 1 ? exportable(doc)[0] : undefined;
  if (!doc || (!plot && !image)) { report("Select one plot or one image to copy as an image.", "error"); return; }
  try {
    const bytes = plot ? await plotExportBytes({ ...plot, exportFormat: "png", exportDpi: plotExportDefaults().dpi }, doc.plotSources(), exportOptionsOf(doc).jpegQuality) : await shownPng(doc.ready(image!.id)!.canvas);
    if (files) await files.copyImage(bytes);
    else await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes as BlobPart], { type: "image/png" }) })]);
    report(plot ? `Copied ${plot.name} as a PNG image at ${plotExportDefaults().dpi} dpi.` : `Copied ${image!.name} as it is shown.`, "info");
  } catch (error) { report(`Couldn't copy the image: ${reason(error)}`, "error"); }
}

async function openImagesAsDocument(images: IncomingImage[]): Promise<void> {
  const doc = new PlotDocument(untitledName(documents));
  const added = await addImages(doc, images, false);
  if (!added.length) return;
  suggestedNames.set(doc, `${stem(added[0].file)}.${EXT}`);
  addDocument(doc, true);
  workspace.fit();
}

/** File › Import… and a drop on an open document: the images and data files are linked to the active document. */
async function importImages(): Promise<void> {
  const doc = active;
  if (!doc) return;
  if (files) {
    const paths = await files.importDialog();
    const images = paths.filter(isImagePath), data = paths.filter(isDataPath);
    if (images.length) await addImages(doc, images.map((path) => ({ path, file: basename(path) })));
    if (data.length) await addData(doc, data.map((path) => ({ path, file: basename(path) })));
    return;
  }
  openBrowserFiles(IMPORT_ACCEPT, async (file) => {
    const incoming = { path: null, file: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
    if (isDataPath(file.name)) await addData(doc, [incoming]); else await addImages(doc, [incoming]);
  });
}

/** Read, describe and place images; each placement is one undoable edit. Returns the images added. */
function addImages(doc: PlotDocument, incoming: IncomingImage[], announce = true): Promise<ProjectImage[]> { return busy(() => addImagesNow(doc, incoming, announce)); }
async function addImagesNow(doc: PlotDocument, incoming: IncomingImage[], announce = true): Promise<ProjectImage[]> {
  const added: ProjectImage[] = [];
  for (const item of incoming) {
    try {
      const bytes = item.bytes ?? await files!.readImage(item.path!);
      const loaded = await loadImage(bytes);
      const { x, y } = placeNew(doc.objects(), doc.project.grid.spacing);
      const image = newProjectImage(doc.project, item.path, item.file, loaded.source, x, y);
      if (item.embed) image.embedded = bytes;
      doc.edit((project) => { project.images.push(image); });
      doc.images.set(image.id, processed(loaded.decoded, image.steps, image.display));
      doc.selection = new Set([image.id]);
      added.push(image);
      if (announce) report(item.embed
        ? `Pasted ${image.name}, ${loaded.info.widthPx} × ${loaded.info.heightPx} px, kept inside the document.`
        : `Added ${image.file}, ${loaded.info.widthPx} × ${loaded.info.heightPx} px.`, "info", doc);
    } catch (error) {
      report(`Couldn't add ${item.file}: ${reason(error)}`, "error", doc);
    }
  }
  keepDraft(doc);
  // What was just placed comes into view, as in a design app; the placement rule puts it right of everything.
  if (doc === active) { refresh(); if (added.length) workspace.reveal(); autosave.edited(doc); }
  return added;
}

/** Read the images a document links to. A missing or changed original is reported; the document still opens. */
function loadLinkedImages(doc: PlotDocument): Promise<void> { return busy(() => loadLinkedImagesNow(doc)); }
async function loadLinkedImagesNow(doc: PlotDocument): Promise<void> {
  for (const image of doc.project.images) {
    if (image.embedded) {
      try { doc.images.set(image.id, processed(await decode(image.embedded), image.steps, image.display)); }
      catch (error) { doc.images.set(image.id, { kind: "unreadable", reason: reason(error) }); report(`Couldn't show ${image.name}: ${reason(error)}`, "warning", doc); }
      if (doc === active) refresh();
      continue;
    }
    if (!files || !image.path) {
      doc.images.set(image.id, { kind: "missing" });
      report(`${image.file} is not shown: the browser preview cannot read linked files.`, "warning", doc);
      continue;
    }
    doc.images.set(image.id, { kind: "loading" });
    try {
      const bytes = await files.readImage(image.path);
      if (crc32(bytes) !== image.source.crc32) report(`${image.file} changed since it was added. The new version is shown.`, "warning", doc);
      doc.images.set(image.id, processed(await decode(bytes), image.steps, image.display));
    } catch (error) {
      const missing = /ENOENT|no such file/i.test(String(error));
      doc.images.set(image.id, missing ? { kind: "missing" } : { kind: "unreadable", reason: reason(error) });
      report(missing ? `${image.file} is missing from ${dirname(image.path)}.` : `Couldn't read ${image.file}: ${reason(error)}`, "warning", doc);
    }
    if (doc === active) refresh();
  }
}

// MARK: data files

/** A data file to add: a linked file, with its bytes when they are already read (a drop, the browser preview). */
interface IncomingData { path: string | null; file: string; bytes?: Uint8Array }

async function openDataAsDocument(incoming: IncomingData[]): Promise<void> {
  const doc = new PlotDocument(untitledName(documents));
  const added = await addData(doc, incoming, false);
  if (!added.length) return;
  suggestedNames.set(doc, `${stem(added[0].file)}.${EXT}`);
  addDocument(doc, true);
  workspace.fit();
}

/**
 * Read and link data files, each as one undoable edit. Each becomes a worksheet on the work surface, placed right of
 * everything as a new image is, selected and brought into view.
 */
async function addData(doc: PlotDocument, incoming: IncomingData[], announce = true): Promise<ProjectData[]> {
  const added: ProjectData[] = [];
  for (const item of incoming) {
    try {
      const bytes = item.bytes ?? await files!.readData(item.path!);
      const source = describeData(bytes);
      const loaded = await readData(bytes, DEFAULT_READ, [], inflateRaw);
      const spacing = doc.project.grid.spacing;
      const size = newSheetSize(loaded.table.columns.length, loaded.table.rows, source.format === "xlsx" && loaded.sheets.length > 0, spacing, sheetAxes(loaded.table));
      // Roles stay automatic until one is set, so that another sheet, range or header row finds its own X and Y columns.
      const link = newProjectData(doc.project.data, item.path, item.file, source, DEFAULT_READ, [], { ...placeNew(doc.objects(), spacing), ...size });
      doc.edit((project) => { project.data.push(link); });
      doc.tables.set(link.id, { kind: "ready", bytes, key: tableKey(link), loaded });
      doc.selection = new Set([link.id]);
      doc.selectedColumn = null;
      added.push(link);
      const sheet = loaded.sheet && loaded.sheets.length > 1 ? `, sheet ${loaded.sheet} of ${loaded.sheets.length}` : "";
      if (announce) report(`Added ${link.file}: ${loaded.table.columns.length} columns, ${loaded.table.rows.toLocaleString("en")} rows${sheet}.`, "info", doc);
    } catch (error) {
      report(`Couldn't add ${item.file}: ${reason(error)}`, "error", doc);
    }
  }
  keepDraft(doc);
  if (doc === active && added.length) { autosave.edited(doc); refresh(); workspace.reveal(); }
  return added;
}

/** Read the data files a document links to. A missing or changed file is reported; the document still opens. */
function loadLinkedData(doc: PlotDocument): Promise<void> { return busy(() => loadLinkedDataNow(doc)); }
async function loadLinkedDataNow(doc: PlotDocument): Promise<void> {
  for (const link of doc.project.data) {
    if (!files || !link.path) {
      doc.tables.set(link.id, { kind: "missing" });
      report(`${link.file} is not read: the browser preview cannot read linked files.`, "warning", doc);
      continue;
    }
    doc.tables.set(link.id, { kind: "loading" });
    try {
      const bytes = await files.readData(link.path);
      if (crc32(bytes) !== link.source.crc32) report(`${link.file} changed since it was added. The new version is read.`, "warning", doc);
      await readTable(doc, link, bytes);
    } catch (error) {
      const missing = /ENOENT|no such file/i.test(String(error));
      doc.tables.set(link.id, missing ? { kind: "missing" } : { kind: "unreadable", reason: reason(error) });
      report(missing ? `${link.file} is missing from ${dirname(link.path)}.` : `Couldn't read ${link.file}: ${reason(error)}`, "warning", doc);
    }
    if (doc === active) refresh();
  }
}

/** Make a data file's table from its bytes with the document's options; a refusal (a sheet that is gone) keeps the bytes. */
async function readTable(doc: PlotDocument, link: ProjectData, bytes: Uint8Array): Promise<void> {
  return busy(async () => {
  const key = tableKey(link);
  try { doc.tables.set(link.id, { kind: "ready", bytes, key, loaded: await readData(bytes, link.read, link.columns, inflateRaw) }); }
  catch (error) { doc.tables.set(link.id, { kind: "unreadable", reason: reason(error), bytes, key }); }
  });
}

/** After an edit or an undo: tables whose read options or column settings changed are made again from their bytes. */
let syncing = false;
async function syncTables(doc: PlotDocument): Promise<void> {
  if (syncing) return;
  syncing = true;
  let changed = false;
  try {
    for (const link of doc.project.data) {
      const state = doc.tables.get(link.id);
      if (!state || !("bytes" in state) || !state.bytes || state.key === tableKey(link)) continue;
      await readTable(doc, link, state.bytes);
      changed = true;
    }
  } finally { syncing = false; }
  if (changed && doc === active) refresh();
}

function dataLink(id: string): ProjectData | undefined { return active?.project.data.find((data) => data.id === id); }

/** Select a worksheet, and choose one of its columns (null: none), from its heading, the inspector or `data`. */
function selectData(id: string, column: string | null): void {
  if (!active) return;
  active.selection = new Set([id]);
  const index = column ? active.table(id)?.columns.findIndex((item) => item.key === column) ?? -1 : -1;
  active.selectedColumn = column ? { id, column, cells: index >= 0 ? { ranges: [{ c0: index, c1: index, rows: null }], anchor: { column: index, row: null } } : null } : null;
  refresh();
}

/** The re-read mark on a worksheet's title bar: read the file again from disk, as Origin's Data Connector re-imports. */
async function reloadData(id: string): Promise<void> {
  const doc = active, link = doc?.dataLink(id);
  if (!doc || !link) return;
  if (!files || !link.path) { report(`${link.file} cannot be read again: the browser preview cannot read linked files.`, "warning"); return; }
  try {
    const bytes = await files.readData(link.path);
    await readTable(doc, link, bytes);
    const state = doc.tables.get(link.id);
    report(state?.kind === "ready" ? `Read ${link.file} again: ${state.loaded.table.columns.length} columns, ${state.loaded.table.rows.toLocaleString("en")} rows.` : `Couldn't read ${link.file}: ${state?.kind === "unreadable" ? state.reason : "unknown"}`, state?.kind === "ready" ? "info" : "error");
  } catch (error) {
    const missing = /ENOENT|no such file/i.test(String(error));
    doc.tables.set(link.id, missing ? { kind: "missing" } : { kind: "unreadable", reason: reason(error) });
    report(missing ? `${link.file} is missing from ${dirname(link.path)}.` : `Couldn't read ${link.file}: ${reason(error)}`, "error");
  }
  refresh();
}

/** `data move` and the Placement fields: a worksheet's top-left corner, or its size, as one undoable edit. */
function placeData(id: string, box: Partial<{ x: number; y: number; width: number; height: number }>): void {
  editActive((doc) => {
    const link = doc.dataLink(id);
    if (!link) return;
    Object.assign(link, box);
    link.width = Math.max(SHEET.minWidth, Math.round(link.width));
    link.height = Math.max(SHEET.minHeight, Math.round(link.height));
  });
}

/** How a data file is read, as one undoable edit; returns what changed, or nothing when nothing did. */
function setDataRead(id: string, patch: Partial<DataReadOptions>): string {
  const link = dataLink(id);
  if (!link) return "Select a data file first.";
  if (Object.entries(patch).every(([key, value]) => link.read[key as keyof DataReadOptions] === value)) return "";
  editActive((doc) => { const target = doc.project.data.find((data) => data.id === id)!; target.read = { ...target.read, ...patch }; });
  return `${link.name} is read again with the new setting.`;
}

/** The cells chosen in the selected worksheet, one range per column, with the worksheet; or why there are none. */
function chosenRanges(): { link: ProjectData; table: DataTable; ranges: CellRange[] } | string {
  const doc = active, chosen = doc?.selectedColumn;
  if (!doc || !chosen || selectionEmpty(chosen.cells)) return "Choose cells of a worksheet first.";
  const link = doc.dataLink(chosen.id), table = doc.table(chosen.id);
  if (!link || !table) return "The worksheet is not read yet.";
  return { link, table, ranges: selectionRanges(table, chosen.cells, link.id) };
}

/** A name or unit as typed: =B1 takes the text of that cell of the worksheet; anything else is itself. */
function typedOrCell(text: string, table: DataTable): string {
  const reference = /^=\s*([A-Z]{1,3}\d+)\s*$/i.exec(text.trim());
  if (!reference) return text.trim();
  const cell = cellAt(table, reference[1]);
  if (cell === null) throw new Error(`The worksheet has no cell ${reference[1].toUpperCase()}.`);
  return cell;
}

/**
 * The Name field of the chosen cells (one column), as Excel's Name Box: a name labels them, a new name renames theirs,
 * and an empty one removes it; =B1 takes a cell's text. One undoable edit.
 */
function nameChosen(text: string): { ok: boolean; text: string } {
  const found = chosenRanges();
  if (typeof found === "string") return { ok: false, text: found };
  if (found.ranges.length !== 1) return { ok: false, text: "Choose cells in one column to name them." };
  return nameCells(found.link, found.table, found.ranges[0], text);
}

/** Name cells of a worksheet (the Name field, `data name`): see nameChosen. */
function nameCells(link: ProjectData, table: DataTable, cells: CellRange, text: string): { ok: boolean; text: string } {
  const found = { link, table };
  const names = active!.project.ranges, own = names.find((name) => sameCells(name, cells));
  let value: string;
  try { value = typedOrCell(text, found.table); } catch (error) { return { ok: false, text: reason(error) }; }
  const where = rangeLabel([], cells, found.link.name, found.table);
  if (!value) {
    if (!own) return { ok: true, text: "" };
    editActive((doc) => { doc.project.ranges = doc.project.ranges.filter((name) => name.id !== own.id); });
    return { ok: true, text: `${where} is no longer named ${own.name}.` };
  }
  // A cell's text brings its unit with it, as Name from first row does: Time (s) is Time, in s.
  const { name, unit } = text.trim().startsWith("=") ? splitUnit(value) : { name: value, unit: own?.unit ?? "" };
  const problem = nameProblem(name, names, own?.id ?? null);
  if (problem) return { ok: false, text: problem };
  editActive((doc) => {
    const target = own && doc.project.ranges.find((item) => item.id === own.id);
    if (target) { target.name = name; target.unit = unit; } else doc.project.ranges.push(newNamedRange(doc.project.ranges, cells, name, unit));
  });
  return { ok: true, text: `${where} is named ${name}${unit ? `, in ${unit}` : ""}.` };
}

/** A named range's unit, as one undoable edit; =C1 takes a cell's text. */
function setNameUnit(id: string, text: string): { ok: boolean; text: string } {
  const own = active?.project.ranges.find((name) => name.id === id), table = own ? active!.table(own.data) : null;
  if (!own || !table) return { ok: false, text: "That name is no longer in the document." };
  let unit: string;
  try { unit = typedOrCell(text, table); } catch (error) { return { ok: false, text: reason(error) }; }
  editActive((doc) => { const target = doc.project.ranges.find((name) => name.id === id); if (target) target.unit = unit; });
  return { ok: true, text: unit ? `${own.name} is in ${unit}.` : `${own.name} has no unit.` };
}

function removeName(id: string): void {
  editActive((doc) => { doc.project.ranges = doc.project.ranges.filter((name) => name.id !== id); });
}

/**
 * Name from first row, as Excel's Create from Selection: each chosen column's cells below its first row take the text
 * in it as their name, and a unit written with it (Time (s)). A name already used elsewhere is left out, saying so. The
 * cells named stay chosen. One undoable edit.
 */
function nameFromFirstRow(): { ok: boolean; text: string } {
  const found = chosenRanges();
  if (typeof found === "string") return { ok: false, text: found };
  const made = namesFromFirstRow(found.ranges, found.table);
  if (!made.length) return { ok: false, text: "The first chosen row holds no text to name the cells below it. Choose the cells with their heading at the top." };
  const named: string[] = [], skipped: string[] = [];
  editActive((doc) => {
    for (const item of made) {
      const own = doc.project.ranges.find((name) => sameCells(name, item.cells));
      const problem = nameProblem(item.name, doc.project.ranges, own?.id ?? null);
      if (problem) { skipped.push(problem); continue; }
      if (own) { own.name = item.name; own.unit = item.unit; } else doc.project.ranges.push(newNamedRange(doc.project.ranges, item.cells, item.name, item.unit));
      named.push(item.unit ? `${item.name} (${item.unit})` : item.name);
    }
    const chosen = doc.selectedColumn;
    if (chosen?.cells && named.length) {
      chosen.cells = { ...chosen.cells, ranges: chosen.cells.ranges.map((range) => ({ ...range, rows: { first: (range.rows?.first ?? 0) + 1, last: range.rows?.last ?? Math.max(0, found.table.rows - 1) } })) };
      doc.lastCells = chosen;
    }
  });
  const text = named.length ? `Named ${named.join(", ")}.` : "";
  return { ok: named.length > 0, text: `${text}${skipped.length ? `${text ? " " : ""}${skipped.join(" ")} Name ${skipped.length === 1 ? "that range" : "those ranges"} by hand.` : ""}` };
}

const PICK_WHAT = { x: "X", y: "Y", error: "error bars", labels: "labels" } as const;

/**
 * A series field with the focus, as Excel's reference boxes: the next cells chosen in any worksheet become its X, Y,
 * error or labels; Esc cancels. The field keeps its place, so the inspector is not drawn again; null stops waiting.
 */
function startPick(plotId: string, seriesId: string | null, which: "x" | "y" | "error" | "labels" | null): void {
  const doc = active, plot = doc?.plot(plotId), index = plot?.series.findIndex((series) => series.id === seriesId) ?? -1;
  if (!doc) return;
  if (which === null) { if (doc.picking?.plotId === plotId && doc.picking.seriesId === seriesId) { doc.picking = null; if (seriesId === null) refresh(); } return; }
  if (!plot || (seriesId !== null && index < 0)) return;
  doc.picking = { plotId, seriesId, which, kind: seriesId === null ? newKinds.get(plotId) ?? "scatter" : undefined };
  if (seriesId === null) { refresh(); report(`Choose cells in any worksheet to plot them in ${plot.name}: one range plots against the row number; with more, the first is X. Esc cancels.`, "info"); }
}

/** The kind each plot made empty from the toolbar was made as, for its first series (this session). */
const newKinds = new Map<string, PlotKind>();

/** The cells chosen while a field waits for them: its first column becomes the series' range, and the plot is selected again. */
function finishPick(id: string, cells: SheetSelection): void {
  const doc = active, picking = doc?.picking, table = doc?.table(id), link = doc?.dataLink(id);
  if (!doc || !picking || !table || !link) return;
  const ranges = selectionRanges(table, cells, id);
  if (!ranges.length) return;
  doc.picking = null;
  if (picking.seriesId === null) {
    const plot = doc.plot(picking.plotId), pairs = selectionPairs(table, cells, id, doc.roleOf);
    if (!plot || !pairs.length) { doc.picking = plot ? picking : null; report("The chosen cells hold no numbers. Choose cells of numbers, or press Esc.", "error"); return; }
    editActive((current) => {
      const target = current.plot(picking.plotId);
      if (target) { for (const pair of pairs) addSeries(target, pair, picking.kind ?? "scatter"); target.legend = target.series.length > 1; }
      current.lastCells = { id, column: null, cells };
      current.selection = new Set([picking.plotId]);
      current.selectedColumn = null;
    });
    const first = pairs[0], label = (range: CellRange) => rangeLabel(doc.project.ranges, range, link.name, table);
    report(`${plot.name}: ${pairs.length === 1 ? `${label(first.y)} against ${first.x ? label(first.x) : "the row number"}` : `${pairs.length} series`}.`, "info");
    return;
  }
  const plot = doc.plot(picking.plotId), index = plot?.series.findIndex((series) => series.id === picking.seriesId) ?? -1;
  if (!plot || index < 0) { refresh(); return; }
  editActive((current) => {
    const series = current.plot(picking.plotId)?.series.find((item) => item.id === picking.seriesId);
    if (series) series[picking.which] = ranges[0];
    current.selection = new Set([picking.plotId]);
    current.selectedColumn = null;
  });
  const label = rangeLabel(doc.project.ranges, ranges[0], link.name, table);
  report(`Series ${index + 1}'s ${PICK_WHAT[picking.which]}: ${label}.${ranges.length > 1 ? " A series takes one column; the first chosen was taken." : ""}`, "info");
}

/** Esc while a field waits for cells: it stops waiting, and the plot is selected again. */
function cancelPick(): boolean {
  const picking = active?.picking;
  if (!active || !picking) return false;
  active.picking = null;
  active.selection = new Set([picking.plotId]);
  active.selectedColumn = null;
  refresh();
  report("Picking cells cancelled.", "info");
  return true;
}

/** Choose a named range's cells in its worksheet, which is selected. */
function selectName(name: NamedRange): void {
  const doc = active, table = doc?.table(name.data);
  if (!doc || !table) return;
  const index = table.columns.findIndex((column) => column.key === name.column);
  if (index < 0) return;
  doc.selection = new Set([name.data]);
  const cells = { ranges: [{ c0: index, c1: index, rows: name.rows }], anchor: { column: index, row: name.rows?.first ?? null } };
  doc.selectedColumn = { id: name.data, column: name.column, cells };
  doc.lastCells = doc.selectedColumn;
  refresh();
}

/**
 * Add the cells last chosen in a worksheet to a plot, as one undoable edit: with one range, a Y against the plot's
 * first series' X (or the row number); with more, the first is X and each other a Y against it.
 */
function addChosenToPlot(plotId: string): { ok: boolean; text: string } {
  const doc = active, last = doc?.lastCells ?? null, plot = doc?.plot(plotId);
  if (!doc || !plot) return { ok: false, text: "That plot is no longer in the document." };
  const table = last ? doc.table(last.id) : null;
  if (!last || !table || selectionEmpty(last.cells)) return { ok: false, text: "Choose cells in a worksheet first." };
  let pairs = selectionPairs(table, last.cells, last.id, doc.roleOf);
  if (!pairs.length) return { ok: false, text: "The chosen cells hold no numbers." };
  if (pairs.length === 1 && !pairs[0].x && plot.series[0]?.x) pairs = [{ ...pairs[0], x: plot.series[0].x }];
  editPlot(plotId, (target) => {
    for (const pair of pairs) addSeries(target, pair, target.series.at(-1)?.kind ?? newKinds.get(plotId) ?? "scatter");
    if (target.series.length > 1) target.legend = true;
  });
  return { ok: true, text: `Added ${pairs.length === 1 ? "a series" : `${pairs.length} series`} to ${plot.name}.` };
}

// MARK: right-click menus on the work surface

/**
 * The menu of chosen cells, as Excel's and Origin's: Copy; New plot of them in any kind, or Add to any plot; what the
 * range under the pointer is to a plot (Use as); and naming them (Name…, Name from row n). An action that cannot be
 * taken is shown disabled, its tip saying why.
 */
function cellsMenu(dataId: string, column: number | null, x: number, y: number): MenuEntry[] {
  const doc = active, link = doc?.dataLink(dataId), table = doc?.table(dataId), chosen = doc?.selectedColumn;
  if (!doc || !link || !table || chosen?.id !== dataId || selectionEmpty(chosen.cells)) return [];
  const plan = selectionPlan(table, chosen.cells, dataId, doc.roleOf);
  const why = plan.ranges.some((item) => item.numeric) ? "Give a range the role Y to plot it." : "The chosen cells hold no numbers.";
  const plots = doc.project.plots;
  const done = (result: { ok: boolean; text: string }) => { if (result.text) report(result.text, result.ok ? "info" : "error"); };
  const entries: MenuEntry[] = [
    { label: "Copy", key: "CmdOrCtrl+C", action: () => void copyCells() },
    { separator: true, label: "" },
    plan.pairs.length
      ? { label: "New plot", items: PLOT_KINDS.map((kind) => ({ label: PLOT_KIND_NAMES[kind], action: () => done(createPlot(kind)) })) }
      : { label: "New plot", title: why },
    plan.pairs.length && plots.length
      ? { label: "Add to plot", items: plots.map((plot) => ({ label: plot.name, action: () => {
        const result = addChosenToPlot(plot.id);
        if (result.ok) { doc.selection = new Set([plot.id]); doc.selectedColumn = null; refresh(); }
        done(result);
      } })) }
      : { label: "Add to plot", title: plots.length ? why : "The document has no plots yet." },
  ];
  // What the range under the pointer is to a plot; on a row number, the first chosen range.
  const key = column === null ? null : table.columns[column]?.key;
  const item = plan.ranges.find((range) => key === null || range.cells.column === key);
  if (item) {
    entries.push({ separator: true, label: "" }, {
      label: `Use ${rangeLabel(doc.project.ranges, item.cells, link.name, table).replace(/^.*!/, "")} as`,
      items: (item.numeric ? RANGE_ROLES : TEXT_ROLES).map((role: RangeRole) => ({
        label: RANGE_ROLE_NAMES[role], checked: role === item.role,
        action: () => { doc.cellRoles.set(cellsKey(item.cells), role); inspector.render(doc); refreshMenus(); },
      })),
    });
  }
  const ranges = selectionRanges(table, chosen.cells, dataId);
  if (ranges.length === 1) {
    const own = doc.project.ranges.find((name) => sameCells(name, ranges[0]));
    entries.push({ label: own ? "Rename…" : "Name…", action: () => showFieldPopover(x, y, "Name the chosen cells", [{ label: "Name", value: own?.name ?? "" }, { label: "Unit", value: own?.unit ?? "" }], ([name, unit]) => {
      const named = nameCells(link, table, ranges[0], name);
      if (!named.ok) return { field: 0, error: named.text };
      const made = active?.project.ranges.find((range) => sameCells(range, ranges[0]));
      const united = made && unit.trim() !== made.unit ? setNameUnit(made.id, unit.trim()) : null;
      if (united && !united.ok) return { field: 1, error: united.text };
      done(united ?? named);
      return null;
    }) });
  }
  const headings = namesFromFirstRow(ranges, table);
  if (headings.length) entries.push({ label: `Name from row ${(ranges[0].rows?.first ?? 0) + 1}`, action: () => done(nameFromFirstRow()) });
  return entries;
}

/** Bring to front and Send to back, as Edit › Arrange has them, for the selected object. */
function arrangeEntries(): MenuEntry[] {
  return [{ label: "Bring to front", action: () => run("arrange.bringToFront") }, { label: "Send to back", action: () => run("arrange.sendToBack") }];
}

/**
 * A part of a plot's context menu, the same on the plot and on its line in the inspector (forge-shell `partMenu`): the
 * part's own actions, then editing, then arranging, then Properties…, which shows its section.
 */
function plotPartMenu(plotId: string, part: PlotPart): MenuEntry[] {
  const doc = active, plot = doc?.plot(plotId);
  if (!doc || !plot) return [];
  const properties = () => { choosePart(plotId, part); inspector.reveal("subject"); };
  if (part.kind === "legend") return partMenu({ actions: legendEntries(plotId), properties });
  if (part.kind === "series" || part.kind === "point" || part.kind === "points") {
    const series = plot.series.find((item) => item.id === part.series);
    return partMenu({
      actions: seriesAxisEntries(plotId, part),
      edit: series ? [{ label: "Remove series", action: () => editPlot(plotId, (target) => { target.series = target.series.filter((item) => item.id !== series.id); }) }] : [],
      properties,
    });
  }
  if (part.kind === "fit") {
    const fit = plot.series.find((item) => item.id === part.of)?.fits.find((item) => item.id === part.fit);
    if (!fit) return [];
    return partMenu({
      actions: [{ label: "Draw fit", checked: fit.enabled, action: () => editFit(plotId, part.of, part.fit, (item) => ({ ...item, enabled: !item.enabled })) }],
      edit: [{ label: "Remove fit", action: () => { editFit(plotId, part.of, part.fit, () => null); choosePart(plotId, { kind: "series", series: part.of }); } }],
      properties,
    });
  }
  if (part.kind === "axis" || part.kind === "title") return partMenu({ properties });
  const last = doc.lastCells, table = last ? doc.table(last.id) : null;
  const can = !!last && !!table && selectionPairs(table, last.cells, last.id, doc.roleOf).length > 0;
  const kinds = new Set(plot.series.map((series) => series.kind));
  return partMenu({
    actions: [
      can ? { label: "Add chosen cells", action: () => { const result = addChosenToPlot(plotId); report(result.text, result.ok ? "info" : "error"); } }
        : { label: "Add chosen cells", title: "Choose cells with numbers in a worksheet first." },
      plot.series.length
        ? { label: "Kind", items: PLOT_KINDS.map((kind) => ({ label: PLOT_KIND_NAMES[kind], checked: kinds.size === 1 && kinds.has(kind), action: () => editPlot(plotId, (target) => { for (const series of target.series) series.kind = kind; }) })) }
        : { label: "Kind", title: "The plot has no series yet." },
      { label: "Export…", action: () => run("file.export") },
    ],
    edit: [{ label: "Duplicate", key: "CmdOrCtrl+D", action: () => run("edit.duplicate") }, { label: "Delete", key: "Backspace", action: () => run("edit.delete") }],
    arrange: arrangeEntries(),
    properties,
  });
}

/** An image's or a worksheet's context menu (selected by the right-click): its own actions, editing, arranging, Properties…. */
function objectMenu(id: string): MenuEntry[] {
  const doc = active, image = doc?.image(id);
  return partMenu({
    actions: image ? [
      { label: "Add step", items: addStepMenu((step) => run(`document.step.add.${step}`)) },
      { label: "Measure", key: MEASURE_KEY, action: () => run("document.measure") },
      { label: "Export…", action: () => run("file.export") },
    ] : [],
    edit: [
      { label: "Cut", action: () => run("edit.cut") }, { label: "Copy", action: () => run("edit.copy") },
      { label: "Duplicate", key: "CmdOrCtrl+D", action: () => run("edit.duplicate") }, { label: "Delete", key: "Backspace", action: () => run("edit.delete") },
    ],
    arrange: arrangeEntries(),
    properties: () => inspector.reveal("subject"),
  });
}

/** The empty work surface's menu (forge-shell `workspaceMenu`): add, edit, view, then Project properties…. */
function surfaceMenu(): MenuEntry[] {
  const doc = active;
  return workspaceMenu({
    add: [
      { label: "Import…", action: () => run("file.import") },
      { label: "New plot", items: PLOT_KINDS.map((kind) => ({ label: PLOT_KIND_NAMES[kind], action: () => run(`document.plot.${kind}`) })) },
    ],
    edit: [{ label: "Paste", action: () => run("edit.paste") }, { label: "Select all", action: () => run("edit.selectAll") }],
    view: [{ label: "Fit", action: () => run("view.fit") }, { label: "Snap to grid", checked: !!doc?.project.grid.snap, action: () => run("view.snap") }],
    project: () => { if (!doc) return; doc.selection = new Set(); doc.plotPart = null; refresh(); inspector.reveal("document"); },
  });
}

/** Choose a part of a plot (from its line in the inspector, its path, Esc or its menu): the plot is selected with it. */
function choosePart(plotId: string, part: PlotPart): void {
  const doc = active;
  if (!doc) return;
  doc.selection = new Set([plotId]);
  doc.plotPart = { plotId, part };
  workspace.markPart(plotId, null);
  workspace.draw();
  inspector.render(doc);
  refreshStatus();
  refreshMenus();
}

/**
 * With a series or a point chosen on the plot, its own options first, as a chart program's right-click: for a point,
 * its callout; for its series, callouts on every point and its Y and X axes. The plot's options follow.
 */
function seriesAxisEntries(plotId: string, part: PlotPart): MenuEntry[] {
  const plot = active?.plot(plotId);
  const index = plot && part && "series" in part ? plot.series.findIndex((item) => item.id === part.series) : -1;
  if (!plot || !part || index < 0) return [];
  const series = plot.series[index], number = index + 1;
  const set = (change: (target: PlotSeries) => void) => editPlot(plotId, (target) => { const item = target.series.find((entry) => entry.id === series.id); if (item) change(item); });
  // `current` undefined: several points that differ, so nothing is checked.
  const choices = (current: CalloutText | null | undefined, apply: (text: CalloutText | null) => void): MenuEntry[] => [
    { label: "None", checked: current === null, action: () => apply(null) },
    ...CALLOUT_TEXTS.map((text) => ({ label: CALLOUT_NAMES[text], checked: current === text, action: () => apply(text) })),
  ];
  const entries: MenuEntry[] = [];
  const points = chosenPoints(part);
  if (points.length) {
    // Several points show a choice as checked only while they all have it.
    const shown = points.map((at) => calloutAt(series, at)), same = shown.every((text) => text === shown[0]);
    entries.push(
      { label: partName(part, plot.series), header: true },
      { label: points.length > 1 ? "Callouts" : "Callout", items: choices(same ? shown[0] : undefined, (text) => set((item) => { for (const at of points) setCallout(item, at, text); })) },
      { separator: true, label: "" },
    );
  }
  entries.push(
    { label: `Series ${number}`, header: true },
    { label: "Callouts", items: choices(series.callouts.all, (text) => set((item) => setCallout(item, null, text))) },
    { label: "Y axis", items: SERIES_AXES.map((axis) => ({ label: SERIES_AXIS_NAMES[axis], checked: series.axis === axis, action: () => set((item) => { item.axis = axis; }) })) },
    { label: "X axis", items: SERIES_X_AXES.map((axis) => ({ label: SERIES_X_AXIS_NAMES[axis], checked: series.xAxis === axis, action: () => set((item) => { item.xAxis = axis; }) })) },
    { label: "Add fit", items: addFitMenu((kind) => addFit(plotId, series.id, kind)) },
  );
  return entries;
}

/** A right-click on a plot's legend: where it stands and its backing, and hiding it; the plot's options follow. */
function legendEntries(plotId: string): MenuEntry[] {
  const plot = active?.plot(plotId);
  if (!plot) return [];
  return [
    { label: "Legend", header: true },
    { label: "Place", items: (Object.keys(LEGEND_PLACES) as LegendPlace[]).map((place) => ({ label: LEGEND_PLACES[place], checked: plot.legendPlace === place, action: () => editPlot(plotId, (target) => { target.legendPlace = place; }) })) },
    { label: "Background", items: (Object.keys(LEGEND_BACKS) as LegendBack[]).map((back) => ({ label: LEGEND_BACKS[back], checked: plot.legendBack === back, action: () => editPlot(plotId, (target) => { target.legendBack = back; }) })) },
    { label: "Hide legend", action: () => editPlot(plotId, (target) => { target.legend = false; }) },
  ];
}

/** Whether cells of a worksheet are chosen (what Copy copies before an image). */
function cellsChosen(): boolean {
  return !!active?.selectedColumn && !selectionEmpty(active.selectedColumn.cells);
}

/** The chosen cells as tab-separated text, as a spreadsheet copies them: each block's columns side by side, its rows as shown. */
function chosenCellsText(): string | null {
  const doc = active, chosen = doc?.selectedColumn, table = chosen ? doc!.table(chosen.id) : null;
  if (!chosen || !table || selectionEmpty(chosen.cells)) return null;
  const columns: string[][] = [];
  for (const range of chosen.cells!.ranges) {
    const first = range.rows?.first ?? 0, last = Math.min(range.rows?.last ?? table.rows - 1, table.rows - 1);
    for (let index = range.c0; index <= Math.min(range.c1, table.columns.length - 1); index++) columns.push(table.columns[index].text.slice(first, last + 1));
  }
  const height = Math.max(0, ...columns.map((cells) => cells.length));
  return Array.from({ length: height }, (_, row) => columns.map((cells) => cells[row] ?? "").join("\t")).join("\n");
}

async function copyCells(): Promise<void> {
  const text = chosenCellsText();
  if (text === null) return;
  try {
    await navigator.clipboard.writeText(text);
    const rows = text.split("\n").length;
    report(`Copied ${rows} row${rows === 1 ? "" : "s"} of cells.`, "info");
  } catch (error) { report(`Couldn't copy the cells: ${reason(error)}`, "error"); }
}

function renameData(id: string, name: string): void {
  editActive((doc) => { const target = doc.project.data.find((data) => data.id === id); if (target) target.name = name; });
}

/** Remove data links as one undoable edit; the files are not touched. */
function removeData(ids: readonly string[]): void {
  editActive((doc) => {
    doc.project.data = doc.project.data.filter((data) => !ids.includes(data.id));
    for (const id of ids) doc.selection.delete(id);
    if (doc.selectedColumn && ids.includes(doc.selectedColumn.id)) doc.selectedColumn = null;
    if (doc.lastCells && ids.includes(doc.lastCells.id)) doc.lastCells = null;
    doc.project.ranges = doc.project.ranges.filter((name) => !ids.includes(name.data));
  });
}

/** Edit › Delete and Backspace: the selected images and worksheets leave the document as one edit; no file is touched. */
function removeSelection(doc: PlotDocument): void {
  const ids = [...doc.selection];
  const sheets = doc.project.data.filter((data) => doc.selection.has(data.id));
  editActive((current) => {
    current.project.images = current.project.images.filter((image) => !ids.includes(image.id));
    current.project.data = current.project.data.filter((data) => !ids.includes(data.id));
    current.project.plots = current.project.plots.filter((plot) => !ids.includes(plot.id));
    current.project.ranges = current.project.ranges.filter((name) => !ids.includes(name.data));
    if (current.lastCells && ids.includes(current.lastCells.id)) current.lastCells = null;
    current.selection = new Set();
    current.selectedColumn = null;
  });
  if (sheets.length) report(sheets.length === 1 ? `Removed ${sheets[0].name}; the file ${sheets[0].file} is unchanged. Undo brings it back.` : `Removed ${ids.length} objects; their files are unchanged. Undo brings them back.`, "info");
}

// MARK: plots

/**
 * New › Plot of the cells chosen in a worksheet (the inspector's Kind and Plot, Document › New plot,
 * `plot new`), as one undoable edit, by Origin's rule (`selectionPairs`): one range against the row number; with more,
 * the first is X and each other a Y against it, each over its own rows. The plot is placed right of everything,
 * selected and brought into view; the cells stay the last chosen, so that a series can take them again.
 */
function createPlot(kind: PlotKind, dataId: string | null = null, at: { x: number; y: number } | null = null): { ok: boolean; text: string } {
  const doc = active;
  if (!doc) return { ok: false, text: "Open a document first." };
  const link = dataId ? doc.dataLink(dataId) : doc.selectedData() ?? (doc.lastCells ? doc.dataLink(doc.lastCells.id) : null) ?? (doc.project.data.length === 1 ? doc.project.data[0] : null);
  if (!link) return { ok: false, text: "Select a worksheet and choose the cells to plot." };
  const table = doc.table(link.id);
  if (!table) return { ok: false, text: `${link.name} is not read yet.` };
  const chosen = doc.selectedColumn?.id === link.id ? doc.selectedColumn : doc.lastCells?.id === link.id ? doc.lastCells : null;
  const cells = chosen && !selectionEmpty(chosen.cells) ? chosen.cells : null;
  if (!cells) return { ok: false, text: `Choose the cells of ${link.name} to plot: one range plots against the row number; with more, the first is X.` };
  const pairs = selectionPairs(table, cells, link.id, doc.roleOf);
  if (!pairs.length) return { ok: false, text: `The chosen cells of ${link.name} hold no numbers.` };
  let plot: ProjectPlot;
  const spacing = doc.project.grid.spacing;
  const place = at ? { x: doc.project.grid.snap ? snapValue(at.x, spacing) : Math.round(at.x), y: doc.project.grid.snap ? snapValue(at.y, spacing) : Math.round(at.y) } : placeNew(doc.objects(), spacing);
  try { plot = newPlot(doc.project.plots, kind, pairs, place); }
  catch (error) { return { ok: false, text: reason(error) }; }
  // The look new plots take, when one is set, then the kind chosen for the series.
  const look = settings.newPlotTemplate ? plotTemplates().find((item) => item.name === settings.newPlotTemplate) : undefined;
  if (look) { applyTemplate(plot, look); for (const series of plot.series) series.kind = kind; }
  editActive((current) => { current.project.plots.push(plot); current.lastCells = chosen; current.selection = new Set([plot.id]); current.selectedColumn = null; });
  if (!at) workspace.reveal();
  const label = (range: CellRange) => rangeLabel(doc.project.ranges, range, link.name, table);
  const first = plot.series[0];
  const what = plot.series.length === 1 ? `${label(first.y)} against ${first.x ? label(first.x) : "the row number"}` : `${plot.series.length} series`;
  return { ok: true, text: `Added ${plot.name}: ${what}.` };
}

/**
 * A plot of a kind from the toolbar, Document › New plot or `plot new`, as Excel's Insert › Chart: with cells chosen in
 * the selected worksheet, a plot of them at once; without, an empty plot in view, selected, waiting for the next cells
 * chosen in any worksheet (Esc stops waiting; Add chosen cells or a series' fields fill it later). A plot tool's click
 * gives the plot's top-left corner; otherwise it is placed by the chosen cells' rule or in the middle of the view.
 */
function insertPlot(kind: PlotKind, placed: { x: number; y: number } | null = null): { ok: boolean; text: string } {
  const doc = active;
  if (!doc) return { ok: false, text: "Open a document first." };
  const chosen = doc.selectedColumn;
  if (chosen && !selectionEmpty(chosen.cells)) return createPlot(kind, chosen.id, placed);
  const spacing = doc.project.grid.spacing;
  const [cx, cy] = workspace.centre();
  const at = placed ?? { x: cx - PLOT_SIZE.width / 2, y: cy - PLOT_SIZE.height / 2 };
  const place = doc.project.grid.snap ? { x: snapValue(at.x, spacing), y: snapValue(at.y, spacing) } : { x: Math.round(at.x), y: Math.round(at.y) };
  const plot = newPlot(doc.project.plots, kind, [], place);
  const look = settings.newPlotTemplate ? plotTemplates().find((item) => item.name === settings.newPlotTemplate) : undefined;
  if (look) { applyTemplate(plot, look); plot.series = []; plot.x = place.x; plot.y = place.y; }
  plot.legend = false;
  newKinds.set(plot.id, kind);
  doc.picking = { plotId: plot.id, seriesId: null, which: "y", kind };
  editActive((current) => { current.project.plots.push(plot); current.selection = new Set([plot.id]); current.selectedColumn = null; });
  return { ok: true, text: `Added an empty ${PLOT_KIND_NAMES[kind].toLowerCase()} plot, ${plot.name}. Choose cells in any worksheet to plot them; Esc cancels.` };
}

// MARK: plot templates and batch plotting

/** The saved plot templates, in the order saved. */
function plotTemplates(): PlotTemplate[] {
  return settings.plotTemplates.map(parseTemplate).filter((item): item is PlotTemplate => item !== null);
}

/** Save a plot's look as a template under its name (or `name`), replacing one of that name; an app preference. */
function saveTemplate(plotId: string, name?: string): { ok: boolean; text: string } {
  const plot = active?.plot(plotId);
  if (!plot) return { ok: false, text: "Select a plot first." };
  const template = plotTemplate(plot, name?.trim() || plot.name);
  const replaced = plotTemplates().some((item) => item.name.toLowerCase() === template.name.toLowerCase());
  store.updateSettings({ plotTemplates: [...plotTemplates().filter((item) => item.name.toLowerCase() !== template.name.toLowerCase()).map(templateRecord), templateRecord(template)] });
  refresh();
  return { ok: true, text: `${replaced ? "Replaced" : "Saved"} the template ${template.name}: ${plot.name}'s size, axes, legend, export and series styles, for any document.` };
}

function applyTemplateTo(plotId: string, name: string): { ok: boolean; text: string } {
  const template = plotTemplates().find((item) => item.name.toLowerCase() === name.toLowerCase());
  const plot = active?.plot(plotId);
  if (!template || !plot) return { ok: false, text: template ? "Select a plot first." : `There is no template ${name}. Type plot template list.` };
  editPlot(plotId, (target) => applyTemplate(target, template));
  return { ok: true, text: `${plot.name} takes the look of ${template.name}.` };
}

function removeTemplate(name: string): { ok: boolean; text: string } {
  const found = plotTemplates().find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!found) return { ok: false, text: `There is no template ${name}.` };
  store.updateSettings({ plotTemplates: plotTemplates().filter((item) => item.name.toLowerCase() !== found.name.toLowerCase()).map(templateRecord), newPlotTemplate: settings.newPlotTemplate?.toLowerCase() === name.toLowerCase() ? null : settings.newPlotTemplate });
  refresh();
  return { ok: true, text: `Removed the template ${found.name}.` };
}

/** The template new plots take: a name, or null for the default look. */
function setNewPlotTemplate(name: string | null): void {
  store.updateSettings({ newPlotTemplate: name });
  refresh();
  report(name ? `New plots take the look of ${name}.` : "New plots take the default look.", "info");
}

/**
 * Batch plotting, as Origin's: the same plot of each of these worksheets, as one undoable edit, placed in rows of
 * three below the plot and selected.
 */
function batchPlot(plotId: string, sheetIds: readonly string[]): { ok: boolean; text: string } {
  const doc = active, plot = doc?.plot(plotId);
  if (!doc || !plot) return { ok: false, text: "Select a plot first." };
  const sheets = doc.project.data.filter((link) => sheetIds.includes(link.id) && link.id !== plotSheet(plot));
  if (!sheets.length) return { ok: false, text: "Tick the worksheets to plot alike." };
  const gap = doc.project.grid.spacing * 2;
  const made = batchPlots(plot, sheets, doc.project.plots, doc.project.ranges, (index) => ({
    x: plot.x + (index % 3) * (plot.width + gap), y: plot.y + plot.height + gap + Math.floor(index / 3) * (plot.height + gap),
  }));
  editActive((current) => { current.project.plots.push(...made); current.selection = new Set(made.map((item) => item.id)); });
  workspace.reveal();
  return { ok: true, text: `Made ${made.length} plot${made.length === 1 ? "" : "s"} like ${plot.name}: ${sheets.map((sheet) => sheet.name).join(", ")}.` };
}

/** Change a plot as one undoable edit. */
function editPlot(id: string, change: (plot: ProjectPlot) => void): void {
  editActive((doc) => { const plot = doc.plot(id); if (plot) change(plot); });
}

// MARK: saving and closing

async function save(doc: PlotDocument, as = false): Promise<boolean> {
  const saved = await saveDocument<"pfg", PlotDocument>({
    document: doc, as, extension: EXT, mimeType: config.desktop.document.mimeType, suggestedName: doc.path ? undefined : suggestedNames.get(doc),
    stripExtension: (name) => name.replace(new RegExp(`\\.${EXT}$`, "i"), ""),
    beforeSave: () => {}, prepare: () => {},
    // The shell makes the text once the destination is known (3.1.0), so image paths are relative to that folder.
    serialize: (current, path) => ({ text: serializeProject(current.project, path), format: "pfg" }), nativeFormat: "pfg",
    unsupportedMessage: `Only .${EXT} documents can be saved.`,
    report: (text, kind, current) => report(text, kind, current), afterSave: () => {},
    desktop: desktop ? { saveDialog: (name) => desktop.saveDialog(name), writeFile: (path, text) => desktop.writeFile(path, text) } : undefined,
  });
  if (saved && doc.path) { recent.add(doc.path); desktop?.addRecentDocument(doc.path); suggestedNames.delete(doc); onDisk.set(doc, serializeProject(doc.project, doc.path)); }
  autosave.forget(doc);
  keepDraft(doc);
  refresh();
  return saved;
}

/** The text an untitled document starts from: an empty project, as its snapshot. */
const START_TEXT = new PlotDocument("").snapshot();
/** Unsaved work (`hasUnsavedWork`): a saved file while dirty, an untitled one only while it differs from an empty project. */
const hasWork = (doc: PlotDocument): boolean => hasUnsavedWork({ path: doc.path, dirty: doc.dirty, text: doc.snapshot(), startText: START_TEXT });

async function close(doc: PlotDocument | null = active): Promise<boolean> {
  if (!doc || !active) return false;
  return closeDocumentTab({
    documents, active, closing: doc, needsPrompt: hasWork, askToSave, save: (current) => save(current),
    activate: (current) => activate(current), dispose: (current) => { autosave.forget(current); recovery.clear(current.draftKey); current.images.clear(); },
    emptyDocument: () => null as unknown as PlotDocument, renderTabs: refresh, afterClose: refresh,
  }).then((closed) => { if (!documents.length) activate(null); return closed; });
}

desktop?.onCloseRequest(() => void confirmWindowClose({
  documents, hasWork, askToSaveAll: (list) => askToSaveAll(list, config.document.plural), activate: (doc) => activate(doc), save: (doc) => save(doc),
  // The documents were saved or their changes discarded: their drafts are no longer needed.
  closeWindow: () => { for (const doc of documents) recovery.clear(doc.draftKey); desktop.closeWindow(); }, closeCancelled: () => desktop.closeCancelled(),
}));

const autosave = createAutosave<PlotDocument>({ choice: () => settings.autosave, canSave: (doc) => !!doc.path && doc.dirty, save: (doc) => save(doc) });
window.addEventListener("blur", () => autosave.blurred(documents));

/** Keep the draft of a document with unsaved edits, or drop it once there are none. */
function keepDraft(doc: PlotDocument): void {
  const draft = doc.draft();
  // An untitled document with no real work keeps no draft: its start is an empty project, as saved.
  if (draft) recovery.keep(draft, draft.path ? "" : serializeProject(new PlotDocument("").project, null));
  else recovery.clear(doc.draftKey);
}

/** After a crash, offer the drafts that were left: Restore reopens the ticked ones, Cancel keeps them all. */
async function offerRecovery(): Promise<void> {
  const drafts = recovery.list();
  if (!drafts.length) return;
  const keys = await askToRecover(drafts, config.identity.name);
  if (!keys) return;
  for (const draft of drafts) {
    if (!keys.includes(draft.key)) { recovery.clear(draft.key); continue; }
    try {
      const doc = new PlotDocument(draft.name, draft.path, parseProject(draft.text, draft.path), draft.key);
      doc.markRestored();
      addDocument(doc, true);
      void loadLinkedImages(doc);
      void loadLinkedData(doc);
    } catch (error) {
      recovery.clear(draft.key);
      report(`Couldn't restore ${draft.name}: ${reason(error)}`, "error");
    }
  }
}

// MARK: edits

/** After an edit on the work surface or in the inspector: one undo step, then the views. */
function edited(doc: PlotDocument, before: string): void {
  // A calibration taken from a line follows the line, in the same undo step as the edit that moved it.
  for (const image of doc.project.images) followCalibrationLine(image);
  if (doc.record(before)) autosave.edited(doc);
  keepDraft(doc);
  refresh();
}

function editActive(change: (doc: PlotDocument) => void): void {
  if (!active) return;
  const before = active.snapshot();
  change(active);
  edited(active, before);
}

function removeImages(ids: readonly string[]): void {
  editActive((doc) => {
    doc.project.images = doc.project.images.filter((image) => !ids.includes(image.id));
    for (const id of ids) doc.selection.delete(id);
  });
}

// MARK: steps

/** The image steps act on: the one selected image. */
function stepImage(doc: PlotDocument | null = active): ProjectImage | null {
  const selected = doc?.selectedImages() ?? [];
  return selected.length === 1 ? selected[0] : null;
}

/** The current step of the selected image, shown in the inspector and acted on by the Document menu. */
function currentStep(doc: PlotDocument | null = active): Step | null {
  const image = stepImage(doc);
  const id = image ? doc!.currentStep.get(image.id) : undefined;
  return image?.steps.find((step) => step.id === id) ?? null;
}

/**
 * Change the selected image's steps as one undoable edit. The image's display size follows the result, so that a
 * crop or a quarter turn keeps one content pixel per pixel. Returns false when there is no image or nothing changed.
 */
function editSteps(change: (steps: Step[], image: ProjectImage) => void): boolean {
  const doc = active, image = stepImage();
  if (!doc || !image) return false;
  const before = doc.snapshot(), place = { x: image.x, y: image.y, width: image.width, height: image.height };
  change(image.steps, image);
  Object.assign(image, resultSize(image));
  // A turned image keeps its top-left content where it was on the surface.
  keepTurnedPlace(image, place);
  if (before === doc.snapshot()) return false;
  edited(doc, before);
  return true;
}

/** The shape the step at `index` receives, from the decoded image when it is ready. */
function shapeBefore(doc: PlotDocument, image: ProjectImage, index: number) {
  const ready = doc.ready(image.id);
  return traceShapes(ready ? ready.decoded.raster : workingShape(image.source), image.steps)[index];
}

/**
 * Add a step and make it the current one: a grey step before the Threshold step (at the end without one), a mask step
 * at the end. An image has one Threshold step, and a mask step needs it.
 */
function addStep(type: Step["type"], change: Partial<Step> = {}): string {
  const doc = active!, image = stepImage()!;
  // A new Convert to grey step starts with the image's grey method in effect (its own, or the app's).
  if (type === "grey" && !("method" in change)) change = { ...change, method: imageSettingsOf(image).greyMethod } as Partial<Step>;
  const existing = thresholdStep(image.steps);
  if (type === "threshold" && existing) { doc.currentStep.set(image.id, existing.id); refresh(); return `${image.name} already has a Threshold step; add phases to it.`; }
  if (type === "mask" && !existing) return `${image.name} has no Threshold step. Add one first: mask steps act on its masks.`;
  // A new Threshold step starts with one phase in the image's threshold method and mask colour.
  const working = doc.ready(image.id)?.working;
  if (type === "threshold" && working && !("phases" in change)) change = { ...change, phases: [newPhase([], startingThreshold(image, working), imageSettingsOf(image).maskColour)] } as Partial<Step>;
  const step = { ...newStep(type, image.steps, shapeBefore(doc, image, image.steps.length)), ...change } as Step;
  editSteps((steps, target) => {
    steps.splice(insertIndex(steps, type), 0, step);
    // Regions move with a crop or a canvas, so they stay over the same pixels.
    if (step.type === "crop") target.rois = target.rois.map((roi) => moveRoi(roi, -step.x, -step.y));
    if (step.type === "canvas") target.rois = target.rois.map((roi) => moveRoi(roi, step.x, step.y));
  });
  doc.currentStep.set(image.id, step.id);
  lastAdded = { doc, imageId: image.id, stepId: step.id, copy: JSON.parse(JSON.stringify(step)) };
  refresh();
  return `Added ${stepName(step)} to ${image.name}.`;
}

/** The step added last, in any document: Repeat last step copies it as it is now, or as it was added once it is gone. */
let lastAdded: { doc: PlotDocument; imageId: string; stepId: string; copy: Step } | null = null;

/** Add a copy of the last added step, with its current parameters, to the selected image. */
function repeatLastStep(): string | null {
  const doc = active, image = stepImage(), last = lastAdded;
  if (!last || !doc || !image || !doc.ready(image.id)) return null;
  const source = last.doc.image(last.imageId)?.steps.find((item) => item.id === last.stepId) ?? last.copy;
  const { id: _id, enabled: _enabled, ...change } = structuredClone(source) as Step & { phase?: string };
  // A mask step's phase, and the other image a calculator or paste reads, belong to where the step was added.
  if (source.type === "mask" && (last.doc !== doc || last.imageId !== image.id)) delete change.phase;
  if (source.type === "calculator" || source.type === "paste") {
    if (last.doc !== doc) return `${stepName(source)} reads an image of another document, so it cannot be repeated here.`;
    const problem = readsBackProblem(doc, image, source.imageId);
    if (problem) return problem;
  }
  return addStep(source.type, change as Partial<Step>);
}

/** Why an image cannot read another (itself, or one that reads it back through other images), or null. */
function readsBackProblem(doc: PlotDocument, image: ProjectImage, otherId: string): string | null {
  const reads = otherId === image.id || dependencyCycle(doc.project.images, image.id, [...image.steps, { type: "calculator", enabled: true, imageId: otherId } as Step]);
  return reads ? `${doc.image(otherId)?.name ?? "That image"} reads ${image.name}, directly or through other images, so ${image.name} cannot read it.` : null;
}

function removeStep(id: string): string {
  const doc = active!, image = stepImage()!;
  const index = image.steps.findIndex((step) => step.id === id);
  const step = image.steps[index];
  editSteps((steps) => { steps.splice(index, 1); });
  // The step that takes its place becomes current, or the one before it.
  const next = image.steps[Math.min(index, image.steps.length - 1)];
  if (next) doc.currentStep.set(image.id, next.id); else doc.currentStep.delete(image.id);
  refresh();
  return `Removed ${stepName(step)} from ${image.name}.`;
}

function setStepEnabled(id: string, enabled: boolean): string {
  const image = stepImage()!;
  const step = image.steps.find((item) => item.id === id)!;
  editSteps((steps) => { steps.find((item) => item.id === id)!.enabled = enabled; });
  return `${stepName(step)} is ${enabled ? "on" : "off"}.`;
}

/** Move the step at `from` to before the step at `to` (which may be the number of steps). */
function moveStep(from: number, to: number): string {
  const image = stepImage()!;
  const step = image.steps[from];
  editSteps((steps) => { steps.splice(0, steps.length, ...moveItem(steps, from, to)); });
  return `Moved ${stepName(step)} to step ${image.steps.indexOf(step) + 1}.`;
}

function changeStep(id: string, change: Partial<Step>): void {
  editSteps((steps) => { Object.assign(steps.find((item) => item.id === id)!, change); });
}

/** The Document menu's step actions; each returns its result, which a menu reports and Terminal prints. */
function stepAction(id: string): string | null {
  const image = stepImage(), step = currentStep();
  if (!active || !image) return null;
  if (id === "document.step.repeat") return repeatLastStep();
  if (id.startsWith("document.step.add.")) {
    const item = ADD_STEP_ITEMS.find((entry) => entry.id === id.slice(18));
    return item && active.ready(image.id) ? addStep(item.type, item.change) : null;
  }
  if (!step) return null;
  const index = image.steps.indexOf(step);
  if (id === "document.step.enabled") return setStepEnabled(step.id, !step.enabled);
  if (id === "document.step.up" && index > 0) return moveStep(index, index - 1);
  if (id === "document.step.down" && index < image.steps.length - 1) return moveStep(index, index + 2);
  if (id === "document.step.remove") return removeStep(step.id);
  return null;
}

/** A step that cannot run is reported once, as a warning, until it can run again. */
const reportedProblems = new WeakMap<PlotDocument, Set<string>>();
function reportStepProblems(doc: PlotDocument): void {
  const reported = reportedProblems.get(doc) ?? reportedProblems.set(doc, new Set()).get(doc)!;
  const now = new Set<string>();
  for (const image of doc.project.images) {
    for (const problem of doc.ready(image.id)?.problems ?? []) {
      const step = image.steps.find((item) => item.id === problem.id)!;
      const key = `${image.id} ${problem.id} ${problem.message}`;
      now.add(key);
      if (!reported.has(key)) report(`${stepName(step)} (step ${image.steps.indexOf(step) + 1} of ${image.name}) is passed over. ${problem.message}`, "warning", doc);
    }
  }
  reportedProblems.set(doc, now);
}

// MARK: regions of interest

/** Add a drawn or typed region to an image, named and numbered, as one undoable edit; it becomes the selected region. */
function addRoi(imageId: string, drawn: DrawnRoi): string {
  const doc = active!, image = doc.image(imageId)!;
  const roi = { ...drawn, id: newRoiId(image.rois), name: newRoiName(drawn.type, image.rois) } as Roi;
  editActive((current) => { current.image(imageId)!.rois.push(roi); });
  doc.selection = new Set([imageId]);
  doc.selectedRoi = { imageId, roiId: roi.id };
  refresh();
  return `Added ${roi.name} to ${image.name}.`;
}

function removeRoi(imageId: string, roiId: string): string {
  const doc = active!, image = doc.image(imageId)!, roi = doc.roi(imageId, roiId)!;
  editActive((current) => { const target = current.image(imageId)!; target.rois = target.rois.filter((item) => item.id !== roiId); });
  doc.selectedRoi = null;
  refresh();
  return `Removed ${roi.name} from ${image.name}.`;
}

/** Add the convex hull of a polygon or freehand region as a new polygon on the same image. */
function regionHull(roiId: string): string {
  const image = stepImage()!, roi = image.rois.find((item) => item.id === roiId)!;
  const points = hullOf(roi);
  if (!points) return `${roi.name} is a ${ROI_LABELS[roi.type].toLowerCase()}, which is already convex or has no inside. Use a polygon or freehand region.`;
  if (points.length < 3) return `${roi.name} has no area, so it has no hull.`;
  return addRoi(image.id, { type: "polygon", points });
}

/** Crop the selected image to a region's bounding box: a Crop step, with the regions moved along. */
function cropToRegion(roiId: string): string {
  const doc = active!, image = stepImage()!, roi = image.rois.find((item) => item.id === roiId)!;
  const ready = doc.ready(image.id);
  if (!ready) return `${image.name} is not shown, so it cannot be cropped.`;
  const box = cropFromRoi(roi, ready.working.widthPx, ready.working.heightPx);
  if (!box) return `${roi.name} lies outside the image.`;
  addStep("crop", box);
  return `Cropped ${image.name} to ${roi.name}: ${box.width} × ${box.height} px at ${box.x}, ${box.y}.`;
}

/**
 * Fill a region of the selected image, or clear everything outside it, as a Fill step at the end of the list with a
 * copy of the region: black (0) inside, white (the depth's maximum) outside, unless a value is given.
 */
function fillRegion(roiId: string, outside: boolean, value?: number): string {
  const doc = active!, image = stepImage()!, roi = image.rois.find((item) => item.id === roiId)!;
  const ready = doc.ready(image.id);
  if (!ready) return `${image.name} is not shown, so it cannot be filled.`;
  if (roi.type === "line") return `${roi.name} is a line, which has no inside. Use a closed region.`;
  const M = maxValue(ready.working.bitDepth);
  const fillValue = value ?? (outside ? M : 0);
  if (!(Number.isInteger(fillValue) && fillValue >= 0 && fillValue <= M)) return `The fill value is a whole number from 0 to ${M}.`;
  addStep("fill", { region: JSON.parse(JSON.stringify(roi)), value: fillValue, outside } as Partial<Step>);
  return outside ? `Cleared ${image.name} outside ${roi.name} to ${fillValue}.` : `Filled ${roi.name} of ${image.name} with ${fillValue}.`;
}

/**
 * Calibrate the selected image by a line region: the line's length becomes the known pixel length, and the scale
 * follows the line from then on. Without a length, the current real length and unit are kept (1 µm when there are none).
 */
function calibrateFromLine(roiId: string, length?: number, unit?: LengthUnit): string | null {
  const doc = active, image = stepImage();
  const roi = image?.rois.find((item) => item.id === roiId);
  if (!doc || !image || !roi || roi.type !== "line") return null;
  const current = resolveCalibration(image.calibration, doc.project.calibration, settings.appCalibration).calibration;
  const next = lineCalibration(roi.id, roi.points, image.steps, length ?? current?.realLength ?? 1, unit ?? current?.unit ?? "µm", current?.aspect ?? 1);
  const problem = calibrationProblem(next);
  if (problem) return problem;
  setCalibration("image", next);
  return `${image.name} is calibrated by ${roi.name}: ${calibrationSummary(next)}.${length === undefined ? " Enter its real length in the Calibration section." : ""}`;
}

function selectRoi(imageId: string, roiId: string | null): void {
  if (!active) return;
  active.selectedRoi = roiId ? { imageId, roiId } : null;
  if (roiId) active.selection = new Set([imageId]);
  refresh();
}

/** Change a region of the selected image as one undoable edit; a change that would make it invalid is refused. */
function changeRoi(roiId: string, patch: Partial<Roi>): void {
  const image = stepImage();
  const roi = image?.rois.find((item) => item.id === roiId);
  if (!image || !roi) return;
  const problem = roiProblem({ ...roi, ...patch } as Roi);
  if (problem) { report(problem, "error"); return; }
  editActive((doc) => { Object.assign(doc.roi(image.id, roiId)!, patch); });
}

// MARK: thresholds

/** Whether threshold masks are drawn over their images: View › Show mask. Session only. */
let showMask = true;
/** View › Show calibration bar: off by default; session only. */
let showScaleBar = false;

/**
 * Set the current phase's threshold as one undoable edit: a new phase when the image has none, the current phase
 * removed with null. A range that cannot apply is refused with its reason.
 */
function setThreshold(next: Threshold | null): string | null {
  const doc = active, image = stepImage();
  if (!doc || !image) return null;
  const working = doc.ready(image.id)?.working;
  const problem = next && working ? thresholdProblem(next, working) : null;
  if (problem) { report(problem, "error"); return null; }
  const phase = doc.phase(image);
  if (!next) return phase ? removePhase(phase.id) : `${image.name} has no phase.`;
  if (!phase) return addPhase(next);
  // The Threshold step keeps the range; the mask operations are the mask steps after it.
  editActive((current) => { thresholdStep(current.image(image.id)!.steps)!.phases.find((item) => item.id === phase.id)!.threshold = rangeOnly(next); });
  const mask = doc.mask(image.id, phase.id)?.result;
  return `${image.name}, ${phase.name}: ${thresholdSummary(next)}${maskReport(mask, working)}.`;
}

/** What a threshold found, for its report: the split a method chose, the range kept, and the share of pixels masked. */
function maskReport(mask: { t: number | null; low: number; high: number; count: number } | null | undefined, working: Raster | null | undefined): string {
  if (!mask) return "";
  const total = working ? imagePixels(working) : 0;
  const split = mask.t !== null ? `, split at ${mask.t} (keeps ${mask.low} to ${mask.high})` : "";
  return `${split}, ${mask.count} px masked${total ? ` (${((mask.count / total) * 100).toFixed(1)}%)` : ""}`;
}

/** The threshold a new phase starts with: the image's threshold method in effect, or every colour on a colour image. */
function startingThreshold(image: ProjectImage, working: Raster): Threshold {
  return working.channels === 3 ? startThreshold("colour", null, null, 255)! : startThreshold(imageSettingsOf(image).thresholdMode, null, null, maxValue(working.bitDepth))!;
}

/**
 * Add a phase to the selected image's Threshold step, with a threshold (else the image's method in effect), and make it
 * current; without a Threshold step, one is added at the end of the grey steps. The Threshold step becomes current.
 */
function addPhase(threshold?: Threshold): string {
  const doc = active, image = stepImage(), working = image ? doc?.ready(image.id)?.working : null;
  if (!doc || !image || !working) return "Select one image that is shown to add a phase.";
  const start = rangeOnly(threshold ?? startingThreshold(image, working));
  const problem = thresholdProblem(start, working);
  if (problem) return problem;
  const existing = thresholdStep(image.steps);
  const phase = newPhase(existing?.phases ?? [], start, imageSettingsOf(image).maskColour);
  let stepId = existing?.id ?? "";
  editSteps((steps) => {
    const target = thresholdStep(steps);
    if (target) { target.phases.push(phase); target.enabled = true; return; }
    const step = { ...newStep("threshold", steps, shapeBefore(doc, image, steps.length)), phases: [phase] } as Step;
    stepId = step.id;
    steps.splice(insertIndex(steps, "threshold"), 0, step);
  });
  doc.currentStep.set(image.id, stepId);
  doc.currentPhase.set(image.id, phase.id);
  refresh();
  const mask = doc.mask(image.id, phase.id)?.result;
  return `Added ${phase.name} to ${image.name}: ${thresholdSummary(start)}${maskReport(mask, working)}.`;
}

/**
 * Remove a phase from the Threshold step, with the mask steps that act on it alone. Removing the last phase removes the
 * Threshold step and the mask steps after it.
 */
function removePhase(id: string): string {
  const doc = active, image = stepImage(), phase = image ? thresholdStep(image.steps)?.phases.find((item) => item.id === id) : undefined;
  if (!doc || !image || !phase) return "There is no such phase.";
  const last = thresholdStep(image.steps)!.phases.length === 1;
  editSteps((steps) => {
    const target = thresholdStep(steps)!;
    target.phases = target.phases.filter((item) => item.id !== id);
    const kept = steps.filter((step) => (last ? step.type !== "threshold" && step.type !== "mask" : !(step.type === "mask" && step.phase === id)));
    steps.splice(0, steps.length, ...kept);
  });
  doc.currentPhase.delete(image.id);
  if (last) doc.currentStep.delete(image.id);
  refresh();
  return last ? `Removed ${phase.name} and the Threshold step from ${image.name}.` : `Removed ${phase.name} from ${image.name}.`;
}

function selectPhase(id: string): void {
  const image = stepImage();
  if (!active || !image) return;
  active.currentPhase.set(image.id, id);
  refresh();
}

function changePhase(id: string, patch: Partial<Pick<Phase, "name" | "colour">>): string | null {
  const image = stepImage(), phases = image ? thresholdStep(image.steps)?.phases ?? [] : [], phase = phases.find((item) => item.id === id);
  if (!image || !phase) return null;
  if (patch.name !== undefined) { const problem = phaseNameProblem(patch.name, phases.filter((item) => item.id !== id)); if (problem) { report(problem, "error"); return null; } }
  // The phase is the step's own object, which the edit changes: its name is read first.
  const before = phase.name;
  editActive((doc) => { Object.assign(thresholdStep(doc.image(image.id)!.steps)!.phases.find((item) => item.id === id)!, patch); });
  return patch.name !== undefined ? `Renamed ${before} to ${patch.name}.` : `${before} is drawn in ${patch.colour}.`;
}

function setMaskDisplay(mode: MaskDisplay): void {
  const image = stepImage();
  if (image) editActive((doc) => { const target = doc.image(image.id)!; if (mode === "colours") delete target.maskDisplay; else target.maskDisplay = mode; });
}

/** The current phase's threshold choice of the selected image for the menus, or null when no image is shown. */
function thresholdChoice(doc: PlotDocument | null): ThresholdChoice | null {
  const image = stepImage(doc), working = image ? doc!.ready(image.id)?.working : null;
  if (!image || !working) return null;
  return doc!.phase(image)?.threshold.mode ?? "none";
}

// MARK: settings layers

/** An image's settings in effect: the built-in values, the app's, then the image's own overrides. */
const imageSettingsOf = (image: ProjectImage): ImageSettings => effective(BUILT_IN_IMAGE, settings.imageSettings, image.settings);
/** The export options in effect for a document: the app's, then the document's per-export overrides. */
const exportOptionsOf = (doc: PlotDocument | null): ExportOptions => effective(BUILT_IN_EXPORT, settings.exportOptions, doc?.exportOverride ?? {});

/** Set or reset one of the selected image's overrides (null: all), as one undoable edit; a value equal to the app's is no override. */
function setImageSetting<K extends keyof ImageSettings>(key: K | null, value?: ImageSettings[K]): void {
  const image = stepImage();
  if (!image) return;
  editActive((doc) => {
    const target = doc.image(image.id)!;
    target.settings = key === null ? {} : value === undefined ? resetOverride(target.settings, key) : setOverride(BUILT_IN_IMAGE, settings.imageSettings, target.settings, key, value);
  });
}

// MARK: measurements and results

/**
 * Document › Measure: the selected region of the selected image, or each of its regions, or the whole image when it has
 * none; one results row each, with a copy of what it was measured from. One undoable edit.
 */
function measureSelection(): string {
  const doc = active, image = stepImage();
  if (!doc || !image) return "Select one image to measure.";
  const ready = doc.ready(image.id);
  if (!ready) return `${image.name} is not shown, so it cannot be measured.`;
  const selectedRoi = doc.selectedRoi?.imageId === image.id ? image.rois.find((roi) => roi.id === doc.selectedRoi!.roiId) : undefined;
  const regions = selectedRoi ? [selectedRoi] : image.rois.length ? image.rois : [null];
  const calibration = resolveCalibration(image.calibration, doc.project.calibration, settings.appCalibration).calibration;
  const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const rows: ResultRow[] = [];
  // One row per phase and region; an image without phases has one per region, every pixel counted.
  const imagePhases = stepPhases(image.steps), phases = imagePhases.length ? imagePhases : [null];
  for (const roi of regions) for (const phase of phases) {
    const record = {
      imageId: image.id, imageName: image.name, file: image.file, crc32: image.source.crc32, steps: copy(image.steps), threshold: phase ? copy(phase.threshold) : null,
      ...(phase ? { phase: phase.name } : {}),
      roi: copy(roi), calibration: copy(calibration), measured: [...imageSettingsOf(image).measurements],
      ...(imageSettingsOf(image).limitToThreshold ? { limitToThreshold: true } : {}), ...(image.density ? { density: copy(image.density) } : {}),
    };
    rows.push({ id: "", ...record, ...measureRecord(ready.decoded.raster, record, doc.others(image.id)) });
  }
  editActive((current) => { for (const row of rows) current.project.results.push({ ...row, id: newResultId(current.project.results) }); });
  selectBottom("results");
  const coverage = doc.coverage(image.id);
  if (coverage?.overlap) report(`${coverage.overlap} px of ${image.name} lie in more than one phase and are counted in each, so its phase fractions add up to more than 100%.`, "warning");
  const what = `${regions.length === 1 ? regions[0]?.name ?? "the whole image" : `${regions.length} regions`}${imagePhases.length ? `, ${imagePhases.length} phase${imagePhases.length === 1 ? "" : "s"}` : ""}`;
  return `Measured ${what} of ${image.name}: ${rows.length} row${rows.length === 1 ? "" : "s"}.`;
}

/**
 * Measure every row again from its record (`results check`): the same values and the same mask (its CRC-32), or which
 * rows differ and why. Rows whose image is not shown are not checked, and say so.
 */
function checkResults(doc: PlotDocument): string[] {
  const lines: string[] = [];
  doc.project.results.forEach((row, index) => {
    const ready = doc.ready(row.imageId), image = doc.image(row.imageId);
    if (!ready || !image) { lines.push(`Row ${index + 1}: not checked; ${row.imageName} is not shown.`); return; }
    if (image.source.crc32 !== row.crc32) { lines.push(`Row ${index + 1}: not checked; the file of ${row.imageName} has changed since it was measured.`); return; }
    const again = measureRecord(ready.decoded.raster, row, doc.others(row.imageId));
    const sameMask = !row.mask || (again.mask?.crc32 === row.mask.crc32 && again.mask.count === row.mask.count);
    const sameValues = JSON.stringify(again.values) === JSON.stringify(row.values);
    lines.push(`Row ${index + 1}: ${sameValues && sameMask ? `same values${row.mask ? `, same mask (${row.mask.count} px, CRC-32 ${row.mask.crc32})` : ""}` : `${sameMask ? "same mask" : "a different mask"}, ${sameValues ? "same values" : "different values"}`}.`);
  });
  return lines.length ? lines : ["The results table is empty."];
}

function setMeasurements(next: MeasureKey[]): void {
  const image = stepImage();
  if (image) setImageSetting("measurements", next);
}

function clearResults(): string | null {
  if (!active?.project.results.length) return null;
  const n = active.project.results.length;
  editActive((doc) => { doc.project.results = []; });
  return `Cleared ${n} result${n === 1 ? "" : "s"}.`;
}

/** File › Export results…: the table as CSV, through the shell's export (a download in the browser preview). */
async function exportResults(): Promise<string | null> {
  const doc = active;
  if (!doc?.project.results.length) return "The results table is empty.";
  const csv = resultsCsv(doc.project.results);
  const result = await exportFiles(exportHost(doc, "ask"), [{ name: `${stem(doc.name)} results`, format: EXPORT_FORMATS.csv, bytes: () => new TextEncoder().encode(csv) }]);
  if (!result) return null;
  return desktop ? `Exported ${doc.project.results.length} results to ${basename(result.written[0])}.` : `Downloaded ${result.written[0]}.`;
}

/** File › Export XY coordinates…: the selected image's pixels after its steps, only the selected region's when it has one. */
async function exportCoordinates(): Promise<string | null> {
  const doc = active, image = stepImage(doc);
  if (!doc || !image) return "Select one image first.";
  const ready = doc.ready(image.id);
  if (!ready) return `${image.name} is not shown, so its pixels cannot be exported.`;
  const selected = doc.currentRoi(), roi = selected?.image.id === image.id ? selected.roi : null;
  if (roi?.type === "line") return `${roi.name} is a line, which has no inside. Select a closed region, or none for the whole image.`;
  const region = roi ? roiMask(roi, ready.working) : null;
  const problem = xyProblem(ready.working, region);
  if (problem) return problem;
  const { csv, pixels } = xyCoordinatesCsv(ready.working, region);
  const name = `${stem(image.name)}${roi ? ` ${roi.name}` : ""} XY`;
  const result = await exportFiles(exportHost(doc, "ask"), [{ name, format: EXPORT_FORMATS.csv, bytes: () => new TextEncoder().encode(csv) }]);
  if (!result) return null;
  return desktop ? `Exported ${pixels} pixels to ${basename(result.written[0])}.` : `Downloaded ${result.written[0]}.`;
}

function runExportCoordinates(): void {
  void exportCoordinates().then((result) => { if (result) report(result, result.startsWith("Exported") || result.startsWith("Downloaded") ? "info" : "error"); })
    .catch((error) => report(`Couldn't export the coordinates: ${reason(error)}`, "error"));
}

function runExportResults(): void {
  void exportResults().then((result) => { if (result) report(result, result.startsWith("The results") ? "error" : "info"); })
    .catch((error) => report(`Couldn't export the results: ${reason(error)}`, "error"));
}

/** A results row selects its image and region, when they still exist. */
function selectResult(row: ResultRow): void {
  if (!active?.image(row.imageId)) { report(`${row.imageName} is no longer in the document.`, "warning"); return; }
  active.selection = new Set([row.imageId]);
  active.selectedRoi = row.roi && active.roi(row.imageId, row.roi.id) ? { imageId: row.imageId, roiId: row.roi.id } : null;
  refresh();
}

// MARK: crop handles, the eyedropper, labels, density standards, paste into a selection

/** The current Crop step of the one selected image, which the surface edits while the Crop tool is on. */
function cropEdit(): CropEdit | null {
  const doc = active, image = stepImage(), step = currentStep();
  if (!doc || !image || step?.type !== "crop" || !step.enabled) return null;
  const input = doc.inputOf(image.id, image.steps.indexOf(step));
  return input ? { image, step, input } : null;
}

/** A crop box dragged on the surface: the same change as typing its numbers, and the image keeps its content in place. */
function cropEdited(edit: CropEdit, before: string, start: CropBox, box: CropBox): void {
  const doc = active;
  if (!doc) return;
  const target = doc.image(edit.image.id), step = target?.steps.find((item) => item.id === edit.step.id);
  if (!target || !step) return;
  // The place before the drag: the preview kept the size in step with the box, so it is taken back from the start box.
  const kStart = target.width / Math.max(1, resultSize(target).width);
  const place = { x: target.x, y: target.y, width: start.width * kStart, height: start.height * kStart };
  Object.assign(step, box);
  // The preview kept the display size in step with the result, so this is the content pixels per result pixel.
  const k = target.width / Math.max(1, resultSize(target).width);
  target.x += (box.x - start.x) * k;
  target.y += (box.y - start.y) * k;
  Object.assign(target, resultSize(target));
  // A turned image keeps the content it shows where it was on the surface.
  keepTurnedPlace(target, place);
  if (doc.snapshot() === before) return;
  edited(doc, before);
  report(`${target.name}: Crop ${box.width} × ${box.height} px at ${box.x}, ${box.y}.`, "info");
}

/** Document › Threshold › Pick colour: the eyedropper, for the selected colour image. */
function pickColour(): void {
  const image = stepImage(), working = image ? active?.ready(image.id)?.working : null;
  if (!image || !working) { report("Select one image that is shown to pick a colour.", "error"); return; }
  if (working.channels !== 3) { report("Pick colour is for colour images. A grey image takes a grey threshold.", "error"); return; }
  eyedropper.activate();
}

/** The colour picker's choice: the selected image's colour ranges around it, in its model, ± the pick tolerance. */
function pickFrom(rgb: [number, number, number], tolerance = picker.tolerance): void {
  const image = stepImage(), threshold = image && active ? active.phase(image)?.threshold : null;
  if (!image || threshold?.mode !== "colour") return;
  const pick = { rgb: rgb.map((v) => Math.round(v * 100) / 100) as [number, number, number], tolerance };
  const result = setThreshold({ ...threshold, ranges: rangesAround(threshold.model, pick.rgb, tolerance), pick });
  if (result) report(`Chose RGB ${rgb.map((v) => Math.round(v)).join(", ")}. ${result}`, "info");
}

/** A colour picked from an image: its colour threshold's ranges around it, in its model (HSB for a new one). */
function colourPicked(image: ProjectImage, x: number, y: number): void {
  const doc = active, working = doc?.ready(image.id)?.working;
  if (!doc || !working) return;
  const colour = sampleColour(working, x, y, picker.size);
  if (!colour) { report(`${image.name} is not a colour image, so no colour can be picked from it.`, "error"); return; }
  doc.selection = new Set([image.id]);
  const phaseThreshold = doc.phase(image)?.threshold;
  const current = phaseThreshold?.mode === "colour" ? phaseThreshold : null;
  const model: ColourModel3 = current?.model ?? "hsb";
  const tolerance = current?.pick?.tolerance ?? picker.tolerance;
  const rgb = colour.map((v) => Math.round(v * 100) / 100) as [number, number, number];
  const next: Threshold = { mode: "colour", model, ranges: rangesAround(model, rgb, tolerance), pick: { rgb, tolerance }, ...(current?.operations ? { operations: current.operations } : {}) };
  const result = setThreshold(next);
  if (result) report(`Picked RGB ${colour.map((v) => Math.round(v)).join(", ")} at ${Math.floor(x)}, ${Math.floor(y)} (${picker.size} × ${picker.size} px). ${result}`, "info");
}

/** An image's calibration bar as the export options describe it, in a corner. */
function scaleBarOf(doc: PlotDocument, image: ProjectImage, widthPx: number, options: ExportOptions, place: ScaleBarDrawing["place"]): ScaleBarDrawing {
  const made = scaleBarFor(imageScale(doc, image), widthPx, 0.2, options.scaleBarLength);
  return { pixels: made.pixels, length: made.length, unit: made.unit, place, style: options.scaleBarStyle, blocks: options.scaleBarBlocks, size: options.scaleBarSize };
}

/** The calibration bar drawn over an image while View › Show calibration bar is on: the export's bar, in its corner (lower right when exports draw none). */
function surfaceScaleBar(image: ProjectImage): ScaleBarDrawing | null {
  const doc = active, ready = doc?.ready(image.id);
  if (!showScaleBar || !doc || !ready) return null;
  const options = exportOptionsOf(doc);
  return scaleBarOf(doc, image, ready.working.widthPx, options, options.scaleBar === "none" ? "lower-right" : options.scaleBar);
}

/** Add a label at the centre of the selected region, or of the image, as one edit. */
function addLabel(text?: string, at?: [number, number]): string {
  const doc = active, image = stepImage();
  if (!doc || !image) return "Select one image to label.";
  const roi = doc.currentRoi()?.image.id === image.id ? doc.currentRoi()!.roi : null;
  const [W, H] = [image.width, image.height];
  const bounds = roi ? roiBounds(roi) : null;
  const [x, y] = at ?? (bounds ? [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2] : [W / 2, H / 2]).map((v) => Math.round(v * 100) / 100) as [number, number];
  const labels = image.labels ?? [];
  const label: TextLabel = { id: newLabelId(labels), x, y, text: text ?? `Label ${labels.length + 1}` };
  const problem = labelProblem(label);
  if (problem) return problem;
  editActive((current) => { const target = current.image(image.id)!; target.labels = [...(target.labels ?? []), label]; });
  return `Added the label "${label.text}" to ${image.name} at ${formatMeasure(x)}, ${formatMeasure(y)} px.`;
}

function changeLabel(id: string, patch: Partial<TextLabel>): void {
  const image = stepImage(), label = image?.labels?.find((item) => item.id === id);
  if (!image || !label) return;
  const problem = labelProblem({ ...label, ...patch });
  if (problem) { report(problem, "error"); return; }
  editActive((doc) => { const target = doc.image(image.id)!.labels!.find((item) => item.id === id)!; Object.assign(target, patch); });
}

function removeLabel(id: string): string {
  const image = stepImage(), label = image?.labels?.find((item) => item.id === id);
  if (!image || !label) return "There is no such label.";
  editActive((doc) => { const target = doc.image(image.id)!; target.labels = target.labels!.filter((item) => item.id !== id); if (!target.labels.length) delete target.labels; });
  return `Removed the label "${label.text}" from ${image.name}.`;
}

/** Set or remove the selected image's density standard, as one edit; the fit is stated. */
function setDensity(next: DensityStandard | undefined): string | null {
  const image = stepImage();
  if (!image) return null;
  editActive((doc) => { const target = doc.image(image.id)!; if (next) target.density = next; else delete target.density; });
  if (!next) return `${image.name} has no density standard; optical density is uncalibrated.`;
  const problem = densityProblem(next);
  return problem ? `${image.name}: ${problem}` : `${image.name}: ${describeFit(fitDensity(next), next.points.length, formatMeasure)}.`;
}

/** A density point with the mean grey value of the selected region (or of the image) and the OD given (0 until typed). */
function addDensityPoint(od = 0, grey?: number): string | null {
  const doc = active, image = stepImage(), working = image ? doc?.ready(image.id)?.working : null;
  if (!doc || !image || !working) return "Select one image that is shown.";
  if (working.channels !== 1) return "A density standard needs a grey image. Add a Convert to grey step first.";
  let value = grey;
  if (value === undefined) {
    const roi = doc.currentRoi()?.image.id === image.id && doc.currentRoi()!.roi.type !== "line" ? doc.currentRoi()!.roi : null;
    const mean = measureRegion(working, roi ? roiMask(roi, working) : null, null, { x: 1, y: 1, unit: "px" }).mean;
    if (mean === null) return "The region has no pixels.";
    value = Math.round(mean * 100) / 100;
  }
  const standard: DensityStandard = image.density ? { ...image.density, points: [...image.density.points, { grey: value, od }] } : { fit: "linear", points: [{ grey: value, od }] };
  return setDensity(standard);
}

/** Edit › Paste into selection: the clipboard's image, kept in the document, pasted into the selected region as a step. */
async function pasteIntoSelection(): Promise<void> {
  const doc = active, at = doc?.currentRoi();
  if (!doc || !at || at.roi.type === "line") { report("Select a closed region to paste into.", "error"); return; }
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((kind) => /^image\/(png|jpeg|tiff)$/.test(kind));
      if (!type) continue;
      const bytes = new Uint8Array(await (await item.getType(type)).arrayBuffer());
      report(await pasteBytesInto(doc, at.image, at.roi, bytes, type), "info");
      return;
    }
    report("The clipboard holds no PNG, JPEG or TIFF image to paste.", "error");
  } catch (error) {
    report(`Couldn't read the clipboard: ${reason(error)}`, "error");
  }
}

/** The pasted bytes become an image of the document (as a plain paste makes), then a Paste step of the target reads it. */
async function pasteBytesInto(doc: PlotDocument, target: ProjectImage, roi: Roi, bytes: Uint8Array, type: string): Promise<string> {
  const extension = type === "image/jpeg" ? "jpg" : type === "image/tiff" ? "tif" : "png";
  const [pasted] = await addImages(doc, [{ path: null, file: `Pasted.${extension}`, bytes, embed: true }], false);
  if (!pasted) return "The pasted image could not be read.";
  doc.selection = new Set([target.id]);
  const region = JSON.parse(JSON.stringify(roi)) as Roi;
  addStep("paste", { imageId: pasted.id, region } as Partial<Step>);
  return `Pasted ${pasted.name} into ${roi.name} of ${target.name} as a step; ${target.name}'s original is unchanged.`;
}

// MARK: tools

function setTool(tool: Tool): void {
  if (tool === "select") toolModes.neutral();
  // A plot tool pressed again puts the pointer back.
  else if (isPlotTool(tool)) { plotFlyout.setTool(tool.slice(5)); toolModes.activate(tool, "Place", `a ${PLOT_KIND_NAMES[tool.slice(5) as PlotKind].toLowerCase()} plot`); }
  else if (tool === "crop") toolModes.activate(tool, "Draw", CROP_MODE_OBJECT);
  else if (tool === "pick") eyedropper.activate();
  else { regionFlyout.setTool(tool); toolModes.activate(tool, "Draw", ROI_MODE_OBJECTS[tool]); }
}

/** A Crop step from a drag on an image: the image becomes the only selection, then the step is added to it. */
function addCrop(imageId: string, box: CropBox): string {
  const doc = active!;
  doc.selection = new Set([imageId]);
  return addStep("crop", box);
}

// MARK: export and copy

/** The selected images that can be shown, in document order; exports and copies are made from their results. */
function exportable(doc: PlotDocument | null = active): ProjectImage[] {
  return doc ? doc.selectedImages().filter((image) => doc.ready(image.id)) : [];
}

/**
 * The shell's export host for a document: PlotForge's formats, the overwrite choice, and the document's linked images,
 * which are never written. `exportFiles` uses the desktop bridge, or downloads in the browser preview.
 */
function exportHost(doc: PlotDocument, overwrite: OverwriteChoice): ExportHost {
  return {
    bridge: desktop, formats: EXPORT_FORMAT_LIST, overwrite, folderTitle: "Export images to a folder",
    protectedPaths: () => doc.project.images.flatMap((image) => (image.path ? [image.path] : [])),
  };
}

/**
 * File › Export image…: the result of each selected image's enabled steps, as a new file in the export options' format.
 * PNG without overlays is lossless at the image's own depth; JPEG, and any picture with overlays, is 8-bit RGB. The
 * shell's `exportFiles` takes it from there: one image through the export dialog (which asks before replacing a file),
 * several into a chosen folder, where the overwrite choice decides (IMAGE-ANALYSIS.md, Export). Originals are never
 * written. Returns the result sentence, or null when cancelled.
 */
async function exportSelection(options: ExportOptions = exportOptionsOf(active), plotFormat?: PlotExportFormat): Promise<string | null> {
  const doc = active;
  const images = exportable(doc);
  if (doc && !images.length && doc.project.plots.some((plot) => doc.selection.has(plot.id))) return exportPlots(doc, plotFormat);
  if (!doc || !images.length) return "Select images or plots to export.";
  const bytesOf = (image: ProjectImage) => {
    const ready = doc.ready(image.id)!;
    if (options.format === "png" && !options.includeOverlays && options.scaleBar === "none") return exportPng(ready.working);
    const overlays = options.includeOverlays ? { masks: doc.overlays(image.id), rois: image.rois, labels: image.labels ?? [] } : null;
    const bar = options.scaleBar === "none" ? null : scaleBarOf(doc, image, ready.working.widthPx, options, options.scaleBar);
    return exportPicture(ready.working, options.format, options.jpegQuality, overlays, bar);
  };
  const result = await exportFiles(exportHost(doc, options.overwrite), images.map((image) => ({ name: image.name, format: EXPORT_FORMATS[options.format], bytes: () => busy(async () => bytesOf(image)) })));
  if (!result) return null;
  if (options.format === "jpeg") report(`JPEG is lossy: the exported values differ from the image's, and 16 bits become 8. Use PNG for measurement.`, "warning", doc);
  if (!desktop) return images.length === 1 ? `Downloaded ${result.written[0]}.` : `Downloaded ${images.length} files.`;
  return images.length === 1 ? `Exported ${images[0].name} to ${basename(result.written[0])}.` : `Exported ${images.length} images to ${basename(dirname(result.written[0]))}.`;
}

/**
 * Edit › Copy: the selected text where there is some; chosen worksheet cells as text; otherwise the selected objects
 * (images, worksheets, plots), to paste in this document or another. Copy as image puts a picture on the clipboard.
 */
async function copy(): Promise<void> {
  const text = window.getSelection()?.toString() ?? "";
  // Chosen cells of a worksheet are copied as text, as a spreadsheet copies them.
  if (!typing() && !text && cellsChosen()) { await copyCells(); return; }
  const doc = active;
  if (typing() || text || !doc?.selection.size) { document.execCommand("copy"); return; }
  const said = await copyObjects(doc);
  if (said) report(said, "info");
}

/**
 * Export the selected plots, each in its own format (the inspector's Export section) or in `format` for this export
 * only: an SVG drawing, or a PNG or JPEG drawn at the plot's resolution, so a plot is never a scaled bitmap.
 */
async function exportPlots(doc: PlotDocument, format?: PlotExportFormat): Promise<string | null> {
  const how = plotExportDefaults();
  const plots = doc.project.plots.filter((plot) => doc.selection.has(plot.id)).map((plot) => ({ ...plot, exportFormat: format ?? how.format, exportDpi: how.dpi }));
  const result = await exportFiles(exportHost(doc, exportOptionsOf(doc).overwrite), plots.map((plot) => ({
    name: plot.name, format: EXPORT_FORMATS[plot.exportFormat], bytes: () => busy(() => plotExportBytes(plot, doc.plotSources(), exportOptionsOf(doc).jpegQuality)),
  })));
  if (!result) return null;
  const what = plots.length === 1 ? `${plots[0].name} as ${PLOT_EXPORT_NAMES[plots[0].exportFormat]}${plots[0].exportFormat === "svg" ? "" : ` at ${plots[0].exportDpi} dpi`}` : `${plots.length} plots`;
  if (!desktop) return plots.length === 1 ? `Downloaded ${what}: ${result.written[0]}.` : `Downloaded ${what}.`;
  return plots.length === 1 ? `Exported ${what} to ${basename(result.written[0])}.` : `Exported ${what} to ${basename(dirname(result.written[0]))}.`;
}

function runExport(): void {
  void exportSelection().then((result) => { if (result) report(result, result.startsWith("Select") ? "error" : "info"); })
    .catch((error) => report(`Couldn't export: ${reason(error)}`, "error"));
}

// MARK: calibration

/** The scale of an image's result: its calibration in effect, with the quarter turns of its steps. */
function imageScale(doc: PlotDocument, image: ProjectImage): Scale {
  return scaleAfterSteps(scaleOf(resolveCalibration(image.calibration, doc.project.calibration, settings.appCalibration).calibration), image.steps);
}

/** Set the selected image's own calibration, or the document's default, as one undoable edit. */
function setCalibration(target: "image" | "document", next: ImageCalibration): string | null {
  const image = stepImage();
  if (!active || (target === "image" && !image)) return null;
  editActive((doc) => {
    if (target === "document") doc.project.calibration = next === "pixels" ? null : next;
    else doc.image(image!.id)!.calibration = next;
  });
  if (target === "document") return active.project.calibration ? `The document's default calibration is ${calibrationSummary(active.project.calibration)}.` : "Images that follow the document's default are measured in pixels.";
  return next === null ? `${image!.name} follows the document's default calibration.` : next === "pixels" ? `${image!.name} is measured in pixels.` : `${image!.name} is calibrated: ${calibrationSummary(next)}.`;
}

/** The shell's record of text typed in a field since it gained the focus (`createTextInputState`). */
const textInput = createTextInputState();
/** A text field has the focus: the clipboard and Select all act on its text. */
const typing = () => textInput.isTextEntry(document.activeElement);

/** Edit › Undo and Redo: the field's own history while text typed in it is undoable, otherwise the document's. */
function undo(redo = false): void {
  if (textInput.typingInField()) { document.execCommand(redo ? "redo" : "undo"); return; }
  undoDocument(redo);
}

function undoDocument(redo: boolean): void {
  if (active && (redo ? active.redo() : active.undo())) { autosave.edited(active); keepDraft(active); refresh(); }
}

function selectAll(): void {
  if (typing()) { (document.activeElement as HTMLInputElement).select(); return; }
  if ($("terminal-pane").contains(document.activeElement)) { terminal.selectAll(); return; }
  if (!active) return;
  // With a series or point of a plot chosen, Select All chooses every point of that series.
  if (workspace.selectAllPoints()) { refreshStatus(); return; }
  active.selection = new Set(active.objects().map((object) => object.id));
  refresh();
}

type Arrangement = "bringForward" | "sendBackward" | "bringToFront" | "sendToBack";
/**
 * Arrange (Cmd+] and Cmd+[, with Shift to the front or back): the selected objects move up or down the drawing order
 * among their own kind, as one undoable edit; images are drawn first, then worksheets, then plots.
 */
function arrange(how: Arrangement): void {
  const doc = active;
  if (!doc?.selection.size) return;
  const move = <T extends { id: string }>(list: T[]): T[] => {
    const chosen = (item: T) => doc.selection.has(item.id);
    if (how === "bringToFront") return [...list.filter((item) => !chosen(item)), ...list.filter(chosen)];
    if (how === "sendToBack") return [...list.filter(chosen), ...list.filter((item) => !chosen(item))];
    const out = [...list], up = how === "bringForward";
    const order = up ? [...out.keys()].reverse() : [...out.keys()];
    for (const i of order) {
      const j = up ? i + 1 : i - 1;
      if (j < 0 || j >= out.length || !chosen(out[i]) || chosen(out[j])) continue;
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  editActive((current) => { current.project.images = move(current.project.images); current.project.data = move(current.project.data); current.project.plots = move(current.project.plots); });
}

// MARK: messages and status

function report(text: string, kind: "info" | "error" | "warning", doc: PlotDocument | null = active): void {
  logOf(doc).add(kind as MessageKind, text);
  if (doc === active) { if (kind === "info") hint = text; refreshStatus(); messagesPanel.refresh(true); }
}
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

/** The pixel under the pointer, in the result of its image's steps; session only. */
let pointer: { image: ProjectImage; pixel: PixelValue } | null = null;

/**
 * The readout of a pixel: its coordinates, their real position when the image is calibrated (the pixel's top-left
 * corner from the image's top-left), and its grey value or its red, green and blue.
 */
function pixelReadout(pixel: PixelValue, scale: Scale | null): string[] {
  const at = scale && scale.unit !== "px" ? positionOf(pixel.x, pixel.y, scale) : null;
  return [
    `${pixel.x}, ${pixel.y} px`, ...(at ? [`${formatMeasure(at[0])}, ${formatMeasure(at[1])} ${scale!.unit}`] : []),
    pixel.values.length === 1 ? `Grey ${pixel.values[0]}` : `R ${pixel.values[0]} G ${pixel.values[1]} B ${pixel.values[2]}`,
  ];
}

let hint: string | null = null;
let hintTimer = 0;
const HINT_MS = 4000;
function refreshStatus(): void {
  const doc = active;
  const selected = doc?.selection.size ?? 0;
  const one = selected === 1 ? doc!.selectedObjects()[0] : undefined;
  const cells = one && doc!.selectedColumn?.id === one.id && !selectionEmpty(doc!.selectedColumn.cells) ? ` ${selectionText(doc!.selectedColumn.cells, columnLetters)}` : "";
  // A chosen part of the selected plot follows its name: "Plot 1 › Series 2".
  const part = doc?.selectedPart(), plot = doc?.selectedPlot();
  const partText = part && plot && part.kind !== "plot" ? ` › ${partName(part, plot.series)}` : "";
  const detail = !doc ? "" : selected === 1 ? `${one?.name ?? doc.name}${cells}${partText}` : selected > 1 ? `${selected} objects selected` : doc.name;
  // A chosen point is described in the status bar while the pointer is on no other point.
  if (!pointHovering) pointDetails.show(chosenPointLines());
  if (hint) { clearTimeout(hintTimer); hintTimer = window.setTimeout(() => { hint = null; refreshStatus(); }, HINT_MS); }
  const log = logOf(doc);
  status.render({
    stateLabel: "Ready", stateColor: "var(--text3)", summary: "", detail, hint, unseenProblems: log.unseen,
    readouts: doc ? [...(pointer ? pixelReadout(pointer.pixel, imageScale(doc, pointer.image)) : []), doc.project.grid.snap ? `Grid ${doc.project.grid.spacing} px` : "Snap off", `${workspace.zoomPercent()}%`] : [],
  });
}

// MARK: menus and actions

const nativeAppMenu = !!desktop && mac;
function menus(): MenuNode[] {
  const doc = active, image = stepImage(doc), step = currentStep(doc);
  return plotMenus({
    hasDocument: !!doc, canUndo: !!doc?.canUndo, canRedo: !!doc?.canRedo, hasSelection: !!doc?.selection.size, snap: doc?.project.grid.snap ?? false,
    canAddStep: !!image && !!doc?.ready(image.id), canRepeat: !!lastAdded,
    tool: workspace.currentTool, hasRoi: !!doc?.currentRoi(), threshold: thresholdChoice(doc), showMask,
    colourThreshold: !!image && doc?.ready(image.id)?.working.channels === 3, showScaleBar,
    phases: image ? stepPhases(image.steps).length : 0, hasThresholdStep: !!image && !!thresholdStep(image.steps), maskDisplay: image?.maskDisplay ?? "colours",
    canCopyImage: doc?.selection.size === 1 && (!!doc.selectedPlot() || exportable(doc).length === 1),
    canPasteInto: !!doc?.currentRoi() && doc.currentRoi()!.roi.type !== "line" && !!doc.ready(doc.currentRoi()!.image.id),
    canMeasure: !!image && !!doc?.ready(image.id), hasResults: !!doc?.project.results.length,
    canPlot: !!doc,
    canExport: exportable(doc).length > 0,
    step: image && step ? { enabled: step.enabled, first: image.steps[0] === step, last: image.steps.at(-1) === step } : null,
    showInspector: settings.showInspector, showBottomPanel: settings.showBottomPanel, appearance: settings.appearance, autosave: settings.autosave,
    recent: files ? recent.list() : [], nativeAppMenu, desktop: !!desktop, mac,
  });
}

/** Snap to grid is a document option: saved and marking the document dirty, outside Undo. */
function setSnap(on: boolean): void {
  if (!active?.setOption((project) => { project.grid.snap = on; })) return;
  autosave.edited(active);
  keepDraft(active);
  refresh();
}

function run(id: string): void {
  if (id === "file.new") createDocument();
  else if (id === "file.open") void open();
  else if (id === "file.import") void importImages();
  else if (id === "file.export") runExport();
  else if (id === "file.exportResults") runExportResults();
  else if (id === "file.exportXY") runExportCoordinates();
  else if (id === "document.measure") report(measureSelection(), "info");
  else if (id.startsWith("document.plot.")) { const result = insertPlot(id.slice(14) as PlotKind); report(result.text, result.ok ? "info" : "error"); }
  else if (id === "document.results.clear") { const result = clearResults(); if (result) report(result, "info"); }
  else if (id === "edit.copy") void copy();
  else if (id.startsWith("document.tool.") && active) setTool(id.slice(14) as Tool);
  else if (id === "document.threshold.pick") pickColour();
  else if (id === "document.phase.add") report(addPhase(), "info");
  else if (id === "document.phase.remove" && active && stepImage()) { const phase = active.phase(stepImage()!); if (phase) report(removePhase(phase.id), "info"); }
  else if (id.startsWith("document.show.")) setMaskDisplay(id.slice(14) as MaskDisplay);
  else if (id.startsWith("document.threshold.") && active) {
    const image = stepImage(), working = image ? active.ready(image.id)?.working : null;
    // "default" starts the image's threshold mode in effect; the others name their method.
    const choice = id.slice(19) === "default" && image ? imageSettingsOf(image).thresholdMode : id.slice(19) as ThresholdChoice;
    if (image && working) { const result = setThreshold(startThreshold(choice, active.phase(image)?.threshold ?? null, active.mask(image.id), working.bitDepth === 16 ? 65535 : 255)); if (result) report(result, "info"); }
  }
  else if (id === "view.mask") { showMask = !showMask; refresh(); }
  else if (id === "view.scaleBar") { showScaleBar = !showScaleBar; refresh(); }
  else if (id === "edit.pasteInto") void pasteIntoSelection();
  else if (id === "document.label.add") report(addLabel(), "info");
  else if (id === "document.roi.crop" && active?.currentRoi()) report(cropToRegion(active.currentRoi()!.roi.id), "info");
  else if (id === "document.roi.hull" && active?.currentRoi()) report(regionHull(active.currentRoi()!.roi.id), "info");
  else if ((id === "document.roi.fill" || id === "document.roi.clear") && active?.currentRoi()) report(fillRegion(active.currentRoi()!.roi.id, id === "document.roi.clear"), "info");
  else if (id === "document.roi.remove" && active?.currentRoi()) { const { image, roi } = active.currentRoi()!; report(removeRoi(image.id, roi.id), "info"); }
  else if (id === "file.save" && active) void save(active);
  else if (id === "file.saveAs" && active) void save(active, true);
  else if (id === "file.close") void close();
  else if (id === "file.recent.clear") { recent.clear(); refreshMenus(); }
  else if (id.startsWith("file.recent.")) { const path = recent.list()[Number(id.slice(12))]; if (path) void openRecent(path); }
  else if (id.startsWith("file.autosave.")) { const choice = parseAutosave(id.slice(14)); if (choice) store.updateSettings({ autosave: choice }); }
  else if (id === "edit.undo") undo();
  else if (id === "edit.redo") undo(true);
  else if (id === "edit.cut") void cut();
  else if (id === "edit.paste") { if (typing()) document.execCommand("paste"); else void pasteFromClipboard(); }
  else if (id === "edit.duplicate") duplicateImages();
  else if (id === "edit.copyImage") void copyAsImage();
  else if (id === "edit.deselect") { if (active?.selection.size) { active.selection = new Set(); active.plotPart = null; refresh(); } }
  else if (id.startsWith("arrange.")) arrange(id.slice(8) as Arrangement);
  else if (id === "edit.delete" && active?.selection.size) removeSelection(active);
  else if (id === "edit.selectAll") selectAll();
  else if (id === "view.zoomIn") workspace.zoomBy(ZOOM_STEP);
  else if (id === "view.zoomOut") workspace.zoomBy(1 / ZOOM_STEP);
  else if (id === "view.fit") workspace.fit();
  else if (id === "view.actualSize") workspace.actualSize();
  else if (id === "view.snap" && active) setSnap(!active.project.grid.snap);
  else if (id === "view.inspector") store.updateSettings({ showInspector: !settings.showInspector });
  else if (id === "view.bottomPanel") store.updateSettings({ showBottomPanel: !settings.showBottomPanel });
  else if (id.startsWith("view.theme.")) store.updateSettings({ appearance: id.slice(11) as Settings["appearance"] });
  else if (id.startsWith("document.step.")) { const result = stepAction(id); if (result) report(result, "info"); }
  else if (id === "about") showAbout(info);
  else if (id === "about.whatsNew") void showWhatsNew(info);
  else if (id === "about.shortcuts") showShortcuts(info, menuShortcutGroups(menus(), (key) => shortcutText(key)));
  else if (id === "about.licenses") void showLicenses(info);
  else if (id === "app.settings") openSettings();
}

// MARK: frame

applyDesktopClasses(desktop ?? undefined);
installScrollbars();
// The shell's caret in every text field and textarea, fading as it blinks unless Settings › General turns it off.
installTextCaret({ smoothBlink: () => settings.smoothFieldCaret });
const strip = createToolStrip($("toolstrip"), run);
/** A tool for a standard action, with the label and key of its standard menu item. */
const standardTool = (action: StandardAction, icon: string) => { const item = standardItem(action); return strip.tool({ id: action, label: item.label!, icon, shortcut: item.key }); };
strip.group([standardTool("edit.undo", TOOL_ICONS.undo), standardTool("edit.redo", TOOL_ICONS.redo)], "", "history");
// Clipboard and object edits: Cut, Copy, Paste, Duplicate, Rotate (a step on the selected image), Delete.
const rotateItem = ADD_STEP_ITEMS.find((item) => item.id === "rotate-cw")!;
strip.group([
  standardTool("edit.cut", TOOL_ICONS.cut), standardTool("edit.copy", TOOL_ICONS.copy), standardTool("edit.paste", TOOL_ICONS.paste),
  standardTool("edit.duplicate", UI_ICONS.duplicate),
  strip.tool({ id: "document.step.add.rotate-cw", label: rotateItem.label, icon: UI_ICONS.rotate }),
  standardTool("edit.delete", UI_ICONS.delete),
], "", "clipboard");
strip.group([standardTool("view.zoomOut", TOOL_ICONS.zoomOut), standardTool("view.zoomIn", TOOL_ICONS.zoomIn), standardTool("view.fit", TOOL_ICONS.fit)], "", "view");
// The pointer's tools: Select, and the region tools in one flyout. Each has a bare key (the Tool tier).
const selectTool = strip.tool({ id: "document.tool.select", label: "Select", icon: SELECT_ICON, shortcut: SELECT_KEY });
const regionFlyout = createFlyoutGroup({
  id: "document.tool.region", label: "Region",
  tools: ROI_TOOLS.map((tool) => ({ id: tool.type, label: ROI_LABELS[tool.type], icon: tool.icon, shortcut: tool.key })),
  onSelect: (id) => setTool(id as RoiType),
});
regionFlyout.button.addEventListener("dblclick", () => setTool(regionFlyout.tool.id as RoiType));
const cropTool = strip.tool({ id: "document.tool.crop", label: CROP_LABEL, icon: CROP_ICON, shortcut: CROP_KEY });
// New plots, as Excel's Insert › Chart: one flyout of the plot kinds, as Region's; the kind chosen places its plot where
// the work surface is clicked, and a double click arms the kind shown again.
const plotFlyout = createFlyoutGroup({
  id: "document.tool.plot", label: "Plot",
  tools: PLOT_KINDS.map((kind) => ({ id: kind, label: PLOT_KIND_NAMES[kind], icon: PLOT_KIND_ICONS[kind], shortcut: PLOT_TOOL_KEYS[kind] })),
  onSelect: (kind) => setTool(`plot-${kind as PlotKind}`),
});
plotFlyout.button.addEventListener("dblclick", () => setTool(`plot-${plotFlyout.tool.id as PlotKind}`));
// The shell's order: the pointer alone, then PlotForge's tools in one group: Crop, then the Region and Plot flyouts.
strip.group([selectTool], "", "app");
strip.group([cropTool, regionFlyout.button, plotFlyout.button], "", "app");
const toolModes = createToolModes({
  setSelected: () => {},
  setMode: (label) => strip.setMode(label),
}, (id) => {
  workspace.setTool((id === EYEDROPPER_ID ? "pick" : id ?? "select") as Tool);
  selectTool.classList.toggle("selected", !id);
  cropTool.classList.toggle("selected", id === "crop");
  regionFlyout.setSelected(!!id && id !== "crop" && id !== EYEDROPPER_ID && !isPlotTool(id));
  plotFlyout.setSelected(!!id && isPlotTool(id));
  refreshMenus();
});
selectTool.classList.add("selected");
/**
 * The shell's eyedropper (4.1.0) over the work surface: it owns the mode, the crosshair and the averaging square; a
 * click on an image reads the colour of its result there, averaged over the square, for the colour threshold.
 */
const eyedropper = createEyedropper(toolModes, {
  surface: $("work-surface"), size: picker.size, onSize: (n) => { picker.size = n; inspector.render(active); },
  scale: () => workspace.viewport().scale,
  toContent: (clientX, clientY) => {
    if (!active) return null;
    const rect = workspace.canvas.getBoundingClientRect();
    const [x, y] = workspace.viewport().toWorld(clientX - rect.left, clientY - rect.top);
    return objectAt(active.project.images, x, y) ? { x, y } : null;
  },
  onPick: (x, y) => {
    // The shell floors the content point; the pixel's centre is used to find the image and its pixel.
    const image = active ? objectAt(active.project.images, x + 0.5, y + 0.5) : null;
    const ready = image ? active!.ready(image.id) : null;
    if (!image || !ready) return;
    colourPicked(image, ((x + 0.5 - image.x) * ready.working.widthPx) / image.width, ((y + 0.5 - image.y) * ready.working.heightPx) / image.height);
  },
});
strip.group([
  strip.tool({ id: "file.import", label: "Import…", icon: UI_ICONS.import, shortcut: IMPORT_KEY }),
  strip.tool({ id: "file.export", label: "Export…", icon: UI_ICONS.export, shortcut: EXPORT_KEY }),
], "", "app");
strip.finish();
const status = new StatusBar($("statusbar"), () => selectBottom("messages"));
/**
 * The plot point under the pointer, or the one chosen, described once (forge-shell hover details): its series' name, then
 * X, Y, its error and label, in the status bar and, while the pointer is on it, in the shell's hover card.
 */
const pointDetails = createHoverDetails({ empty: "Hover or click a point.", statusBar: status, card: () => settings.hoverCard });
/** Whether the pointer is on a point; while it is, the status bar describes that point rather than the chosen one. */
let pointHovering = false;
/** The chosen point's lines, when one point of the selected plot is chosen; null otherwise. */
function chosenPointLines(): string[] | null {
  const doc = active, plot = doc?.selectedPlot(), part = doc?.selectedPart();
  return doc && plot && part?.kind === "point" ? pointLines(pointInfo(plot, part.series, part.index, doc.plotSources())) : null;
}
const applyLayout = createPanelLayout({ center: $("center"), inspector: $("inspector"), inspectorSplit: $("inspector-split"), bottom: $("bottom"), bottomSplit: $("bottom-split"),
  settings, defaults: { inspectorWidth: DEFAULTS.inspectorWidth, bottomPanelHeight: DEFAULTS.bottomPanelHeight }, save: (change) => store.updateSettings(change),
  afterApply: () => {
    // applyAppearance resolves System to light or dark and follows the system while it is chosen.
    applyAppearance(settings.appearance, document.body, () => { desktop?.setTitleBar(titleBarColors()); requestAnimationFrame(() => workspace.draw()); });
    document.body.dataset.inspectorSide = settings.inspectorSide; requestAnimationFrame(() => workspace.draw()); } });
// The Messages tab's one action, shown at the right of the tab bar only while Messages is selected; MessagesPanel runs it.
const clearButton = Object.assign(document.createElement("button"), { className: "tab-action messages-clear", textContent: "Clear" });
setTip(clearButton, "Clear the messages.");
const messagesPanel = new MessagesPanel($("messages-pane"), {
  subjectName: () => null, selectSubject: () => {},
}, clearButton);
const selectBottom = createBottomTabs<"terminal" | "measure" | "results" | "charts" | "messages">($("bottom-tabs"), [
  { name: "terminal", element: $("terminal-pane"), onSelect: () => terminal.show() },
  // The selected image's regions and what Measure takes (forge-shell 9.0.0: they left the inspector, which holds the image's own rows).
  { name: "measure", element: $("measure-pane"), onSelect: () => inspector.renderMeasure() },
  { name: "results", element: $("results-pane"), onSelect: () => resultsPanel.render() },
  // The Fits tab is off for now (an open item): its pane stays hidden and is not offered.
  { name: "charts", element: $("charts-pane"), onSelect: () => inspector.renderCharts() },
  { name: "messages", element: $("messages-pane"), onSelect: () => { logOf(active).markSeen(); messagesPanel.refresh(true); refreshStatus(); } },
]);
// The Results tab's actions, shown at the right of the tab bar only while Results is selected (app.css): the
// measurement set Measure takes, as a menu of checked items, then Export CSV… and Clear.
const measurementsButton = Object.assign(document.createElement("button"), { className: "tab-action results-action", textContent: "Measurements" });
setTip(measurementsButton, "Choose what Measure takes, for the selected image (or every image, with none selected).");
measurementsButton.addEventListener("click", () => {
  const rect = measurementsButton.getBoundingClientRect();
  const image = stepImage();
  const current = image ? imageSettingsOf(image).measurements : effective(BUILT_IN_IMAGE, settings.imageSettings, {}).measurements;
  showContextMenu(rect.left, rect.bottom + 2, measurementMenu(current, (next) => {
    if (image) setMeasurements(next); else store.updateSettings({ imageSettings: setOverride(BUILT_IN_IMAGE, {}, settings.imageSettings, "measurements", next) });
  }), rect.top);
});
$("bottom-tabs").append(measurementsButton);
const resultsActions = [["Export CSV…", "Write the results table as a CSV file.", runExportResults], ["Clear", "Remove every row of the results table.", () => { const result = clearResults(); if (result) report(result, "info"); }]] as const;
for (const [label, tip, action] of resultsActions) {
  const button = Object.assign(document.createElement("button"), { className: "tab-action results-action", textContent: label });
  setTip(button, tip);
  button.addEventListener("click", () => action());
  $("bottom-tabs").append(button);
}
$("bottom-tabs").append(clearButton);
/** The document's fits, computed from their series' cells as they are now. */
function currentFits(): FitEntry[] {
  return active ? documentFits(active.project.plots, active.plotSources()) : [];
}
/** Choose a fit's series on its plot, as a click on the series would. */
function chooseFit(entry: FitEntry): void {
  const doc = active;
  if (!doc) return;
  makeCurrentFit(entry.series.id, entry.fit.id);
  doc.selection = new Set([entry.plot.id]);
  doc.plotPart = { plotId: entry.plot.id, part: { kind: "fit", of: entry.series.id, fit: entry.fit.id } };
  refresh();
  workspace.reveal();
}
/** Change one fit of a series; null removes it. */
function editFit(plotId: string, seriesId: string, fitId: string, change: (fit: SeriesFit) => SeriesFit | null): void {
  editPlot(plotId, (plot) => {
    const series = plot.series.find((item) => item.id === seriesId);
    if (series) series.fits = series.fits.flatMap((fit) => { if (fit.id !== fitId) return [fit]; const next = change(fit); return next ? [next] : []; });
  });
}
/** A fit id no fit of the series has. */
function freeFitId(series: { id: string; fits: readonly SeriesFit[] }): string {
  for (let n = series.fits.length + 1; ; n++) { const id = `${series.id}-fit-${n}`; if (!series.fits.some((fit) => fit.id === id)) return id; }
}
/**
 * Add a fit of a model to a series, make it the series' current fit, choose the series and show its Fitting group in
 * the inspector (owner, 2026-11-19: right-click Add fit leads there). Returns the new fit's id.
 */
function addFit(plotId: string, seriesId: string, kind: FitKind): string | null {
  let id: string | null = null;
  editPlot(plotId, (plot) => {
    const series = plot.series.find((item) => item.id === seriesId);
    if (!series) return;
    id = freeFitId(series);
    series.fits = [...series.fits, newFit(kind, id)];
  });
  const doc = active;
  if (!doc || !id) return id;
  makeCurrentFit(seriesId, id);
  doc.selection = new Set([plotId]);
  // The new fit is chosen: the inspector shows its Properties.
  doc.plotPart = { plotId, part: { kind: "fit", of: seriesId, fit: id } };
  refresh();
  inspector.revealPart(doc);
  return id;
}
const resultsPanel = new ResultsPanel($("results-pane"), { rows: () => active?.project.results ?? [], select: selectResult, decimals: () => effective(BUILT_IN_IMAGE, settings.imageSettings, {}).decimals });

const documentTabs = new DocumentTabs<PlotDocument>($("doc-tabs"), {
  newTitle: `${config.document.tabs.newTitle} (${shortcutText("CmdOrCtrl+N")})`, closeTitle: `${config.document.tabs.closeTitle} (${shortcutText("CmdOrCtrl+W")})`,
  onNew: createDocument, onActivate: (doc) => activate(doc), onClose: (doc) => void close(doc),
  // Tabs are dragged to rearrange them; the tab order is the order of `documents`.
  onReorder: (from, to) => { documents.splice(0, documents.length, ...moveItem(documents, from, to)); refresh(); },
});
// With no document open, the welcome screen takes the work surface's place and the document controls are dimmed.
const emptyState = createEmptyState($("center"), { ...config.document.welcome, newShortcut: shortcutText("CmdOrCtrl+N"), openShortcut: shortcutText("CmdOrCtrl+O"), onNew: createDocument, onOpen: () => void open() });

const workspace = new Workspace($("work-surface"), {
  document: () => active, mac,
  cellsChosen: (id, cells) => finishPick(id, cells),
  dropCells: (plotId, at) => {
    const link = active?.selectedColumn ? active.dataLink(active.selectedColumn.id) : null;
    const result = plotId ? addChosenToPlot(plotId) : link ? createPlot("scatter", link.id, at) : { ok: false, text: "Choose cells first." };
    if (plotId && result.ok && active) { active.selection = new Set([plotId]); active.selectedColumn = null; refresh(); }
    report(result.text, result.ok ? "info" : "error");
  },
  plotPartChosen: () => { inspector.revealPart(active); refreshStatus(); },
  selectionChanged: () => { if (active?.selectedColumn && !active.selection.has(active.selectedColumn.id)) active.selectedColumn = null; inspector.render(active); refreshStatus(); refreshMenus(); },
  selectCells: (id, cells, key) => {
    if (!active) return;
    active.selectedColumn = cells || key ? { id, column: key, cells } : null;
    // The cells stay the last chosen while a plot is selected, so that a series can take them.
    if (active.selectedColumn && !selectionEmpty(cells)) active.lastCells = active.selectedColumn;
    inspector.render(active); refreshStatus(); workspace.draw();
  },
  chooseSheet: (id, sheet) => { const link = active?.dataLink(id); if (link && link.read.sheet !== sheet) { const result = setDataRead(id, { sheet, range: null }); if (result) report(result, "info"); } },
  reloadData: (id) => void reloadData(id),
  contextMenu: (target, x, y) => {
    const entries = target.kind === "cells" ? cellsMenu(target.dataId, target.column, x, y)
      : target.kind === "workspace" ? surfaceMenu() : target.kind === "object" ? objectMenu(target.id)
      : plotPartMenu(target.plotId, active?.selectedPart() ?? { kind: "plot" });
    if (entries.length) showContextMenu(x, y, entries);
  },
  edited: (before) => { if (active) edited(active, before); },
  viewChanged: refreshStatus,
  roiDrawn: (imageId, roi) => report(addRoi(imageId, roi), "info"),
  cropDrawn: (imageId, box) => report(addCrop(imageId, box), "info"),
  cropEdit,
  previewCrop: (edit, box) => { Object.assign(edit.step, box); Object.assign(edit.image, resultSize(edit.image)); refreshStatus(); },
  cropEdited,
  scaleBar: surfaceScaleBar,
  roiSelected: (imageId, roiId) => selectRoi(imageId, roiId),
  leaveTool: () => setTool("select"),
  placePlot: (kind, x, y) => { const result = insertPlot(kind, { x, y }); report(result.text, result.ok ? "info" : "error"); setTool("select"); },
  hint: (text) => { hint = text; refreshStatus(); },
  showMask: () => showMask,
  pointHovered: (lines, pointer) => { pointHovering = !!lines; pointDetails.show(lines ?? chosenPointLines(), lines ? pointer : undefined); },

  pointerMoved: (image, pixel) => {
    const next = image && pixel ? { image, pixel } : null;
    if (JSON.stringify(next?.pixel) === JSON.stringify(pointer?.pixel)) return;
    pointer = next;
    refreshStatus();
  },
});
/** `name` and the Document section's Name: only an unsaved document is renamed; the name is the one its first Save offers. */
function renameDocument(name: string): string {
  if (!active) return "Open or create a document first.";
  if (active.path) return "A saved document keeps the name of its file.";
  const problem = validateName(name);
  if (problem) return problem;
  active.name = name;
  suggestedNames.set(active, name.toLowerCase().endsWith(`.${EXT}`) ? name : `${name}.${EXT}`);
  refresh();
  return `Renamed the document to ${name}.`;
}

/** `image move` and the Placement fields: an image's top-left corner on the work surface, in pixels, as one undoable edit. */
function moveImage(id: string, x: number, y: number): void {
  editActive((doc) => { const image = doc.image(id); if (image) { image.x = x; image.y = y; } });
}

/** `image turn` and the Angle field: how far an image is turned on the work surface, in degrees clockwise, as one undoable edit. */
function turnImage(id: string, degrees: number): void {
  editActive((doc) => { const image = doc.image(id); if (!image) return; const angle = normalAngle(degrees); if (angle) image.angle = angle; else delete image.angle; });
}

const inspector = new Inspector($("inspector"), {
  renameDocument: (name) => { const result = renameDocument(name); if (!result.startsWith("Renamed")) report(result, "error"); },
  renameImage: (id, name) => editActive((doc) => { const image = doc.image(id); if (image) image.name = name; }),
  setSnap,
  moveImage: (id, x, y) => moveImage(id, x, y),
  turnImage: (id, degrees) => turnImage(id, degrees),
  addStep: (item) => { const result = stepAction(`document.step.add.${item}`); if (result) report(result, "info"); },
  removeStep: (id) => report(removeStep(id), "info"),
  setStepEnabled: (id, enabled) => { setStepEnabled(id, enabled); },
  moveStep: (from, to) => { moveStep(from, to); },
  selectStep: (id) => { const image = stepImage(); if (active && image) { active.currentStep.set(image.id, id); refresh(); } },
  changeStep,
  beginPreview: () => active?.snapshot() ?? "",
  // While a slider moves, the result is drawn without a new undo step; its release records one.
  previewStep: (id, change) => { const step = stepImage()?.steps.find((item) => item.id === id); if (step) { Object.assign(step, change); workspace.draw(); refreshStatus(); } },
  endPreview: (before) => { if (active) edited(active, before); },
  importImages: () => void importImages(),
  setDataRead: (id, patch) => { const result = setDataRead(id, patch); if (result) report(result, "info"); },
  selectName,
  nameChosen: (text) => { const result = nameChosen(text); if (result.text) report(result.text, result.ok ? "info" : "error"); },
  setNameUnit: (id, text) => { const result = setNameUnit(id, text); report(result.text, result.ok ? "info" : "error"); },
  removeName,
  nameFromFirstRow: () => { const result = nameFromFirstRow(); report(result.text, result.ok ? "info" : "error"); },
  pick: startPick,
  templates: () => plotTemplates().map((item) => item.name),
  dataPalette: () => settings.dataPalette,
  saveTemplate: (id) => { const result = saveTemplate(id); report(result.text, result.ok ? "info" : "error"); },
  applyTemplate: (id, name) => { const result = applyTemplateTo(id, name); report(result.text, result.ok ? "info" : "error"); },
  batchPlot: (id, sheets) => { const result = batchPlot(id, sheets); report(result.text, result.ok ? "info" : "error"); },
  setCellRole: (cells, role) => { active?.cellRoles.set(cellsKey(cells), role); inspector.render(active); refreshMenus(); },
  addChosenToPlot: (id) => { const result = addChosenToPlot(id); report(result.text, result.ok ? "info" : "error"); },
  renameData,
  placeData,
  editPlot,
  exportSelection: runExport,
  appImageSettings: () => settings.imageSettings,
  appCalibration: () => settings.appCalibration,
  foldOpen: (key) => settings.inspectorFolds[key],
  // A fold is remembered without redrawing the inspector, which animates the section itself.
  setFold: (key, open) => { foldOnly = true; store.updateSettings({ inspectorFolds: { ...settings.inspectorFolds, [key]: open } }); foldOnly = false; },
  setImageSetting: (key, value) => setImageSetting(key, value),
  resetImageSetting: (key) => setImageSetting(key),
  setThreshold: (next) => { const result = setThreshold(next); if (result) report(result, "info"); },
  // While a slider moves, the mask is drawn without a new undo step; its release records one.
  setDisplay: (next) => { const image = stepImage(); if (image) editActive((doc) => { const target = doc.image(image.id)!; if (next) target.display = next; else delete target.display; }); },
  previewDisplay: (next) => { const image = stepImage(); if (image) { image.display = next; workspace.draw(); } },
  // Drawn live from the Threshold step's own phase (the phases `doc.phase` gives are copies with the mask steps folded in).
  previewThreshold: (next) => {
    const image = stepImage(), phase = image && active ? active.phase(image) : null;
    const target = phase ? thresholdStep(image!.steps)?.phases.find((item) => item.id === phase.id) : undefined;
    if (target) { target.threshold = rangeOnly(next); workspace.draw(); }
  },
  addPhase: () => report(addPhase(), "info"),
  removePhase: (id) => report(removePhase(id), "info"),
  selectPhase,
  changePhase: (id, patch) => { const result = changePhase(id, patch); if (result) report(result, "info"); },
  setMaskDisplay,
  showMeasurementSet: () => { selectBottom("results"); measurementsButton.click(); },
  setMeasurements,
  measure: () => report(measureSelection(), "info"),
  addGreyStep: () => { const result = stepAction("document.step.add.grey"); if (result) report(result, "info"); },
  selectRoi: (roiId) => { const image = stepImage(); if (image) selectRoi(image.id, roiId); },
  addFit: (plotId, seriesId, kind) => { addFit(plotId, seriesId, kind); },
  choosePart, markPart: (plotId, part) => workspace.markPart(plotId, part), partMenu: plotPartMenu,
  copyText: (text, what) => { navigator.clipboard.writeText(text).then(() => report(`Copied ${what}.`, "info"), () => report(`Could not copy ${what}.`, "error")); },
  editCrop: () => setTool("crop"),
  cropToRegion: (roiId) => report(cropToRegion(roiId), "info"),
  calibrateFromLine: (roiId) => { const result = calibrateFromLine(roiId); if (result) report(result, "info"); },
  removeRoi: (roiId) => { const image = stepImage(); if (image) report(removeRoi(image.id, roiId), "info"); },
  renameRoi: (roiId, name) => changeRoi(roiId, { name }),
  changeRoi,
  setCalibration: (target, next) => { const result = setCalibration(target, next); if (result) report(result, "info"); },
  report: (text, kind) => report(text, kind),
  pickColour, pickFrom,
  eyedropperSizeSelect: () => eyedropper.sizeSelect(),
  setDensity: (next) => { const result = setDensity(next); if (result) report(result, densityProblem(next ?? { fit: "linear", points: [{ grey: 0, od: 0 }, { grey: 1, od: 0 }] }) ? "warning" : "info"); },
  addDensityPoint: () => { const result = addDensityPoint(); if (result) report(result, "info"); },
  addLabel: () => report(addLabel(), "info"),
  changeLabel,
  removeLabel: (id) => report(removeLabel(id), "info"),
});
inspector.attachCharts($("charts-pane"));
inspector.attachMeasure($("measure-pane"));

/** Bring every view up to date with the documents, the active one and its selection. */
function refresh(): void {
  documentTabs.render(documents, active);
  emptyState.hidden = documents.length > 0;
  document.body.classList.toggle("no-docs", documents.length === 0);
  if (active) reportStepProblems(active);
  inspector.render(active);
  resultsPanel.render();
  if (active) void syncTables(active);
  messagesPanel.setLog(logOf(active));
  messagesPanel.refresh(true);
  workspace.draw();
  refreshStatus();
  refreshMenus();
  desktop?.setEdited(documents.some((doc) => doc.dirty));
  document.title = active ? `${active.dirty ? "• " : ""}${active.name}: ${config.identity.name}` : config.identity.name;
}

// MARK: files dropped on the window

// The shell's file drop (3.1.0): the window shows a drop target while files are over it, takes documents and images by
// extension, and names refused files in one sentence. On the desktop the bridge gives each file's path.
// The shell reports refused files before it hands over the accepted ones, so the sentence waits until those are open
// and goes to the document they opened in, not to the welcome screen's log.
let dropWork: Promise<void> = Promise.resolve();
attachFileDrop(document.body, {
  accept: OPEN_ACCEPT.split(","), label: "Drop images, data files or a .pfg document to open them.",
  pathFor: desktop ? (file) => desktop.pathForFile(file) : undefined,
  onRefused: (message) => { dropWork = Promise.resolve(); queueMicrotask(() => void dropWork.then(() => report(message, "error"))); },
  onFiles: (dropped) => void (dropWork = (async () => {
    const images: IncomingImage[] = [], data: IncomingData[] = [];
    for (const { name, path, file } of dropped) {
      if (name.toLowerCase().endsWith(`.${EXT}`)) openDocumentText(path, await file.text(), name);
      else (isDataPath(name) ? data : images).push({ path, file: name, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
    if (images.length) { if (active) await addImages(active, images); else await openImagesAsDocument(images); }
    if (data.length) { if (active) await addData(active, data); else await openDataAsDocument(data); }
  })()),
});

// MARK: Terminal

const welcome = () => documents.length === 0;


function imageInfo(doc: PlotDocument, image: ProjectImage): ConsoleResult {
  const state = doc.images.get(image.id)?.kind;
  const rows: [string, string][] = [
    ["Name", image.name], ["File", image.path ?? image.file], ["Status", state === "missing" ? "Missing" : state === "unreadable" ? "Unreadable" : image.embedded ? "Inside the document" : "Linked, read-only"],
    ["Format", FORMAT_LABELS[image.source.format]], ["Pixels", `${image.source.widthPx} × ${image.source.heightPx}`], ["Bit depth", `${image.source.bitDepth} bit`],
    ["Colour", COLOUR_LABELS[image.source.colour]], ["File size", fileSize(image.source.bytes)], ["Position", `${image.x} px, ${image.y} px`],
  ];
  return { lines: rows.map(([label, comment]) => ({ label, comment, labelWidth: 10, subdued: true })) };
}

// MARK: Terminal: steps and pixels

/** `step add` with bad values: its forms, in the layout of a usage error. */
function stepAddUsage(): ConsoleResult {
  const labelWidth = Math.max(...STEP_ADD_FORMS.map(([form]) => form.length));
  return { lines: ["Invalid arguments. Usage:", ...STEP_ADD_FORMS.map(([label, comment]) => ({ label: `step add ${label}`, comment, indent: 1, subdued: true, labelWidth: labelWidth + 9 })), "Type help step add for details."] };
}

const ANGLES: Record<string, 1 | 2 | 3> = { 90: 1, 180: 2, 270: 3 };
const whole = (text: string | undefined) => (text !== undefined && /^\d+$/.test(text) ? Number(text) : NaN);
/** A whole number that may be negative, such as a canvas position. */
const signed = (text: string | undefined) => (text !== undefined && /^-?\d+$/.test(text) ? Number(text) : NaN);
const positive = (text: string | undefined) => (text !== undefined && /^\d*\.?\d+$/.test(text) && Number(text) > 0 ? Number(text) : NaN);

/** The parameters `step add <type> <values>` gives, or null when they do not fit the type. */
function addParameters(type: string, values: string[]): Partial<Step> | null {
  const n = values.length;
  if (type === "calculator") {
    const other = active?.project.images[whole(values[1]) - 1];
    return n === 2 && CALCULATOR_OPERATIONS.includes(values[0] as CalculatorOperation) && other ? { operation: values[0], imageId: other.id } as Partial<Step> : null;
  }
  if (type === "grey") return n === 0 ? {} : n === 1 && ["luminance", "red", "green", "blue", "mean"].includes(values[0]) ? { method: values[0] } as Partial<Step> : null;
  if (type === "threshold") return n === 0 ? {} : null;
  if (type === "mask") {
    const operation = values[0] as MaskOperationKind, iterations = n === 2 ? whole(values[1]) : 1;
    return (n === 1 || n === 2) && MASK_OPERATION_KINDS.includes(operation) && !maskOperationProblem({ kind: operation, iterations }) ? { operation, iterations } as Partial<Step> : null;
  }
  if (type === "8-bit") {
    if (n === 0) return {};
    const [low, high] = values.map(whole);
    return n === 2 && Number.isFinite(low) && Number.isFinite(high) ? { mapping: "range", low, high } as Partial<Step> : null;
  }
  if (type === "crop") {
    const [x, y, width, height] = values.map(whole);
    return n === 4 && [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } as Partial<Step> : null;
  }
  if (type === "rotate") return n === 0 ? {} : n === 1 && ANGLES[values[0]] ? { quarterTurns: ANGLES[values[0]] } as Partial<Step> : null;
  if (type === "flip") return n === 0 ? {} : n === 1 && (values[0] === "horizontal" || values[0] === "vertical") ? { axis: values[0] } as Partial<Step> : null;
  if (type === "levels") {
    const [black, white] = values.map(whole), gamma = n === 3 ? positive(values[2]) : 1;
    return (n === 2 || n === 3) && Number.isFinite(black) && Number.isFinite(white) && Number.isFinite(gamma) ? { black, white, gamma } as Partial<Step> : null;
  }
  if (type === "invert") return n === 0 ? {} : null;
  if (type === "canvas") {
    // width height, then optionally x y, then optionally the background value.
    const read = values.map((text, i) => (i === 2 || i === 3 ? signed(text) : whole(text))), [width, height, x, y, value] = read;
    if (![2, 4, 5].includes(n) || !read.every(Number.isFinite)) return null;
    return { width, height, ...(n >= 4 ? { x, y } : {}), ...(n === 5 ? { value } : {}) } as Partial<Step>;
  }
  if (type === "translate") {
    const [x, y] = values.map(signed);
    return n === 2 && Number.isFinite(x) && Number.isFinite(y) ? { x, y } as Partial<Step> : null;
  }
  if (type === "math") {
    const [operation, text] = values;
    if (!MATH_OPERATIONS.includes(operation as MathOperation) || n > 2) return null;
    const value = text === undefined ? (operation === "log" ? 0 : NaN) : Number(text);
    return mathProblem(operation as MathOperation, value) ? null : { operation, value } as Partial<Step>;
  }
  if (type === "contrast") {
    const [method, text] = values;
    if (method === "equalize" && n === 1) return { method } as Partial<Step>;
    const saturated = text === undefined ? 0.35 : Number(text);
    return method === "normalize" && n <= 2 && saturated >= 0 && saturated < 100 ? { method, saturated } as Partial<Step> : null;
  }
  if (type === "filter") {
    const [kind, ...numbers] = values;
    if (!FILTER_KINDS.includes(kind as FilterKind)) return null;
    const filter = kind as FilterKind, read = numbers.map(Number);
    if (!read.every(Number.isFinite)) return null;
    if (filter === "convolve") return n === 1 ? { filter } as Partial<Step> : filterProblem(filter, { ...FILTER_DEFAULTS, kernel: read }) ? null : { filter, kernel: read } as Partial<Step>;
    const names = FILTER_VALUES[filter];
    if (read.length > names.length) return null;
    const change = { filter, ...Object.fromEntries(read.map((value, i) => [names[i], value])) } as Partial<Step>;
    return filterProblem(filter, { ...FILTER_DEFAULTS, ...change } as never) ? null : change;
  }
  return null;
}

/** One parameter of `step set`, or a sentence saying why it does not fit the step. */
function setParameter(step: Step, name: string, text: string): Partial<Step> | string {
  const names = STEP_PARAMETERS[step.type];
  if (!names.includes(name)) return names.length ? `${stepName(step)} has the parameters ${names.join(", ")}.` : `${stepName(step)} has no parameters.`;
  if (name === "method" && step.type === "grey") return addParameters("grey", [text]) ?? takesReply("the method", ["luminance", "red", "green", "blue", "mean"]);
  if (name === "mapping") return text === "minmax" || text === "range" ? { mapping: text } as Partial<Step> : takesReply("the mapping", ["minmax", "range"]);
  if (name === "angle") return ANGLES[text] ? { quarterTurns: ANGLES[text] } as Partial<Step> : takesReply("the angle", ["90", "180", "270"]);
  if (name === "axis") return text === "horizontal" || text === "vertical" ? { axis: text } as Partial<Step> : takesReply("the axis", ["horizontal", "vertical"]);
  if (name === "filter") return FILTER_KINDS.includes(text as FilterKind) ? { filter: text } as Partial<Step> : takesReply("the filter", FILTER_KINDS);
  if (name === "normalize") return text === "on" || text === "off" ? { normalize: text === "on" } as Partial<Step> : takesReply("normalize", ["on", "off"]);
  if (name === "operation" && step.type === "calculator") return CALCULATOR_OPERATIONS.includes(text as CalculatorOperation) ? { operation: text } as Partial<Step> : takesReply("the operation", CALCULATOR_OPERATIONS);
  if (name === "image") { const other = active?.project.images[whole(text) - 1]; return other ? { imageId: other.id } as Partial<Step> : "Give the image's number from image list."; }
  if (name === "operation" && step.type === "mask") return MASK_OPERATION_KINDS.includes(text as MaskOperationKind) ? { operation: text } as Partial<Step> : takesReply("the operation", MASK_OPERATION_KINDS);
  if (name === "operation") return MATH_OPERATIONS.includes(text as MathOperation) ? { operation: text } as Partial<Step> : takesReply("the operation", MATH_OPERATIONS);
  if (name === "count" && step.type === "mask") { const value = whole(text), problem = maskOperationProblem({ kind: step.operation, iterations: step.iterations, count: value }); return problem ?? { count: value === 1 ? undefined : value } as Partial<Step>; }
  if (name === "iterations" && step.type === "mask") { const value = whole(text), problem = maskOperationProblem({ kind: step.operation, iterations: value }); return problem ?? { iterations: value } as Partial<Step>; }
  if (name === "phase" && step.type === "mask") {
    if (text === "all") return { phase: undefined } as Partial<Step>;
    const phase = thresholdStep(stepImage()?.steps ?? [])?.phases[whole(text) - 1];
    return phase ? { phase: phase.id } as Partial<Step> : "Give a phase's number from phase list, or all.";
  }
  if (name === "method" && step.type === "contrast") return text === "normalize" || text === "equalize" ? { method: text } as Partial<Step> : takesReply("the method", ["normalize", "equalize"]);
  if (name === "value" || name === "saturated") {
    const value = Number(text);
    const problem = step.type === "math" ? mathProblem(step.operation, value)
      : step.type === "fill" ? (Number.isInteger(value) && value >= 0 ? null : "The fill value is a whole number from 0.")
      : value >= 0 && value < 100 ? null : "Saturated pixels are a percentage from 0 to below 100.";
    return text.trim() && Number.isFinite(value) && !problem ? { [name]: value } as Partial<Step> : problem ?? `The ${name} takes a number.`;
  }
  if (name === "radius" || name === "weight" || name === "threshold") {
    if (step.type === "filter" && !FILTER_VALUES[step.filter].includes(name)) return `${FILTER_LABELS[step.filter]} has no ${name}.`;
    const value = Number(text), problem = step.type === "filter" ? filterProblem(step.filter, { ...step, [name]: value }) : null;
    return text.trim() && Number.isFinite(value) && !problem ? { [name]: value } as Partial<Step> : problem ?? `The ${name} takes a number.`;
  }
  if (name === "gamma") { const value = positive(text); return Number.isFinite(value) ? { gamma: value } as Partial<Step> : "Gamma takes a number above 0."; }
  // A canvas's position may be negative, which cuts the image's left or top side off.
  const value = step.type === "canvas" && (name === "x" || name === "y") ? signed(text) : whole(text);
  return Number.isFinite(value) ? { [name]: value } as Partial<Step> : `The ${name} takes a whole number.`;
}

/** `step <subcommand>`: the image's steps listed, added or repeated, or one numbered step changed. */
function stepCommand(doc: PlotDocument, rest: string[]): ConsoleResult {
  const image = stepImage(doc);
  if (!image) return { lines: ["Select one image first."] };
  const [sub, ...values] = rest;
  if (sub === "repeat") return { lines: [repeatLastStep() ?? (lastAdded ? notShown(image) : "No step has been added yet.")] };
  if (sub === "add") return stepAdd(doc, image, values[0], values.slice(1));
  let step: Step;
  try { step = numberedItem(image.steps, values[0], "step"); } catch (error) { return { lines: [reason(error)] }; }
  return { lines: [NUMBERED_STEP_COMMANDS[sub as keyof typeof NUMBERED_STEP_COMMANDS]({ doc, image, step, sub, values: values.slice(1) })] };
}

const notShown = (image: ProjectImage) => `${image.name} is not shown, so steps cannot be added to it.`;
const summaryOf = (doc: PlotDocument, image: ProjectImage, step: Step) => stepSummary(step, (id) => doc.image(id)?.name ?? "a missing image", phaseNameIn(image.steps));


/** `step add <type> [<value>...]`; translate adds a canvas of the image's own size with the image moved. */
function stepAdd(doc: PlotDocument, image: ProjectImage, type: string, parameters: string[]): ConsoleResult {
  const change = addParameters(type, parameters);
  if (!change) return stepAddUsage();
  if (!doc.ready(image.id)) return { lines: [notShown(image)] };
  const problem = type === "calculator" ? readsBackProblem(doc, image, (change as { imageId: string }).imageId) : null;
  return { lines: [problem ?? addStep((type === "translate" ? "canvas" : type) as Step["type"], change)] };
}

/** The subcommands on one numbered step; `values` are the words after the step's number. The pattern of `step` admits no others. */
const NUMBERED_STEP_COMMANDS: Record<"on" | "off" | "move" | "set", (c: { doc: PlotDocument; image: ProjectImage; step: Step; sub: string; values: string[] }) => string> = {
  on: ({ step }) => (step.enabled ? `${stepName(step)} is already on.` : setStepEnabled(step.id, true)),
  off: ({ step }) => (!step.enabled ? `${stepName(step)} is already off.` : setStepEnabled(step.id, false)),
  move: ({ image, step, values }) => {
    const from = image.steps.indexOf(step), to = whole(values[0]) - 1;
    if (!(to >= 0 && to < image.steps.length)) return `Give a position from 1 to ${image.steps.length}.`;
    return to === from ? `${stepName(step)} is already step ${to + 1}.` : moveStep(from, to > from ? to + 1 : to);
  },
  set: ({ doc, image, step, values }) => {
    const change = setParameter(step, values[0], values[1]);
    if (typeof change === "string") return change;
    changeStep(step.id, change);
    return `${stepName(step)}: ${summaryOf(doc, image, image.steps.find((item) => item.id === step.id)!)}.`;
  },
};

/** `no enabled steps`, `1 enabled step`, `3 enabled steps`. */
function enabledSteps(image: ProjectImage): string {
  const n = image.steps.filter((step) => step.enabled).length;
  return n === 0 ? "no enabled steps" : `${n} enabled step${n === 1 ? "" : "s"}`;
}

function pixelCommand(doc: PlotDocument, x: number, y: number): ConsoleResult {
  const image = stepImage(doc);
  if (!image) return { lines: ["Select one image first."] };
  const ready = doc.ready(image.id);
  if (!ready) return { lines: [`${image.name} is not shown, so its pixels cannot be read.`] };
  const pixel = pixelAt(ready.working, x, y);
  if (!pixel) return { lines: [`The pixel ${x}, ${y} is outside ${image.name}, which is ${ready.working.widthPx} × ${ready.working.heightPx} px.`] };
  const depth = `${ready.working.bitDepth} bit, 0 to ${maxValue(ready.working.bitDepth)}`;
  return { lines: [pixelReadout(pixel, imageScale(doc, image)).join("   "), `${image.name} after ${enabledSteps(image)}; ${depth}.`] };
}

// MARK: Terminal: results

async function resultsCommand(doc: PlotDocument, rest: string[]): Promise<ConsoleResult> {
  const [sub, which] = rest;
  const rows = doc.project.results;
  if (!sub || sub === "list") {
    if (!rows.length) return { lines: ["No results. Measure an image to add rows."] };
    const columns = visibleColumns(rows);
    return { tables: [{ headers: ["", ...columns.map((column) => columnHeading(column, rows))], numbered: true, rows: rows.map((row, index) => [listNumber(index + 1), ...columns.map((column) => cellText(cellValue(row, column), effective(BUILT_IN_IMAGE, settings.imageSettings, {}).decimals))]) }] };
  }
  if (sub === "clear") return { lines: [clearResults() ?? "The results table is already empty."] };
  if (sub === "export") { try { return { lines: [await exportResults() ?? "Export cancelled."] }; } catch (error) { return { lines: [`Couldn't export the results: ${reason(error)}`] }; } }
  if (sub === "check") return { lines: checkResults(doc) };
  let row: ResultRow;
  try { row = numberedItem(rows, which, "row"); } catch (error) { return { lines: [reason(error)] }; }
  editActive((current) => { current.project.results = current.project.results.filter((item) => item.id !== row.id); });
  return { lines: [`Removed row ${which} (${row.imageName}, ${row.roi?.name ?? "whole image"}).`] };
}

// MARK: Terminal: measurement options, labels, density standards

function phaseCommand(doc: PlotDocument, rest: string[]): ConsoleResult {
  const image = stepImage(doc);
  if (!image) return { lines: ["Select one image first."] };
  const [sub, ...values] = rest;
  if (sub === "add") {
    const added = addPhase();
    const name = values.join(" ").trim();
    const phase = doc.phase(image);
    if (name && phase && added.startsWith("Added")) return { lines: [changePhase(phase.id, { name }) ? `Added ${name} to ${image.name}.` : added] };
    return { lines: [added] };
  }
  if (sub === "show") { const mode = values[0] === "overunder" ? "overUnder" : values[0] as MaskDisplay; setMaskDisplay(mode); return { lines: [`${image.name} shows its phases as ${mode === "colours" ? "their colours" : mode === "bw" ? "black on white" : "Over/Under"}.`] }; }
  let phase: Phase;
  try { phase = numberedItem(stepPhases(image.steps), values[0], "phase"); } catch (error) { return { lines: [reason(error)] }; }
  return { lines: [changePhase(phase.id, { colour: values[1] as Phase["colour"] }) ?? ""] };
}

function measureOptionCommand(rest: string[]): ConsoleResult {
  const [sub, value] = rest, image = stepImage();
  if (sub === "limit") {
    if (!image) return { lines: ["Select one image first."] };
    if (!value) return { lines: [`Limit to threshold is ${imageSettingsOf(image).limitToThreshold ? "on" : "off"} for ${image.name}.`] };
    setImageSetting("limitToThreshold", value === "on");
    return { lines: [`Limit to threshold is ${value} for ${image.name}.`] };
  }
  const now = effective(BUILT_IN_IMAGE, settings.imageSettings, {}).decimals;
  if (!value) return { lines: [`The Results pane shows ${now === null ? "four significant digits" : `${now} decimal places`}. The CSV keeps every digit.`] };
  const next = value === "auto" ? null : Number(value);
  store.updateSettings({ imageSettings: setOverride(BUILT_IN_IMAGE, {}, settings.imageSettings, "decimals", next) });
  return { lines: [`The Results pane shows ${next === null ? "four significant digits" : `${next} decimal places`}.`] };
}

function labelCommand(doc: PlotDocument, rest: string[]): ConsoleResult {
  const image = stepImage(doc);
  if (!image) return { lines: ["Select one image first."] };
  const [sub, ...values] = rest, labels = image.labels ?? [];
  if (sub === "add") return { lines: [addLabel(values.slice(2).join(" "), [Number(values[0]), Number(values[1])])] };
  let label: TextLabel;
  try { label = numberedItem(labels, values[0], "label"); } catch (error) { return { lines: [reason(error)] }; }
  changeLabel(label.id, { text: values.slice(1).join(" ") });
  return { lines: [`Label ${values[0]}: "${values.slice(1).join(" ")}".`] };
}

function densityCommand(rest: string[]): ConsoleResult {
  const image = stepImage();
  if (!image) return { lines: ["Select one image first."] };
  const [sub, a, b] = rest, standard = image.density;
  if (!sub) {
    if (!standard) return { lines: [`${image.name} has no density standard; optical density is log10(M / v), uncalibrated.`] };
    const problem = densityProblem(standard);
    return { tables: [{ headers: ["", "Grey", "OD"], numbered: true, rows: standard.points.map((p, i) => [listNumber(i + 1), formatMeasure(p.grey), formatMeasure(p.od)]) }],
      lines: [problem ?? describeFit(fitDensity(standard), standard.points.length, formatMeasure)] };
  }
  if (sub === "add") return { lines: [addDensityPoint(Number(b), Number(a)) ?? ""] };
  if (sub === "point") return { lines: [addDensityPoint(Number(a)) ?? ""] };
  if (sub === "clear") return { lines: [setDensity(undefined) ?? ""] };
  if (!standard) return { lines: [`${image.name} has no density standard. Add points first.`] };
  if (sub === "fit") return { lines: [setDensity({ ...standard, fit: a as DensityStandard["fit"] }) ?? ""] };
  let point;
  try { point = numberedItem(standard.points, a, "point"); } catch (error) { return { lines: [reason(error)] }; }
  const points = standard.points.filter((item) => item !== point);
  return { lines: [setDensity(points.length ? { ...standard, points } : undefined) ?? ""] };
}

// MARK: Terminal: fits

/** The words `fit add` and `plot series <n> fit` take for each model: its id, and the short names. */
const FIT_ALIASES: Record<string, FitKind> = {
  sg: "savitzky-golay", poly: "polynomial", exp: "exponential", log: "logarithmic", decay: "exponential-1", decay2: "exponential-2",
  gauss: "gaussian", peaks: "gaussians", voigt: "pseudo-voigt", "4pl": "logistic-4", hill: "logistic-4", "5pl": "logistic-5", mm: "michaelis-menten",
};
// Every model, the custom formula among them (2026-11-19: it is the series' own, set in its Fitting group).
const OFFERED_FITS = FIT_KINDS;
const fitKindOf = (word: string | undefined): FitKind | undefined => (word ? FIT_ALIASES[word] ?? (OFFERED_FITS as readonly string[]).find((kind) => kind === word) as FitKind | undefined : undefined);
const fitKindReply = `A fit is none or one of ${OFFERED_FITS.join(", ")}; fit models lists them.`;

/** A fit by its number in fit list, or its name. */
function fitByReference(fits: readonly FitEntry[], reference: string | undefined): FitEntry {
  if (!reference) throw new Error("Name a fit by its number in fit list.");
  const index = Number(reference);
  const found = Number.isInteger(index) && index >= 1 ? fits[index - 1] : fits.find((entry) => fitName(entry).toLowerCase() === reference.toLowerCase());
  if (!found) throw new Error(fits.length ? `No fit ${reference}. Type fit list to list them.` : "The document has no fits. Add one with fit add <series> <model>.");
  return found;
}

/** `fit`'s own forms: add a fit to a series of the selected plot, and change how a fit is fitted. */
function fitCommand(words: string[]): ConsoleResult {
  const doc = needDoc(), [sub, ...rest] = words;
  if (sub === "models") {
    return { lines: FIT_GROUPS.map(([group, kinds]) => ({ label: group, comment: kinds.map((kind) => `${kind} (${FIT_NAMES[kind]})`).join(", "), labelWidth: 18, subdued: true })) };
  }
  if (sub === "add") {
    const plot = doc.selectedPlot();
    if (!plot) return { lines: ["Select a plot first."] };
    const [which, word, size] = rest, series = plot.series[Number(which) - 1];
    if (!series) return { lines: [`${plot.name} has no series ${which}; it has ${plot.series.length}.`] };
    const kind = fitKindOf(word);
    if (!kind) return { lines: [fitKindReply] };
    const n = size === undefined ? null : Number(size);
    if (n !== null && !(isSmoothing(kind) || hasOrder(kind))) return { lines: [`${FIT_NAMES[kind]} takes no size.`] };
    if (n !== null && isSmoothing(kind) && (n < 3 || n % 2 === 0)) return { lines: ["A smoothing window is an odd number of points from 3."] };
    if (n !== null && hasOrder(kind) && !isSmoothing(kind) && (n < 2 || n > 6)) return { lines: [kind === "gaussians" ? "Gaussian peaks are 2 to 6." : "A polynomial's order is 2 to 6."] };
    const id = addFit(plot.id, series.id, kind);
    if (id && n !== null) editFit(plot.id, series.id, id, (fit) => ({ ...fit, ...(isSmoothing(kind) ? { window: n } : { order: n }) }));
    const entry = currentFits().find((item) => item.fit.id === id);
    return { lines: [entry ? `${fitName(entry)}: ${modelName(entry.fit)}, ${fitStatus(entry.result).toLowerCase()}.` : `${plot.name}, series ${which}: ${FIT_NAMES[kind].toLowerCase()}.`] };
  }
  const fits = currentFits();
  let entry: FitEntry;
  try { entry = fitByReference(fits, rest[0]); } catch (error) { return { lines: [reason(error)] }; }
  const values = rest.slice(1);
  const change = (patch: (fit: SeriesFit) => SeriesFit, said: string): ConsoleResult => {
    editFit(entry.plot.id, entry.series.id, entry.fit.id, patch);
    const now = currentFits().find((item) => item.fit.id === entry.fit.id && item.series.id === entry.series.id);
    const status = now ? fitStatus(now.result) : "";
    return { lines: [`${fitName(entry)}: ${said}${status && status !== "Fitted" ? `. ${status}` : ""}.`] };
  };
  const names = fitParameterNames(entry.fit);
  const parameter = (name: string | undefined): string | null => (name && names.includes(name) ? name : null);
  const keep = (values: Record<string, number>) => (Object.keys(values).length ? values : undefined);
  if (sub === "residuals") {
    if (typeof entry.result === "string") return { lines: [entry.result] };
    return { tables: [{ headers: ["", "x", "y", "Fit", "Residual"], numbered: true, rows: (entry.result.residuals ?? []).map((point, i) => [listNumber(i + 1), formatMeasure(point.x), formatMeasure(point.y), formatMeasure(point.y - point.residual), formatMeasure(point.residual)]) }] };
  }
  if (sub === "formula") {
    if (entry.fit.kind !== "custom") return { lines: [`${fitName(entry)} is ${modelName(entry.fit).toLowerCase()}; add a custom fit with fit add ${entry.number} custom first.`] };
    const text = values.join(" ").replace(/^"(.*)"$/, "$1").trim();
    return change((fit) => ({ ...fit, expression: text, start: undefined, fixed: undefined }), `y = ${text}`);
  }
  if (sub === "start" || sub === "fix" || sub === "free") {
    const name = parameter(values[0]);
    if (!name) return { lines: [`${fitName(entry)} has the parameters ${names.join(", ") || "none"}.`] };
    if (sub === "free") return change((fit) => { const fixed = { ...(fit.fixed ?? {}) }; delete fixed[name]; return { ...fit, fixed: keep(fixed) }; }, `${name} is fitted`);
    const word = values[1];
    if (sub === "start" && word === "auto") return change((fit) => { const start = { ...(fit.start ?? {}) }; delete start[name]; return { ...fit, start: keep(start) }; }, `${name} starts from the model's guess`);
    const current = typeof entry.result === "string" ? undefined : entry.result.parameters?.find((item) => item.name === name)?.value;
    const value = word === undefined ? current : Number(word);
    if (value === undefined || !Number.isFinite(value)) return { lines: [word === undefined ? `Give ${name} a value to hold.` : `${name} takes a number${sub === "start" ? " or auto" : ""}.`] };
    if (sub === "start") return change((fit) => ({ ...fit, start: { ...(fit.start ?? {}), [name]: value } }), `${name} starts from ${formatMeasure(value)}`);
    return change((fit) => ({ ...fit, fixed: { ...(fit.fixed ?? {}), [name]: value } }), `${name} is held at ${formatMeasure(value)}`);
  }
  if (sub === "weights") {
    const weights = values[0] as FitWeights;
    if (!FIT_WEIGHTS.includes(weights)) return { lines: [`Weights are ${FIT_WEIGHTS.join(", ")}.`] };
    return change((fit) => ({ ...fit, weights: weights === "none" ? undefined : weights }), `weights ${weights}`);
  }
  if (sub === "range") {
    const [from, to] = values;
    if (from === "all") return change((fit) => ({ ...fit, from: undefined, to: undefined }), "every point fitted");
    const read = (word: string | undefined) => (word === undefined || word === "auto" ? undefined : Number(word));
    const low = read(from), high = read(to);
    if ((low !== undefined && !Number.isFinite(low)) || (high !== undefined && !Number.isFinite(high))) return { lines: ["A fit's range takes two numbers, auto for an end of the data, or all."] };
    if (low !== undefined && high !== undefined && low >= high) return { lines: ["A fit's range runs from a smaller x to a larger one."] };
    return change((fit) => ({ ...fit, from: low, to: high }), `fitted from ${low === undefined ? "the first x" : formatMeasure(low)} to ${high === undefined ? "the last x" : formatMeasure(high)}`);
  }
  if (sub === "equation") return change((fit) => ({ ...fit, equation: values[0] === "on" }), `equation ${values[0] === "on" ? "shown on" : "left off"} the plot`);
  return { lines: [`Unknown fit form ${sub}. Type help fit.`] };
}

// MARK: Terminal: thresholds

function thresholdCommand(doc: PlotDocument, rest: string[]): ConsoleResult {
  const image = stepImage(doc);
  if (!image) return { lines: ["Select one image first."] };
  const working = doc.ready(image.id)?.working;
  if (!working) return { lines: [`${image.name} is not shown, so it cannot be thresholded.`] };
  const [sub, ...values] = rest;
  // The commands act on the current phase (`phase select`); with none, setting a threshold adds one.
  const threshold = doc.phase(image)?.threshold ?? null;
  if (!sub) {
    const mask = doc.mask(image.id);
    if (!threshold) return { lines: [`${image.name} has no threshold.`] };
    if (!mask?.result) return { lines: [`${thresholdSummary(threshold)}. ${mask?.problem ?? ""}`.trim()] };
    const total = imagePixels(working);
    const rows: [string, string][] = [["Threshold", thresholdSummary(threshold)], ...(mask.result.t !== null ? [["Split", String(mask.result.t)] as [string, string]] : []),
      ...(threshold.mode === "colour" ? [] : [["Range", `${mask.result.low} to ${mask.result.high}`] as [string, string]]), ["Masked", `${mask.result.count} of ${total} px, ${((mask.result.count / total) * 100).toFixed(1)}%`]];
    return { lines: rows.map(([label, comment]) => ({ label, comment, labelWidth: 9, subdued: true })) };
  }
  if (sub === "colour") {
    if (working.channels !== 3) return { lines: ["A colour threshold needs a colour image. Use manual or a method such as otsu on a grey image."] };
    const model = values[0] as ColourModel3, numbers = values.slice(1).map(Number);
    if (numbers.length && numbers.length !== 6) return { lines: ["A colour threshold takes six bounds, a low and a high for each component, or none."] };
    const ranges = (numbers.length ? [0, 1, 2].map((k) => [numbers[2 * k], numbers[2 * k + 1]]) : MODEL_LIMITS[model].map((range) => [...range])) as [Range, Range, Range];
    return { lines: [setThreshold({ mode: "colour", model, ranges, ...(threshold?.operations ? { operations: threshold.operations } : {}) }) ?? ""] };
  }
  if (sub === "pick") {
    if (working.channels !== 3) return { lines: ["Pick is for colour images."] };
    const [x, y, tolerance] = values.map(Number);
    if (!(x < working.widthPx && y < working.heightPx)) return { lines: [`The pixel lies outside the result, which is ${working.widthPx} × ${working.heightPx} px.`] };
    if (tolerance !== undefined && !(tolerance >= 0 && tolerance <= 100)) return { lines: ["The tolerance is a percentage from 0 to 100."] };
    if (tolerance !== undefined) picker.tolerance = tolerance;
    colourPicked(image, x + 0.5, y + 0.5);
    return { lines: [`${image.name}: ${thresholdSummary(threshold)}.`] };
  }
  if (sub === "on" && working.channels === 3) return { lines: [setThreshold(startThreshold("colour", threshold, null, 255)) ?? ""] };
  if (sub === "on") {
    const started = startThreshold(imageSettingsOf(image).thresholdMode, threshold, doc.mask(image.id), working.bitDepth === 16 ? 65535 : 255);
    return { lines: [setThreshold(started) ?? ""] };
  }
  if (sub === "mask") {
    // The mask operations are the mask steps after the Threshold step; one added here acts on every phase.
    if (!thresholdStep(image.steps)) return { lines: [`${image.name} has no Threshold step; its masks come from one.`] };
    const masks = image.steps.filter((step): step is MaskStep => step.type === "mask");
    const [kind, count] = values;
    if (!kind) return masks.length
      ? { tables: [{ headers: [], numbered: true, rows: masks.map((step, index) => [listNumber(index + 1), stepName(step), stepSummary(step, undefined, phaseNameIn(image.steps)), step.enabled ? "On" : "Off"]) }] }
      : { lines: [`${image.name} has no mask steps.`] };
    if (kind === "clear") {
      if (!masks.length) return { lines: [`${image.name} has no mask steps.`] };
      editSteps((steps) => { steps.splice(0, steps.length, ...steps.filter((step) => step.type !== "mask")); });
      doc.currentStep.delete(image.id);
      refresh();
      return { lines: [`Removed ${masks.length} mask step${masks.length === 1 ? "" : "s"} from ${image.name}.`] };
    }
    if (kind === "remove") {
      const target = masks[Number(count) - 1];
      if (!target) return { lines: [masks.length ? `There is no mask step ${count}; ${image.name} has ${masks.length}.` : `${image.name} has no mask steps.`] };
      return { lines: [removeStep(target.id)] };
    }
    const operation = { kind: kind as MaskOperationKind, iterations: count === undefined ? 1 : Number(count) };
    const problem = maskOperationProblem(operation);
    if (problem) return { lines: [problem] };
    return { lines: [addStep("mask", { operation: operation.kind, iterations: operation.iterations } as Partial<Step>)] };
  }
  // A new range keeps the mask operations.
  const kept = threshold?.operations?.length ? { operations: threshold.operations } : {};
  const next: Threshold | null = sub === "off" ? null : sub === "manual" ? { mode: "manual", low: Number(values[0]), high: Number(values[1]), ...kept }
    : { mode: sub as ThresholdMethod, objects: (values[0] as "light" | "dark" | undefined) ?? "light", ...kept };
  const problem = next ? thresholdProblem(next, working) : null;
  if (problem) return { lines: [problem] };
  return { lines: [setThreshold(next) ?? ""] };
}

// MARK: Terminal: display

function displayCommand(doc: PlotDocument, rest: string[]): ConsoleResult {
  const image = stepImage(doc);
  if (!image) return { lines: ["Select one image first."] };
  const working = doc.ready(image.id)?.working;
  if (!working) return { lines: [`${image.name} is not shown.`] };
  const current = image.display ?? DEFAULT_DISPLAY, M = maxValue(working.bitDepth);
  const [sub, a, b] = rest;
  const describe = (display: DisplaySettings) => `${LUT_LABELS[display.lut]}, ${display.min ?? 0} to ${display.max ?? M}`;
  if (!sub) return { lines: [`${image.name} is drawn in ${describe(current)}.`] };
  let next: DisplaySettings | undefined;
  if (sub === "reset") next = undefined;
  else if (sub === "lut") {
    if (working.channels !== 1) return { lines: ["A colour image keeps its own colours; lookup tables are for grey images."] };
    next = { ...current, lut: a === "blackwhite" ? "blackWhite" : a as LutName };
  } else if (sub === "auto") {
    const counts = new Float64Array(M + 1);
    for (const v of working.data) counts[v]++;
    const range = autoRange(counts);
    if (!range) return { lines: ["The image has one value, so it has no range to stretch."] };
    next = { ...current, ...range };
  } else next = { ...current, min: Number(a), max: Number(b) };
  if (next) { const problem = displayProblem(next, working.bitDepth); if (problem) return { lines: [problem] }; }
  editActive((target) => { const item = target.image(image.id)!; if (next) item.display = next; else delete item.display; });
  return { lines: [next ? `${image.name} is drawn in ${describe(next)}.` : `${image.name} is drawn plainly.`] };
}

// MARK: Terminal: histogram and profile

function histogramCommand(doc: PlotDocument, bins: number): ConsoleResult {
  const image = stepImage(doc);
  if (!image) return { lines: ["Select one image first."] };
  const working = doc.ready(image.id)?.working;
  if (!working) return { lines: [`${image.name} is not shown.`] };
  const roi = doc.currentRoi()?.roi ?? null;
  let result;
  try { result = histogramOf(working, roi && roi.type !== "line" ? roiMask(roi, working) : null, bins); } catch (error) { return { lines: [reason(error)] }; }
  const stat = (value: number | null) => (value === null ? "None" : formatMeasure(value));
  return {
    tables: bins <= 64 ? [{ headers: ["From", "Count"], rows: result.counts.map((n, k) => [formatMeasure(k * result.binWidth), String(n)]) }] : [],
    lines: [
      { label: "Of", comment: roi && roi.type !== "line" ? roi.name : image.name, labelWidth: 7, subdued: true },
      { label: "Pixels", comment: String(result.count), labelWidth: 7, subdued: true },
      { label: "Mean", comment: `${stat(result.mean)}, std dev ${stat(result.stdDev)}`, labelWidth: 7, subdued: true },
      { label: "Range", comment: result.min === null ? "None" : `${result.min} to ${result.max}, mode ${result.modal}`, labelWidth: 7, subdued: true },
      ...(bins > 64 ? [`Bins are listed up to 64; ${bins} were counted. Copy them from the inspector's Histogram section.`] : []),
    ],
  };
}

/** The profile of the selected line or rectangle, or why there is none. */
function profileOf(doc: PlotDocument): Profile | string {
  const current = doc.currentRoi();
  if (!current || (current.roi.type !== "line" && current.roi.type !== "rectangle")) return "Select a line or a rectangle region first.";
  const { image, roi } = current;
  const working = doc.ready(image.id)?.working;
  if (!working) return `${image.name} is not shown.`;
  if (working.channels !== 1) return "Profiles are of grey values; add a Convert to grey step first.";
  const scale = imageScale(doc, image);
  return roi.type === "line" ? lineProfile(working, roi.points, scale) : laneProfile(working, roi as Extract<Roi, { type: "rectangle" }>, scale);
}

// MARK: Terminal: regions

/** A region's measures in a few words: its area and pixels, or its length. */
function roiMeasures(doc: PlotDocument, image: ProjectImage, roi: Roi): string {
  const scale = imageScale(doc, image);
  if (roi.type === "line") return formatLength(roiPerimeter(roi, scale), scale.unit);
  const ready = doc.ready(image.id);
  const mask = ready ? roiMask(roi, ready.working) : null;
  return `${formatArea(roiArea(roi, scale), scale.unit)}, ${mask ? `${maskCount(mask)} pixels` : "not shown"}`;
}

function roiCommand(doc: PlotDocument, rest: string[]): ConsoleResult {
  const image = stepImage(doc);
  if (!image) return { lines: ["Select one image first."] };
  const [sub, ...values] = rest;
  if (sub === "add") {
    const [type, ...numbers] = values;
    const n = numbers.map(Number);
    const drawn: DrawnRoi = type === "rectangle" || type === "ellipse"
      ? { type, x: n[0], y: n[1], width: n[2], height: n[3] }
      : { type: type as "polygon" | "line", points: Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]] as [number, number]) };
    const problem = roiProblem({ ...drawn, id: "", name: "" } as Roi);
    if (problem) return { lines: [problem] };
    return { lines: [addRoi(image.id, drawn)] };
  }
  let roi: Roi;
  try { roi = numberedItem(image.rois, values[0], "region"); } catch (error) { return { lines: [reason(error)] }; }
  if (sub === "crop") return { lines: [cropToRegion(roi.id)] };
  if (sub === "hull") return { lines: [regionHull(roi.id)] };
  if (sub === "fill" || sub === "clear") return { lines: [fillRegion(roi.id, sub === "clear", values[1] === undefined ? undefined : Number(values[1]))] };
  // info
  const scale = imageScale(doc, image);
  const rows: [string, string][] = [["Name", roi.name], ["Type", ROI_LABELS[roi.type]]];
  if (isBox(roi)) rows.push(["Box", `${formatMeasure(roi.width)} × ${formatMeasure(roi.height)} px at ${formatMeasure(roi.x)}, ${formatMeasure(roi.y)}`]);
  if (roi.type === "line") rows.push(["Length", formatLength(roiPerimeter(roi, scale), scale.unit)]);
  else {
    const ready = doc.ready(image.id);
    const mask = ready ? roiMask(roi, ready.working) : null;
    rows.push(["Area", formatArea(roiArea(roi, scale), scale.unit)], ["Pixels", mask ? String(maskCount(mask)) : "Not shown"], ["Perimeter", formatLength(roiPerimeter(roi, scale), scale.unit)]);
  }
  return { lines: rows.map(([label, comment]) => ({ label, comment, labelWidth: 9, subdued: true })) };
}

// MARK: Terminal: calibration

/** A calibration from `<pixels> <length> <unit>` or `scale <length> <unit>`, keeping an aspect ratio; or a sentence. */
function calibrationFrom(words: string[], aspect: number): Calibration | string {
  const scale = words[0] === "scale";
  const [a, b, unitText] = scale ? [1, words[1], words[2]] : words;
  const unit = parseUnit(String(unitText));
  if (!unit) return "The unit is nm, µm (or um), mm, cm, m or in.";
  const calibration = scale ? directScale(Number(b), unit, aspect) : knownLength(Number(a), Number(b), unit, aspect);
  return calibrationProblem(calibration) ?? calibration;
}

function calibrateCommand(doc: PlotDocument, arg: string): ConsoleResult {
  const words = arg.split(/\s+/).filter(Boolean);
  const forDocument = words[0] === "default";
  const rest = forDocument ? words.slice(1) : words;
  const image = stepImage(doc);
  if (!forDocument && !image && rest.length) return { lines: ["Select one image first, or use calibrate default."] };
  const show = (): ConsoleResult => {
    if (forDocument || !image) return { lines: [`Document default: ${calibrationSummary(doc.project.calibration)}.`] };
    const { calibration, from } = resolveCalibration(image.calibration, doc.project.calibration, settings.appCalibration);
    const source = from === "image" ? "its own" : from === "document" ? "the document's default" : from === "app" ? "the app's default" : "none";
    return { lines: [
      { label: "Calibration", comment: `${calibrationSummary(calibration)} (${source})`, labelWidth: 11, subdued: true },
      { label: "Pixel size", comment: pixelSizeText(imageScale(doc, image)), labelWidth: 11, subdued: true },
    ] };
  };
  if (!rest.length) return show();
  const current = forDocument ? doc.project.calibration : image!.calibration === "pixels" ? null : image!.calibration;
  let next: ImageCalibration;
  if (rest[0] === "pixels" && !forDocument) next = "pixels";
  else if (rest[0] === "none" && forDocument) next = null;
  else if (rest[0] === "follow" && !forDocument) next = null;
  else if (rest[0] === "line" && !forDocument) {
    let roi: Roi;
    try { roi = numberedItem(image!.rois, rest[1], "region"); } catch (error) { return { lines: [reason(error)] }; }
    if (roi.type !== "line") return { lines: [`${roi.name} is not a line.`] };
    const unit = parseUnit(String(rest[3]));
    if (!unit) return { lines: ["The unit is nm, µm (or um), mm, cm, m or in."] };
    return { lines: [calibrateFromLine(roi.id, Number(rest[2]), unit) ?? ""] };
  } else if (rest[0] === "aspect") {
    if (!current) return { lines: ["Calibrate first; pixels have no aspect ratio."] };
    const aspect = Number(rest[1]);
    const problem = calibrationProblem({ ...current, aspect });
    if (problem) return { lines: [problem] };
    next = { ...current, aspect };
  } else {
    const made = calibrationFrom(rest, current?.aspect ?? 1);
    if (typeof made === "string") return { lines: [made] };
    next = made;
  }
  return { lines: [setCalibration(forDocument ? "document" : "image", next) ?? ""] };
}

/** `data`: list, show and select data files, set how one is read and its columns' roles and units, or remove one. */
function dataCommand(doc: PlotDocument, rest: string[]): ConsoleResult {
  const [sub, ...words] = rest;
  const text = words.join(" ");
  const unquote = (value: string) => value.trim().replace(/^"(.*)"$/, "$1").trim();
  let link: ProjectData | null;
  try {
    link = ["info", "columns"].includes(sub) && words[0] ? numberedItem(doc.project.data, words[0], "data file")
      : doc.selectedData() ?? (doc.project.data.length === 1 ? doc.project.data[0] : null);
  } catch (error) { return { lines: [reason(error)] }; }
  if (!link) return { lines: ["Select a worksheet, or give its number from data list."] };
  const state = doc.tables.get(link.id);
  const loaded = state?.kind === "ready" ? state.loaded : null;
  const columns = loaded ? loaded.table.columns : [];
  if (sub === "info") {
    const loaded = state?.kind === "ready" ? state.loaded : null, read = link.read;
    const rows: [string, string][] = [["Name", link.name], ["File", link.path ?? link.file], ["Status", STATUS_TEXT(state)], ["Format", DATA_FORMAT_LABELS[link.source.format]]];
    if (link.source.format === "xlsx") rows.push(["Sheet", loaded?.sheet ?? read.sheet ?? "First"], ["Range", read.range ?? "All"]);
    else rows.push(
      ["Delimiter", read.delimiter ? DELIMITER_NAMES[read.delimiter] : `Automatic${loaded?.delimiter ? ` (${DELIMITER_NAMES[loaded.delimiter]})` : ""}`],
      ["Decimal mark", read.decimal ? (read.decimal === "," ? "Comma" : "Point") : `Automatic${loaded?.decimal ? ` (${loaded.decimal === "," ? "comma" : "point"})` : ""}`]);
    rows.push(["Header", read.header === null ? "Guessed" : read.header ? "First row" : "None"], ["Skip rows", String(read.skipRows)]);
    if (loaded) rows.push(["Rows", String(loaded.table.rows)], ["Columns", String(loaded.table.columns.length)]);
    return { tables: [{ headers: [], rows }] };
  }
  if (sub === "columns") {
    if (!columns.length) return { lines: [`${link.name} has no columns to show: ${STATUS_TEXT(state).toLowerCase()}.`] };
    const number = (value: number | null, kind: string) => (value === null || kind === "date" ? "" : formatMeasure(value));
    return { tables: [{ headers: ["Column", "Count", "Min", "Max"], rows: columns.map((column) => [
      columnLetterOf(loaded?.table ?? null, column.key), String(column.stats.count || column.text.filter(Boolean).length), number(column.stats.min, column.kind), number(column.stats.max, column.kind),
    ]) }] };
  }
  if (sub === "names") {
    const own = doc.project.ranges.filter((name) => name.data === link.id);
    if (!own.length) return { lines: [`${link.name} has no named cells. Type data name B2:B40 Time to name some.`] };
    return { tables: [{ headers: ["Name", "Unit", "Cells"], rows: own.map((name) => [name.name, name.unit, cellsText(name, loaded?.table ?? null)]) }] };
  }
  if (sub === "name") {
    const [reference, ...rest] = words;
    const match = /^([A-Z]{1,3})(?:(\d+)(?::([A-Z]{1,3})?(\d+))?)?$/i.exec(reference ?? "");
    const table = loaded?.table ?? null;
    if (!table) return { lines: [`${link.name} is not read yet.`] };
    if (!match || (match[3] && match[3].toUpperCase() !== match[1].toUpperCase())) return { lines: [`${reference ?? ""} is not cells of one column. Write them as B2:B40, B7 or B.`] };
    const column = table.columns.find((item) => columnLetterOf(table, item.key) === match[1].toUpperCase());
    if (!column) return { lines: [`${link.name} has no column ${match[1].toUpperCase()}.`] };
    const first = match[2] ? Number(match[2]) - 1 : null, last = match[4] ? Number(match[4]) - 1 : first;
    const rows = first === null || last === null ? null : { first: Math.min(first, last), last: Math.max(first, last) };
    return { lines: [nameCells(link, table, { data: link.id, column: column.key, rows }, unquote(rest.join(" "))).text] };
  }
  if ((sub === "delimiter" || sub === "decimal") && link.source.format === "xlsx") return { lines: [`${link.name} is an Excel workbook; its cells need no delimiter or decimal mark.`] };
  if ((sub === "sheet" || sub === "range") && link.source.format !== "xlsx") return { lines: [`${link.name} is text; sheets and ranges are for Excel workbooks.`] };
  const delimiters: Record<string, Delimiter | null> = { auto: null, comma: ",", tab: "\t", semicolon: ";", bar: "|" };
  let patch: Partial<DataReadOptions>;
  try {
    patch = sub === "header" ? { header: text === "auto" ? null : text === "on" }
      : sub === "delimiter" ? { delimiter: delimiters[text] }
      : sub === "decimal" ? { decimal: text === "auto" ? null : text === "comma" ? "," : "." }
      : sub === "skip" ? { skipRows: Number(text) }
      : sub === "sheet" ? { sheet: unquote(text), range: null }
      : { range: parseRangeInput(text) };
  } catch (error) { return { lines: [reason(error)] }; }
  if (sub === "sheet" && state?.kind === "ready" && !state.loaded.sheets.includes(patch.sheet!)) return { lines: [`${link.name} has no sheet named ${patch.sheet}. Its sheets: ${state.loaded.sheets.join(", ")}.`] };
  return { lines: [setDataRead(link.id, patch) || "Nothing changed."] };
}

/** `plot`: list, make, select and place plots, and set a plot's title, axes, legend and series. */
function plotCommand(doc: PlotDocument, rest: string[]): ConsoleResult {
  const [sub, ...words] = rest;
  const text = words.join(" ").trim();
  if (sub === "new") { const result = insertPlot(text as PlotKind); return { lines: [result.text] }; }
  if (sub === "series" && !words.length) return seriesList(doc);
  if (sub === "template" && (words[0] === "list" || words[0] === "remove" || words[0] === "default")) {
    const name = words.slice(1).join(" ").trim().replace(/^"(.*)"$/, "$1");
    if (words[0] === "list") {
      const list = plotTemplates();
      return list.length ? { tables: [{ headers: [], numbered: true, rows: list.map((item, index) => [listNumber(index + 1), item.name, `${item.plot.series.length} series styles${settings.newPlotTemplate === item.name ? ", new plots take it" : ""}`]) }] } : { lines: ["No templates. Select a plot and type plot template save."] };
    }
    if (words[0] === "default") {
      if (name && name !== "none" && !plotTemplates().some((item) => item.name === name)) return { lines: [`There is no template ${name}.`] };
      setNewPlotTemplate(name && name !== "none" ? name : null);
      return { lines: [name && name !== "none" ? `New plots take the look of ${name}.` : "New plots take the default look."] };
    }
    return { lines: [removeTemplate(name).text] };
  }
  let plot: ProjectPlot | null;
  try {
    plot = sub === "info" && words[0] ? numberedItem(doc.project.plots, words[0], "plot")
      : doc.selectedPlot() ?? (doc.project.plots.length === 1 ? doc.project.plots[0] : null);
  } catch (error) { return { lines: [reason(error)] }; }
  if (!plot) return { lines: ["Select a plot, or give its number from plot list."] };
  const id = plot.id, name = plot.name;
  if (sub === "swap") {
    editPlot(id, (target) => swapAxes(target, text === "x" ? "x" : "y"));
    return { lines: [text === "x" ? `Swapped ${name}'s bottom and top X axes.` : `Swapped ${name}'s left and right Y axes.`] };
  }
  if (sub === "part") {
    const ids = plot.series.map((series) => series.id);
    let part: PlotPart;
    try { part = parsePart(text, plot.series); } catch (error) { return { lines: [reason(error)] }; }
    doc.selection = new Set([id]);
    doc.plotPart = { plotId: id, part };
    refresh();
    workspace.reveal();
    inspector.revealPart(doc);
    return { lines: [`Chose ${partName(part, plot.series).replace(/^[A-Z]/, (letter) => letter.toLowerCase())} of ${name}.`] };
  }
  const sources = doc.plotSources();
  const { x, y, y2, x2, columns } = resolvePlot(plot, sources);
  if (sub === "info") {
    const axis = (label: string, scale: AxisScale, title: string) => [label, `${title || "No title"}; ${scaleLabel(scale, scale.min)} to ${scaleLabel(scale, scale.max)}, ${scale.log ? "log" : `step ${tickLabel(scale.step, scale.step)}`}`] as [string, string];
    const rows: [string, string][] = [["Name", name], ["Title", plot.title || "None"], ["Legend", plot.legend ? "On" : "Off"], ["Size", `${plot.width} × ${plot.height} px`],
      axis("X axis", x, axisTitle(plot.xAxis, columns.x)), axis(y2 ? "Left Y axis" : "Y axis", y, axisTitle(plot.yAxis, columns.y))];
    if (y2) rows.push(axis("Right Y axis", y2, axisTitle(plot.y2Axis, columns.y2)));
    if (x2) rows.push(axis("Top X axis", x2, axisTitle(plot.x2Axis, columns.x2)));
    plot.series.forEach((series, index) => rows.push([`Series ${index + 1}`, `${rangeLabel(sources.names, series.y, sources.sheet(series.y.data), sources.table(series.y.data))} against ${series.x ? rangeLabel(sources.names, series.x, sources.sheet(series.x.data), sources.table(series.x.data)) : "the row number"}; ${series.kind !== "scatter" && series.connect !== "straight" ? `${series.connect}, ` : ""}${PLOT_KIND_NAMES[series.kind].toLowerCase()}${series.axis === "y2" ? ", right Y axis" : ""}`]));
    return { tables: [{ headers: [], rows }] };
  }
  if (sub === "template") {
    const name = words.slice(1).join(" ").trim().replace(/^"(.*)"$/, "$1");
    return { lines: [(words[0] === "save" ? saveTemplate(id, name) : applyTemplateTo(id, name)).text] };
  }
  if (sub === "batch") {
    const own = plotSheet(plot);
    return { lines: [batchPlot(id, doc.project.data.filter((link) => link.id !== own).map((link) => link.id)).text] };
  }
  if (sub === "title") { editPlot(id, (target) => { target.title = text === "none" ? "" : text.replace(/^"(.*)"$/, "$1"); }); return { lines: [text && text !== "none" ? `${name} is titled ${text}.` : `${name} has no title.`] }; }
  if (sub === "legend" && words[0] === "place") {
    const place = words[1] as LegendPlace;
    editPlot(id, (target) => { target.legendPlace = place; });
    return { lines: [`${name}'s legend stands ${place === "auto" ? "in the top corner that covers less data" : `at the ${LEGEND_PLACES[place].toLowerCase()}`}.`] };
  }
  if (sub === "legend" && words[0] === "background") {
    editPlot(id, (target) => { target.legendBack = words[1] === "none" ? "none" : "white"; });
    return { lines: [words[1] === "none" ? `${name}'s legend has no background.` : `${name}'s legend is on white.`] };
  }
  if (sub === "legend") { editPlot(id, (target) => { target.legend = text === "on"; }); return { lines: [`${name}'s legend is ${text}.`] }; }
  const which = /^(x2|x|y2|y)/.exec(sub)?.[1] ?? "x", setting = sub.slice(which.length);
  const axisKey = ({ x: "xAxis", y: "yAxis", y2: "y2Axis", x2: "x2Axis" } as const)[which as "x" | "y" | "y2" | "x2"];
  const label = which === "y2" ? "right Y" : which === "x2" ? "top X" : which.toUpperCase();
  if (setting === "title") {
    const title = text === "auto" || !text ? null : text === "none" ? "" : text.replace(/^"(.*)"$/, "$1");
    editPlot(id, (target) => { target[axisKey].title = title; });
    return { lines: [title === null ? `The ${label} axis takes its column's name and unit.` : title ? `The ${label} axis is titled ${title}.` : `The ${label} axis has no title.`] };
  }
  if (setting === "range") {
    if (text === "auto") { editPlot(id, (target) => { target[axisKey].min = null; target[axisKey].max = null; }); return { lines: [`The ${label} axis fits its data.`] }; }
    const [min, max] = words.map(parseAxisValue);
    if (min === null || max === null || Number.isNaN(min) || Number.isNaN(max) || min >= max) return { lines: [`Invalid ${label} range. Give the start and then a greater end, or auto.`] };
    editPlot(id, (target) => { target[axisKey].min = min; target[axisKey].max = max; });
    return { lines: [`The ${label} axis runs from ${min} to ${max}.`] };
  }
  if (setting === "step") {
    const step = parseAxisValue(text);
    if (Number.isNaN(step) || (step !== null && step <= 0)) return { lines: [`Invalid ${label} step. Give a number above 0, or auto.`] };
    editPlot(id, (target) => { target[axisKey].step = step; });
    return { lines: [step === null ? `The ${label} axis picks a round step.` : `The ${label} axis has a major tick every ${step}.`] };
  }
  if (setting === "format") {
    const format = text as AxisFormat;
    editPlot(id, (target) => { target[axisKey].format = format === "auto" ? undefined : format; });
    return { lines: [`The ${label} axis' labels read as ${format === "auto" ? "the cells are (dates for date cells, else numbers)" : AXIS_FORMAT_NAMES[format].toLowerCase()}.`] };
  }
  if (setting === "numbers") {
    const format = numberFormatFromWords(words);
    if (!format) return { lines: [`Invalid ${label} number format. Give ${NUMBER_FORMAT_WORDS}.`] };
    const kept = axisNumbers(format);
    editPlot(id, (target) => { if (kept) target[axisKey].numbers = kept; else delete target[axisKey].numbers; });
    return { lines: [kept ? `The ${label} axis writes its numbers ${numberFormatWords(kept)}.` : `The ${label} axis writes its numbers with as many decimals as its step has.`] };
  }
  if (setting === "angle") {
    const angle = Number(text) as LabelAngle;
    if (!LABEL_ANGLES.includes(angle)) return { lines: [`Invalid ${label} label angle. Give 0, 45 or 90.`] };
    editPlot(id, (target) => { if (angle) target[axisKey].angle = angle; else delete target[axisKey].angle; });
    return { lines: [angle ? `The ${label} axis' tick labels are turned ${angle}°.` : `The ${label} axis' tick labels are level.`] };
  }
  if (setting === "scale") { editPlot(id, (target) => { target[axisKey].log = text === "log"; }); return { lines: [`The ${label} axis is ${text === "log" ? "logarithmic" : "linear"}.`] }; }
  if (setting === "minor") {
    const step = text === "none" ? 0 : parseAxisValue(text);
    if (Number.isNaN(step) || (step !== null && step < 0)) return { lines: [`Invalid ${label} minor step. Give a number above 0, auto or none.`] };
    editPlot(id, (target) => { target[axisKey].minorStep = step; });
    return { lines: [step === null ? `The ${label} axis takes a round part of its major step for minor ticks.` : step === 0 ? `The ${label} axis has no minor ticks.` : `The ${label} axis has a minor tick every ${step}; a step that does not divide the major step evenly is drawn as auto.`] };
  }
  if (sub === "series") {
    const [number, property, ...value] = words;
    const series = plot.series[Number(number) - 1];
    if (!series) return { lines: [`${name} has no series ${number}. It has ${plot.series.length}.`] };
    const choice = value.join(" ").trim();
    if (property === "x" || property === "y" || property === "error" || property === "labels") {
      const sheets = doc.project.data.map((link) => ({ id: link.id, name: link.name, table: doc.table(link.id) }));
      const read = choice === "none" && property !== "y" ? null : parseReference(choice, sheets, doc.project.ranges, series.y.data);
      if (typeof read === "string") return { lines: [read] };
      editPlot(id, (target) => { const item = target.series[Number(number) - 1]; if (property === "y") { if (read) item.y = read; } else item[property] = read; });
      return { lines: [`Series ${number}'s ${PICK_WHAT[property]}: ${read ? rangeLabel(doc.project.ranges, read, doc.dataLink(read.data)?.name ?? "Sheet", doc.table(read.data)) : property === "x" ? "the row number" : "none"}.`] };
    }
    if (property === "callout") {
      const [what, at] = value;
      const text = what === "none" ? null : what as CalloutText, first = pointRow(plot.series, series.id, 0);
      const index = at === undefined ? null : Number(at) - first;
      if (index !== null && !(index >= 0)) return { lines: [`Give the point's worksheet row, from ${first}.`] };
      editPlot(id, (target) => setCallout(target.series[Number(number) - 1], index, text));
      const said = text ? CALLOUT_NAMES[text].toLowerCase() : "nothing";
      return { lines: [index === null ? `Every point of series ${number} shows ${said}.` : `The point at row ${index + first} of series ${number} shows ${said}.`] };
    }
    if (property === "fit") {
      const [word, size] = value;
      const kind = fitKindOf(word);
      if (word !== "none" && !kind) return { lines: [fitKindReply] };
      const n = size === undefined ? null : Number(size);
      if (n !== null && kind && isSmoothing(kind) && (n < 3 || n % 2 === 0)) return { lines: ["A smoothing window is an odd number of points from 3."] };
      if (n !== null && kind === "polynomial" && (n < 2 || n > 6)) return { lines: ["A polynomial's order is 2 to 6."] };
      if (n !== null && kind === "gaussians" && (n < 2 || n > 6)) return { lines: ["Gaussian peaks are 2 to 6."] };
      if (n !== null && kind && !isSmoothing(kind) && !hasOrder(kind)) return { lines: [`${FIT_NAMES[kind]} takes no size.`] };
      // The series' first fit takes the model (or the series gets one); none removes every fit.
      editPlot(id, (target) => {
        const item = target.series[Number(number) - 1];
        if (word === "none" || !kind) { item.fits = []; return; }
        const first = item.fits[0] ? refit(item.fits[0], kind) : newFit(kind, freeFitId(item));
        item.fits = [{ ...first, ...(n !== null ? (isSmoothing(kind) ? { window: n } : { order: n }) : {}) }, ...item.fits.slice(1)];
      });
      return { lines: [word === "none" || !kind ? `Series ${number} of ${name} has no fits.` : `Series ${number} of ${name}: ${FIT_NAMES[kind].toLowerCase()}${n !== null ? (isSmoothing(kind) ? `, ${n} points` : kind === "gaussians" ? `, ${n} peaks` : `, order ${n}`) : ""}.`] };
    }
    if (property === "equation") {
      if (!series.fits.length) return { lines: [`Series ${number} has no fit; set one with plot series ${number} fit linear.`] };
      editPlot(id, (target) => { const item = target.series[Number(number) - 1]; item.fits = item.fits.map((fit) => ({ ...fit, equation: choice === "on" })); });
      return { lines: [`Series ${number}'s equation is ${choice === "on" ? "shown on" : "left off"} the plot.`] };
    }
    if (property === "axis") {
      const horizontal = choice === "top" || choice === "bottom";
      editPlot(id, (target) => { const item = target.series[Number(number) - 1]; if (horizontal) item.xAxis = choice === "top" ? "x2" : "x"; else item.axis = choice === "right" ? "y2" : "y"; });
      return { lines: [`Series ${number} of ${name} is drawn against the ${choice} ${horizontal ? "X" : "Y"} axis.`] };
    }
    if (property === "colour") {
      // auto: the data palette's colour for the series' place, which follows Settings › General › Data colours.
      // auto, a place in the data palette chosen in Settings (1, 2, …) or #rrggbb (forge-shell data-colour).
      const count = plot.series.length, colour = dataColourFromWord(choice, currentDataPalette(), count);
      if (colour === undefined) return { lines: [`Unknown colour ${choice}. Use ${dataColourWords(currentDataPalette(), count)}.`] };
      editPlot(id, (target) => { target.series[Number(number) - 1].colour = colour; });
    } else editPlot(id, (target) => {
      const item = target.series[Number(number) - 1];
      if (property === "kind") item.kind = choice as PlotKind;
      else if (property === "symbol") item.symbol = choice as SymbolShape;
      else if (property === "line") item.dash = choice as LineDash;
      else if (property === "connect") item.connect = choice as LineConnect;
      else item.name = choice ? choice.replace(/^"(.*)"$/, "$1") : null;
    });
    return { lines: [`Series ${number} of ${name}: ${property} ${choice || "from its range's name"}.`] };
  }
  return { lines: ["Nothing changed."] };
}

// MARK: Terminal: the document's objects

// The document's objects for the Edit commands (copy, cut, duplicate, delete): named, or by kind and number in list.
/** The objects of a kind word (`image`, `data`, `plot` or their plurals), as `list` numbers them; null for another word. */
function objectsOfKind(doc: PlotDocument, word: string): readonly SurfaceObject[] | null {
  const kind = word.toLowerCase();
  if (kind === "image" || kind === "images") return doc.project.images;
  if (kind === "data" || kind === "data files") return doc.project.data;
  if (kind === "plot" || kind === "plots") return doc.project.plots;
  return null;
}

/**
 * Objects named by kind and number in `list` (image 2, plot 1) or by name, separated by commas; an unknown one is
 * refused. Numbers are per kind, as the shell's `list` gives them.
 */
function objectsNamed(doc: PlotDocument, text: string): SurfaceObject[] {
  const all = doc.objects();
  const found = text.split(",").map((word) => word.trim().replace(/^"(.*)"$/, "$1")).filter(Boolean).map((word) => {
    const [, kindWord, number] = /^(.+?)\s+(\d+)$/.exec(word) ?? [];
    const kind = kindWord ? objectsOfKind(doc, kindWord) : null;
    if (kind) {
      const object = kind[Number(number) - 1];
      if (!object) throw new Error(`No ${kindWord} ${number}. Type list ${kindWord} to list them.`);
      return object;
    }
    const object = all.find((item) => item.name.toLowerCase() === word.toLowerCase());
    if (!object && /^\d+$/.test(word)) throw new Error(`A number needs its kind: image ${word}, data ${word} or plot ${word}.`);
    if (!object) throw new Error(all.length ? `No object ${word}. Type list to list them.` : "The document has no objects.");
    return object;
  });
  return [...new Set(found)];
}

/** `plot series`: every plot's series, with its kind and fits. */
function seriesList(doc: PlotDocument): ConsoleResult {
  const rows = doc.project.plots.flatMap((plot) => plot.series.map((series, index) => [plot.name, String(index + 1), seriesName(series, rangeName(doc.project.ranges, series.y), seriesReference(series, doc.plotSources())), PLOT_KIND_NAMES[series.kind], String(series.fits.length || "—")]));
  return rows.length ? { tables: [{ headers: ["Plot", "Series", "Name", "Kind", "Fits"], rows }] } : { lines: ["No plots have series."] };
}

/** Select objects for an Edit command: the named ones, or the selection as it is. */
function chooseObjects(doc: PlotDocument, text: string): void {
  if (!text.trim()) { if (!doc.selection.size) throw new Error("Select objects first, or name them: a kind and its number in list, or a name."); return; }
  doc.selection = new Set(objectsNamed(doc, text).map((object) => object.id));
  doc.plotPart = null;
  refresh();
}
const OBJECT_COMMANDS = new Set(["copy", "cut", "duplicate", "delete", "paste", "arrange"]);
const ARRANGE_WORDS: Record<string, Arrangement> = { front: "bringToFront", forward: "bringForward", backward: "sendBackward", back: "sendToBack" };

async function objectCommand(doc: PlotDocument, command: string, arg: string): Promise<ConsoleResult> {
  try {
    if (command === "paste") {
      if (arg === "into") { await pasteIntoSelection(); return { lines: [] }; }
      return { lines: [objectClip ? pasteObjects(doc) : "Nothing is copied. Copy objects first: select them and press Cmd+C, or type copy."] };
    }
    if (command === "arrange") {
      if (!doc.selection.size) return { lines: ["Select objects first."] };
      arrange(ARRANGE_WORDS[arg]);
      return { lines: [`Moved ${doc.selection.size === 1 ? doc.selectedObjects()[0].name : `${doc.selection.size} objects`} ${arg === "front" ? "to the front" : arg === "back" ? "to the back" : arg}.`] };
    }
    chooseObjects(doc, arg);
    if (command === "copy") return { lines: [await copyObjects(doc) ?? "Nothing to copy."] };
    if (command === "cut") { const said = await copyObjects(doc); if (said) removeSelection(doc); return { lines: [said ? said.replace(/^Copied/, "Cut") : "Nothing to cut."] }; }
    if (command === "duplicate") {
      if (!doc.selectedImages().length && !doc.selectedPlot() && !doc.project.plots.some((plot) => doc.selection.has(plot.id))) return { lines: ["Only images and plots are duplicated; copy and paste a worksheet instead."] };
      duplicateImages();
      return { lines: [] };
    }
    const names = doc.selectedObjects().map((object) => object.name);
    removeSelection(doc);
    return { lines: [names.length === 1 ? `Removed ${names[0]}. Undo brings it back.` : `Removed ${names.length} objects. Undo brings them back.`] };
  } catch (error) { return { lines: [reason(error)] }; }
}

// MARK: Terminal: list-and-edit verbs

/** A two-column table's rows as the label-and-value lines `info` shows. */
function infoLines(result: ConsoleResult): (string | ConsoleListItem)[] {
  const rows = result.tables?.[0]?.rows;
  if (!rows) return result.lines ?? [];
  const labelWidth = Math.max(...rows.map(([label]) => String(label).length));
  return rows.map(([label, comment]) => ({ label: String(label), comment: String(comment), labelWidth, subdued: true }));
}
/** An item's list number, as the handlers take it. */
const numberOf = <T>(items: readonly T[], item: T) => String(items.indexOf(item) + 1);
const selectOneImage = () => (stepImage() ? null : "Select one image first.");
const needDoc = () => { if (!active) throw new Error(`Open a ${config.document.noun} first.`); return active; };

bindItems<ProjectData>("data", {
  items: () => active?.project.data ?? [], name: (link) => link.name,
  detail: (link) => { const state = active?.tables.get(link.id); return `${DATA_FORMAT_LABELS[link.source.format]}, ${state?.kind === "ready" ? `${state.loaded.table.columns.length} columns, ${state.loaded.table.rows} rows` : STATUS_TEXT(state)}`; },
  selected: () => active?.selectedData() ?? null,
  info: (link) => infoLines(dataCommand(needDoc(), ["info", numberOf(needDoc().project.data, link)])),
  select: (link) => { selectData(link.id, null); workspace.reveal(); },
  move: (link, x, y) => placeData(link.id, { x, y }),
  size: (link, width, height) => {
    if (width < SHEET.minWidth || height < SHEET.minHeight) throw new Error(`A worksheet is at least ${SHEET.minWidth} × ${SHEET.minHeight} px.`);
    placeData(link.id, { width, height });
  },
  remove: (link) => { removeData([link.id]); return `Removed ${link.name}. The file ${link.file} is unchanged.`; },
  run: (words) => dataCommand(needDoc(), words),
});

bindItems<ProjectPlot>("plot", {
  items: () => active?.project.plots ?? [], name: (plot) => plot.name, detail: (plot) => `${plot.series.length} series, ${plot.title || "no title"}`,
  selected: () => active?.selectedPlot() ?? null,
  info: (plot) => infoLines(plotCommand(needDoc(), ["info", numberOf(needDoc().project.plots, plot)])),
  select: (plot) => { const doc = needDoc(); doc.selection = new Set([plot.id]); doc.plotPart = null; refresh(); workspace.reveal(); },
  move: (plot, x, y) => editPlot(plot.id, (target) => { target.x = x; target.y = y; }),
  size: (plot, width, height) => {
    if (width < PLOT_SIZE.minWidth || height < PLOT_SIZE.minHeight) throw new Error(`A plot is at least ${PLOT_SIZE.minWidth} × ${PLOT_SIZE.minHeight} px.`);
    editPlot(plot.id, (target) => { target.width = width; target.height = height; });
  },
  remove: (plot) => {
    editActive((current) => { current.project.plots = current.project.plots.filter((item) => item.id !== plot.id); current.selection.delete(plot.id); });
    return `Removed ${plot.name}. Undo brings it back.`;
  },
  run: (words) => plotCommand(needDoc(), words),
});

bindItems<ProjectImage>("image", {
  items: () => active?.project.images ?? [], name: (image) => image.name,
  detail: (image) => `${image.source.widthPx} × ${image.source.heightPx}, ${FORMAT_LABELS[image.source.format]}`,
  selected: () => active?.selectedImages()[0] ?? null,
  info: (image) => imageInfo(needDoc(), image).lines ?? [],
  select: (image) => { needDoc().selection = new Set([image.id]); refresh(); workspace.reveal(); },
  rename: (image, name) => {
    if (needDoc().project.images.some((other) => other !== image && other.name.toLowerCase() === name.toLowerCase())) throw new Error(`The name ${name} is already used.`);
    editActive((current) => { const target = current.image(image.id); if (target) target.name = name; });
  },
  move: (image, x, y) => moveImage(image.id, x, y),
  remove: (image) => { removeImages([image.id]); return `Removed ${image.name}. The file ${image.file} is unchanged.`; },
  run: ([sub, value]) => {
    if (sub !== "turn") return { lines: [] };
    const image = needDoc().selectedImages()[0], degrees = Number(String(value ?? "").replace(/°$/, ""));
    if (!image) throw new Error("Select an image to turn.");
    if (!Number.isFinite(degrees)) throw new Error("Write the angle in degrees, such as image turn 12.5.");
    turnImage(image.id, degrees);
    return { lines: [`Turned ${image.name} to ${normalAngle(degrees)}°.`] };
  },
});

bindItems<Step>("step", {
  blocked: selectOneImage, items: () => stepImage()?.steps ?? [], name: (step) => stepName(step),
  detail: (step) => { const doc = needDoc(), image = stepImage()!; return `${summaryOf(doc, image, step)}${step.enabled ? "" : " (off)"}`; },
  remove: (step) => removeStep(step.id),
  run: (words) => stepCommand(needDoc(), words),
});

bindItems<Roi>("roi", {
  blocked: selectOneImage, items: () => stepImage()?.rois ?? [], name: (roi) => roi.name,
  detail: (roi) => `${ROI_LABELS[roi.type]}, ${roiMeasures(needDoc(), stepImage()!, roi)}`,
  info: (roi) => infoLines(roiCommand(needDoc(), ["info", numberOf(stepImage()!.rois, roi)])),
  remove: (roi) => removeRoi(stepImage()!.id, roi.id),
  run: (words) => roiCommand(needDoc(), words),
});

bindItems<Phase>("phase", {
  blocked: selectOneImage, items: () => { const image = stepImage(); return image ? stepPhases(image.steps) : []; }, name: (phase) => phase.name,
  detail: (phase) => {
    const doc = needDoc(), image = stepImage()!, result = doc.mask(image.id, phase.id)?.result;
    return `${phase.colour}, ${thresholdSummary(phase.threshold)}, ${result ? `${result.count} px` : "none masked"}${phase.id === doc.phase(image)?.id ? " (current)" : ""}`;
  },
  selected: () => { const image = stepImage(); return image ? needDoc().phase(image) ?? null : null; },
  select: (phase) => selectPhase(phase.id),
  rename: (phase, name) => {
    const problem = phaseNameProblem(name, stepPhases(stepImage()!.steps).filter((item) => item.id !== phase.id));
    if (problem) throw new Error(problem);
    changePhase(phase.id, { name });
  },
  remove: (phase) => removePhase(phase.id),
  run: (words) => phaseCommand(needDoc(), words),
});

bindItems<TextLabel>("label", {
  blocked: selectOneImage, items: () => stepImage()?.labels ?? [], name: (label) => label.text,
  detail: (label) => `${formatMeasure(label.x)}, ${formatMeasure(label.y)} px`,
  move: (label, x, y) => changeLabel(label.id, { x, y }),
  remove: (label) => removeLabel(label.id),
  run: (words) => labelCommand(needDoc(), words),
});

bindItems<FitEntry>("fit", {
  items: currentFits, name: fitName,
  detail: (entry) => `${modelName(entry.fit)}, ${typeof entry.result === "string" ? entry.result : `R² ${entry.result.statistics?.r2.toFixed(4) ?? "—"}${entry.result.converged === false ? ", did not converge" : ""}`}`,
  selected: () => { const part = active?.selectedPart(); if (!part || !("series" in part)) return null; return currentFits().find((entry) => entry.series.id === part.series && entry.fit === currentFit(entry.series)) ?? null; },
  info: fitInfoLines,
  select: chooseFit,
  remove: (entry) => { editFit(entry.plot.id, entry.series.id, entry.fit.id, () => null); return `Removed the fit of ${fitName(entry)}.`; },
  run: (words) => fitCommand(words),
});

async function execute(line: string, signal?: AbortSignal): Promise<ConsoleResult> {
  const text = helpAlias(line) ?? line.trim();
  const [command = "", ...rest] = text.split(/\s+/);
  const arg = rest.join(" ");
  const entry = COMMANDS.find((item) => item.name === command);
  if (!entry) return { lines: [`Unknown command: ${command}. Type help to list commands.`] };
  if (command === "help") return arg ? commandHelp(arg, welcome(), CATALOG) : generalHelp(welcome(), CATALOG);
  if (welcome() && !CATALOG.availableOnWelcome.has(command)) return { lines: [CATALOG.noDocumentMessage] };
  if (!entry.args.test(arg)) return invalidUsage(entry);
  const valueRefused = valueProblem(entry, arg);
  if (valueRefused) return { lines: [valueRefused] };
  if (command === "clear") return { clear: true };
  // The shell's tabs and tab verbs (`consoleTabCommand`); close stays the shared File › Close command.
  if (command === "tabs" || command === "tab") {
    try { return (await consoleTabCommand<PlotDocument>(command, arg, { documents: () => documents, activeDocument: () => active!, activate, close: async (doc) => { await close(doc); }, documentNoun: config.document.noun }))!; }
    catch (error) { return { lines: [reason(error)] }; }
  }
  const doc = active;
  if (doc && command === "import") { await importImages(); return { lines: [] }; }
  if (doc && command === "export") {
    // `export png`, `export jpeg [quality]` and, for plots, `export svg` change the format for this export only; the setting stays.
    const [format, quality] = rest;
    if (format === "svg" && !doc.project.plots.some((plot) => doc.selection.has(plot.id))) return { lines: ["Only plots export as SVG. Select a plot."] };
    const options: ExportOptions = format && format !== "svg" ? { ...exportOptionsOf(doc), format: format === "jpeg" ? "jpeg" : "png", ...(quality ? { jpegQuality: Number(quality) } : {}) } : exportOptionsOf(doc);
    if (!(options.jpegQuality >= 1 && options.jpegQuality <= 100)) return { lines: ["The quality is a whole number from 1 to 100."] };
    try { return { lines: [await exportSelection(options, format as PlotExportFormat | undefined) ?? "Export cancelled."] }; } catch (error) { return { lines: [`Couldn't export: ${reason(error)}`] }; }
  }
  if (doc && OBJECT_COMMANDS.has(command)) return objectCommand(doc, command, arg);
  if (doc && command === "snap") {
    if (!arg) return { lines: [`Snapping to the grid is ${doc.project.grid.snap ? "on" : "off"}.`] };
    const on = arg === "on";
    if (doc.project.grid.snap === on) return { lines: [`Snapping to the grid is already ${arg}.`] };
    setSnap(on);
    return { lines: [`Snapping to the grid is ${arg}.`] };
  }
  if (command === "name") return { lines: [renameDocument(arg.replace(/^"(.*)"$/, "$1").trim())] };
  if (doc && command in ITEM_VERBS) return runItemVerb(command, arg, signal);
  // The workspace verbs (list, info, select, rename, move, size, remove) over every kind of item, as <noun> <verb> runs.
  const verb = doc ? WORKSPACE.run(command, arg, signal) : null;
  if (verb) return verb;
  if (doc && command === "calibrate") return calibrateCommand(doc, arg);
  if (doc && command === "threshold") return thresholdCommand(doc, rest);
  if (command === "health") return healthCommand(arg, health);
  if (doc && command === "measure" && !rest.length) { const result = measureSelection(); return { lines: [result] }; }
  if (doc && command === "measure") return measureOptionCommand(rest);
  if (doc && command === "density") return densityCommand(rest);
  if (doc && command === "scalebar") {
    const shown = (on: boolean) => on ? "shown" : "hidden";
    if (!arg) return { lines: [stateReply("the calibration bar", shown(showScaleBar))] };
    const before = shown(showScaleBar);
    showScaleBar = arg === "on"; refresh();
    return { lines: [setReply("the calibration bar", before, shown(showScaleBar))] };
  }
  if (doc && command === "peaks") {
    const made = profileOf(doc), roi = doc.currentRoi()?.roi;
    if (typeof made === "string") return { lines: [made] };
    if (roi?.type !== "rectangle") return { lines: ["Peaks are labelled on a lane profile. Select a rectangle region."] };
    const minProminence = rest[0] ? Number(rest[0]) : Math.round((Math.max(...made.values) - Math.min(...made.values)) * 10) / 100;
    const peaks = labelledPeaks(made, minProminence);
    if (!peaks.length) return { lines: [`No peak stands ${formatMeasure(minProminence)} above its valleys.`] };
    return { tables: [{ headers: ["Peak", `At (${made.unit})`, "Top", "Prominence", "Samples", `Area (grey × ${made.unit})`], rows: peaks.map((peak) => [
      String(peak.label), formatMeasure(peak.distance), formatMeasure(peak.value), formatMeasure(peak.prominence), `${peak.from + 1} to ${peak.to + 1}`, formatMeasure(peak.area),
    ]) }], lines: [`Peaks of at least ${formatMeasure(minProminence)} prominence, valley to valley.`] };
  }
  if (doc && command === "results") return await resultsCommand(doc, rest);
  if (doc && command === "display") return displayCommand(doc, rest);
  if (doc && command === "histogram") return histogramCommand(doc, rest[0] ? Number(rest[0]) : DEFAULT_BINS);
  if (doc && command === "profile") { const made = profileOf(doc); return typeof made === "string" ? { lines: [made] } : { tables: [{ headers: [], numbered: true, rows: made.values.map((v, i) => [listNumber(i + 1), `${formatMeasure(made.distances[i])} ${made.unit}`, formatMeasure(v)]) }] }; }
  if (doc && command === "peak") {
    const made = profileOf(doc);
    if (typeof made === "string") return { lines: [made] };
    try { const area = peakArea(made, Number(rest[0]) - 1, Number(rest[1]) - 1); return { lines: [`Peak area from sample ${rest[0]} to ${rest[1]}: ${formatMeasure(area)} (grey value × ${made.unit}).`] }; }
    catch (error) { return { lines: [reason(error)] }; }
  }
  if (doc && command === "xy") { try { return { lines: [await exportCoordinates() ?? "Export cancelled."] }; } catch (error) { return { lines: [`Couldn't export the coordinates: ${reason(error)}`] }; } }
  if (doc && command === "pixel") return pixelCommand(doc, Number(rest[0]), Number(rest[1]));
  // The shared commands run the menu actions; Terminal's undo and redo are the document's, not the prompt's own text.
  return runSharedCommand(command, arg, {
    run: (action) => (action === "edit.undo" || action === "edit.redo" ? undoDocument(action === "edit.redo") : run(action)),
    actions: ACTIONS, hasDocument: !!doc, noun: config.document.noun, productName: config.identity.name, version: info.version,
    recent: () => (files ? recent.list() : []), openPath: (path) => void openRecent(path),
    openSettings, settingsPages: () => visiblePages(settingsPages()),
    fontSize: () => settings.terminalFontSize, setFontSize: (size) => store.updateSettings({ terminalFontSize: size }),
  }) ?? shellPreferenceCommand(command, arg, { settings, update: (change) => store.updateSettings(change), panes: [...PANES], selectPane: selectBottom }) ?? invalidUsage(entry);
}

// The Terminal's history limit, banner, caret, spacing and wrap, shared by the Terminal and its Settings page.
const terminalPreferences = createTerminalPreferences(terminalPreferencesStorageKey(PROFILE));
const terminal = new TerminalPanel($("terminal-pane"), __APP_LOGO__, __FORGE_VERSION__, { execute, complete: (line) => completions(line, welcome()) }, {
  appName: config.identity.name, tagline: config.identity.purpose, historyStorageKey: terminalHistoryStorageKey(PROFILE),
  fontSize: () => settings.terminalFontSize, setFontSize: (size) => store.updateSettings({ terminalFontSize: size }), onFontSizeChange: (listener) => store.onSettingsChange(listener),
  preferences: terminalPreferences,
});
selectBottom("terminal");
// The shell's shared settings (Appearance, the data palette, the hover card, autosave, the Terminal's preferences and
// the break reminder) follow every installed child app, live (forge-shell shared-settings).
shareSettings(desktop?.sharedSettings, { settings: store, terminal: terminalPreferences, health });

// MARK: menus on screen, and keys

const drawn = drawsMenubar(platform, !!desktop);
/** The tool strip's buttons follow the menus: each is enabled when its menu item would be. */
function refreshTools(): void {
  const doc = active, image = stepImage(doc);
  const enabled: Record<string, boolean> = {
    "edit.undo": !!doc?.canUndo, "edit.redo": !!doc?.canRedo, "edit.cut": !!doc?.selection.size, "edit.copy": !!doc?.selection.size || cellsChosen(), "edit.paste": true,
    "edit.duplicate": !!doc?.selection.size, "document.step.add.rotate-cw": !!image && !!doc?.ready(image.id), "edit.delete": !!doc?.selection.size || !!doc?.selectedData(),
    "view.fit": !!doc, "view.zoomIn": !!doc, "view.zoomOut": !!doc, "file.import": !!doc, "file.export": exportable(doc).length > 0,
  };
  for (const [id, on] of Object.entries(enabled)) strip.setEnabled(id, on);
}

function refreshMenus(): void {
  refreshTools();
  if (desktop && !drawn) desktop.setMenu(menus());
  else { renderMenubar($("menubar"), menus(), run, { titleBar: !!desktop }); desktop?.setTitleBar(titleBarColors()); }
}
/** Set while only a fold is saved: the section animates itself, so the inspector is not rebuilt under it. */
let foldOnly = false;
store.onSettingsChange(() => { applyLayout(); refreshMenus(); applyPlotText(); applyDataPalette(); applyObjectShadows(); if (!foldOnly) inspector.render(active); });

/**
 * Draw plots with the app's text settings: once their fonts have loaded (a canvas draws in a fallback face until then,
 * and is not told when the face arrives), the work surface and inspector are drawn again.
 */
/** Draw every plot's series in the data palette now chosen: a series without a colour of its own follows it at once. */
function applyDataPalette(): void {
  if (currentDataPalette() === settings.dataPalette) return;
  setDataPalette(settings.dataPalette);
  workspace.draw();
}
applyDataPalette();

let plotTextShown = "";
function applyPlotText(): void {
  const next = JSON.stringify(settings.plotText);
  if (next === plotTextShown) return;
  plotTextShown = next;
  setPlotText(settings.plotText);
  const { font, mathFont } = plotText();
  void Promise.all([`10px "${font}"`, `10px "${mathFont}"`].map((face) => document.fonts.load(face).catch(() => [])))
    .then(() => { workspace.draw(); inspector.render(active); });
  workspace.draw();
}
applyPlotText();

/** Draw the work surface again when Object shadows changes. */
let shadowsShown: boolean | null = null;
function applyObjectShadows(): void {
  if (settings.objectShadows === shadowsShown) return;
  shadowsShown = settings.objectShadows;
  setObjectShadows(settings.objectShadows);
  workspace.draw();
}
applyObjectShadows();
desktop?.onCommand(run);

/** Backspace or Delete on the work surface: removes the selected region, else the selected images. True when used. */
function deleteKey(doc: PlotDocument, event: KeyboardEvent): boolean {
  if (event.key !== "Backspace" && event.key !== "Delete" || event.metaKey || event.ctrlKey) return false;
  const current = event.altKey ? null : doc.currentRoi();
  if (current) { report(removeRoi(current.image.id, current.roi.id), "info"); return true; }
  if (!doc.selection.size) return false;
  removeSelection(doc);
  return true;
}

/** Esc on a chosen part of a plot goes a level up: a point to its series, a part to the plot; on the plot itself, the shell's Esc clears the selection. */
function partUp(): boolean {
  const plot = active?.selectedPlot(), part = active?.selectedPart();
  const up = part ? parentPart(part) : null;
  if (!active || !plot || !up) return false;
  choosePart(plot.id, up);
  return true;
}

// Esc while a polygon is being drawn drops only that polygon and keeps the tool, as in Illustrator and Affinity; the
// next Esc leaves the tool (the shell's tool-mode rule). Taken in the capture phase, before the shell's own Esc.
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) return;
  if (workspace.cancelDraft() || cancelPick() || partUp()) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
installWorkspaceKeys({
  desktop: !!desktop && !drawn, hasDocuments: () => documents.length > 0, typingInField: textInput.typingInField,
  shortcuts: () => collectShortcuts(menus()), run,
  escape: () => { if (active?.selection.size) { active.selection = new Set(); refresh(); } },
  domainKeyDown: (event) => {
    if (!active || event.target instanceof HTMLElement && event.target.closest("#terminal-pane")) return false;
    // A polygon being drawn takes Return, Backspace and Delete before the region and image keys.
    if (workspace.drawingKeyDown(event) || deleteKey(active, event)) return true;
    // The shell's canvas tool keys: V selects, C crops, R, E, P, F and L draw regions; S, N, M and B place plots.
    const tool = canvasToolForKey(event, PLOT_CANVAS_TOOLS);
    if (tool) { setTool(tool); return true; }
    const kind = plotKindForKey(event);
    if (kind) { setTool(`plot-${kind}`); return true; }
    return workspace.keyDown(event);
  },
  domainKeyUp: (event) => workspace.keyUp(event),
});

// Documents passed at launch (Finder, the command line) and while running.
desktop?.onOpenFiles((opened) => { for (const file of opened) openDocumentText(file.path, file.text); });
void desktop?.initialFiles().then((opened) => { for (const file of opened) openDocumentText(file.path, file.text); });

// MARK: Settings

/** The update options of Settings › Updates: Update and restart on the desktop, its download followed by the progress bar. */
const updateOptions = { platform, install: desktop ? (asset: Parameters<NonNullable<typeof desktop>["installUpdate"]>[0]) => desktop.installUpdate(asset) : undefined,
  onProgress: desktop ? (listener: (progress: { done: number; total: number }) => void) => desktop.onUpdateProgress(listener) : undefined, storageKey: blockStorageKey(PROFILE, "updates", "preferences") };

// The defaults of new work and of export (the app layer): Settings › Images, Plots and Export show them, each row keyed
// by its word, so that the shell's `settings <key> <value>` sets it and `settings list` lists it.
interface DefaultSetting { word: string; section: string; label: string; tip: string; choices(): readonly (readonly [string, string])[]; value(): string; set(value: string): void; fallback: string; accepts?(value: string): boolean; acceptsText?: string }

const imageDefaults = () => effective(BUILT_IN_IMAGE, settings.imageSettings, {});
const setImageDefault = <K extends keyof ImageSettings>(key: K, next: ImageSettings[K]) => store.updateSettings({ imageSettings: setOverride(BUILT_IN_IMAGE, {}, settings.imageSettings, key, next) });
const exportDefaults = () => effective(BUILT_IN_EXPORT, settings.exportOptions, {});
const setExportDefault = (change: Partial<ExportOptions>) => store.updateSettings({ exportOptions: cleanExportSettings({ ...settings.exportOptions, ...change }) });
const labelled = <T extends string>(labels: Record<T, string>) => Object.entries(labels) as [T, string][];
const plotExportDefaults = (): PlotExport => ({ format: PLOT_EXPORT_DEFAULT.format, dpi: PLOT_EXPORT_DEFAULT.dpi, ...settings.plotExport });
const setPlotExportDefault = (change: Partial<PlotExport>) => store.updateSettings({ plotExport: cleanPlotExport({ ...settings.plotExport, ...change }) });
const setPlotTextDefault = (change: Partial<PlotText>) => store.updateSettings({ plotText: cleanPlotText({ ...settings.plotText, ...change }) });
/** Point sizes to choose from, with the one set when it is not among them. */
const sizeChoices = (current: number) => [...new Set([...PLOT_TEXT_SIZES, current])].sort((a, b) => a - b).map((size) => [String(size), `${size} pt`] as const);

const DEFAULT_SETTINGS: DefaultSetting[] = [
  { word: "grey", section: "Images › New work", label: "Grey conversion", tip: "The method a new Convert to grey step starts with.", choices: () => labelled(GREY_METHOD_LABELS),
    value: () => imageDefaults().greyMethod, set: (next) => setImageDefault("greyMethod", next as ImageSettings["greyMethod"]), fallback: BUILT_IN_IMAGE.greyMethod },
  { word: "threshold", section: "Images › New work", label: "Threshold method", tip: "The method a new phase starts with.", choices: () => labelled(THRESHOLD_MODE_LABELS),
    value: () => imageDefaults().thresholdMode, set: (next) => setImageDefault("thresholdMode", next as ImageSettings["thresholdMode"]), fallback: BUILT_IN_IMAGE.thresholdMode },
  { word: "phase-colour", section: "Images › New work", label: "First phase colour", tip: "The colour of an image's first phase; later phases take the next free colour.", choices: () => labelled(MASK_COLOUR_LABELS),
    value: () => imageDefaults().maskColour, set: (next) => setImageDefault("maskColour", next as ImageSettings["maskColour"]), fallback: BUILT_IN_IMAGE.maskColour },
  { word: "bar", section: "Export › Calibration bar", label: "Place", tip: "The corner the bar is drawn into, or None; a picture with a bar is 8-bit RGB.", choices: () => labelled(SCALE_BAR_LABELS),
    value: () => exportDefaults().scaleBar, set: (next) => setExportDefault({ scaleBar: next as ExportOptions["scaleBar"] }), fallback: BUILT_IN_EXPORT.scaleBar },
  { word: "bar-style", section: "Export › Calibration bar", label: "Style", tip: SCALE_BAR_TIPS.style, choices: () => labelled(SCALE_BAR_STYLE_LABELS),
    value: () => exportDefaults().scaleBarStyle, set: (next) => setExportDefault({ scaleBarStyle: next as ExportOptions["scaleBarStyle"] }), fallback: BUILT_IN_EXPORT.scaleBarStyle },
  { word: "bar-length", section: "Export › Calibration bar", label: "Length", tip: SCALE_BAR_TIPS.length, choices: () => scaleBarLengthChoices(exportDefaults().scaleBarLength),
    value: () => { const length = exportDefaults().scaleBarLength; return length === null ? "auto" : scaleBarNumber(length); },
    set: (next) => setExportDefault({ scaleBarLength: next === "auto" ? null : Number(next) }), fallback: "auto",
    accepts: (next) => next === "auto" || isScaleBarLength(Number(next)), acceptsText: "auto or a positive number in the image's unit" },
  { word: "bar-blocks", section: "Export › Calibration bar", label: "Blocks", tip: SCALE_BAR_TIPS.blocks, choices: scaleBarBlockChoices,
    value: () => String(exportDefaults().scaleBarBlocks), set: (next) => setExportDefault({ scaleBarBlocks: Number(next) }), fallback: String(BUILT_IN_EXPORT.scaleBarBlocks) },
  { word: "bar-size", section: "Export › Calibration bar", label: "Size", tip: SCALE_BAR_TIPS.size, choices: () => labelled(SCALE_BAR_SIZE_LABELS),
    value: () => exportDefaults().scaleBarSize, set: (next) => setExportDefault({ scaleBarSize: next as ExportOptions["scaleBarSize"] }), fallback: BUILT_IN_EXPORT.scaleBarSize },
  { word: "plot-title", section: "Plots › Text", label: "Title size", tip: "The plot title's size in points.", choices: () => sizeChoices(plotText().titlePt),
    value: () => String(plotText().titlePt), set: (next) => setPlotTextDefault({ titlePt: Number(next) }), fallback: String(BUILT_IN_PLOT_TEXT.titlePt),
    accepts: (next) => Number(next) >= 5 && Number(next) <= 36, acceptsText: "a size in points from 5 to 36" },
  { word: "plot-text", section: "Plots › Text", label: "Text size", tip: "The size of every other text of a plot, in points: axis titles, tick labels, the legend, equations, data labels and callouts.", choices: () => sizeChoices(plotText().textPt),
    value: () => String(plotText().textPt), set: (next) => setPlotTextDefault({ textPt: Number(next) }), fallback: String(BUILT_IN_PLOT_TEXT.textPt),
    accepts: (next) => Number(next) >= 5 && Number(next) <= 36, acceptsText: "a size in points from 5 to 36" },
  { word: "plot-scale", section: "Plots › Size", label: "Scale with plot size", tip: "Grow and shrink a plot's text, lines, markers, error bar caps and spacing together with the plot, from its default 480 × 320. Off, they keep their sizes in points at every plot size, as a journal figure's, and only the plot area grows.",
    choices: () => [["on", "On"], ["off", "Off"]], value: () => (plotText().sizing === "scaled" ? "on" : "off"), set: (next) => setPlotTextDefault({ sizing: next === "on" ? "scaled" : "fixed" }), fallback: BUILT_IN_PLOT_TEXT.sizing === "scaled" ? "on" : "off" },
  { word: "overlays", section: "Export › Images", label: "Include overlays", tip: "Draw the phases, region outlines and labels into the picture; a picture with overlays is 8-bit RGB.", choices: () => [["on", "On"], ["off", "Off"]],
    value: () => (exportDefaults().includeOverlays ? "on" : "off"), set: (next) => setExportDefault({ includeOverlays: next === "on" }), fallback: BUILT_IN_EXPORT.includeOverlays ? "on" : "off" },
  { word: "shadows", section: "General › Work surface", label: "Object shadows", tip: "Images, worksheets and plots cast a soft shadow on the work surface, as a menu does. Never drawn into an export.", choices: () => [["on", "On"], ["off", "Off"]],
    value: () => (settings.objectShadows ? "on" : "off"), set: (next) => store.updateSettings({ objectShadows: next === "on" }), fallback: DEFAULTS.objectShadows ? "on" : "off" },
];

const defaultSetting = (word: string) => DEFAULT_SETTINGS.find((item) => item.word === word)!;

/** A Settings row for a default, keyed by its word, so that the shell's `settings <key> [value]` shows and sets it. */
function defaultRow(word: string): SettingRow {
  const item = defaultSetting(word);
  if (word === "overlays" || word === "shadows") return { kind: "check", key: word, label: item.label, tip: item.tip, value: () => item.value() === "on", set: (on) => item.set(on ? "on" : "off"), default: item.fallback === "on" };
  // A value beyond the list (JPEG quality 83, 450 dpi, 10.5 pt) is still taken in the Terminal, as `freeValue`.
  const accepts = item.accepts, freeValue = accepts && item.acceptsText ? { freeValue: { describe: item.acceptsText, accept: (next: string) => (accepts(next) ? next : null) } } : {};
  return { kind: "select", key: word, label: item.label, tip: item.tip, get choices() { return item.choices(); }, value: () => item.value(), set: (next) => item.set(next), default: item.fallback, ...freeValue };
}

const subscribe = (listener: () => void) => store.onSettingsChange(listener);

/** Images: the defaults new work starts from in every document (the app layer of the image settings), and the default calibration. */
function imagesPage(): SettingsPage {
  const decimals: [string, string][] = [["auto", "Automatic"], ...Array.from({ length: 10 }, (_, n) => [String(n), String(n)] as [string, string])];
  return { id: "images", title: "Images", icon: UI_ICONS.show, subscribe, sections: [
    { title: "New work", rows: ["grey", "threshold", "phase-colour"].map(defaultRow) },
    { title: "Results", rows: [
      { kind: "select", label: "Decimal places", tip: "Decimal places of the Results pane's numbers; Automatic shows four significant digits. The CSV keeps every digit.", choices: decimals,
        value: () => { const places = imageDefaults().decimals; return places === null ? "auto" : String(places); }, set: (next) => setImageDefault("decimals", next === "auto" ? null : Number(next)),
        command: (next) => `measure decimals ${next}`, default: BUILT_IN_IMAGE.decimals === null ? "auto" : String(BUILT_IN_IMAGE.decimals) },
    ] },
    // The rows follow the choice (Pixels: none; Known length: two lengths; Scale: one), which the shell's Settings redraws.
    { title: "Calibration", get rows() { return appCalibrationRows(); } },
  ] };
}

// MARK: the app's default calibration

/** A calibration number as a person writes it: six significant digits (1 / 168 mm is 0.00595238), the value itself unchanged. */
const shortNumber = (value: number): number => Number(value.toPrecision(6));

/** Set the app's default calibration, the one beneath every document's; a sentence for the Terminal or the status bar. */
function setAppCalibration(next: Calibration | null): string {
  const problem = next && calibrationProblem(next);
  if (problem) return problem;
  store.updateSettings({ appCalibration: next && { ...next, line: undefined } });
  return next ? `The app's default calibration is ${calibrationSummary(next)}.` : "Images with no calibration of their own or their document's are measured in pixels.";
}

/** Settings › Images › Calibration: the choice, then the fields that choice has, each keyed for `settings <key> <value>`. */
/** The keys of the calibration's number rows; Real length and Per pixel are never shown together, so they share one. */
const NUMBER_KEYS = { pixelLength: "calibration-pixels", realLength: "calibration-length", aspect: "calibration-aspect" } as const;

function appCalibrationRows(): SettingRow[] {
  const current = settings.appCalibration;
  const apply = (next: Calibration | null) => { const message = setAppCalibration(next); if (next && calibrationProblem(next)) report(message, "error"); };
  const started = (choice: string) => (choice === "pixels" ? null : startCalibration(choice as "known" | "scale", settings.appCalibration));
  const rows: SettingRow[] = [{ kind: "select", key: "calibration", label: "Calibration", tip: "The calibration of images that neither have their own nor follow a document's default.",
    choices: [["pixels", "Pixels"], ["known", "Known length"], ["scale", "Scale"]], value: () => settings.appCalibration?.mode ?? "pixels",
    set: (choice) => apply(started(choice)), default: "pixels" }];
  if (!current) return rows;
  const changed = (patch: Partial<Calibration>): Calibration => ({ ...(settings.appCalibration ?? current), ...patch });
  const number = (label: string, key: "pixelLength" | "realLength" | "aspect", tip: string): SettingRow => ({ kind: "number", key: NUMBER_KEYS[key], label, tip,
    // The field shows the short number; leaving it unchanged sets nothing, so the stored value keeps every digit.
    value: () => shortNumber((settings.appCalibration ?? current)[key]), set: (value) => apply(changed({ [key]: value })) });
  if (current.mode === "known") rows.push(number("Pixel length", "pixelLength", "A distance on the original image, in pixels along x, such as a scale bar."), number("Real length", "realLength", "The real length of that distance, in the unit below."));
  else rows.push(number("Per pixel", "realLength", "The real width of one pixel, in the unit below."));
  rows.push({ kind: "select", key: "calibration-unit", label: "Unit", choices: LENGTH_UNITS.map((unit) => [unit, unit] as const), value: () => (settings.appCalibration ?? current).unit,
    set: (unit) => apply(changed({ unit: unit as LengthUnit })) },
  number("Aspect ratio", "aspect", "The height of a pixel over its width; 1 for square pixels."));
  return rows;
}

/** Settings › Plots › New plots › Style: the look a new plot takes, the default or a saved template. */
function newPlotStyleRow(): SettingRow {
  const quoted = (name: string) => (/\s/.test(name) ? `"${name}"` : name);
  return { kind: "select", label: "Style", tip: "The look a new plot takes: the default, or a template saved from a plot (its size, axes, legend and series styles).",
    get choices() { return [["", "Default"] as const, ...plotTemplates().map((item) => [item.name, item.name] as const)]; },
    value: () => (settings.newPlotTemplate && plotTemplates().some((item) => item.name === settings.newPlotTemplate) ? settings.newPlotTemplate : ""),
    set: (next) => setNewPlotTemplate(next || null), command: (next) => `plot template default ${next ? quoted(next) : "none"}`, default: "" };
}

/** Plots: the look new plots take and the text of every plot, on the work surface and in an export. */
function plotsPage(): SettingsPage {
  return { id: "plots", title: "Plots", icon: PLOT_KIND_ICONS.line, subscribe, sections: [
    { title: "New plots", rows: [newPlotStyleRow()] },
    { title: "Size", rows: [defaultRow("plot-scale")] },
    { title: "Text", rows: [...["plot-title", "plot-text"].map(defaultRow),
      fontSettingRow({ key: "plot-font", label: "Font", tip: "The typeface of a plot's text and of an exported image's calibration bar: any installed font. Libertinus Serif ships with the app and is used when the font is missing.",
        value: () => plotText().font, set: (name) => setPlotTextDefault({ font: name }), default: BUILT_IN_PLOT_TEXT.font }),
      fontSettingRow({ key: "plot-math-font", label: "Maths font", role: "math", tip: "The typeface of equations and powers of ten: any installed maths font. Libertinus Math ships with the app and is used when the font is missing.",
        value: () => plotText().mathFont, set: (name) => setPlotTextDefault({ mathFont: name }), default: BUILT_IN_PLOT_TEXT.mathFont }),
    ] },
  ] };
}

/**
 * Export: how Export… writes images and plots (the app layer). What both share comes first (If the file exists, JPEG
 * quality); then each kind's Format and what follows from it, in the same order and words.
 */
function exportPage(): SettingsPage {
  return { id: "export", title: "Export", icon: UI_ICONS.export, subscribe, sections: [
    { title: "General", rows: [
      existsRow({ key: "exists", value: () => exportDefaults().overwrite, set: (next) => setExportDefault({ overwrite: next }), default: BUILT_IN_EXPORT.overwrite, note: "Originals stay." }),
      qualityRow({ key: "quality", value: () => exportDefaults().jpegQuality, set: (next) => setExportDefault({ jpegQuality: next }), default: BUILT_IN_EXPORT.jpegQuality, note: "It applies to images and plots." }),
    ] },
    { title: "Images", rows: [
      formatRow({ key: "format", formats: Object.keys(EXPORT_FORMAT_LABELS), value: () => exportDefaults().format, set: (next) => setExportDefault({ format: next as ExportOptions["format"] }),
        default: BUILT_IN_EXPORT.format, note: "PNG keeps the image's own values and depth; JPEG is 8-bit RGB and lossy." }),
      defaultRow("overlays"),
    ] },
    { title: "Calibration bar", rows: ["bar", "bar-style", "bar-length", "bar-blocks", "bar-size"].map(defaultRow) },
    { title: "Plots", rows: [
      formatRow({ key: "plot-format", formats: PLOT_EXPORT_FORMATS, value: () => plotExportDefaults().format, set: (next) => setPlotExportDefault({ format: next as PlotExportFormat }),
        default: PLOT_EXPORT_DEFAULT.format, note: "SVG stays a sharp drawing in Word, PowerPoint or Illustrator; PNG and JPEG are pictures at the Resolution below." }),
      resolutionRow({ key: "plot-dpi", value: () => plotExportDefaults().dpi, set: (next) => setPlotExportDefault({ dpi: next }), default: PLOT_EXPORT_DEFAULT.dpi, note: "An SVG has none." }),
    ] },
  ] };
}

/** Settings (Cmd+,): the shell's General page (with PlotForge's Work surface section), PlotForge's Images, Plots and Export pages, then the shell's Terminal and Updates. */
function settingsPages(): SettingsPage[] {
  return [
    generalPage({ settings, update: (change) => store.updateSettings(change), subscribe, blocks: BLOCKS }, [{ title: "Work surface", rows: [defaultRow("shadows")] }]),
    imagesPage(),
    plotsPage(),
    exportPage(),
    terminalPage({ fontSize: () => settings.terminalFontSize, setFontSize: (size) => store.updateSettings({ terminalFontSize: size }), preferences: terminalPreferences, subscribe }),
    healthPage(health),
    ...(REPOSITORY ? [updatesPage({ info, repository: REPOSITORY, ...updateOptions })] : []),
  ];
}

function openSettings(page?: string): void {
  showSettings({ pages: settingsPages(), page });
}

applyLayout();
refresh();
void offerRecovery();
// A newer release is offered on the welcome screen at launch (unless Check at launch is off); Update… opens Settings › Updates.
if (REPOSITORY) void showUpdateNotice(emptyState, info, REPOSITORY, { ...updateOptions, openSettings });

