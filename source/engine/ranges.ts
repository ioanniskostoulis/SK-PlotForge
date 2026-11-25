// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Cell ranges and their names (2026-11-17). A worksheet is its file read as it is: columns by letter, rows by number,
// nothing named or guessed. What a plot takes is a range of cells, one column and some rows of a worksheet; the user
// may name a range, as Excel's Name Box does, and give it a unit. A name labels those cells: a series of them shows it
// in the legend, and an axis of them "Name (unit)" in its title. A name of a whole column labels any rows of it.
import { columnLetters, hasNumbers, splitUnit, type DataTable } from "./table";
import type { SeriesRows } from "./plot";

/** Cells of one column of a worksheet: the data file, the column by key (DataColumn.key), and its rows (null: all). */
export interface CellRange { data: string; column: string; rows: SeriesRows | null }

/** A named range of the document: its cells, a name unique in the document, and a unit (empty: none). */
export interface NamedRange extends CellRange { id: string; name: string; unit: string }

export class NamedRangeError extends Error {}

/** Whether two ranges are the same cells. */
export function sameCells(a: CellRange, b: CellRange): boolean {
  return a.data === b.data && a.column === b.column && (a.rows === null ? b.rows === null : b.rows !== null && a.rows.first === b.rows.first && a.rows.last === b.rows.last);
}

/**
 * The name that labels a range: one of exactly its cells, else one of the whole column it lies in. A name of some rows
 * does not label other rows of its column.
 */
export function rangeName(names: readonly NamedRange[], cells: CellRange): NamedRange | null {
  return names.find((name) => sameCells(name, cells)) ?? names.find((name) => name.rows === null && name.data === cells.data && name.column === cells.column) ?? null;
}

/** A name's title: "Name (unit)", or the name alone. */
export function rangeTitle(name: Pick<NamedRange, "name" | "unit">): string {
  return name.unit ? `${name.name} (${name.unit})` : name.name;
}

/** The index of a range's column in a table, or −1. */
export function columnIndex(table: DataTable, column: string): number {
  return table.columns.findIndex((item) => item.key === column);
}

/** A column's sheet letters: those of its key ("Column B"), which keep their place when empty columns before it are
 * left out, else of its place in the table. */
export function columnLetterOf(table: DataTable | null, column: string): string {
  const own = /^Column ([A-Z]+)$/.exec(column);
  if (own) return own[1];
  const index = table ? columnIndex(table, column) : -1;
  return index >= 0 ? columnLetters(index) : column;
}

/** The text of a cell by its reference ("B1"), or null when the table has no such cell. */
export function cellAt(table: DataTable, reference: string): string | null {
  const match = /^([A-Z]{1,3})(\d+)$/i.exec(reference.trim());
  if (!match) return null;
  const letters = match[1].toUpperCase(), row = Number(match[2]) - 1;
  const column = table.columns.find((item) => columnLetterOf(table, item.key) === letters);
  return column && row >= 0 && row < table.rows ? column.text[row] ?? "" : null;
}

/** A range's cells as Excel writes them, without the sheet: "B" for a whole column, "B7" for one cell, "B2:B40". */
export function cellsText(cells: CellRange, table: DataTable | null): string {
  const letters = columnLetterOf(table, cells.column);
  if (!cells.rows) return letters;
  const { first, last } = cells.rows;
  return first === last ? `${letters}${first + 1}` : `${letters}${first + 1}:${letters}${last + 1}`;
}

/** A range as Origin and Excel refer to it: "Sheet!B2:B40". */
export function rangeReference(cells: CellRange, sheet: string, table: DataTable | null): string {
  return `${sheet}!${cellsText(cells, table)}`;
}

/** How a range is called in the interface: its name, or its reference. */
export function rangeLabel(names: readonly NamedRange[], cells: CellRange, sheet: string, table: DataTable | null): string {
  return rangeName(names, cells)?.name ?? rangeReference(cells, sheet, table);
}

/**
 * A range's numbers, one per row (NaN where a cell holds none), or why it has none. Rows past the table's end are left
 * out, so that a file read again with fewer rows still draws.
 */
export function rangeValues(cells: CellRange, table: DataTable | null): { values: Float64Array; first: number } | string {
  if (!table) return "Worksheet missing.";
  const column = table.columns.find((item) => item.key === cells.column);
  if (!column) return `No column ${cells.column}.`;
  const first = cells.rows ? cells.rows.first : 0, last = Math.min(cells.rows ? cells.rows.last : Infinity, table.rows - 1);
  if (last < first) return `No row ${first + 1}.`;
  if (!hasNumbers(column, { first, last })) return `${cellsText(cells, table)} holds no numbers.`;
  const values = new Float64Array(last - first + 1);
  for (let row = first; row <= last; row++) values[row - first] = column.values[row] ?? NaN;
  return { values, first };
}

/** A range's cells as text, one per row, as the worksheet shows them; rows past the table's end are left out. */
export function rangeTexts(cells: CellRange, table: DataTable | null): string[] | string {
  if (!table) return "Worksheet missing.";
  const column = table.columns.find((item) => item.key === cells.column);
  if (!column) return `No column ${cells.column}.`;
  const first = cells.rows ? cells.rows.first : 0, last = Math.min(cells.rows ? cells.rows.last : Infinity, table.rows - 1);
  return last < first ? [] : column.text.slice(first, last + 1);
}

/** Why a name cannot be given (empty, a cell reference, or taken by another range), or null. */
export function nameProblem(name: string, names: readonly NamedRange[], except: string | null = null): string | null {
  const text = name.trim();
  if (!text) return "A name cannot be empty.";
  // A cell or block reference (B2, B2:C9) would read as cells; letters alone (SD) are a name, as in Excel.
  if (/^[A-Z]{1,3}\d+(:[A-Z]{1,3}\d+)?$/i.test(text)) return `${text} reads as a cell reference. Choose another name.`;
  if (names.some((other) => other.id !== except && other.name.toLowerCase() === text.toLowerCase())) return `The name ${text} is already used.`;
  return null;
}

/** A new named range, with an id no other has. */
export function newNamedRange(existing: readonly NamedRange[], cells: CellRange, name: string, unit = ""): NamedRange {
  const ids = new Set(existing.map((item) => item.id));
  let n = existing.length + 1;
  while (ids.has(`range-${n}`)) n++;
  return { id: `range-${n}`, data: cells.data, column: cells.column, rows: cells.rows ? { ...cells.rows } : null, name: name.trim(), unit: unit.trim() };
}

/**
 * Names from the first row of each range, as Excel's Create from Selection takes them from the top row: "Time (s)"
 * names the cells below it Time, in s. A range whose first cell is empty or a number, or with nothing below it, is
 * left out. The rows below run to the range's end, or to the table's end for a whole column.
 */
export function namesFromFirstRow(ranges: readonly CellRange[], table: DataTable): { cells: CellRange; name: string; unit: string }[] {
  return ranges.flatMap((cells) => {
    const column = table.columns.find((item) => item.key === cells.column);
    if (!column) return [];
    const first = cells.rows ? cells.rows.first : 0, last = cells.rows ? cells.rows.last : table.rows - 1;
    const text = column.values[first] === null ? (column.text[first] ?? "").trim() : "";
    if (!text || last <= first) return [];
    const { name, unit } = splitUnit(text);
    return [{ cells: { data: cells.data, column: cells.column, rows: { first: first + 1, last } }, name, unit }];
  });
}

// MARK: the document's records

/** A range's cells as stored. */
export function cellsRecord(cells: CellRange): Record<string, unknown> {
  return { data: cells.data, column: cells.column, ...(cells.rows ? { rows: [cells.rows.first, cells.rows.last] } : {}) };
}

/** A range's cells from the document, or null when they are invalid. */
export function parseCells(raw: any): CellRange | null {
  if (!raw || typeof raw !== "object" || typeof raw.data !== "string" || !raw.data || typeof raw.column !== "string" || !raw.column) return null;
  const rows = raw.rows;
  if (rows !== undefined && !(Array.isArray(rows) && rows.length === 2 && rows.every((row: unknown) => Number.isInteger(row) && (row as number) >= 0) && rows[0] <= rows[1])) return null;
  return { data: raw.data, column: raw.column, rows: rows ? { first: rows[0], last: rows[1] } : null };
}

export function rangeRecord(range: NamedRange): Record<string, unknown> {
  return { id: range.id, name: range.name, ...(range.unit ? { unit: range.unit } : {}), ...cellsRecord(range) };
}

/** The named ranges of a document; one stored without them has none. */
export function parseRanges(raw: unknown): NamedRange[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new NamedRangeError("The document has an invalid list of named ranges.");
  const ranges = raw.map((item: any): NamedRange => {
    const cells = parseCells(item);
    if (!cells || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim()) throw new NamedRangeError("The document has an invalid named range.");
    if (item.unit !== undefined && typeof item.unit !== "string") throw new NamedRangeError(`The named range ${item.name} has an invalid unit.`);
    return { id: item.id, name: item.name, unit: item.unit ?? "", ...cells };
  });
  if (new Set(ranges.map((range) => range.id)).size !== ranges.length) throw new NamedRangeError("The document has two named ranges with the same id.");
  if (new Set(ranges.map((range) => range.name.toLowerCase())).size !== ranges.length) throw new NamedRangeError("The document has two ranges of the same name.");
  return ranges;
}

// MARK: references typed

/** A worksheet as a typed reference sees it: its id, name and table (null while it is not read). */
export interface ReferenceSheet { id: string; name: string; table: DataTable | null }

/**
 * Cells from what was typed, as Excel's reference boxes read it: a name of the document (in any case), or a
 * reference to one column, "B", "B7" or "B2:B40", of the sheet given before a "!" (quoted when it holds spaces:
 * 'My data'!B2:B40) or else of `current`. Rows are counted from 1. Returns why it cannot be read otherwise.
 */
export function parseReference(text: string, sheets: readonly ReferenceSheet[], names: readonly NamedRange[], current: string | null): CellRange | string {
  const typed = text.trim();
  if (!typed) return "Type a name, or cells such as B2:B40 or Sheet!B2:B40.";
  const named = names.find((name) => name.name.toLowerCase() === typed.toLowerCase());
  if (named) return { data: named.data, column: named.column, rows: named.rows ? { ...named.rows } : null };
  const match = /^(?:(?:'([^']+)'|([^!]+))!)?\$?([A-Z]{1,3})\$?(\d+)?(?::\$?([A-Z]{1,3})\$?(\d+)?)?$/i.exec(typed);
  if (!match) return `${typed} is not a name or cells. Type a name, or cells such as B2:B40 or Sheet!B2:B40.`;
  const [, quoted, plain, from, firstRow, to, lastRow] = match;
  const sheetName = (quoted ?? plain)?.trim();
  const sheet = sheetName ? sheets.find((item) => item.name.toLowerCase() === sheetName.toLowerCase()) : sheets.find((item) => item.id === current);
  if (!sheet) return sheetName ? `There is no worksheet ${sheetName}.` : "Name the worksheet too, as Sheet!B2:B40.";
  if (to && to.toUpperCase() !== from.toUpperCase()) return `${typed} spans more than one column; a series takes cells of one column.`;
  if (!sheet.table) return `${sheet.name} is not read yet.`;
  const letters = from.toUpperCase();
  const column = sheet.table.columns.find((item) => columnLetterOf(sheet.table, item.key) === letters);
  if (!column) return `${sheet.name} has no column ${letters}.`;
  if ((firstRow === undefined) !== (lastRow === undefined) && to) return `Write both rows, as B2:B40, or none, as B.`;
  const a = firstRow === undefined ? null : Number(firstRow), b = lastRow === undefined ? a : Number(lastRow);
  if (a !== null && (a < 1 || (b ?? a) < 1)) return "Rows are counted from 1.";
  const rows = a === null ? null : { first: Math.min(a, b!) - 1, last: Math.max(a, b!) - 1 };
  return { data: sheet.id, column: column.key, rows };
}
