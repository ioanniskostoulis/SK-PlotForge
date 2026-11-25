// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Excel's number formats: each code against the text Excel shows for a value.
import assert from "node:assert/strict";
import test from "node:test";
import { formatDateCode, formatNumber, generalNumber } from "../../source/engine";

test("numbers: decimals, thousands, percent, scaling, scientific, sections, literals and fractions, as Excel writes them", () => {
  const cases: [number, string, string][] = [
    [1234.5678, "0", "1235"], [1234.5678, "0.00", "1234.57"], [1234.5678, "#,##0", "1,235"], [1234.5678, "#,##0.00", "1,234.57"],
    [0.1234, "0%", "12%"], [0.1234, "0.00%", "12.34%"], [0.5, "0.0#", "0.5"], [5, "0.##", "5."], [0.25, "#.00", ".25"],
    [12345.678, "0.00E+00", "1.23E+04"], [0.000123, "0.00E+00", "1.23E-04"], [12345, "##0.0E+0", "12.3E+3"],
    [-1234.5, "#,##0.00;(#,##0.00)", "(1,234.50)"], [-5, "0.0", "-5.0"], [0, "0.00;-0.00;\"zero\"", "zero"],
    [1500000, "#,##0,,\"M\"", "2M"], [1234.5, "#,##0,\"k\"", "1k"], [12.5, "\"$\"#,##0.00", "$12.50"], [-12.5, "[$€-407] #,##0.00", "-€ 12.50"],
    [3.5, "0.0 \"kg\"", "3.5 kg"], [7, "000", "007"], [1.5, "# ?/?", "1 1/2"], [0.3333, "?/?", "1/3"], [2.75, "# ??/??", "2 3/4"],
    [0.5, "[Red]0.00", "0.50"], [0.0095, "0.0%", "1.0%"], [0.0045, "0.0%", "0.5%"], [2.675, "0.00", "2.68"], [1.005, "0.00", "1.01"], [42, "General", "General"], [3.14159, "@", "@"],
  ];
  for (const [value, code, shown] of cases) {
    const got = formatNumber(value, code);
    if (shown === "General") assert.equal(got, null, code);
    else if (shown === "@") assert.equal(got, null, code);
    else assert.equal(got, shown, `${value} in ${code}`);
  }
});

test("General writes ten significant figures, whole numbers whole, very large or small in E, without float noise", () => {
  assert.deepEqual([generalNumber(0.1 + 0.2), generalNumber(42), generalNumber(1 / 3), generalNumber(1.5e12), generalNumber(-2.5e-10)],
    ["0.3", "42", "0.3333333333", "1.5E+12", "-2.5E-10"]);
});

test("dates and times in their codes; m is minutes beside hours or seconds; elapsed times from a number of days", () => {
  const ms = Date.UTC(2026, 10, 17, 14, 5, 9, 250);
  const cases: [string, string][] = [
    ["yyyy-mm-dd", "2026-11-17"], ["dd/mm/yyyy", "17/11/2026"], ["d-mmm-yy", "17-Nov-26"], ["mmmm d, yyyy", "November 17, 2026"],
    ["dddd", "Tuesday"], ["h:mm", "14:05"], ["h:mm AM/PM", "2:05 PM"], ["hh:mm:ss", "14:05:09"], ["mm:ss.0", "05:09.2"], ["mmm-yy", "Nov-26"],
  ];
  for (const [code, shown] of cases) assert.equal(formatDateCode(ms, code), shown, code);
  assert.equal(formatDateCode(ms, "General"), null);
  assert.equal(formatNumber(1.5, "[h]:mm:ss"), "36:00:00", "a day and a half, elapsed");
  assert.equal(formatNumber(0.0625, "[mm]:ss"), "90:00");
});
