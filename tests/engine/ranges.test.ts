// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Named ranges: what labels a range, references as Origin and Excel write them, names from a first row, a cell's text
// by its reference, the rules for a name, and the document's records.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTable, cellAt, cellsText, emptyProject, nameProblem, namesFromFirstRow, newNamedRange, parseProject, rangeLabel, rangeName, rangeReference, rangeTitle,
  serializeProject, parseReference, type CellRange,
} from "../../source/engine";

const table = buildTable({ rows: [[null, "Time (s)", "Load"], [null, 0, 10], [null, 1, 12], [null, 2, 15]] });
const at = (letter: string, rows: { first: number; last: number } | null = null): CellRange => ({ data: "data-1", column: `Column ${letter}`, rows });

test("cells are written as Excel does, with the sheet's letters even when empty columns before them are left out", () => {
  assert.equal(table.columns[0].key, "Column B", "the empty column A is left out");
  assert.deepEqual([cellsText(at("B"), table), cellsText(at("B", { first: 1, last: 3 }), table), cellsText(at("C", { first: 2, last: 2 }), table)], ["B", "B2:B4", "C3"]);
  assert.equal(rangeReference(at("B", { first: 1, last: 3 }), "Jominy", table), "Jominy!B2:B4");
  assert.deepEqual([cellAt(table, "B1"), cellAt(table, "c4"), cellAt(table, "B9"), cellAt(table, "A1")], ["Time (s)", "15", null, null]);
});

test("a name labels exactly its cells, or as a whole column any rows of it", () => {
  const time = newNamedRange([], at("B", { first: 1, last: 3 }), "Time", "s");
  const load = newNamedRange([time], at("C"), "Load");
  const names = [time, load];
  assert.equal(load.id, "range-2");
  assert.equal(rangeName(names, at("B", { first: 1, last: 3 }))?.name, "Time");
  assert.equal(rangeName(names, at("B", { first: 1, last: 2 })), null, "a name of some rows labels only those");
  assert.equal(rangeName(names, at("C", { first: 1, last: 2 }))?.name, "Load");
  assert.deepEqual([rangeTitle(time), rangeTitle(load)], ["Time (s)", "Load"]);
  assert.equal(rangeLabel(names, at("B"), "Jominy", table), "Jominy!B", "unnamed: its reference");
});

test("names come from the first row, with the unit written in it; a number or empty first cell names nothing", () => {
  const made = namesFromFirstRow([at("B", { first: 0, last: 3 }), at("C"), at("B", { first: 1, last: 3 })], table);
  assert.deepEqual(made, [
    { cells: at("B", { first: 1, last: 3 }), name: "Time", unit: "s" },
    { cells: at("C", { first: 1, last: 3 }), name: "Load", unit: "" },
  ]);
});

test("a name is not empty, not a cell reference and not taken; names round-trip in the document", () => {
  const time = newNamedRange([], at("B", { first: 1, last: 3 }), "Time", "s");
  assert.match(String(nameProblem(" ", [time])), /cannot be empty/);
  assert.match(String(nameProblem("B2", [time])), /cell reference/);
  assert.equal(nameProblem("SD", [time]), null, "letters alone are a name, as in Excel");
  assert.match(String(nameProblem("time", [time])), /already used/);
  assert.equal(nameProblem("time", [time], time.id), null, "its own name");
  const project = emptyProject();
  assert.ok(!("ranges" in JSON.parse(serializeProject(project, "/lab/a.pfg"))), "no names, none written");
  project.ranges.push(time, newNamedRange([time], at("C"), "Load"));
  const text = serializeProject(project, "/lab/a.pfg");
  assert.deepEqual(JSON.parse(text).ranges[1], { id: "range-2", name: "Load", data: "data-1", column: "Column C" });
  assert.deepEqual(parseProject(text, "/lab/a.pfg").ranges, project.ranges);
  const twice = JSON.parse(text);
  twice.ranges[1].name = "TIME";
  assert.throws(() => parseProject(JSON.stringify(twice), "/lab/a.pfg"), /two ranges of the same name/);
});

test("typed references: a name in any case, cells of the series' sheet, or of a named sheet, quoted when it has spaces", () => {
  const sheets = [{ id: "data-1", name: "Jominy", table }, { id: "data-2", name: "My data", table }, { id: "data-3", name: "Later", table: null }];
  const time = newNamedRange([], at("B", { first: 1, last: 3 }), "Time", "s");
  assert.deepEqual(parseReference("time", sheets, [time], null), at("B", { first: 1, last: 3 }));
  assert.deepEqual(parseReference("C2:C4", sheets, [], "data-1"), at("C", { first: 1, last: 3 }));
  assert.deepEqual(parseReference("c", sheets, [], "data-1"), at("C"));
  assert.deepEqual(parseReference("jominy!$B$3", sheets, [], null), at("B", { first: 2, last: 2 }));
  assert.deepEqual(parseReference("'My data'!B4:B2", sheets, [], null), { data: "data-2", column: "Column B", rows: { first: 1, last: 3 } });
  for (const [text, message] of [
    ["B2:C4", /more than one column/], ["Other!B2", /no worksheet Other/], ["B2", /Name the worksheet/], ["Later!B2", /not read yet/],
    ["Jominy!A2", /no column A/], ["Jominy!B0", /counted from 1/], ["two words", /not a name or cells/], ["", /Type a name/],
  ] as const) assert.match(String(parseReference(text, sheets, [], text === "B2" ? null : "data-1")), message, text);
});
