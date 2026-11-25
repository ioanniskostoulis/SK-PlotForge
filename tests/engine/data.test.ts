// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Data files: delimited text (delimiter, decimal mark, quoting, encodings), Excel workbooks (sheets, shared and inline
// strings, dates in both date systems, ranges, refusals) and the table built from them (header, units, kinds, roles).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  buildTable, columnLetters, columnSettings, columnTitle, crc32, hasNumbers, DataError, decodeText, detectDelimiter, isDateFormat, parseCellRef, parseIsoDate,
  parseNumber, readDelimited, readXlsx, serialToMs, splitRecords, splitUnit, xlsxSheets,
  headingText, newSheetSize, sheetPart, SHEET, ROWS_TOP, visibleRows, tabWidth, columnPixels, columnSize, sheetAxes, sizedAxis, scrollAlong,
  DEFAULT_READ, dataFormatOf, describeData, emptyProject, isDataPath, newProjectData, parseProject, parseRangeInput, readData, serializeProject,
} from "../../source/engine";

const inflateRaw = async (data: Uint8Array) => new Uint8Array(inflateRawSync(data));
const bytes = (text: string) => new TextEncoder().encode(text);
const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));

// MARK: delimited text

test("records split on the delimiter, with quoted fields, doubled quotes and every line end", () => {
  assert.deepEqual(splitRecords('a,"b,c","say ""hi"""\r\n1,2,3\r4,5,6\n', ",", null), [["a", "b,c", 'say "hi"'], ["1", "2", "3"], ["4", "5", "6"]]);
  assert.deepEqual(splitRecords('"two\nlines",x', ",", null), [["two\nlines", "x"]]);
  assert.deepEqual(splitRecords("# note\na,b\n\n1,2", ",", "#"), [["a", "b"], [], ["1", "2"]]);
});

test("the delimiter is the one that splits every line alike", () => {
  assert.equal(detectDelimiter("t,v\n1,2\n3,4\n", null), ",");
  assert.equal(detectDelimiter("t\tv\n1\t2\n", null), "\t");
  assert.equal(detectDelimiter("t;v\n1,5;2,5\n3,0;4,1\n", null), ";");
  assert.equal(detectDelimiter("a|b|c\n1|2|3\n", null), "|");
});

test("numbers with either decimal mark; a comma file in a semicolon file is found", () => {
  assert.equal(parseNumber(" -1.5e3 ", "."), -1500);
  assert.equal(parseNumber("1,25", ","), 1.25);
  assert.equal(parseNumber("1,25", "."), null);
  assert.equal(parseNumber("abc", "."), null);
  assert.equal(parseNumber("-inf", "."), -Infinity);
  const read = readDelimited(bytes("t;v\n0,5;1,25\n1,5;2\n"));
  assert.equal(read.delimiter, ";");
  assert.equal(read.decimal, ",");
  assert.deepEqual(read.grid.rows, [["t", "v"], [0.5, 1.25], [1.5, 2]]);
});

test("ISO dates are dates; other text stays text", () => {
  assert.equal(parseIsoDate("2026-11-15"), Date.UTC(2026, 10, 15));
  assert.equal(parseIsoDate("2026-11-15T09:30:05.5Z"), Date.UTC(2026, 10, 15, 9, 30, 5, 500));
  assert.equal(parseIsoDate("2026-13-01"), null);
  assert.deepEqual(readDelimited(bytes("when,x\n2026-11-15 09:30,1\n")).grid.rows[1], [{ date: Date.UTC(2026, 10, 15, 9, 30) }, 1]);
});

test("text is UTF-8 (with or without its mark), UTF-16 with its mark, else Windows-1252", () => {
  assert.deepEqual(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])), { text: "A", encoding: "UTF-8" });
  assert.deepEqual(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00])), { text: "A", encoding: "UTF-16" });
  assert.deepEqual(decodeText(new Uint8Array([0x54, 0xb5, 0x6d])), { text: "Tµm", encoding: "Windows-1252" });
  assert.equal(decodeText(bytes("Τάση (V)")).text, "Τάση (V)");
});

// MARK: table

/** How older documents read a file: the header found from the cells, and roles guessed. */
const GUESS = { header: null, skipRows: 0 };

test("a file is read as it is: no header, every row kept, no roles; numbers in a text column are still values", () => {
  const grid = readDelimited(bytes("Μέτρηση,Απόσταση,Σκληρότητα\n1,3,70\n2,6,68\n\nFitting,,\nΜέτρηση,Απόσταση (mm),fitting\n1,3,71.2\n")).grid;
  const table = buildTable(grid);
  assert.equal(table.headerRow, null);
  assert.equal(table.rows, 7);
  assert.deepEqual(table.columns.map((column) => [column.key, column.kind, column.role]), [["Column A", "text", "none"], ["Column B", "text", "none"], ["Column C", "text", "none"]]);
  assert.deepEqual(table.columns[1].values, [null, 3, 6, null, null, null, 3]);
  assert.equal(table.columns[1].stats.count, 3);
  assert.ok(hasNumbers(table.columns[1], { first: 1, last: 2 }));
  assert.ok(!hasNumbers(table.columns[1], { first: 3, last: 5 }));
  const headed = buildTable(grid, { header: true, skipRows: 0 });
  assert.deepEqual([headed.rows, headed.dataStart, headed.columns[1].key, headed.columns[1].text[0], headed.columns[1].values[0]], [7, 1, "Απόσταση", "Απόσταση", null], "a header names the columns and stays row 1");
  const named = buildTable(grid, undefined, [{ key: "Column B", role: "x", name: "Distance", unit: "mm" }]);
  assert.deepEqual([named.columns[1].name, named.columns[1].unit, named.columns[1].role], ["Distance", "mm", "x"], "a mixed column with numbers can be X");
  assert.deepEqual(columnSettings(named, [{ key: "Column B", role: "x", name: "Distance", unit: "mm" }])[1], { key: "Column B", role: "x", name: "Distance", unit: "mm" });
  assert.equal(buildTable(grid, undefined, [{ key: "Column A", role: "y" }]).columns[0].role, "y", "Column A has numbers too");
  assert.equal(buildTable({ rows: [["a"], ["b"]] }, undefined, [{ key: "Column A", role: "y" }]).columns[0].role, "none", "text alone cannot be Y");
});

test("a document without a header setting is an older one that guessed it; a new link says it has none", () => {
  const base = { format: "plotforge", version: 2, images: [], results: [] };
  const link = { id: "data-1", name: "iv", path: "iv.csv", x: 0, y: 0, width: 240, height: 192, source: { format: "text", bytes: 3, crc32: "00000000" } };
  assert.equal(parseProject(JSON.stringify({ ...base, data: [link] }), null).data[0].read.header, null);
  assert.equal(DEFAULT_READ.header, false);
  assert.throws(() => parseProject(JSON.stringify({ ...base, data: [{ ...link, columns: [{ key: "a", role: "x", name: "" }] }] }), null), /invalid name/);
});

test("an older document that left the header to be found: the header row is found, units split off, roles guessed", () => {
  const table = buildTable(readDelimited(bytes("\n\nTime (s),Current [mA],Current err,Note\n0,1,0.1,a\n1,2,0.2,\n2,4,0.1,b\n\n")).grid, GUESS);
  assert.equal(table.headerRow, 2);
  assert.equal(table.rows, 4, "the header is kept as row 1, as in a spreadsheet");
  assert.equal(table.dataStart, 1);
  assert.deepEqual(table.columns.map((column) => [column.key, column.name, column.unit, column.kind, column.role]), [
    ["Time (s)", "Time", "s", "number", "x"],
    ["Current [mA]", "Current", "mA", "number", "y"],
    ["Current err", "Current err", "", "number", "error"],
    ["Note", "Note", "", "text", "label"],
  ]);
  assert.deepEqual(table.columns[1].values, [null, 1, 2, 4], "the header row holds no value");
  assert.deepEqual(table.columns[3].text, ["Note", "a", "", "b"]);
  const stats = table.columns[1].stats;
  assert.deepEqual([stats.count, stats.missing, stats.min, stats.max], [3, 0, 1, 4]);
  assert.ok(Math.abs(stats.mean! - 7 / 3) < 1e-12);
  assert.ok(Math.abs(stats.sd! - Math.sqrt(((1 - 7 / 3) ** 2 + (2 - 7 / 3) ** 2 + (4 - 7 / 3) ** 2) / 2)) < 1e-12);
});

test("a file without a header gets spreadsheet column names; a header can be forced either way", () => {
  const grid = readDelimited(bytes("1,2\n3,4\n")).grid;
  assert.deepEqual(buildTable(grid).columns.map((column) => column.key), ["Column A", "Column B"]);
  assert.equal(buildTable(grid, { header: true, skipRows: 0 }).columns[0].key, "1");
  assert.equal(buildTable(readDelimited(bytes("a,b\nc,d\n")).grid, { header: false, skipRows: 0 }).rows, 2);
  assert.equal(columnLetters(0), "A");
  assert.equal(columnLetters(25), "Z");
  assert.equal(columnLetters(26), "AA");
  assert.equal(columnLetters(701), "ZZ");
});

test("while guessing, a title row above the header is skipped, unless a header or rows to skip are set", () => {
  const grid = { rows: [["Measurements", null], [null, null], ["Distance (mm)", "Hardness (HRC)"], [3, 71.5], [6, 70]] };
  const table = buildTable(grid, GUESS);
  assert.equal(table.headerRow, 2);
  assert.deepEqual(table.columns.map((column) => [column.name, column.unit, column.role]), [["Distance", "mm", "x"], ["Hardness", "HRC", "y"]]);
  assert.equal(buildTable(grid, { header: true, skipRows: 0 }).columns[0].key, "Measurements");
  assert.equal(buildTable({ rows: [["Time"], [1], [2]] }, GUESS).headerRow, 0);
});

test("repeated headers are made unique; stored settings set roles and units by header", () => {
  const grid = readDelimited(bytes("x,y,y\n1,2,3\n")).grid;
  const table = buildTable(grid, { header: true, skipRows: 0 }, [{ key: "x", role: "x" }, { key: "y", role: "ignored" }, { key: "y (2)", role: "y", unit: "V" }]);
  assert.deepEqual(table.columns.map((column) => [column.key, column.role, column.unit]), [["x", "x", ""], ["y", "ignored", ""], ["y (2)", "y", "V"]]);
  assert.deepEqual(columnSettings(table), [{ key: "x", role: "x" }, { key: "y", role: "ignored" }, { key: "y (2)", role: "y", unit: "V" }]);
  assert.equal(columnTitle(table.columns[2]), "y (2) (V)");
});

test("units: parentheses, brackets and a slash", () => {
  assert.deepEqual(splitUnit("Time (s)"), { name: "Time", unit: "s" });
  assert.deepEqual(splitUnit("Wavelength [nm]"), { name: "Wavelength", unit: "nm" });
  assert.deepEqual(splitUnit("Energy / eV"), { name: "Energy", unit: "eV" });
  assert.deepEqual(splitUnit("A/B ratio"), { name: "A/B ratio", unit: "" });
});

// MARK: Excel

test("an Excel workbook: the first sheet, inline text, dates, truth values, a formula without a result, a gap row", async () => {
  const read = await readXlsx(fixture("data-iv.xlsx"), inflateRaw);
  assert.deepEqual(read.sheets, ["IV curve", "Calibration"]);
  assert.equal(read.sheet, "IV curve");
  const table = buildTable(read.grid, GUESS);
  assert.deepEqual(table.columns.map((column) => [column.key, column.kind, column.role]), [
    ["Time (s)", "number", "x"], ["Current (mA)", "number", "y"], ["Current err", "number", "error"], ["Note", "text", "label"],
    ["Taken", "date", "ignored"], ["Column F", "empty", "ignored"], ["Sum", "empty", "ignored"], ["Ok", "number", "y"],
  ]);
  assert.equal(table.rows, 5);
  assert.deepEqual(table.columns[1].values, [null, 0.5, 1.5, null, 2.25]);
  assert.deepEqual(table.columns[3].text, ["Note", "start", "", "", "end & stop"]);
  assert.deepEqual(table.columns[4].text, ["Taken", "2026-11-15 09:30", "2026-11-15 09:31", "", "2026-11-15 09:32"]);
  assert.deepEqual(table.columns[7].values, [null, 1, 0, null, null]);
});

test("a sheet by name, and a range of it", async () => {
  const workbook = fixture("data-iv.xlsx");
  const whole = await readXlsx(workbook, inflateRaw, { sheet: "Calibration", range: null });
  const table = buildTable(whole.grid, GUESS);
  assert.equal(table.headerRow, 2);
  assert.deepEqual(table.columns.map((column) => [column.key, column.unit]), [["Standard", ""], ["Value [nm]", "nm"]]);
  assert.deepEqual(buildTable({ rows: [[null, 1], [null, 2]] }).columns.map((column) => column.key), ["Column B"]);
  const part = await readXlsx(workbook, inflateRaw, { sheet: "Calibration", range: "C3:C5" });
  assert.deepEqual(part.grid.rows, [["Value [nm]"], [10.5], [20]]);
  assert.deepEqual(await xlsxSheets(workbook, inflateRaw), ["IV curve", "Calibration"]);
  await assert.rejects(readXlsx(workbook, inflateRaw, { sheet: "Nope", range: null }), /no sheet named Nope/);
  await assert.rejects(readXlsx(workbook, inflateRaw, { sheet: null, range: "x" }), /not a cell range/);
});

test("dates count from 1900 (with its leap-day error) or 1904", async () => {
  assert.equal(serialToMs(25569, false), 0);
  assert.equal(serialToMs(1, false), Date.UTC(1900, 0, 1));
  assert.equal(serialToMs(61, false), Date.UTC(1900, 2, 1));
  assert.equal(serialToMs(0, true), Date.UTC(1904, 0, 1));
  const read = await readXlsx(fixture("data-1904.xlsx"), inflateRaw);
  assert.deepEqual(read.grid.rows[1], [{ date: Date.UTC(2026, 0, 2) }]);
  assert.ok(isDateFormat("dd/mm/yyyy"));
  assert.ok(isDateFormat('[$-409]h:mm AM/PM'));
  assert.ok(!isDateFormat("0.00"));
  assert.ok(!isDateFormat('"days"0'));
  assert.ok(!isDateFormat("[h]:mm"));
  assert.deepEqual(parseCellRef("$AB$12"), { column: 27, row: 11 });
});

/** A ZIP archive of the given parts, deflated, as Excel writes them. */
function zip(parts: Record<string, string>): Uint8Array {
  const local: Uint8Array[] = []; const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    const data = bytes(text); const packed = new Uint8Array(deflateRawSync(data)); const nameBytes = bytes(name);
    const crc = parseInt(crc32(data), 16);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); header.setUint16(8, 8, true); header.setUint32(14, crc, true);
    header.setUint32(18, packed.length, true); header.setUint32(22, data.length, true); header.setUint16(26, nameBytes.length, true);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(10, 8, true); entry.setUint32(16, crc, true);
    entry.setUint32(20, packed.length, true); entry.setUint32(24, data.length, true); entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    local.push(new Uint8Array(header.buffer), nameBytes, packed);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const size = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, Object.keys(parts).length, true); end.setUint16(10, Object.keys(parts).length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  const all = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) { out.set(part, at); at += part.length; }
  return out;
}

test("shared strings (rich runs joined, phonetic runs left out), prefixed names and an absolute sheet target", async () => {
  const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const workbook = zip({
    "xl/workbook.xml": `<x:workbook xmlns:x="${main}" xmlns:r="r"><x:sheets><x:sheet name="Run" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="/xl/worksheets/run.xml"/></Relationships>`,
    "xl/sharedStrings.xml": `<sst><si><t>Voltage (V)</t></si><si><r><t>Mo</t></r><r><t xml:space="preserve">de </t></r><rPh><t>x</t></rPh><r><t>A</t></r></si></sst>`,
    "xl/worksheets/run.xml": `<x:worksheet xmlns:x="${main}"><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="s"><x:v>1</x:v></x:c></x:row>`
      + `<x:row r="2"><x:c r="A2"><x:v>1.5</x:v></x:c><x:c r="B2" t="str"><x:v>on</x:v></x:c></x:row><x:row r="3"><x:c r="A3" t="e"><x:v>#DIV/0!</x:v></x:c><x:c r="B3" t="d"><x:v>2026-11-15</x:v></x:c></x:row></x:sheetData></x:worksheet>`,
  });
  const read = await readXlsx(workbook, inflateRaw);
  assert.deepEqual(read.grid.rows, [["Voltage (V)", "Mode A"], [1.5, "on"], [null, { date: Date.UTC(2026, 10, 15) }]]);
});

test("merged cells are read as blocks, moved and cut by a range, and carried into the table's rows and columns", async () => {
  const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const sheet = `<worksheet xmlns="${main}"><sheetData><row r="2"><c r="B2" t="inlineStr"><is><t>Jominy test</t></is></c></row>`
    + `<row r="3"><c r="B3"><v>1</v></c><c r="C3"><v>2</v></c><c r="D3"><v>3</v></c></row></sheetData>`
    + `<mergeCells count="2"><mergeCell ref="B2:D2"/><mergeCell ref="A9:A12"/></mergeCells></worksheet>`;
  const workbook = zip({
    "xl/workbook.xml": `<workbook xmlns="${main}" xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/s.xml"/></Relationships>`,
    "xl/worksheets/s.xml": sheet,
  });
  const read = await readXlsx(workbook, inflateRaw);
  assert.deepEqual(read.grid.merges, [{ r0: 1, c0: 1, r1: 1, c1: 3 }, { r0: 8, c0: 0, r1: 11, c1: 0 }]);
  const table = buildTable(read.grid);
  assert.deepEqual(table.merges, [{ r0: 0, c0: 0, r1: 0, c1: 2 }], "blank row 1 and empty column A left out; a merge past the table's end is cut away");
  const ranged = await readXlsx(workbook, inflateRaw, { sheet: null, range: "C2:D3" });
  assert.deepEqual(ranged.grid.merges, [{ r0: 0, c0: 0, r1: 0, c1: 1 }], "cut to the range, from its first cell");
});

test("column widths, the standard width and hidden rows and columns are read, cut by a range and carried into the table", async () => {
  const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const cells = (r: number) => `<row r="${r}"${r === 4 ? ' hidden="1"' : ""}>` + ["A", "B", "C", "D", "E"].map((c, i) => `<c r="${c}${r}"><v>${r * 10 + i}</v></c>`).join("") + "</row>";
  const sheet = `<worksheet xmlns="${main}"><sheetFormatPr defaultColWidth="12.7109375" defaultRowHeight="15"/>`
    + `<cols><col min="1" max="1" width="9.140625"/><col min="2" max="2" width="20.7109375" customWidth="1"/><col min="3" max="3" width="9.140625" hidden="1"/><col min="5" max="16384" width="4.7109375"/></cols>`
    + `<sheetData>${[1, 2, 3, 4, 5].map(cells).join("")}</sheetData></worksheet>`;
  const workbook = zip({
    "xl/workbook.xml": `<workbook xmlns="${main}" xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/s.xml"/></Relationships>`,
    "xl/worksheets/s.xml": sheet,
  });
  assert.equal(columnPixels(9.140625), 64, "Excel's standard 8.43 characters, stored with padding");
  const read = await readXlsx(workbook, inflateRaw);
  assert.deepEqual(read.grid.widths, [64, 145, 0, null, 33]);
  assert.equal(read.grid.standardWidth, columnPixels(12.7109375));
  assert.deepEqual(read.grid.hiddenRows, [3]);
  const table = buildTable(read.grid, { header: true, skipRows: 0 });
  assert.deepEqual(table.widths, [64, 145, 0, columnPixels(12.7109375), 33], "a column without its own width takes the standard one");
  assert.deepEqual(table.hiddenRows, [3]);
  assert.equal(table.columns[2].values[3], 42, "a hidden column's and row's cells are read as any other");
  const ranged = await readXlsx(workbook, inflateRaw, { sheet: null, range: "B3:C5" });
  assert.deepEqual(ranged.grid.widths, [145, 0]);
  assert.deepEqual(ranged.grid.hiddenRows, [1], "row 4 is the range's second row");
  // A text file has no widths: every column the sheet's standard size.
  assert.deepEqual(buildTable({ rows: [[1, 2]] }).widths, []);
});

test("a workbook's columns are drawn at their widths, hidden ones take no room and are passed over", () => {
  assert.equal(columnSize(null), SHEET.column);
  assert.equal(columnSize(64), SHEET.column, "Excel's standard column is the sheet's");
  assert.equal(columnSize(0), 0);
  assert.equal(columnSize(2), 24, "never narrower than a sliver that still shows");
  const axis = sizedAxis([100, 0, 0, 50, 20]);
  assert.equal(axis.total, 170);
  assert.equal(axis.at(1), 100); assert.equal(axis.at(3), 100); assert.equal(axis.at(3.5), 125); assert.equal(axis.at(9), 170);
  assert.equal(axis.index(100), 3, "the offset where hidden places start finds the shown one after them");
  assert.equal(axis.index(50), 0.5);
  assert.equal(axis.index(160), 4.5);
  assert.equal(axis.index(170), 5);
  assert.deepEqual([0, 3, 4].map((index) => axis.order(index)), [0, 1, 2], "banding counts shown places only");
  assert.equal(scrollAlong(axis, 0, 110, 60), 3 + 10 / 50, "a scroll goes over the hidden columns to the pixel");
  assert.equal(scrollAlong(axis, 0, 1000, 60), 3 + 10 / 50, "and stops where the last column meets the edge");
  const table = buildTable({ rows: [[1, 2, 3], [4, 5, 6], [7, 8, 9]], widths: [128, 0, null], hiddenRows: [1] });
  const axes = sheetAxes(table);
  assert.equal(sheetAxes(table), axes, "made once per table");
  assert.deepEqual([0, 1, 2].map((index) => axes.columns.size(index)), [SHEET.column * 2, 0, SHEET.column]);
  assert.deepEqual([0, 1, 2].map((row) => axes.rows.size(row)), [SHEET.row, 0, SHEET.row]);
  const box = { x: 0, y: 0, width: 600, height: 300 };
  const view = { columns: 3, rows: 3, tabs: [], scrollRow: 0, scrollColumn: 0, axes };
  assert.deepEqual(sheetPart(box, view, SHEET.rowHeader + 2 * SHEET.column + 5, ROWS_TOP + SHEET.row + 2), { kind: "cell", column: 2, row: 2 }, "past a wide column and a hidden one; below a hidden row");
  assert.deepEqual(newSheetSize(3, 3, false, 1, axes).width, SHEET.rowHeader + 3 * SHEET.column, "a new sheet fits its columns' own widths");
});

test("a workbook's cells read as its number formats show them; their values stay exact", async () => {
  const main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const workbook = zip({
    "xl/workbook.xml": `<workbook xmlns="${main}" xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/s.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="${main}"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.00%"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>`
      + `<cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="4"/><xf numFmtId="165"/></cellXfs></styleSheet>`,
    "xl/worksheets/s.xml": `<worksheet xmlns="${main}"><sheetData><row r="1"><c r="A1" s="1"><v>0.1234</v></c><c r="B1" s="2"><v>1234.5</v></c>`
      + `<c r="C1"><v>0.30000000000000004</v></c><c r="D1" s="3"><v>46343</v></c></row></sheetData></worksheet>`,
  });
  const table = buildTable((await readXlsx(workbook, inflateRaw)).grid);
  assert.deepEqual(table.columns.map((column) => column.text[0]), ["12.34%", "1,234.50", "0.3", "17/11/2026"]);
  assert.deepEqual(table.columns.slice(0, 3).map((column) => column.values[0]), [0.1234, 1234.5, 0.30000000000000004], "values exact, for plotting");
});

test("a legacy .xls workbook and other files are refused with a reason", async () => {
  await assert.rejects(readXlsx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), inflateRaw), (error: Error) => error instanceof DataError && /save it as \.xlsx/.test(error.message));
  await assert.rejects(readXlsx(bytes("a,b"), inflateRaw), /not an Excel workbook/);
  await assert.rejects(readXlsx(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), inflateRaw), /damaged/);
});

// MARK: the document's data links

test("a document links data files: relative paths, read options and column settings round-trip byte for byte", async () => {
  const bytes_ = fixture("data-iv.xlsx");
  const loaded = await readData(bytes_, { ...DEFAULT_READ, sheet: "IV curve" }, [], inflateRaw);
  const project = emptyProject();
  const link = newProjectData(project.data, "/Users/lab/run 1/data/iv.xlsx", "iv.xlsx", describeData(bytes_), { ...DEFAULT_READ, sheet: "IV curve", range: "A1:C5" }, columnSettings(loaded.table), { x: 0, y: 0, width: 640, height: 400 });
  project.data.push(link);
  project.data.push(newProjectData(project.data, "/Users/lab/run 1/iv.csv", "iv.csv", describeData(bytes("t,v\n1,2\n")), { ...DEFAULT_READ, delimiter: ",", header: true, skipRows: 2 }, [{ key: "t", role: "x", unit: "ms" }], { x: 672, y: 16, width: 240, height: 192 }));
  assert.deepEqual(project.data.map((data) => [data.id, data.name, data.source.format]), [["data-1", "iv", "xlsx"], ["data-2", "iv 2", "text"]]);
  const text = serializeProject(project, "/Users/lab/run 1/plate.pfg");
  const stored = JSON.parse(text).data;
  assert.equal(stored[0].path, "data/iv.xlsx");
  assert.deepEqual(stored[0].read, { header: false, sheet: "IV curve", range: "A1:C5" }, "a new link is read as it is, and says so");
  assert.deepEqual(stored[1].read, { delimiter: ",", header: true, skipRows: 2 });
  const again = parseProject(text, "/Users/lab/run 1/plate.pfg");
  assert.deepEqual(again, project);
  assert.equal(serializeProject(again, "/Users/lab/run 1/plate.pfg"), text);
  // A document without data writes no data list, so its bytes are as before.
  assert.ok(!("data" in JSON.parse(serializeProject(emptyProject(), null))));
});

test("a damaged data link is refused with a reason", () => {
  const base = { format: "plotforge", version: 2, images: [], results: [] };
  const link = { id: "data-1", name: "iv", path: "iv.csv", x: 0, y: 0, width: 240, height: 192, source: { format: "text", bytes: 3, crc32: "00000000" } };
  assert.throws(() => parseProject(JSON.stringify({ ...base, data: [{ ...link, width: 0 }] }), null), /invalid worksheet size/);
  assert.throws(() => parseProject(JSON.stringify({ ...base, data: [{ ...link, path: "iv.png" }] }), null), /not a data file/);
  assert.throws(() => parseProject(JSON.stringify({ ...base, data: [{ ...link, read: { delimiter: "x" } }] }), null), /invalid delimiter/);
  assert.throws(() => parseProject(JSON.stringify({ ...base, data: [{ ...link, read: { range: "nope" } }] }), null), /invalid cell range/);
  assert.throws(() => parseProject(JSON.stringify({ ...base, data: [{ ...link, columns: [{ key: "a", role: "z" }] }] }), null), /invalid column setting/);
  assert.throws(() => parseProject(JSON.stringify({ ...base, data: [link, link] }), null), /same id/);
  assert.equal(parseRangeInput(" b2:f40 "), "B2:F40");
  assert.equal(parseRangeInput("all"), null);
  assert.throws(() => parseRangeInput("B2-F40"), /not a cell range/);
  assert.throws(() => dataFormatOf(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), /save it as \.xlsx/);
  assert.ok(isDataPath("/a/b.CSV") && isDataPath("x.xlsx") && !isDataPath("x.png") && !isDataPath("csv"));
});

// MARK: the worksheet on the work surface

test("a new worksheet shows up to six columns and sixteen rows, on the grid; headings carry Origin's designations", () => {
  assert.deepEqual(newSheetSize(4, 5, false, 16), { width: Math.ceil((SHEET.rowHeader + 4 * SHEET.column) / 16) * 16, height: Math.ceil((ROWS_TOP + 5 * SHEET.row) / 16) * 16 });
  assert.equal(newSheetSize(20, 1000, true, 16).width, Math.ceil((SHEET.rowHeader + 6 * SHEET.column) / 16) * 16);
  assert.equal(newSheetSize(20, 1000, true, 16).height, Math.ceil((ROWS_TOP + 16 * SHEET.row + SHEET.tabs) / 16) * 16);
  assert.equal(visibleRows(ROWS_TOP + 3 * SHEET.row + 5, false), 3);
  assert.equal(visibleRows(ROWS_TOP + 3 * SHEET.row + SHEET.tabs, true), 3);
  assert.deepEqual(["x", "y", "error", "label", "ignored"].map((role) => headingText("C", role as never)), ["C(X)", "C(Y)", "C(yEr)", "C(L)", "C"]);
});

test("a point of a worksheet is on its title, re-read mark, a heading, a cell, a sheet tab or the grip", () => {
  const box = { x: 100, y: 50, width: SHEET.rowHeader + 3 * SHEET.column, height: 300 };
  const view = { columns: 5, rows: 40, tabs: ["IV curve", "Calibration"], scrollRow: 10, scrollColumn: 1 };
  assert.equal(sheetPart(box, view, 99, 60), null);
  assert.deepEqual(sheetPart(box, view, 110, 60), { kind: "title" });
  assert.deepEqual(sheetPart(box, view, 100 + box.width - 5, 60), { kind: "reload" });
  assert.deepEqual(sheetPart(box, view, 100 + SHEET.rowHeader + 10, 50 + SHEET.title + 5), { kind: "heading", column: 1 });
  assert.equal(ROWS_TOP, SHEET.title + SHEET.heading, "the file's rows follow straight under the letters: no Name or Units rows");
  assert.deepEqual(sheetPart(box, view, 100 + SHEET.rowHeader + SHEET.column + 10, 50 + ROWS_TOP + 1), { kind: "cell", column: 2, row: 10 });
  assert.deepEqual(sheetPart(box, view, 100 + SHEET.rowHeader + 10, 50 + ROWS_TOP + 2 * SHEET.row + 1), { kind: "cell", column: 1, row: 12 });
  assert.deepEqual(sheetPart(box, view, 110, 50 + ROWS_TOP + 5), { kind: "row-header", row: 10 });
  assert.deepEqual(sheetPart(box, view, 110, 50 + SHEET.title + 5), { kind: "row-header", row: null });
  assert.deepEqual(sheetPart(box, view, 100 + tabWidth("IV curve") + 5, 50 + 300 - 10), { kind: "tab", index: 1 });
  assert.deepEqual(sheetPart(box, view, 100 + box.width - 3, 50 + 300 - 3), { kind: "grip" });
  // Past the last column, nothing; past the last row, nothing.
  assert.deepEqual(sheetPart(box, { ...view, columns: 2 }, 100 + SHEET.rowHeader + SHEET.column + 10, 50 + ROWS_TOP + 5), { kind: "empty" });
  assert.deepEqual(sheetPart(box, { ...view, rows: 11 }, 100 + SHEET.rowHeader + 10, 50 + ROWS_TOP + 2 * SHEET.row + 1), { kind: "empty" });
  // A scroll between rows and columns: half a row and half a column up and left, the point lands on the next ones.
  const half = { ...view, scrollRow: 10.5, scrollColumn: 1.5 };
  assert.deepEqual(sheetPart(box, half, 100 + SHEET.rowHeader + SHEET.column / 2 + 2, 50 + ROWS_TOP + SHEET.row / 2 + 2), { kind: "cell", column: 2, row: 11 });
  assert.deepEqual(sheetPart(box, half, 100 + SHEET.rowHeader + 2, 50 + ROWS_TOP + 2), { kind: "cell", column: 1, row: 10 });
  assert.deepEqual(sheetPart(box, half, 110, 50 + ROWS_TOP + SHEET.row / 2 + 2), { kind: "row-header", row: 11 });
});
