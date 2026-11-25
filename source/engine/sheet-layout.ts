// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A worksheet on the work surface, as a spreadsheet's window: a title bar with the data file's name, a heading row of
// column letters with their designations (`A(X)`, `B(Y)`, `C(yEr)`), then the rows of the file as they are, under a
// row-number column; names and units are a column's settings in the inspector, not rows of the sheet, and, for a workbook, the sheet tabs along the bottom edge. Sizes are content
// pixels at 100%; the view's zoom scales them. The same layout draws the sheet and finds what a click is on.
import type { Box } from "./layout";
import type { ColumnRole, DataTable } from "./table";

const TITLE = 30, HEADING = 26, ROW = 22, ROW_HEADER = 48, COLUMN = 112, TABS = 26;

export const SHEET = {
  title: TITLE,
  heading: HEADING,
  row: ROW,
  rowHeader: ROW_HEADER,
  column: COLUMN,
  tabs: TABS,
  /** Space between a cell's edge and its text. */
  pad: 10,
  /** Space between the row-number column's edge and its text, narrower than a cell's so the column stays slim. */
  headerPad: 7,
  /** The resize grip at the bottom-right corner, square. */
  grip: 14,
  /** The smallest sheet: the row-number column and one column wide, the headings and two rows high. */
  minWidth: ROW_HEADER + COLUMN,
  minHeight: TITLE + HEADING + 2 * ROW,
  /** Columns and rows a new sheet shows at most. */
  newColumns: 6,
  newRows: 16,
  /** Text size of cells and headings; the title is the same size. */
  font: 12,
} as const;

/** Origin's designation of a column, shown after its short name. */
export const DESIGNATIONS: Record<ColumnRole, string> = { none: "", x: "X", y: "Y", error: "yEr", label: "L", ignored: "" };

/** The short name and designation: `A(X)`; an ignored column shows its letter alone. */
export function headingText(letters: string, role: ColumnRole): string {
  return DESIGNATIONS[role] ? `${letters}(${DESIGNATIONS[role]})` : letters;
}

/**
 * The size of a new sheet: up to six columns and sixteen rows, rounded up to the grid. With a table's axes, its columns'
 * own widths and its shown rows; never below the smallest sheet.
 */
export function newSheetSize(columns: number, rows: number, tabs: boolean, spacing: number, axes: SheetAxes | null = null): { width: number; height: number } {
  const across = Math.max(1, Math.min(columns, SHEET.newColumns)), down = Math.max(4, Math.min(rows, SHEET.newRows));
  const width = SHEET.rowHeader + Math.max(SHEET.minWidth - SHEET.rowHeader, axes ? axes.columns.at(across) : across * SHEET.column);
  const height = SHEET.title + SHEET.heading + Math.max(4 * SHEET.row, axes ? axes.rows.at(down) : down * SHEET.row) + (tabs ? SHEET.tabs : 0);
  const up = (value: number) => Math.ceil(value / spacing) * spacing;
  return { width: up(width), height: up(height) };
}

/** The top of the data rows within the sheet. */
export const ROWS_TOP = SHEET.title + SHEET.heading;

/** How many data rows fit in a sheet of this height. */
export function visibleRows(height: number, tabs: boolean): number {
  return Math.max(0, Math.floor((height - ROWS_TOP - (tabs ? SHEET.tabs : 0)) / SHEET.row));
}

/** How many columns fit, whole or in part, in a sheet of this width. */
export function visibleColumns(width: number): number {
  return Math.max(0, Math.ceil((width - SHEET.rowHeader) / SHEET.column));
}

/** The widest a scroll can go: the first row (or column) shown when the last one is at the bottom (or right) edge. */
export function maxScroll(count: number, shown: number): number {
  return Math.max(0, count - shown);
}

/** A sheet tab's width, from its name: about 7 px a character at the sheet's text size, with padding. */
export function tabWidth(name: string): number {
  return Math.max(64, Math.round(name.length * 7) + 28);
}

/** The narrowest a sheet tab shrinks to before the row of tabs is cut at the sheet's edge. */
export const TAB_MIN = 56;

/**
 * Where a sheet's tabs go along its bottom edge, as the shell's tabs shrink before they overflow: each at its natural
 * width while they all fit beside the resize grip; else the widest are narrowed to one shared width, never below
 * TAB_MIN, so that every tab keeps a share and its name ends with an ellipsis instead of being cut off.
 */
export function tabLayout(names: readonly string[], sheetWidth: number): { left: number; width: number }[] {
  const natural = names.map(tabWidth), room = Math.max(0, sheetWidth - SHEET.grip);
  let cap = Infinity;
  if (natural.reduce((sum, width) => sum + width, 0) > room) {
    // The shared width: the largest cap under which the capped widths fit the room.
    const sorted = [...natural].sort((a, b) => a - b);
    let below = 0;
    cap = TAB_MIN;
    for (let i = 0; i < sorted.length; i++) {
      const even = (room - below) / (sorted.length - i);
      if (even <= sorted[i]) { cap = Math.max(TAB_MIN, Math.floor(even)); break; }
      below += sorted[i];
    }
  }
  let left = 0;
  return natural.map((width) => { const tab = { left, width: Math.min(width, cap) }; left += tab.width; return tab; });
}

/** What a point of a sheet is on. Columns and rows are indices into the table, the scroll already applied. */
export type SheetPart =
  | { kind: "title" }
  | { kind: "reload" }
  | { kind: "heading"; column: number }
  | { kind: "cell"; column: number; row: number }
  /** A row's number; a null row is the corner above the numbers, beside the headings. */
  | { kind: "row-header"; row: number | null }
  | { kind: "tab"; index: number }
  | { kind: "grip" }
  | { kind: "empty" };

/**
 * A sheet's size and scroll; the scroll is in rows and columns and may fall between them, for a smooth scroll. The axes
 * give a workbook's column widths and hidden rows and columns; without them every column and row is the standard size.
 */
export interface SheetView { columns: number; rows: number; tabs: readonly string[]; scrollRow: number; scrollColumn: number; axes?: SheetAxes }

// MARK: axes

/**
 * The places along one direction of a sheet, its columns or its rows: where each starts and how big it is, a hidden
 * one 0. Indices may be fractional, a place within a column or row, as the scroll is.
 */
export interface SheetAxis {
  readonly count: number;
  /** The length of all of them. */
  readonly total: number;
  size(index: number): number;
  /** Where an index lies, from the first one's start: a whole index at its start; past the last, at the end. */
  at(index: number): number;
  /** The index at an offset, fractional within its place; never a hidden one. Past the end, the count or more. */
  index(offset: number): number;
  /** How many shown places come before this one, for banding rows as they are seen. */
  order(index: number): number;
}

export interface SheetAxes { columns: SheetAxis; rows: SheetAxis }

/** Every place the same size: a text file's columns and rows. Offsets past the end go on at that size. */
export function uniformAxis(count: number, size: number): SheetAxis {
  return {
    count, total: count * size,
    size: () => size,
    at: (index) => Math.min(Math.max(0, index), count) * size,
    index: (offset) => Math.max(0, offset) / size,
    order: (index) => index,
  };
}

/** Places of their own sizes (0 hidden). */
export function sizedAxis(sizes: readonly number[]): SheetAxis {
  const count = sizes.length, starts = new Float64Array(count + 1), shown = new Int32Array(count + 1);
  for (let i = 0; i < count; i++) { starts[i + 1] = starts[i] + sizes[i]; shown[i + 1] = shown[i] + (sizes[i] > 0 ? 1 : 0); }
  const total = starts[count];
  return {
    count, total,
    size: (index) => sizes[index] ?? 0,
    at(index) {
      if (index <= 0) return 0;
      if (index >= count) return total;
      const whole = Math.floor(index);
      return starts[whole] + (index - whole) * sizes[whole];
    },
    index(offset) {
      if (offset >= total) return count;
      if (offset <= 0) { let first = 0; while (first < count && sizes[first] === 0) first++; return first; }
      // The last place starting at or before the offset: a shown one, as a hidden one starts where the next does.
      let low = 0, high = count - 1;
      while (low < high) { const mid = (low + high + 1) >> 1; if (starts[mid] <= offset) low = mid; else high = mid - 1; }
      return low + (offset - starts[low]) / sizes[low];
    },
    order: (index) => shown[Math.max(0, Math.min(count, Math.floor(index)))],
  };
}

/** Excel's standard column in its pixels: a workbook's widths are scaled by the sheet's column to it, so a standard column is one of ours. */
const EXCEL_COLUMN = 64;
/** The narrowest and widest a workbook's shown column is drawn. */
const COLUMN_MIN = 24, COLUMN_MAX = 6 * COLUMN;

/** A column's size on the sheet from its width in a workbook (Excel's pixels; 0 hidden; null the sheet's default). */
export function columnSize(width: number | null): number {
  if (width === null) return COLUMN;
  if (width <= 0) return 0;
  return Math.max(COLUMN_MIN, Math.min(COLUMN_MAX, Math.round((width * COLUMN) / EXCEL_COLUMN)));
}

const axesOf = new WeakMap<DataTable, SheetAxes>();

/** A table's columns and rows on its sheet: a workbook's widths and hidden rows and columns; made once per table. */
export function sheetAxes(table: DataTable): SheetAxes {
  let axes = axesOf.get(table);
  if (axes) return axes;
  const count = table.columns.length;
  const columns = table.widths.length ? sizedAxis(Array.from({ length: count }, (_, index) => columnSize(table.widths[index] ?? null))) : uniformAxis(count, SHEET.column);
  let rows = uniformAxis(table.rows, SHEET.row);
  if (table.hiddenRows.length) {
    const sizes = new Array<number>(table.rows).fill(SHEET.row);
    for (const row of table.hiddenRows) if (row >= 0 && row < table.rows) sizes[row] = 0;
    rows = sizedAxis(sizes);
  }
  axes = { columns, rows };
  axesOf.set(table, axes);
  return axes;
}

/** A view's axes: its own, else every column and row the standard size. */
export function viewAxes(view: SheetView): SheetAxes {
  return view.axes ?? { columns: uniformAxis(view.columns, SHEET.column), rows: uniformAxis(view.rows, SHEET.row) };
}

/** A scroll moved by a travel in content pixels along an axis, kept between the start and where the end meets the edge (`shown` pixels). */
export function scrollAlong(axis: SheetAxis, from: number, travel: number, shown: number): number {
  if (axis.total <= 0) return 0;
  const end = axis.index(Math.max(0, axis.total - shown));
  return Math.max(0, Math.min(end, axis.index(Math.max(0, axis.at(from) + travel))));
}

/** The column or row at an offset into the scrolled cells (from the cells' edge), past the scroll. */
export function placeAt(axis: SheetAxis, scroll: number, offset: number): number {
  return Math.floor(axis.index(axis.at(scroll) + offset));
}

/** The part of a sheet at a content point; null when the point is outside the sheet. */
export function sheetPart(box: Box, view: SheetView, x: number, y: number): SheetPart | null {
  const dx = x - box.x, dy = y - box.y;
  if (dx < 0 || dy < 0 || dx >= box.width || dy >= box.height) return null;
  if (dx >= box.width - SHEET.grip && dy >= box.height - SHEET.grip) return { kind: "grip" };
  if (dy < SHEET.title) return dx >= box.width - SHEET.title ? { kind: "reload" } : { kind: "title" };
  const tabs = view.tabs.length > 0;
  if (tabs && dy >= box.height - SHEET.tabs) {
    const index = tabLayout(view.tabs, box.width).findIndex((tab) => dx >= tab.left && dx < tab.left + tab.width);
    return index >= 0 ? { kind: "tab", index } : { kind: "empty" };
  }
  const axes = viewAxes(view);
  if (dx < SHEET.rowHeader) {
    if (dy < ROWS_TOP) return { kind: "row-header", row: null };
    const row = placeAt(axes.rows, view.scrollRow, dy - ROWS_TOP);
    return row < view.rows ? { kind: "row-header", row } : { kind: "empty" };
  }
  const column = placeAt(axes.columns, view.scrollColumn, dx - SHEET.rowHeader);
  if (column >= view.columns) return { kind: "empty" };
  if (dy < ROWS_TOP) return { kind: "heading", column };
  const row = placeAt(axes.rows, view.scrollRow, dy - ROWS_TOP);
  return row < view.rows ? { kind: "cell", column, row } : { kind: "empty" };
}
