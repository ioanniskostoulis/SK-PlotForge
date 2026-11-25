// Licensed under the GNU General Public License v2 or later. See LICENSE.
// One open document (one tab): its project, the bitmaps of its images, the content selection and the undo history.
// Undo keeps whole snapshots of the project, which are small (images are linked, not stored), so that every edit,
// including image edit steps added later, undoes the same way. While it has unsaved edits, its draft is kept for
// recovery after a crash (`draft()`).
import type { Draft } from "forge-shell/app/saving";
import type { Viewport } from "forge-shell/app/viewport";
import { DISPLAY_COLOURS, imagePixels, MASK_COLOURS, overUnder, phaseCoverage, type Phase, applyThreshold, stepDependencies, stepPhases, type OtherImages, basename, emptyProject, type ExportOptions, serializeProject, thresholdProblem, type DataTable, type Project, type ProjectData, type ProjectImage, type ProjectPlot, type PlotPart, type PlotKind, type PlotSources, type RangeRole, type CellRange, cellsKey, type Roi, type ThresholdResult } from "../engine";
import { classCanvas, maskCanvas, processed, redisplayed, type ReadyImage } from "./images";
import type { DataSelection, DataState } from "./data-view";

/** An object on the work surface: an image, a worksheet or a plot. */
export type SurfaceObject = ProjectImage | ProjectData | ProjectPlot;

/** Which kind of object it is: only worksheets are read from a file with read options, only plots have series. */
export const isSheet = (object: SurfaceObject): object is ProjectData => "read" in object;
export const isPlot = (object: SurfaceObject): object is ProjectPlot => "series" in object;
export const isImage = (object: SurfaceObject): object is ProjectImage => !isSheet(object) && !isPlot(object);

/** An image's threshold applied to the result of its steps: the mask and its overlay, or why it cannot apply. */
export interface MaskState { key: string; result: ThresholdResult | null; problem: string | null; overlay: OffscreenCanvas | null }

/** The number of edits that can be undone in one document. */
export const UNDO_LIMIT = 200;

export type ImageState = { kind: "loading" } | ReadyImage | { kind: "missing" } | { kind: "unreadable"; reason: string };

export class PlotDocument {
  project: Project;
  /** The document's file; null until it is first saved. */
  path: string | null;
  name: string;
  /** Decoded images by id. They outlive a removal, so that undo brings the image back without reading it again. */
  readonly images = new Map<string, ImageState>();
  /** Data files read, by id: their bytes and tables. Like images, they outlive a removal, for undo. */
  readonly tables = new Map<string, DataState>();
  /** The cells chosen in a worksheet, and the column the inspector shows, while the sheet is selected. Session only. */
  selectedColumn: DataSelection | null = null;
  /** The cells last chosen in a worksheet, kept while a plot is selected so that a series can take them. Session only. */
  lastCells: DataSelection | null = null;
  /** A series field waiting for cells: the next cells chosen in a worksheet become its X, Y or error. Session only. */
  /** A series field waiting for cells; with no series, the next cells chosen become new series of `kind`. */
  picking: { plotId: string; seriesId: string | null; which: "x" | "y" | "error" | "labels"; kind?: PlotKind } | null = null;
  /** The roles the user gave chosen ranges (X, Y, Y error, Skip), by their cells; kept for the session. */
  readonly cellRoles = new Map<string, RangeRole>();
  /** The role given to a range's cells, if any; what `selectionPlan` takes. */
  readonly roleOf = (cells: CellRange): RangeRole | undefined => this.cellRoles.get(cellsKey(cells));
  /** Each worksheet's first row and column shown, by data id. Session only. */
  readonly sheetScroll = new Map<string, { row: number; column: number }>();
  /** This document's per-export overrides of the app's export settings. Session only. */
  exportOverride: Partial<ExportOptions> = {};
  /** The phase shown in the inspector for each image, by image id. Session only. */
  readonly currentPhase = new Map<string, string>();
  /** Masks by image and phase id, made again when the steps, the threshold or the colour change. Session only; never stored. */
  private readonly masks = new Map<string, MaskState>();
  /** The selected region of interest and its image, shown in --pick and in the inspector. Session only. */
  selectedRoi: { imageId: string; roiId: string } | null = null;
  /** The step shown in the inspector for each image, by image id. Session only. */
  readonly currentStep = new Map<string, string>();
  /** Selected image ids: the content selection, shown in --pick. */
  selection = new Set<string>();
  /** The view's pan and zoom; null until the view first fits the content. Session only. */
  viewport: Viewport | null = null;
  /** The key of this document's recovery draft; it stays the same when the document is saved under a name. */
  readonly draftKey: string;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private saved: string;

  constructor(name: string, path: string | null = null, project: Project = emptyProject(), draftKey: string = newDraftKey()) {
    this.name = name;
    this.draftKey = draftKey;
    this.path = path;
    this.project = project;
    this.saved = path ? this.snapshot() : JSON.stringify(emptyProject());
  }

  get title(): string { return this.path ?? this.name; }
  get displayTitle(): string { return this.name; }
  /** Unsaved edits: the project differs from what was last saved (or, unsaved, from an empty project). */
  get dirty(): boolean { return this.snapshot() !== this.saved; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  snapshot(): string { return JSON.stringify(this.project); }

  /** Record the state before an edit; returns false when nothing changed. */
  record(before: string): boolean {
    if (before === this.snapshot()) return false;
    this.undoStack.push(before);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }

  /** Apply an edit as one undoable step. */
  edit(change: (project: Project) => void): boolean {
    const before = this.snapshot();
    change(this.project);
    return this.record(before);
  }

  /**
   * Change a document option (Snap to grid, the grid spacing): saved with the document and marking it dirty, but never
   * an undo step, and an undo or redo keeps it as it is (the shell's GUIDELINES-TERMINAL.md, What Undo covers).
   */
  setOption(change: (project: Project) => void): boolean {
    const before = this.snapshot();
    change(this.project);
    return before !== this.snapshot();
  }

  undo(): boolean { return this.step(this.undoStack, this.redoStack); }
  redo(): boolean { return this.step(this.redoStack, this.undoStack); }

  private step(from: string[], to: string[]): boolean {
    const state = from.pop();
    if (state === undefined) return false;
    to.push(this.snapshot());
    const grid = this.project.grid;
    this.project = JSON.parse(state) as Project;
    // The document's options are not content: the grid stays as it is now.
    this.project.grid = grid;
    // Whatever is gone after the step leaves the selection; images, worksheets and plots that are still there stay in it.
    const present = new Set(this.objects().map((object) => object.id));
    for (const id of [...this.selection]) if (!present.has(id)) this.selection.delete(id);
    if (this.selectedRoi && !this.roi(this.selectedRoi.imageId, this.selectedRoi.roiId)) this.selectedRoi = null;
    return true;
  }

  markSaved(path: string | null): void {
    // A saved tab takes the file's name with its extension (GUIDELINES section 6, Untitled names).
    if (path) { this.path = path; this.name = basename(path); }
    this.saved = this.snapshot();
  }

  /**
   * Take the file's version after it changed outside PlotForge: one undo step back to what was here, and saved, since
   * it is what the file holds. Whatever is gone leaves the selection.
   */
  replaceFromDisk(project: Project): void {
    const before = this.snapshot();
    this.project = project;
    this.record(before);
    const present = new Set(this.objects().map((object) => object.id));
    for (const id of [...this.selection]) if (!present.has(id)) this.selection.delete(id);
    if (this.selectedRoi && !this.roi(this.selectedRoi.imageId, this.selectedRoi.roiId)) this.selectedRoi = null;
    this.picking = null;
    this.saved = this.snapshot();
  }

  /** A document restored from a draft has edits that are not saved, whatever its text: it stays dirty until saved. */
  markRestored(): void { this.saved = ""; }

  /** The recovery draft of the unsaved edits, or null when there are none. */
  draft(): Omit<Draft, "savedAt"> | null {
    return this.dirty ? { key: this.draftKey, name: this.name, path: this.path, text: serializeProject(this.project, this.path) } : null;
  }

  image(id: string): ProjectImage | undefined { return this.project.images.find((image) => image.id === id); }
  roi(imageId: string, roiId: string): Roi | undefined { return this.image(imageId)?.rois.find((roi) => roi.id === roiId); }
  /** The selected region, when it still exists. */
  currentRoi(): { image: ProjectImage; roi: Roi } | null {
    const at = this.selectedRoi, image = at ? this.image(at.imageId) : undefined, roi = image?.rois.find((item) => item.id === at!.roiId);
    return image && roi ? { image, roi } : null;
  }

  /** The image's current phase: the one chosen in the inspector, else its first. */
  phase(image: ProjectImage): Phase | null {
    const id = this.currentPhase.get(image.id), phases = stepPhases(image.steps);
    return phases.find((phase) => phase.id === id) ?? phases[0] ?? null;
  }

  /** The mask of one phase of an image on the result of its steps, or null when the image cannot be shown. */
  mask(id: string, phaseId?: string): MaskState | null {
    const image = this.image(id), ready = this.ready(id);
    const phase = image ? (phaseId ? stepPhases(image.steps).find((item) => item.id === phaseId) : this.phase(image)) : null;
    if (!image || !phase || !ready) return null;
    const colour = MASK_COLOURS[phase.colour];
    const key = `${ready.stepsKey} ${JSON.stringify(phase.threshold)} ${colour}`;
    const cached = this.masks.get(`${id} ${phase.id}`);
    if (cached?.key === key) return cached;
    const problem = thresholdProblem(phase.threshold, ready.working);
    const result = problem ? null : applyThreshold(ready.working, phase.threshold);
    const state: MaskState = { key, result, problem, overlay: result ? maskCanvas(result.mask, ready.working.widthPx, ready.working.heightPx, colour) : null };
    this.masks.set(`${id} ${phase.id}`, state);
    return state;
  }

  /** Pixels in two or more phases and in none, over the phases whose masks could be made; null without phases. */
  coverage(id: string): { overlap: number; unassigned: number; pixels: number } | null {
    const image = this.image(id), ready = this.ready(id);
    const phases = image ? stepPhases(image.steps) : [];
    if (!phases.length || !ready) return null;
    const masks = phases.map((phase) => this.mask(id, phase.id)?.result?.mask).filter((mask): mask is Uint8Array => !!mask);
    const working = ready.working;
    return { ...phaseCoverage(masks, working.widthPx * working.heightPx, working.outside), pixels: imagePixels(working) };
  }

  /**
   * What is drawn over an image for its phases, by its mask display: each phase in its colour; the current phase
   * black on white (B&W); or, for a grey phase, the values under its range blue and over it green (Over/Under).
   */
  overlays(id: string): OffscreenCanvas[] {
    const image = this.image(id), ready = this.ready(id);
    const phases = image ? stepPhases(image.steps) : [];
    if (!image || !phases.length || !ready) return [];
    const W = ready.working.widthPx, H = ready.working.heightPx, mode = image.maskDisplay ?? "colours";
    if (mode === "colours") return phases.map((phase) => this.mask(id, phase.id)?.overlay).filter((canvas): canvas is OffscreenCanvas => !!canvas);
    const current = this.phase(image)!, state = this.mask(id, current.id);
    if (!state?.result) return [];
    const key = `${state.key} ${mode}`;
    const cached = this.displays.get(id);
    if (cached?.key === key) return [cached.canvas];
    const canvas = mode === "bw" || current.threshold.mode === "colour"
      ? classCanvas(state.result.mask, W, H, [DISPLAY_COLOURS.background, DISPLAY_COLOURS.object])
      : classCanvas(overUnder(ready.working, state.result.low, state.result.high), W, H, [null, DISPLAY_COLOURS.under, DISPLAY_COLOURS.over]);
    this.displays.set(id, { key, canvas });
    return [canvas];
  }
  private readonly displays = new Map<string, { key: string; canvas: OffscreenCanvas }>();

  /**
   * The image ready to show and measure, its steps applied. The result is made again only when the steps changed
   * (an edit, undo or redo), so that drawing and the pixel readout use the result of the steps as they now are.
   */
  ready(id: string, visiting = new Set<string>()): ReadyImage | null {
    const state = this.images.get(id), image = this.image(id);
    if (state?.kind !== "ready" || !image) return null;
    const displayKey = JSON.stringify(image.display ?? null);
    // Steps that read other images (calculator, paste) read the results of their steps: those come first, and the key
    // holds theirs, so that a change to another image's steps makes this one again. A loop is refused, not followed.
    const others = new Map<string, { name: string; raster: ReadyImage["working"] } | string>();
    visiting.add(id);
    for (const dep of stepDependencies(image.steps)) {
      const other = this.image(dep);
      if (!other) { others.set(dep, "The other image is no longer in the document."); continue; }
      if (visiting.has(dep)) { others.set(dep, `${other.name} reads this image, so this image cannot read it.`); continue; }
      const result = this.ready(dep, visiting);
      others.set(dep, result ? { name: other.name, raster: result.working } : `${other.name} is not loaded yet.`);
    }
    visiting.delete(id);
    const stepsKey = JSON.stringify(image.steps) + [...others].map(([dep, other]) => ` ${dep}:${typeof other === "string" ? other : (this.images.get(dep) as ReadyImage).stepsKey}`).join("");
    const resolve: OtherImages = (dep) => others.get(dep) ?? "The other image is not available.";
    if (state.stepsKey === stepsKey) {
      if (state.displayKey === displayKey) return state;
      const redrawn = redisplayed(state, image.display);
      this.images.set(id, redrawn);
      return redrawn;
    }
    const next = processed(state.decoded, image.steps, image.display, resolve, stepsKey);
    this.images.set(id, next);
    return next;
  }
  /** The other images an image's steps read, as `applySteps` and `measureRecord` take them. */
  others(id: string): OtherImages {
    return (dep) => {
      const other = this.image(dep), result = other && dep !== id ? this.ready(dep, new Set([id])) : null;
      return other && result ? { name: other.name, raster: result.working } : other ? `${other.name} cannot be read here.` : "The other image is no longer in the document.";
    };
  }

  /** The result just before step `index` of an image (the image a Crop step being edited receives), cached by its key. */
  inputOf(id: string, index: number): { raster: ReadyImage["working"]; canvas: OffscreenCanvas } | null {
    const image = this.image(id), ready = this.ready(id);
    if (!image || !ready) return null;
    const key = `${index} ${JSON.stringify(image.steps.slice(0, index))} ${JSON.stringify(image.display ?? null)}`;
    const cached = this.inputs.get(id);
    if (cached?.key === key) return cached;
    const made = processed(ready.decoded, image.steps.slice(0, index), image.display, this.others(id));
    const state = { key, raster: made.working, canvas: made.canvas };
    this.inputs.set(id, state);
    return state;
  }
  private readonly inputs = new Map<string, { key: string; raster: ReadyImage["working"]; canvas: OffscreenCanvas }>();

  /** The one selected worksheet, when it is the whole selection. */
  selectedData(): ProjectData | null {
    if (this.selection.size !== 1) return null;
    return this.project.data.find((data) => this.selection.has(data.id)) ?? null;
  }

  dataLink(id: string): ProjectData | undefined { return this.project.data.find((data) => data.id === id); }

  /** What the plots are drawn from: the worksheets' tables, the named ranges, and the sheets' names. */
  plotSources(): PlotSources {
    return { table: (id) => this.table(id), names: this.project.ranges, sheet: (id) => this.dataLink(id)?.name ?? "Removed sheet" };
  }

  /** The one selected plot, when it is the whole selection. */
  selectedPlot(): ProjectPlot | null {
    if (this.selection.size !== 1) return null;
    return this.project.plots.find((plot) => this.selection.has(plot.id)) ?? null;
  }

  /** The part of a plot clicked into (plot-parts.ts), while that plot alone is selected. Session only. */
  plotPart: { plotId: string; part: PlotPart } | null = null;

  /** The chosen part of the selected plot: the plot itself until a part is clicked; null without a selected plot. */
  selectedPart(): PlotPart | null {
    const plot = this.selectedPlot();
    if (!plot) return null;
    const chosen = this.plotPart?.plotId === plot.id ? this.plotPart.part : null;
    // A series removed (or undone away) leaves its part: the plot is chosen again.
    if (chosen && "series" in chosen && !plot.series.some((series) => series.id === chosen.series)) return { kind: "plot" };
    return chosen ?? { kind: "plot" };
  }

  plot(id: string): ProjectPlot | undefined { return this.project.plots.find((plot) => plot.id === id); }

  /** The table of a data file, when it is read. */
  table(id: string): DataTable | null {
    const state = this.tables.get(id);
    return state?.kind === "ready" ? state.loaded.table : null;
  }

  /** Every object on the work surface, in the order they are drawn: images, then worksheets, then plots. */
  objects(): SurfaceObject[] { return [...this.project.images, ...this.project.data, ...this.project.plots]; }
  selectedObjects(): SurfaceObject[] { return this.objects().filter((object) => this.selection.has(object.id)); }

  selectedImages(): ProjectImage[] { return this.project.images.filter((image) => this.selection.has(image.id)); }
}

let drafts = 0;
/** A key unique to this window's session: the time of day and a counter. */
function newDraftKey(): string { return `draft-${Date.now().toString(36)}-${++drafts}`; }
