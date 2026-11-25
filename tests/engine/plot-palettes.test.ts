// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A plot's series are drawn in the app's data palette (the shell's data-palettes, Settings › General › Data colours),
// worked out when drawn: changing the palette recolours every plot at once. Only a colour picked for a series is kept.
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_DATA_PALETTE, dataColour, dataPaletteOf } from "forge-shell/app/data-palettes";
import { addSeries, newPlot, parsePlots, plotRecord, seriesColour, setDataPalette, type CellRange } from "../../source/engine";
import { CATALOG, COMMANDS } from "../../source/app/commands";

const at = (column: string): CellRange => ({ data: "d1", column, rows: null });
const plotOf = (count: number) => newPlot([], "line", Array.from({ length: count }, (_, i) => ({ x: at("A"), y: at(String.fromCharCode(66 + i)) })), { x: 0, y: 0 });
const colours = (plot: ReturnType<typeof plotOf>) => plot.series.map((series) => seriesColour(plot, series));

test("series follow the palette chosen, at once, for plots made before the change too", () => {
  const plot = plotOf(2);
  assert.deepEqual(colours(plot), [dataColour(DEFAULT_DATA_PALETTE, 0, 2), dataColour(DEFAULT_DATA_PALETTE, 1, 2)]);
  setDataPalette("colour-blind-safe");
  try { assert.deepEqual(colours(plot), dataPaletteOf("colour-blind-safe").colours.slice(0, 2)); }
  finally { setDataPalette(DEFAULT_DATA_PALETTE); }
});

test("a spectrum spreads from its first stop to its last over the series, and again when a series is added", () => {
  const spectrum = dataPaletteOf("magenta-to-blue"), last = spectrum.colours[spectrum.colours.length - 1];
  setDataPalette(spectrum.id);
  try {
    const plot = plotOf(3);
    assert.deepEqual([colours(plot)[0], colours(plot)[2]], [spectrum.colours[0], last]);
    addSeries(plot, { x: at("A"), y: at("F") }, "line");
    assert.equal(colours(plot)[3], last);
    assert.notEqual(colours(plot)[2], last);
  } finally { setDataPalette(DEFAULT_DATA_PALETTE); }
});

test("a picked colour stays; only it is stored, and an earlier document's stored colours follow the palette", () => {
  const plot = plotOf(2);
  plot.series[1].colour = "#123456";
  setDataPalette("ocean");
  try { assert.deepEqual(colours(plot), [dataPaletteOf("ocean").colours[0], "#123456"]); }
  finally { setDataPalette(DEFAULT_DATA_PALETTE); }
  const record = JSON.parse(JSON.stringify(plotRecord(plot)));
  assert.deepEqual(record.series.map((series: Record<string, unknown>) => series.ownColour), [undefined, "#123456"]);
  assert.deepEqual(parsePlots([record])[0].series.map((series) => series.colour), [null, "#123456"]);
  const earlier = { ...record, palette: "orchid", series: record.series.map((series: Record<string, unknown>) => ({ ...series, ownColour: undefined, colour: "#C0504D" })) };
  assert.deepEqual(parsePlots([earlier])[0].series.map((series) => series.colour), [null, null]);
});

test("the palette is set in Settings; a series' colour command takes auto", () => {
  const plot = COMMANDS.find((entry) => entry.name === "plot")!.subcommands!;
  assert.ok(!plot.some((item) => item.syntax.startsWith("plot palette")));
  assert.ok(plot.some((item) => item.syntax.startsWith("plot series <n> <property>")));
  // The colour's choices are in help plot's notes (descriptions are at most 80 characters since forge-shell 5.0.0).
  assert.ok(CATALOG.details.plot.notes!.some((note) => /colour auto \(follows the palette\)/.test(note)));
});
