# Inspector layout (proposal)

Status: agreed in brainstorming on 2026-11-13. Built: the shared header (General, Image, Several); Regions with the selected region in one section; Histogram and Profile in the bottom panel's Charts tab; File and Display folded. Not built: Threshold as a step, the grouped Add step menu.

Revised on 2026-11-13 to stay within forge-shell's inspector rules (GUIDELINES-SHELL.md, Inspector philosophy): one subject per section, one action row first, every section with its own heading. So Calibration and Density standard stay sections of their own rather than parts of Image, Labels stays apart from Regions (labels cannot be selected, so the section cannot share Remove), and Measure stays as the Measurements section's own action. The image mode is now, in order: Selection, File (folded), Calibration, Steps, the selected step, Threshold, Mask, Regions, Labels, Measurements, Density standard, Display (folded), Placement (folded). When it lands, `INTERFACE.md` §4 (Inspector sections and default folds) is rewritten to match and this file is removed.

## Modes

The inspector follows the selection. Each object type is a mode; a mode can have a sub-selection that adds its settings under the list it belongs to.

| Mode | Selection | Sub-selections |
|---|---|---|
| General | Nothing | — |
| Image | One image | Step, region, label |
| Worksheet | One data file (CSV, Excel; later a measurement table) | Column |
| Plot | One plot | Series, axis |
| Several | Two or more objects, of any types | — |

Plot is built (2026-11-15): line and scatter plots of worksheet columns.

## Document first, then the selection

Owner, 2026-11-15: the Document section is always the first section, in every mode. Below it, when something is selected, comes a section for it (Image, Images, later Data and Plot) with its name and file, and below that the mode's other sections.

- **Document**: actions Import… and Export… (Export is a main button here, since the bottom panel's Export tab is gone and its options are Settings › Export); each is disabled where it does not apply, the tooltip saying why. Then Name (renames in place while unsaved: click it or press F2), File, Images, Grid and Snap to grid. Copy, Duplicate and Delete stay in the Edit menu and on Cmd+C, Cmd+D and Backspace (owner, 2026-11-15: no Duplicate button). The Name has `rename <name>`
- **Image**: Name (renames in place), File, Status, Format, Pixels, Bit depth, Colour, File size
- **Images** (several): Selected, the count; then Placement (the selection's Position and Size, folded)
- **Worksheet** (built 2026-11-15, ranges 2026-11-17; a data file is a read-only worksheet object on the work surface, as a workbook window in Origin, shown as it is): with cells chosen, one row per chosen range with its role (X, Y, Y error, Label, Skip; text only X (categories), Label or Skip; Origin's rule by default: the first with numbers X, the rest Y), and for one column Cells (A3:A10), Name and Unit (Excel's Name Box; =B1 takes a cell's text), Name from first row (plots are made from the toolbar, 2026-11-18); then Name (renames in place), File, Status, Format, Rows, Columns, File size; then **Reading** (Delimiter, Decimal mark and Encoding for text, or Sheet and Range for a workbook; Header only for an older document that had one; Skip rows), **Names** (the sheet's named ranges; a click chooses their cells) and, with one column chosen, **Column B** (Kind, Count, Missing, Min, Max, Mean, SD), then **Placement** (X, Y, Width, Height; `data move`, `data size`)
- **Source outlines** (work surface, 2026-11-17): while one plot is selected, its ranges' outlines on the sheets are handles: top and bottom edges set rows, sides move the range to another column.
- **Template and batch** (plot, 2026-11-17): Save as template, Apply (saved templates), each other worksheet ticked, Plot alike. The template new plots take is Settings › Plots › New plots › Style (`plot template default`).
- **Plot** series (2026-11-17, as Origin's Plot Setup): Add chosen cells first; each axis' Title, Scale (Linear, Log), Min, Max, Step (linear only), Minor ticks; per series Y, X, Error and Labels as reference fields, each with its own rows (a name, B2:B40 or Sheet!B2:B40; empty is Row number for X, None for Error), then Pick Y, Pick X, Pick error, Pick labels (the next cells chosen in a worksheet; Esc cancels), All rows (Mixed while they differ), Points, Y axis, Kind, Connect (Straight, Spline, B-spline, Bezier, Step), Curve (Through or Near the points, for curves), Fit (None, Moving average, Savitzky–Golay, Linear, Polynomial, Exponential, Power, Logarithmic; Window, Order; Equation, R², Show on plot), Colour, Symbol, Line, Remove
- **Plot** (built 2026-11-15; a plot is an object on the work surface, as a graph window in Origin, drawn as a figure on white paper in every appearance): **Plot** (Name, Title, Legend), **X axis** and **Y axis** (Title, empty for the column's "Name (unit)"; Min, Max and Step, empty for auto, showing the automatic value; Minor ticks), with **Left Y axis** and **Right Y axis** instead of Y axis while a series is on the right one, **Series** (per series its worksheet and X column, then Rows, Y axis (Left or Right), Kind, Colour, Symbol, Line), **Placement** (X, Y, Width, Height, folded). How plots export (Format, Resolution) is technical, so it is set for the app in Settings › Export › Plots, not per plot. `plot` does the same from the Terminal.

With nothing selected, Default calibration (the document's) follows Document. Placement's X and Y have `image move <number> <x> <y>`. A new image is placed right of everything and brought into view. For an image, Placement (X, Y, Width, Height, folded) comes last.

## Image mode

From 15 sections to 4 after the header.

1. **Image**: Name, File, Status, Format, Pixels, Bit depth, Colour, File size; then Calibration and Density standard
2. **Steps**: On import, the step list, Add step, Remove; the selected step's settings directly below
3. **Overlay**: one list of regions and labels; the selected item's settings directly below (Crop to region, Fill)
4. **Display**: lookup table, minimum and maximum (folded); view only, never changes pixels

### Threshold becomes a step

Threshold and Mask of [phase] stop being sections. A Threshold step holds the method, the phases and the mask operations as its settings. It is a normal step: every step after it works on the binary mask (for example a median to remove specks), as in ImageJ. Measure reads the result of the last step.

### Moved out of the inspector

- Histogram and Profile: a Charts tab in the bottom panel, beside Results
- Measure: a toolbar button and a button in the Results tab; which measurements to take stays a setting

### Add step menu, grouped

| Group | Items |
|---|---|
| Convert | Convert to grey, Convert to 8-bit |
| Geometry | Crop, Rotate 90° clockwise, Rotate 90° counter-clockwise, Rotate 180°, Flip horizontal, Flip vertical |
| Adjust | Levels, Invert, Enhance contrast, Maths |
| Filters | The 11 filters |
| Combine | Image calculator (paste is added by pasting) |
| Threshold | Threshold |

The same groups in Document › Add step (`menu-bar.ts`) and the inspector's menu (`addStepMenu`).

## General mode

After the header: **Calibration** (the document's default; to be labelled "Default calibration" so it is not confused with an image's own).

## Open questions

- Data and Plot sections, once the model has them: does a plot link to a data object on the canvas, or embed its data?
- Whether a measurement table on an image is a Data object of its own, so it can feed a plot.

## Fixed

The Threshold section's row of Add phase, Pick and Remove did not fit the inspector's width, so "Add phase" wrapped onto two lines. The button is now Add (its tooltip says it adds a phase).
