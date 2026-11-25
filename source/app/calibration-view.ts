// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The inspector's Calibration section, for the selected image or for the document's default: how the scale is
// given (a known length, units per pixel, the document's default, or pixels), its fields, and what it gives (the size
// of one pixel and of the image after its steps). Fields come from the shell's kit.
import { createButton, createButtonGroup, createField, createRow } from "forge-shell/app/builders";
import { setTip } from "forge-shell/app/tips";
import { createUnitField } from "forge-shell/app/unit-field";
import {
  calibrationProblem, directScale, formatLength, formatMeasure, knownLength, LENGTH_UNITS, type Calibration, type ImageCalibration, type LengthUnit, type Scale,
} from "../engine";
import { selectField } from "./settings-view";
import { actionsFirst } from "./section-actions";

// MARK: wording

export type CalibrationChoice = "document" | "known" | "scale" | "pixels";
export const CHOICE_LABELS: Record<CalibrationChoice, string> = { document: "Document", known: "Known length", scale: "Scale", pixels: "Pixels" };

/** A calibration in a few words: `200 px = 50 µm`, `0.25 µm per pixel`, with the aspect ratio when it is not 1. */
export function calibrationSummary(calibration: Calibration | null): string {
  if (!calibration) return "Pixels";
  const base = calibration.mode === "known"
    ? `${formatMeasure(calibration.pixelLength)} px = ${formatLength(calibration.realLength, calibration.unit)}`
    : `${formatLength(calibration.realLength, calibration.unit)} per pixel`;
  return calibration.aspect === 1 ? base : `${base}, aspect ${formatMeasure(calibration.aspect)}`;
}

/** The size of one pixel: `0.25 µm`, or `0.1 × 0.2 mm` when it is not square. */
export function pixelSizeText(scale: Scale): string {
  return scale.x === scale.y ? formatLength(scale.x, scale.unit) : `${formatMeasure(scale.x)} × ${formatLength(scale.y, scale.unit)}`;
}

/** A positive number, with or without the field's unit after it; NaN otherwise. */
export function parsePositive(text: string, unit: string): number {
  const match = /^\s*(\d*\.?\d+(?:e[-+]?\d+)?)\s*(\S*)\s*$/i.exec(text);
  if (!match || (match[2] && match[2] !== unit && !(unit === "µm" && match[2] === "um"))) return NaN;
  const value = Number(match[1]);
  return value > 0 ? value : NaN;
}

/** A unit as typed: the six units, with `um` for µm. */
export function parseUnit(text: string): LengthUnit | null {
  const unit = text === "um" ? "µm" : text;
  return (LENGTH_UNITS as readonly string[]).includes(unit) ? unit as LengthUnit : null;
}

/** The calibration a choice starts from: the current scale kept where there is one, else 1 µm per pixel. */
export function startCalibration(choice: "known" | "scale", from: Calibration | null): Calibration {
  if (!from) return choice === "known" ? knownLength(1, 1, "µm") : directScale(1, "µm");
  return choice === "known" ? { ...from, mode: "known" } : directScale(from.realLength / from.pixelLength, from.unit, from.aspect);
}

// MARK: the section

export interface CalibrationViewOptions {
  /** "image": the choice includes the document's default; "document": the default itself. */
  target: "image" | "document";
  own: ImageCalibration;
  documentDefault: Calibration | null;
  /** The scale of the image's result after its steps, and its size in pixels; image only. */
  result?: { scale: Scale; widthPx: number; heightPx: number };
  apply(next: ImageCalibration): void;
  report(message: string): void;
  /** Image only: the selected region when it is a line, and the name of the line the calibration follows. */
  selectedLine?: { id: string; name: string } | null;
  followedLine?: string | null;
  useLine?(roiId: string): void;
}

export function renderCalibration(section: HTMLElement, options: CalibrationViewOptions): void {
  const { own, target } = options;
  const choice: CalibrationChoice = own === "pixels" ? "pixels" : own ? own.mode : target === "image" ? "document" : "pixels";
  const choices: CalibrationChoice[] = target === "image" ? ["document", "known", "scale", "pixels"] : ["pixels", "known", "scale"];
  const choiceRow = selectField("Calibration", choices.map((value): [CalibrationChoice, string] => [value, CHOICE_LABELS[value]]), choice, (next) => {
    const current = own && own !== "pixels" ? own : options.documentDefault;
    options.apply(next === "document" ? null : next === "pixels" ? (target === "image" ? "pixels" : null) : startCalibration(next, current));
  });
  setTip(choiceRow, target === "image" ? "Lengths and areas of this image are reported in these units; pixels never change." : "The calibration of images that follow the document's default.");
  section.append(choiceRow);

  if (own && own !== "pixels") renderFields(section, own, options);
  else if (choice === "document") {
    const row = createRow("Default", calibrationSummary(options.documentDefault));
    setTip(row, "Set the default with nothing selected.");
    section.append(row);
  }
  // Use selected line is the section's action only while a line is selected; drawing one is the Line tool's.
  if (target === "image" && options.useLine && options.selectedLine) {
    const line = options.selectedLine;
    const use = createButton({ label: "Use selected line", disabled: !line, onClick: () => { if (line) options.useLine!(line.id); } });
    setTip(use, line ? `Take the pixel length from ${line.name}, then enter its real length; the scale follows the line.` : "Draw a line over a scale bar with the Line tool and select it.");
    actionsFirst(section, createButtonGroup([use]));
  }
  if (options.result) {
    const { scale, widthPx, heightPx } = options.result;
    section.append(createRow("Pixel size", pixelSizeText(scale)));
    section.append(createRow("Size", `${formatMeasure(widthPx * scale.x)} × ${formatLength(heightPx * scale.y, scale.unit)}`));
  }
}

/** The fields of a known length or a scale, then the unit and the aspect ratio. */
function renderFields(section: HTMLElement, calibration: Calibration, options: CalibrationViewOptions): void {
  const change = (patch: Partial<Calibration>, label: string) => {
    const next = { ...calibration, ...patch };
    const problem = calibrationProblem(next);
    if (problem) { options.report(`Invalid ${label}. ${problem}`); return; }
    options.apply(next);
  };
  const field = (label: string, key: "pixelLength" | "realLength" | "aspect", unit: string, tip: string) => {
    const row = createUnitField({
      label, unit, value: calibration[key],
      format: (value, u) => (u ? formatLength(value, u) : formatMeasure(value)), parse: parsePositive,
      apply: (value) => change({ [key]: value }, label.toLowerCase()), reportError: options.report,
      invalidMessage: `Invalid ${label.toLowerCase()}. Enter a number above 0.`,
    }).row;
    setTip(row, tip);
    section.append(row);
  };
  if (calibration.mode === "known" && calibration.line !== undefined) {
    const row = createRow("Pixel length", `${formatMeasure(calibration.pixelLength)} px`);
    setTip(row, "The length of the line, in pixels along x of the original image; it follows the line.");
    section.append(row, createRow("From line", options.followedLine ?? "Removed"));
    field("Real length", "realLength", calibration.unit, "The real length of the line, such as the length printed on a scale bar.");
  } else if (calibration.mode === "known") {
    field("Pixel length", "pixelLength", "px", "A distance on the original image, in pixels along x, such as a scale bar.");
    field("Real length", "realLength", calibration.unit, "The real length of that distance.");
  } else {
    field("Per pixel", "realLength", calibration.unit, "The real width of one pixel.");
  }
  section.append(selectField("Unit", LENGTH_UNITS.map((value): [LengthUnit, string] => [value, value]), calibration.unit, (unit) => change({ unit }, "unit")));
  field("Aspect ratio", "aspect", "", "The height of a pixel over its width; 1 for square pixels.");
}
