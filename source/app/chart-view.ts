// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The Charts tab's Histogram and Profile sections: a small SVG chart in the theme's colours, then the numbers. The
// histogram is of the working image or of the selected region; the profile is along the selected line, or across
// the selected rectangle as a gel lane. Both say why when there is nothing to show.
import { createButton, createButtonGroup, createRow } from "forge-shell/app/builders";
import { setTip } from "forge-shell/app/tips";
import { TOOL_ICONS } from "forge-shell/app/tool-icons";
import { formatMeasure, type HistogramResult, type LabelledPeak, type Profile } from "../engine";
import { actionsFirst } from "./section-actions";

const SVG = "http://www.w3.org/2000/svg";
const WIDTH = 220, HEIGHT = 80;

function chart(label: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "mini-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  return svg;
}

/** The histogram as bars, with a log scale when asked, then count, mean, std dev, min, max and mode. */
export function renderHistogram(section: HTMLElement, result: HistogramResult | string, log: boolean, setLog: (on: boolean) => void, copy: () => void): void {
  if (typeof result === "string") { const row = createRow("Histogram", "None"); setTip(row, result); section.append(row); return; }
  const svg = chart("Histogram of grey values");
  const height = (n: number) => (log ? Math.log10(1 + n) : n);
  const top = Math.max(1, ...result.counts.map(height));
  const step = WIDTH / result.counts.length;
  const path = result.counts.map((n, k) => (n ? `M${(k * step).toFixed(2)} ${HEIGHT}V${(HEIGHT - (height(n) / top) * HEIGHT).toFixed(2)}h${Math.max(step, 0.6).toFixed(2)}V${HEIGHT}z` : "")).join("");
  const bars = document.createElementNS(SVG, "path");
  bars.setAttribute("d", path);
  bars.setAttribute("class", "mini-chart-fill");
  svg.append(bars);
  section.append(svg);
  const stat = (value: number | null) => (value === null ? "None" : formatMeasure(value));
  section.append(
    createRow("Pixels", String(result.count)), createRow("Mean", stat(result.mean)), createRow("Std dev", stat(result.stdDev)),
    createRow("Min and max", result.min === null ? "None" : `${result.min} to ${result.max}`), createRow("Mode", stat(result.modal)),
  );
  const logButton = createButton({ label: log ? "Linear scale" : "Log scale", onClick: () => setLog(!log) });
  setTip(logButton, log ? "Show counts as they are." : "Show log10(1 + count), so small counts can be seen.");
  const copyButton = copyValuesButton(copy);
  setTip(copyButton, "Copy the bins and their counts as tab-separated text.");
  actionsFirst(section, createButtonGroup([logButton, copyButton]));
}

/** The profile as a line, then its length and range, and Copy values. */
export function renderProfile(section: HTMLElement, profile: Profile | string, kind: string, copy: () => void, peaks?: { list: LabelledPeak[]; minProminence: number; setMinProminence(text: string): void; report(message: string): void }): void {
  if (typeof profile === "string") { const row = createRow("Profile", "None"); setTip(row, profile); section.append(row); return; }
  const svg = chart(`${kind} of grey values`);
  const { distances: x, values: y } = profile;
  const xMax = x.at(-1)! || 1, low = Math.min(...y), high = Math.max(...y), span = high - low || 1;
  const line = document.createElementNS(SVG, "polyline");
  line.setAttribute("points", x.map((d, i) => `${((d / xMax) * WIDTH).toFixed(2)},${(HEIGHT - 2 - ((y[i] - low) / span) * (HEIGHT - 4)).toFixed(2)}`).join(" "));
  line.setAttribute("class", "mini-chart-line");
  svg.append(line);
  const wrap = Object.assign(document.createElement("div"), { className: "chart-wrap" });
  wrap.append(svg);
  // Each labelled peak: a dashed tick at its top and its number above it, as HTML so that it is not stretched.
  for (const peak of peaks?.list ?? []) {
    const left = (peak.distance / xMax) * 100;
    const tick = document.createElementNS(SVG, "line");
    const tx = ((peak.distance / xMax) * WIDTH).toFixed(2);
    tick.setAttribute("x1", tx); tick.setAttribute("x2", tx); tick.setAttribute("y1", "12"); tick.setAttribute("y2", String(HEIGHT));
    tick.setAttribute("class", "mini-chart-tick");
    svg.append(tick);
    wrap.append(Object.assign(document.createElement("span"), { className: "peak-label", textContent: String(peak.label), style: `left: ${left.toFixed(2)}%` }));
  }
  section.append(wrap);
  section.append(createRow("Kind", kind), createRow("Samples", String(y.length)), createRow("Length", `${formatMeasure(xMax)} ${profile.unit}`),
    createRow("Range", `${formatMeasure(low)} to ${formatMeasure(high)}`));
  if (peaks) {
    const limit = createRow("Peak prominence", `≥ ${formatMeasure(peaks.minProminence)}`, document, {
      current: () => String(peaks.minProminence), label: "Least prominence",
      validate: (text) => (/^\s*\d*\.?\d+\s*$/.test(text) ? null : "Enter a number of 0 or more."), apply: (text) => peaks.setMinProminence(text), onError: peaks.report,
    });
    setTip(limit, "A peak is labelled when its top stands at least this far above the higher of its two valleys. Click to change it.");
    section.append(limit);
    if (!peaks.list.length) section.append(createRow("Peaks", "None"));
    for (const peak of peaks.list) {
      const row = createRow(`Peak ${peak.label}`, `${formatMeasure(peak.distance)} ${profile.unit}, area ${formatMeasure(peak.area)}`);
      setTip(row, `Top ${formatMeasure(peak.value)} at ${formatMeasure(peak.distance)} ${profile.unit}; samples ${peak.from + 1} to ${peak.to + 1}, valley to valley; the area is above the straight baseline between the valleys, in grey value × ${profile.unit}. Prominence ${formatMeasure(peak.prominence)}.`);
      section.append(row);
    }
  }
  const copyButton = copyValuesButton(copy);
  setTip(copyButton, "Copy the distances and values as tab-separated text.");
  actionsFirst(section, createButtonGroup([copyButton]));
}

/** Copy values: a copy action, so it carries the shared copy symbol before its label. */
function copyValuesButton(copy: () => void): HTMLButtonElement {
  const button = createButton({ label: "Copy values", onClick: copy });
  button.innerHTML = `${TOOL_ICONS.copy}<span>Copy values</span>`;
  return button;
}

/** Tab-separated text with a header line, for the clipboard. */
export function tableText(headers: readonly string[], rows: readonly (readonly (number | string)[])[]): string {
  return [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n") + "\n";
}
