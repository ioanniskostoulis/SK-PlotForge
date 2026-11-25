// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Choosing cells in a worksheet: a press, Shift to extend, Cmd to add or take away, a drag; and the series a plot of
// the chosen cells takes, each a range of one column and its rows.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTable, cellSelected, columnLetters, columnRows, dragSelection, pressSelection, rangeBetween, selectedColumns, selectionEmpty, selectionPairs, selectionRanges, selectionPlan, cellsKey,
  selectionText, type SheetSelection,
} from "../../source/engine";

const table = () => buildTable({ rows: [["Distance (mm)", "Hardness (HRC)", "Fit (HRC)", "Note", "Time (s)", "T (°C)"], [3, 71.5, 71.2, "a", 0, 20], [6, 70, null, "b", 1, 35], [9, 68, 68.1, null, 2, 48]] });
const heading = (column: number) => ({ column, row: null });
const cell = (column: number, row: number) => ({ column, row });

test("a block between two points: a heading spans every row, a row number every column, the corner everything", () => {
  assert.deepEqual(rangeBetween(cell(3, 7), cell(1, 2), 6), { c0: 1, c1: 3, rows: { first: 2, last: 7 } });
  assert.deepEqual(rangeBetween(heading(2), cell(4, 1), 6), { c0: 2, c1: 4, rows: null });
  assert.deepEqual(rangeBetween({ column: null, row: 5 }, { column: null, row: 3 }, 6), { c0: 0, c1: 5, rows: { first: 3, last: 5 } });
  assert.deepEqual(rangeBetween({ column: null, row: null }, { column: null, row: null }, 6), { c0: 0, c1: 5, rows: null });
});

test("a press chooses anew, Shift extends the last block from its anchor, a drag extends it, Cmd adds or takes away", () => {
  let selection = pressSelection(null, heading(1), "replace", 6);
  assert.deepEqual(selectedColumns(selection), [1]);
  selection = pressSelection(selection, heading(3), "add", 6);
  assert.deepEqual(selection.ranges, [{ c0: 1, c1: 3, rows: null }]);
  assert.deepEqual(selection.anchor, heading(1), "Shift keeps the anchor");
  selection = pressSelection(selection, heading(5), "toggle", 6);
  assert.deepEqual(selectedColumns(selection), [1, 2, 3, 5]);
  selection = pressSelection(selection, heading(2), "toggle", 6);
  assert.deepEqual(selection.ranges, [{ c0: 1, c1: 1, rows: null }, { c0: 3, c1: 3, rows: null }, { c0: 5, c1: 5, rows: null }], "Cmd on a chosen column takes it out");
  selection = pressSelection(selection, heading(5), "toggle", 6);
  assert.deepEqual(selectedColumns(selection), [1, 3], "Cmd on a block of its own takes it away");
  let drag: SheetSelection = pressSelection(selection, cell(1, 0), "replace", 6);
  drag = dragSelection(drag, cell(2, 1), 6);
  assert.deepEqual(drag.ranges, [{ c0: 1, c1: 2, rows: { first: 0, last: 1 } }]);
  assert.ok(cellSelected(drag, 2, 1) && !cellSelected(drag, 2, 2) && !cellSelected(drag, 2, null));
  assert.equal(columnRows(drag, 2)?.last, 1);
  assert.equal(columnRows(drag, 4), undefined);
  assert.ok(selectionEmpty(null) && selectionEmpty({ ranges: [], anchor: heading(0) }) && !selectionEmpty(drag));
  assert.equal(selectionText(drag, columnLetters), "B1:C2");
  assert.equal(selectionText(selection, columnLetters), "B, D");
});

const r = (letter: string, rows: { first: number; last: number } | null = null) => ({ data: "data-1", column: `Column ${letter}`, rows });

test("the chosen cells as ranges of one column each, in the order chosen; rows covering the sheet are the whole column", () => {
  const t = table();
  let selection = pressSelection(null, cell(1, 1), "replace", 6);
  selection = dragSelection(selection, cell(2, 2), 6);
  selection = pressSelection(selection, heading(5), "toggle", 6);
  assert.deepEqual(selectionRanges(t, selection, "data-1"), [r("B", { first: 1, last: 2 }), r("C", { first: 1, last: 2 }), r("F")]);
  assert.deepEqual(selectionRanges(t, dragSelection(pressSelection(null, cell(1, 0), "replace", 6), cell(1, 3), 6), "data-1"), [r("B")], "every row is the whole column");
  assert.deepEqual(selectionRanges(t, null, "data-1"), []);
});

test("a plot of the chosen cells, by Origin's rule: one range against the row number; with more, the first is X", () => {
  const t = table();
  assert.deepEqual(selectionPairs(t, pressSelection(null, heading(2), "replace", 6), "data-1"), [{ x: null, y: r("C"), error: null, labels: null }], "one column: against the row number");
  let selection = pressSelection(null, cell(1, 1), "replace", 6);
  selection = dragSelection(selection, cell(2, 2), 6);
  selection = pressSelection(selection, heading(5), "toggle", 6);
  assert.deepEqual(selectionPairs(t, selection, "data-1"), [{ x: r("B", { first: 1, last: 2 }), y: r("C", { first: 1, last: 2 }), error: null, labels: null }, { x: r("B", { first: 1, last: 2 }), y: r("F"), error: null, labels: null }]);
  selection = pressSelection(pressSelection(null, heading(4), "replace", 6), heading(0), "toggle", 6);
  assert.deepEqual(selectionPairs(t, selection, "data-1"), [{ x: r("E"), y: r("A"), error: null, labels: null }], "the first chosen is X, wherever it is");
  assert.deepEqual(selectionPairs(t, pressSelection(pressSelection(null, heading(3), "replace", 6), heading(0), "toggle", 6), "data-1"), [{ x: r("D"), y: r("A"), error: null, labels: null }], "text chosen first is the categories");
});

test("files read as they are: the chosen cells plot as they are, in a column that also holds text", () => {
  const grid = { rows: [["Μέτρηση", "Απόσταση", "Σκληρότητα"], [1, 3, 70], [2, 6, 68], ["Fitting", null, null], ["Μέτρηση", "Απόσταση (mm)", "fitting"], [1, 3, 71.2], [2, 6, 69.5]] };
  const plain = buildTable(grid);
  const cells = (c0: number, c1: number, first: number, last: number) => ({ ranges: [{ c0, c1, rows: { first, last } }], anchor: { column: c0, row: first } });
  assert.deepEqual(selectionPairs(plain, cells(1, 2, 5, 6), "data-1"), [{ x: r("B", { first: 5, last: 6 }), y: r("C", { first: 5, last: 6 }), error: null, labels: null }], "two chosen columns: the first is X");
  assert.deepEqual(selectionPairs(plain, cells(1, 2, 3, 4), "data-1"), [], "rows of text hold nothing to plot");
});

test("roles given to chosen ranges: each Y against the nearest X before it, a Y error to the Y before it, Skip left out", () => {
  const t = table();
  let selection = pressSelection(null, heading(0), "replace", 6);
  for (const column of [1, 2, 4, 5]) selection = pressSelection(selection, heading(column), "toggle", 6);
  const roles = new Map([[cellsKey(r("C")), "yerr" as const], [cellsKey(r("E")), "x" as const], [cellsKey(r("F")), "y" as const]]);
  const plan = selectionPlan(t, selection, "data-1", (cells) => roles.get(cellsKey(cells)));
  assert.deepEqual(plan.ranges.map((item) => item.role), ["x", "y", "yerr", "x", "y"]);
  assert.deepEqual(plan.pairs, [{ x: r("A"), y: r("B"), error: r("C"), labels: null }, { x: r("E"), y: r("F"), error: null, labels: null }]);
  const skipped = selectionPlan(t, selection, "data-1", (cells) => (cells.column === "Column B" ? "skip" : undefined));
  assert.deepEqual(skipped.pairs.map((pair) => pair.y.column), ["Column C", "Column E", "Column F"], "a skipped range is left out");
  const noX = selectionPlan(t, selection, "data-1", (cells) => (cells.column === "Column A" ? "y" : undefined));
  assert.equal(noX.pairs[0].x, null, "a Y with no X anywhere is against the row number");
  const text = selectionPlan(t, pressSelection(null, heading(3), "replace", 6), "data-1", () => "y");
  assert.deepEqual([text.ranges[0].role, text.pairs], ["skip", []], "cells without numbers cannot be Y");
});

test("a Label range gives the Y before it its labels; text cells can be labels", () => {
  const t = table();
  let selection = pressSelection(null, heading(0), "replace", 6);
  for (const column of [1, 3]) selection = pressSelection(selection, heading(column), "toggle", 6);
  assert.equal(selectionPlan(t, selection, "data-1").ranges[2].role, "skip", "text is skipped unless it is given a role");
  const plan = selectionPlan(t, selection, "data-1", (cells) => (cells.column === "Column D" ? "label" : undefined));
  assert.deepEqual(plan.pairs, [{ x: r("A"), y: r("B"), error: null, labels: r("D") }]);
});

test("text chosen first, with numbers after it, is the categories along X; text can be given X", () => {
  const t = table();
  let selection = pressSelection(null, heading(3), "replace", 6);
  selection = pressSelection(selection, heading(1), "toggle", 6);
  const plan = selectionPlan(t, selection, "data-1");
  assert.deepEqual(plan.ranges.map((item) => item.role), ["x", "y"]);
  assert.deepEqual(plan.pairs, [{ x: r("D"), y: r("B"), error: null, labels: null }]);
});
