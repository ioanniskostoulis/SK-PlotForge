// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The Placement section, the same in every mode (an image, a worksheet, a plot, several objects): X, Y, Width and
// Height in that order, whole pixels with "px" after them, each a field when it can be changed and a plain row when it
// cannot (an image's size is its pixels; a selection's box is read from its objects). An image adds its Angle, the turn
// its lever gives it.
import { createRow } from "forge-shell/app/builders";
import { setTip } from "forge-shell/app/tips";
import { createUnitField } from "forge-shell/app/unit-field";

export type PlacementKey = "x" | "y" | "width" | "height";
export type PlacementBox = Record<PlacementKey, number>;

export interface PlacementOptions {
  /** What is placed, for the tips: "the image", "the worksheet", "the plot", "the selection". */
  noun: string;
  box: PlacementBox;
  /** Set one value; left out, every row is read-only. */
  apply?: (key: PlacementKey, value: number) => void;
  /** Which of the four can be changed when `apply` is given; all by default. */
  editable?: readonly PlacementKey[];
  /** The least width and height, when they can be changed. */
  min?: { width: number; height: number };
  /** A tip to use in place of the standard one, by key. */
  tips?: Partial<Record<PlacementKey, string>>;
  /** What turns (an image): its angle in degrees clockwise, set in the Angle field after Height. */
  angle?: { value: number; apply: (degrees: number) => void };
  report: (message: string) => void;
}

const LABELS: Record<PlacementKey, string> = { x: "X", y: "Y", width: "Width", height: "Height" };
const KEYS: readonly PlacementKey[] = ["x", "y", "width", "height"];
const px = (value: number) => `${Math.round(value)} px`;

export function renderPlacement(section: HTMLElement, options: PlacementOptions): void {
  const { noun, box, apply } = options;
  const editable = new Set(apply ? options.editable ?? KEYS : []);
  const standard: Record<PlacementKey, string> = {
    x: `The left edge of ${noun} on the work surface, in pixels.`,
    y: `The top edge of ${noun} on the work surface, in pixels.`,
    width: `The width of ${noun} in pixels${editable.has("width") ? "; drag its bottom-right corner to resize it" : ""}.`,
    height: `The height of ${noun} in pixels${editable.has("height") ? "; drag its bottom-right corner to resize it" : ""}.`,
  };
  for (const key of KEYS) {
    const label = LABELS[key], tip = options.tips?.[key] ?? standard[key];
    if (!editable.has(key)) {
      const row = createRow(label, px(box[key]));
      setTip(row, tip);
      section.append(row);
      continue;
    }
    const min = key === "width" ? options.min?.width ?? 1 : key === "height" ? options.min?.height ?? 1 : -Infinity;
    const field = createUnitField({
      label, unit: "px", value: box[key], format: px,
      parse: (text) => { const match = /^\s*(-?\d+(?:\.\d+)?)\s*(px)?\s*$/i.exec(text); const value = match ? Math.round(Number(match[1])) : NaN; return value >= min ? value : NaN; },
      apply: (value) => apply!(key, value),
      reportError: options.report,
      invalidMessage: min > -Infinity ? `Invalid ${label.toLowerCase()}. Enter a whole number of pixels from ${min}.` : `Invalid ${label} position. Enter a whole number of pixels.`,
    });
    setTip(field.row, tip);
    section.append(field.row);
  }
  if (options.angle) {
    const turn = options.angle;
    const field = createUnitField({
      label: "Angle", unit: "°", value: turn.value, format: (value) => `${Math.round(value * 100) / 100}°`,
      parse: (text) => { const match = /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*$/.exec(text); return match ? Number(match[1]) : NaN; },
      apply: (value) => turn.apply(value),
      reportError: options.report,
      invalidMessage: "Invalid angle. Enter degrees, such as 12.5 or −30.",
    });
    setTip(field.row, `How far ${noun} is turned on the work surface, in degrees clockwise; drag the lever above it to turn it, with Shift for 15° steps. Its pixels, regions and measurements are unchanged.`);
    section.append(field.row);
  }
}
