// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The inspector's Display section: the lookup table of a grey image, Custom's colours, and the display range
// (brightness and contrast) as two sliders with a live preview, Auto (0.35% saturated) and Reset. Display only:
// values, measurements and data exports never change.
import { createButton, createButtonGroup, createField, createRow } from "forge-shell/app/builders";
import { editableValue, sliderRow } from "forge-shell/app/inspector-widgets";
import { setTip } from "forge-shell/app/tips";
import { autoRange, DEFAULT_DISPLAY, displayProblem, histogram, maxValue, type DisplaySettings, type LutName, type Raster } from "../engine";
import { selectField } from "./settings-view";
import { actionsFirst } from "./section-actions";

export const LUT_LABELS: Record<LutName, string> = {
  grays: "Grays", inverted: "Inverted", blackWhite: "Black and white", fire: "Fire", ice: "Ice", spectrum: "Spectrum", custom: "Custom",
};

/** Custom colours from text: two to five `#rrggbb` separated by spaces or commas; null otherwise. */
export function parseStops(text: string): string[] | null {
  const stops = text.trim().split(/[\s,]+/).filter(Boolean).map((stop) => (stop.startsWith("#") ? stop : `#${stop}`).toLowerCase());
  return stops.length >= 2 && stops.length <= 5 && stops.every((stop) => /^#[0-9a-f]{6}$/.test(stop)) ? stops : null;
}

/** The display range of every pixel's counted values, over all channels. */
function allCounts(raster: Raster): Float64Array {
  if (raster.channels === 1) return histogram(raster);
  const counts = new Float64Array(maxValue(raster.bitDepth) + 1);
  for (const v of raster.data) counts[v]++;
  return counts;
}

export interface DisplayViewOptions {
  display: DisplaySettings | undefined;
  working: Raster | null;
  set(next: DisplaySettings | undefined): void;
  beginPreview(): string;
  preview(next: DisplaySettings): void;
  endPreview(before: string): void;
  report(message: string): void;
}

export function renderDisplay(section: HTMLElement, options: DisplayViewOptions): void {
  const { working } = options;
  const display = options.display ?? DEFAULT_DISPLAY;
  if (!working) { section.append(createRow("Display", "Not shown")); return; }
  const M = maxValue(working.bitDepth);
  const apply = (next: DisplaySettings) => {
    const problem = displayProblem(next, working.bitDepth);
    if (problem) { options.report(problem); return; }
    const plain = next.lut === "grays" && next.min === null && next.max === null;
    options.set(plain ? undefined : next);
  };
  if (working.channels === 1) {
    const row = selectField("Lookup table", Object.entries(LUT_LABELS) as [LutName, string][], display.lut, (lut) => apply({ ...display, lut }));
    setTip(row, "The colours grey values are drawn in; display only.");
    section.append(row);
    if (display.lut === "custom") {
      const input = Object.assign(document.createElement("input"), { type: "text", value: display.stops.join(" "), spellcheck: false });
      input.addEventListener("change", () => {
        const stops = parseStops(input.value);
        if (!stops) { options.report("Invalid colours. Enter two to five colours written #rrggbb, separated by spaces."); input.value = display.stops.join(" "); return; }
        apply({ ...display, stops });
      });
      const colours = createField("Colours", input);
      setTip(colours, "From the lowest value to the highest, spread evenly; two to five, written #rrggbb.");
      section.append(colours);
    }
  } else {
    const row = createRow("Lookup table", "Own colours");
    setTip(row, "A colour image keeps its colours; the display range applies to each channel.");
    section.append(row);
  }
  const min = display.min ?? 0, max = display.max ?? M;
  for (const key of ["min", "max"] as const) {
    let before = "";
    const label = key === "min" ? "Minimum" : "Maximum";
    const current = key === "min" ? min : max;
    const { row, valueText } = sliderRow(label, current, 0, M, (value) => {
      const next = { ...display, min, max, [key]: Math.round(value) };
      if (next.min >= next.max) { if (key === "min") next.min = next.max - 1; else next.max = next.min + 1; }
      valueText.textContent = String(next[key]);
      options.preview(next);
    }, true, [], { undo: { begin: () => { before = options.beginPreview(); }, end: () => options.endPreview(before) }, reset: () => (key === "min" ? 0 : M) });
    valueText.textContent = String(current);
    editableValue(valueText, () => String(current), (text) => {
      const value = /^\s*\d+\s*$/.test(text) ? Number(text) : NaN;
      const next = { ...display, min, max, [key]: value };
      if (!(value >= 0 && value <= M) || next.min >= next.max) { options.report(`Invalid ${label.toLowerCase()}. Enter a whole number from 0 to ${M}, the minimum below the maximum.`); return false; }
      apply(next);
      return true;
    }, label);
    setTip(row, key === "min" ? "Values at or below this are drawn as the table's first colour." : "Values at or above this are drawn as the table's last colour.");
    section.append(row);
  }
  const auto = createButton({ label: "Auto", onClick: () => {
    const range = autoRange(allCounts(working));
    if (!range) { options.report("The image has one value, so it has no range to stretch."); return; }
    apply({ ...display, ...range });
  } });
  setTip(auto, "Stretch the display over the values, leaving 0.35% of the pixels saturated.");
  const reset = createButton({ label: "Reset", disabled: !options.display, onClick: () => options.set(undefined) });
  setTip(reset, "Draw the image plainly: Grays over its whole depth.");
  actionsFirst(section, createButtonGroup([auto, reset]));
}
