// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Settings layers (IMAGE-ANALYSIS.md, Settings layers; roadmap I8), the same layering as plot styling: a built-in
// default, then the app setting, then a per-image or per-export override. Every option reports its value in effect and
// the layer it comes from, so that the inspector can mark overrides; resetting removes an override, or all of them.
import { DEFAULT_MEASUREMENTS, MEASURE_KEYS, type MeasureKey } from "./measure";
import { GREY_METHODS, type GreyMethod } from "./steps";
import { THRESHOLD_METHODS, type ThresholdMethod } from "./threshold";
import { MASK_COLOURS, type MaskColour } from "./phases";
import { DEFAULT_EXPORT, isScaleBarLength, MAX_SCALE_BAR_BLOCKS, OVERWRITE_CHOICES, SCALE_BAR_PLACES, SCALE_BAR_SIZES, SCALE_BAR_STYLES, type ExportOptions, type ScaleBarPlace } from "./export";

// MARK: the layers

export type Layer = "built-in" | "app" | "override";
export interface Resolved<T> { value: T; from: Layer }

/** Each option of `builtIn` resolved through the app settings and the overrides: the last layer that sets it wins. */
export function resolveLayers<T extends object>(builtIn: T, app: Partial<T>, override: Partial<T>): { [K in keyof T]: Resolved<T[K]> } {
  const out = {} as { [K in keyof T]: Resolved<T[K]> };
  for (const key of Object.keys(builtIn) as (keyof T)[]) {
    out[key] = key in override && override[key] !== undefined ? { value: override[key] as T[keyof T], from: "override" }
      : key in app && app[key] !== undefined ? { value: app[key] as T[keyof T], from: "app" }
      : { value: builtIn[key], from: "built-in" };
  }
  return out;
}

/** The values in effect, without their layers. */
export function effective<T extends object>(builtIn: T, app: Partial<T>, override: Partial<T>): T {
  const resolved = resolveLayers(builtIn, app, override);
  return Object.fromEntries(Object.entries(resolved).map(([key, item]) => [key, (item as Resolved<unknown>).value])) as T;
}

/** Remove one override, so that the option follows the app setting again. */
export function resetOverride<T extends object>(override: Partial<T>, key: keyof T): Partial<T> {
  const next = { ...override };
  delete next[key];
  return next;
}

/** Set an override; a value equal to what the layers below give is not an override, so it is removed. */
export function setOverride<T extends object>(builtIn: T, app: Partial<T>, override: Partial<T>, key: keyof T, value: T[keyof T]): Partial<T> {
  const below = resolveLayers(builtIn, app, {})[key].value;
  return JSON.stringify(below) === JSON.stringify(value) ? resetOverride(override, key) : { ...override, [key]: value };
}

// MARK: the image options


export interface ImageSettings {
  /** The method a new Convert to grey step starts with. */
  greyMethod: GreyMethod;
  /** The method a threshold starts with when one is turned on without naming one. */
  thresholdMode: "manual" | ThresholdMethod;
  maskColour: MaskColour;
  measurements: MeasureKey[];
  /** Grey statistics over the masked pixels only (measure.ts, Limit to threshold). */
  limitToThreshold: boolean;
  /** Decimal places in the Results pane, 0 to 9; null: four significant digits. The CSV keeps every digit. */
  decimals: number | null;
}

/** IMAGE-ANALYSIS.md, Settings layers: luminance, manual, a palette colour each, area, area fraction and mean grey. */
export const BUILT_IN_IMAGE: ImageSettings = {
  greyMethod: "luminance", thresholdMode: "otsu", maskColour: "magenta", measurements: [...DEFAULT_MEASUREMENTS],
  limitToThreshold: false, decimals: null,
};

/** The export options' built-in defaults (IMAGE-ANALYSIS.md): PNG, quality 90, no overlays, ask. */
export const BUILT_IN_EXPORT: ExportOptions = { ...DEFAULT_EXPORT };

// MARK: checking stored layers

/** Stored image settings (an app layer or an override), each value checked; anything invalid is left out, so it falls through. */
export function cleanImageSettings(raw: unknown): Partial<ImageSettings> {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Partial<ImageSettings> = {};
  if (GREY_METHODS.includes(data.greyMethod as GreyMethod)) out.greyMethod = data.greyMethod as GreyMethod;
  if (data.thresholdMode === "manual" || THRESHOLD_METHODS.includes(data.thresholdMode as ThresholdMethod)) out.thresholdMode = data.thresholdMode as ImageSettings["thresholdMode"];
  if (typeof data.maskColour === "string" && data.maskColour in MASK_COLOURS) out.maskColour = data.maskColour as MaskColour;
  if (Array.isArray(data.measurements) && data.measurements.every((key) => MEASURE_KEYS.includes(key))) out.measurements = MEASURE_KEYS.filter((key) => (data.measurements as string[]).includes(key));
  if (typeof data.limitToThreshold === "boolean") out.limitToThreshold = data.limitToThreshold;
  if (data.decimals === null || (Number.isInteger(data.decimals) && (data.decimals as number) >= 0 && (data.decimals as number) <= 9)) out.decimals = data.decimals as number | null;
  return out;
}

/** Stored export settings (the app layer or a per-export override), each value checked. */
export function cleanExportSettings(raw: unknown): Partial<ExportOptions> {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Partial<ExportOptions> = {};
  if (data.format === "png" || data.format === "jpeg") out.format = data.format;
  if (Number.isInteger(data.jpegQuality) && (data.jpegQuality as number) >= 1 && (data.jpegQuality as number) <= 100) out.jpegQuality = data.jpegQuality as number;
  if (typeof data.includeOverlays === "boolean") out.includeOverlays = data.includeOverlays;
  if (SCALE_BAR_PLACES.includes(data.scaleBar as ScaleBarPlace)) out.scaleBar = data.scaleBar as ScaleBarPlace;
  if (SCALE_BAR_STYLES.includes(data.scaleBarStyle as ExportOptions["scaleBarStyle"])) out.scaleBarStyle = data.scaleBarStyle as ExportOptions["scaleBarStyle"];
  if (data.scaleBarLength === null || isScaleBarLength(data.scaleBarLength)) out.scaleBarLength = data.scaleBarLength as number | null;
  if (Number.isInteger(data.scaleBarBlocks) && (data.scaleBarBlocks as number) >= 1 && (data.scaleBarBlocks as number) <= MAX_SCALE_BAR_BLOCKS) out.scaleBarBlocks = data.scaleBarBlocks as number;
  if (SCALE_BAR_SIZES.includes(data.scaleBarSize as ExportOptions["scaleBarSize"])) out.scaleBarSize = data.scaleBarSize as ExportOptions["scaleBarSize"];
  if (OVERWRITE_CHOICES.includes(data.overwrite as ExportOptions["overwrite"])) out.overwrite = data.overwrite as ExportOptions["overwrite"];
  return out;
}
