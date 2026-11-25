// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The Results pane, between Terminal and Messages: the document's results table, one row per measurement. A heading
// sorts by its column (again to reverse), a row selects its image and region, and only the columns some row measured
// are shown. Numbers keep four significant digits on screen, or the decimal places set in the Measurements section;
// the CSV keeps every digit.
import { createCheckRow, createRow } from "forge-shell/app/builders";
import { setTip } from "forge-shell/app/tips";
import { cellValue, columnHeading, formatDecimals, formatMeasure, MEASURE_KEYS, RESULT_COLUMNS, type MeasureKey, type ResultRow } from "../engine";

/** Document › Measure is PlotForge's own command, on the App tier. */
export const MEASURE_KEY = "CmdOrCtrl+Shift+M";

// MARK: wording

export const MEASURE_LABELS: Record<MeasureKey, string> = {
  area: "Area", areaFraction: "Area fraction", mean: "Mean grey", minMax: "Min and max grey", centroid: "Centroid", perimeter: "Perimeter",
  stdDev: "Std dev grey", modal: "Modal grey", median: "Median grey", integratedDensity: "Integrated density", centreOfMass: "Centre of mass",
  opticalDensity: "Optical density", boundingRect: "Bounding rectangle", shape: "Shape",
  skewness: "Skewness", kurtosis: "Kurtosis", ellipse: "Fitted ellipse", feret: "Feret's diameter",
};

/** A cell as shown: numbers to four significant digits, nothing for a value not measured. */
export function cellText(value: number | string | null, decimals: number | null = null): string {
  return value === null ? "" : typeof value === "number" ? formatDecimals(value, decimals, formatMeasure) : value;
}

/** The columns to show: Image, Region and Unit always, the others when some row has a value in them. */
export function visibleColumns(rows: readonly ResultRow[]): (typeof RESULT_COLUMNS)[number][] {
  return RESULT_COLUMNS.filter((column) => !column.measure && column.key !== "length" && column.key !== "phase" ? true : rows.some((row) => cellValue(row, column) !== null));
}

/** Rows ordered by a column, numbers by value and text by its letters; rows without a value go last. */
export function sortRows(rows: readonly ResultRow[], key: string | null, descending: boolean): ResultRow[] {
  const column = RESULT_COLUMNS.find((item) => item.key === key);
  if (!column) return [...rows];
  return [...rows].sort((a, b) => {
    const x = cellValue(a, column), y = cellValue(b, column);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
    return descending ? -order : order;
  });
}

// MARK: the pane

export interface ResultsHost {
  rows(): readonly ResultRow[];
  select(row: ResultRow): void;
  /** Decimal places of the numbers shown; null: four significant digits. */
  decimals(): number | null;
}

export class ResultsPanel {
  private sortKey: string | null = null;
  private descending = false;

  constructor(private readonly root: HTMLElement, private readonly host: ResultsHost) {
    root.classList.add("results-pane");
    root.setAttribute("aria-label", "Results");
  }

  render(): void {
    const rows = this.host.rows();
    this.root.replaceChildren();
    if (!rows.length) {
      this.root.append(Object.assign(document.createElement("div"), { className: "pane-empty", textContent: "No results. Measure an image to add rows." }));
      return;
    }
    const columns = visibleColumns(rows), decimals = this.host.decimals();
    const table = document.createElement("table");
    table.className = "results-table";
    const head = table.createTHead().insertRow();
    const number = document.createElement("th");
    number.textContent = "#";
    head.append(number);
    for (const column of columns) {
      const th = document.createElement("th");
      const button = Object.assign(document.createElement("button"), { type: "button", className: "results-sort", textContent: columnHeading(column, rows) });
      const sorted = this.sortKey === column.key;
      th.setAttribute("aria-sort", sorted ? (this.descending ? "descending" : "ascending") : "none");
      setTip(button, `Sort by ${column.heading.toLowerCase()}.`);
      button.addEventListener("click", () => {
        this.descending = sorted ? !this.descending : false;
        this.sortKey = column.key;
        this.render();
      });
      th.append(button);
      if (column.measure || column.key === "length") th.classList.add("numeric");
      head.append(th);
    }
    const body = table.createTBody();
    const order = new Map(rows.map((row, index) => [row.id, index + 1]));
    for (const row of sortRows(rows, this.sortKey, this.descending)) {
      const tr = body.insertRow();
      tr.tabIndex = 0;
      tr.addEventListener("click", () => this.host.select(row));
      tr.addEventListener("keydown", (event) => { if (event.key === "Enter") this.host.select(row); });
      const index = tr.insertCell();
      index.className = "numeric marker";
      index.textContent = String(order.get(row.id));
      for (const column of columns) {
        const cell = tr.insertCell();
        cell.textContent = cellText(cellValue(row, column), decimals);
        if (column.measure || column.key === "length") cell.classList.add("numeric");
      }
    }
    const scroll = document.createElement("div");
    scroll.className = "results-scroll";
    scroll.append(table);
    this.root.append(scroll);
  }
}

// MARK: the inspector's Measurements section

const MEASURE_TIPS: Partial<Record<MeasureKey, string>> = {
  areaFraction: "Masked pixels of the region over all its pixels, times 100.",
  perimeter: "The length of the mask's pixel edges; a diagonal counts as a staircase.",
  stdDev: "The sample standard deviation of the region's grey values.",
  modal: "The most frequent grey value in the region.",
  median: "The middle grey value of the region.",
  integratedDensity: "The sum of the region's grey values times a pixel's area, and the raw sum.",
  centreOfMass: "The region's centre, weighted by grey value.",
  opticalDensity: "The mean of log10 of the maximum value over each value, or of the fitted OD when the image has a density standard.",
  boundingRect: "The smallest rectangle around the masked pixels.",
  shape: "Circularity, aspect ratio, roundness and solidity (area over convex hull) of the masked pixels together.",
  skewness: "The asymmetry of the region's grey values: 0 when symmetric about the mean. Blank for a region of one value.",
  kurtosis: "The excess kurtosis of the region's grey values: 0 for a normal spread. Blank for a region of one value.",
  ellipse: "The ellipse with the masked pixels' second moments and area: major and minor axis lengths, and the major axis's angle counter-clockwise from x.",
  feret: "The longest distance across the masked pixels and its angle, and the narrowest width (min Feret), as calipers measure them.",
};

export interface MeasurementsOptions {
  measurements: readonly MeasureKey[];
  /** The image's phase count: Measure takes a row per phase and region. */
  phases: number;
  limitToThreshold: boolean;
  setLimit(on: boolean): void;
  /** Open the measurement set, which is chosen in the Results tab. */
  chooseInResults(): void;
}

/** The inspector's Measurements section after Measure: what Measure takes, and Limit to threshold at its foot. */
export function renderMeasurements(section: HTMLElement, options: MeasurementsOptions): void {
  const takes = createRow("Takes", `${options.measurements.length} measurement${options.measurements.length === 1 ? "" : "s"}`);
  setTip(takes, `${options.measurements.map((key) => MEASURE_LABELS[key]).join(", ") || "Nothing"}. Choose them with Measurements in the Results tab.`);
  takes.addEventListener("click", () => options.chooseInResults());
  const rows = createRow("Rows", options.phases ? `One per phase and region` : "One per region");
  setTip(rows, options.phases ? "Each phase is measured with its own mask, in each region (or the whole image without regions)." : "Each region is measured, or the whole image without regions.");
  section.append(takes, rows);
  const limit = createCheckRow("Limit to threshold", options.limitToThreshold, (on) => options.setLimit(on));
  setTip(limit, "Take the grey statistics over the phase's pixels of the region only, not all of its pixels.");
  section.append(limit);
}

/** The measurement set as checkable menu items, for the Results tab's Measurements menu. */
export function measurementMenu(measurements: readonly MeasureKey[], set: (next: MeasureKey[]) => void): { label: string; checked: boolean; title?: string; action: () => void }[] {
  return MEASURE_KEYS.map((key) => ({
    label: MEASURE_LABELS[key], checked: measurements.includes(key), title: MEASURE_TIPS[key],
    action: () => set(measurements.includes(key) ? measurements.filter((item) => item !== key) : MEASURE_KEYS.filter((item) => item === key || measurements.includes(item))),
  }));
}
