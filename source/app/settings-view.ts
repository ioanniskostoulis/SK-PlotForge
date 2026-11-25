// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The wording of the app's settings and export options, which Settings (Images and Export pages, main.ts) shows as
// the shell's rows, and the shell's select in the field layout that the inspector's choices use.
import { createField } from "forge-shell/app/builders";
import { createSelectControl } from "forge-shell/app/select-control";
import { MASK_COLOURS, MAX_SCALE_BAR_BLOCKS, scaleBarNumber, type ExportOptions, type ImageSettings } from "../engine";
import { GREY_METHOD_LABELS, THRESHOLD_METHOD_LABELS } from "./step-wording";

// MARK: wording

export const THRESHOLD_MODE_LABELS: Record<ImageSettings["thresholdMode"], string> = { manual: "Manual", ...THRESHOLD_METHOD_LABELS };
export const MASK_COLOUR_LABELS: Record<keyof typeof MASK_COLOURS, string> = { magenta: "Magenta", orange: "Orange", blue: "Blue", cyan: "Cyan", green: "Green", yellow: "Yellow", red: "Red" };
export const FORMAT_LABELS: Record<ExportOptions["format"], string> = { png: "PNG", jpeg: "JPEG" };
export const SCALE_BAR_LABELS: Record<ExportOptions["scaleBar"], string> = { none: "None", "lower-right": "Lower right", "lower-left": "Lower left", "upper-right": "Upper right", "upper-left": "Upper left" };
export const SCALE_BAR_STYLE_LABELS: Record<ExportOptions["scaleBarStyle"], string> = { checkered: "Checkered", simple: "Simple" };
export const SCALE_BAR_SIZE_LABELS: Record<ExportOptions["scaleBarSize"], string> = { small: "Small", medium: "Medium", large: "Large" };
export const SCALE_BAR_TIPS = {
  style: "Checkered: two rows of black and white blocks, numbered below, as a map scale. Simple: a white bar with its length above.",
  length: "The bar's length in the image's unit (pixels when not calibrated); Automatic is a round length near a fifth of the width. A fixed length keeps the bars of one figure alike.",
  blocks: "How many blocks a checkered bar has: the right half is one block and the rest is halved again, so 4 blocks of a 20 nm bar read 0, 2.5, 5, 10, 20.",
  size: "The bar's thickness and text, relative to the picture's shorter side, so pictures of one size get the same bar.",
};
/** Bar lengths offered in a list, Automatic first; a typed length that is not among them is added. */
export function scaleBarLengthChoices(current: number | null): [string, string][] {
  const values = [...new Set([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, ...(current === null ? [] : [current])])].sort((a, b) => a - b);
  return [["auto", "Automatic"], ...values.map((value): [string, string] => [scaleBarNumber(value), scaleBarNumber(value)])];
}
export const scaleBarBlockChoices = (): [string, string][] => Array.from({ length: MAX_SCALE_BAR_BLOCKS }, (_, i) => [String(i + 1), String(i + 1)]);

/** The shell's select (its own menu, never the browser's list) of fixed choices, as `[value, label]`, in the shared field layout. */
export function selectField<T extends string>(label: string, choices: readonly (readonly [T, string])[], value: T, onChoose: (value: T) => void, disabled = false): HTMLLabelElement {
  const control = createSelectControl({
    label, value, disabled, choices: choices.map(([key, text]) => ({ value: key, label: text })),
    onChange: (chosen) => { if (chosen !== value) onChoose(chosen as T); },
  });
  return createField(label, control);
}

