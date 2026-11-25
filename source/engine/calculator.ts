// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Steps that read another image of the document (roadmap I21 and I31): the image calculator, and paste into a
// selection. Each names the other image by id and reads the result of that image's own steps, so the dependency is
// stated in the step and in its summary; a change to the other image's steps changes this image's result. An image may
// not depend on itself, directly or through others (`dependencyCycle`).
//
// Image calculator: result = a op b per sample, a this image and b the other, both of the same size, channels and
// depth (a mismatch is refused, not resampled). Arithmetic results are rounded and clipped to 0 to M:
//   add a + b, subtract a − b, multiply a · b, divide a / b (b = 0 gives 0 when a = 0, else M, the limit),
//   min, max, average (a + b) / 2, difference |a − b|; AND, OR and XOR act on the bits of the integer values.
// Paste into a selection: the other image is placed with its top-left corner at the selection's bounding box, and
// only the pixels whose centres lie inside the selection and under the pasted image are replaced. A grey image pasted
// into a colour one is copied to all three channels; colour into grey takes the luminance (steps.ts); the depths must
// match. The other image's pixels, and its original file, are only read.
import { maxValue, newRaster, type Raster } from "./raster";
import { roiBounds, roiMask, roiProblem, type Roi } from "./roi";

export type CalculatorOperation = "add" | "subtract" | "multiply" | "divide" | "and" | "or" | "xor" | "min" | "max" | "average" | "difference";
export const CALCULATOR_OPERATIONS: readonly CalculatorOperation[] = ["add", "subtract", "multiply", "divide", "and", "or", "xor", "min", "max", "average", "difference"];

/** Why the calculator cannot combine these images, or null. */
export function calculatorProblem(a: Pick<Raster, "widthPx" | "heightPx" | "channels" | "bitDepth">, b: Pick<Raster, "widthPx" | "heightPx" | "channels" | "bitDepth">, otherName: string): string | null {
  if (a.widthPx !== b.widthPx || a.heightPx !== b.heightPx) return `${otherName} is ${b.widthPx} × ${b.heightPx} px and this image is ${a.widthPx} × ${a.heightPx} px. The image calculator needs images of the same size.`;
  if (a.channels !== b.channels) return `${otherName} is ${b.channels === 1 ? "grey" : "colour"} and this image is ${a.channels === 1 ? "grey" : "colour"}. Convert one of them first.`;
  if (a.bitDepth !== b.bitDepth) return `${otherName} has ${b.bitDepth} bits per channel and this image ${a.bitDepth}. Convert one of them to 8 bits first.`;
  return null;
}

function combine(operation: CalculatorOperation, a: number, b: number, M: number): number {
  switch (operation) {
    case "add": return a + b;
    case "subtract": return a - b;
    case "multiply": return a * b;
    case "divide": return b === 0 ? (a === 0 ? 0 : M) : a / b;
    case "and": return a & b;
    case "or": return a | b;
    case "xor": return a ^ b;
    case "min": return Math.min(a, b);
    case "max": return Math.max(a, b);
    case "average": return (a + b) / 2;
    case "difference": return Math.abs(a - b);
  }
}

/** The calculator's result and how many samples it clipped at 0 or M. The inputs are not changed. */
export function applyCalculator(a: Raster, b: Raster, operation: CalculatorOperation): { raster: Raster; clipped: number } {
  const problem = calculatorProblem(a, b, "The other image");
  if (problem) throw new Error(problem);
  const M = maxValue(a.bitDepth), out = newRaster(a.widthPx, a.heightPx, a.channels, a.bitDepth);
  let clipped = 0;
  for (let i = 0; i < out.data.length; i++) {
    const r = Math.round(combine(operation, a.data[i], b.data[i], M));
    if (r < 0 || r > M) clipped++;
    out.data[i] = Math.min(M, Math.max(0, r));
  }
  return { raster: out, clipped };
}

/** Why an image cannot be pasted into a region of another, or null. */
export function pasteProblem(target: Pick<Raster, "bitDepth">, pasted: Pick<Raster, "bitDepth">, region: Roi): string | null {
  if (region.type === "line") return "A line has no inside to paste into. Use a closed region.";
  const problem = roiProblem(region);
  if (problem) return problem;
  if (target.bitDepth !== pasted.bitDepth) return `The pasted image has ${pasted.bitDepth} bits per channel and this image ${target.bitDepth}. Convert one of them first.`;
  return null;
}

/** Paste `pasted` into `region` of `target` (see the head of this file); a new raster, the inputs unchanged. */
export function pasteInto(target: Raster, pasted: Raster, region: Roi): Raster {
  const problem = pasteProblem(target, pasted, region);
  if (problem) throw new Error(problem);
  const mask = roiMask(region, target);
  const out = newRaster(target.widthPx, target.heightPx, target.channels, target.bitDepth);
  out.data.set(target.data);
  if (!mask) return out;
  const bounds = roiBounds(region), ox = Math.round(bounds.x), oy = Math.round(bounds.y);
  const c = target.channels, pc = pasted.channels;
  for (let y = Math.max(0, oy); y < Math.min(target.heightPx, oy + pasted.heightPx); y++) {
    for (let x = Math.max(0, ox); x < Math.min(target.widthPx, ox + pasted.widthPx); x++) {
      const p = y * target.widthPx + x;
      if (!mask[p]) continue;
      const q = ((y - oy) * pasted.widthPx + (x - ox)) * pc;
      if (c === pc) for (let k = 0; k < c; k++) out.data[p * c + k] = pasted.data[q + k];
      else if (c === 3) for (let k = 0; k < 3; k++) out.data[p * 3 + k] = pasted.data[q];
      else out.data[p] = Math.min(maxValue(target.bitDepth), Math.round(0.299 * pasted.data[q] + 0.587 * pasted.data[q + 1] + 0.114 * pasted.data[q + 2]));
    }
  }
  return out;
}

/** The ids of the images a step list reads, in order, each once. */
export function stepDependencies(steps: readonly { type: string; enabled: boolean; imageId?: string }[]): string[] {
  return [...new Set(steps.filter((step) => step.enabled && (step.type === "calculator" || step.type === "paste") && step.imageId).map((step) => step.imageId!))];
}

/** Whether an image would depend on itself through the steps of `images`; `extra` adds a step list not yet stored. */
export function dependencyCycle(images: readonly { id: string; steps: readonly { type: string; enabled: boolean; imageId?: string }[] }[], imageId: string, steps = images.find((image) => image.id === imageId)?.steps ?? []): boolean {
  const byId = new Map(images.map((image) => [image.id, image.steps]));
  const seen = new Set<string>();
  const visit = (deps: string[]): boolean => deps.some((id) => {
    if (id === imageId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return visit(stepDependencies(byId.get(id) ?? []));
  });
  return visit(stepDependencies(steps));
}
