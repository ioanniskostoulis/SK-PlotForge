// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A plot's text settings (sizes, sizing, fonts) and its legend's place and backing.
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTable, cleanPlotText, newNamedRange, newPlot, parsePlots, plotRecord, plotScene, PT, setPlotText, tablesOnly, textFamily,
  type CellRange, type NamedRange, type SceneItem,
} from "../../source/engine";

const measure = (text: string, pt: number) => ({ width: text.length * pt * 0.8, ascent: pt * 0.93, descent: pt * 0.27 });
const table = buildTable({ rows: [["Distance (mm)", "Hardness (HRC)", "T (°C)"], [0, 72, 20], [5, 70, 120], [10, 64, 300]] });
const at = (letter: string): CellRange => ({ data: "data-1", column: `Column ${letter}`, rows: { first: 1, last: 3 } });
const names: NamedRange[] = [["A", "Distance", "mm"], ["B", "Hardness", "HRC"], ["C", "T", "°C"]].reduce<NamedRange[]>((list, [letter, name, unit]) => [...list, newNamedRange(list, at(letter), name, unit)], []);
const sources = tablesOnly(() => table, names);
const plotOf = () => { const plot = newPlot([], "line-symbol", [{ x: at("A"), y: at("B") }, { x: at("A"), y: at("C") }], { x: 0, y: 0 }); plot.title = "Jominy"; return plot; };
const texts = (items: readonly SceneItem[]) => items.flatMap((item) => (item.kind === "text" ? [item] : []));

test("text settings: sizes and fonts the app sets, fixed or scaled with the plot, maths in the maths font", (t) => {
  t.after(() => setPlotText({}));
  setPlotText({ titlePt: 12, textPt: 9, font: "Cambria" });
  const big = plotOf();
  Object.assign(big, { width: 960, height: 640 });
  const fixed = texts(plotScene(big, sources, measure).items);
  assert.equal(fixed.find((item) => item.text === "Jominy")?.size, 12 * PT);
  assert.ok(fixed.filter((item) => item.text !== "Jominy").every((item) => item.size === 9 * PT));
  assert.match(fixed[0].family, /^"Cambria"/);
  setPlotText({ sizing: "scaled" });
  assert.equal(texts(plotScene(big, sources, measure).items).find((item) => item.text === "Jominy")?.size, 22 * PT, "11 pt at twice the size");
  setPlotText({});
  assert.match(textFamily("y = 0.5x² + 2"), /^"Libertinus Math"/);
  assert.match(textFamily("Hardness (HRC)"), /^"Libertinus Serif"/);
  assert.deepEqual(cleanPlotText({ titlePt: 400, textPt: 10, sizing: "big", font: "Libertinus Sans", mathFont: "<x>" }), { textPt: 10, font: "Libertinus Sans" }, "only usable values are kept");
});

test("the legend stands in a chosen corner, or on Auto the top one covering less data; its white backing can be left out", () => {
  const plot = plotOf();
  const legendBox = (items: SceneItem[]) => items.find((item) => item.kind === "rect" && item.fill === "#FFFFFF" && item.x > 1);
  const auto = plotScene(plot, sources, measure);
  plot.legendPlace = "bottom-left";
  const scene = plotScene(plot, sources, measure), box = scene.legend!, area = scene.layout.area;
  assert.ok(box.x < area.x + area.width / 2 && box.y > area.y + area.height / 2, "at the bottom left");
  assert.ok(auto.legend!.y < area.y + area.height / 2, "Auto keeps a top corner");
  assert.ok(legendBox(scene.items));
  plot.legendBack = "none";
  const bare = plotScene(plot, sources, measure);
  assert.equal(legendBox(bare.items), undefined, "no white backing");
  assert.ok(bare.legend && bare.targets.some((target) => target.part.kind === "legend"), "still placed and right-clickable");
  const [back] = parsePlots([JSON.parse(JSON.stringify(plotRecord(plot)))]);
  assert.deepEqual([back.legendPlace, back.legendBack], ["bottom-left", "none"]);
  const plain = plotRecord(plotOf());
  assert.ok(!("legendPlace" in plain) && !("legendBack" in plain), "the defaults are not stored");
});

test("Scale with plot size scales text, lines and markers together; off, a larger plot keeps their sizes", (t) => {
  t.after(() => setPlotText({}));
  const widths = (width: number, height: number) => {
    const plot = plotOf();
    Object.assign(plot, { width, height });
    const items = plotScene(plot, sources, measure).items.flatMap((item) => (item.kind === "clip" ? item.items : [item]));
    const strokes = items.flatMap((item) => (item.kind === "path" && item.stroke ? [item.stroke.width] : []));
    return { line: Math.max(...strokes), text: texts(plotScene(plot, sources, measure).items).find((item) => item.text === "Jominy")!.size };
  };
  const small = widths(480, 320), fixed = widths(960, 640);
  assert.deepEqual(fixed, small, "off: the same lines and text at twice the size");
  setPlotText({ sizing: "scaled" });
  const scaled = widths(960, 640);
  assert.ok(Math.abs(scaled.line - 2 * small.line) < 1e-9 && Math.abs(scaled.text - 2 * small.text) < 1e-9, "on: both doubled");
});
