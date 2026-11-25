// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A data table: the grid of cells a file was read into, turned into named columns. A file is read as it is: every row
// a row, no header unless the user says the first row is one, and no role until the user gives one (an older document
// that left the header to be found keeps that). Each column gets a kind (number, date or text), a name and unit from its
// header (`Time (s)`) or the user's settings, a role for plotting (X, Y, error, label, ignored or none) and its
// statistics. A cell that holds a number is a value even in a column that also holds text, so that a block of numbers
// below a heading in the middle of a sheet can be plotted. The source file is never changed.

/** A data file that cannot be read; the message says why, for the user. */
export class DataError extends Error {}

/** One cell as read: empty, a number, text, a truth value, or a date in milliseconds since 1970 (UTC). */
export type RawCell = string | number | boolean | null | { date: number };
/** A block of cells merged into one, as a workbook's Merge Cells: its first and last row and column, both included. */
export interface CellMerge { r0: number; c0: number; r1: number; c1: number }

/**
 * Cells as read; a workbook's merged blocks, the text its number formats show (by "row,column"), its column widths and
 * its hidden rows, when it has them. Widths are Excel's pixels at 100 % (64 for a standard column), 0 for a hidden
 * column, null for one at the sheet's standard width (`standardWidth`, else the worksheet's own default).
 */
export interface RawGrid { rows: RawCell[][]; merges?: CellMerge[]; shown?: Map<string, string>; widths?: (number | null)[]; standardWidth?: number; hiddenRows?: number[] }

export type ColumnKind = "number" | "date" | "text" | "empty";
export type ColumnRole = "none" | "x" | "y" | "error" | "label" | "ignored";
export const COLUMN_ROLES: readonly ColumnRole[] = ["none", "x", "y", "error", "label", "ignored"];
export const ROLE_NAMES: Record<ColumnRole, string> = { none: "None", x: "X", y: "Y", error: "Error", label: "Label", ignored: "Ignored" };

export interface ColumnStats { count: number; missing: number; min: number | null; max: number | null; mean: number | null; sd: number | null }

export interface DataColumn {
  /** The header as written (or `Column A` when there is none); unique within the table. Settings are keyed by it. */
  key: string;
  /** The name without its unit (with the number that made it unique), or the one set in the settings. */
  name: string;
  unit: string;
  /** The unit written in the header; a unit in the settings replaces it. */
  headerUnit: string;
  kind: ColumnKind;
  role: ColumnRole;
  /** The value of each row: a number (a date's milliseconds), null when empty or not a number, also in a text column. */
  values: (number | null)[];
  /** The text of each row as shown in the worksheet. */
  text: string[];
  stats: ColumnStats;
}

export interface DataTable {
  /** The row of the grid the header was read from; null: no header. The header is the table's first row, not data. */
  headerRow: number | null;
  /** The first row of data: 1 below a header, else 0. */
  dataStart: number;
  /** Grid rows before the header (or the first data row) that were skipped. */
  skipped: number;
  rows: number;
  columns: DataColumn[];
  /** Merged blocks of cells (workbooks only), in the table's rows and columns; empty for text files. */
  merges: CellMerge[];
  /** Each column's width from the workbook, in Excel's pixels (0: hidden); null: the worksheet's default. Empty for text files. */
  widths: (number | null)[];
  /** The rows the workbook hides, in the table's rows, in order. Their cells are read and plotted as any other. */
  hiddenRows: number[];
}

/** The document's settings for one column, keyed by its header. A name or unit given here replaces the header's. */
export interface ColumnSetting { key: string; role: ColumnRole; name?: string; unit?: string }

export interface TableOptions {
  /** true: the first row read is the header; false: there is none; null: found from the cells (older documents). */
  header: boolean | null;
  /** Grid rows to skip before the header or data. */
  skipRows: number;
}

export const DEFAULT_TABLE: TableOptions = { header: false, skipRows: 0 };

/** Spreadsheet letters of a zero-based column: 0 is A, 26 is AA. */
export function columnLetters(index: number): string {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

/** A header split into its name and unit: `Time (s)`, `Time [s]` and `Time / s` give `Time` and `s`. */
export function splitUnit(header: string): { name: string; unit: string } {
  const text = header.trim();
  const bracket = /^(.*\S)\s*[([]\s*([^()[\]]+?)\s*[)\]]$/.exec(text);
  if (bracket) return { name: bracket[1], unit: bracket[2] };
  const slash = /^(.*\S)\s+\/\s+(\S.*)$/.exec(text);
  if (slash) return { name: slash[1], unit: slash[2] };
  return { name: text, unit: "" };
}

const ERROR_NAME = /(^|[\s_\-(])(err|error|errors|sd|sem|se|std|stdev|stddev|uncertainty|σ|±)($|[\s_\-)])/i;

/** The text a cell shows. */
export function cellText(cell: RawCell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : cell > 0 ? "∞" : cell < 0 ? "−∞" : "NaN";
  if (typeof cell === "boolean") return cell ? "TRUE" : "FALSE";
  if (typeof cell === "string") return cell;
  return formatDate(cell.date);
}

/** A date as ISO text: the day alone at midnight, else with the time (seconds and milliseconds only when set). */
export function formatDate(ms: number): string {
  const iso = new Date(ms).toISOString();
  if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
  if (iso.endsWith(".000Z")) return iso.slice(0, 19).replace("T", " ").replace(/:00$/, "");
  return iso.slice(0, 23).replace("T", " ");
}

const isNumeric = (cell: RawCell) => typeof cell === "number";
const isText = (cell: RawCell) => typeof cell === "string";

/** Whether a row is a header above the rows below it: no numbers, some text, and a column below it that has numbers. */
export function looksLikeHeader(row: readonly RawCell[], below: readonly (readonly RawCell[])[]): boolean {
  if (!row.some(isText) || row.some((cell) => isNumeric(cell) || (cell !== null && typeof cell === "object"))) return false;
  if (!below.length) return false;
  return row.some((_, column) => below.slice(0, 20).some((next) => next[column] !== undefined && !isText(next[column]) && next[column] !== null));
}

/** Whether a row holds a single text cell and nothing else: a sheet title. */
function isTitleRow(row: readonly RawCell[] | undefined): boolean {
  const filled = (row ?? []).filter((cell) => cell !== null);
  return filled.length === 1 && isText(filled[0]);
}

export function columnStats(values: readonly (number | null)[]): ColumnStats {
  let count = 0; let sum = 0; let min = Infinity; let max = -Infinity;
  for (const value of values) if (value !== null && Number.isFinite(value)) { count++; sum += value; if (value < min) min = value; if (value > max) max = value; }
  const missing = values.length - count;
  if (!count) return { count, missing, min: null, max: null, mean: null, sd: null };
  const mean = sum / count;
  let squares = 0;
  for (const value of values) if (value !== null && Number.isFinite(value)) squares += (value - mean) ** 2;
  return { count, missing, min, max, mean, sd: count > 1 ? Math.sqrt(squares / (count - 1)) : null };
}

/** The kind of a column from its cells: all non-empty cells numbers (or truth values), all dates, else text. */
function kindOf(cells: readonly RawCell[]): ColumnKind {
  const filled = cells.filter((cell) => cell !== null);
  if (!filled.length) return "empty";
  if (filled.every((cell) => typeof cell === "number" || typeof cell === "boolean")) return "number";
  if (filled.every((cell) => typeof cell === "object")) return "date";
  return "text";
}

function valueOf(cell: RawCell): number | null {
  if (typeof cell === "number") return cell;
  if (typeof cell === "boolean") return cell ? 1 : 0;
  if (cell !== null && typeof cell === "object") return cell.date;
  return null;
}

/**
 * The role a column takes when the document has none for it: the first number or date column is X, an error-named one
 * Error, other numbers Y. A date column after the X is left out (a time stamp beside the data, not a value to plot).
 */
/** The roles that plot a column's values; a column without numbers can only be a label, ignored or have none. */
export const PLOTTED_ROLES: readonly ColumnRole[] = ["x", "y", "error"];

function autoRole(column: Pick<DataColumn, "kind" | "name">, xTaken: boolean): ColumnRole {
  if (column.kind === "empty") return "ignored";
  if (column.kind === "text") return "label";
  if (!xTaken) return "x";
  if (column.kind === "date") return "ignored";
  return ERROR_NAME.test(column.name) ? "error" : "y";
}

/**
 * A table from a grid. Settings give each column's role, name and unit by key; columns without one have no role. Only
 * an older document that left the header to be found has title rows at the top skipped and roles guessed.
 */
export function buildTable(grid: RawGrid, options: TableOptions = DEFAULT_TABLE, settings: readonly ColumnSetting[] = []): DataTable {
  let start = Math.max(0, Math.floor(options.skipRows));
  const guess = options.header === null;
  // Blank rows at the top hold nothing and are skipped.
  while (start < grid.rows.length && grid.rows[start].every((cell) => cell === null)) start++;
  // A title row above the header (one text cell, as Excel sheets often have) is skipped too, when nothing was set.
  if (!options.skipRows && guess) {
    for (let titles = 0; titles < 3 && isTitleRow(grid.rows[start]); titles++) {
      let next = start + 1;
      while (next < grid.rows.length && grid.rows[next].every((cell) => cell === null)) next++;
      if (!looksLikeHeader(grid.rows[next] ?? [], grid.rows.slice(next + 1))) break;
      start = next;
    }
  }
  const rest = grid.rows.slice(start);
  const header = options.header ?? looksLikeHeader(rest[0] ?? [], rest.slice(1));
  const headerCells = header ? rest[0] ?? [] : [];
  // The header stays the first row, as in a spreadsheet: it names the columns and is shown as row 1, but it is not data
  // (no value, and not in a column's kind or statistics). Trailing blank rows are dropped; blank rows inside are kept.
  let data = rest.slice(0);
  let end = data.length;
  while (end > 0 && data[end - 1].every((cell) => cell === null)) end--;
  data = data.slice(0, end);
  let width = headerCells.length;
  for (const row of data) width = Math.max(width, row.length);
  // Trailing columns with neither a header nor a value are dropped.
  const filled = (column: number) => (headerCells[column] ?? null) !== null || data.some((row) => (row[column] ?? null) !== null);
  while (width > 0 && !filled(width - 1)) width--;
  // So are columns before the table (a sheet whose table starts in column B); a column keeps its sheet letter.
  let first = 0;
  while (first < width && !filled(first)) first++;
  const used = new Set<string>();
  const names = Array.from({ length: width - first }, (_, offset) => {
    const index = first + offset;
    const written = header ? cellText(headerCells[index] ?? null).trim() : "";
    const base = written || `Column ${columnLetters(index)}`;
    let key = base; let copy = 1;
    while (used.has(key)) key = `${base} (${++copy})`;
    used.add(key);
    return { base, key, copy };
  });
  // Settings of columns this reading does not have (another sheet, another header row) are kept but not used.
  const bySetting = new Map(settings.filter((setting) => used.has(setting.key)).map((setting) => [setting.key, setting]));
  let xTaken = [...bySetting.values()].some((setting) => setting.role === "x");
  const columns: DataColumn[] = [];
  for (let index = first; index < width; index++) {
    const { base, key, copy } = names[index - first];
    const cells = data.map((row) => row[index] ?? null);
    const kind = kindOf(header ? cells.slice(1) : cells);
    const values = cells.map((cell, row) => (header && row === 0 ? null : valueOf(cell)));
    const split = splitUnit(base);
    const setting = bySetting.get(key);
    const column: DataColumn = {
      key, name: setting?.name ?? (copy > 1 ? `${split.name} (${copy})` : split.name), unit: setting?.unit ?? split.unit, headerUnit: split.unit, kind, role: "ignored",
      // A workbook's cells read as its number formats show them; others as they are.
      values, text: cells.map((cell, row) => grid.shown?.get(`${start + row},${index}`) ?? cellText(cell)), stats: columnStats(header ? values.slice(1) : values),
    };
    if (setting && (column.stats.count > 0 || !PLOTTED_ROLES.includes(setting.role))) column.role = setting.role;
    else if (guess) { column.role = autoRole(column, xTaken); if (column.role === "x") xTaken = true; }
    else column.role = "none";
    columns.push(column);
  }
  // Merged blocks in the table's own rows and columns: moved by the rows and columns left out before it, cut to it.
  const merges = (grid.merges ?? []).flatMap((merge) => {
    const r0 = Math.max(0, merge.r0 - start), r1 = Math.min(data.length - 1, merge.r1 - start);
    const c0 = Math.max(0, merge.c0 - first), c1 = Math.min(width - first - 1, merge.c1 - first);
    return r1 >= r0 && c1 >= c0 && (r1 > r0 || c1 > c0) ? [{ r0, c0, r1, c1 }] : [];
  });
  // Widths and hidden rows, as the merges, in the table's own columns and rows.
  const widths = grid.widths || grid.standardWidth !== undefined ? columns.map((_, offset) => grid.widths?.[first + offset] ?? grid.standardWidth ?? null) : [];
  const hiddenRows = (grid.hiddenRows ?? []).map((row) => row - start).filter((row) => row >= 0 && row < data.length);
  return { headerRow: header ? start : null, dataStart: header ? 1 : 0, skipped: start, rows: data.length, columns, merges, widths, hiddenRows };
}

/** The settings a table's columns are stored with: every column's role, and its name and unit only when set. */
export function columnSettings(table: DataTable, settings: readonly ColumnSetting[] = []): ColumnSetting[] {
  return table.columns.map((column) => {
    const name = settings.find((setting) => setting.key === column.key)?.name;
    return { key: column.key, role: column.role, ...(name !== undefined ? { name } : {}), ...(column.unit !== column.headerUnit ? { unit: column.unit } : {}) };
  });
}

/** Whether a column has a number in these rows (null: any row): what a series needs of its X and Y. */
export function hasNumbers(column: Pick<DataColumn, "values">, rows: { first: number; last: number } | null = null): boolean {
  const first = rows ? rows.first : 0, last = rows ? Math.min(rows.last, column.values.length - 1) : column.values.length - 1;
  for (let row = first; row <= last; row++) if (column.values[row] !== null) return true;
  return false;
}

/** An axis title for a column: its name, with the unit in parentheses when it has one. */
export function columnTitle(column: Pick<DataColumn, "name" | "unit">): string {
  return column.unit ? `${column.name} (${column.unit})` : column.name;
}
