// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Excel workbooks (.xlsx, Office Open XML), read-only, into a grid of cells. An .xlsx file is a ZIP archive of XML
// parts: the workbook lists the sheets, the shared strings hold the text, the styles say which numbers are dates, and
// each sheet holds its cells. Only what a table needs is read: values, the cached result of a formula (nothing is
// recalculated), text, truth values and dates. The raw deflate of the archive is done by the caller's function
// (DecompressionStream, node:zlib), as for PNG. The legacy binary .xls format is refused with a message.
import { DataError, type CellMerge, type RawCell, type RawGrid } from "./table";
import { BUILT_IN_FORMATS, formatDateCode, formatNumber, generalNumber } from "./number-format";
import { parseIsoDate } from "./delimited";

export type InflateRaw = (data: Uint8Array) => Promise<Uint8Array>;

export interface XlsxOptions {
  /** The sheet by name; null: the first. */
  sheet: string | null;
  /** A range such as `B2:F40`; null: every used cell. */
  range: string | null;
}

export const DEFAULT_XLSX: XlsxOptions = { sheet: null, range: null };

export interface XlsxResult { grid: RawGrid; sheets: string[]; sheet: string }

// MARK: file kinds

/** Whether the bytes start as a ZIP archive does (an .xlsx file). */
export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** Whether the bytes are a compound document (a legacy .xls workbook). */
export function isLegacyWorkbook(bytes: Uint8Array): boolean {
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

// MARK: ZIP

interface ZipEntry { name: string; method: number; compressedSize: number; localOffset: number }

const u16 = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8);
const u32 = (bytes: Uint8Array, at: number) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

/** The entries of a ZIP archive, from its central directory. ZIP64 archives (over 4 GB) are refused. */
export function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at--) {
    if (u32(bytes, at) === 0x06054b50) { end = at; break; }
  }
  if (end < 0) throw new DataError("The workbook is damaged: its archive has no directory.");
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  if (at === 0xffffffff || count === 0xffff) throw new DataError("The workbook is too large to read (ZIP64).");
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder("utf-8");
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || u32(bytes, at) !== 0x02014b50) throw new DataError("The workbook is damaged: its archive directory is broken.");
    const nameLength = u16(bytes, at + 28);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, { name, method: u16(bytes, at + 10), compressedSize: u32(bytes, at + 20), localOffset: u32(bytes, at + 42) });
    at += 46 + nameLength + u16(bytes, at + 30) + u16(bytes, at + 32);
  }
  return entries;
}

/** The bytes of one archive entry, inflated when it is compressed. */
async function entryBytes(bytes: Uint8Array, entry: ZipEntry, inflateRaw: InflateRaw): Promise<Uint8Array> {
  const at = entry.localOffset;
  if (u32(bytes, at) !== 0x04034b50) throw new DataError(`The workbook is damaged: ${entry.name} cannot be found.`);
  const start = at + 30 + u16(bytes, at + 26) + u16(bytes, at + 28);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRaw(data);
  throw new DataError(`The workbook uses a compression PlotForge cannot read (method ${entry.method}).`);
}

// MARK: XML

export interface XmlToken { kind: "open" | "close" | "text"; name: string; attributes: Record<string, string>; selfClosing: boolean; text: string }

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Text with its XML entities (named and numeric) replaced. */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name] ?? whole;
  });
}

/** The tokens of an XML text: element opens and closes (names without their namespace prefix) and text. */
export function* xmlTokens(xml: string): Generator<XmlToken> {
  const pattern = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<[?!][\s\S]*?>|<(\/?)([\w:.-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;
  for (let match = pattern.exec(xml); match; match = pattern.exec(xml)) {
    if (match[1] !== undefined) { yield { kind: "text", name: "", attributes: {}, selfClosing: false, text: match[1] }; continue; }
    if (match[6] !== undefined) { yield { kind: "text", name: "", attributes: {}, selfClosing: false, text: decodeEntities(match[6]) }; continue; }
    if (match[3] === undefined) continue; // a comment, declaration or processing instruction
    const name = match[3].includes(":") ? match[3].slice(match[3].indexOf(":") + 1) : match[3];
    const attributes: Record<string, string> = {};
    if (match[4]) for (const attribute of match[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attributes[attribute[1]] = decodeEntities(attribute[2] ?? attribute[3] ?? "");
    }
    yield { kind: match[2] ? "close" : "open", name, attributes, selfClosing: match[5] === "/", text: "" };
  }
}

// MARK: workbook parts

const decoder = new TextDecoder("utf-8");

/** The sheets of a workbook in order, with the archive path of each, and whether its dates count from 1904. */
function readWorkbook(workbookXml: string, relsXml: string): { sheets: { name: string; path: string }[]; date1904: boolean } {
  const targets = new Map<string, string>();
  for (const token of xmlTokens(relsXml)) {
    if (token.kind === "open" && token.name === "Relationship" && token.attributes.Id) targets.set(token.attributes.Id, token.attributes.Target ?? "");
  }
  const sheets: { name: string; path: string }[] = [];
  let date1904 = false;
  for (const token of xmlTokens(workbookXml)) {
    if (token.kind !== "open") continue;
    if (token.name === "workbookPr") date1904 = token.attributes.date1904 === "1" || token.attributes.date1904 === "true";
    if (token.name === "sheet") {
      const id = token.attributes["r:id"] ?? Object.entries(token.attributes).find(([key]) => key.endsWith(":id"))?.[1] ?? "";
      const target = targets.get(id);
      if (!target) continue;
      // A target is relative to xl/, or absolute from the archive root.
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
      sheets.push({ name: token.attributes.name ?? `Sheet ${sheets.length + 1}`, path });
    }
  }
  return { sheets, date1904 };
}

/** The shared strings, in order; a rich string's runs are joined, its phonetic runs left out. */
function readSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  let current: string | null = null;
  let inText = false;
  let phonetic = 0;
  for (const token of xmlTokens(xml)) {
    if (token.kind === "open") {
      if (token.name === "si") { current = ""; if (token.selfClosing) { strings.push(""); current = null; } }
      else if (token.name === "rPh") { if (!token.selfClosing) phonetic++; }
      else if (token.name === "t") inText = !token.selfClosing;
    } else if (token.kind === "close") {
      if (token.name === "si" && current !== null) { strings.push(current); current = null; }
      else if (token.name === "rPh") phonetic--;
      else if (token.name === "t") inText = false;
    } else if (inText && current !== null && !phonetic) current += token.text;
  }
  return strings;
}

/** Built-in number formats that show a date or time (ECMA-376 18.8.30, with the East Asian ones). */
const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** Whether a format code shows a date or time: a d, m, y, h or s outside quotes, escapes and brackets. Elapsed times ([h]) are numbers. */
export function isDateFormat(code: string): boolean {
  if (/\[(h+|m+|s+)\]/i.test(code)) return false;
  const bare = code.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, "").split(";")[0];
  return /[dmyhs]/i.test(bare) && !/^general$/i.test(bare.trim());
}

/** For each cell style (the `s` of a cell), whether it shows a date, and its number format code (General without one). */
function readStyles(xml: string): { date: boolean[]; code: string[] } {
  const custom = new Map<number, string>();
  const styles: boolean[] = [], codes: string[] = [];
  let inCellXfs = false;
  for (const token of xmlTokens(xml)) {
    if (token.kind === "open" && token.name === "numFmt") custom.set(Number(token.attributes.numFmtId), token.attributes.formatCode ?? "");
    else if (token.kind === "open" && token.name === "cellXfs") inCellXfs = !token.selfClosing;
    else if (token.kind === "close" && token.name === "cellXfs") inCellXfs = false;
    else if (inCellXfs && token.kind === "open" && token.name === "xf") {
      const id = Number(token.attributes.numFmtId ?? 0);
      styles.push(custom.has(id) ? isDateFormat(custom.get(id)!) : DATE_FORMAT_IDS.has(id));
      codes.push(custom.get(id) ?? BUILT_IN_FORMATS[id] ?? "General");
    }
  }
  return { date: styles, code: codes };
}

/** A serial day number as milliseconds since 1970 (UTC). The 1900 system keeps Excel's leap day of 1900 for serials from 61. */
export function serialToMs(serial: number, date1904: boolean): number {
  const days = date1904 ? serial - 24107 : serial < 61 ? serial - 25568 : serial - 25569;
  return Math.round(days * 86400000);
}

// MARK: cells

/** A cell reference such as `C12` as zero-based column and row; null when it is not one. */
export function parseCellRef(ref: string): { column: number; row: number } | null {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref.trim());
  if (!match) return null;
  let column = 0;
  for (const letter of match[1].toUpperCase()) column = column * 26 + (letter.charCodeAt(0) - 64);
  return { column: column - 1, row: Number(match[2]) - 1 };
}

/** A range such as `B2:F40` (or one cell) as zero-based corners; null when it is not one. */
export function parseRange(range: string): { first: { column: number; row: number }; last: { column: number; row: number } } | null {
  const [a, b = a] = range.split(":");
  const first = parseCellRef(a ?? ""); const last = parseCellRef(b);
  if (!first || !last) return null;
  return {
    first: { column: Math.min(first.column, last.column), row: Math.min(first.row, last.row) },
    last: { column: Math.max(first.column, last.column), row: Math.max(first.row, last.row) },
  };
}

/** The cells of one sheet, as a grid from A1 (or from the range's first cell). */
function readSheet(xml: string, strings: readonly string[], styles: { date: readonly boolean[]; code: readonly string[] }, date1904: boolean, range: ReturnType<typeof parseRange>): RawGrid {
  const rows: RawCell[][] = [], merges: CellMerge[] = [], shown = new Map<string, string>();
  const columnSpecs: { min: number; max: number; width: number }[] = [], hiddenRows: number[] = [];
  let standardWidth: number | undefined;
  const dateStyles = styles.date;
  let row = -1; let column = -1;
  let cell: { ref: string; type: string; style: number } | null = null;
  let value = ""; let inValue = false; let inInline = false; let inText = false;
  let inline = "";
  const put = (r: number, c: number, content: RawCell, text: string | null = null) => {
    if (content === null) return;
    if (range && (r < range.first.row || r > range.last.row || c < range.first.column || c > range.last.column)) return;
    const gridRow = r - (range?.first.row ?? 0); const gridColumn = c - (range?.first.column ?? 0);
    while (rows.length <= gridRow) rows.push([]);
    const line = rows[gridRow];
    while (line.length < gridColumn) line.push(null);
    line[gridColumn] = content;
    if (text !== null) shown.set(`${gridRow},${gridColumn}`, text);
  };
  const finish = () => {
    if (!cell) return;
    const ref = parseCellRef(cell.ref);
    if (ref) { row = ref.row; column = ref.column; } else column++;
    let content: RawCell = null;
    const raw = value.trim();
    switch (cell.type) {
      case "s": content = strings[Number(raw)] ?? null; break;
      case "inlineStr": content = inline || null; break;
      case "str": content = value || null; break;
      case "b": content = raw === "" ? null : raw === "1" || raw === "true"; break;
      case "e": content = null; break;
      case "d": { const ms = parseIsoDate(raw); content = ms === null ? (raw || null) : { date: ms }; break; }
      default: {
        if (raw === "") break;
        const number = Number(raw);
        if (!Number.isFinite(number)) { content = raw; break; }
        content = dateStyles[cell.style] ? { date: serialToMs(number, date1904) } : number;
      }
    }
    // The text Excel shows, by the cell's number format: the value itself is kept for plotting.
    const code = styles.code[cell.style] ?? "General";
    const text = typeof content === "number" ? formatNumber(content, code) ?? generalNumber(content) : content !== null && typeof content === "object" ? formatDateCode(content.date, code) : null;
    put(row, column, content, text);
    cell = null;
  };
  for (const token of xmlTokens(xml)) {
    if (token.kind === "open") {
      switch (token.name) {
        case "row": {
          const r = Number(token.attributes.r);
          row = Number.isInteger(r) && r > 0 ? r - 1 : row + 1;
          column = -1;
          if (isTrue(token.attributes.hidden) && (!range || (row >= range.first.row && row <= range.last.row))) hiddenRows.push(row - (range?.first.row ?? 0));
          break;
        }
        // Column widths and hidden columns (Format > Column), and the sheet's standard width.
        case "col": {
          const min = Number(token.attributes.min), max = Number(token.attributes.max);
          if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) break;
          const width = isTrue(token.attributes.hidden) ? 0 : token.attributes.width !== undefined ? columnPixels(Number(token.attributes.width)) : null;
          if (width !== null && Number.isFinite(width)) columnSpecs.push({ min: min - 1, max: max - 1, width });
          break;
        }
        case "sheetFormatPr": {
          const width = Number(token.attributes.defaultColWidth);
          if (token.attributes.defaultColWidth !== undefined && Number.isFinite(width) && width > 0) standardWidth = columnPixels(width);
          break;
        }
        case "c":
          cell = { ref: token.attributes.r ?? "", type: token.attributes.t ?? "n", style: Number(token.attributes.s ?? 0) };
          value = ""; inline = "";
          if (token.selfClosing) finish();
          break;
        case "v": inValue = !token.selfClosing; break;
        case "is": inInline = !token.selfClosing; break;
        case "t": inText = inInline && !token.selfClosing; break;
        case "rPh": inText = false; break;
        // Merged cells, as the grid has them: from the range's first cell, cut to the range.
        case "mergeCell": {
          const block = parseRange(token.attributes.ref ?? "");
          if (!block) break;
          const top = range?.first.row ?? 0, left = range?.first.column ?? 0;
          const bottom = range ? range.last.row : Infinity, rightmost = range ? range.last.column : Infinity;
          const r0 = Math.max(block.first.row, top), r1 = Math.min(block.last.row, bottom), c0 = Math.max(block.first.column, left), c1 = Math.min(block.last.column, rightmost);
          if (r1 >= r0 && c1 >= c0) merges.push({ r0: r0 - top, c0: c0 - left, r1: r1 - top, c1: c1 - left });
          break;
        }
      }
    } else if (token.kind === "close") {
      switch (token.name) {
        case "c": finish(); break;
        case "v": inValue = false; break;
        case "is": inInline = false; break;
        case "t": inText = false; break;
      }
    } else if (inValue) value += token.text;
    else if (inText) inline += token.text;
  }
  // Widths for the columns the grid has, from the range's first column; a span may run to the sheet's last column.
  const left = range?.first.column ?? 0, columns = rows.reduce((most, line) => Math.max(most, line.length), 0);
  const widths: (number | null)[] = Array.from({ length: columns }, () => null);
  for (const spec of columnSpecs) for (let c = Math.max(spec.min, left); c <= Math.min(spec.max, left + columns - 1); c++) widths[c - left] = spec.width;
  return { rows, merges, shown, widths, standardWidth, hiddenRows };
}

const isTrue = (value: string | undefined) => value === "1" || value === "true";

/**
 * A column width in characters (as the workbook stores it, padding included) in Excel's pixels at 100 %, for the
 * maximum digit width of the default font (7 px for Calibri 11): 8.43 characters, stored as 9.140625, is 64 px.
 */
export function columnPixels(characters: number): number {
  const digit = 7;
  return Math.max(0, Math.trunc(((256 * characters + Math.trunc(128 / digit)) / 256) * digit));
}

/** The sheet names of a workbook, in order. */
export async function xlsxSheets(bytes: Uint8Array, inflateRaw: InflateRaw): Promise<string[]> {
  const entries = zipEntries(bytes);
  const part = async (name: string) => { const entry = entries.get(name); return entry ? decoder.decode(await entryBytes(bytes, entry, inflateRaw)) : ""; };
  return readWorkbook(await part("xl/workbook.xml"), await part("xl/_rels/workbook.xml.rels")).sheets.map((sheet) => sheet.name);
}

/** One sheet of a workbook read into a grid; the first sheet when none is named. */
export async function readXlsx(bytes: Uint8Array, inflateRaw: InflateRaw, options: XlsxOptions = DEFAULT_XLSX): Promise<XlsxResult> {
  if (isLegacyWorkbook(bytes)) throw new DataError("This is a legacy Excel workbook (.xls). Open it in Excel or Numbers and save it as .xlsx.");
  if (!isZip(bytes)) throw new DataError("The file is not an Excel workbook (.xlsx).");
  const entries = zipEntries(bytes);
  const part = async (name: string, needed: boolean) => {
    const entry = entries.get(name);
    if (!entry) { if (needed) throw new DataError(`The workbook is damaged: it has no ${name}.`); return ""; }
    return decoder.decode(await entryBytes(bytes, entry, inflateRaw));
  };
  const workbook = readWorkbook(await part("xl/workbook.xml", true), await part("xl/_rels/workbook.xml.rels", true));
  if (!workbook.sheets.length) throw new DataError("The workbook has no sheets.");
  const chosen = options.sheet === null ? workbook.sheets[0] : workbook.sheets.find((sheet) => sheet.name === options.sheet);
  if (!chosen) throw new DataError(`The workbook has no sheet named ${options.sheet}.`);
  const range = options.range ? parseRange(options.range) : null;
  if (options.range && !range) throw new DataError(`${options.range} is not a cell range. Write it as B2:F40.`);
  if (!entries.has(chosen.path)) throw new DataError(`The sheet ${chosen.name} is not a worksheet (a chart sheet, perhaps).`);
  const strings = readSharedStrings(await part("xl/sharedStrings.xml", false));
  const styles = readStyles(await part("xl/styles.xml", false));
  const grid = readSheet(await part(chosen.path, true), strings, styles, workbook.date1904, range);
  return { grid, sheets: workbook.sheets.map((sheet) => sheet.name), sheet: chosen.name };
}
