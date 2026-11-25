// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The work surface: the dot grid with the document's images placed on it. Pan and zoom come from the shell's Viewport,
// selection from its content-selection rules (click, box, Shift adds, Cmd or Ctrl toggles, Esc clears) and is drawn
// in --pick. Images move by dragging or with the arrow keys, snapping to the grid unless Option is held. Each image is
// drawn as the result of its steps, and the pixel under the pointer is read from that result. With a region tool, a
// drag (rectangle, ellipse, line, freehand) or clicks (polygon) draw a region of interest on the image under the pointer.
// Cropped images are always shown cropped. With the Crop tool on and a Crop step current, the image is drawn as the
// step receives it, with the box and its handles: the shell's box editor (`attachBoxEdit`) drags an edge, a corner or
// the box, with the resize cursor over each handle, Shift and Option, and Esc to cancel (I9). Regions, the crop and the
// handles are drawn by the shell's canvas overlay, in the pick colour and palette of the picture's lightness. Shift
// keeps a drawn rectangle, ellipse or crop square and a line to 45° steps; Option draws a box from its centre. The eyedropper (Pick colour) reads the colour under a
// click for a colour threshold. Labels, and the calibration bar when View › Show calibration bar is on, are drawn over
// each image and never change its pixels (I14).
import { attachBoxEdit, boxFromDrag, constrainAngle, dragModifiers, editHit, handleHit, leverTurn, BOX_CURSORS, type DragModifiers } from "forge-shell/app/box-handles";
import { drawBoxHandles, drawCloseMark, drawRegion, drawRegionLabel, labelSize, OVERLAY_PICK, overlayColor, pictureSurface, type OverlaySurface, type RegionShape, type RegionState } from "forge-shell/app/canvas-overlay";
import { boxMark, createHoverTracker, HIT_PX, MARK_LINE, markState, pickFor } from "forge-shell/app/canvas-marks";
import { boxHits, boxRect, dragStarted, drawSelectionBox, fitBounds, nextSelection, pickColor, selectionMode } from "forge-shell/app/content-selection";
import { roleFont } from "forge-shell/app/fonts";
import { Viewport } from "forge-shell/app/viewport";
import { wheelIntent } from "forge-shell/app/wheel";
import {
  boxFrom, FREEHAND_STEP_PX, normalAngle, radians, turnedBounds, turnPoint, unturn, isBox, objectAt, pixelUnder, roiHit, roiProblem, snapValue, type Box, type PixelValue, type Point, type ProjectImage,
  type Roi, type RoiType, type CropBox, cropFromDrag, wholeCropBox, type CropStep, type Raster, type ScaleBarPlace,
  SHEET, sheetPart, sheetAxes, cellSelected, viewAxes, placeAt, PLOT_SIZE, ROWS_TOP, pressSelection, dragSelection, type ProjectData, type ProjectPlot, type SheetPart, type SheetPoint, type SheetSelection, type SheetView, type SheetAxis,
} from "../engine";
import { drawObjectShadow, isDark } from "./crisp";
import { clampScroll, drawSheet, sheetColours, type SheetHighlight } from "./data-view";
import { choosePoints, chosenPoints, nextPart, partAt, pointInfo, pointLines, pointsPart, samePart, type CellRange, type PlotKind, type PlotPart, type PlotScene, type ProjectPlot as PartsPlot } from "../engine";
import { drawLabels, drawScaleBar, type ScaleBarDrawing } from "./images";
import { isImage, isPlot, isSheet, type PlotDocument } from "./plot-document";
import { drawPlot, onPlotGrip } from "./plot-view";
import { drawSheetGrid, sheetGrid } from "forge-shell/app/sheet-grid";

// MARK: given values

/** Space kept around the content when it is fitted, in view px. */
const FIT_MARGIN_PX = 48;

/** At this zoom and above, pixels are drawn as squares so that single pixels can be inspected. */
const PIXEL_ZOOM = 2;
/** Zoom steps of the View menu and the zoom command. */
export const ZOOM_STEP = 1.25;
/**
 * Two presses this close in time and place are a double-click, which closes a polygon, as in Illustrator and Affinity.
 * Pointer events carry no click count (`detail` is 0 on `pointerdown`), so the surface times the presses itself.
 */
const DOUBLE_CLICK_MS = 500;

/** A plot tool: its kind's plot is placed where the work surface is clicked. */
export type PlotTool = `plot-${PlotKind}`;
export type Tool = "select" | "crop" | "pick" | RoiType | PlotTool;
export const isPlotTool = (tool: string): tool is PlotTool => tool.startsWith("plot-");
/** A Crop step being edited on the surface: its image, the step, and the image the step receives. */
export interface CropEdit { image: ProjectImage; step: CropStep; input: { raster: Raster; canvas: OffscreenCanvas } }
/** A region being drawn: on which image, the points placed so far, where the pointer is, and the press it began at. */
interface RoiDraft { imageId: string; type: RoiType | "crop"; points: Point[]; pointer: Point | null; anchor?: Point }
/** A region without its id and name, which the host gives it. */
export type DrawnRoi = Roi extends infer R ? (R extends Roi ? Omit<R, "id" | "name"> : never) : never;

/** Arrow keys move by one grid step, or by one pixel with snapping off; Shift moves ten times as far. */
const NUDGE_LARGE = 10;
/** Wheel events further apart than this start a new gesture, which may go to a sheet or to the view. */
const WHEEL_GESTURE_MS = 250;
/** The share of the way an eased sheet scroll moves each frame. */
const EASE = 0.35;

/** What a right-click on the work surface is on. */
/** A right-click's target: chosen cells, or a plot (on its legend, which has its own options first). */
export type SurfaceMenuTarget = { kind: "cells"; dataId: string; column: number | null } | { kind: "plot"; plotId: string; legend?: boolean }
  /** An image or a worksheet off its cells, selected by the right-click; the empty work surface. */
  | { kind: "object"; id: string } | { kind: "workspace" };

export interface WorkspaceHost {
  document(): PlotDocument | null;
  /** A press or drag that chose cells has ended: what was chosen, for a series field waiting for cells. */
  cellsChosen(id: string, cells: SheetSelection): void;
  /** The chosen cells were dragged by their border and dropped: onto a plot (add them), or onto the surface at a point (a new plot there). */
  dropCells(plotId: string | null, at: { x: number; y: number }): void;
  /** The selection changed (not the project). */
  selectionChanged(): void;
  /** A click chose a part of the selected plot (or the plot): its inspector section is opened and shown. */
  plotPartChosen(): void;
  /** The project changed; `before` is the snapshot before the edit, recorded for undo. */
  edited(before: string): void;
  /** Zoom or pan changed. */
  viewChanged(): void;
  /** The pointer moved over the work surface: the image and the pixel of its result under it, or nulls. */
  pointerMoved(image: ProjectImage | null, pixel: PixelValue | null): void;
  /** The plot point under the pointer, as its lines (pointLines), and where the pointer is in the window; null off a point. */
  pointHovered(lines: string[] | null, pointer?: { x: number; y: number }): void;
  /** A region was drawn on an image, in pixels of its result. */
  roiDrawn(imageId: string, roi: DrawnRoi): void;
  /** A crop was dragged on an image: its box, in pixels of its result, to add as a Crop step. */
  cropDrawn(imageId: string, box: CropBox): void;
  /** A click on a region selects it (and its image); `null` clears the region selection. */
  roiSelected(imageId: string, roiId: string | null): void;
  /** A click away from the crop box ends the Crop tool: back to Select, the image shown cropped. */
  leaveTool(): void;
  /** A click with a plot tool: a plot of its kind with its top-left corner at x and y on the surface. */
  placePlot(kind: PlotKind, x: number, y: number): void;
  /** A message for the status bar, such as why nothing was drawn. */
  hint(text: string): void;
  /** Whether threshold masks are drawn over their images (View › Show mask). */
  showMask(): boolean;
  /** The Crop step being edited, when the current step of the one selected image is a Crop step. */
  cropEdit(): CropEdit | null;
  /** While a crop handle is dragged: the box shown, not yet recorded; then the end, recorded as one edit. */
  previewCrop(edit: CropEdit, box: CropBox): void;
  cropEdited(edit: CropEdit, before: string, start: CropBox, box: CropBox): void;
  /** The calibration bar to draw over an image (View › Show calibration bar), or null. */
  scaleBar(image: ProjectImage): ScaleBarDrawing | null;
  /**
   * The cells chosen in a worksheet by a press or drag on its headings, row numbers or cells (null: none), with the
   * column the inspector shows; a sheet tab chosen; and the re-read mark.
   */
  selectCells(dataId: string, cells: SheetSelection | null, column: string | null): void;
  chooseSheet(dataId: string, sheet: string): void;
  reloadData(dataId: string): void;
  /** A right-click on chosen cells (the column under the pointer, null on a row number) or on a plot: its menu at a client point. */
  contextMenu(target: SurfaceMenuTarget, x: number, y: number): void;
  mac: boolean;
}

export class Workspace {
  readonly canvas = document.createElement("canvas");
  private readonly ctx = this.canvas.getContext("2d")!;
  private widthPx = 0;
  private heightPx = 0;
  /** The object under the pointer, outlined thin (canvas marks). */
  private readonly hover = createHoverTracker<string>();
  /** The region whose outline is under the pointer, drawn in the pick colour as a selected one is. */
  private readonly hoverRoi = createHoverTracker<{ imageId: string; roiId: string }>((item) => `${item.imageId} ${item.roiId}`);
  /** Each plot's scene as last drawn, for finding its parts under the pointer. */
  private readonly scenes = new Map<string, PlotScene>();
  private box: Box | null = null;
  private frame = 0;
  private panning = false;
  private spaceDown = false;
  private tool: Tool = "select";
  private draft: RoiDraft | null = null;
  /** The last press of a polygon being drawn, in view px, to tell a double-click. */
  private lastPress: { time: number; x: number; y: number } | null = null;

  constructor(private readonly root: HTMLElement, private readonly host: WorkspaceHost) {
    this.canvas.className = "work-canvas";
    this.canvas.setAttribute("aria-label", "Work surface");
    this.canvas.tabIndex = 0;
    root.append(this.canvas);
    new ResizeObserver(() => this.resize()).observe(root);
    this.canvas.addEventListener("pointerdown", (event) => this.pointerDown(event));
    this.canvas.addEventListener("contextmenu", (event) => this.contextMenu(event));
    this.canvas.addEventListener("pointermove", (event) => { if (!event.buttons) this.updateHover(event); this.readPixel(event); });
    this.canvas.addEventListener("pointerleave", () => { this.hover.clear(); this.hoverRoi.clear(); this.hoverPart.clear(); this.hoverTab.clear(); this.draw(); this.host.pointerMoved(null, null); this.host.pointHovered(null); });
    this.canvas.addEventListener("wheel", (event) => this.wheel(event), { passive: false });
    this.attachCropEdit();
  }

  // MARK: tools

  /** Choose the pointer's tool; a region being drawn is dropped. */
  setTool(tool: Tool): void {
    this.tool = tool;
    this.draft = null;
    this.canvas.classList.toggle("drawing", tool !== "select");
    this.draw();
  }

  get currentTool(): Tool { return this.tool; }

  /** An image's size in pixels of its result; one content pixel per result pixel unless the box was resized. */
  private resultSize(image: ProjectImage): [number, number] {
    const ready = this.doc?.ready(image.id);
    return ready ? [ready.working.widthPx, ready.working.heightPx] : [image.width, image.height];
  }

  /** A content point as pixels of an image's result, kept within the image. */
  private toImage(image: ProjectImage, wx: number, wy: number, clamp = true): Point {
    [wx, wy] = unturn(image, wx, wy);
    const [W, H] = this.resultSize(image);
    const x = ((wx - image.x) * W) / image.width, y = ((wy - image.y) * H) / image.height;
    return clamp ? [Math.min(W, Math.max(0, x)), Math.min(H, Math.max(0, y))] : [x, y];
  }

  /**
   * A point of an image's result in view px, as if the image were upright: what is drawn in an image's pixels is drawn
   * inside `turned`, which turns the canvas about the image's centre.
   */
  private toViewPoint(image: ProjectImage, [x, y]: Point): Point {
    const [W, H] = this.resultSize(image);
    return this.viewport().toView(image.x + (x * image.width) / W, image.y + (y * image.height) / H) as Point;
  }

  /**
   * Draw inside an image's turn: the canvas turned by the image's angle about its centre, in world units (`world`, under
   * the content transform) or in view px. An upright image draws as it is.
   */
  private turned(image: ProjectImage, space: "world" | "view", draw: () => void, centre?: Point): void {
    if (!image.angle) { draw(); return; }
    const c: Point = centre ?? [image.x + image.width / 2, image.y + image.height / 2];
    const [cx, cy] = space === "world" ? c : this.viewport().toView(c[0], c[1]);
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(radians(image.angle));
    this.ctx.translate(-cx, -cy);
    draw();
    this.ctx.restore();
  }

  /** The image that shows the rotation lever: the one image selected, with the Select tool, outside a crop edit. */
  private leverImage(): ProjectImage | null {
    const doc = this.doc;
    if (!doc || this.tool !== "select" || doc.selection.size !== 1 || doc.selectedRoi) return null;
    const object = doc.selectedObjects()[0];
    return object && isImage(object) ? object : null;
  }

  /** An image's upright box in view px, which the lever and its marks turn by the image's angle about the box's centre. */
  private viewBox(image: ProjectImage): Box {
    const view = this.viewport(), [x, y] = view.toView(image.x, image.y);
    return { x, y, width: image.width * view.scale, height: image.height * view.scale };
  }

  /** Whether a view point is on the lever of the image that shows one (the shell's hit test, in view px). */
  private onLever(vx: number, vy: number, pointerType: string): ProjectImage | null {
    const image = this.leverImage();
    if (!image) return null;
    return editHit(this.viewBox(image), { x: vx, y: vy }, "rotate", handleHit(pointerType), 1, true, radians(image.angle ?? 0)) === "rotate" ? image : null;
  }

  /**
   * Turn an image by its lever about its centre: free, or with Shift onto multiples of 15°; one undo step on release.
   * Only the placement turns: the pixels, regions and measurements stay those of the upright image.
   */
  private turnImage(event: PointerEvent, image: ProjectImage): void {
    const doc = this.doc!, view = this.viewport(), before = doc.snapshot();
    const [cx, cy] = view.toView(image.x + image.width / 2, image.y + image.height / 2), centre = { x: cx, y: cy };
    const [vx0, vy0] = this.eventPoint(event), from = { x: vx0, y: vy0 }, start = radians(image.angle ?? 0);
    let turned = false;
    this.track(event, (move) => {
      const [vx, vy] = this.eventPoint(move);
      turned = true;
      const angle = normalAngle(Math.round(((start + leverTurn(centre, from, { x: vx, y: vy }, start, move.shiftKey)) * 180) / Math.PI * 100) / 100);
      if (angle) image.angle = angle; else delete image.angle;
      this.draw();
      this.host.selectionChanged();
    }, () => { if (turned) this.host.edited(before); });
  }

  // MARK: view

  private get doc(): PlotDocument | null { return this.host.document(); }

  /** The current document's viewport, fitted on first use. */
  viewport(): Viewport {
    const doc = this.doc!;
    if (!doc.viewport) doc.viewport = this.fitted();
    return doc.viewport;
  }

  /** The work-surface point at the middle of the view, where a new plot is placed. */
  centre(): [number, number] {
    return this.viewport().toWorld(this.widthPx / 2, this.heightPx / 2) as [number, number];
  }

  /**
   * The view that frames the selected images, or every image when none is selected (`fitBounds`, the shell's Fit rule
   * for Cmd+0 and Space tapped twice). A document's first view frames every image.
   */
  private fitted(selection: ReadonlySet<string> = new Set()): Viewport {
    const objects = this.doc?.objects() ?? [];
    const bounds = fitBounds(objects, objects.filter((object) => selection.has(object.id)), (object) => turnedBounds(object));
    // An empty document opens at 100% with the world origin on the welcome grid's origin (`--empty-grid-origin`), so
    // the grid stays in place when the welcome surface gives way to the document.
    if (!bounds || !this.widthPx) { const origin = sheetGrid().originPx; return new Viewport(1, origin, origin); }
    return shift(Viewport.fit(bounds, Math.max(1, this.widthPx - 2 * FIT_MARGIN_PX), Math.max(1, this.heightPx - 2 * FIT_MARGIN_PX), 1), FIT_MARGIN_PX);
  }

  /**
   * Bring the selected images into view, as a design app does with what it has just placed: nothing moves when they
   * are already in view; otherwise the view pans just enough, keeping its zoom, or fits them when they are too big for it.
   */
  reveal(): void {
    const doc = this.doc;
    if (!doc || !this.widthPx || !doc.selection.size) return;
    const images = doc.selectedObjects().map((object) => turnedBounds(object));
    if (!images.length) return;
    const view = this.viewport(), m = FIT_MARGIN_PX;
    const [left, top] = view.toView(Math.min(...images.map((i) => i.x)), Math.min(...images.map((i) => i.y)));
    const [right, bottom] = view.toView(Math.max(...images.map((i) => i.x + i.width)), Math.max(...images.map((i) => i.y + i.height)));
    if (right - left > this.widthPx - 2 * m || bottom - top > this.heightPx - 2 * m) { this.fit(); return; }
    const dx = left < m ? m - left : right > this.widthPx - m ? this.widthPx - m - right : 0;
    const dy = top < m ? m - top : bottom > this.heightPx - m ? this.heightPx - m - bottom : 0;
    if (!dx && !dy) return;
    view.pan(dx, dy);
    this.changedView();
  }

  /** Fit the selected images, or every image, in the view, never magnifying beyond 100%. */
  fit(): void {
    if (!this.doc) return;
    this.doc.viewport = this.fitted(this.doc.selection);
    this.changedView();
  }

  /** Zoom about the centre of the view. */
  zoomBy(factor: number): void {
    if (!this.doc) return;
    this.viewport().zoom(factor, this.widthPx / 2, this.heightPx / 2);
    this.changedView();
  }

  /** 100%: one image pixel to one view pixel, keeping the centre of the view still. */
  actualSize(): void {
    if (!this.doc) return;
    const view = this.viewport();
    view.zoom(1 / view.scale, this.widthPx / 2, this.heightPx / 2);
    this.changedView();
  }

  zoomPercent(): number { return this.doc ? Math.round(this.viewport().scale * 100) : 100; }

  private changedView(): void { this.draw(); this.host.viewChanged(); }

  private resize(): void {
    const rect = this.root.getBoundingClientRect();
    // The centre of the view stays on the same part of the work, at the same zoom, as in Illustrator and Affinity.
    const view = this.doc?.viewport;
    if (view && this.widthPx && this.heightPx) view.pan((rect.width - this.widthPx) / 2, (rect.height - this.heightPx) / 2);
    this.widthPx = rect.width;
    this.heightPx = rect.height;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    // A new size clears the canvas at once, so it is painted now: waiting for the next frame shows one empty frame on
    // every step of a drag of the inspector's or the bottom panel's edge, which flickers.
    if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
    this.paint();
  }

  // MARK: drawing

  /** Redraw on the next frame. */
  draw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }

  private paint(): void {
    const { ctx } = this;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const surface = surfaceColours();
    ctx.fillStyle = surface.sheet;
    ctx.fillRect(0, 0, this.widthPx, this.heightPx);
    const doc = this.doc;
    if (!doc) return;
    const view = this.viewport();
    this.paintGrid(view, doc.project.grid.spacing);
    ctx.save();
    ctx.setTransform(ratio * view.scale, 0, 0, ratio * view.scale, ratio * view.ox, ratio * view.oy);
    ctx.imageSmoothingEnabled = view.scale < PIXEL_ZOOM;
    ctx.imageSmoothingQuality = "high";
    const edit = this.tool === "crop" ? this.host.cropEdit() : null;
    // Each object casts the shadow of a floating panel (Object shadows), drawn just before it.
    const dark = isDark(surface.sheet);
    for (const image of doc.project.images) {
      const state = doc.images.get(image.id);
      const ready = doc.ready(image.id);
      if (edit && edit.image.id === image.id) this.turned(image, "world", () => {
        const o = this.cropOrigin(edit);
        drawObjectShadow(ctx, { x: o.x, y: o.y, width: edit.input.raster.widthPx * o.k, height: edit.input.raster.heightPx * o.k }, 0, dark);
        ctx.drawImage(edit.input.canvas, o.x, o.y, edit.input.raster.widthPx * o.k, edit.input.raster.heightPx * o.k);
      }, this.cropCentre(edit));
      else if (ready) this.turned(image, "world", () => {
        drawObjectShadow(ctx, image, 0, dark);
        ctx.drawImage(ready.canvas, image.x, image.y, image.width, image.height);
        if (this.host.showMask()) for (const overlay of doc.overlays(image.id)) ctx.drawImage(overlay, image.x, image.y, image.width, image.height);
        // Labels and the calibration bar in pixels of the result, placed and scaled with the image.
        const W = ready.working.widthPx, H = ready.working.heightPx, bar = this.host.scaleBar(image);
        if (image.labels?.length || bar) {
          ctx.save();
          ctx.translate(image.x, image.y);
          ctx.scale(image.width / W, image.height / H);
          if (image.labels?.length) drawLabels(ctx, image.labels, W, H);
          if (bar) drawScaleBar(ctx, W, H, bar);
          ctx.restore();
        }
      });
      else this.turned(image, "world", () => this.paintPlaceholder(image, state?.kind === "loading" ? "Loading…" : state?.kind === "missing" ? `${image.file} is missing` : `${image.file} cannot be shown`, surface, view.scale));
    }
    // Worksheets over the images, each from its scroll position, its chosen cells shown while it is selected.
    const colours = sheetColours();
    const sources = plotSourceHighlights(doc);
    for (const link of doc.project.data) {
      const chosen = doc.selectedColumn?.id === link.id && doc.selection.has(link.id) ? doc.selectedColumn.cells : null;
      drawSheet(ctx, link, doc.tables.get(link.id), this.scrollOf(link), chosen, colours, view.scale, sources.get(link.id) ?? [], this.hoverTab.current?.id === link.id ? this.hoverTab.current.index : null);
    }
    // Plots over the worksheets, drawn from their tables as they are now.
    this.scenes.clear();
    // The chosen series or points of the selected plot are drawn again in the selection colour, the one for light
    // content (pickFor("light")), since a plot is white in either appearance; a hovered point or series is drawn so too.
    const chosenPlot = doc.selectedPlot(), chosenPart = doc.selectedPart(), chosenColour = pickFor("light");
    for (const plot of doc.project.plots) {
      const chosen = plot === chosenPlot && chosenPart && chosenPart.kind !== "plot" ? { part: chosenPart, colour: chosenColour } : null;
      drawObjectShadow(ctx, plot, 0, dark);
      const hovered = this.hoverPart.current?.plotId === plot.id ? { part: this.hoverPart.current.part, colour: chosenColour } : null;
      this.scenes.set(plot.id, drawPlot(ctx, plot, doc.plotSources(), doc.selection.has(plot.id), view.scale, colours.text3, chosen, hovered));
    }
    ctx.restore();
    // Outlines in view space, so that they keep their width at any zoom: thin hovered, thick selected (canvas marks).
    for (const image of doc.objects()) {
      const state = markState(doc.selection.has(image.id), image.id === this.hover.current);
      // An image under a crop edit shows the crop box instead: its outline would double the box's edge.
      if (!state || edit?.image.id === image.id) continue;
      const [x, y] = view.toView(image.x, image.y), mark = () => boxMark(ctx, { x, y, width: image.width * view.scale, height: image.height * view.scale }, state);
      if (isImage(image)) this.turned(image, "view", mark); else mark();
    }
    // The one selected image's rotation lever, turned with it (the shell's box handles: the lever only, never resized).
    const lever = this.leverImage();
    if (lever) drawBoxHandles(ctx, this.viewBox(lever), 1, { handles: "rotate", angle: radians(lever.angle ?? 0), surface: dark ? "dark" : "light" });
    // Where dragged cells would drop: the plot under them outlined, or on the empty surface the new plot's place.
    if (this.dropAt) {
      const target = this.dropAt.plot ? doc.plot(this.dropAt.plot) : null;
      const box = target ?? { x: this.dropAt.x, y: this.dropAt.y, width: PLOT_SIZE.width, height: PLOT_SIZE.height };
      const [x, y] = view.toView(box.x, box.y);
      // A plot that takes the cells is marked as selected; a new plot's place is dashed at the same width.
      if (target) boxMark(ctx, { x, y, width: box.width * view.scale, height: box.height * view.scale }, "selected");
      else {
        ctx.save();
        ctx.strokeStyle = pickColor();
        ctx.lineWidth = MARK_LINE.thick;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x, y, box.width * view.scale, box.height * view.scale);
        ctx.restore();
      }
    }
    // Each image's regions take the shell's overlay palette in order, for the lightness of its picture.
    for (const image of doc.project.images) image.rois.forEach((roi, index) => {
      if (edit?.image.id === image.id) return;
      const selected = doc.selectedRoi?.imageId === image.id && doc.selectedRoi.roiId === roi.id;
      const hovered = this.hoverRoi.current?.imageId === image.id && this.hoverRoi.current.roiId === roi.id;
      this.turned(image, "view", () => this.paintRoi(image, roi.type, isBox(roi) ? [[roi.x, roi.y], [roi.x + roi.width, roi.y + roi.height]] : roi.points, selected ? "selected" : hovered ? "hovered" : "normal", overlayColor(index, this.surfaceOf(image)), roi.name));
    });
    if (this.draft) {
      const image = doc.image(this.draft.imageId);
      const points = this.draft.pointer ? [...this.draft.points, this.draft.pointer] : this.draft.points;
      // A crop is drawn as the rectangle it will cut, in the pick colour; a region in the colour it will take.
      const shape = this.draft.type === "crop" ? "rectangle" : this.draft.type;
      const colour = image ? this.draft.type === "crop" ? OVERLAY_PICK[this.surfaceOf(image)] : overlayColor(image.rois.length, this.surfaceOf(image)) : "";
      if (image && points.length) this.turned(image, "view", () => this.paintRoi(image, shape, shape === "rectangle" || shape === "ellipse" ? [points[0], points.at(-1)!] : points, "drawing", colour));
    }
    if (edit) this.turned(edit.image, "view", () => this.paintCropBox(edit, this.cropBox ?? edit.step), this.cropCentre(edit));
    if (this.box) drawSelectionBox(ctx, this.box, 1, pickColor());
  }

  /** The point of any plot, or series line of the selected one, under the pointer, drawn in the pick colour. */
  private readonly hoverPart = createHoverTracker<{ plotId: string; part: PlotPart }>((item) => `${item.plotId} ${JSON.stringify(item.part)}`);


  /** The box being dragged, while a handle moves. */
  private cropBox: CropBox | null = null;
  /** Where a crop edit's input lies on the surface: the box sits where the cropped image is; fixed while a handle moves. */
  private cropAnchor: { x: number; y: number; k: number } | null = null;

  /** The point a turned image's crop edit turns about: the image's centre, fixed while a handle moves. */
  private cropCentre(edit: CropEdit): Point {
    return this.cropTurn ?? [edit.image.x + edit.image.width / 2, edit.image.y + edit.image.height / 2];
  }
  private cropTurn: Point | null = null;

  private cropOrigin(edit: CropEdit): { x: number; y: number; k: number } {
    if (this.cropAnchor) return this.cropAnchor;
    const [W] = this.resultSize(edit.image);
    const k = edit.image.width / Math.max(1, W);
    return { x: edit.image.x - edit.step.x * k, y: edit.image.y - edit.step.y * k, k };
  }

  /** Whether an image's shown result is dark or light content, read once per result (`pictureSurface`). */
  private readonly surfaces = new WeakMap<OffscreenCanvas, OverlaySurface>();
  private surfaceOf(image: ProjectImage, canvas: OffscreenCanvas | undefined = this.doc?.ready(image.id)?.canvas): OverlaySurface {
    if (!canvas) return "dark";
    let surface = this.surfaces.get(canvas);
    if (!surface) {
      const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height);
      surface = pixels ? pictureSurface(pixels) : "dark";
      this.surfaces.set(canvas, surface);
    }
    return surface;
  }

  /** The crop box over its input, in the pick colour, with the shell's eight handles. */
  private paintCropBox(edit: CropEdit, box: CropBox): void {
    const view = this.viewport(), o = this.cropOrigin(edit);
    const [x0, y0] = view.toView(o.x + box.x * o.k, o.y + box.y * o.k);
    const [x1, y1] = view.toView(o.x + (box.x + box.width) * o.k, o.y + (box.y + box.height) * o.k);
    const rect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, surface = this.surfaceOf(edit.image, edit.input.canvas);
    drawRegion(this.ctx, { kind: "rectangle", box: rect }, { color: OVERLAY_PICK[surface], state: "selected", surface });
    drawBoxHandles(this.ctx, rect, 1, { surface });
  }

  /**
   * The shell's box editor on the current Crop step, with the Crop tool on: a drag on an edge, a corner or the box
   * shows the box live, and its end is one edit; Esc puts it back. Content units are pixels of the step's input.
   */
  private attachCropEdit(): void {
    let drag: { edit: CropEdit; before: string; start: CropBox } | null = null;
    const current = () => (this.tool === "crop" && !this.spaceDown && this.doc ? this.host.cropEdit() : null);
    attachBoxEdit({
      surface: this.canvas,
      box: () => { const edit = drag?.edit ?? current(); return edit ? this.cropBox ?? edit.step : null; },
      bounds: () => { const edit = drag?.edit ?? current(); return edit ? { x: 0, y: 0, width: edit.input.raster.widthPx, height: edit.input.raster.heightPx } : null; },
      scale: () => { const edit = drag?.edit ?? current(); return edit ? this.viewport().scale * this.cropOrigin(edit).k : 1; },
      toContent: (clientX, clientY) => {
        const edit = drag?.edit ?? current(), rect = this.canvas.getBoundingClientRect();
        if (!edit) return { x: 0, y: 0 };
        const [vx, vy] = this.viewport().toWorld(clientX - rect.left, clientY - rect.top), o = this.cropOrigin(edit);
        // A turned image is edited in its own frame: the pointer turned back about the image's centre.
        const [cx, cy] = this.cropCentre(edit), [wx, wy] = turnPoint(vx, vy, cx, cy, -(edit.image.angle ?? 0));
        return { x: (wx - o.x) / o.k, y: (wy - o.y) / o.k };
      },
      onDrag: (rect) => {
        const edit = drag?.edit ?? current();
        if (!edit) return;
        if (!drag) {
          drag = { edit, before: this.doc!.snapshot(), start: { x: edit.step.x, y: edit.step.y, width: edit.step.width, height: edit.step.height } };
          this.cropAnchor = this.cropOrigin(edit);
          this.cropTurn = this.cropCentre(edit);
        }
        this.cropBox = wholeCropBox(rect, edit.input.raster.widthPx, edit.input.raster.heightPx);
        this.host.previewCrop(edit, this.cropBox);
        this.draw();
      },
      onEnd: () => {
        if (!drag) return;
        const { edit, before, start } = drag, box = this.cropBox ?? start;
        drag = null; this.cropAnchor = null; this.cropTurn = null; this.cropBox = null;
        this.host.cropEdited(edit, before, start, box);
        this.draw();
      },
      onCancel: () => {
        if (!drag) return;
        drag = null; this.cropAnchor = null; this.cropTurn = null; this.cropBox = null;
        this.draw();
      },
    });
  }

  /**
   * One region in view space, drawn by the shell's overlay: bare in its colour, in the pick colour when selected, dashed
   * and open while drawn. A box is given by two corners, an outline or a line by its points.
   */
  private paintRoi(image: ProjectImage, type: RoiType, points: Point[], state: RegionState, colour: string, name?: string): void {
    const view = points.map((point) => this.toViewPoint(image, point));
    const surface = this.surfaceOf(image);
    let shape: RegionShape;
    if (type === "rectangle" || type === "ellipse") {
      const [[x0, y0], [x1, y1]] = view;
      shape = { kind: type, box: { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) } };
    } else shape = { kind: type, points: view.map(([x, y]) => ({ x, y })) };
    drawRegion(this.ctx, shape, { color: colour, state, surface });
    // Its name in its colour above its top-left corner, a thirtieth of the picture's shorter side high, as a trace's legend.
    if (name) {
      const [W, H] = this.resultSize(image);
      const size = labelSize(Math.min(W, H)) * (image.width / W) * this.viewport().scale;
      const left = Math.min(...view.map(([x]) => x)), top = Math.min(...view.map(([, y]) => y));
      drawRegionLabel(this.ctx, name, left, top - size * 0.3, colour, size, roleFont("ui", size).replace(/^[\d.]+px\s*/, ""));
    }
    // A polygon being drawn marks its first point, where a click closes it.
    if (state === "drawing" && type === "polygon") drawCloseMark(this.ctx, { x: view[0][0], y: view[0][1] }, colour);
  }

  /**
   * The welcome surface's sheet and grid, drawn by the shell from its tokens (`drawSheetGrid`), with the document's
   * grid step. Dots and major lines sit on world multiples of the step and of eight steps, where images snap, so the
   * view is shifted by the token's origin, which the shell adds itself.
   */
  private paintGrid(view: Viewport, spacing: number): void {
    const grid = sheetGrid();
    drawSheetGrid(this.ctx, this.widthPx, this.heightPx, { ...grid, dotStepPx: spacing, lineStepPx: spacing * 8 }, {
      scale: view.scale, ox: view.ox - grid.originPx * view.scale, oy: view.oy - grid.originPx * view.scale,
    });
  }

  private paintPlaceholder(box: Box, text: string, surface: SurfaceColours, scale: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = surface.quiet;
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([4 / scale, 3 / scale]);
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    ctx.setLineDash([]);
    ctx.fillStyle = surface.quiet;
    ctx.font = roleFont("ui", 11 / scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, box.x + box.width / 2, box.y + box.height / 2, box.width * 0.9);
    ctx.restore();
  }

  // MARK: pointer

  private eventPoint(event: MouseEvent): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  private updateHover(event: PointerEvent): void {
    const doc = this.doc;
    if (!doc) return;
    // A polygon's next edge follows the pointer.
    if (this.draft?.type === "polygon") {
      const owner = doc.image(this.draft.imageId);
      const [wx, wy] = this.viewport().toWorld(...this.eventPoint(event));
      if (owner) { this.draft.pointer = this.polygonPoint(owner, wx, wy, event.shiftKey); this.draw(); }
    }
    // A plot tool places a plot anywhere: the crosshair stays, whatever is under the pointer.
    if (isPlotTool(this.tool)) { this.canvas.style.cursor = ""; return; }
    const [vx, vy] = this.eventPoint(event);
    if (this.onLever(vx, vy, event.pointerType)) { this.canvas.style.cursor = BOX_CURSORS.rotate; if (this.hover.set(null) || this.hoverRoi.set(null)) this.draw(); return; }
    const [x, y] = this.viewport().toWorld(vx, vy);
    const top = objectAt(doc.objects(), x, y);
    const hover = top?.id ?? null;
    // A region's outline a click would choose, with the Select tool: drawn in the pick colour, with the move cursor.
    const roi = top && isImage(top) && this.tool === "select" && !this.draft ? this.roiAt(top, x, y) : undefined;
    const roiChanged = this.hoverRoi.set(roi && top ? { imageId: top.id, roiId: roi.id } : null);
    // Over a worksheet's grip, the resize cursor; over its cells, the spreadsheet's cell cursor; over its headings, row
    // numbers, tabs and re-read mark, a pointer.
    const part = top && isSheet(top) ? sheetPart(top, this.sheetView(top), x, y) : null;
    const grip = part?.kind === "grip" || (!!top && isPlot(top) && doc.selection.has(top.id) && onPlotGrip(top, x, y, this.viewport().scale));
    const pointer = part?.kind === "reload" || part?.kind === "tab" || part?.kind === "heading" || part?.kind === "row-header";
    const edge = !!top && isSheet(top) && this.onChosenEdge(top, x, y);
    const source = top && isSheet(top) ? this.sourceEdgeAt(top, x, y) : null;
    // A sheet tab under the pointer is drawn in --text2, as the shell's tabs on hover.
    const tab = top && part?.kind === "tab" ? { id: top.id, index: part.index } : null;
    if (this.hoverTab.set(tab)) this.draw();
    this.canvas.style.cursor = grip ? "nwse-resize" : source ? (source.edge === "side" ? "move" : "ns-resize") : edge ? "grab" : part?.kind === "cell" ? "cell" : pointer ? "pointer" : "";
    this.canvas.classList.toggle("panning", this.spaceDown);
    // Over the selected plot, a series or point a click would choose takes the pointer cursor; nothing is drawn.
    const plotPart = top && isPlot(top) && doc.selectedPlot()?.id === top.id && !grip ? this.partUnder(top, x, y) : null;
    const choosable = plotPart && plotPart.kind !== "plot" && plotPart.kind !== "area" ? nextPart({ kind: "plot" }, plotPart) : null;
    if (choosable && choosable.kind !== "plot") this.canvas.style.cursor = "pointer";
    if (roi) this.canvas.style.cursor = "move";
    // A point of any plot under the pointer, or a series line of the selected plot, is drawn in the pick colour (the
    // colour mark): what a click there chooses.
    const under = top && isPlot(top) && !grip && this.tool === "select" ? this.partUnder(top, x, y) : null;
    // On the selected plot, every part a click chooses is lit: a series or fit line, an axis, the legend, the title.
    const lit = top && under?.kind === "point" ? { plotId: top.id, part: under } : top && choosable && choosable.kind !== "plot" ? { plotId: top.id, part: choosable } : null;
    const partChanged = this.hoverPart.set(lit);
    // A point is described in the status bar and the hover card, following the pointer.
    const plot = lit?.part.kind === "point" ? doc.plot(lit.plotId) : null;
    const info = plot && lit?.part.kind === "point" ? pointInfo(plot, lit.part.series, lit.part.index, doc.plotSources()) : null;
    this.host.pointHovered(pointLines(info), { x: event.clientX, y: event.clientY });
    if (this.hover.set(hover) || partChanged || roiChanged) this.draw();
  }

  /** Mark a part of a plot as the pointer over it would (its line in the inspector is under the pointer); null clears it. */
  markPart(plotId: string, part: PlotPart | null): void {
    if (this.hoverPart.set(part ? { plotId, part } : null)) this.draw();
  }

  /** The points of a series that were drawn, in order, as last drawn. */
  private drawnPoints(plotId: string, series: string): number[] {
    const target = this.scenes.get(plotId)?.targets.find((item) => "points" in item && item.part.series === series);
    return target && "points" in target ? target.points.map((point) => point.index) : [];
  }

  /** Cmd+A (Ctrl+A) with a series or point of the selected plot chosen: every point of that series drawn. False otherwise. */
  selectAllPoints(): boolean {
    const doc = this.doc, plot = doc?.selectedPlot(), part = doc?.selectedPart();
    if (!doc || !plot || !part || !("series" in part)) return false;
    doc.plotPart = { plotId: plot.id, part: pointsPart(part.series, this.drawnPoints(plot.id, part.series)) };
    this.host.selectionChanged();
    this.draw();
    return true;
  }

  /** The part of a plot under a content point, as last drawn; null off it. */
  private partUnder(plot: PartsPlot, x: number, y: number): PlotPart | null {
    const scene = this.scenes.get(plot.id);
    return scene ? partAt(scene.targets, plot, x - plot.x, y - plot.y, HIT_PX / this.viewport().scale) : null;
  }


  /** The pixel under the pointer, in the result of the steps of the topmost image there. */
  private readPixel(event: PointerEvent): void {
    const doc = this.doc;
    if (!doc) return;
    const [vx, vy] = this.eventPoint(event);
    const [x, y] = this.viewport().toWorld(vx, vy);
    const top = objectAt(doc.objects(), x, y);
    const image = top && isImage(top) ? top : null;
    const ready = image ? doc.ready(image.id) : null;
    const [ux, uy] = image ? unturn(image, x, y) : [x, y];
    this.host.pointerMoved(image, ready && image ? pixelUnder(ready.working, ux - image.x, uy - image.y, image.width, image.height) : null);
  }

  /**
   * A right-click, as in Excel: on cells, those chosen stay when it is inside them, else the cell (column or row) under
   * the pointer is chosen first; on a plot, it is selected. Then the host shows the menu. Elsewhere, no menu.
   */
  private contextMenu(event: MouseEvent): void {
    event.preventDefault();
    const doc = this.doc;
    if (!doc || this.tool !== "select") return;
    const [wx, wy] = this.viewport().toWorld(...this.eventPoint(event));
    const top = objectAt(doc.objects(), wx, wy);
    // The empty work surface has its menu too, so a right-click is never met with nothing (GUIDELINES-CORE).
    if (!top) { this.host.contextMenu({ kind: "workspace" }, event.clientX, event.clientY); return; }
    // An image (or a worksheet off its cells) is selected by the right-click, then its menu opens.
    const objectMenu = () => {
      if (!doc.selection.has(top.id)) { doc.selection = new Set([top.id]); this.host.selectionChanged(); this.draw(); }
      this.host.contextMenu({ kind: "object", id: top.id }, event.clientX, event.clientY);
    };
    if (isImage(top)) { objectMenu(); return; }
    if (top && isSheet(top)) {
      const part = sheetPart(top, this.sheetView(top), wx, wy);
      const point = part ? Workspace.pointOf(part) : null;
      const state = doc.tables.get(top.id);
      if (!point || state?.kind !== "ready") { objectMenu(); return; }
      const columns = state.loaded.table.columns;
      const own = doc.selectedColumn?.id === top.id ? doc.selectedColumn.cells : null;
      const inside = point.column !== null ? cellSelected(own, point.column, point.row)
        : (own?.ranges ?? []).some((range) => range.rows !== null && point.row !== null && range.rows.first <= point.row && point.row <= range.rows.last);
      if (!inside) {
        if (!(doc.selection.size === 1 && doc.selection.has(top.id))) { doc.selection = new Set([top.id]); this.host.selectionChanged(); }
        this.host.selectCells(top.id, pressSelection(own, point, "replace", columns.length), point.column === null ? null : columns[point.column]?.key ?? null);
      }
      this.host.contextMenu({ kind: "cells", dataId: top.id, column: point.column }, event.clientX, event.clientY);
      return;
    }
    if (top && isPlot(top)) {
      // A right-click chooses what is under it at once: a point on its marker, a series on its line, else the plot.
      const under = this.partUnder(top, wx, wy), current = doc.selectedPlot()?.id === top.id ? doc.selectedPart() : null;
      // On a point of several chosen, the right-click is for all of them.
      const keep = under?.kind === "point" && current?.kind === "points" && current.series === under.series && current.indices.includes(under.index);
      const part: PlotPart = keep ? current! : under ? nextPart({ kind: "plot" }, under) : { kind: "plot" };
      const changed = !(doc.selection.size === 1 && doc.selection.has(top.id)) || !samePart(doc.selectedPart(), part);
      doc.selection = new Set([top.id]);
      doc.plotPart = { plotId: top.id, part };
      if (changed) { this.host.selectionChanged(); this.draw(); this.host.plotPartChosen(); }
      this.host.contextMenu({ kind: "plot", plotId: top.id, ...(under?.kind === "legend" ? { legend: true } : {}) }, event.clientX, event.clientY);
    }
  }

  private pointerDown(event: PointerEvent): void {
    const doc = this.doc;
    // A press (a right-click too) puts away a point's values; they come back when the pointer rests again.
    this.host.pointHovered(null);
    if (!doc || (event.button !== 0 && event.button !== 1)) return;
    this.canvas.focus();
    this.canvas.setPointerCapture(event.pointerId);
    const [vx0, vy0] = this.eventPoint(event);
    const view = this.viewport();
    // Middle button or Space: pan.
    if (event.button === 1 || this.spaceDown) {
      this.panning = true;
      let [lastX, lastY] = [vx0, vy0];
      this.track(event, (move) => { const [vx, vy] = this.eventPoint(move); view.pan(vx - lastX, vy - lastY); [lastX, lastY] = [vx, vy]; this.changedView(); }, () => { this.panning = false; });
      return;
    }
    const [wx0, wy0] = view.toWorld(vx0, vy0);
    // The selected image's rotation lever turns it, before anything under the lever is taken.
    const turning = this.onLever(vx0, vy0, event.pointerType);
    if (turning) { this.turnImage(event, turning); return; }
    const top = objectAt(doc.objects(), wx0, wy0);
    const sheet = top && isSheet(top) ? top : null;
    const hit = top && isImage(top) ? top : null;
    const plot = top && isPlot(top) ? top : null;
    // The shell's eyedropper takes the click before the canvas does; nothing else happens in its mode.
    if (this.tool === "pick") return;
    if (isPlotTool(this.tool)) { this.host.placePlot(this.tool.slice(5) as PlotKind, wx0, wy0); return; }
    // With the Crop tool, a press on the current Crop step's box or handles is the box editor's (`attachCropEdit`).
    if (this.tool !== "select") { this.drawStart(event, hit, wx0, wy0); return; }
    const mode = selectionMode(event, this.host.mac);
    // A selected plot's source outline, as Excel's: its top or bottom edge sets its rows, a side moves it up, down or across.
    const source = sheet && mode === "replace" ? this.sourceEdgeAt(sheet, wx0, wy0) : null;
    if (sheet && source) { this.dragSource(event, sheet, source); return; }
    // The chosen cells' border, as Origin and Excel: a drag carries the cells to a plot, or to the surface for a new one.
    if (sheet && mode === "replace" && this.onChosenEdge(sheet, wx0, wy0)) { this.dragCells(event); return; }
    if (sheet) {
      const part = sheetPart(sheet, this.sheetView(sheet), wx0, wy0);
      // Headings, row numbers and cells choose cells in every mode (Shift extends, Cmd adds); its other parts take a plain press.
      if (part && this.cellPress(event, sheet, part, mode)) return;
      if (part && mode === "replace" && this.sheetPress(event, sheet, part, wx0, wy0)) return;
    }
    // A selected plot's corner grip resizes it.
    if (plot && mode === "replace" && doc.selection.has(plot.id) && onPlotGrip(plot, wx0, wy0, view.scale)) { this.resizeBox(event, plot, PLOT_SIZE.minWidth, PLOT_SIZE.minHeight, wx0, wy0); return; }
    // A plain click on a point chooses it at once; on the selected plot's line, its series (plot-parts.ts).
    const plotWasSelected = !!plot && doc.selectedPlot()?.id === plot.id;
    // Cmd (Ctrl) or Shift on a point of the chosen series adds or takes out points, as in a file list.
    if (plot && plotWasSelected && mode !== "replace") {
      const under = this.partUnder(plot, wx0, wy0), current = doc.selectedPart();
      if (under?.kind === "point" && current && "series" in current && current.series === under.series) {
        doc.plotPart = { plotId: plot.id, part: choosePoints(current, under, mode, this.drawnPoints(plot.id, under.series)) };
        this.host.selectionChanged();
        this.draw();
        this.host.plotPartChosen();
        return;
      }
    }
    if (plot && mode === "replace") {
      const under = this.partUnder(plot, wx0, wy0);
      doc.plotPart = { plotId: plot.id, part: under ? nextPart(doc.selectedPart(), under) : { kind: "plot" } };
    }
    const object = hit ?? sheet ?? plot;
    // A region of the image under the pointer, once the image (or one of its regions) is selected: the last drawn
    // first. A drag moves it. On an image not yet selected, the press selects the image, as a group before its parts.
    const roiUnder = hit ? this.roiAt(hit, wx0, wy0) : undefined;
    if (hit && roiUnder && mode === "replace") { this.dragRoi(event, hit, roiUnder, wx0, wy0); return; }
    if (object && doc.selectedRoi) this.host.roiSelected(doc.selectedRoi.imageId, null);
    if (object) {
      // A plain click on a selected object keeps the selection, so that the whole selection can be dragged.
      if (!(mode === "replace" && doc.selection.has(object.id))) doc.selection = nextSelection(doc.selection, [object.id], mode);
      this.host.selectionChanged();
      this.draw();
      if (plot && mode === "replace") this.host.plotPartChosen();
      if (!doc.selection.has(object.id)) return;
      const moving = doc.selectedObjects().map((image) => ({ image, x: image.x, y: image.y }));
      const anchor = { x: object.x, y: object.y };
      const before = doc.snapshot();
      let dragging = false;
      this.track(event, (move) => {
        const [vx, vy] = this.eventPoint(move);
        if (!dragging && !dragStarted(vx0, vy0, vx, vy)) return;
        dragging = true;
        const [wx, wy] = view.toWorld(vx, vy);
        let dx = wx - wx0, dy = wy - wy0;
        // The clicked image lands on the grid; the others keep their places relative to it.
        const spacing = doc.project.grid.spacing;
        if (doc.project.grid.snap && !move.altKey) { dx = snapValue(anchor.x + dx, spacing) - anchor.x; dy = snapValue(anchor.y + dy, spacing) - anchor.y; }
        else { dx = Math.round(dx); dy = Math.round(dy); }
        for (const item of moving) { item.image.x = item.x + dx; item.image.y = item.y + dy; }
        this.draw();
        this.host.selectionChanged();
      }, () => { if (dragging) this.host.edited(before); });
      return;
    }
    // Empty space: a selection box; a click without a drag clears the selection (unless a modifier is held).
    const base = new Set(doc.selection);
    let boxing = false;
    this.track(event, (move) => {
      const [vx, vy] = this.eventPoint(move);
      if (!boxing && !dragStarted(vx0, vy0, vx, vy)) return;
      boxing = true;
      this.box = boxRect(vx0, vy0, vx, vy);
      const [x0, y0] = view.toWorld(this.box.x, this.box.y);
      const hits = boxHits(doc.objects(), (image) => turnedBounds(image), { x: x0, y: y0, width: this.box.width / view.scale, height: this.box.height / view.scale });
      doc.selection = nextSelection(base, hits.map((image) => image.id), mode);
      this.host.selectionChanged();
      this.draw();
    }, () => {
      this.box = null;
      if (!boxing && mode === "replace") { this.clickAway(); return; }
      this.draw();
    });
  }

  /**
   * The region of an image whose outline is near a world point, once the image (or one of its regions) is selected:
   * the last drawn first. The inside of a region does not take it.
   */
  private roiAt(image: ProjectImage, wx: number, wy: number): Roi | undefined {
    const doc = this.doc!;
    if (!doc.selection.has(image.id) && doc.selectedRoi?.imageId !== image.id) return undefined;
    const [px, py] = this.toImage(image, wx, wy, false);
    const tolerance = (HIT_PX / this.viewport().scale) * (this.resultSize(image)[0] / image.width);
    return [...image.rois].reverse().find((roi) => roiHit(roi, px, py, tolerance));
  }

  /** Select a region and move it by dragging, in whole pixels of its image; one undo step on release. */
  private dragRoi(event: PointerEvent, image: ProjectImage, roi: Roi, wx0: number, wy0: number): void {
    const doc = this.doc!;
    this.host.roiSelected(image.id, roi.id);
    const [vx0, vy0] = this.eventPoint(event);
    const before = doc.snapshot();
    const start = JSON.parse(JSON.stringify(roi)) as Roi;
    const [px0, py0] = this.toImage(image, wx0, wy0, false);
    let dragging = false;
    this.track(event, (move) => {
      const [vx, vy] = this.eventPoint(move);
      if (!dragging && !dragStarted(vx0, vy0, vx, vy)) return;
      dragging = true;
      const [wx, wy] = this.viewport().toWorld(vx, vy);
      const [px, py] = this.toImage(image, wx, wy, false);
      const dx = Math.round(px - px0), dy = Math.round(py - py0);
      const target = image.rois.find((item) => item.id === roi.id)!;
      if (isBox(target) && isBox(start)) { target.x = start.x + dx; target.y = start.y + dy; }
      else if (!isBox(target) && !isBox(start)) target.points = start.points.map(([x, y]) => [x + dx, y + dy]);
      this.draw();
    }, () => { if (dragging) this.host.edited(before); });
  }

  // MARK: drawing regions

  private drawStart(event: PointerEvent, image: ProjectImage | null, wx: number, wy: number): void {
    const draft = this.draft;
    // A polygon collects clicks on its own image until it is closed.
    if (draft?.type === "polygon") {
      const owner = this.doc!.image(draft.imageId);
      if (!owner) { this.draft = null; return; }
      const point = this.polygonPoint(owner, wx, wy, event.shiftKey);
      const first = this.toViewPoint(owner, draft.points[0]), here = this.toViewPoint(owner, point);
      const double = this.pressIsDouble(event);
      // A double-click ends the polygon at the point its first click placed; a click on the first point closes it.
      if (double || Math.hypot(here[0] - first[0], here[1] - first[1]) <= HIT_PX) {
        if (draft.points.length >= 3) { draft.pointer = null; this.finishDraft(); return; }
        if (double) { this.host.hint("A polygon needs at least three points."); return; }
      }
      draft.points.push(point);
      this.draw();
      return;
    }
    this.pressIsDouble(event);
    // A press on empty space draws nothing: it clears the selection, and ends the Crop tool.
    if (!image) { this.clickAway(); return; }
    if (!this.doc!.ready(image.id)) { this.host.hint(`${image.name} is not shown, so regions cannot be drawn on it.`); return; }
    const start = this.toImage(image, wx, wy);
    this.draft = { imageId: image.id, type: this.tool as RoiType | "crop", points: [start], pointer: null, anchor: start };
    if (this.tool === "polygon") { this.draw(); return; }
    const [vx0, vy0] = this.eventPoint(event);
    let dragging = false;
    this.track(event, (move) => {
      const [vx, vy] = this.eventPoint(move);
      if (!dragging && !dragStarted(vx0, vy0, vx, vy)) return;
      dragging = true;
      const [x, y] = this.viewport().toWorld(vx, vy);
      const point = this.toImage(image, x, y);
      if (this.tool === "freehand") {
        const last = this.draft!.points.at(-1)!;
        if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= FREEHAND_STEP_PX) this.draft!.points.push(point);
      } else this.placePointer(image, point, dragModifiers(move));
      this.draw();
    }, () => {
      if (dragging) { this.finishDraft(); return; }
      this.draft = null;
      // A click (no drag) on an image beside the crop box being edited ends the Crop tool, as Esc does.
      if (this.tool === "crop" && this.host.cropEdit()) this.host.leaveTool();
      this.draw();
    });
  }

  /** True when this press follows the last one closely enough to be a double-click; it then starts a new pair. */
  private pressIsDouble(event: PointerEvent): boolean {
    const [x, y] = this.eventPoint(event), time = event.timeStamp, last = this.lastPress;
    const double = !!last && time - last.time <= DOUBLE_CLICK_MS && Math.hypot(x - last.x, y - last.y) <= HIT_PX;
    this.lastPress = double ? null : { time, x, y };
    return double;
  }

  /** The polygon's next point under the pointer; Shift keeps the new edge to 45° steps from the last point. */
  private polygonPoint(owner: ProjectImage, wx: number, wy: number, constrain: boolean): Point {
    const point = this.toImage(owner, wx, wy), last = this.draft?.points.at(-1);
    if (!constrain || !last) return point;
    const end = constrainAngle({ x: last[0], y: last[1] }, { x: point[0], y: point[1] });
    return [end.x, end.y];
  }

  /**
   * The keys of a polygon being drawn, as in Illustrator and Affinity: Return closes it, Backspace or Delete takes back
   * the last point (Esc, which drops it, is taken before the shell's tool keys: `cancelDraft`). True when the key was used.
   */
  drawingKeyDown(event: KeyboardEvent): boolean {
    const draft = this.draft;
    if (draft?.type !== "polygon" || event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key === "Enter") { draft.pointer = null; this.finishDraft(); return true; }
    if (event.key === "Backspace" || event.key === "Delete") {
      draft.points.pop();
      if (!draft.points.length) this.draft = null;
      this.draw();
      return true;
    }
    return false;
  }

  /** Drop the region being drawn; true when there was one. */
  cancelDraft(): boolean {
    if (!this.draft) return false;
    this.draft = null;
    this.lastPress = null;
    this.draw();
    return true;
  }

  /** A click on empty space: no image or region stays selected, and the Crop tool gives way to Select. */
  private clickAway(): void {
    const doc = this.doc!;
    if (this.tool === "crop") this.host.leaveTool();
    if (doc.selectedRoi) this.host.roiSelected(doc.selectedRoi.imageId, null);
    if (doc.selection.size) { doc.selection = new Set(); this.host.selectionChanged(); }
    this.draw();
  }

  /**
   * The far end of a drag as the shell's drawing modifiers make it: Shift keeps a rectangle, ellipse or crop square and
   * a line to 45° steps; Option draws a box from where the press began, as its centre.
   */
  private placePointer(image: ProjectImage, point: Point, modifiers: DragModifiers): void {
    const draft = this.draft!, anchor = draft.anchor ?? draft.points[0];
    if (draft.type === "line") {
      const end = modifiers.constrain ? constrainAngle({ x: anchor[0], y: anchor[1] }, { x: point[0], y: point[1] }) : { x: point[0], y: point[1] };
      draft.pointer = [end.x, end.y];
      return;
    }
    const [W, H] = this.resultSize(image);
    const box = boxFromDrag(anchor[0], anchor[1], point[0], point[1], { x: 0, y: 0, width: W, height: H }, modifiers);
    draft.points[0] = [box.x, box.y];
    draft.pointer = [box.x + box.width, box.y + box.height];
  }

  /** Close the region being drawn and hand it to the host; one that cannot be kept is dropped with its reason. */
  finishDraft(): boolean {
    const draft = this.draft;
    this.draft = null;
    this.draw();
    if (!draft) return false;
    const points = draft.pointer && draft.type !== "polygon" && draft.type !== "freehand" ? [draft.points[0], draft.pointer] : draft.points;
    if (draft.type === "crop") {
      const [width, height] = this.resultSize(this.doc!.image(draft.imageId)!);
      const box = cropFromDrag(points[0], points.at(-1)!, width, height);
      if (!box) { this.host.hint("Drag a crop of at least one pixel."); return false; }
      this.host.cropDrawn(draft.imageId, box);
      return true;
    }
    const roi: DrawnRoi = draft.type === "rectangle" || draft.type === "ellipse"
      ? { type: draft.type, ...boxFrom(points[0], points.at(-1)!) }
      : { type: draft.type, points: points.map(([x, y]) => [round2(x), round2(y)] as Point) };
    if (isBoxDraft(roi)) Object.assign(roi, { x: round2(roi.x), y: round2(roi.y), width: round2(roi.width), height: round2(roi.height) });
    const problem = roiProblem({ ...roi, id: "", name: "" } as Roi);
    if (problem) { this.host.hint(problem); return false; }
    this.host.roiDrawn(draft.imageId, roi);
    return true;
  }

  /** Follow a pointer until it is released. */
  private track(start: PointerEvent, move: (event: PointerEvent) => void, end: () => void): void {
    const id = start.pointerId;
    const onMove = (event: PointerEvent) => { if (event.pointerId === id) move(event); };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== id) return;
      this.canvas.removeEventListener("pointermove", onMove);
      this.canvas.removeEventListener("pointerup", onUp);
      this.canvas.removeEventListener("pointercancel", onUp);
      end();
    };
    this.canvas.addEventListener("pointermove", onMove);
    this.canvas.addEventListener("pointerup", onUp);
    this.canvas.addEventListener("pointercancel", onUp);
  }

  private wheel(event: WheelEvent): void {
    if (!this.doc) return;
    event.preventDefault();
    const intent = wheelIntent(event, false);
    const view = this.viewport();
    // A selected worksheet under the pointer takes the wheel (or a trackpad's two fingers): its rows, and sideways or
    // with Shift its columns, as in a workbook window. Anywhere else, over a sheet that is not selected, or when a
    // gesture starts with the sheet already at its end that way, the view pans (or a mouse wheel zooms) as usual. A
    // gesture stays with what it started on, so that it never jumps between the sheet and the view. A pinch or Cmd or
    // Ctrl and the wheel always zoom the view.
    if (!event.ctrlKey && !event.metaKey) {
      const line = event.deltaMode === 1 ? SHEET.row * view.scale : event.deltaMode === 2 ? this.heightPx : 1;
      const sideways = event.shiftKey && !event.deltaX;
      const dx = (sideways ? event.deltaY : event.deltaX) * line, dy = (sideways ? 0 : event.deltaY) * line;
      const now = performance.now();
      if (now - this.wheelGesture.at > WHEEL_GESTURE_MS) {
        const [wx, wy] = view.toWorld(...this.eventPoint(event));
        const top = objectAt(this.doc.objects(), wx, wy);
        this.wheelGesture.sheet = top && isSheet(top) && this.doc.selection.has(top.id) && this.canScrollSheet(top, dx, dy) ? top.id : null;
      }
      this.wheelGesture.at = now;
      const sheet = this.wheelGesture.sheet ? this.doc.dataLink(this.wheelGesture.sheet) : undefined;
      if (sheet) { this.scrollSheet(sheet, dx, dy, intent.kind !== "pan"); return; }
    }
    if (intent.kind === "zoom") { const [vx, vy] = this.eventPoint(event); view.zoom(intent.factor, vx, vy); }
    else view.pan(-intent.dx, -intent.dy);
    this.changedView();
  }

  // MARK: keys

  /** The work surface's own keys while no text field has the focus; true when the key was used. */
  keyDown(event: KeyboardEvent): boolean {
    const doc = this.doc;
    if (!doc) return false;
    if (this.drawingKeyDown(event)) return true;
    if (event.key === " " && !event.metaKey && !event.ctrlKey) { this.spaceDown = true; this.canvas.classList.add("panning"); return true; }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const arrow = arrows[event.key];
    if (arrow && doc.selection.size && !event.metaKey && !event.ctrlKey) {
      const grid = doc.project.grid;
      const step = (grid.snap && !event.altKey ? grid.spacing : 1) * (event.shiftKey ? NUDGE_LARGE : 1);
      const before = doc.snapshot();
      for (const image of doc.selectedObjects()) { image.x += arrow[0] * step; image.y += arrow[1] * step; }
      this.host.edited(before);
      return true;
    }
    return false;
  }

  // MARK: worksheets

  /** The sheet the current wheel gesture scrolls (null: the view), and when its last event came. */
  private readonly wheelGesture: { sheet: string | null; at: number } = { sheet: null, at: 0 };
  /** Where an eased scroll (a mouse wheel's notches) is heading, per sheet, and the frame that moves it there. */
  private readonly scrollTarget = new Map<string, { row: number; column: number }>();
  private scrollFrame = 0;

  private scrollOf(link: ProjectData): { row: number; column: number } {
    const doc = this.doc!;
    return clampScroll(link, doc.tables.get(link.id), doc.sheetScroll.get(link.id) ?? { row: 0, column: 0 });
  }

  /**
   * The edge of the selected plot's source outline under a point on a worksheet, if any: which series and range, and
   * the top or bottom edge (its rows) or a side (its column). Only while one plot alone is selected.
   */
  private sourceEdgeAt(link: ProjectData, wx: number, wy: number): { seriesId: string; which: "x" | "y" | "error" | "labels"; edge: "top" | "bottom" | "side" } | null {
    const doc = this.doc!, plot = doc.selection.size === 1 ? doc.project.plots.find((item) => doc.selection.has(item.id)) : undefined;
    const table = doc.table(link.id);
    if (!plot || !table) return null;
    const view = this.sheetView(link), reach = 4 / this.viewport().scale;
    const bottom = link.y + link.height - (view.tabs.length ? SHEET.tabs : 0);
    if (wx < link.x + SHEET.rowHeader || wx > link.x + link.width || wy < link.y + ROWS_TOP || wy > bottom) return null;
    const { left, top } = this.sheetPlaces(link, view);
    // The last series drawn on top is found first, as its outline is drawn last.
    for (const series of [...plot.series].reverse()) {
      for (const which of ["labels", "error", "y", "x"] as const) {
        const cells = series[which];
        if (!cells || cells.data !== link.id) continue;
        const index = table.columns.findIndex((column) => column.key === cells.column);
        if (index < 0) continue;
        const x0 = left(index), x1 = left(index + 1), y0 = top(cells.rows?.first ?? 0), y1 = top((cells.rows?.last ?? table.rows - 1) + 1);
        if (wx < x0 - reach || wx > x1 + reach || wy < y0 - reach || wy > y1 + reach) continue;
        if (Math.abs(wy - y0) <= reach) return { seriesId: series.id, which, edge: "top" };
        if (Math.abs(wy - y1) <= reach) return { seriesId: series.id, which, edge: "bottom" };
        if (Math.abs(wx - x0) <= reach || Math.abs(wx - x1) <= reach) return { seriesId: series.id, which, edge: "side" };
      }
    }
    return null;
  }

  /**
   * Drag a source outline's edge: the top or bottom sets the range's first or last row (never past the other); a side
   * moves the whole range as Excel's border does, by as many columns and rows as the pointer has moved, keeping its
   * size and staying within the table (a whole column moves only across). The plot follows as it moves; one undo step
   * on release.
   */
  private dragSource(event: PointerEvent, link: ProjectData, at: { seriesId: string; which: "x" | "y" | "error" | "labels"; edge: "top" | "bottom" | "side" }): void {
    const doc = this.doc!, view = this.viewport(), table = doc.table(link.id);
    const plot = doc.project.plots.find((item) => doc.selection.has(item.id));
    const series = plot?.series.find((item) => item.id === at.seriesId);
    if (!table || !plot || !series || !series[at.which]) return;
    const before = doc.snapshot();
    const [vx0, vy0] = this.eventPoint(event);
    const original = series[at.which]!;
    const from = table.columns.findIndex((column) => column.key === original.column);
    // A move carries the range's cell nearest the press (the edge grabbed may lie over the next column or row) by the
    // pointer's travel, from that cell's centre, so a step is taken only past half a cell: the cell under its moved
    // centre, less its place in the range, is the range's new start.
    const [wx0, wy0] = view.toWorld(vx0, vy0);
    const places = this.sheetPlaces(link, this.sheetView(link));
    const firstRow = original.rows?.first ?? 0, lastRow = original.rows?.last ?? Math.max(0, table.rows - 1);
    const y0 = places.top(firstRow), y1 = places.top(lastRow + 1);
    const grabbed = this.pointWithin(link, { column: 0, row: 0 }, places.left(from) + 1, Math.max(y0 + 1, Math.min(y1 - 1, wy0)));
    const offset = Math.max(0, Math.min(lastRow - firstRow, grabbed.row! - firstRow));
    const row = firstRow + offset;
    const centre = { x: (places.left(from) + places.left(from + 1)) / 2, y: (places.top(row) + places.top(row + 1)) / 2 };
    let dragging = false;
    this.track(event, (move) => {
      const [vx, vy] = this.eventPoint(move);
      if (!dragging && !dragStarted(vx0, vy0, vx, vy)) return;
      dragging = true;
      const [wx, wy] = view.toWorld(vx, vy);
      const point = this.pointWithin(link, { column: 0, row: 0 }, wx, wy);
      const cells = series[at.which]!;
      const moved = () => {
        const to = this.pointWithin(link, { column: 0, row: 0 }, centre.x + wx - wx0, centre.y + wy - wy0);
        const clamp = (value: number, high: number) => Math.max(0, Math.min(high, value));
        const column = table.columns[clamp(to.column!, table.columns.length - 1)]?.key ?? cells.column;
        if (!original.rows) return { ...cells, column };
        const span = original.rows.last - original.rows.first, first = clamp(to.row! - offset, Math.max(0, table.rows - 1 - span));
        return { ...cells, column, rows: { first, last: first + span } };
      };
      const rows = cells.rows ?? { first: 0, last: Math.max(0, table.rows - 1) };
      const next = at.edge === "top" ? { ...cells, rows: { first: Math.min(point.row!, rows.last), last: rows.last } }
        : at.edge === "bottom" ? { ...cells, rows: { first: rows.first, last: Math.max(point.row!, rows.first) } }
        : moved();
      if (at.which === "y") series.y = next; else series[at.which] = next;
      this.draw();
      this.host.selectionChanged();
    }, () => { if (dragging) this.host.edited(before); });
  }

  /** The worksheet tab under the pointer, drawn in its hover colour. */
  private readonly hoverTab = createHoverTracker<{ id: string; index: number }>((item) => `${item.id} ${item.index}`);

  /** Where a drag of chosen cells would drop: a plot's id, the empty surface, or nowhere (over another object). */
  private dropAt: { plot: string | null; x: number; y: number } | null = null;

  /**
   * Whether a point is on the border of the cells chosen in a selected worksheet: within a few screen pixels of a
   * block's edge, inside the cells' area, as a spreadsheet's selection is dragged by its border.
   */
  private onChosenEdge(link: ProjectData, wx: number, wy: number): boolean {
    const doc = this.doc!, chosen = doc.selectedColumn;
    if (!chosen?.cells || chosen.id !== link.id || !doc.selection.has(link.id)) return false;
    const view = this.sheetView(link), reach = 4 / this.viewport().scale;
    const bottom = link.y + link.height - (view.tabs.length ? SHEET.tabs : 0);
    if (wx < link.x + SHEET.rowHeader || wx > link.x + link.width || wy < link.y + ROWS_TOP || wy > bottom) return false;
    const { left, top } = this.sheetPlaces(link, view);
    return chosen.cells.ranges.some((range) => {
      const x0 = left(range.c0), x1 = left(range.c1 + 1), y0 = top(range.rows?.first ?? 0), y1 = top((range.rows?.last ?? view.rows - 1) + 1);
      if (wx < x0 - reach || wx > x1 + reach || wy < y0 - reach || wy > y1 + reach) return false;
      return Math.abs(wx - x0) <= reach || Math.abs(wx - x1) <= reach || Math.abs(wy - y0) <= reach || Math.abs(wy - y1) <= reach;
    });
  }

  /**
   * Drag the chosen cells: over a plot it is outlined and the cursor says copy; over the empty surface too, for a new
   * plot there; over a worksheet or an image nothing drops. Released, the host adds them.
   */
  private dragCells(event: PointerEvent): void {
    const doc = this.doc!, view = this.viewport();
    const [vx0, vy0] = this.eventPoint(event);
    let dragging = false;
    this.canvas.style.cursor = "grabbing";
    this.track(event, (move) => {
      const [vx, vy] = this.eventPoint(move);
      if (!dragging && !dragStarted(vx0, vy0, vx, vy)) return;
      dragging = true;
      const [wx, wy] = view.toWorld(vx, vy);
      const top = objectAt(doc.objects(), wx, wy);
      this.dropAt = top ? (isPlot(top) ? { plot: top.id, x: wx, y: wy } : null) : { plot: null, x: wx, y: wy };
      this.canvas.style.cursor = this.dropAt ? "copy" : "no-drop";
      this.draw();
    }, () => {
      const drop = dragging ? this.dropAt : null;
      this.dropAt = null;
      this.canvas.style.cursor = "";
      this.draw();
      if (drop) this.host.dropCells(drop.plot, { x: drop.x, y: drop.y });
    });
  }

  private sheetView(link: ProjectData) {
    const state = this.doc!.tables.get(link.id);
    const loaded = state?.kind === "ready" ? state.loaded : null;
    const scroll = this.scrollOf(link);
    return {
      columns: loaded?.table.columns.length ?? 0, rows: loaded?.table.rows ?? 0, tabs: link.source.format === "xlsx" ? loaded?.sheets ?? [] : [],
      scrollRow: scroll.row, scrollColumn: scroll.column, axes: loaded ? sheetAxes(loaded.table) : undefined,
    };
  }

  /** Where a sheet's columns start and its rows' tops are, on the work surface, with its scroll and widths. */
  private sheetPlaces(link: ProjectData, view: SheetView): { left: (column: number) => number; top: (row: number) => number } {
    const axes = viewAxes(view), columnBase = axes.columns.at(view.scrollColumn), rowBase = axes.rows.at(view.scrollRow);
    return {
      left: (column) => link.x + SHEET.rowHeader + axes.columns.at(column) - columnBase,
      top: (row) => link.y + ROWS_TOP + axes.rows.at(row) - rowBase,
    };
  }

  /** Whether wheel travel (view px) would move a sheet at all: false when it is not read or already at its end that way. */
  private canScrollSheet(link: ProjectData, dx: number, dy: number): boolean {
    const doc = this.doc!;
    if (doc.tables.get(link.id)?.kind !== "ready") return false;
    const current = this.scrollOf(link), scale = this.viewport().scale;
    const next = clampScroll(link, doc.tables.get(link.id), current, { x: dx / scale, y: dy / scale });
    return Math.abs(next.row - current.row) > 1e-6 || Math.abs(next.column - current.column) > 1e-6;
  }

  /**
   * Scroll a sheet by wheel travel in view px, to the pixel: a trackpad's travel at once, so that the rows follow the
   * fingers; a mouse wheel's notches eased over a few frames, so that a notch glides rather than jumps.
   */
  private scrollSheet(link: ProjectData, dx: number, dy: number, eased: boolean): void {
    const doc = this.doc!;
    const scale = this.viewport().scale, state = doc.tables.get(link.id);
    const from = eased ? this.scrollTarget.get(link.id) ?? this.scrollOf(link) : this.scrollOf(link);
    const next = clampScroll(link, state, from, { x: dx / scale, y: dy / scale });
    if (!eased) { this.scrollTarget.delete(link.id); doc.sheetScroll.set(link.id, next); this.draw(); return; }
    this.scrollTarget.set(link.id, next);
    if (this.scrollFrame) return;
    const step = () => {
      this.scrollFrame = 0;
      const current = this.doc;
      if (!current) { this.scrollTarget.clear(); return; }
      for (const [id, target] of this.scrollTarget) {
        const sheet = current.dataLink(id);
        if (!sheet) { this.scrollTarget.delete(id); continue; }
        const now = this.scrollOf(sheet), axes = viewAxes(this.sheetView(sheet));
        // A third of the way each frame, in pixels along the sheet (so that hidden rows and wide columns pass at an even
        // pace), then the rest once it is under a hundredth of a standard row or column.
        const ease = (axis: SheetAxis, from: number, to: number) => {
          const start = axis.at(from), end = axis.at(to), at = start + (end - start) * EASE;
          return { index: axis.index(at), left: Math.abs(end - at) };
        };
        const row = ease(axes.rows, now.row, target.row), column = ease(axes.columns, now.column, target.column);
        const done = row.left < 0.01 * SHEET.row && column.left < 0.01 * SHEET.column;
        current.sheetScroll.set(id, done ? target : { row: row.index, column: column.index });
        if (done) this.scrollTarget.delete(id);
      }
      this.draw();
      if (this.scrollTarget.size) this.scrollFrame = requestAnimationFrame(step);
    };
    this.scrollFrame = requestAnimationFrame(step);
  }

  /**
   * A plain press on a worksheet's own parts: the grip resizes it, the re-read mark reads the file again, and a sheet
   * tab reads that sheet.
   * True when the press was used here.
   */
  private sheetPress(event: PointerEvent, link: ProjectData, part: SheetPart, wx0: number, wy0: number): boolean {
    const doc = this.doc!;
    const select = () => { if (!(doc.selection.size === 1 && doc.selection.has(link.id))) { doc.selection = new Set([link.id]); this.host.selectionChanged(); } };
    if (part.kind === "reload") { select(); this.host.reloadData(link.id); this.draw(); return true; }
    if (part.kind === "tab") {
      select();
      const sheets = this.sheetView(link).tabs;
      if (sheets[part.index]) this.host.chooseSheet(link.id, sheets[part.index]);
      return true;
    }
    if (part.kind !== "grip") return false;
    select();
    this.resizeBox(event, link, SHEET.minWidth, SHEET.minHeight, wx0, wy0);
    return true;
  }

  /** The point of a sheet a press on this part chooses from: a column's heading or label rows, a row's number, a cell. */
  private static pointOf(part: SheetPart): SheetPoint | null {
    if (part.kind === "heading") return { column: part.column, row: null };
    if (part.kind === "row-header") return { column: null, row: part.row };
    if (part.kind === "cell") return { column: part.column, row: part.row };
    return null;
  }

  /**
   * A press on a worksheet's headings, label rows, row numbers or cells chooses cells, as in a spreadsheet: a plain
   * press anew, Shift extends the last block, Cmd (Ctrl elsewhere) adds a block or takes one away. A drag then extends
   * the block (after Cmd, the block it added, so Cmd-drag adds a range), the pointer held within the sheet's columns
   * and rows, so that a drag past an edge stops at the last one shown. The sheet becomes the only object selected.
   * True when the press was used here.
   */
  private cellPress(event: PointerEvent, link: ProjectData, part: SheetPart, mode: "replace" | "add" | "toggle"): boolean {
    const doc = this.doc!;
    const point = Workspace.pointOf(part);
    const state = doc.tables.get(link.id);
    if (!point || state?.kind !== "ready") return false;
    const columns = state.loaded.table.columns;
    if (!(doc.selection.size === 1 && doc.selection.has(link.id))) { doc.selection = new Set([link.id]); this.host.selectionChanged(); }
    const own = doc.selectedColumn?.id === link.id ? doc.selectedColumn.cells : null;
    // A new sheet's first press starts anew, whatever the keys.
    let cells = pressSelection(own, point, own ? mode : "replace", columns.length);
    const keyOf = (at: SheetPoint) => (at.column === null ? doc.selectedColumn?.column ?? null : columns[at.column]?.key ?? null);
    this.host.selectCells(link.id, cells, keyOf(point));
    // A Cmd press that took cells away (it keeps the old anchor) has no new block to drag out.
    if (mode === "toggle" && cells.anchor !== point) return true;
    const view = this.viewport();
    const [vx0, vy0] = this.eventPoint(event);
    let dragging = false, last = point;
    this.track(event, (move) => {
      const [vx, vy] = this.eventPoint(move);
      if (!dragging && !dragStarted(vx0, vy0, vx, vy)) return;
      dragging = true;
      const [wx, wy] = view.toWorld(vx, vy);
      const at = this.pointWithin(link, point, wx, wy);
      if (at.column === last.column && at.row === last.row) return;
      last = at;
      cells = dragSelection(cells, at, columns.length);
      doc.selectedColumn = { id: link.id, column: doc.selectedColumn?.column ?? null, cells };
      this.draw();
    }, () => { if (dragging) this.host.selectCells(link.id, cells, keyOf(last)); this.host.cellsChosen(link.id, cells); });
    return true;
  }

  /**
   * The point a drag over a sheet is at, held within its shown columns and rows: a drag from a heading stays on the
   * headings (whole columns), from a row number on the numbers (whole rows), from a cell on the cells.
   */
  private pointWithin(link: ProjectData, start: SheetPoint, wx: number, wy: number): SheetPoint {
    const view = this.sheetView(link);
    const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
    const lastColumn = Math.max(0, view.columns - 1), lastRow = Math.max(0, view.rows - 1);
    const bottom = link.height - (view.tabs.length ? SHEET.tabs : 0);
    const dx = clamp(wx - link.x, SHEET.rowHeader, link.width - 1), dy = clamp(wy - link.y, ROWS_TOP, bottom - 1);
    const axes = viewAxes(view);
    const column = clamp(placeAt(axes.columns, view.scrollColumn, dx - SHEET.rowHeader), 0, lastColumn);
    const row = clamp(placeAt(axes.rows, view.scrollRow, dy - ROWS_TOP), 0, lastRow);
    return { column: start.column === null ? null : column, row: start.row === null ? null : row };
  }

  /** Drag a worksheet's or plot's bottom-right corner: its size follows, on the grid, never below its least size. */
  private resizeBox(event: PointerEvent, object: ProjectData | ProjectPlot, minWidth: number, minHeight: number, wx0: number, wy0: number): void {
    const doc = this.doc!;
    const view = this.viewport();
    const before = doc.snapshot();
    const start = { width: object.width, height: object.height };
    let dragging = false;
    const [vx0, vy0] = this.eventPoint(event);
    this.track(event, (move) => {
      const [vx, vy] = this.eventPoint(move);
      if (!dragging && !dragStarted(vx0, vy0, vx, vy)) return;
      dragging = true;
      const [wx, wy] = view.toWorld(vx, vy);
      const spacing = doc.project.grid.spacing, snap = doc.project.grid.snap && !move.altKey;
      const right = snap ? snapValue(object.x + start.width + wx - wx0, spacing) : Math.round(object.x + start.width + wx - wx0);
      const bottom = snap ? snapValue(object.y + start.height + wy - wy0, spacing) : Math.round(object.y + start.height + wy - wy0);
      object.width = Math.max(minWidth, right - object.x);
      object.height = Math.max(minHeight, bottom - object.y);
      this.draw();
      this.host.selectionChanged();
    }, () => { if (dragging) this.host.edited(before); });
  }

  keyUp(event: KeyboardEvent): void {
    if (event.key === " ") { this.spaceDown = false; if (!this.panning) this.canvas.classList.remove("panning"); }
  }
}

// MARK: surface colours

interface SurfaceColours { sheet: string; dot: string; line: string; quiet: string }

/**
 * The sheet, dot and line colours of the shell's welcome surface, read from its theme tokens on `body` (shell 3.1.0),
 * so that the work surface and the welcome screen are the same surface in every appearance; no colour is written here.
 */
function surfaceColours(): SurfaceColours {
  const body = getComputedStyle(document.body);
  const read = (name: string) => body.getPropertyValue(name).trim();
  return { sheet: read("--empty-sheet"), dot: read("--empty-grid-dot"), line: read("--empty-grid-line"), quiet: read("--text3") };
}

/** A fitted viewport moved by the margin, so that the content sits inside it. */
function shift(view: Viewport, marginPx: number): Viewport {
  view.pan(marginPx, marginPx);
  return view;
}

/** Region coordinates are kept to two decimals of a pixel, so that documents stay readable. */
const round2 = (value: number) => Math.round(value * 100) / 100;
const isBoxDraft = (roi: DrawnRoi): roi is DrawnRoi & { x: number; y: number; width: number; height: number } => roi.type === "rectangle" || roi.type === "ellipse";

// MARK: a plot's source cells

/** Outline colours of a plot's cells: X in purple, then each series' Y in the next accent; never the black of a series. */
const SOURCE_X = "#8064A2";
const SOURCE_LABEL = "#7F7F7F";
const SOURCE_Y = ["#4F81BD", "#C0504D", "#9BBB59", "#F79646", "#4BACC6", "#7F7F7F"];

/** The cells of the one selected plot, by worksheet, as outlines to draw on the sheets; none unless one plot is selected. */
function plotSourceHighlights(doc: PlotDocument): Map<string, SheetHighlight[]> {
  const out = new Map<string, SheetHighlight[]>();
  const plots = doc.project.plots.filter((plot) => doc.selection.has(plot.id));
  if (plots.length !== 1 || doc.selection.size !== 1) return out;
  const add = (cells: CellRange, colour: string, dashed = false) => out.set(cells.data, [...(out.get(cells.data) ?? []), { column: cells.column, rows: cells.rows, colour, dashed }]);
  plots[0].series.forEach((series, index) => {
    const colour = SOURCE_Y[index % SOURCE_Y.length];
    if (series.x) add(series.x, SOURCE_X);
    add(series.y, colour);
    if (series.error) add(series.error, colour, true);
    if (series.labels) add(series.labels, SOURCE_LABEL, true);
  });
  return out;
}
