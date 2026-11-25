// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Colour spaces and colour thresholds (IMAGE-ANALYSIS.md, Colour thresholds; roadmap I11). A colour threshold keeps
// the pixels of an RGB working image whose three components, in one colour model, each lie in a range, both ends
// included. The models and their units:
//   RGB     red, green and blue, 0 to 255 (a 16-bit image is read as v · 255 / 65535, not rounded)
//   HSB     hue in degrees, 0 to 360; saturation and brightness in percent, 0 to 100. B = max, S = (max − min) / max,
//           hue from the largest component, as Photoshop and ImageJ's HSB stack define them; a grey pixel has hue 0
//   CIELAB  L* 0 to 100, a* and b* about −128 to 127, from sRGB (IEC 61966-2-1: the inverse companding
//           ((c + 0.055) / 1.055)^2.4 above 0.04045, c / 12.92 below) to XYZ with the sRGB D65 matrix, then CIE 1976
//           L*a*b* with the D65 white point (the matrix's image of white), ε = 216/24389 and κ = 24389/27
// A hue range whose low end is above its high end wraps through 0°, so that reds (350° to 10°) can be kept.
import { maxValue, type Raster } from "./raster";

export type ColourModel3 = "rgb" | "hsb" | "lab";
export const COLOUR_MODELS: readonly ColourModel3[] = ["rgb", "hsb", "lab"];
export type Range = [low: number, high: number];
/** The full range of each component, per model; a new range starts at these. */
export const MODEL_LIMITS: Record<ColourModel3, [Range, Range, Range]> = {
  rgb: [[0, 255], [0, 255], [0, 255]],
  hsb: [[0, 360], [0, 100], [0, 100]],
  lab: [[0, 100], [-128, 127], [-128, 127]],
};
export const COMPONENT_NAMES: Record<ColourModel3, [string, string, string]> = {
  rgb: ["Red", "Green", "Blue"], hsb: ["Hue (°)", "Saturation (%)", "Brightness (%)"], lab: ["L*", "a*", "b*"],
};

// MARK: conversions (r, g, b from 0 to 255, not necessarily whole)

export function rgbToHsb(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return [h, max > 0 ? (d / max) * 100 : 0, (max / 255) * 100];
}

const linear = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
// The white point is the matrix's own image of sRGB white (its row sums, 0.9504700, 1.0000001, 1.0888300: D65), so
// that white is exactly L* 100, a* 0, b* 0.
const WHITE = [0.4124564 + 0.3575761 + 0.1804375, 0.2126729 + 0.7151522 + 0.0721750, 0.0193339 + 0.1191920 + 0.9503041] as const;
const EPSILON = 216 / 24389, KAPPA = 24389 / 27;
const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = linear(r), G = linear(g), B = linear(b);
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = 0.0193339 * R + 0.1191920 * G + 0.9503041 * B;
  const fx = f(X / WHITE[0]), fy = f(Y / WHITE[1]), fz = f(Z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function convert(model: ColourModel3, r: number, g: number, b: number): [number, number, number] {
  return model === "rgb" ? [r, g, b] : model === "hsb" ? rgbToHsb(r, g, b) : rgbToLab(r, g, b);
}

// MARK: ranges and masks

/** Whether a value lies in a range; a hue range with low above high wraps through 0°. */
export function inRange(value: number, [low, high]: Range, wraps: boolean): boolean {
  return wraps && low > high ? value >= low || value <= high : value >= low && value <= high;
}

export function colourRangesProblem(model: ColourModel3, ranges: readonly Range[]): string | null {
  if (!COLOUR_MODELS.includes(model)) return "The colour model is RGB, HSB or CIELAB.";
  if (ranges.length !== 3 || !ranges.every((range) => Array.isArray(range) && range.length === 2 && range.every(Number.isFinite))) return "A colour threshold needs a low and a high value for each of three components.";
  for (let k = 0; k < 3; k++) {
    const [lo, hi] = ranges[k], [min, max] = MODEL_LIMITS[model][k];
    if (lo < min || hi > max || lo > max || hi < min) return `${COMPONENT_NAMES[model][k]} takes values from ${min} to ${max}.`;
    if (lo > hi && !(model === "hsb" && k === 0)) return `The low ${COMPONENT_NAMES[model][k]} value must not be above the high one.`;
  }
  return null;
}

/** The mask of an RGB image's pixels inside all three ranges. A table per possible value keeps 8-bit HSB and Lab fast. */
export function colourMask(raster: Raster, model: ColourModel3, ranges: readonly Range[]): Uint8Array {
  if (raster.channels !== 3) throw new Error("A colour threshold needs a colour image.");
  const n = raster.widthPx * raster.heightPx, mask = new Uint8Array(n), d = raster.data;
  const k = 255 / maxValue(raster.bitDepth);
  const memo = model !== "rgb" && raster.bitDepth === 8 ? new Map<number, number>() : null;
  for (let p = 0; p < n; p++) {
    const r = d[3 * p], g = d[3 * p + 1], b = d[3 * p + 2];
    const key = memo ? (r << 16) | (g << 8) | b : 0;
    const known = memo?.get(key);
    if (known !== undefined) { mask[p] = known; continue; }
    const [c0, c1, c2] = convert(model, r * k, g * k, b * k);
    const inside = inRange(c0, ranges[0], model === "hsb") && inRange(c1, ranges[1], false) && inRange(c2, ranges[2], false) ? 1 : 0;
    memo?.set(key, inside);
    mask[p] = inside;
  }
  return mask;
}

// MARK: the picker

/**
 * The mean colour of the pixels in a square of side `size` (odd, at least 1) centred on pixel (x, y), cut to the
 * image, in 0 to 255 per component; null outside the image or on a grey image.
 */
export function sampleColour(raster: Raster, x: number, y: number, size = 1): [number, number, number] | null {
  if (raster.channels !== 3) return null;
  const cx = Math.floor(x), cy = Math.floor(y), half = Math.floor(Math.max(1, size) / 2);
  if (cx < 0 || cy < 0 || cx >= raster.widthPx || cy >= raster.heightPx) return null;
  const k = 255 / maxValue(raster.bitDepth);
  let n = 0, r = 0, g = 0, b = 0;
  for (let yy = Math.max(0, cy - half); yy <= Math.min(raster.heightPx - 1, cy + half); yy++) {
    for (let xx = Math.max(0, cx - half); xx <= Math.min(raster.widthPx - 1, cx + half); xx++) {
      const i = 3 * (yy * raster.widthPx + xx);
      r += raster.data[i]; g += raster.data[i + 1]; b += raster.data[i + 2]; n++;
    }
  }
  return [(r / n) * k, (g / n) * k, (b / n) * k];
}

/**
 * Ranges around a picked colour: each component ± `tolerance` percent of its model's full span, cut to the limits
 * (a hue range wraps instead). The picked colour always lies inside its own ranges.
 */
export function rangesAround(model: ColourModel3, rgb: readonly [number, number, number], tolerance: number): [Range, Range, Range] {
  const values = convert(model, rgb[0], rgb[1], rgb[2]);
  return values.map((value, k) => {
    const [min, max] = MODEL_LIMITS[model][k], reach = ((max - min) * Math.max(0, tolerance)) / 100;
    if (model === "hsb" && k === 0) {
      if (reach >= 180) return [0, 360];
      const lo = (value - reach + 360) % 360, hi = (value + reach) % 360;
      return [Math.floor(lo * 100) / 100, Math.min(360, Math.ceil(hi * 100) / 100)];
    }
    // Rounded outwards, so that the picked value is not lost to rounding.
    return [Math.max(min, Math.floor((value - reach) * 100) / 100), Math.min(max, Math.ceil((value + reach) * 100) / 100)];
  }) as [Range, Range, Range];
}
