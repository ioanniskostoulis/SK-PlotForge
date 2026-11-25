// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Delimited text (CSV, TSV and their relatives) read into a grid of cells. The bytes are decoded (UTF-8, UTF-16 with a
// byte order mark, else Windows-1252), then split into records with RFC 4180 quoting. The delimiter, the decimal mark
// and comment lines are found from the text when they are not given. Nothing here changes the file.
import type { RawCell, RawGrid } from "./table";

export type Delimiter = "," | "\t" | ";" | "|";
export type DecimalMark = "." | ",";

export const DELIMITERS: readonly Delimiter[] = [",", "\t", ";", "|"];
export const DELIMITER_NAMES: Record<Delimiter, string> = { ",": "Comma", "\t": "Tab", ";": "Semicolon", "|": "Bar" };

export interface DelimitedOptions {
  /** null: found from the text. */
  delimiter: Delimiter | null;
  /** null: found from the text. A comma is the decimal mark only when the delimiter is not a comma. */
  decimal: DecimalMark | null;
  /** Lines starting with this text are skipped; null: none. */
  comment: string | null;
}

export const DEFAULT_DELIMITED: DelimitedOptions = { delimiter: null, decimal: null, comment: "#" };

/** What was read, with the delimiter and decimal mark in effect. */
export interface DelimitedResult { grid: RawGrid; delimiter: Delimiter; decimal: DecimalMark; encoding: string }

/** The text of a file: UTF-8 (a byte order mark dropped), UTF-16 with its mark, else Windows-1252. */
export function decodeText(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "UTF-8" };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "UTF-16" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "UTF-16" };
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" }; }
  catch { return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "Windows-1252" }; }
}

/** Records split on `delimiter`, with double-quoted fields (a doubled quote inside is one quote). Line ends: LF, CRLF or CR. */
export function splitRecords(text: string, delimiter: string, comment: string | null): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let atStart = true; // at the start of a line: a comment line is skipped whole
  let i = 0;
  const endRecord = () => {
    record.push(field);
    // A blank line is kept as an empty record, so that row numbers match the file.
    records.push(record.length === 1 && record[0] === "" ? [] : record);
    record = []; field = ""; atStart = true;
  };
  while (i < text.length) {
    if (atStart && comment && text.startsWith(comment, i)) {
      while (i < text.length && text[i] !== "\n" && text[i] !== "\r") i++;
      if (text[i] === "\r" && text[i + 1] === "\n") i++;
      i++;
      continue;
    }
    atStart = false;
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += char; i++; continue;
    }
    if (char === '"' && field.trim() === "") { quoted = true; field = ""; i++; continue; }
    if (char === delimiter) { record.push(field); field = ""; i++; continue; }
    if (char === "\r" || char === "\n") {
      endRecord();
      i += char === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += char; i++;
  }
  if (field !== "" || record.length) endRecord();
  return records;
}

/** The delimiter that splits the first lines into the same number of fields (more than one), most often. */
export function detectDelimiter(text: string, comment: string | null): Delimiter {
  const sample = text.slice(0, 64 * 1024);
  let best: Delimiter = ",";
  let bestScore = 0;
  // Tab and semicolon first: on a tie they win over the comma, which may be a decimal mark.
  for (const delimiter of ["\t", ";", ",", "|"] as const) {
    const records = splitRecords(sample, delimiter, comment).filter((record) => record.length).slice(0, 50);
    if (!records.length) continue;
    const counts = new Map<number, number>();
    for (const record of records) counts.set(record.length, (counts.get(record.length) ?? 0) + 1);
    let mode = 1; let modeCount = 0;
    for (const [count, times] of counts) if (count > 1 && times > modeCount) { mode = count; modeCount = times; }
    if (mode < 2) continue;
    const score = (modeCount / records.length) * 1000 + mode;
    if (score > bestScore) { best = delimiter; bestScore = score; }
  }
  return best;
}

const NUMBER_DOT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const NUMBER_COMMA = /^[+-]?(\d+,?\d*|,\d+)([eE][+-]?\d+)?$/;

/** A number written with `decimal` as its mark; null when the text is not one. Spaces around it are ignored. */
export function parseNumber(text: string, decimal: DecimalMark): number | null {
  const value = text.trim();
  if (!value) return null;
  if (decimal === "." ? NUMBER_DOT.test(value) : NUMBER_COMMA.test(value)) return Number(decimal === "," ? value.replace(",", ".") : value);
  if (/^[+-]?(inf|infinity)$/i.test(value)) return value.startsWith("-") ? -Infinity : Infinity;
  return null;
}

/** The decimal mark of the fields: a comma when numbers like `1,5` appear and the delimiter is not a comma. */
export function detectDecimal(records: readonly string[][], delimiter: Delimiter): DecimalMark {
  if (delimiter === ",") return ".";
  let comma = 0; let dot = 0;
  for (const record of records.slice(0, 200)) for (const field of record) {
    const value = field.trim();
    if (/^[+-]?\d+,\d+([eE][+-]?\d+)?$/.test(value)) comma++;
    else if (/^[+-]?\d+\.\d+([eE][+-]?\d+)?$/.test(value)) dot++;
  }
  return comma > dot ? "," : ".";
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(Z)?$/;

/** An ISO 8601 date or date and time, as milliseconds since 1970 (UTC, a time without zone taken as UTC); null otherwise. */
export function parseIsoDate(text: string): number | null {
  const match = ISO_DATE.exec(text.trim());
  if (!match) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", fraction = "0"] = match;
  const month = Number(mo); const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31 || Number(h) > 23 || Number(mi) > 59 || Number(s) > 60) return null;
  return Date.UTC(Number(y), month - 1, day, Number(h), Number(mi), Number(s), Math.round(Number(`0.${fraction}`) * 1000));
}

/** A field as a cell: empty, a number, an ISO date, else its text. */
export function fieldCell(field: string, decimal: DecimalMark): RawCell {
  const value = field.trim();
  if (!value) return null;
  const number = parseNumber(value, decimal);
  if (number !== null) return number;
  const date = parseIsoDate(value);
  if (date !== null) return { date };
  return value;
}

/** A delimited file read into a grid; options left null are found from the text. */
export function readDelimited(bytes: Uint8Array, options: DelimitedOptions = DEFAULT_DELIMITED): DelimitedResult {
  const { text, encoding } = decodeText(bytes);
  const delimiter = options.delimiter ?? detectDelimiter(text, options.comment);
  const records = splitRecords(text, delimiter, options.comment);
  const decimal = options.decimal ?? detectDecimal(records, delimiter);
  const rows = records.map((record) => record.map((field) => fieldCell(field, decimal)));
  return { grid: { rows }, delimiter, decimal, encoding };
}
