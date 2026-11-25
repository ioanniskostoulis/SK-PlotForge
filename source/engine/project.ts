// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The PlotForge document (.pfg): JSON with a format name and version, the grid, and the images placed on the work
// surface with their step lists. A document links to its images and never contains or changes them; their paths are
// stored relative to the document's folder. The project is always this one .pfg file; exports are separate files.
//
// Format versions: 1 (2026-11-06) images and grid; 2 (2026-11-07, unreleased) adds each image's `steps` and
// `calibration`, `rois`, `threshold` and `settings` (its overrides of the app's image settings), and the document's
// default `calibration` and `results`. An image stored with a `measurements` list (an earlier draft of format 2) takes
// it as its measurement override. A version 1 document opens with no steps and no calibration
// and is written as version 2 when it is saved. An image's thresholds are a Threshold step in its step list
// (2026-11-14); an image stored with `phases`, or the older single `threshold`, opens with them turned into a
// Threshold step and the mask steps after it, which make the same masks. A document may link data files (`data`,
// 2026-11-15: CSV and other delimited text, Excel workbooks; data.ts), written only when it has some, so a document
// without data keeps its bytes. Plots of that data (`plots`, 2026-11-15; plot.ts) are written the same way.
import type { ColourModel, ImageFormat, ImageInfo } from "./image-format";
import { readImageInfo } from "./image-format";
import { jpegOrientation, swapsSides } from "./orientation";
import { crc32 } from "./checksum";
import { basename, dirname, relativePath, resolvePath, stem } from "./paths";
import { calibrationRecord, CalibrationError, linePixelLength, parseCalibration, parseImageCalibration, type Calibration, type ImageCalibration } from "./calibration";
import { parseRoi, roiRecord, RoiError, type Roi } from "./roi";
import { parseThreshold, thresholdRecord, ThresholdError, type Threshold } from "./threshold";
import { MEASURE_KEYS, VALUE_KEYS, type MeasureKey, type MeasureValues, type ResultRow } from "./measure";
import { cleanImageSettings, type ImageSettings } from "./settings-layers";
import { displayRecord, parseDisplay, type DisplaySettings } from "./display";
import { LENGTH_UNITS } from "./calibration";
import { MASK_COLOURS, parsePhases, PhaseError, MASK_DISPLAYS, type MaskDisplay, type Phase } from "./phases";
import { densityRecord, parseDensity, DensityError, type DensityStandard } from "./density";
import { labelRecord, parseLabels, LabelError, type TextLabel } from "./overlay";
import { parseColumnSettings, parseRead, readRecord, DATA_EXTENSIONS, type ProjectData } from "./data";
import { DataError } from "./table";
import { parsePlots, PlotError, plotRecord, type ProjectPlot } from "./plot";
import { NamedRangeError, parseRanges, rangeRecord, type NamedRange } from "./ranges";
import { parseStep, rangeOnly, stepRecord, StepError, traceShapes, type MaskStep, type Shape, type Step } from "./steps";

export const PROJECT_FORMAT = "plotforge";
export const PROJECT_VERSION = 2;
export const PROJECT_EXTENSION = "pfg";
/** The spacing of the dot grid in content pixels; the same 16 px as the shell's welcome surface. */
export const GRID_SPACING = 16;

/** What a document records about the original image it links to. */
export interface ImageSource {
  format: ImageFormat;
  widthPx: number;
  heightPx: number;
  bitDepth: number;
  colour: ColourModel;
  channels: number;
  /** File size in bytes. */
  bytes: number;
  crc32: string;
  /** EXIF orientation of a JPEG, 1 to 8 (1: as stored). Width and height above are of the upright image. */
  orientation: number;
}

export interface ProjectImage {
  id: string;
  name: string;
  /** Absolute path of the original while the document is open; null when the browser preview gives no path, or for an embedded image. */
  path: string | null;
  /**
   * The bytes of an image kept inside the document (a pasted image, which has no file of its own), written as base64.
   * Like a linked original, they are never changed.
   */
  embedded?: Uint8Array;
  /** File name of the original. */
  file: string;
  /** Position and display size on the work surface, in content pixels; the size follows the result of the steps. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * How far the image is turned on the work surface, in degrees clockwise about its centre (−180 to 180); absent: upright.
   * Placement only: its pixels, regions and measurements are those of the upright result.
   */
  angle?: number;
  source: ImageSource;
  /** The step list, in order; applied to a copy of the original when it is shown, measured or exported. */
  steps: Step[];
  /** The image's own calibration, "pixels", or null to follow the document's default. */
  calibration: ImageCalibration;
  /** Regions of interest, in pixels of the result of the steps, in the order they were drawn. */
  rois: Roi[];
  /** How the phases' masks are drawn (phases.ts, display only); absent: each phase in its colour. */
  maskDisplay?: MaskDisplay;
  /** This image's overrides of the app's image settings (grey method, threshold mode, colours, measurements). */
  settings: Partial<ImageSettings>;
  /** How the image is drawn (display.ts): a lookup table and a display range; absent draws it plainly. Never changes values. */
  display?: DisplaySettings;
  /** A density standard (density.ts): grey values with known optical densities, fitted; absent: uncalibrated OD. */
  density?: DensityStandard;
  /** Overlay text (overlay.ts), in pixels of the result of the steps; absent: none. */
  labels?: TextLabel[];
}

export interface Project {
  grid: { snap: boolean; spacing: number };
  /** The results table: one row per measurement, each with the record it was measured from. */
  results: ResultRow[];
  /** The default calibration of the document's images; null: pixels. */
  calibration: Calibration | null;
  images: ProjectImage[];
  /** Data files the document links to, read-only; their tables are made from the files when the document opens. */
  data: ProjectData[];
  /** Plots of the data (plot.ts), drawn on the work surface after the worksheets; written only when there are some. */
  plots: ProjectPlot[];
  /** Named ranges of the worksheets' cells (ranges.ts); written only when there are some. */
  ranges: NamedRange[];
}

export class ProjectError extends Error {}

export function emptyProject(): Project {
  return { grid: { snap: true, spacing: GRID_SPACING }, calibration: null, images: [], data: [], plots: [], ranges: [], results: [] };
}

/** Only a document path may be written: a path that does not end in .pfg is refused, an image above all. */
export function isWritableProjectPath(path: string): boolean {
  return new RegExp(`\\.${PROJECT_EXTENSION}$`, "i").test(path);
}

// MARK: importing an image

export interface ImportedImage { info: ImageInfo; source: ImageSource }

/** What a document records about an image file, read from its bytes; the bytes are not changed. A JPEG's size is upright. */
export function describeImage(bytes: Uint8Array): ImportedImage {
  const info = readImageInfo(bytes);
  const orientation = info.format === "jpeg" ? jpegOrientation(bytes) : 1;
  const [widthPx, heightPx] = swapsSides(orientation) ? [info.heightPx, info.widthPx] : [info.widthPx, info.heightPx];
  return { info, source: { format: info.format, widthPx, heightPx, bitDepth: info.bitDepth, colour: info.colour, channels: info.channels, bytes: bytes.length, crc32: crc32(bytes), orientation } };
}

/** A new image object at (x, y), shown at its pixel size; the id is unique within the project. */
export function newProjectImage(project: Project, path: string | null, file: string, source: ImageSource, x: number, y: number): ProjectImage {
  const used = new Set(project.images.map((image) => image.id));
  let n = project.images.length + 1;
  while (used.has(`image-${n}`)) n++;
  const names = new Set(project.images.map((image) => image.name.toLowerCase()));
  const base = stem(file) || "Image";
  let name = base, copy = 2;
  while (names.has(name.toLowerCase())) name = `${base} ${copy++}`;
  return { id: `image-${n}`, name, path, file, x, y, width: source.widthPx, height: source.heightPx, source, steps: [], calibration: null, rois: [], settings: {} };
}

/**
 * Keep a calibration taken from a line region in step with the line: its pixel length follows the line's length
 * after every edit. When the line is removed or is no longer a line, the calibration keeps its last pixel length and
 * stops following. Returns whether anything changed.
 */
export function followCalibrationLine(image: ProjectImage): boolean {
  const own = image.calibration;
  if (!own || own === "pixels" || own.line === undefined) return false;
  const roi = image.rois.find((item) => item.id === own.line);
  if (!roi || roi.type !== "line") { delete own.line; return true; }
  const length = linePixelLength(roi.points, image.steps, own.aspect);
  if (!(length > 0) || length === own.pixelLength) return false;
  own.pixelLength = length;
  return true;
}

// MARK: the working image's shape

/**
 * The shape of the working image from what the document records, without decoding it: grey stays grey, colour and
 * palettes become RGB, and 16 bits stay 16 (a palette is 8). It matches `decodeImage`, which the tests check.
 */
export function workingShape(source: ImageSource): Shape {
  const grey = source.colour === "grey" || source.colour === "grey-alpha";
  return { widthPx: source.widthPx, heightPx: source.heightPx, channels: grey ? 1 : 3, bitDepth: source.bitDepth === 16 && source.colour !== "palette" ? 16 : 8 };
}

/** The display size of an image after its steps: one content pixel per pixel of the result. */
export function resultSize(image: Pick<ProjectImage, "source" | "steps">): { width: number; height: number } {
  const result = traceShapes(workingShape(image.source), image.steps).at(-1)!;
  return { width: result.widthPx, height: result.heightPx };
}

// MARK: reading and writing

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard base64 (RFC 4648), with padding. */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63] + (i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? BASE64[n & 63] : "=");
  }
  return out;
}

/** Bytes from standard base64; null when the text is not base64. */
export function fromBase64(text: string): Uint8Array | null {
  if (text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  const pad = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  for (let i = 0, o = 0; i < text.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((acc, k) => (acc << 6) | (text[i + k] === "=" ? 0 : BASE64.indexOf(text[i + k])), 0);
    for (const shift of [16, 8, 0]) if (o < out.length) out[o++] = (n >> shift) & 255;
  }
  return out;
}

/** The document as text. Image paths are written relative to `projectPath`'s folder when it is known. */
export function serializeProject(project: Project, projectPath: string | null): string {
  const folder = projectPath ? dirname(projectPath) : null;
  const document = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    grid: { snap: project.grid.snap, spacing: project.grid.spacing },
    calibration: project.calibration ? calibrationRecord(project.calibration) : null,
    images: project.images.map((image) => ({
      id: image.id,
      name: image.name,
      path: image.embedded ? null : image.path && folder ? relativePath(folder, image.path) : image.path ?? image.file,
      ...(image.embedded ? { file: image.file } : {}),
      x: image.x, y: image.y, width: image.width, height: image.height,
      ...(image.angle ? { angle: image.angle } : {}),
      // Fields in a fixed order, so that reading and writing again gives the same bytes.
      source: {
        format: image.source.format, widthPx: image.source.widthPx, heightPx: image.source.heightPx, bitDepth: image.source.bitDepth,
        colour: image.source.colour, channels: image.source.channels, bytes: image.source.bytes, crc32: image.source.crc32,
        orientation: image.source.orientation,
      },
      steps: image.steps.map(stepRecord),
      calibration: image.calibration === null || image.calibration === "pixels" ? image.calibration : calibrationRecord(image.calibration),
      rois: image.rois.map(roiRecord),
      ...(image.maskDisplay && image.maskDisplay !== "colours" ? { maskDisplay: image.maskDisplay } : {}),
      settings: settingsRecord(image.settings),
      ...(image.display ? { display: displayRecord(image.display) } : {}),
      ...(image.density ? { density: densityRecord(image.density) } : {}),
      ...(image.labels?.length ? { labels: image.labels.map(labelRecord) } : {}),
      ...(image.embedded ? { embedded: toBase64(image.embedded) } : {}),
    })),
    ...(project.data.length ? { data: project.data.map((data) => ({
      id: data.id, name: data.name,
      path: data.path && folder ? relativePath(folder, data.path) : data.path ?? data.file,
      x: data.x, y: data.y, width: data.width, height: data.height,
      source: { format: data.source.format, bytes: data.source.bytes, crc32: data.source.crc32 },
      read: readRecord(data.read),
      columns: data.columns.map((column) => ({ key: column.key, role: column.role, ...(column.unit !== undefined ? { unit: column.unit } : {}) })),
    })) } : {}),
    ...(project.ranges.length ? { ranges: project.ranges.map(rangeRecord) } : {}),
    ...(project.plots.length ? { plots: project.plots.map(plotRecord) } : {}),
    results: project.results.map(resultRecord),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

const FORMATS = new Set(["png", "jpeg", "tiff"]);
const COLOURS = new Set(["grey", "grey-alpha", "rgb", "rgba", "palette", "cmyk", "ycbcr"]);

/**
 * A document from its text; image paths are resolved against `projectPath`'s folder when it is known. An empty file (as
 * Explorer's New menu makes) is a new, blank document.
 */
export function parseProject(text: string, projectPath: string | null): Project {
  if (!text.trim()) return emptyProject();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new ProjectError("The document is not valid JSON."); }
  if (!data || typeof data !== "object" || data.format !== PROJECT_FORMAT) throw new ProjectError("The file is not a PlotForge document.");
  if (!Number.isInteger(data.version) || data.version < 1) throw new ProjectError("The document has no valid version.");
  if (data.version > PROJECT_VERSION) throw new ProjectError(`The document was made by a newer PlotForge (format ${data.version}). Update PlotForge to open it.`);
  const folder = projectPath ? dirname(projectPath) : null;
  const finite = (value: unknown, what: string): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new ProjectError(`The document has an invalid ${what}.`);
    return value;
  };
  const text_ = (value: unknown, what: string): string => {
    if (typeof value !== "string" || !value) throw new ProjectError(`The document has an invalid ${what}.`);
    return value;
  };
  const grid = data.grid ?? {};
  const images: ProjectImage[] = (Array.isArray(data.images) ? data.images : []).map((raw: any) => {
    const embedded = raw?.embedded === undefined ? undefined : (() => {
      const bytes = typeof raw.embedded === "string" ? fromBase64(raw.embedded) : null;
      if (!bytes) throw new ProjectError(`The image ${String(raw.name)} has invalid embedded data.`);
      if (crc32(bytes) !== raw.source?.crc32) throw new ProjectError(`The embedded image ${String(raw.name)} is damaged: its checksum does not match.`);
      return bytes;
    })();
    const stored = embedded ? text_(raw.file, "image file name") : text_(raw?.path, "image path");
    const source = raw.source ?? {};
    if (!FORMATS.has(source.format)) throw new ProjectError("The document has an image of an unknown format.");
    if (!COLOURS.has(source.colour)) throw new ProjectError("The document has an image of an unknown colour model.");
    return {
      id: text_(raw.id, "image id"), name: text_(raw.name, "image name"),
      path: embedded ? null : folder ? resolvePath(folder, stored) : stored, file: basename(stored),
      ...(embedded ? { embedded } : {}),
      x: finite(raw.x, "image position"), y: finite(raw.y, "image position"),
      width: finite(raw.width, "image size"), height: finite(raw.height, "image size"),
      ...(raw.angle !== undefined && raw.angle !== 0 ? { angle: normalAngle(finite(raw.angle, "image angle")) } : {}),
      source: {
        format: source.format, colour: source.colour,
        widthPx: finite(source.widthPx, "image size"), heightPx: finite(source.heightPx, "image size"),
        bitDepth: finite(source.bitDepth, "bit depth"), channels: finite(source.channels, "channel count"),
        bytes: finite(source.bytes, "file size"), crc32: text_(source.crc32, "checksum"),
        orientation: source.orientation === undefined ? 1 : orientationOf(source.orientation),
      },
      // A document from before the Threshold step has its phases (or, before phases, one threshold) beside the steps.
      steps: withLegacyPhases(parseSteps(raw.steps), (() => { try { return parsePhases(raw.phases, raw.threshold, raw.settings?.maskColour in MASK_COLOURS ? raw.settings.maskColour : "magenta"); } catch (error) { throw new ProjectError(error instanceof PhaseError ? error.message : "The document has an invalid phase."); } })()),
      calibration: checked(() => parseImageCalibration(raw.calibration)),
      rois: parseRois(raw.rois),
      ...(raw.maskDisplay !== undefined ? { maskDisplay: (() => { if (!MASK_DISPLAYS.includes(raw.maskDisplay)) throw new ProjectError("The document has an invalid mask display."); return raw.maskDisplay as MaskDisplay; })() } : {}),
      settings: { ...(raw.measurements !== undefined ? { measurements: parseMeasurements(raw.measurements) } : {}), ...parseImageSettings(raw.settings) },
      ...(raw.density !== undefined ? { density: (() => { try { return parseDensity(raw.density); } catch (error) { throw new ProjectError(error instanceof DensityError ? error.message : "The document has an invalid density standard."); } })() } : {}),
      ...(raw.labels !== undefined ? { labels: (() => { try { return parseLabels(raw.labels); } catch (error) { throw new ProjectError(error instanceof LabelError ? error.message : "The document has an invalid label."); } })() } : {}),
      ...(raw.display !== undefined && raw.display !== null ? { display: (() => { try { return parseDisplay(raw.display, source.bitDepth === 16 ? 16 : 8); } catch (error) { throw new ProjectError(`The image ${String(raw.name)} has invalid display settings. ${(error as Error).message}`); } })() } : {}),
    };
  });
  const ids = new Set(images.map((image) => image.id));
  for (const image of images) if (new Set(image.steps.map((step) => step.id)).size !== image.steps.length) throw new ProjectError(`The image ${image.name} has two steps with the same id.`);
  for (const image of images) if (new Set(image.rois.map((roi) => roi.id)).size !== image.rois.length) throw new ProjectError(`The image ${image.name} has two regions with the same id.`);
  if (ids.size !== images.length) throw new ProjectError("The document has two images with the same id.");
  const calibration = data.calibration === undefined || data.calibration === null ? null : checked(() => parseCalibration(data.calibration));
  const results = parseResults(data.results);
  const linked = parseDataLinks(data.data, folder);
  let plots: ProjectPlot[];
  try { plots = parsePlots(data.plots); }
  catch (error) { throw error instanceof PlotError ? new ProjectError(error.message) : error; }
  let ranges: NamedRange[];
  try { ranges = parseRanges(data.ranges); }
  catch (error) { throw error instanceof NamedRangeError ? new ProjectError(error.message) : error; }
  return { grid: { snap: grid.snap !== false, spacing: typeof grid.spacing === "number" && grid.spacing > 0 ? grid.spacing : GRID_SPACING }, calibration, images, data: linked, plots, ranges, results };
}

const DATA_FILE = new RegExp(`\\.(${DATA_EXTENSIONS.join("|")})$`, "i");

const finiteOr = (value: unknown, what: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ProjectError(`The document has a data file with an invalid ${what}.`);
  return value;
};
const positive = (value: unknown, what: string): number => {
  const number = finiteOr(value, what);
  if (number <= 0) throw new ProjectError(`The document has a data file with an invalid ${what}.`);
  return number;
};

/** The data links of a document; one stored without them has none. */
function parseDataLinks(raw: unknown, folder: string | null): ProjectData[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ProjectError("The document has an invalid data list.");
  const links = raw.map((item: any): ProjectData => {
    if (!item || typeof item !== "object") throw new ProjectError("The document has an invalid data file.");
    for (const key of ["id", "name", "path"] as const) if (typeof item[key] !== "string" || !item[key]) throw new ProjectError(`The document has a data file with an invalid ${key}.`);
    if (!DATA_FILE.test(item.path)) throw new ProjectError(`The document links ${String(item.path)} as data, which is not a data file.`);
    const source = item.source ?? {};
    if (source.format !== "text" && source.format !== "xlsx") throw new ProjectError("The document has a data file of an unknown format.");
    if (!Number.isFinite(source.bytes) || typeof source.crc32 !== "string") throw new ProjectError("The document has a data file with an invalid size or checksum.");
    try {
      return {
        id: item.id, name: item.name, path: folder ? resolvePath(folder, item.path) : item.path, file: basename(item.path),
        x: finiteOr(item.x, "worksheet position"), y: finiteOr(item.y, "worksheet position"),
        width: positive(item.width, "worksheet size"), height: positive(item.height, "worksheet size"),
        source: { format: source.format, bytes: source.bytes, crc32: source.crc32 },
        read: parseRead(item.read), columns: parseColumnSettings(item.columns),
      };
    } catch (error) { throw error instanceof DataError ? new ProjectError(error.message) : error; }
  });
  if (new Set(links.map((link) => link.id)).size !== links.length) throw new ProjectError("The document has two data files with the same id.");
  return links;
}

/** The steps of one stored image; a version 1 image has none. */
function parseSteps(raw: unknown): Step[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ProjectError("The document has an invalid step list.");
  try { return raw.map(parseStep); }
  catch (error) { throw new ProjectError(error instanceof StepError ? error.message : "The document has an invalid step."); }
}

/**
 * The steps of an image stored with phases beside its step list: a Threshold step at the end, then its phases' mask
 * operations as mask steps. When every phase has the same operations, each becomes one step on all phases; otherwise
 * each phase's operations become steps that name the phase. Either way each phase's mask is the one it had.
 */
export function withLegacyPhases(steps: Step[], phases: readonly Phase[]): Step[] {
  if (!phases.length || steps.some((step) => step.type === "threshold")) return steps;
  const used = new Set(steps.map((step) => step.id));
  let n = steps.length + 1;
  const nextId = (): string => { while (used.has(`step-${n}`)) n++; used.add(`step-${n}`); return `step-${n}`; };
  const out: Step[] = [...steps, { id: nextId(), enabled: true, type: "threshold", phases: phases.map((phase) => ({ ...phase, threshold: rangeOnly(phase.threshold) })) }];
  const operations = phases.map((phase) => phase.threshold.operations ?? []);
  const shared = operations.every((list) => JSON.stringify(list) === JSON.stringify(operations[0]));
  const maskStep = (operation: { kind: MaskStep["operation"]; iterations: number }, phase?: string): MaskStep =>
    ({ id: nextId(), enabled: true, type: "mask", operation: operation.kind, iterations: operation.iterations, ...(phase !== undefined ? { phase } : {}) });
  if (shared) for (const operation of operations[0]) out.push(maskStep(operation));
  else phases.forEach((phase, index) => { for (const operation of operations[index]) out.push(maskStep(operation, phase.id)); });
  return out;
}

/** A calibration reading, its refusal turned into the document's own error. */
function checked<T>(read: () => T): T {
  try { return read(); }
  catch (error) { throw new ProjectError(error instanceof CalibrationError ? error.message : "The document has an invalid calibration."); }
}

/** The regions of one stored image; an image without them has none. */
function parseRois(raw: unknown): Roi[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ProjectError("The document has an invalid region list.");
  try { return raw.map(parseRoi); }
  catch (error) { throw new ProjectError(error instanceof RoiError ? error.message : "The document has an invalid region."); }
}

/** A stored EXIF orientation: a whole number from 1 to 8. */
function orientationOf(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 8) throw new ProjectError("The document has an invalid image orientation.");
  return value as number;
}

// MARK: measurements and results

/** An image's overrides, in a fixed key order; keys it does not set are left out. */
function settingsRecord(settings: Partial<ImageSettings>): Record<string, unknown> {
  const order: (keyof ImageSettings)[] = ["greyMethod", "thresholdMode", "maskColour", "measurements", "limitToThreshold", "decimals"];
  return Object.fromEntries(order.filter((key) => settings[key] !== undefined).map((key) => [key, key === "measurements" ? MEASURE_KEYS.filter((item) => settings.measurements!.includes(item)) : settings[key]]));
}

/** Stored overrides; an unknown or invalid one is refused, so a damaged document is not opened as if it were whole. */
function parseImageSettings(raw: unknown): Partial<ImageSettings> {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProjectError("The document has invalid image settings.");
  // Region colours follow the shell's overlay palette since forge-shell 4.5.2: an earlier document's outline colour is dropped.
  const { outlineColour: retired, ...rest } = raw as Record<string, unknown>;
  if (retired !== undefined && typeof retired !== "string") throw new ProjectError("The document has an invalid image setting.");
  const clean = cleanImageSettings(rest);
  if (Object.keys(rest).length !== Object.keys(clean).length) throw new ProjectError("The document has an invalid image setting.");
  return clean;
}

/** A measurement set (a stored list, or a results row's); a row stored without one takes the default. */
function parseMeasurements(raw: unknown): MeasureKey[] {
  if (raw === undefined) return ["area", "areaFraction", "mean"];
  if (!Array.isArray(raw) || raw.some((key) => !MEASURE_KEYS.includes(key))) throw new ProjectError("The document has an invalid measurement set.");
  return MEASURE_KEYS.filter((key) => raw.includes(key));
}

/** The value fields every row had before the measurement set grew; the later ones open as null when absent. */
const FIRST_VALUE_KEYS: readonly string[] = ["regionPixels", "maskedPixels", "area", "areaFraction", "mean", "min", "max", "centroidX", "centroidY", "perimeter", "length"];

/** A results row in a fixed field order, its record first and its values after. */
function resultRecord(row: ResultRow): Record<string, unknown> {
  return {
    id: row.id, imageId: row.imageId, imageName: row.imageName, file: row.file, crc32: row.crc32,
    steps: row.steps.map(stepRecord), threshold: row.threshold ? thresholdRecord(row.threshold) : null, roi: row.roi ? roiRecord(row.roi) : null,
    calibration: row.calibration ? calibrationRecord(row.calibration) : null, measured: MEASURE_KEYS.filter((key) => row.measured.includes(key)),
    ...(row.phase ? { phase: row.phase } : {}), ...(row.limitToThreshold ? { limitToThreshold: true } : {}), ...(row.density ? { density: densityRecord(row.density) } : {}),
    ...(row.mask ? { mask: { crc32: row.mask.crc32, count: row.mask.count } } : {}),
    unit: row.unit, values: Object.fromEntries(VALUE_KEYS.map((key) => [key, row.values[key]])),
  };
}

/** The results table of a document; one stored without it has none. */
function parseResults(raw: unknown): ResultRow[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ProjectError("The document has an invalid results table.");
  return raw.map((item: any) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.imageId !== "string" || typeof item.imageName !== "string"
      || typeof item.file !== "string" || typeof item.crc32 !== "string") throw new ProjectError("The document has an invalid results row.");
    if (item.unit !== "px" && !(LENGTH_UNITS as readonly string[]).includes(item.unit)) throw new ProjectError("A results row has an invalid unit.");
    const values = {} as MeasureValues;
    for (const key of VALUE_KEYS) {
      const value = item.values?.[key] === undefined && !FIRST_VALUE_KEYS.includes(key) ? null : item.values?.[key];
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) throw new ProjectError(`A results row has an invalid ${key}.`);
      (values as unknown as Record<string, number | null>)[key] = value;
    }
    return {
      id: item.id, imageId: item.imageId, imageName: item.imageName, file: item.file, crc32: item.crc32,
      steps: parseSteps(item.steps), threshold: item.threshold ? (() => { try { return parseThreshold(item.threshold); } catch (error) { throw new ProjectError(error instanceof ThresholdError ? error.message : "A results row has an invalid threshold."); } })() : null,
      roi: item.roi ? (() => { try { return parseRoi(item.roi); } catch (error) { throw new ProjectError(error instanceof RoiError ? error.message : "A results row has an invalid region."); } })() : null,
      calibration: item.calibration ? checked(() => parseCalibration(item.calibration)) : null,
      measured: parseMeasurements(item.measured), unit: item.unit, values,
      ...(typeof item.phase === "string" && item.phase ? { phase: item.phase } : {}),
      ...(item.limitToThreshold === true ? { limitToThreshold: true } : {}),
      ...(item.density !== undefined ? { density: (() => { try { return parseDensity(item.density)!; } catch { throw new ProjectError("A results row has an invalid density standard."); } })() } : {}),
      ...(item.mask !== undefined ? { mask: (() => { if (typeof item.mask?.crc32 !== "string" || !Number.isInteger(item.mask?.count)) throw new ProjectError("A results row has an invalid mask check."); return { crc32: item.mask.crc32, count: item.mask.count }; })() } : {}),
    };
  });
}

/** An angle in degrees brought to −180 (exclusive) to 180, so that a turn is kept one way only. */
export function normalAngle(degrees: number): number {
  const a = ((degrees % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}
