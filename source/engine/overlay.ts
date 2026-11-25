// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Overlay text (roadmap I14): a label at a point of an image's result, kept with the image and drawn over it on the
// work surface. Labels never change pixels; an export flattens them into its picture only with "Include overlays".
export interface TextLabel { id: string; x: number; y: number; text: string }

export const LABEL_MAX_LENGTH = 200;

export function labelProblem(label: Pick<TextLabel, "x" | "y" | "text">): string | null {
  if (!Number.isFinite(label.x) || !Number.isFinite(label.y)) return "A label needs a position.";
  if (!label.text.trim()) return "A label needs some text.";
  if (label.text.length > LABEL_MAX_LENGTH) return `A label holds at most ${LABEL_MAX_LENGTH} characters.`;
  return null;
}

export function newLabelId(labels: readonly TextLabel[]): string {
  const used = new Set(labels.map((label) => label.id));
  let n = labels.length + 1;
  while (used.has(`label-${n}`)) n++;
  return `label-${n}`;
}

export class LabelError extends Error {}

export function parseLabels(raw: unknown): TextLabel[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new LabelError("The document has an invalid label list.");
  return raw.map((item) => {
    const data = item as Record<string, unknown>;
    const label = { id: data?.id, x: data?.x, y: data?.y, text: data?.text } as TextLabel;
    if (typeof label.id !== "string" || typeof label.text !== "string" || typeof label.x !== "number" || typeof label.y !== "number" || labelProblem(label)) throw new LabelError("The document has an invalid label.");
    return label;
  });
}

export const labelRecord = (label: TextLabel): Record<string, unknown> => ({ id: label.id, x: label.x, y: label.y, text: label.text });
