// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The cells chosen in a worksheet, as in a spreadsheet: one or more blocks of columns and rows. A click on a column's
// heading chooses the whole column, on a row number the whole row, on a cell that cell; Shift extends the last block
// from where it started, Cmd (Ctrl elsewhere) adds a block or takes one away, and a drag extends the block it started.
// The chosen cells, one range per column of each block, are what a new plot takes and what a name labels.
import { hasNumbers, type DataTable } from "./table";
import type { SeriesPair, SeriesRows } from "./plot";
import type { CellRange } from "./ranges";

/** Where a press is: a column and a row (table indices); a null row is the column's heading, a null column a row's number. */
export interface SheetPoint { column: number | null; row: number | null }

/** A block of a sheet: columns `c0` to `c1` and its rows, both ends included; null rows are the whole columns. */
export interface SheetRange { c0: number; c1: number; rows: SeriesRows | null }

/** The blocks chosen in a sheet, and the point the last one started from (what Shift extends from). */
export interface SheetSelection { ranges: SheetRange[]; anchor: SheetPoint }

/** How a press changes a selection: anew, extending the last block (Shift), or adding or taking away a block (Cmd). */
export type SheetSelectMode = "replace" | "add" | "toggle";

/** The block between two points of a sheet with this many columns; a row number spans every column, a heading every row. */
export function rangeBetween(a: SheetPoint, b: SheetPoint, columns: number): SheetRange {
  const whole = a.column === null || b.column === null;
  const c0 = whole ? 0 : Math.min(a.column!, b.column!), c1 = whole ? Math.max(0, columns - 1) : Math.max(a.column!, b.column!);
  const rows = a.row === null || b.row === null ? null : { first: Math.min(a.row, b.row), last: Math.max(a.row, b.row) };
  return { c0, c1, rows };
}

const sameRange = (a: SheetRange, b: SheetRange) =>
  a.c0 === b.c0 && a.c1 === b.c1 && (a.rows === null ? b.rows === null : b.rows !== null && a.rows.first === b.rows.first && a.rows.last === b.rows.last);

/**
 * The selection after a press at a point. Replace starts anew; add (Shift) extends the last block from its anchor; toggle
 * (Cmd) takes away a block the press matches exactly, takes a whole column out of whole-column blocks, or adds the
 * point as a block of its own.
 */
export function pressSelection(current: SheetSelection | null, point: SheetPoint, mode: SheetSelectMode, columns: number): SheetSelection {
  if (mode === "add" && current?.ranges.length) {
    return { ranges: [...current.ranges.slice(0, -1), rangeBetween(current.anchor, point, columns)], anchor: current.anchor };
  }
  if (mode === "toggle" && current?.ranges.length) {
    const single = rangeBetween(point, point, columns);
    const exact = current.ranges.findIndex((range) => sameRange(range, single));
    if (exact >= 0) return { ranges: current.ranges.filter((_, index) => index !== exact), anchor: current.anchor };
    if (point.row === null && point.column !== null && current.ranges.some((range) => range.rows === null && range.c0 <= point.column! && point.column! <= range.c1)) {
      const column = point.column;
      const ranges = current.ranges.flatMap((range): SheetRange[] => {
        if (range.rows !== null || column < range.c0 || column > range.c1) return [range];
        return [...(column > range.c0 ? [{ c0: range.c0, c1: column - 1, rows: null }] : []), ...(column < range.c1 ? [{ c0: column + 1, c1: range.c1, rows: null }] : [])];
      });
      return { ranges, anchor: current.anchor };
    }
    return { ranges: [...current.ranges, single], anchor: point };
  }
  return { ranges: [rangeBetween(point, point, columns)], anchor: point };
}

/** The selection while a drag that started a block goes on: the last block from its anchor to the point. */
export function dragSelection(current: SheetSelection, point: SheetPoint, columns: number): SheetSelection {
  return pressSelection(current, point, "add", columns);
}

/** Whether a selection chooses nothing. */
export function selectionEmpty(selection: SheetSelection | null): boolean {
  return !selection || selection.ranges.length === 0;
}

/** The chosen columns, in order, each once. */
export function selectedColumns(selection: SheetSelection | null): number[] {
  const columns = new Set<number>();
  for (const range of selection?.ranges ?? []) for (let column = range.c0; column <= range.c1; column++) columns.add(column);
  return [...columns].sort((a, b) => a - b);
}

/** Whether a cell is chosen; a null row asks whether the whole column is. */
export function cellSelected(selection: SheetSelection | null, column: number, row: number | null): boolean {
  return (selection?.ranges ?? []).some((range) => range.c0 <= column && column <= range.c1 && (range.rows === null || (row !== null && range.rows.first <= row && row <= range.rows.last)));
}

/** The rows chosen in a column: those of the first block that holds it (null: every row); undefined when it is not chosen. */
export function columnRows(selection: SheetSelection | null, column: number): SeriesRows | null | undefined {
  const range = selection?.ranges.find((item) => item.c0 <= column && column <= item.c1);
  return range === undefined ? undefined : range.rows;
}

/**
 * The chosen cells as ranges of one column each, in the order chosen (block by block, left to right in a block), each
 * once. Rows that cover the whole sheet are the whole column (null).
 */
export function selectionRanges(table: DataTable, selection: SheetSelection | null, data: string): CellRange[] {
  const ranges: CellRange[] = [], seen = new Set<string>();
  for (const range of selection?.ranges ?? []) {
    const rows = range.rows && (range.rows.first > 0 || range.rows.last < table.rows - 1) ? { first: range.rows.first, last: Math.min(range.rows.last, Math.max(0, table.rows - 1)) } : null;
    for (let index = range.c0; index <= Math.min(range.c1, table.columns.length - 1); index++) {
      const key = `${index}:${rows ? `${rows.first}-${rows.last}` : "all"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ranges.push({ data, column: table.columns[index].key, rows });
    }
  }
  return ranges;
}

/** What a chosen range is to a plot, as Origin's Plot Setup designates columns, but for these cells only. */
export type RangeRole = "x" | "y" | "yerr" | "label" | "skip";
export const RANGE_ROLES: readonly RangeRole[] = ["x", "y", "yerr", "label", "skip"];
export const RANGE_ROLE_NAMES: Record<RangeRole, string> = { x: "X", y: "Y", yerr: "Y error", label: "Label", skip: "Skip" };
/** The roles a range without numbers can take: categories along X, labels by points, or left out. */
export const TEXT_ROLES: readonly RangeRole[] = ["x", "label", "skip"];

/** A key for a range's cells, for the roles the user gave them this session. */
export const cellsKey = (cells: CellRange) => `${cells.data}|${cells.column}|${cells.rows ? `${cells.rows.first}-${cells.rows.last}` : "all"}`;

/** A chosen range, whether it holds numbers, and its role: the one given, else by Origin's rule (see `selectionPlan`). */
export interface PlannedRange { cells: CellRange; numeric: boolean; role: RangeRole }

/**
 * The chosen ranges with their roles, and the series they make. A range keeps a role the user gave it (`given`); the
 * others take Origin's rule when no column is designated: text chosen first, with numbers after it, is X (categories);
 * other ranges without numbers are skipped; of those with numbers, the first is X when there are two or more, the rest Y. Each Y is plotted against the nearest X chosen before it (else
 * the first X, else the row number), and takes as its error bars the nearest Y error after it and as its labels the
 * nearest Label after it, before the next Y.
 * Nothing is guessed from the file.
 */
export function selectionPlan(table: DataTable, selection: SheetSelection | null, data: string, given: (cells: CellRange) => RangeRole | undefined = () => undefined): { ranges: PlannedRange[]; pairs: SeriesPair[] } {
  const all = selectionRanges(table, selection, data).map((cells) => {
    const column = table.columns.find((item) => item.key === cells.column);
    return { cells, numeric: !!column && hasNumbers(column, cells.rows) };
  });
  const numeric = all.filter((item) => item.numeric).length;
  // Text chosen first, with numbers after it, is the categories along X, as a spreadsheet's chart takes it.
  const categories = all.length > 1 && !all[0].numeric && numeric > 0;
  let seen = 0;
  const ranges: PlannedRange[] = all.map((item, index) => {
    const own = given(item.cells);
    const automatic: RangeRole = categories && index === 0 ? "x" : !item.numeric ? "skip" : seen++ === 0 && numeric > 1 && !categories ? "x" : "y";
    return { ...item, role: own && (item.numeric || TEXT_ROLES.includes(own)) ? own : automatic };
  });
  const firstX = ranges.find((item) => item.role === "x")?.cells ?? null;
  const pairs: SeriesPair[] = [];
  let x: CellRange | null = null;
  for (const item of ranges) {
    if (item.role === "x") x = item.cells;
    else if (item.role === "y") pairs.push({ x: x ?? firstX, y: item.cells, error: null, labels: null });
    else if (item.role === "yerr" && pairs.length && !pairs[pairs.length - 1].error) pairs[pairs.length - 1].error = item.cells;
    else if (item.role === "label" && pairs.length && !pairs[pairs.length - 1].labels) pairs[pairs.length - 1].labels = item.cells;
  }
  return { ranges, pairs };
}

/** The series a plot of the chosen cells takes, by Origin's rule (`selectionPlan` with no roles given). */
export function selectionPairs(table: DataTable, selection: SheetSelection | null, data: string, given?: (cells: CellRange) => RangeRole | undefined): SeriesPair[] {
  return selectionPlan(table, selection, data, given).pairs;
}

/** A selection as a short phrase for the status line: "B, D" or "B2:C9", Origin's and Excel's way of naming cells. */
export function selectionText(selection: SheetSelection | null, letters: (index: number) => string): string {
  return (selection?.ranges ?? []).map((range) => {
    const columns = range.c0 === range.c1 ? letters(range.c0) : `${letters(range.c0)}:${letters(range.c1)}`;
    if (!range.rows) return columns;
    const { first, last } = range.rows;
    return range.c0 === range.c1 && first === last ? `${letters(range.c0)}${first + 1}` : `${letters(range.c0)}${first + 1}:${letters(range.c1)}${last + 1}`;
  }).join(", ");
}
