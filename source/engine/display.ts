// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Display (IMAGE-ANALYSIS.md, Display; roadmap I12 and I22). How the working image is drawn: a display range and a
// lookup table. Display never changes the working image's values, its measurements or exports of its data.
//
// - Display range: the values from min to max are spread over the 256 display levels, t = (v − min) / (max − min)
//   clipped to [0, 1], level round(255 · t). Brightness moves the range, contrast narrows or widens it about its
//   centre. Without a range, the whole depth is shown (0 to M).
// - Lookup tables colour a grey image's levels: Grays, Inverted, Black and white (a split at the middle of the range),
//   Fire, Ice and Spectrum, and Custom (two to five colours spread evenly). Colour stops are joined linearly in RGB;
//   Spectrum is the hue circle from red (0°) to magenta (300°) at full saturation and value. A colour image keeps its
//   own colours, each channel through the display range.
// - Auto range: the range that leaves `saturated` percent of the pixels outside it, half at each end, as ImageJ's
//   Auto does with 0.35%.
import { maxValue, type Raster } from "./raster";

export type LutName = "grays" | "inverted" | "blackWhite" | "fire" | "ice" | "spectrum" | "custom";
export const LUT_NAMES: readonly LutName[] = ["grays", "inverted", "blackWhite", "fire", "ice", "spectrum", "custom"];

export interface DisplaySettings {
  lut: LutName;
  /** The display range, in the image's values; null shows the whole depth. */
  min: number | null;
  max: number | null;
  /** Custom's colours, `#rrggbb`, two to five. */
  stops: string[];
}

export const DEFAULT_DISPLAY: DisplaySettings = { lut: "grays", min: null, max: null, stops: ["#000000", "#ffffff"] };

/** Colour stops of the named tables, evenly spread from level 0 to 255. */
const STOPS: Record<Exclude<LutName, "spectrum" | "custom" | "blackWhite">, string[]> = {
  grays: ["#000000", "#ffffff"],
  inverted: ["#ffffff", "#000000"],
  fire: ["#000000", "#5a0096", "#d2262a", "#ffa500", "#ffffff"],
  ice: ["#000000", "#102c78", "#1ea0dc", "#c8f5ff"],
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Why display settings cannot be used, or null. */
export function displayProblem(display: DisplaySettings, bitDepth: 8 | 16): string | null {
  if (!LUT_NAMES.includes(display.lut)) return "The lookup table is not known.";
  const M = maxValue(bitDepth);
  if ((display.min === null) !== (display.max === null)) return "The display range needs both ends.";
  if (display.min !== null && display.max !== null && !(display.min >= 0 && display.max <= M && display.min < display.max)) return `The display range runs from 0 to ${M}, its low end below its high end.`;
  if (display.stops.length < 2 || display.stops.length > 5 || !display.stops.every((stop) => HEX.test(stop))) return "A custom table has two to five colours, written #rrggbb.";
  return null;
}

const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];

/** 256 colours, red, green and blue for each display level. */
export function lutColours(display: Pick<DisplaySettings, "lut" | "stops">): Uint8Array {
  const table = new Uint8Array(256 * 3);
  for (let level = 0; level < 256; level++) {
    const t = level / 255;
    let rgb: [number, number, number];
    if (display.lut === "spectrum") rgb = hueColour(t * 300);
    else if (display.lut === "blackWhite") rgb = level < 128 ? [0, 0, 0] : [255, 255, 255];
    else {
      const stops = (display.lut === "custom" ? display.stops : STOPS[display.lut]).map(rgbOf);
      const at = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(at)), f = at - i;
      rgb = [0, 1, 2].map((k) => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f)) as [number, number, number];
    }
    table.set(rgb, level * 3);
  }
  return table;
}

/** A hue in degrees at full saturation and value, as 8-bit RGB. */
function hueColour(degrees: number): [number, number, number] {
  const h = degrees / 60, x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** The display level of a value: round(255 · t), t clipped to [0, 1]. */
export function displayLevel(v: number, min: number, max: number): number {
  const t = (v - min) / (max - min);
  return Math.round(255 * (t < 0 ? 0 : t > 1 ? 1 : t));
}

/** Eight-bit RGBA of a raster as displayed. */
export function displayRgba(raster: Raster, display: DisplaySettings = DEFAULT_DISPLAY): Uint8ClampedArray {
  const { widthPx: W, heightPx: H, channels, data } = raster;
  const M = maxValue(raster.bitDepth);
  const min = display.min ?? 0, max = display.max ?? M;
  // One level per possible value.
  const levels = new Uint8Array(M + 1);
  for (let v = 0; v <= M; v++) levels[v] = displayLevel(v, min, max);
  const out = new Uint8ClampedArray(W * H * 4);
  if (channels === 1) {
    const table = lutColours(display);
    for (let p = 0; p < W * H; p++) {
      const level = levels[data[p]] * 3, o = p * 4;
      out[o] = table[level]; out[o + 1] = table[level + 1]; out[o + 2] = table[level + 2]; out[o + 3] = 255;
    }
  } else {
    for (let p = 0; p < W * H; p++) {
      const s = p * 3, o = p * 4;
      out[o] = levels[data[s]]; out[o + 1] = levels[data[s + 1]]; out[o + 2] = levels[data[s + 2]]; out[o + 3] = 255;
    }
  }
  return out;
}

/** The range leaving `saturated` percent of the counted values outside, half at each end; null for an empty or flat image. */
export function autoRange(counts: ArrayLike<number>, saturated = 0.35): { min: number; max: number } | null {
  let total = 0;
  for (let v = 0; v < counts.length; v++) total += counts[v];
  if (!total) return null;
  const cut = (total * saturated) / 200;
  let seen = 0, min = 0, max = counts.length - 1;
  for (let v = 0; v < counts.length; v++) { seen += counts[v]; if (seen > cut) { min = v; break; } }
  seen = 0;
  for (let v = counts.length - 1; v >= 0; v--) { seen += counts[v]; if (seen > cut) { max = v; break; } }
  return min < max ? { min, max } : null;
}

// MARK: reading and writing

/** Display settings from a document, checked; absent is the default. Throws a sentence otherwise. */
export function parseDisplay(raw: unknown, bitDepth: 8 | 16): DisplaySettings | undefined {
  if (raw === undefined || raw === null) return undefined;
  const data = raw as Record<string, unknown>;
  const display: DisplaySettings = {
    lut: data.lut as LutName, min: (data.min ?? null) as number | null, max: (data.max ?? null) as number | null,
    stops: Array.isArray(data.stops) ? data.stops.map(String) : [...DEFAULT_DISPLAY.stops],
  };
  if ((display.min !== null && typeof display.min !== "number") || (display.max !== null && typeof display.max !== "number")) throw new Error("The display range is not two numbers.");
  const problem = displayProblem(display, bitDepth);
  if (problem) throw new Error(problem);
  return display;
}

/** Display settings in a fixed field order; Custom's colours only when the table is Custom. */
export function displayRecord(display: DisplaySettings): Record<string, unknown> {
  return { lut: display.lut, min: display.min, max: display.max, ...(display.lut === "custom" ? { stops: [...display.stops] } : {}) };
}
