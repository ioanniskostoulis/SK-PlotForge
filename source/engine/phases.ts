// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Phases (roadmap I5 and I11): an image may have several thresholds, each a named phase with its own range or method,
// mask operations and display colour, such as the primary and secondary phases of a micrograph. Each phase's mask is
// made on its own; a pixel may fall in more than one phase when their ranges overlap, and is then counted in each.
// `phaseCoverage` states the overlap and the pixels in no phase, so phase fractions that add up to more or less than
// 100 % have a stated cause.
//
// Display modes, as ImageJ's threshold dialog has them; display only, never measured or exported as data:
//   colours     every phase drawn over the image in its own colour
//   bw          the selected phase black on white, the rest of the image hidden
//   overUnder   the selected grey phase's range shown as the image, values below it blue and above it green
import { maxValue, type Raster } from "./raster";
import { parseThreshold, thresholdRecord, ThresholdError, type Threshold } from "./threshold";

/** Display colours a person can choose; each is listed in forge.config.json, dataColors. */
export const MASK_COLOURS = { magenta: "#e040fb8c", orange: "#ff8c1a8c", blue: "#3d8bff8c", cyan: "#00d0c88c", green: "#3ddc5a8c", yellow: "#f5d5478c", red: "#ff3b3b8c" } as const;
export type MaskColour = keyof typeof MASK_COLOURS;

/** The colours of B&W and Over/Under (listed in forge.config.json, dataColors): ImageJ's black on white, blue under, green over. */
export const DISPLAY_COLOURS = { object: "#000000ff", background: "#ffffffff", under: "#3d8bffff", over: "#3ddc5aff" } as const;

export interface Phase { id: string; name: string; colour: MaskColour; threshold: Threshold }
export type MaskDisplay = "colours" | "bw" | "overUnder";
export const MASK_DISPLAYS: readonly MaskDisplay[] = ["colours", "bw", "overUnder"];
export const PHASE_COLOURS = Object.keys(MASK_COLOURS) as MaskColour[];

/** A new phase: the next free id and "Phase n" name, and `preferred` as colour when no phase uses it, else the first free one. */
export function newPhase(phases: readonly Phase[], threshold: Threshold, preferred: MaskColour = "magenta"): Phase {
  const ids = new Set(phases.map((phase) => phase.id)), names = new Set(phases.map((phase) => phase.name.toLowerCase()));
  let n = phases.length + 1;
  while (ids.has(`phase-${n}`) || names.has(`phase ${n}`)) n++;
  const used = new Set(phases.map((phase) => phase.colour));
  const colour = !used.has(preferred) ? preferred : PHASE_COLOURS.find((item) => !used.has(item)) ?? PHASE_COLOURS[phases.length % PHASE_COLOURS.length];
  return { id: `phase-${n}`, name: `Phase ${n}`, colour, threshold };
}

/** Why a phase name cannot be used, or null: it needs text and must differ from the other phases' names. */
export function phaseNameProblem(name: string, others: readonly Phase[]): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "A phase needs a name.";
  if (trimmed.length > 60) return "A phase name holds at most 60 characters.";
  if (others.some((phase) => phase.name.toLowerCase() === trimmed.toLowerCase())) return `Another phase is already called ${trimmed}.`;
  return null;
}

/** Pixels in two or more of the masks, and pixels in none, out of the image's. */
export function phaseCoverage(masks: readonly Uint8Array[], pixels: number, outside?: Uint8Array): { overlap: number; unassigned: number } {
  let overlap = 0, unassigned = 0;
  for (let i = 0; i < pixels; i++) {
    // Pixels a Canvas step added are in no phase and not unassigned either: they are not the image.
    if (outside?.[i]) continue;
    let n = 0;
    for (const mask of masks) n += mask[i];
    if (n > 1) overlap++;
    else if (n === 0) unassigned++;
  }
  return { overlap, unassigned };
}

/** Over/Under of a grey image: 1 where v < low, 2 where v > high, 0 in the range. */
export function overUnder(raster: Raster, low: number, high: number): Uint8Array {
  if (raster.channels !== 1) throw new Error("Over/Under needs a grey image.");
  const out = new Uint8Array(raster.widthPx * raster.heightPx);
  const M = maxValue(raster.bitDepth), lo = Math.max(0, low), hi = Math.min(M, high);
  for (let i = 0; i < out.length; i++) { const v = raster.data[i]; out[i] = v < lo ? 1 : v > hi ? 2 : 0; }
  return out;
}

// MARK: reading and writing

export class PhaseError extends Error {}

/** Stored phases; a document from before phases has one `threshold`, which opens as Phase 1 in `legacyColour`. */
export function parsePhases(raw: unknown, legacy: unknown, legacyColour: MaskColour = "magenta"): Phase[] {
  const read = (threshold: unknown): Threshold => {
    try { const parsed = parseThreshold(threshold); if (!parsed) throw new ThresholdError("The document has a phase without a threshold."); return parsed; }
    catch (error) { throw new PhaseError(error instanceof ThresholdError ? error.message : "The document has an invalid threshold."); }
  };
  if (raw === undefined) return legacy === undefined || legacy === null ? [] : [{ id: "phase-1", name: "Phase 1", colour: legacyColour, threshold: read(legacy) }];
  if (!Array.isArray(raw)) throw new PhaseError("The document has an invalid phase list.");
  const phases = raw.map((item) => {
    const data = item as Record<string, unknown>;
    if (typeof data?.id !== "string" || !data.id || typeof data.name !== "string" || !data.name.trim()) throw new PhaseError("The document has a phase without an id or a name.");
    if (typeof data.colour !== "string" || !(data.colour in MASK_COLOURS)) throw new PhaseError(`The phase ${data.name} has an unknown colour.`);
    return { id: data.id, name: data.name, colour: data.colour as MaskColour, threshold: read(data.threshold) };
  });
  if (new Set(phases.map((phase) => phase.id)).size !== phases.length) throw new PhaseError("The document has two phases with the same id.");
  return phases;
}

export const phaseRecord = (phase: Phase): Record<string, unknown> => ({ id: phase.id, name: phase.name, colour: phase.colour, threshold: thresholdRecord(phase.threshold) });
