// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Settings layers: built-in, then app, then override, each option reporting its layer; resets restore the app value;
// a value equal to the layer below is no override; stored layers are checked; per-image overrides are saved.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BUILT_IN_EXPORT, BUILT_IN_IMAGE, cleanExportSettings, cleanImageSettings, describeImage, directScale, effective, emptyProject, newProjectImage, parseProject,
  resetOverride, resolveCalibration, resolveLayers, serializeProject, setOverride, type ImageSettings,
} from "../../source/engine";

test("each option comes from the last layer that sets it: override, else app, else built-in", () => {
  const app: Partial<ImageSettings> = { greyMethod: "mean", maskColour: "blue" };
  const override: Partial<ImageSettings> = { maskColour: "orange", thresholdMode: "otsu" };
  const resolved = resolveLayers(BUILT_IN_IMAGE, app, override);
  assert.deepEqual(resolved.greyMethod, { value: "mean", from: "app" });
  assert.deepEqual(resolved.limitToThreshold, { value: false, from: "built-in" });
  assert.deepEqual(resolved.thresholdMode, { value: "otsu", from: "override" });
  assert.deepEqual(resolved.maskColour, { value: "orange", from: "override" });
  assert.deepEqual(resolved.measurements, { value: ["area", "areaFraction", "mean"], from: "built-in" });
  assert.deepEqual(effective(BUILT_IN_IMAGE, app, override), { greyMethod: "mean", thresholdMode: "otsu", maskColour: "orange", measurements: ["area", "areaFraction", "mean"], limitToThreshold: false, decimals: null });
});

test("reset to app setting restores the app's value; reset all restores every one", () => {
  const app: Partial<ImageSettings> = { maskColour: "blue" };
  let override: Partial<ImageSettings> = { maskColour: "orange", greyMethod: "red" };
  override = resetOverride(override, "maskColour");
  assert.deepEqual(resolveLayers(BUILT_IN_IMAGE, app, override).maskColour, { value: "blue", from: "app" });
  assert.deepEqual(resolveLayers(BUILT_IN_IMAGE, app, override).greyMethod, { value: "red", from: "override" });
  // Reset all is an empty layer: every option follows the app again.
  const all = resolveLayers(BUILT_IN_IMAGE, app, {});
  assert.ok(Object.values(all).every((item) => item.from !== "override"));
  // Resetting the app layer brings back the built-in values.
  assert.deepEqual(resolveLayers(BUILT_IN_IMAGE, {}, {}).maskColour, { value: "magenta", from: "built-in" });
});

test("a value equal to the app's is no override, so it does not carry a marker", () => {
  const app: Partial<ImageSettings> = { greyMethod: "mean" };
  assert.deepEqual(setOverride(BUILT_IN_IMAGE, app, {}, "greyMethod", "mean"), {});
  assert.deepEqual(setOverride(BUILT_IN_IMAGE, app, { greyMethod: "red" }, "greyMethod", "mean"), {});
  assert.deepEqual(setOverride(BUILT_IN_IMAGE, app, {}, "greyMethod", "green"), { greyMethod: "green" });
  // Lists compare by content: the default measurements set as an override is no override.
  assert.deepEqual(setOverride(BUILT_IN_IMAGE, {}, {}, "measurements", ["area", "areaFraction", "mean"]), {});
});

test("export settings layer the same way: per-export overrides over the app's", () => {
  const app = { ...BUILT_IN_EXPORT, jpegQuality: 75 };
  const override = setOverride(BUILT_IN_EXPORT, app, {}, "format", "jpeg");
  const resolved = resolveLayers(BUILT_IN_EXPORT, app, override);
  assert.deepEqual([resolved.format, resolved.jpegQuality, resolved.overwrite], [{ value: "jpeg", from: "override" }, { value: 75, from: "app" }, { value: "ask", from: "app" }]);
  assert.deepEqual(resolveLayers(BUILT_IN_EXPORT, app, resetOverride(override, "format")).format, { value: "png", from: "app" });
});

test("stored layers keep only valid values, so an invalid one falls through to the layer below", () => {
  assert.deepEqual(cleanImageSettings({ greyMethod: "hue", maskColour: "blue", measurements: ["area", "volume"], outlineColour: "white" }), { maskColour: "blue" });
  assert.deepEqual(cleanImageSettings(null), {});
  assert.deepEqual(cleanExportSettings({ format: "tiff", jpegQuality: 0, includeOverlays: true, overwrite: "never" }), { includeOverlays: true });
  assert.deepEqual(cleanExportSettings({ jpegQuality: 1 }), { jpegQuality: 1 });
  assert.deepEqual(cleanExportSettings({ jpegQuality: 100 }), { jpegQuality: 100 });
  assert.deepEqual(cleanExportSettings({ jpegQuality: 101 }), {});
  assert.deepEqual(cleanExportSettings({ scaleBarStyle: "simple", scaleBarLength: 20, scaleBarBlocks: 3, scaleBarSize: "large" }), { scaleBarStyle: "simple", scaleBarLength: 20, scaleBarBlocks: 3, scaleBarSize: "large" });
  assert.deepEqual(cleanExportSettings({ scaleBarLength: null }), { scaleBarLength: null });
  assert.deepEqual(cleanExportSettings({ scaleBarStyle: "dashed", scaleBarLength: 0, scaleBarBlocks: 6, scaleBarSize: "huge" }), {});
});

test("calibration has an app layer beneath the document's: image, document, app, pixels", () => {
  const app = directScale(1, "mm"), document = directScale(2, "µm"), own = directScale(3, "nm");
  assert.deepEqual(resolveCalibration(own, document, app).from, "image");
  assert.deepEqual(resolveCalibration(null, document, app).from, "document");
  assert.deepEqual(resolveCalibration(null, null, app), { calibration: app, from: "app" });
  assert.deepEqual(resolveCalibration("pixels", null, app), { calibration: null, from: "none" });
  assert.deepEqual(resolveCalibration(null, null, null), { calibration: null, from: "none" });
});

test("an image's overrides are saved with it, in a fixed order; an earlier measurements list becomes an override", () => {
  const source = describeImage(new Uint8Array(readFileSync("tests/fixtures/rgb-6x4.png"))).source;
  const project = emptyProject();
  project.images.push(newProjectImage(project, "/lab/a.png", "a.png", source, 0, 0));
  project.images[0].settings = { measurements: ["perimeter", "area"], maskColour: "cyan" };
  const text = serializeProject(project, null);
  assert.equal(serializeProject(parseProject(text, null), null), text);
  assert.deepEqual(JSON.parse(text).images[0].settings, { maskColour: "cyan", measurements: ["area", "perimeter"] });
  const data = JSON.parse(text);
  delete data.images[0].settings;
  data.images[0].measurements = ["mean"];
  assert.deepEqual(parseProject(JSON.stringify(data), null).images[0].settings, { measurements: ["mean"] });
  data.images[0].settings = { maskColour: "purple" };
  assert.throws(() => parseProject(JSON.stringify(data), null), /invalid image setting/);
});
