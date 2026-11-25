// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The menus of PlotForge, one definition for the native menu bar, the drawn menu bar and Keyboard shortcuts…, and the
// shortcut registry that the tests check against the shell's tiers. Every standard item comes from the shell
// (`standardItem`, `zoomItems`), with its label and key; PlotForge writes only its own items.
import { helpMenu } from "forge-shell/app/about";
import type { MenuNode } from "forge-shell/app/menus";
import type { Appearance } from "forge-shell/app/shell-preferences";
import type { AutosaveChoice } from "forge-shell/app/saving";
import { blockMenuItems } from "forge-shell/app/block-menus";
import type { ShortcutEntry } from "forge-shell/app/shortcuts";
import { standardItem, zoomItems } from "forge-shell/app/standard-items";
import config from "../../forge.config.json";
import { STEP_GROUPS, stepGroupItems } from "./step-wording";
import { CROP_LABEL, ROI_LABELS, ROI_TOOLS } from "./roi-view";
import { THRESHOLD_LABELS, type ThresholdChoice } from "./threshold-view";
import { MEASURE_KEY } from "./results-view";
import { PLOT_KIND_NAMES, PLOT_KINDS, THRESHOLD_METHODS } from "../engine";
import { BLOCKS } from "./commands";

/** The state the menus depend on: the active document, the preferences and the platform. */
export interface MenuState {
  hasDocument: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  /** Images are selected and shown, so their results can be exported; exactly one, so it can be copied. */
  canExport: boolean;
  /** One plot or one shown image is selected, for Copy as image. */
  canCopyImage: boolean;
  /** Exactly one image is selected and it can be shown, so steps can be added to it. */
  canAddStep: boolean;
  /** A step has been added, so Repeat last step can copy it. */
  canRepeat: boolean;
  /** The selected image's current step: whether it is enabled, and whether it can move up or down. Null without one. */
  step: { enabled: boolean; first: boolean; last: boolean } | null;
  snap: boolean;
  /** The pointer's tool, and whether a region is selected. */
  tool: string;
  hasRoi: boolean;
  /** The selected image's threshold choice, or null when no grey image is selected; and whether masks are drawn. */
  threshold: ThresholdChoice | null;
  /** The selected image is colour, so its threshold is a colour one. */
  colourThreshold: boolean;
  /** The selected image's phase count and how its masks are shown. */
  phases: number;
  /** Whether the selected image has a Threshold step: it has one at most, and mask steps need it. */
  hasThresholdStep: boolean;
  maskDisplay: "colours" | "bw" | "overUnder";
  showMask: boolean;
  /** View › Show calibration bar; and whether a closed region is selected, to paste into. */
  showScaleBar: boolean;
  canPasteInto: boolean;
  /** One image is selected and shown, so it can be measured; and whether the results table has rows. */
  canMeasure: boolean;
  hasResults: boolean;
  /** A worksheet is selected (or is the only one) with a Y column after an X column, so it can be plotted. */
  canPlot?: boolean;
  showInspector: boolean;
  showBottomPanel: boolean;
  appearance: Appearance;
  autosave: AutosaveChoice;
  recent: readonly string[];
  /** macOS desktop: About sits in the native application menu, not in Help. */
  nativeAppMenu: boolean;
  desktop: boolean;
  /** The platform the keys are written for; the page's own by default. */
  mac?: boolean;
}

// MARK: given values

/** Import… (images and data files) and Export… are the shell's standard actions; their keys come from the shell. */
export const IMPORT_KEY = standardItem("file.import").key!;
export const EXPORT_KEY = standardItem("file.export").key!;
/** Copy the selected plot or image as a picture, for another application. */
export const COPY_IMAGE_KEY = "CmdOrCtrl+Shift+C";
export const DESELECT_KEY = "CmdOrCtrl+Shift+A";

// MARK: menus

/** The Document menu: steps for the selected image. Added steps start with the defaults the inspector then edits. */
function documentMenu(state: MenuState): MenuNode {
  const { step } = state;
  return { label: "Document", submenu: [
    { id: "document.measure", label: "Measure", key: MEASURE_KEY, enabled: state.canMeasure },
    { id: "document.results.clear", label: "Clear results", enabled: state.hasResults },
    { separator: true },
    { label: "New plot", enabled: !!state.canPlot, submenu: PLOT_KINDS.map((kind) => ({ id: `document.plot.${kind}`, label: PLOT_KIND_NAMES[kind], enabled: !!state.canPlot })) },
    { separator: true },
    { label: "Add step", enabled: state.canAddStep, submenu: STEP_GROUPS.map((group) => ({
      label: group, enabled: state.canAddStep,
      submenu: stepGroupItems(group).map((item) => ({
        id: `document.step.add.${item.id}`, label: item.label,
        enabled: state.canAddStep && (item.type === "threshold" ? !state.hasThresholdStep : item.type === "mask" ? state.hasThresholdStep : true),
      })),
    })) },
    { id: "document.step.repeat", label: "Repeat last step", enabled: state.canAddStep && state.canRepeat },
    { separator: true },
    { id: "document.step.enabled", label: "Step enabled", checked: !!step?.enabled, enabled: !!step },
    { id: "document.step.up", label: "Move step up", enabled: !!step && !step.first },
    { id: "document.step.down", label: "Move step down", enabled: !!step && !step.last },
    { separator: true },
    { id: "document.step.remove", label: "Remove step", enabled: !!step },
    { separator: true },
    // The tools' bare keys work on the work surface (the shell's Tool tier); a menu shows no bare key.
    { label: "Tool", enabled: state.hasDocument, submenu: [
      // In the toolbar's order: the pointer, the canvas tools, then a tool per plot kind.
      { id: "document.tool.select", label: "Select", checked: state.tool === "select", enabled: state.hasDocument },
      { separator: true },
      { id: "document.tool.crop", label: CROP_LABEL, checked: state.tool === "crop", enabled: state.hasDocument },
      ...ROI_TOOLS.map((tool) => ({ id: `document.tool.${tool.type}`, label: ROI_LABELS[tool.type], checked: state.tool === tool.type, enabled: state.hasDocument })),
      { separator: true },
      ...PLOT_KINDS.map((kind) => ({ id: `document.tool.plot-${kind}`, label: `${PLOT_KIND_NAMES[kind]} plot`, checked: state.tool === `plot-${kind}`, enabled: state.hasDocument })),
    ] },
    { id: "document.roi.crop", label: "Crop to region", enabled: state.hasRoi },
    { id: "document.roi.hull", label: "Convex hull", enabled: state.hasRoi },
    { id: "document.roi.fill", label: "Fill region", enabled: state.hasRoi },
    { id: "document.roi.clear", label: "Clear outside region", enabled: state.hasRoi },
    { id: "document.roi.remove", label: "Remove region", enabled: state.hasRoi },
    { id: "document.label.add", label: "Add label", enabled: state.canMeasure },
    { separator: true },
    { label: "Threshold", enabled: state.threshold !== null, submenu: [
      { id: "document.phase.add", label: "Add phase", enabled: state.threshold !== null },
      { id: "document.phase.remove", label: "Remove phase", enabled: state.phases > 0 },
      { separator: true },
      { id: "document.threshold.default", label: "Default method", enabled: state.threshold !== null },
      { separator: true },
      ...(state.colourThreshold ? (["none", "colour"] as const) : (["none", "manual", ...THRESHOLD_METHODS] as const)).map((choice) => ({
        id: `document.threshold.${choice}`, label: THRESHOLD_LABELS[choice], checked: state.threshold === choice, enabled: state.threshold !== null,
      })),
      ...(state.colourThreshold ? [{ separator: true }, { id: "document.threshold.pick", label: "Pick colour", enabled: state.threshold !== null }] : []),
      { separator: true },
      { label: "Show as", enabled: state.phases > 0, submenu: (["colours", "bw", "overUnder"] as const).map((mode) => ({
        id: `document.show.${mode}`, label: mode === "colours" ? "Phase colours" : mode === "bw" ? "B&W" : "Over/Under", checked: state.maskDisplay === mode, enabled: state.phases > 0,
      })) },
    ] },
  ] };
}

export function plotMenus(state: MenuState): MenuNode[] {
  const { hasDocument, mac } = state;
  const profile = { noun: config.document.noun, product: config.identity.name };
  const item = (action: Parameters<typeof standardItem>[0], extra: Partial<MenuNode> = {}) => standardItem(action, profile, extra, mac);
  return [
    { label: "File", submenu: [
      // The documents block brings New, Open, Open recent, Save, Save as, Autosave and Close, in the shell's order
      // and with its keys; PlotForge's own items follow.
      ...blockMenuItems(BLOCKS, "File", { noun: config.document.noun, hasDocument, recent: state.recent, autosave: state.autosave }),
      { separator: true },
      item("file.import", { enabled: hasDocument }),
      item("file.export", { enabled: state.canExport }),
      { id: "file.exportResults", label: "Export results…", enabled: state.hasResults },
      { id: "file.exportXY", label: "Export XY coordinates…", enabled: state.canMeasure },
      // On macOS the native menu moves Settings… to the app menu, after About.
      { separator: true },
      item("app.settings"),
    ] },
    { label: "Edit", submenu: [
      item("edit.undo", { enabled: state.canUndo }),
      item("edit.redo", { enabled: state.canRedo }),
      { separator: true },
      // Copy is PlotForge's own (no role): a text field's selection, or else the selected image as it is shown.
      // Cut, Copy and Paste take the selected objects (images, worksheets, plots), text in a field, or chosen cells.
      item("edit.cut"), item("edit.copy", { role: undefined }), item("edit.paste"),
      { id: "edit.copyImage", label: "Copy as image", key: COPY_IMAGE_KEY, enabled: state.canCopyImage },
      { id: "edit.pasteInto", label: "Paste into selection", enabled: state.canPasteInto },
      item("edit.duplicate", { enabled: state.hasSelection }),
      item("edit.delete", { enabled: state.hasSelection }),
      { label: "Arrange", submenu: (["arrange.bringToFront", "arrange.bringForward", "arrange.sendBackward", "arrange.sendToBack"] as const).map((id) => item(id, { enabled: state.hasSelection })) },
      { separator: true },
      // Select all is PlotForge's own on the work surface (it selects every object), so the role is left out.
      item("edit.selectAll", { role: undefined }),
      { id: "edit.deselect", label: "Deselect all", key: DESELECT_KEY, enabled: state.hasSelection },
    ] },
    { label: "View", submenu: [
      ...zoomItems(hasDocument),
      { separator: true },
      item("view.inspector", { checked: state.showInspector }),
      item("view.bottomPanel", { checked: state.showBottomPanel }),
      { separator: true },
      { id: "view.snap", label: "Snap to grid", checked: hasDocument && state.snap, enabled: hasDocument },
      { id: "view.mask", label: "Show mask", checked: state.showMask, enabled: hasDocument },
      { id: "view.scaleBar", label: "Show calibration bar", checked: state.showScaleBar, enabled: hasDocument },
      { separator: true },
      { label: "Appearance", submenu: (["system", "dark", "light"] as const).map((value) => ({ id: `view.theme.${value}`, label: { system: "System", dark: "Dark", light: "Light" }[value], checked: state.appearance === value })) },
      ...(state.desktop ? [{ separator: true }, item("view.fullScreen"), { role: "toggleDevTools", label: "Developer tools" }] : []),
    ] },
    documentMenu(state),
    helpMenu(config.identity.name, state.nativeAppMenu),
  ];
}

// MARK: shortcut registry

/** Every key the menus bind, enabled or not, role items included, as entries for the shell's `checkShortcuts`. */
export function shortcutRegistry(menus: readonly MenuNode[]): ShortcutEntry[] {
  const entries: ShortcutEntry[] = [];
  const walk = (nodes: readonly MenuNode[]) => {
    for (const node of nodes) {
      const id = node.id ?? (node.role ? `role:${node.role}` : undefined);
      if (node.key && id) entries.push({ id, key: node.key });
      if (node.submenu) walk(node.submenu);
    }
  };
  walk(menus);
  return entries;
}
