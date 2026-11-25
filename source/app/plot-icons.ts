// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The toolbar's plot kinds, from the shell's graph icons, Line + symbol its line through open markers.
import { GRAPH_ICONS } from "forge-shell/app/tool-icons";
import type { PlotKind } from "../engine";

export const PLOT_KIND_ICONS: Record<PlotKind, string> = {
  scatter: GRAPH_ICONS.chartScatter,
  line: GRAPH_ICONS.chartLine,
  "line-symbol": GRAPH_ICONS.chartLineSymbol,
  column: GRAPH_ICONS.chartColumn,
};

/**
 * The plot tools' bare keys, on the Tool tier as the canvas tools' (V, C, R, E, P, F, L), whose letters they leave
 * alone: S Scatter, N liNe, M line + Marker, B Bar (column).
 */
export const PLOT_TOOL_KEYS: Record<PlotKind, string> = { scatter: "S", line: "N", "line-symbol": "M", column: "B" };

/** The plot kind of a key press: a plain letter without Cmd, Ctrl, Alt or Shift; null for anything else. */
export function plotKindForKey(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): PlotKind | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.key.length !== 1) return null;
  const key = event.key.toUpperCase();
  return (Object.keys(PLOT_TOOL_KEYS) as PlotKind[]).find((kind) => PLOT_TOOL_KEYS[kind] === key) ?? null;
}
