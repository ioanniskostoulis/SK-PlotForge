// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Data files linked to a document: CSV and other delimited text, and Excel workbooks. A document records where the file
// is, what it was (format, size, checksum), how it is read (delimiter, decimal mark, header, rows to skip, sheet and
// range), the settings of its columns (role and unit), and where its worksheet sits on the work surface. The file itself is only ever read; the table is made from it
// each time the document opens, so a file changed by another tool is shown as it is now.
import { crc32 } from "./checksum";
import { readDelimited, type DecimalMark, type Delimiter, DELIMITERS } from "./delimited";
import { buildTable, COLUMN_ROLES, DataError, type ColumnSetting, type DataTable } from "./table";
import { isLegacyWorkbook, isZip, parseRange, readXlsx, type InflateRaw } from "./xlsx";

export type DataFormat = "text" | "xlsx";
export const DATA_FORMAT_LABELS: Record<DataFormat, string> = { text: "Text", xlsx: "Excel workbook" };
/** File extensions read as data: delimited text, and Excel workbooks (.xls only to be refused with a reason). */
export const DATA_EXTENSIONS = ["csv", "tsv", "tab", "txt", "dat", "xlsx", "xls"] as const;

/** How a data file is read; a null option is found from the file. */
export interface DataReadOptions {
  delimiter: Delimiter | null;
  decimal: DecimalMark | null;
  /** true or false: the first row read is (or is not) the header; null: found from the cells, as older documents did. */
  header: boolean | null;
  skipRows: number;
  /** An Excel sheet by name; null: the first. */
  sheet: string | null;
  /** An Excel range such as `B2:F40`; null: every used cell. */
  range: string | null;
}

/** How a newly linked file is read: as it is, with no header; the delimiter and decimal mark are found from the text. */
export const DEFAULT_READ: DataReadOptions = { delimiter: null, decimal: null, header: false, skipRows: 0, sheet: null, range: null };

/** What a document records about a data file. */
export interface DataSource { format: DataFormat; bytes: number; crc32: string }

export interface ProjectData {
  id: string;
  name: string;
  /** Absolute path while the document is open; null when the browser preview gives none. */
  path: string | null;
  file: string;
  source: DataSource;
  read: DataReadOptions;
  columns: ColumnSetting[];
  /** The worksheet on the work surface (sheet-layout.ts): position and size in content pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A data file read: its table, and what was found or chosen in reading it. */
export interface LoadedData {
  table: DataTable;
  delimiter: Delimiter | null;
  decimal: DecimalMark | null;
  encoding: string | null;
  sheets: string[];
  sheet: string | null;
}

/** Whether a path names a data file, by its extension. */
export function isDataPath(path: string): boolean {
  const match = /\.([^./\\]+)$/.exec(path);
  return !!match && (DATA_EXTENSIONS as readonly string[]).includes(match[1].toLowerCase());
}

/** The format of a data file, from its bytes: a ZIP archive is a workbook, else text. A legacy .xls is refused. */
export function dataFormatOf(bytes: Uint8Array): DataFormat {
  if (isLegacyWorkbook(bytes)) throw new DataError("This is a legacy Excel workbook (.xls). Open it in Excel or Numbers and save it as .xlsx.");
  return isZip(bytes) ? "xlsx" : "text";
}

/** Read a data file into its table, with the document's read options and column settings. */
export async function readData(bytes: Uint8Array, options: DataReadOptions, columns: readonly ColumnSetting[], inflateRaw: InflateRaw): Promise<LoadedData> {
  const format = dataFormatOf(bytes);
  const table = { header: options.header, skipRows: options.skipRows };
  if (format === "xlsx") {
    const read = await readXlsx(bytes, inflateRaw, { sheet: options.sheet, range: options.range });
    return { table: buildTable(read.grid, table, columns), delimiter: null, decimal: null, encoding: null, sheets: read.sheets, sheet: read.sheet };
  }
  const read = readDelimited(bytes, { delimiter: options.delimiter, decimal: options.decimal, comment: "#" });
  return { table: buildTable(read.grid, table, columns), delimiter: read.delimiter, decimal: read.decimal, encoding: read.encoding, sheets: [], sheet: null };
}

export function describeData(bytes: Uint8Array): DataSource {
  return { format: dataFormatOf(bytes), bytes: bytes.length, crc32: crc32(bytes) };
}

/** A new data link, named after its file (made unique in the document); the id is unique within the document. */
export function newProjectData(existing: readonly ProjectData[], path: string | null, file: string, source: DataSource, read: DataReadOptions, columns: ColumnSetting[], box: { x: number; y: number; width: number; height: number }): ProjectData {
  const ids = new Set(existing.map((data) => data.id));
  let n = existing.length + 1;
  while (ids.has(`data-${n}`)) n++;
  const stem = file.replace(/\.[^.]+$/, "") || file;
  const names = new Set(existing.map((data) => data.name.toLowerCase()));
  let name = stem;
  for (let copy = 2; names.has(name.toLowerCase()); copy++) name = `${stem} ${copy}`;
  return { id: `data-${n}`, name, path, file, source, read: { ...read }, columns, x: box.x, y: box.y, width: box.width, height: box.height };
}

// MARK: the document's records

/** A data link's read options in a fixed key order, each left out while it is automatic. */
export function readRecord(read: DataReadOptions): Record<string, unknown> {
  return {
    ...(read.delimiter !== null ? { delimiter: read.delimiter } : {}),
    ...(read.decimal !== null ? { decimal: read.decimal } : {}),
    ...(read.header !== null ? { header: read.header } : {}),
    ...(read.skipRows ? { skipRows: read.skipRows } : {}),
    ...(read.sheet !== null ? { sheet: read.sheet } : {}),
    ...(read.range !== null ? { range: read.range } : {}),
  };
}

/** Read options from the document; an invalid one is refused, so a damaged document is not opened as if it were whole. */
export function parseRead(raw: unknown): DataReadOptions {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // A document that does not say leaves the header to be found, as every document did before files were read as they are.
  const read: DataReadOptions = { ...DEFAULT_READ, header: null };
  if (value.delimiter !== undefined) {
    if (!DELIMITERS.includes(value.delimiter as Delimiter)) throw new DataError("The document has an invalid delimiter.");
    read.delimiter = value.delimiter as Delimiter;
  }
  if (value.decimal !== undefined) {
    if (value.decimal !== "." && value.decimal !== ",") throw new DataError("The document has an invalid decimal mark.");
    read.decimal = value.decimal;
  }
  if (value.header !== undefined) {
    if (typeof value.header !== "boolean") throw new DataError("The document has an invalid header setting.");
    read.header = value.header;
  }
  if (value.skipRows !== undefined) {
    if (!Number.isInteger(value.skipRows) || (value.skipRows as number) < 0) throw new DataError("The document has an invalid number of rows to skip.");
    read.skipRows = value.skipRows as number;
  }
  if (value.sheet !== undefined) {
    if (typeof value.sheet !== "string" || !value.sheet) throw new DataError("The document has an invalid sheet name.");
    read.sheet = value.sheet;
  }
  if (value.range !== undefined) {
    if (typeof value.range !== "string" || !parseRange(value.range)) throw new DataError("The document has an invalid cell range.");
    read.range = value.range.toUpperCase();
  }
  return read;
}

/** Column settings from the document. */
export function parseColumnSettings(raw: unknown): ColumnSetting[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new DataError("The document has invalid column settings.");
  const keys = new Set<string>();
  return raw.map((item) => {
    if (!item || typeof item !== "object" || typeof item.key !== "string" || !COLUMN_ROLES.includes(item.role)) throw new DataError("The document has an invalid column setting.");
    if (keys.has(item.key)) throw new DataError(`The document has two settings for the column ${item.key}.`);
    keys.add(item.key);
    if (item.unit !== undefined && typeof item.unit !== "string") throw new DataError(`The document has an invalid unit for the column ${item.key}.`);
    if (item.name !== undefined && (typeof item.name !== "string" || !item.name.trim())) throw new DataError(`The document has an invalid name for the column ${item.key}.`);
    return { key: item.key, role: item.role, ...(item.name !== undefined ? { name: item.name } : {}), ...(item.unit !== undefined ? { unit: item.unit } : {}) };
  });
}

// MARK: the read options in words

/** A range as typed: `b2:f40` becomes `B2:F40`; empty or `all` is every used cell (null); otherwise an error. */
export function parseRangeInput(text: string): string | null {
  const value = text.trim().toUpperCase();
  if (!value || value === "ALL") return null;
  if (!parseRange(value)) throw new DataError(`${text.trim()} is not a cell range. Write it as B2:F40, or leave it empty for every used cell.`);
  return value;
}
