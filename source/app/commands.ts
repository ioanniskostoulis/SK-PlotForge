// Licensed under the GNU General Public License v2 or later. See LICENSE.
// The Terminal command catalogue of PlotForge: the shell's shared commands for the standard actions PlotForge has,
// then PlotForge's own commands. The shell renders help and usage errors from it; main.ts runs the commands through
// the same actions as the menus.
import type { HelpCatalog } from "forge-shell/app/command-help";
import type { CommandSpec } from "forge-shell/app/command-spec";
import { createHelpCatalog, sharedCommands, type StandardAction } from "forge-shell/app/shared-commands";
import { workspaceCommands } from "forge-shell/app/workspace-commands";
import { ITEM_SUBCOMMANDS, itemCommand, type ItemCommand, type ItemSubcommand, type MaybePromise } from "forge-shell/app/item-command";
import { OPEN_QUOTE_REPLY, parseArgs, syntaxPattern } from "forge-shell/app/arguments";
import { orList, takesReply } from "forge-shell/app/replies";
import type { ConsoleListItem, ConsoleResult } from "forge-shell/app/terminal";
import { profileBlocks, type ForgeBlock } from "forge-shell/app/blocks";
import type { ForgeEnvironment } from "forge-shell/app/profile";
import { THRESHOLD_METHODS } from "../engine/threshold";
import config from "../../forge.config.json";

/** PlotForge is a workspace: `list`, `info`, `select`… run over every kind of item a document holds. */
export const ENVIRONMENT = config.environment as ForgeEnvironment;
/** The shared mechanisms PlotForge declares in forge.config.json: documents, updates and export. */
export const BLOCKS = profileBlocks({ ...config, environment: ENVIRONMENT, blocks: config.blocks as ForgeBlock[] });
/** The profile with its checked blocks, as the shell's functions take it. */
export const PROFILE = { ...config, environment: ENVIRONMENT, blocks: BLOCKS };

const noun = config.document.noun;
/** The GitHub repository whose releases Settings › Updates reads (`identity.repository`); without it there is no Updates page. */
export const REPOSITORY: string | undefined = (config.identity as { repository?: string }).repository;

/** The standard actions PlotForge's menus have; each brings its shared Terminal command. */
export const ACTIONS: StandardAction[] = [
  "file.new", "file.open", "file.save", "file.saveAs", "file.close",
  "edit.undo", "edit.redo",
  "view.zoomIn", "view.zoomOut", "view.fit", "view.actualSize",
  "about", "about.whatsNew", "about.shortcuts", "about.licenses", "app.settings",
];
/** The bottom panes, for `panel <pane>`. */
export const PANES = ["terminal", "results", "charts", "messages"] as const;


/**
 * What main.ts gives a list-and-edit verb (`bindItems`): the document's items, the shared operations the verb has, and
 * the verb's own subcommands, run with the words after the verb. An operation that cannot be done throws its reason.
 */
export interface ItemBinding<T = any> {
  /** The sentence that stops every form, such as `Select one image first.`; null when the verb can run. */
  blocked?(): string | null;
  items(): readonly T[];
  name(item: T): string;
  detail?(item: T): string;
  selected?(): T | null;
  info?(item: T): (string | ConsoleListItem)[];
  select?(item: T): void;
  rename?(item: T, name: string): void;
  move?(item: T, x: number, y: number): void;
  size?(item: T, width: number, height: number): void;
  remove?(item: T): string | void;
  run(words: string[]): ConsoleResult;
}

const BINDINGS = new Map<string, ItemBinding>();
/** Bind a list-and-edit verb to the document's items and PlotForge's handler. */
export const bindItems = <T>(noun: string, binding: ItemBinding<T>): void => { BINDINGS.set(noun, binding); };

type SharedOperation = Exclude<ItemSubcommand, "list">;

/**
 * A list-and-edit verb made by the shell's itemCommand: list and the shared operations it names come with the shell's
 * syntax, item references and replies; `extra` are PlotForge's own forms, run by the bound handler.
 */
function listVerb(noun: string, description: string, shared: SharedOperation[], extra: [syntax: string, description: string][], more: { plural?: string; example?: string } = {}): ItemCommand {
  const bound = (): ItemBinding => { const binding = BINDINGS.get(noun); if (!binding) throw new Error(`${noun} is not bound.`); return binding; };
  const operations = Object.fromEntries(shared.map((name) => [name, (...args: unknown[]) => (bound()[name] as (...values: unknown[]) => unknown)(...args)]));
  return itemCommand<unknown>({
    noun, description, ...more, ...operations,
    items: () => BINDINGS.get(noun)?.items() ?? [], name: (item) => bound().name(item), detail: (item) => bound().detail?.(item) ?? "", selected: () => bound().selected?.() ?? null,
    extra: extra.map(([syntax, about]) => ({ syntax, description: about, run: (words: string[]) => bound().run(words) })),
  });
}

const AXES = (stem: string) => ["x", "y", "x2", "y2"].map((axis) => `${axis}${stem}`).join("|");

/** PlotForge's list-and-edit verbs, by noun. */
export const ITEM_VERBS: Record<string, ItemCommand> = {
  data: listVerb("data", "List data files, set how they are read and name their cells", ["info", "select", "move", "size", "remove"], [
    ["data columns [<item>]", "List the columns by letter with their statistics"],
    ["data names", "List the named cells of the selected worksheet"],
    ["data name <cells> [name]", "Name cells of one column, such as B2:B40, for the legend and axis titles"],
    ["data header off", "Show an older document's file as it is, with no header row"],
    ["data delimiter auto|comma|tab|semicolon|bar", "Split text on a delimiter, or find it"],
    ["data decimal auto|point|comma", "Read numbers with a decimal mark, or find it"],
    ["data skip <rows>", "Leave out rows at the top of the file"],
    ["data sheet <name>", "Read another sheet of an Excel workbook"],
    ["data range <cells>", "Read a range of the sheet, such as B2:F40, or all"],
  ], { plural: "data files", example: "data name B2:B40 Time" }),
  plot: listVerb("plot", "Plot ranges of cells as line or scatter plots, and set their axes", ["info", "select", "move", "size", "remove"], [
    ["plot new scatter|line|line-symbol|column", "Plot the chosen cells; with more than one range, the first is X"],
    ["plot template list", "List the saved plot templates"],
    ["plot template save [name]", "Save the selected plot's look as a template, under its name or another"],
    ["plot template apply <name>", "Give the selected plot a template's look, keeping its cells"],
    ["plot template remove <name>", "Remove a saved template"],
    ["plot template default <name>", "Set the template new plots take, or none for the default look"],
    ["plot batch", "Make the selected plot of every other worksheet, at the same cells"],
    ["plot part <part>...", "Choose a series or a point of the selected plot, or the plot itself"],
    ["plot title <text>", "Set the title above the plot, or none"],
    ["plot legend on|off", "Show or hide the legend"],
    ["plot legend place auto|top-left|top-right|bottom-left|bottom-right", "Place the legend; auto takes the top corner that covers less data"],
    ["plot legend background white|none", "Back the legend with white, so it reads over the data, or none"],
    [`plot ${AXES("title")} <text>`, "Set an axis title, auto or none: x, y, y2 (right) or x2 (top)"],
    [`plot ${AXES("range")} <min> [max]`, "Set an axis' ends, or auto"],
    [`plot ${AXES("step")} <step>`, "Set the step between an axis' major ticks, or auto"],
    [`plot ${AXES("minor")} <step>`, "Set the distance between minor ticks, a part of the major step, or auto or none"],
    [`plot ${AXES("scale")} linear|log`, "Make an axis linear or log"],
    [`plot ${AXES("format")} auto|number|percent|date`, "Show an axis' labels as numbers, percentages or dates"],
    [`plot ${AXES("numbers")} <notation> [decimals]`, "Write an axis' numbers: auto, fixed, scientific, engineering or si (SI prefix), and decimals"],
    [`plot ${AXES("angle")} 0|45|90`, "Turn an axis' tick labels counter-clockwise"],
    ["plot series", "List every plot's series, with its kind and fits"],
    ["plot series <n> <property> <value>", "Set series n's axis, kind, colour, symbol, line, connect or name"],
    ["plot series <n> <range> <cells>", "Set series n's x, y, error or labels cells, or none"],
    ["plot series <n> fit <kind> [size]", "Smooth or fit series n, or none"],
    ["plot series <n> callout <text> [row]", "Write values by series n's points, or by the point at a worksheet row"],
    ["plot swap x|y", "Swap the left and right Y axes, or the bottom and top X axes"],
  ], { example: "plot yrange 10 80" }),
  image: listVerb("image", "List images, show one image's properties, rename, move or remove one", ["info", "select", "rename", "move", "remove"], [
    ["image turn <degrees>", "Turn the selected image on the work surface, clockwise; its pixels and regions are unchanged"],
  ], { example: "image info 1" }),
  step: listVerb("step", "List, add, change, rearrange or remove the selected image's steps", ["remove"], [
    ["step add <type> [<value>...]", "Add a step: a grey step before the Threshold step, a mask step at the end"],
    ["step repeat", "Add a copy of the last added step, as it is now, to the selected image"],
    ["step set <item> <parameter> <value>", "Change one parameter of a step"],
    ["step on <item>", "Enable a step"],
    ["step off <item>", "Disable a step, to see the result without it"],
    ["step move <item> <position>", "Move a step to another place in the list"],
  ], { example: "step add grey" }),
  roi: listVerb("roi", "List, add, measure or remove the selected image's regions", ["info", "remove"], [
    ["roi add rectangle|ellipse <x> <y> <width> <height>", "Add a rectangle, or the ellipse inscribed in that box, in pixels of the result"],
    ["roi add polygon <x> <y> <x> <y> <x> <y> [<x> <y>...]", "Add a polygon of three or more points"],
    ["roi add line <x> <y> <x> <y>", "Add a line between two points"],
    ["roi fill <item> [value]", "Fill a region with a value, 0 (black) by default, as a step"],
    ["roi clear <item> [value]", "Set everything outside a region to a value, white by default"],
    ["roi crop <item>", "Crop to a region's bounding box; the regions move with the crop"],
    ["roi hull <item>", "Add the convex hull of a polygon or freehand region as a new polygon"],
  ], { plural: "regions", example: "roi add rectangle 10 10 40 30" }),
  phase: listVerb("phase", "List, add, select, rename or remove the selected image's phases", ["select", "rename", "remove"], [
    ["phase add [name]", "Add a phase with the image's threshold method, and make it current"],
    ["phase colour <item> magenta|orange|blue|cyan|green|yellow|red", "Draw a phase in a colour"],
    ["phase show colours|bw|overunder", "Show each phase in its colour, the current one black on white, or Over/Under"],
  ], { example: "phase add Secondary" }),
  fit: listVerb("fit", "List fits with their parameters and statistics, add or change one", ["info", "select", "remove"], [
    ["fit models", "List the models by group, with the word each takes"],
    ["fit add <series> <model> [size]", "Fit series n of the selected plot with a model of fit models"],
    ["fit start <item> <parameter> <value>", "Start a parameter from a value, or auto for the model's guess"],
    ["fit fix <item> <parameter> [value]", "Hold a parameter at a value, or at its fitted value"],
    ["fit free <item> <parameter>", "Fit a parameter that was held"],
    ["fit weights <item> none|counts|relative", "Weight the points alike, by 1/y (counts) or by 1/y² (relative)"],
    ["fit range <item> <from> <to>", "Fit only the points with x from one value to another, or all"],
    ["fit residuals <item>", "List each point's x, y, fitted value and residual"],
    ["fit formula <item> <text>...", "Give a custom fit its formula in x; every other name in it is a parameter"],
    ["fit equation <item> on|off", "Show the equation and R² on the plot, or not"],
  ], { example: "fit add 1 gaussian" }),
  label: listVerb("label", "List, add, change or remove the selected image's text labels", ["move", "remove"], [
    ["label add <x> <y> <text>", "Add a label, its baseline starting at a point of the result"],
    ["label text <item> <text>", "Change a label's text"],
  ], { example: "label add 40 60 \"Grain A\"" }),
};

/** Run a list-and-edit verb: list and its shared operations through the shell, the rest through PlotForge's handler. */
/**
 * The item commands the workspace verbs (`list`, `info`, `select`, `rename`, `move`, `size`, `remove`) run over, in the
 * order `list` shows them; each runs as `<noun> <verb>` does, refused while its binding is blocked.
 */
export const ITEMS: ItemCommand[] = Object.values(ITEM_VERBS).map((verb) => ({ ...verb, run: (arg: string, signal?: AbortSignal) => runItemVerb(verb.noun, arg, signal) }));
/** The shared commands of PlotForge's actions, blocks and environment; their syntax and help are the shell's. */
export const SHARED = sharedCommands(ACTIONS, { blocks: BLOCKS, environment: ENVIRONMENT, items: ITEMS });
export const WORKSPACE = workspaceCommands(ITEMS);

export function runItemVerb(noun: string, arg: string, signal?: AbortSignal): MaybePromise<ConsoleResult> {
  const verb = ITEM_VERBS[noun], binding = BINDINGS.get(noun)!;
  const blocked = binding.blocked?.();
  if (blocked) return { lines: [blocked] };
  const words = parseArgs(arg);
  if (!words) return { lines: [OPEN_QUOTE_REPLY] };
  const shared = verb.spec.subcommands!.some((form) => form.syntax.split(/\s+/)[1] === words[0] && (ITEM_SUBCOMMANDS as readonly string[]).includes(words[0]));
  try { return shared ? verb.run(arg, signal) : binding.run(words); } catch (error) { return { lines: [error instanceof Error ? error.message : String(error)] }; }
}

// MARK: values of PlotForge's own commands

/** What a placeholder of PlotForge's own syntax takes, by its name; any other placeholder takes any value. */
interface ValueRule { accepts: string; test: (word: string) => boolean; name?: string }
const pattern = (accepts: string, regex: RegExp): ValueRule => ({ accepts, test: (word) => regex.test(word) });
const oneOf = (words: readonly string[]): ValueRule => ({ accepts: orList(words), test: (word) => words.includes(word) });
const WHOLE = pattern("a whole number", /^\d+$/), AMOUNT = pattern("a number of 0 or more", /^\d*\.?\d+$/), SIGNED = pattern("a number", /^-?\d*\.?\d+$/);
const VALUE_RULES: Record<string, ValueRule> = {
  x: WHOLE, y: WHOLE, low: WHOLE, high: WHOLE, min: WHOLE, max: WHOLE, from: WHOLE, to: WHOLE, number: WHOLE, row: WHOLE, point: WHOLE,
  bins: WHOLE, iterations: WHOLE, quality: WHOLE, places: { ...pattern("a whole number from 0 to 9", /^\d$/), name: "decimal places" },
  pixels: AMOUNT, length: AMOUNT, ratio: AMOUNT, tolerance: AMOUNT, prominence: AMOUNT, grey: AMOUNT, od: SIGNED, bound: SIGNED,
  method: oneOf(THRESHOLD_METHODS), objects: oneOf(["light", "dark"]), model: oneOf(["rgb", "hsb", "lab"]),
  lut: { ...oneOf(["grays", "inverted", "blackwhite", "fire", "ice", "spectrum"]), name: "the lookup table" },
};

/** The forms a command's arguments are read by: its subcommands, or its syntax when it has none. */
const formsOf = (spec: Pick<CommandSpec, "syntax" | "subcommands">): string[] => spec.subcommands?.map((form) => form.syntax) ?? [spec.syntax];
/** PlotForge's own commands' forms, with each optional value written as a placeholder (`[bins]` as `[<bins>]`). */
const VALUE_FORMS = new Map<string, string[]>();

/** The refusal of a value one form does not take, or null when the words fit it. */
function formProblem(form: string, words: string[]): string | null {
  const parts = form.replace(/\[([a-z][a-z0-9-]*)\]/g, "[<$1>]").replace(/[[\]]/g, " ").trim().split(/\s+/).slice(1);
  for (const [index, word] of words.entries()) {
    const part = parts[Math.min(index, parts.length - 1)];
    if (index >= parts.length && !part.endsWith("...")) break;
    const choices = part.replace(/\.\.\.$/, "").split("|");
    if (choices.includes(word)) continue;
    const name = choices.map((choice) => /^<([^<>]+)>$/.exec(choice)?.[1]).find(Boolean);
    const rule = name ? VALUE_RULES[name] : undefined;
    if (rule && !rule.test(word)) return takesReply(rule.name ?? name!, rule.accepts);
  }
  return null;
}

/**
 * The refusal of a value PlotForge's own command does not take, such as `pixel 1.5 0`, or null. The arguments' shape is
 * `args`, made from the same forms (`syntaxPattern`); a form with more literal words is read first, so that `calibrate
 * scale 2 um` is read as `scale <length> <unit>`, never as `<pixels> <length> <unit>`.
 */
export function valueProblem(spec: CommandSpec, arg: string): string | null {
  const forms = VALUE_FORMS.get(spec.name), words = parseArgs(arg);
  if (!forms || !words) return null;
  const literals = (form: string) => form.split(/\s+/).filter((part) => !/[<[]/.test(part)).length;
  const fitting = forms.filter((form) => syntaxPattern([form]).test(arg)).sort((a, b) => literals(b) - literals(a));
  const problems = fitting.map((form) => formProblem(form, words));
  return problems.includes(null) ? null : problems[0] ?? null;
}

/** Whether a command takes these arguments: their shape, then each value. */
export const commandAccepts = (spec: CommandSpec, arg: string): boolean => spec.args.test(arg) && !valueProblem(spec, arg);

/** A command of PlotForge's own, its `args` made from its forms and its values checked by `valueProblem`. */
function ownCommand(spec: Omit<CommandSpec, "args">): CommandSpec {
  VALUE_FORMS.set(spec.name, formsOf(spec));
  return { ...spec, args: syntaxPattern(formsOf(spec)) };
}

/** PlotForge's own commands, with the help group each belongs to. */
const APP_COMMANDS: [group: string, spec: CommandSpec][] = ([
  ["File", { name: "import", syntax: "import", description: `Add images or data files (CSV, text, Excel) to the ${noun}` }],
  ["File", {
    name: "export", syntax: "export [format]", description: "Export the selected images, after their steps, or the selected plots", example: "export jpeg 80",
    subcommands: [
      { syntax: "export", description: "Export with the export options; settings list shows them" },
      { syntax: "export png", description: "Export as PNG this time" },
      { syntax: "export jpeg [quality]", description: "Export as JPEG this time, at a quality from 1 to 100" },
      { syntax: "export svg", description: "Export the selected plots as SVG drawings this time" },
    ],
  }],
  ["File", { name: "health", syntax: "health [reminder <hours>]", description: "Show or set the break reminder: off, or 2 to 6 hours of use", choices: ["reminder"], example: "health reminder 3" }],
  ["File", { name: "tabs", syntax: "tabs", description: "List the open tabs" }],
  ["File", { name: "name", syntax: "name <name>...", description: "Name the unsaved document; its first Save offers the name", example: "name Grain sizes" }],
  ["File", { name: "tab", syntax: "tab <number>", description: "Show the tab with that number", example: "tab 2" }],
  // The document's objects by name, or by kind and number in list (image 2, plot 1); several are separated by commas.
  ["Edit", { name: "copy", syntax: "copy [<items>...]", description: "Copy the named or selected objects, to paste here or in another tab", example: "copy plot 1" }],
  ["Edit", { name: "cut", syntax: "cut [<items>...]", description: "Cut the named or selected objects", example: "cut image 3" }],
  ["Edit", { name: "duplicate", syntax: "duplicate [<items>...]", description: "Duplicate the named or selected images and plots", example: "duplicate plot 1" }],
  ["Edit", { name: "delete", syntax: "delete [<items>...]", description: "Remove the named or selected objects; files are not touched", example: "delete image 2, plot 1" }],
  ["Edit", { name: "arrange", syntax: "arrange front|forward|backward|back", description: "Move the selected objects in the drawing order among their kind", choices: ["front", "forward", "backward", "back"], example: "arrange front" }],
  ["View", { name: "snap", syntax: "snap [on|off]", description: "Show or set snapping to the grid", choices: ["on", "off"] }],
  ["View", { name: "scalebar", syntax: "scalebar [on|off]", description: "Show or set the calibration bar over the images on the work surface", choices: ["on", "off"] }],
  ["Edit", { name: "paste", syntax: "paste [into]", description: "Paste the copied objects, or the clipboard's image into a region", choices: ["into"],
    subcommands: [
      { syntax: "paste", description: "Paste the objects copied or cut, in this document or another" },
      { syntax: "paste into", description: "Paste the clipboard's image into the selected region, as a step" },
    ] }],
  ...(["data", "plot", "fit", "image", "step"].map((noun) => ["Document", ITEM_VERBS[noun].spec] as [string, CommandSpec])),
  ["Document", {
    name: "calibrate", syntax: "calibrate [subcommand]", description: "Show or set the real size of a pixel, for an image or the document",
    example: "calibrate 200 50 um",
    subcommands: [
      { syntax: "calibrate", description: "Show the selected image's calibration, or the document's default" },
      { syntax: "calibrate <pixels> <length> <unit>", description: "Calibrate the selected image by a known length" },
      { syntax: "calibrate scale <length> <unit>", description: "Calibrate the selected image by the real width of one pixel" },
      { syntax: "calibrate line <number> <length> <unit>", description: "Calibrate by a line region's real length; the scale follows the line" },
      { syntax: "calibrate aspect <ratio>", description: "Set the pixel aspect ratio, height over width" },
      { syntax: "calibrate pixels", description: "Measure the selected image in pixels" },
      { syntax: "calibrate follow", description: "Make the selected image follow the document's default" },
      { syntax: "calibrate default [<pixels> <length> <unit>]", description: "Show or set the document's default by a known length" },
      { syntax: "calibrate default scale <length> <unit>", description: "Set the document's default by the width of one pixel" },
      { syntax: "calibrate default aspect <ratio>", description: "Set the pixel aspect ratio of the document's default" },
      { syntax: "calibrate default none", description: "Measure images that follow the default in pixels" },
    ],
  }],
  ["Document", ITEM_VERBS.roi.spec],
  ["Document", {
    name: "threshold", syntax: "threshold [subcommand]", description: "Show or set the Threshold step's current phase and its mask steps", example: "threshold otsu light",
    subcommands: [
      { syntax: "threshold", description: "Show the threshold, its range and the masked pixels" },
      { syntax: "threshold on", description: "Start a threshold with the image's threshold mode; adds the Threshold step" },
      { syntax: "threshold manual <low> <high>", description: "Keep grey values from low to high, both included" },
      { syntax: "threshold otsu [objects]", description: "Split by Otsu's method; objects are light (default) or dark" },
      { syntax: "threshold mean [objects]", description: "Split at the mean grey value" },
      { syntax: "threshold li [objects]", description: "Split by Li's minimum cross-entropy" },
      { syntax: "threshold <method> [objects]", description: "Split by an automatic method, for light or dark objects" },
      { syntax: "threshold colour <model> [<bound>...]", description: "Colour ranges in rgb, hsb or lab: a low and a high bound per component" },
      { syntax: "threshold pick <x> <y> [tolerance]", description: "Colour ranges around the colour at a pixel, ± tolerance % (default 10)" },
      { syntax: "threshold mask", description: "List the mask steps after the Threshold step, in order" },
      { syntax: "threshold mask erode|dilate|open|close [iterations]", description: "Add a mask step on each phase's mask, repeated (default once)" },
      { syntax: "threshold mask outline|fill|skeleton", description: "Add a mask step: each mask's outline, its holes filled, or thinned to lines" },
      { syntax: "threshold mask remove <number>", description: "Remove one mask step" },
      { syntax: "threshold mask clear", description: "Remove every mask step" },
      { syntax: "threshold off", description: "Remove the current phase; the last one takes the Threshold step with it" },
    ],
  }],
  ["Document", ITEM_VERBS.phase.spec],
  ["Document", {
    name: "measure", syntax: "measure [subcommand]", description: "Measure the selected image, or its regions, into the results table", example: "measure decimals 3",
    subcommands: [
      { syntax: "measure", description: "Measure into the results table" },
      { syntax: "measure limit [on|off]", description: "Show or set Limit to threshold: grey statistics over the masked pixels only" },
      { syntax: "measure decimals [<places>|auto]", description: "Show or set the Results pane's decimal places, 0 to 9, or auto" },
    ],
  }],
  ["Document", ITEM_VERBS.label.spec],
  ["Document", {
    name: "density", syntax: "density [subcommand]", description: "Show or set the selected image's optical density standard", example: "density add 40 2.1",
    subcommands: [
      { syntax: "density", description: "Show the standard's points and its fit" },
      { syntax: "density add <grey> <od>", description: "Add a point: a grey value and its known optical density" },
      { syntax: "density point <od>", description: "Add a point with the mean grey value of the selected region" },
      { syntax: "density fit linear|quadratic", description: "Choose the fit of OD against the grey value" },
      { syntax: "density remove <point>", description: "Remove a point, by its number in density" },
      { syntax: "density clear", description: "Remove the standard; optical density is then uncalibrated" },
    ],
  }],
  ["Document", {
    name: "results", syntax: "results [subcommand]", description: "List, remove, clear or export the rows of the results table", example: "results export",
    subcommands: [
      { syntax: "results", description: "List the rows of the results table" },
      { syntax: "results list", description: "List the rows, as results alone does" },
      { syntax: "results remove <row>", description: "Remove a row, by its number in results" },
      { syntax: "results clear", description: "Remove every row" },
      { syntax: "results export", description: "Write the table as a CSV file" },
      { syntax: "results check", description: "Measure every row again from its record and compare values and mask" },
    ],
  }],
  ["Document", { name: "xy", syntax: "xy", description: "Export the pixels of the image or its selected region as X, Y, value" }],
  ["Document", { name: "pixel", syntax: "pixel <x> <y>", description: "Show a pixel of the selected image after its steps", example: "pixel 10 20" }],
  ["Document", {
    name: "display", syntax: "display [subcommand]", description: "Show or set how the selected image is drawn; values never change", example: "display lut fire",
    subcommands: [
      { syntax: "display", description: "Show the lookup table and display range" },
      { syntax: "display lut <lut>", description: "Draw grey values with grays, inverted, blackwhite, fire, ice or spectrum" },
      { syntax: "display range <min> <max>", description: "Spread the values from min to max over the display" },
      { syntax: "display auto", description: "Set the range leaving 0.35% of the pixels saturated" },
      { syntax: "display reset", description: "Draw the image plainly, in grays over its whole depth" },
    ],
  }],
  ["Document", { name: "histogram", syntax: "histogram [bins]", description: "Show the histogram of the selected image or region", example: "histogram 16" }],
  ["Document", { name: "profile", syntax: "profile", description: "List the profile of the selected line or rectangle region" }],
  ["Document", { name: "peaks", syntax: "peaks [prominence]", description: "Label the peaks of the selected rectangle's lane profile", example: "peaks 5" }],
  ["Document", { name: "peak", syntax: "peak <from> <to>", description: "Show the profile's area above the baseline between two samples", example: "peak 10 40" }],
] as [string, CommandSpec | Omit<CommandSpec, "args">][]).map(([group, spec]) => [group, "args" in spec ? spec : ownCommand(spec)]);

/** The step types `step add` takes, with the values each may be given. */
export const STEP_ADD_FORMS: [string, string][] = [
  ["grey [method]", "Convert to grey: luminance (default), red, green, blue or mean"],
  ["8-bit [<low> <high>]", "Convert to 8-bit by min-max, or by a fixed range"],
  ["crop <x> <y> <width> <height>", "Keep a rectangle, in pixels of the image the step receives"],
  ["rotate [angle]", "Rotate clockwise by 90 (default), 180 or 270 degrees"],
  ["flip [axis]", "Mirror: horizontal (default) or vertical"],
  ["canvas <width> <height> [<x> <y> [value]]", "Canvas size: the image placed at x, y (default 0, 0) on a canvas of that value (default 0)"],
  ["translate <x> <y>", "Move the image by x and y pixels; the uncovered edge is 0"],
  ["levels <black> <white> [gamma]", "Map black and white points, with gamma (default 1)"],
  ["invert", "Invert the values"],
  ["math <operation> [value]", "Maths: add, subtract, multiply, divide, min, max, gamma, log or set"],
  ["contrast <method> [saturated]", "Enhance contrast: normalize (with a percentage saturated) or equalize"],
  ["filter <kind> [<value>...]", "Filter, with one or more values: gaussian, mean, median, min, max, variance, unsharp, smooth, sharpen, edges, despeckle, bright-outliers, dark-outliers or convolve"],
  ["calculator <operation> <image>", "Image calculator with the image of that number: add, subtract, multiply, divide, and, or, xor, min, max, average or difference"],
  ["threshold", "Threshold: one mask per phase from the grey result, starting with the image's threshold method"],
  ["mask <operation> [iterations]", "After the Threshold step, on each phase's mask: erode, dilate, open or close (repeated), outline, fill or skeleton"],
];
/** The parameters `step set` changes, by step type. */
export const STEP_PARAMETERS: Record<string, string[]> = {
  grey: ["method"], "8-bit": ["mapping", "low", "high"], crop: ["x", "y", "width", "height"], rotate: ["angle"], flip: ["axis"], canvas: ["width", "height", "x", "y", "value"], levels: ["black", "white", "gamma"], invert: [],
  filter: ["filter", "radius", "weight", "threshold", "normalize"], math: ["operation", "value"], contrast: ["method", "saturated"], fill: ["value"],
  calculator: ["operation", "image"], paste: [], threshold: [], mask: ["operation", "iterations", "count", "phase"],
};
/** PlotForge's own commands that run with no document open. */
const APP_WELCOME = ["tabs"];

/**
 * Help groups in the shared order, each group once: File, Edit and View with PlotForge's commands after the shared
 * ones, then the Document menu's category, then Help, and Console last.
 */
function mergedGroups(groups: readonly (readonly [string, readonly string[]])[]): [string, string[]][] {
  const merged = new Map<string, string[]>();
  for (const [group, names] of groups) merged.set(group, [...(merged.get(group) ?? []), ...names]);
  const order = ["File", "Edit", "Items", "View", "Document", "Help", "Console"];
  const rank = (group: string) => (order.includes(group) ? order.indexOf(group) : order.length);
  return [...merged].sort(([a], [b]) => rank(a) - rank(b));
}
const APP_GROUPS = (): [string, string[]][] => {
  const groups = new Map<string, string[]>();
  for (const [group, spec] of APP_COMMANDS) groups.set(group, [...(groups.get(group) ?? []), spec.name]);
  return [...groups];
};

/** The help of the list-and-edit verbs: the shell's note on <item> and example, then PlotForge's own notes. */
function withItemDetails(details: HelpCatalog["details"]): HelpCatalog["details"] {
  const merged = { ...details };
  for (const [noun, verb] of Object.entries(ITEM_VERBS)) {
    const own = merged[noun] ?? {};
    merged[noun] = { ...verb.details, ...own, notes: [...(verb.details.notes ?? []), ...(own.notes ?? [])] };
  }
  return merged;
}

// The shared commands' syntax, description and help come only from the shell, so that they read the same in every
// Forge app; an own command or help topic named like one throws.
const MADE = createHelpCatalog({
  shared: SHARED, commands: APP_COMMANDS.map(([, spec]) => spec), onWelcome: APP_WELCOME, noDocumentMessage: `Open a ${noun} first.`,
  details: withItemDetails({
    import: { notes: ["The images are linked, not copied, and never changed. Opening an image makes a new document that links to it."] },
    export: { notes: [
      "Each image is written as the result of its enabled steps. PNG is lossless at its own depth; JPEG, and any picture with overlays, is 8-bit RGB.",
      "One image opens a Save dialog; several go into a chosen folder, where the exists setting decides (settings exists). An original is never written.",
    ] },
    snap: { notes: ["Snapping is saved with the document. Hold Option while dragging to place an image freely."] },
    step: { notes: [
      "Steps act on the selected image and run in order on a copy; the original file is never changed.",
      "The Threshold step makes one mask per phase from the grey result before it. Grey steps go before it; after it only mask steps apply, each on every phase's mask separately (or on one phase's), so phases never mix.",
      "Type help step add for the step types.",
    ] },
    "step add": { choices: STEP_ADD_FORMS, example: "step add levels 10 240 1.2" },
    "step set": {
      notes: ["Parameters: grey method; 8-bit mapping (minmax or range), low and high; crop x, y, width and height; rotate angle; flip axis; levels black, white and gamma; filter filter, radius (sigma for gaussian and unsharp), weight, threshold (the outlier filters) and normalize (on or off); mask operation, iterations, count (1 to 8 neighbours) and phase (a phase's number, or all).",
        "The Threshold step is set with the threshold and phase commands.",
        "Filter values: a radius (sigma for gaussian and unsharp), then unsharp's weight or the outlier threshold; convolve takes its kernel's weights row by row, such as 0 1 0 1 -4 1 0 1 0."],
      example: "step set 2 gamma 1.5",
    },
    pixel: { notes: ["Coordinates are pixels of the result of the steps, from 0 at the top left. A calibrated image also gives the real position of the pixel's top-left corner."] },
    roi: { notes: [
      "Regions are in pixels of the result of the image's steps, from 0 at the top left, and may be fractional.",
      "Area is the exact area of the outline; pixels are those whose centres lie inside, which measurements count.",
      "Freehand regions are drawn on the work surface with the Freehand tool (F).",
    ] },
    data: { notes: ["data name: =B1 takes a cell's text as the name; none removes it."] },
    plot: { notes: [
      "plot new: one range is plotted against the row number; with more, the first is X.",
      "plot part takes series 2, point 2 5 (series 2's point at worksheet row 5), or plot.",
      "Axis formats: percent shows 0.25 as 25%; auto takes dates for date cells, else numbers.",
      "plot series properties: axis left, right, top or bottom; colour auto (follows the palette), a place in the palette (1, 2 and so on) or #rrggbb; connect straight, spline, bspline, bezier or step.",
      "plot series cells: a name, B2:B40 or Sheet!B2:B40; none clears.",
      "plot series fit: none, average or sg [window], linear, poly [order], exp, power, log, or a model of fit models; plot series <n> equation on|off shows it on the plot.",
      "plot series callout: y (the value and its unit), xy, label or none.",
      "plot swap: series and axis settings change sides.",
    ] },
    fit: { notes: [
      "fit add takes a polynomial's order or the number of Gaussian peaks as its size.",
      "fit range: auto is an end of the data; all takes every point.",
    ] },
    threshold: { notes: [
      "Methods: isodata, percentile, triangle, intermodes, minimum, moments, maxentropy, yen, ijisodata, huang, minerror, renyientropy and shanbhag.",
      "A colour range without bounds, or none, takes the component's full range.",
      "Grey thresholds act on the grey result of the steps, in its own values: 0 to 255, or 0 to 65535.",
      "Light objects are the values above the split; dark objects are the split and the values below.",
      "Colour thresholds act on a colour result: rgb 0 to 255 each; hsb hue 0 to 360 (a low end above the high end wraps through 0), saturation and brightness 0 to 100; lab L* 0 to 100, a* and b* -128 to 127 (D65).",
      "The threshold is the image's Threshold step, saved with its step list; each results row keeps its mask's CRC-32, so results check can show the same mask was measured.",
      "Mask steps after the Threshold step act on every phase's mask separately; step set <number> phase <n> limits one to a phase.",
    ] },
    measure: { notes: [
      "A selected region is measured on its own; otherwise each region of the image, or the whole image when it has none.",
      "Each row keeps its steps, threshold, region and calibration, so it can be measured again.",
      "measure decimals auto shows four significant digits.",
    ] },
    results: { notes: [
      "The CSV keeps every digit and each row's record; the pane shows four significant digits, or the places set by measure decimals.",
      "results check says whether each row's values and mask are the same as when it was measured.",
    ] },
    phase: { notes: [
      "An image's thresholds are the phases of its Threshold step, each with its own range or method and colour; the mask steps after the step act on each phase's mask separately. Measure takes a row per phase and region, with the phase's name.",
      "A pixel in two phases' ranges is counted in both; the Threshold step and Messages say how many such pixels there are.",
    ] },
    label: { notes: ["Labels are drawn over the image and never change its pixels. An export includes them only with Include overlays."] },
    density: { notes: ["Without a standard, optical density is log10(M / v). With one, OD is fitted against the grey value by least squares, linear (2 or more points) or quadratic (3 or more), and the fit is stated with R²."] },
    peaks: { notes: ["A peak is labelled when it stands at least the prominence above the higher of its two valleys; by default a tenth of the profile's range. Its area is above the baseline between its valleys."] },
    paste: { notes: ["The clipboard's image is kept in the document as an image of its own, and a Paste into selection step of the selected image reads it; the original file is unchanged."] },
    scalebar: { notes: ["The bar is the one exports draw, with the export's style, length, blocks and size, in its corner (lower right when exports draw none). It is drawn over the image only."] },
    histogram: { notes: ["Bins split 0 to the depth's maximum into equal parts; the default is 256. Grey images only."] },
    profile: { notes: ["A line is sampled once per pixel of its length, between pixel centres. A rectangle is read as a gel lane: the mean across its short side, along its long side."] },
    peak: { notes: ["Samples are numbered from 1, as profile lists them. The baseline is the straight line between the two samples; the area is in grey value times distance."] },
    calibrate: { notes: [
      "Units are nm, µm (or um), mm, cm, m and in.",
      "A known length is measured along x on the original image. Calibration changes reported lengths and areas only, never pixels.",
      "A calibration from a line follows the line: move or redraw it and the scale changes; remove it and the last length stays.",
    ] },
  }),
  groups: APP_GROUPS(),
});
export const CATALOG: HelpCatalog = { ...MADE, groups: mergedGroups(MADE.groups) };
export const COMMANDS: CommandSpec[] = CATALOG.commands as CommandSpec[];
/** Commands that run with no document open. */
export const WELCOME_COMMANDS = CATALOG.availableOnWelcome;

/** Completions for a partly typed line: verbs first, then the choices or subcommands of a verb. */
export function completions(line: string, welcome: boolean): string[] {
  const [command = "", ...rest] = line.trimStart().split(/\s+/);
  const available = COMMANDS.filter((entry) => !welcome || WELCOME_COMMANDS.has(entry.name));
  if (!rest.length) return available.map((entry) => entry.name).filter((name) => name.startsWith(command));
  const entry = available.find((item) => item.name === command);
  if (!entry) return [];
  const typed = rest.join(" ");
  // The workspace verbs complete kinds, then item numbers; `panel` also shows a pane by name.
  const verbs = SHARED.some((shared) => shared.spec.name === command && shared.environment === "workspace") ? WORKSPACE.complete(line.trimStart()) : [];
  if (verbs.length) return verbs;
  if (command === "panel") return [...(entry.choices ?? []), ...PANES].filter((option) => option.startsWith(typed)).map((option) => `panel ${option}`);
  // `step add` completes the step types.
  if (command === "step" && rest.length === 2 && rest[0] === "add") {
    return STEP_ADD_FORMS.map(([form]) => form.split(" ")[0]).filter((type) => type.startsWith(rest[1])).map((type) => `step add ${type}`);
  }
  // Placeholders (`<pixels>`) and the bare verb are not words to complete.
  const options = entry.subcommands ? [...new Set(entry.subcommands.flatMap((form) => (form.syntax.split(" ")[1] ?? "").split("|")).filter((word) => word && !/^[<[]/.test(word)))] : entry.choices ?? [];
  return options.filter((option) => option.startsWith(typed)).map((option) => `${command} ${option}`);
}
