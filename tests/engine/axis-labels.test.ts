// Licensed under the GNU General Public License v2 or later. See LICENSE.
// An axis' number format and its tick labels' angle: how labels are written, kept, and given room.
import assert from "node:assert/strict";
import test from "node:test";
import { axisNumbers, axisScale, labelPlacement, layoutPlot, parsePlots, plotRecord, newPlot, PT, scaleLabel, scaleTicks, type PlotAxis } from "../../source/engine";

const axis = (patch: Partial<PlotAxis> = {}): PlotAxis => ({ title: null, min: null, max: null, step: null, minorStep: null, log: false, ...patch });
const labels = (patch: Partial<PlotAxis>, data: [number, number]) => { const scale = axisScale(axis(patch), data); return scaleTicks(scale, null).major.map((value) => scaleLabel(scale, value)); };
const measure = (text: string, pt: number) => ({ width: text.length * pt * PT * 0.6, ascent: pt * PT * 0.7, descent: pt * PT * 0.2 });

test("without a number format an axis keeps its step's decimals", () => {
  assert.deepEqual(labels({}, [0, 1]), ["0.0", "0.2", "0.4", "0.6", "0.8", "1.0"]);
  assert.equal(axisNumbers({ notation: "auto", decimals: null }), undefined, "automatic is not kept");
});

test("a number format writes every label of the axis alike", () => {
  assert.deepEqual(labels({ numbers: { notation: "fixed", decimals: 2 } }, [0, 1]), ["0.00", "0.20", "0.40", "0.60", "0.80", "1.00"]);
  assert.deepEqual(labels({ numbers: { notation: "fixed", decimals: null } }, [-1, 1]).slice(0, 2), ["−1.0", "−0.5"], "fixed takes the step's decimals and a true minus");
  assert.deepEqual(labels({ numbers: { notation: "scientific", decimals: 1 } }, [0, 3000]).slice(0, 3), ["0.0", "5.0×10²", "1.0×10³"]);
  assert.deepEqual(labels({ numbers: { notation: "auto", decimals: 1 } }, [0, 4e6]).slice(1, 2), ["5.0×10⁵"], "automatic notation is the whole axis'");
  assert.deepEqual(labels({ format: "percent", numbers: { notation: "fixed", decimals: 1 } }, [0, 0.5]).slice(0, 2), ["0.0%", "10.0%"]);
  assert.deepEqual(labels({ numbers: { notation: "si", decimals: 1 } }, [0, 3000]).slice(0, 3), ["0.0", "500.0", "1.0 k"], "SI prefix (forge-shell formatNumber)");
});

test("the number format and angle are kept with the plot, and only when set", () => {
  const plot = newPlot([], "scatter", [], { x: 0, y: 0 });
  plot.yAxis.numbers = { notation: "scientific", decimals: 2 };
  plot.xAxis.angle = 45;
  const record = plotRecord(plot) as any;
  assert.deepEqual(record.yAxis.numbers, { notation: "scientific", decimals: 2 });
  assert.equal(record.xAxis.angle, 45);
  assert.equal(record.xAxis.numbers, undefined);
  assert.equal(record.yAxis.angle, undefined);
  const [back] = parsePlots([record]);
  assert.deepEqual(back.yAxis.numbers, plot.yAxis.numbers);
  assert.equal(back.xAxis.angle, 45);
  assert.throws(() => parsePlots([{ ...record, xAxis: { angle: 30 } }]), /label angle/);
  assert.throws(() => parsePlots([{ ...record, yAxis: { numbers: { notation: "fixed", decimals: 11 } } }]), /number format/);
});

test("turned labels are anchored at their tick and the axes make room for them", () => {
  const box = { x: 0, y: 0, width: 480, height: 320 };
  const xLabels = ["2026-03-01", "2026-03-08", "2026-03-15"];
  const parts = { title: "", xTitle: "Day", yTitle: "Load (kN)", y2Title: "", yLabels: ["0", "100000"], y2Labels: null, firstXLabel: xLabels[0], lastXLabel: xLabels[2], xLabels };
  const level = layoutPlot(box, parts, measure);
  assert.equal(level.labelAnchors.x, level.xLabelsMiddle, "level labels are anchored as before");
  assert.equal(level.labelAnchors.y, level.yLabelsRight);
  const slanted = layoutPlot(box, { ...parts, angles: { x: 45 } }, measure), upright = layoutPlot(box, { ...parts, angles: { x: 90, y: 90 } }, measure);
  const bottom = (layout: typeof level) => layout.area.y + layout.area.height;
  assert.ok(bottom(slanted) < bottom(level) && bottom(upright) < bottom(slanted), "the X row deepens with the turn");
  assert.ok(upright.area.x < level.area.x, "upright Y labels take only their height across");
  assert.deepEqual(labelPlacement("x", 45), { anchor: "end", rotate: -45 });
  assert.deepEqual(labelPlacement("x2", 90), { anchor: "start", rotate: -90 });
  assert.deepEqual(labelPlacement("y", 90), { anchor: "middle", rotate: -90 });
  assert.deepEqual(labelPlacement("y2", 0), { anchor: "start", rotate: -0 });
});
