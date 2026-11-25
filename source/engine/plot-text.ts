// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A plot's text (2026-11-17): its sizes, whether the plot's look follows its size (2026-11-21: text, lines, markers
// and caps together), and its fonts, set for the app in
// Settings › Plots › Text. By default the title is 11 pt and the rest 10 pt at every plot size, set in Libertinus
// Serif with Libertinus Math for mathematics, the shared content fonts of the family, so that a figure matches
// the report it goes into. The fonts are the shell's choice (`font-choice`, forge-shell 4.7.0): it ships both, and a font
// that is not there falls back to them and then to the system's serif.
import { FONT_FALLBACK, fontFamily, isFontName } from "forge-shell/app/font-choice";

export type PlotTextSizing = "fixed" | "scaled";

export interface PlotText {
  titlePt: number;
  /** Every other text: axis titles, tick labels, the legend, equations, data labels and callouts. */
  textPt: number;
  /**
   * "fixed": text, lines, markers, caps and spacing keep their sizes in points at every plot size, as a journal
   * figure's; "scaled": all of them grow and shrink together with the plot from 480 × 320 (Scale with plot size).
   */
  sizing: PlotTextSizing;
  font: string;
  mathFont: string;
}

export const BUILT_IN_PLOT_TEXT: PlotText = { titlePt: 11, textPt: 10, sizing: "fixed", font: FONT_FALLBACK.text.shipped, mathFont: FONT_FALLBACK.math.shipped };
export const PLOT_TEXT_SIZES: readonly number[] = [7, 8, 9, 10, 11, 12, 14, 16];

const isSize = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 5 && value <= 36;

/** The settings a person changed, keeping only values that can be used. */
export function cleanPlotText(raw: unknown): Partial<PlotText> {
  const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    ...(isSize(item.titlePt) ? { titlePt: item.titlePt } : {}), ...(isSize(item.textPt) ? { textPt: item.textPt } : {}),
    ...(item.sizing === "fixed" || item.sizing === "scaled" ? { sizing: item.sizing } : {}),
    ...(isFontName(item.font) ? { font: item.font.trim() } : {}), ...(isFontName(item.mathFont) ? { mathFont: item.mathFont.trim() } : {}),
  };
}

let current: PlotText = BUILT_IN_PLOT_TEXT;

/** The text settings plots are drawn with now. */
export const plotText = (): PlotText => current;

/** Draw plots with these settings (the app's, over the built-in ones); the caller draws them again. */
export function setPlotText(settings: Partial<PlotText>): void {
  current = { ...BUILT_IN_PLOT_TEXT, ...cleanPlotText(settings) };
}


/** Text set as mathematics: an equation, or a power of ten written with superscripts. */
const MATH = /[=⁰¹²³⁴⁵⁶⁷⁸⁹⁻×±√]/;

/** The font family a plot's text is set in: the maths font for mathematics, else the text font. */
export function textFamily(text: string): string {
  return MATH.test(text) ? fontFamily(current.mathFont, "math") : fontFamily(current.font, "text");
}

/** The text and maths font families plot text is set in now. */
export const textFamilies = (): { text: string; math: string } => ({ text: fontFamily(current.font, "text"), math: fontFamily(current.mathFont, "math") });

/**
 * How much a plot's text grows with it, given the scale it is drawn at (`drawScale`, which is already 1 while sizes are
 * fixed): text follows the same scale as the lines, markers and spacing.
 */
export const textScale = (scale: number): number => scale;
