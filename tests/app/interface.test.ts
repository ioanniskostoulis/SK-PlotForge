// Licensed under the GNU General Public License v2 or later. See LICENSE.
// PlotForge's interface rules: the Terminal catalogue follows the help conventions, the menus' shortcuts fall in the
// shell's tiers, undo and the dirty mark follow the document's snapshots, and the inspector's wording is consistent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkCommandSyntax } from "forge-shell/app/command-help";
import { blockConformance } from "forge-shell/app/conformance";
import { shellSettingsPages } from "forge-shell/app/settings-dialog";
import { createTerminalPreferences } from "forge-shell/app/terminal-preferences";
import { moveItem } from "forge-shell/app/content-selection";
import { STANDARD_ACTIONS } from "forge-shell/app/shared-commands";
import { checkShortcuts } from "forge-shell/app/shortcuts";
import { STANDARD_ITEMS } from "forge-shell/app/standard-items";
import { checkTipWording } from "forge-shell/app/tips";
import { describeImage, directScale, knownLength, newPlot, newProjectImage, newStep, parseProject, resultSize, workingShape } from "../../source/engine";
import { ACTIONS, BLOCKS, CATALOG, ENVIRONMENT, PROFILE, commandAccepts, ITEM_VERBS, PANES, SHARED, COMMANDS, completions, REPOSITORY, STEP_ADD_FORMS, STEP_PARAMETERS, valueProblem, WELCOME_COMMANDS } from "../../source/app/commands";
import { syntaxPattern } from "forge-shell/app/arguments";
import { CROP_KEY, PLOT_CANVAS_TOOLS, ROI_LABELS, ROI_TOOLS, SELECT_KEY } from "../../source/app/roi-view";
import { PLOT_TOOL_KEYS, plotKindForKey } from "../../source/app/plot-icons";
import { toolKeyProblems } from "forge-shell/app/canvas-tools";
import { startThreshold, thresholdSummary } from "../../source/app/threshold-view";
import { cellText, MEASURE_KEY, sortRows, visibleColumns } from "../../source/app/results-view";
import type { ResultRow } from "../../source/engine";
import { shortcutTier } from "forge-shell/app/shortcuts";
import { calibrationSummary, parsePositive, parseUnit, pixelSizeText, startCalibration } from "../../source/app/calibration-view";
import { ADD_STEP_ITEMS, conversionText, kernelText, parseKernel, parseNumber, STEP_NAMES, stepSummary } from "../../source/app/step-wording";
import { EXPORT_KEY, IMPORT_KEY, plotMenus, shortcutRegistry, type MenuState } from "../../source/app/menu-bar";
import { fileSize } from "../../source/app/inspector";
import { PlotDocument, UNDO_LIMIT } from "../../source/app/plot-document";

const source = describeImage(new Uint8Array(readFileSync("tests/fixtures/rgb-6x4.png"))).source;

test("every command's syntax and subcommands follow the help conventions", () => {
  const problems = COMMANDS.flatMap((entry) => [entry.syntax, ...(entry.subcommands ?? []).map((form) => form.syntax)].flatMap(checkCommandSyntax));
  assert.deepEqual(problems, []);
  for (const entry of COMMANDS) {
    assert.match(entry.description, /^[A-Z][^.]*[^.]$/, `${entry.name}: a description is an imperative fragment without a final period`);
    assert.ok(entry.description.length <= 70, `${entry.name}: description longer than 70 characters`);
  }
});

test("every command is in one help group, and Console comes last", () => {
  const grouped = CATALOG.groups.flatMap(([, names]) => [...names]);
  assert.deepEqual([...grouped].sort(), COMMANDS.map((entry) => entry.name).sort());
  assert.equal(new Set(grouped).size, grouped.length);
  assert.equal(CATALOG.groups.at(-1)![0], "Console");
});

test("the welcome state offers only commands that run without a document", () => {
  for (const name of ["import", "export", "roi", "threshold", "measure", "results", "save", "close", "undo", "redo", "select", "zoom", "fit", "snap", "image", "step", "pixel", "calibrate"]) assert.ok(!WELCOME_COMMANDS.has(name), name);
  for (const name of ["new", "open", "recent", "tabs", "autosave", "help", "history", "clear", "theme", "panel", "inspector", "terminal", "about", "version"]) assert.ok(WELCOME_COMMANDS.has(name), name);
  assert.ok(!completions("", true).includes("image"));
  assert.ok(completions("", false).includes("image"));
});

test("completion offers a verb's choices and subcommands", () => {
  assert.deepEqual(completions("zo", false), ["zoom"]);
  assert.deepEqual(completions("zoom f", false), ["zoom fit"]);
  assert.deepEqual(completions("image r", false), ["image rename", "image remove"]);
  assert.deepEqual(completions("snap ", false), ["snap on", "snap off"]);
  assert.deepEqual(completions("step o", false), ["step on", "step off"]);
  assert.deepEqual(completions("step add ", false), ["step add grey", "step add 8-bit", "step add crop", "step add rotate", "step add flip", "step add canvas", "step add translate", "step add levels", "step add invert", "step add math", "step add contrast", "step add filter", "step add calculator", "step add threshold", "step add mask"]);
  assert.deepEqual(completions("step add l", false), ["step add levels"]);
  assert.deepEqual(completions("step", true), []);
});

test("each command accepts its documented forms and refuses others", () => {
  const accepts = (name: string, arg: string) => commandAccepts(COMMANDS.find((entry) => entry.name === name)!, arg);
  assert.ok(accepts("image", "list") && accepts("image", "info") && accepts("image", "info 2") && accepts("image", "remove 1") && accepts("image", "rename 1 \"Plate A\"") && accepts("image", "info \"Plate A\""));
  assert.ok(!accepts("image", "remove") && !accepts("image", "rename 1") && !accepts("image", "delete 1"));
  assert.ok(accepts("zoom", "in") && accepts("zoom", "actual") && !accepts("zoom", "") && !accepts("zoom", "100"));
  assert.ok(accepts("zoom", "fit") && !accepts("zoom", "all"));
  assert.ok(accepts("save", "") && accepts("save", "as") && !accepts("save", "all"));
  for (const arg of ["list", "add grey", "add levels 10 240 1.2", "set 2 gamma 1.5", "on 1", "off 1", "move 1 3", "remove 2"]) assert.ok(accepts("step", arg), arg);
  for (const arg of ["", "add", "remove", "move 1", "set 1 gamma", "on", "delete 1"]) assert.ok(!accepts("step", arg), arg);
  assert.ok(accepts("pixel", "0 0") && accepts("pixel", "10 20") && !accepts("pixel", "10") && !accepts("pixel", "-1 0") && !accepts("pixel", "1.5 0"));
  // Preferences are the shared settings command's keys (shell 4.6.0); PlotForge has no verb of its own for them.
  assert.ok(!COMMANDS.some((entry) => entry.name === "defaults"));
});

test("step add documents every step type, and step set every parameter", () => {
  assert.deepEqual(STEP_ADD_FORMS.map(([form]) => form.split(" ")[0]), ["grey", "8-bit", "crop", "rotate", "flip", "canvas", "translate", "levels", "invert", "math", "contrast", "filter", "calculator", "threshold", "mask"]);
  assert.deepEqual(Object.keys(STEP_PARAMETERS).sort(), Object.keys(STEP_NAMES).sort());
  for (const [form] of STEP_ADD_FORMS) assert.deepEqual(checkCommandSyntax(`step add ${form}`), [], form);
});

test("the Terminal has the shell's shared commands, one entry per verb, and PlotForge adds only its own", () => {
  const names = COMMANDS.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length, "a verb is listed twice");
  for (const name of ["new", "open", "recent", "save", "close", "autosave", "undo", "redo", "zoom", "panel", "inspector", "theme", "terminal", "about", "version", "changes", "shortcuts", "licenses", "settings", "help", "history", "clear"]) assert.ok(names.includes(name), name);
  // Updates are offered only in Settings › Updates (shell 5.0.0): no updates command.
  assert.ok(!names.includes("updates"), "no updates command");
  assert.ok(!names.includes("print"), "PlotForge has no Print item, so no print command");
  for (const action of ACTIONS) assert.ok((STANDARD_ACTIONS as readonly string[]).includes(action), action);
});

test("help lists File, Edit, the shell's Items, View, Document, Help and Console, in the order of the menus", () => {
  assert.deepEqual(CATALOG.groups.map(([name]) => name), ["File", "Edit", "Items", "View", "Document", "Help", "Console"]);
  assert.deepEqual(CATALOG.groups.find(([name]) => name === "Document")![1], ["data", "plot", "fit", "image", "step", "calibrate", "roi", "threshold", "phase", "measure", "label", "density", "results", "xy", "pixel", "display", "histogram", "profile", "peaks", "peak"]);
});

const STATES: MenuState[] = [true, false].flatMap((hasDocument) => [true, false].flatMap((desktop) => [true, false].map((mac) => ({
  hasDocument, canUndo: hasDocument, canRedo: hasDocument, hasSelection: hasDocument, snap: true, showInspector: true, showBottomPanel: true,
  canAddStep: hasDocument, canRepeat: hasDocument, canExport: hasDocument, canCopyImage: hasDocument, tool: "select", hasRoi: hasDocument, threshold: hasDocument ? "none" : null, showMask: true, canMeasure: hasDocument, hasResults: hasDocument, step: hasDocument ? { enabled: true, first: false, last: false } : null,
  colourThreshold: false, showScaleBar: false, canPasteInto: false, phases: 0, hasThresholdStep: false, maskDisplay: "colours" as const,
  appearance: "dark" as const, autosave: "off" as const, recent: ["/a/one.pfg"], nativeAppMenu: desktop && mac, desktop, updates: !!REPOSITORY, mac,
}))));

test("checkShortcuts reports nothing for the whole menu registry, on macOS and Windows, with and without a document", () => {
  for (const state of STATES) assert.deepEqual(checkShortcuts(shortcutRegistry(plotMenus(state)), state.mac!), [], JSON.stringify(state));
});

test("every standard menu item has the shell's label and key, and Fit is Cmd+0 with Actual size on Cmd+1", () => {
  const items = new Map<string, { label?: string; key?: string }>();
  const walk = (nodes: ReturnType<typeof plotMenus>) => { for (const node of nodes) { if (node.id) items.set(node.id, node); if (node.submenu) walk(node.submenu); } };
  walk(plotMenus(STATES[0]));
  for (const [id, node] of items) {
    const standard = STANDARD_ITEMS[id as keyof typeof STANDARD_ITEMS];
    if (!standard) continue;
    assert.equal(node.label, standard.label.replace("{noun}", "document").replace("{product}", "PlotForge"), id);
    assert.equal(node.key, standard.key?.(true), id);
  }
  assert.equal(items.get("view.fit")?.key, "CmdOrCtrl+0");
  assert.equal(items.get("view.actualSize")?.key, "CmdOrCtrl+1");
  assert.equal(items.get("file.import")?.key, IMPORT_KEY);
});

test("the menus are File, Edit, View, Document and Help, in that order", () => {
  for (const state of STATES) assert.deepEqual(plotMenus(state).map((menu) => menu.label), ["File", "Edit", "View", "Document", "Help"]);
});

test("the Document menu adds each step type and acts on the current step, enabled only when it can", () => {
  const items = (state: MenuState) => plotMenus(state).find((menu) => menu.label === "Document")!.submenu!;
  const add = items(STATES[0]).find((node) => node.label === "Add step")!.submenu!;
  // One submenu per group, in the order of the work, each with its steps in order.
  assert.deepEqual(add.map((node) => node.label), ["Convert", "Geometry", "Adjust", "Filters", "Combine", "Threshold"]);
  // An image has one Threshold step, and the mask steps after it need it.
  const thresholdItems = (state: MenuState) => items(state).find((node) => node.label === "Add step")!.submenu!.find((node) => node.label === "Threshold")!.submenu!.map((node) => node.enabled);
  assert.deepEqual(thresholdItems(STATES[0]), [true, false, false, false, false, false, false, false]);
  assert.deepEqual(thresholdItems({ ...STATES[0], hasThresholdStep: true }), [false, true, true, true, true, true, true, true]);
  for (const group of add) assert.deepEqual(group.submenu!.map((node) => node.label), ADD_STEP_ITEMS.filter((item) => item.group === group.label).map((item) => item.label), group.label);
  assert.deepEqual(add.find((node) => node.label === "Filters")!.submenu!.map((node) => node.label), ["Gaussian blur", "Mean", "Median", "Minimum", "Maximum", "Variance", "Unsharp mask", "Smooth", "Sharpen", "Find edges", "Despeckle", "Remove bright outliers", "Remove dark outliers", "Convolve"]);
  // Fill needs a region, so it is added from the region (Fill region, Clear outside region), not from Add step.
  // Fill comes from a region, and Paste into selection from Edit; every other step type is in Add step.
  assert.deepEqual([...new Set(ADD_STEP_ITEMS.map((item) => item.type))].sort(), Object.keys(STEP_NAMES).filter((type) => type !== "fill" && type !== "paste").sort());
  const ids = ["document.step.enabled", "document.step.up", "document.step.down", "document.step.remove"];
  const enabled = (state: MenuState) => ids.map((id) => items(state).find((node) => node.id === id)!.enabled);
  assert.deepEqual(enabled({ ...STATES[0], step: { enabled: true, first: false, last: false } }), [true, true, true, true]);
  assert.deepEqual(enabled({ ...STATES[0], step: { enabled: false, first: true, last: true } }), [true, false, false, true]);
  assert.deepEqual(enabled({ ...STATES[0], step: null }), [false, false, false, false]);
  assert.equal(items({ ...STATES[0], step: { enabled: false, first: true, last: true } }).find((node) => node.id === "document.step.enabled")!.checked, false);
  assert.equal(items({ ...STATES[0], canAddStep: false }).find((node) => node.label === "Add step")!.enabled, false);
  // Measure is the Document menu's only key, on the App tier; the step items bind none.
  const keyed: string[] = [];
  const walk = (nodes: ReturnType<typeof items>) => { for (const node of nodes) { if (node.key) keyed.push(node.id!); if (node.submenu) walk(node.submenu); } };
  walk(items(STATES[0]));
  assert.deepEqual(keyed, ["document.measure"]);
});

test("import conversions read as one phrase, capitalised once", () => {
  assert.equal(conversionText(["palette-to-rgb", "alpha-on-white"]), "Palette expanded to RGB, alpha composited on white");
  assert.equal(conversionText(["depth-to-8"]), "Scaled to 8 bits");
  assert.equal(conversionText([]), "");
});

test("a step's summary names its parameters", () => {
  const shape = workingShape(source);
  assert.equal(stepSummary(newStep("grey", [], shape)), "Luminance");
  assert.equal(stepSummary(newStep("crop", [], shape)), "6 × 4 px at 0, 0");
  assert.equal(stepSummary(newStep("levels", [], shape)), "0 to 255, gamma 1");
  assert.equal(stepSummary({ ...newStep("8-bit", [], shape), mapping: "range", low: 100, high: 4000 } as never), "100 to 4000");
  assert.equal(stepSummary({ ...newStep("rotate", [], shape), quarterTurns: 3 } as never), "90° counter-clockwise");
});

test("Select all and Copy are PlotForge's own on the work surface, while Cut and Paste keep their roles for text fields", () => {
  const edit = plotMenus(STATES[0]).find((menu) => menu.label === "Edit")!.submenu!;
  for (const id of ["edit.selectAll", "edit.copy"]) assert.equal(edit.find((node) => node.id === id)?.role, undefined, id);
  for (const id of ["edit.cut", "edit.paste"]) assert.ok(edit.find((node) => node.id === id)?.role, id);
  assert.equal(edit.find((node) => node.id === "edit.copy")?.key, "CmdOrCtrl+C");
});

test("Export image… follows Import image… in File, on Shift+Cmd+E, enabled only with images to export", () => {
  const file = (state: MenuState) => plotMenus(state).find((menu) => menu.label === "File")!.submenu!;
  const ids = file(STATES[0]).map((node) => node.id);
  assert.equal(ids.indexOf("file.export"), ids.indexOf("file.import") + 1);
  assert.equal(file(STATES[0]).find((node) => node.id === "file.export")!.key, EXPORT_KEY);
  assert.equal(EXPORT_KEY, "CmdOrCtrl+Shift+E");
  assert.equal(file({ ...STATES[0], canExport: false }).find((node) => node.id === "file.export")!.enabled, false);
});

test("Settings… ends File, and Help has no Check for updates…: updates are in Settings › Updates", () => {
  for (const state of STATES) {
    const menus = plotMenus(state);
    const file = menus[0].submenu!;
    assert.equal(file.at(-1)!.id, "app.settings");
    assert.ok(file.at(-2)!.separator);
    assert.ok(!menus.at(-1)!.submenu!.some((node) => node.id === "about.updates"));
  }
  assert.equal(REPOSITORY, "ioanniskostoulis/SK-PlotForge");
});

test("a dragged tab lands before the tab whose place it takes, and the others keep their order", () => {
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 3), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 1, 4), ["a", "c", "d", "b"]);
});

test("PlotForge's tooltips follow the wording rule", () => {
  for (const tip of ["Move images in grid steps; hold Option while dragging to place them freely.", "The left edge of the image on the work surface, in pixels.",
    "Read-only original; the browser preview gives no folder.", "Clear the messages.", "Run this step; clear it to see the result without it.",
    "Add a step at the end of the list.", "Remove the current step.", "The image must be shown before steps can be added.",
    "Import made these changes to reach a grey or RGB image; the file is unchanged.",
    "Luminance weighs red, green and blue by 0.299, 0.587 and 0.114 (Rec. 601).",
    "Min-max stretches the image's own range to 0 to 255; a fixed range clips outside it.",
    "The left edge of the rectangle, in pixels of the image this step receives.", "Above 1 brightens the middle values, below 1 darkens them.",
    "Values at or below this become 0. From 0 to 65535.", "Select images to export the result of their steps.",
    "Select one image to copy it as it is shown.", "Lossless, at the depth and colour of the result of the steps; the original is never written."]) assert.deepEqual(checkTipWording(tip), [], tip);
});

test("file sizes: bytes below 1 KB, one decimal below 10, whole numbers above", () => {
  assert.equal(fileSize(0), "0 B");
  assert.equal(fileSize(1023), "1023 B");
  assert.equal(fileSize(1024), "1.0 KB");
  assert.equal(fileSize(10 * 1024 - 1), "10.0 KB");
  assert.equal(fileSize(10 * 1024), "10 KB");
  assert.equal(fileSize(3.4 * 1024 * 1024), "3.4 MB");
});

// MARK: the document

test("a new document is clean, an edit makes it dirty, and undoing the edit makes it clean again", () => {
  const doc = new PlotDocument("Untitled 1");
  assert.equal(doc.dirty, false);
  doc.edit((project) => { project.images.push(newProjectImage(project, "/a/b.png", "b.png", source, 0, 0)); });
  assert.equal(doc.dirty, true);
  assert.ok(doc.canUndo && !doc.canRedo);
  assert.ok(doc.undo());
  assert.equal(doc.dirty, false);
  assert.equal(doc.project.images.length, 0);
  assert.ok(doc.redo());
  assert.equal(doc.project.images.length, 1);
});

test("an edit that changes nothing is not an undo step", () => {
  const doc = new PlotDocument("Untitled 1");
  assert.equal(doc.edit(() => {}), false);
  assert.equal(doc.canUndo, false);
});

test("a new edit clears redo, and undo keeps at most its limit of steps", () => {
  const doc = new PlotDocument("Untitled 1");
  doc.edit((project) => { project.grid.snap = false; });
  doc.undo();
  doc.edit((project) => { project.grid.spacing = 8; });
  assert.equal(doc.canRedo, false);
  for (let i = 0; i < UNDO_LIMIT + 5; i++) doc.edit((project) => { project.grid.spacing = 100 + i; });
  let steps = 0;
  while (doc.undo()) steps++;
  assert.equal(steps, UNDO_LIMIT);
});

test("steps are document edits: each is one undo step, and the display size follows the result", () => {
  const doc = new PlotDocument("Untitled 1");
  doc.edit((project) => { project.images.push(newProjectImage(project, "/lab/cells.png", "cells.png", source, 0, 0)); });
  doc.edit((project) => {
    const target = project.images[0];
    target.steps.push({ ...newStep("crop", target.steps, workingShape(source)), width: 3 } as never, newStep("rotate", target.steps, workingShape(source)));
    Object.assign(target, resultSize(target));
  });
  assert.deepEqual([doc.project.images[0].width, doc.project.images[0].height], [4, 3]);
  assert.ok(doc.dirty);
  doc.undo();
  // Undone, the image has no steps and its own 6 × 4 px again.
  assert.deepEqual([doc.project.images[0].steps.length, doc.project.images[0].width, doc.project.images[0].height], [0, 6, 4]);
  doc.redo();
  assert.equal(doc.project.images[0].steps.length, 2);
});

test("undo drops the selection of an image that no longer exists", () => {
  const doc = new PlotDocument("Untitled 1");
  doc.edit((project) => { project.images.push(newProjectImage(project, null, "b.png", source, 0, 0)); });
  doc.selection = new Set(["image-1"]);
  doc.undo();
  assert.equal(doc.selection.size, 0);
});

test("undo keeps a selected plot that is still there, and drops one that is gone", () => {
  const doc = new PlotDocument("Untitled 1");
  doc.edit((project) => { project.plots.push(newPlot([], "scatter", [{ x: null, y: { data: "data-1", column: "Column A", rows: null } }], { x: 0, y: 0 })); });
  doc.edit((project) => { project.plots[0].title = "Cooling"; });
  doc.selection = new Set(["plot-1"]);
  doc.undo();
  assert.deepEqual([...doc.selection], ["plot-1"]);
  assert.equal(doc.selectedPlot()?.title, "");
  doc.undo();
  assert.equal(doc.selection.size, 0);
});

test("Snap to grid is a document option: it marks the document dirty but is no undo step, and undo keeps it", () => {
  const doc = new PlotDocument("Untitled 1");
  doc.edit((project) => { project.images.push(newProjectImage(project, null, "b.png", source, 0, 0)); });
  assert.equal(doc.setOption((project) => { project.grid.snap = false; }), true);
  assert.equal(doc.setOption((project) => { project.grid.snap = false; }), false);
  assert.ok(doc.dirty);
  doc.undo();
  assert.equal(doc.project.images.length, 0);
  assert.equal(doc.project.grid.snap, false);
  assert.equal(doc.canUndo, false);
  doc.redo();
  assert.equal(doc.project.grid.snap, false);
});

test("saving names the tab after the file, with its extension, and makes the document clean", () => {
  const doc = new PlotDocument("Untitled 1");
  doc.edit((project) => { project.grid.snap = false; });
  doc.markSaved("/Users/lab/plate.pfg");
  assert.equal(doc.name, "plate.pfg");
  assert.equal(doc.dirty, false);
  doc.edit((project) => { project.grid.snap = true; });
  assert.equal(doc.dirty, true);
});

// MARK: recovery

test("a document keeps a draft only while it has unsaved edits, under a key that survives its first save", () => {
  const doc = new PlotDocument("Untitled 1");
  assert.equal(doc.draft(), null);
  doc.edit((project) => { project.images.push(newProjectImage(project, "/lab/cells.png", "cells.png", source, 16, 32)); });
  const draft = doc.draft()!;
  assert.equal(draft.key, doc.draftKey);
  assert.equal(draft.path, null);
  assert.equal(parseProject(draft.text, null).images[0].path, "/lab/cells.png");
  doc.markSaved("/lab/plate.pfg");
  assert.equal(doc.draft(), null);
  doc.edit((project) => { project.grid.snap = false; });
  assert.equal(doc.draft()!.key, draft.key);
  assert.equal(doc.draft()!.path, "/lab/plate.pfg");
});

test("a restored draft reopens with its edits, stays dirty until saved and keeps its key", () => {
  const original = new PlotDocument("Untitled 2");
  original.edit((project) => { project.images.push(newProjectImage(project, "/lab/cells.png", "cells.png", source, 0, 0)); });
  const draft = original.draft()!;
  const restored = new PlotDocument(draft.name, draft.path, parseProject(draft.text, draft.path), draft.key);
  restored.markRestored();
  assert.equal(restored.dirty, true);
  assert.equal(restored.draftKey, draft.key);
  assert.equal(restored.project.images.length, 1);
  restored.markSaved("/lab/restored.pfg");
  assert.equal(restored.dirty, false);
});

test("two documents get different draft keys", () => {
  assert.notEqual(new PlotDocument("Untitled 1").draftKey, new PlotDocument("Untitled 2").draftKey);
});

// MARK: calibration

test("calibrate accepts its documented forms and refuses others", () => {
  const accepts = (arg: string) => commandAccepts(COMMANDS.find((entry) => entry.name === "calibrate")!, arg);
  for (const arg of ["", "200 50 um", "1.5 0.25 mm", "scale 0.25 µm", "line 1 20 um", "aspect 2", "pixels", "follow", "default", "default 200 50 um", "default scale 3 nm", "default aspect 0.5", "default none"]) assert.ok(accepts(arg), arg);
  for (const arg of ["200", "200 50", "scale 0.25", "aspect", "default pixels", "follow 2", "none", "-1 50 um", "line 20 um", "default line 1 20 um"]) assert.ok(!accepts(arg), arg);
  assert.deepEqual(completions("calibrate ", false), ["calibrate scale", "calibrate line", "calibrate aspect", "calibrate pixels", "calibrate follow", "calibrate default"]);
});

test("every inspector field has its command: image move for Placement, name for the document's Name", () => {
  const accepts = (name: string, arg: string) => commandAccepts(COMMANDS.find((entry) => entry.name === name)!, arg);
  for (const arg of ["move 1 0 0", "move 2 -16 480"]) assert.ok(accepts("image", arg), arg);
  // <item> is a number or a name, and x and y are checked when the move runs (itemCommand).
  for (const arg of ["move 1 0", "move", "move 1 0 0 0"]) assert.ok(!accepts("image", arg), arg);
  assert.ok(accepts("name", "Grain sizes"));
  assert.ok(!accepts("name", ""));
});

test("PlotForge words its shared commands, menus and Settings as the shell does (blockConformance)", () => {
  const settings = { appearance: "dark" as const, showInspector: true, inspectorSide: "right" as const, showBottomPanel: true, autosave: "off" as const };
  const settingsPages = shellSettingsPages(PROFILE, {
    general: { settings, update: () => {} },
    terminal: { fontSize: () => 12, setFontSize: () => {}, preferences: createTerminalPreferences() },
    updates: { info: { productName: "PlotForge", legalName: "SK PlotForge", purpose: "plotting and image-analysis workspace", logo: "", version: "0.0.0" } },
  });
  for (const state of STATES) assert.deepEqual(blockConformance({ blocks: BLOCKS, environment: ENVIRONMENT, catalog: CATALOG, menus: plotMenus(state), settingsPages }), [], JSON.stringify(state));
});

test("calibration fields take numbers above 0, with or without their unit", () => {
  assert.equal(parsePositive("0.25", "µm"), 0.25);
  assert.equal(parsePositive("0.25 µm", "µm"), 0.25);
  assert.equal(parsePositive("0.25 um", "µm"), 0.25);
  assert.equal(parsePositive("2e-3 mm", "mm"), 0.002);
  assert.ok(Number.isNaN(parsePositive("0", "µm")));
  assert.equal(parsePositive("0.000001", "µm"), 0.000001);
  assert.ok(Number.isNaN(parsePositive("-1", "µm")));
  assert.ok(Number.isNaN(parsePositive("3 mm", "µm")));
  assert.ok(Number.isNaN(parsePositive("abc", "")));
  assert.equal(parseUnit("um"), "µm");
  assert.equal(parseUnit("in"), "in");
  assert.equal(parseUnit("ft"), null);
});

test("a calibration reads as a known length or a scale, and switching keeps the scale", () => {
  assert.equal(calibrationSummary(null), "Pixels");
  assert.equal(calibrationSummary(knownLength(200, 50, "µm")), "200 px = 50 µm");
  assert.equal(calibrationSummary(directScale(0.25, "µm", 2)), "0.25 µm per pixel, aspect 2");
  assert.deepEqual(startCalibration("scale", knownLength(200, 50, "µm", 2)), directScale(0.25, "µm", 2));
  assert.deepEqual(startCalibration("known", directScale(0.25, "mm")), { ...directScale(0.25, "mm"), mode: "known" });
  assert.deepEqual(startCalibration("known", null), knownLength(1, 1, "µm"));
  assert.equal(pixelSizeText({ x: 0.25, y: 0.25, unit: "µm" }), "0.25 µm");
  assert.equal(pixelSizeText({ x: 0.1, y: 0.2, unit: "mm" }), "0.1 × 0.2 mm");
  for (const tip of ["Lengths and areas of this image are reported in these units; pixels never change.", "The calibration of images that follow the document's default.",
    "Set the default with nothing selected.", "A distance on the original image, in pixels along x, such as a scale bar.", "The real length of that distance.",
    "The real width of one pixel.", "The height of a pixel over its width; 1 for square pixels."]) assert.deepEqual(checkTipWording(tip), [], tip);
});

// MARK: regions

test("roi accepts its documented forms and refuses others", () => {
  const accepts = (arg: string) => commandAccepts(COMMANDS.find((entry) => entry.name === "roi")!, arg);
  for (const arg of ["list", "info 1", "remove 2", "add rectangle 10 10 40 30", "add ellipse 0.5 1 20 10", "add line 0 0 5 5", "add polygon 0 0 10 0 0 10", "add polygon 0 0 10 0 10 10 0 10"]) assert.ok(accepts(arg), arg);
  for (const arg of ["", "add rectangle 1 2 3", "add polygon 0 0 10 0", "add polygon 0 0 10 0 0", "add line 0 0 5", "add freehand 0 0 1 1 2 2", "remove"]) assert.ok(!accepts(arg), arg);
});

test("the tools are Select, five region tools and Crop, each with its own bare key on the Tool tier", () => {
  const keys = [SELECT_KEY, ...ROI_TOOLS.map((tool) => tool.key), CROP_KEY];
  assert.deepEqual(keys, ["V", "R", "E", "P", "F", "L", "C"]);
  assert.equal(new Set(keys).size, keys.length);
  for (const key of keys) assert.equal(shortcutTier(key, true), "tool", key);
  assert.deepEqual(ROI_TOOLS.map((tool) => ROI_LABELS[tool.type]), ["Rectangle", "Ellipse", "Polygon", "Freehand", "Line"]);
});

test("each plot kind has its own bare key on the Tool tier, apart from the canvas tools' and every menu shortcut", () => {
  const keys = Object.values(PLOT_TOOL_KEYS);
  assert.deepEqual(keys, ["S", "N", "M", "B"]);
  for (const key of keys) {
    assert.equal(shortcutTier(key, true), "tool", key);
    assert.ok(![SELECT_KEY, CROP_KEY, ...ROI_TOOLS.map((tool) => tool.key)].includes(key), key);
    for (const state of STATES) assert.ok(!shortcutRegistry(plotMenus(state)).some((entry) => entry.key.toUpperCase() === key), key);
  }
  const press = (key: string, shiftKey = false) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey });
  assert.equal(plotKindForKey(press("m")), "line-symbol");
  assert.equal(plotKindForKey(press("M", true)), null);
});

test("no menu shortcut takes the key of one of the shell's canvas tools (toolKeyProblems)", () => {
  for (const state of STATES) assert.deepEqual(toolKeyProblems(shortcutRegistry(plotMenus(state)), PLOT_CANVAS_TOOLS), [], JSON.stringify(state));
});

test("the Document menu's Tool submenu checks the current tool, and Remove region needs a selected region", () => {
  const documentMenu = (state: MenuState) => plotMenus(state).find((menu) => menu.label === "Document")!.submenu!;
  const tools = documentMenu({ ...STATES[0], tool: "ellipse" }).find((node) => node.label === "Tool")!.submenu!;
  // The toolbar's order: the pointer, Crop and the region tools, then a plot tool per kind.
  assert.deepEqual(tools.filter((node) => !node.separator).map((node) => node.label), ["Select", "Crop", "Rectangle", "Ellipse", "Polygon", "Freehand", "Line", "Scatter plot", "Line plot", "Line + symbol plot", "Column plot"]);
  const plotTools = documentMenu({ ...STATES[0], tool: "plot-column" }).find((node) => node.label === "Tool")!.submenu!;
  assert.deepEqual(plotTools.filter((node) => node.checked).map((node) => node.label), ["Column plot"]);
  assert.deepEqual(tools.filter((node) => node.checked).map((node) => node.label), ["Ellipse"]);
  assert.equal(documentMenu({ ...STATES[0], hasRoi: false }).find((node) => node.id === "document.roi.remove")!.enabled, false);
  for (const tip of ["Remove the selected region; the image is unchanged.", "The exact area of the outline.",
    "Pixels whose centres lie inside the region; measurements count these.", "The left edge, in pixels of the result of the steps."]) assert.deepEqual(checkTipWording(tip), [], tip);
});

// MARK: thresholds

test("PlotForge's own commands take their arguments from their syntax (syntaxPattern) and refuse values by name", () => {
  const command = (name: string) => COMMANDS.find((entry) => entry.name === name)!;
  const own = COMMANDS.filter((entry) => !SHARED.some((shared) => shared.spec.name === entry.name) && !(entry.name in ITEM_VERBS));
  assert.ok(own.length > 20);
  for (const entry of own) assert.equal(entry.args.source, syntaxPattern(entry.subcommands?.map((form) => form.syntax) ?? [entry.syntax]).source, entry.name);
  for (const [name, arg] of [["threshold", "colour rgb"], ["threshold", "colour lab 0 100 -20 20 -5.5 40"], ["display", "lut blackwhite"], ["snap", "on"], ["measure", "decimals auto"], ["measure", "decimals 3"], ["name", "Grain sizes"], ["name", "\"Grain sizes\""], ["results", "list"]]) assert.ok(commandAccepts(command(name), arg), `${name} ${arg}`);
  for (const [name, arg] of [["display", "lut purple"], ["snap", "maybe"], ["measure", "decimals 12"], ["histogram", "many"], ["peak", "1 x"], ["density", "add -1 2"], ["threshold", "colour cmyk"]]) assert.ok(!commandAccepts(command(name), arg), `${name} ${arg}`);
  assert.equal(valueProblem(command("pixel"), "1.5 0"), "X takes a whole number.");
  assert.equal(valueProblem(command("display"), "lut purple"), "The lookup table takes grays, inverted, blackwhite, fire, ice or spectrum.");
});

test("fit lists, adds and changes fits with its documented forms", () => {
  const accepts = (arg: string) => commandAccepts(COMMANDS.find((entry) => entry.name === "fit")!, arg);
  for (const arg of ["list", "info 1", "models", "add 1 gaussian", "add 2 gaussians 3", "start 1 a 2", "fix 1 y0", "free 1 y0", "weights 1 counts", "range 1 0 10", "residuals 1", "equation 1 on", "remove 1"]) assert.ok(accepts(arg), arg);
  for (const arg of ["add", "weights 1 heavy", "range 1", "equation 1 maybe"]) assert.ok(!accepts(arg), arg);
  // Fits are set in each series' Fitting group in the inspector (2026-11-19); the Fits tab is gone. A custom formula is the series' own.
  assert.ok(!(PANES as readonly string[]).includes("fits"));
  assert.ok(commandAccepts(COMMANDS.find((entry) => entry.name === "fit")!, "formula 1 a * x"));
});

test("threshold accepts its documented forms and refuses others", () => {
  const accepts = (arg: string) => commandAccepts(COMMANDS.find((entry) => entry.name === "threshold")!, arg);
  for (const arg of ["", "on", "off", "manual 10 200", "otsu", "otsu dark", "mean light", "li", "triangle", "yen dark", "maxentropy"]) assert.ok(accepts(arg), arg);
  for (const arg of ["manual 10", "manual -1 5", "otsu bright", "kittler", "on otsu"]) assert.ok(!accepts(arg), arg);
});

test("the Threshold submenu checks the selected image's choice and needs a grey image; View has Show mask", () => {
  const menus = (state: MenuState) => plotMenus(state);
  const submenu = (state: MenuState) => menus(state).find((menu) => menu.label === "Document")!.submenu!.find((node) => node.label === "Threshold")!;
  assert.deepEqual(submenu({ ...STATES[0], threshold: "li" }).submenu!.filter((node) => node.checked).map((node) => node.label), ["Li"]);
  assert.deepEqual(submenu(STATES[0]).submenu!.map((node) => node.label ?? "—"), ["Add phase", "Remove phase", "—", "Default method", "—", "None", "Manual", "Otsu", "Mean", "Li", "IsoData", "Percentile", "Triangle", "Intermodes", "Minimum", "Moments", "MaxEntropy", "Yen", "IJ IsoData", "Huang", "MinError", "RenyiEntropy", "Shanbhag", "—", "Show as"]);
  // A colour image's choices are None and Colour, then Pick colour.
  assert.deepEqual(submenu({ ...STATES[0], colourThreshold: true }).submenu!.slice(5, 9).map((node) => node.label ?? "—"), ["None", "Colour", "—", "Pick colour"]);
  assert.equal(submenu({ ...STATES[0], phases: 2, maskDisplay: "bw" }).submenu!.at(-1)!.submenu!.find((node) => node.checked)!.label, "B&W");
  assert.equal(submenu({ ...STATES[0], threshold: null }).enabled, false);
  const view = menus({ ...STATES[0], showMask: false }).find((menu) => menu.label === "View")!.submenu!;
  assert.equal(view.find((node) => node.id === "view.mask")!.checked, false);
});

test("a threshold reads in a few words, and a new choice starts from the current one", () => {
  assert.equal(thresholdSummary(null), "None");
  assert.equal(thresholdSummary({ mode: "manual", low: 40, high: 200 }), "Manual 40 to 200");
  assert.equal(thresholdSummary({ mode: "otsu", objects: "dark" }), "Otsu, dark objects");
  assert.equal(startThreshold("none", null, null, 255), null);
  assert.deepEqual(startThreshold("li", { mode: "otsu", objects: "dark" }, null, 255), { mode: "li", objects: "dark" });
  assert.deepEqual(startThreshold("mean", null, null, 255), { mode: "mean", objects: "light" });
  assert.deepEqual(startThreshold("manual", null, null, 65535), { mode: "manual", low: 32768, high: 65535 });
  // A manual range starts from the range the automatic method found.
  const found = { key: "", problem: null, overlay: null, result: { low: 114, high: 255, t: 113, mask: new Uint8Array(0), count: 0 } };
  assert.deepEqual(startThreshold("manual", { mode: "otsu", objects: "light" }, found, 255), { mode: "manual", low: 114, high: 255 });
  for (const tip of ["Thresholds act on grey values; convert the image to grey with a step first.", "Add a Convert to grey step at the end of the step list.",
    "Keep the pixels whose grey values lie in a range, set by hand or found by a method.", "Otsu: the split with the largest variance between background and objects.",
    "Mean: the split at the mean grey value of the image.", "Li: the split of minimum cross-entropy, found by iteration.",
    "The lowest grey value kept, included.", "The highest grey value kept, included.",
    "Light objects keep the values above the split; dark objects keep it and the values below.",
    "Pixels of the whole image in the range; region measurements come with the results table."]) assert.deepEqual(checkTipWording(tip), [], tip);
});

// MARK: measurements and results

test("measure and results accept their forms; Measure is on Shift+Cmd+M and Export results… follows Export image…", () => {
  const accepts = (name: string, arg: string) => commandAccepts(COMMANDS.find((entry) => entry.name === name)!, arg);
  assert.ok(accepts("measure", "") && !accepts("measure", "all"));
  for (const arg of ["", "list", "clear", "export", "remove 2"]) assert.ok(accepts("results", arg), arg);
  for (const arg of ["remove", "export csv", "sort"]) assert.ok(!accepts("results", arg), arg);
  assert.equal(MEASURE_KEY, "CmdOrCtrl+Shift+M");
  const file = plotMenus(STATES[0]).find((menu) => menu.label === "File")!.submenu!.map((node) => node.id);
  assert.equal(file.indexOf("file.exportResults"), file.indexOf("file.export") + 1);
  const documentMenu = plotMenus({ ...STATES[0], canMeasure: false, hasResults: false }).find((menu) => menu.label === "Document")!.submenu!;
  assert.equal(documentMenu.find((node) => node.id === "document.measure")!.enabled, false);
  assert.equal(documentMenu.find((node) => node.id === "document.results.clear")!.enabled, false);
});

const row = (id: string, imageName: string, area: number | null, measured: ResultRow["measured"] = ["area"]): ResultRow => ({
  id, imageId: "image-1", imageName, file: "a.png", crc32: "0", steps: [], threshold: null, roi: null, calibration: null, measured, unit: "px",
  values: { regionPixels: 1, maskedPixels: 1, area, areaFraction: 50, mean: 10, min: 1, max: 20, centroidX: 1, centroidY: 1, perimeter: 4, length: null },
});

test("the results pane shows only measured columns, sorts by value with blanks last, and keeps four digits", () => {
  const rows = [row("a", "plate 10", 30), row("b", "plate 9", 2.5), row("c", "plate 2", null)];
  assert.deepEqual(visibleColumns(rows).map((column) => column.key), ["image", "region", "area", "unit"]);
  assert.deepEqual(visibleColumns([row("d", "x", 1, ["area", "perimeter"])]).map((column) => column.key), ["image", "region", "area", "perimeter", "unit"]);
  assert.deepEqual(sortRows(rows, "area", false).map((item) => item.id), ["b", "a", "c"]);
  assert.deepEqual(sortRows(rows, "area", true).map((item) => item.id), ["a", "b", "c"]);
  // Names sort with their numbers: plate 2, plate 9, plate 10.
  assert.deepEqual(sortRows(rows, "image", false).map((item) => item.imageName), ["plate 2", "plate 9", "plate 10"]);
  assert.equal(cellText(1 / 3), "0.3333");
  assert.equal(cellText(null), "");
  for (const tip of ["Masked pixels of the region over all its pixels, times 100.", "The length of the mask's pixel edges; a diagonal counts as a staircase.",
    "Write the results table as a CSV file.", "Remove every row of the results table.", "Sort by area."]) assert.deepEqual(checkTipWording(tip), [], tip);
});

// MARK: export options (I7)

test("export takes a format for one export; the Export section's tooltips follow the wording rule", () => {
  const accepts = (arg: string) => commandAccepts(COMMANDS.find((entry) => entry.name === "export")!, arg);
  for (const arg of ["", "png", "jpeg", "jpeg 80"]) assert.ok(accepts(arg), arg);
  for (const arg of ["tiff", "png 80", "jpeg high"]) assert.ok(!accepts(arg), arg);
  for (const tip of ["PNG keeps the image's own values and depth; JPEG is 8-bit RGB and lossy.", "The quality of JPEG images and plots, from 1 to 100; 90 keeps fine detail.",
    "The corner the bar is drawn into, or None; a picture with a bar is 8-bit RGB.",
    "What exporting into a folder does when a file is already there: ask, use a new name, or replace it. Originals stay.",
    "SVG stays a sharp drawing in Word, PowerPoint or Illustrator; PNG and JPEG are pictures at the Resolution below.",
    "Draw the mask and region outlines into the picture, which is then 8-bit RGB.", "What an export does when its file is already there; originals are never replaced.",
    "The result of the enabled steps; the original is never written."]) assert.deepEqual(checkTipWording(tip), [], tip);
});

// MARK: settings layers (I8)

test("the settings rows' tooltips follow the wording rule, override ones included", () => {
  for (const tip of ["The method a new Convert to grey step starts with.", "The method a threshold starts with when it is turned on.",
    "The colour the threshold mask is drawn in; display only.", "The colour region outlines are drawn in; display only.",
    "The measurements Measure takes, chosen in the Measurements section.", "Measured by default in every image that does not choose its own set.",
    "Set for this image; the app setting is Luminance.", "Set for this export; the app setting is PNG.", "Clear all 3 overrides of this section.",
    "Clear the override of this section."]) assert.deepEqual(checkTipWording(tip), [], tip);
});

test("filter kernels read as rows of numbers, an odd square, and print back the same way", () => {
  assert.deepEqual(parseKernel("0 1 0\n1 -4 1\n0 1 0"), [0, 1, 0, 1, -4, 1, 0, 1, 0]);
  assert.deepEqual(parseKernel(" 1, 2 ,3\n4 5 6\n\n7 8 9 "), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(parseKernel("5"), [5]);
  for (const bad of ["1 2\n3 4", "1 2 3\n4 5\n6 7 8", "a b c\n1 2 3\n4 5 6", ""]) assert.equal(parseKernel(bad), null, bad);
  assert.equal(kernelText([0, 1, 0, 1, -4, 1, 0, 1, 0]), "0 1 0\n1 -4 1\n0 1 0");
  assert.equal(parseNumber("1.5 px", "px"), 1.5);
  assert.ok(Number.isNaN(parseNumber("1.5 mm", "px")));
  assert.equal(stepSummary({ id: "s", type: "filter", enabled: true, filter: "median", radius: 2, weight: 0.6, kernel: [], normalize: true }), "radius 2 px");
  assert.equal(stepSummary({ id: "s", type: "filter", enabled: true, filter: "unsharp", radius: 1, weight: 0.6, kernel: [], normalize: true }), "σ 1 px, weight 0.6");
});

test("the document's objects are listed and chosen with the shell's workspace verbs, and copied, pasted and arranged with PlotForge's", () => {
  const accepts = (name: string, arg: string) => commandAccepts(COMMANDS.find((entry) => entry.name === name)!, arg);
  for (const arg of ["", "plots", "images", "data", "fits"]) assert.ok(accepts("list", arg), `list ${arg}`);
  for (const [name, arg] of [["info", ""], ["info", "plot 1"], ["select", "plot 2"], ["select", "Logo"], ["remove", "image 1"], ["plot", "series"], ["copy", ""], ["copy", "plot 1"], ["cut", "image 3"], ["duplicate", ""], ["delete", "image 2, plot 1"], ["paste", ""], ["paste", "into"], ["arrange", "front"], ["arrange", "back"]]) assert.ok(accepts(name, arg), `${name} ${arg}`);
  for (const [name, arg] of [["arrange", "up"], ["paste", "over"]]) assert.ok(!accepts(name, arg), `${name} ${arg}`);
  for (const name of ["list", "info", "select", "rename", "move", "size", "remove"]) assert.equal(SHARED.find((entry) => entry.spec.name === name)?.environment, "workspace", name);
});

test("Edit has Copy as image, Arrange and Deselect all, on keys of the app's own tier", () => {
  const edit = plotMenus(STATES[0]).find((menu) => menu.label === "Edit")!.submenu!;
  const ids = edit.flatMap((node) => [node.id, ...(node.submenu ?? []).map((child) => child.id)]);
  for (const id of ["edit.copyImage", "edit.deselect", "arrange.bringToFront", "arrange.bringForward", "arrange.sendBackward", "arrange.sendToBack"]) assert.ok(ids.includes(id), id);
  const keys = shortcutRegistry(plotMenus(STATES[0]));
  assert.equal(keys.find((entry) => entry.id === "edit.copyImage")?.key, "CmdOrCtrl+Shift+C");
  assert.equal(keys.find((entry) => entry.id === "edit.deselect")?.key, "CmdOrCtrl+Shift+A");
  assert.equal(keys.find((entry) => entry.id === "arrange.bringForward")?.key, "CmdOrCtrl+]");
});
