// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Regions of interest in the inspector and the toolbar: the outline of an image's regions (the shell's
// `renderOutline`), the selected region's name, box, exact area, pixel count and perimeter or length, and the region
// tools with their icons and keys. Fields come from the shell's kit.
import { CANVAS_TOOLS, type CanvasTool } from "forge-shell/app/canvas-tools";
import { createButton, createRow, createButtonGroup } from "forge-shell/app/builders";
import { renderOutline } from "forge-shell/app/outline-list";
import { validateName } from "forge-shell/app/rename";
import { setTip } from "forge-shell/app/tips";
import { CANVAS_TOOL_ICONS } from "forge-shell/app/tool-icons";
import { createUnitField } from "forge-shell/app/unit-field";
import {
  formatArea, formatLength, formatMeasure, isBox, maskCount, roiArea, roiMask, roiPerimeter, type ProjectImage, type Roi, type RoiType, type Scale, type Shape,
} from "../engine";
import { actionsFirst } from "./section-actions";

// MARK: wording and tools

export const ROI_LABELS: Record<RoiType, string> = { rectangle: "Rectangle", ellipse: "Ellipse", polygon: "Polygon", freehand: "Freehand", line: "Line" };

/**
 * The region tools: the shell's icon (`CANVAS_TOOL_ICONS`) and bare tool key, the shell's canvas tool keys (`CANVAS_TOOLS`, on the Tool tier, only while no
 * text field has the focus).
 */
export const ROI_TOOLS: readonly { type: RoiType; key: string; icon: string }[] = [
  { type: "rectangle", key: CANVAS_TOOLS.rectangle.key, icon: CANVAS_TOOL_ICONS.rectangle },
  { type: "ellipse", key: CANVAS_TOOLS.ellipse.key, icon: CANVAS_TOOL_ICONS.ellipse },
  { type: "polygon", key: CANVAS_TOOLS.polygon.key, icon: CANVAS_TOOL_ICONS.polygon },
  { type: "freehand", key: CANVAS_TOOLS.freehand.key, icon: CANVAS_TOOL_ICONS.freehand },
  { type: "line", key: CANVAS_TOOLS.line.key, icon: CANVAS_TOOL_ICONS.line },
];
export const SELECT_KEY = CANVAS_TOOLS.select.key;
/** The Crop tool: drag a rectangle on an image, which adds a Crop step with its box. */
export const CROP_KEY = CANVAS_TOOLS.crop.key;
/** The shell's canvas tools PlotForge has, all seven: their letters go to nothing else (`toolKeyProblems`). */
export const PLOT_CANVAS_TOOLS = Object.keys(CANVAS_TOOLS) as readonly CanvasTool[];
export const CROP_ICON = CANVAS_TOOL_ICONS.crop;
export const SELECT_ICON = CANVAS_TOOL_ICONS.select;
export const CROP_LABEL = "Crop";
export const CROP_MODE_OBJECT = "crop area";

/** The mode label's object for each tool: `Draw rectangle. Press Esc to finish`. */
export const ROI_MODE_OBJECTS: Record<RoiType, string> = { rectangle: "rectangle", ellipse: "ellipse", polygon: "polygon", freehand: "freehand region", line: "line" };

// MARK: the sections

export interface RoiViewOptions {
  image: ProjectImage;
  /** The shape of the image's result, for the region's pixels; null while the image cannot be shown. */
  result: Pick<Shape, "widthPx" | "heightPx"> | null;
  scale: Scale;
  current: Roi | null;
  select(roiId: string): void;
  remove(roiId: string): void;
  rename(roiId: string, name: string): void;
  change(roiId: string, patch: Partial<Roi>): void;
  cropTo(roiId: string): void;
  report(message: string): void;
}

/**
 * The Regions section: Remove and Crop to region as its one action row, the image's regions as an outline, then the
 * selected region's rows under the list.
 */
export function renderRegions(section: HTMLElement, options: RoiViewOptions): void {
  const list = document.createElement("div");
  list.setAttribute("aria-label", "Regions");
  renderOutline(list, options.image.rois.map((roi) => ({ title: roi.name, level: 1, id: roi.id })), options.current?.id ?? null, (id) => options.select(id), "No regions.");
  section.append(list);
  const current = options.current;
  const remove = createButton({ label: "Remove", disabled: !current, onClick: () => { if (current) options.remove(current.id); } });
  setTip(remove, current ? "Remove the selected region; the image is unchanged." : "Select a region to remove it.");
  const crop = createButton({ label: "Crop to region", disabled: !current || !options.result, onClick: () => { if (current) options.cropTo(current.id); } });
  setTip(crop, !current ? "Select a region to crop to it." : options.result ? "Add a Crop step to the region's bounding box; the regions move with it." : "The image must be shown before it can be cropped.");
  actionsFirst(section, createButtonGroup([remove, crop]));
  if (current) renderRegion(section, { ...options, current });
}

/** The selected region's rows: its name, box (rectangles and ellipses), area, pixels, and perimeter or length. */
function renderRegion(section: HTMLElement, options: RoiViewOptions & { current: Roi }): void {
  const { current: roi, image, scale } = options;
  section.append(createRow("Name", roi.name, document, {
    current: () => roi.name, label: "Region name",
    validate: (name) => validateName(name, { taken: image.rois.filter((other) => other !== roi).map((other) => other.name) }),
    apply: (name) => options.rename(roi.id, name.trim()), onError: options.report,
  }));
  section.append(createRow("Type", ROI_LABELS[roi.type]));
  if (isBox(roi)) {
    const parse = (text: string) => { const match = /^\s*(-?\d*\.?\d+)\s*(px)?\s*$/i.exec(text); return match ? Number(match[1]) : NaN; };
    for (const [key, label, tip] of [["x", "X", "The left edge, in pixels of the result of the steps."], ["y", "Y", "The top edge, in pixels of the result of the steps."],
      ["width", "Width", "The width, in pixels."], ["height", "Height", "The height, in pixels."]] as const) {
      const field = createUnitField({
        label, unit: "px", value: roi[key], format: (value, unit) => `${formatMeasure(value)} ${unit}`, parse,
        apply: (value) => {
          if ((key === "width" || key === "height") && !(value > 0)) { options.report(`Invalid ${label.toLowerCase()}. Enter a number above 0.`); return; }
          options.change(roi.id, { [key]: value } as Partial<Roi>);
        },
        reportError: options.report, invalidMessage: `Invalid ${label.toLowerCase()}. Enter a number of pixels.`,
      });
      setTip(field.row, tip);
      section.append(field.row);
    }
  }
  if (roi.type === "line") {
    section.append(createRow("Length", formatLength(roiPerimeter(roi, scale), scale.unit)));
    return;
  }
  const area = createRow("Area", formatArea(roiArea(roi, scale), scale.unit));
  setTip(area, "The exact area of the outline.");
  section.append(area);
  const mask = options.result ? roiMask(roi, options.result) : null;
  const pixels = createRow("Pixels", mask ? String(maskCount(mask)) : "Not shown");
  setTip(pixels, "Pixels whose centres lie inside the region; measurements count these.");
  section.append(pixels);
  section.append(createRow("Perimeter", formatLength(roiPerimeter(roi, scale), scale.unit)));
}
