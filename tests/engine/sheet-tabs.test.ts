// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A workbook's sheet tabs: at their natural widths while they fit, else shrunk to one shared width, never below the least.
import assert from "node:assert/strict";
import test from "node:test";
import { SHEET, sheetPart, tabLayout, tabWidth, TAB_MIN } from "../../source/engine";

test("tabs keep their widths while they fit beside the grip; else the widest share the room, never below the least", () => {
  const names = ["Bar 1", "Bar 2 (quenched)", "Tempered 600 °C"];
  const wide = tabLayout(names, 1000);
  assert.deepEqual(wide.map((tab) => tab.width), names.map(tabWidth));
  const narrow = tabLayout(names, 272);
  const total = narrow.reduce((sum, tab) => sum + tab.width, 0);
  assert.ok(total <= 272 - SHEET.grip, `${total} fits`);
  assert.equal(narrow[0].width, tabWidth("Bar 1"), "a narrow tab keeps its width");
  assert.equal(narrow[1].width, narrow[2].width, "the widest share one width");
  assert.deepEqual(narrow.map((tab) => tab.left), [0, narrow[0].width, narrow[0].width + narrow[1].width]);
  assert.ok(tabLayout(names.concat(names, names), 120).every((tab) => tab.width >= TAB_MIN), "never below the least");
  const box = { x: 0, y: 0, width: 272, height: 288 };
  const view = { columns: 2, rows: 9, tabs: names, scrollRow: 0, scrollColumn: 0 };
  assert.deepEqual(sheetPart(box, view, narrow[2].left + 2, 288 - SHEET.tabs / 2), { kind: "tab", index: 2 }, "a click finds the tab where it is drawn");
});
