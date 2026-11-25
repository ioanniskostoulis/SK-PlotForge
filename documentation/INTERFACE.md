# PlotForge interface profile

The profile contains application-specific values only. The shared shell, tokens, geometry, motion, menu, Terminal, Help and message rules of the `GUIDELINES.md` of the pinned `forge-shell` apply unchanged and are not repeated. A value that is not decided is marked `to decide`, and a feature that the application does not have is marked `none`.

## 1. Identity

| Field | Value |
|---|---|
| Product name and capitalisation | PlotForge |
| Lowercase id (package, commands, storage keys) | `plotforge` |
| Purpose (one line) | plotting and image-analysis workspace |
| Version source | `VERSION` |
| Author and credits | Ioannis Kostoulis; credits in the About and Licenses dialogs (`source/app/about.ts`); third-party work in `NOTICE.md` |
| Licence | GPL-2.0-or-later; the name, logo and icon are not licensed by it |
| App icon source and packaging paths | Drawn by forge-shell from `forge.config.json` into `build/identity` (`icon.png`, `app.icns`, `app.ico`); packaged by `forge-shell package-config` |
| Application icon capital and colour | `P`, `#27a56a` (`desktop.iconColour`) |
| ASCII wordmark path and exact text | `build/identity/logo.txt`, drawn by forge-shell, spelling `PlotForge` |
| Wordmark source | `renderWordmark("PlotForge")` of forge-shell, generated on every build; no edits |
| Artwork provenance | The capital P of GFS Artemisia Bold, placed by forge-shell's identity rule; the licences are in `NOTICE.md` |
| Browser preview port | 4278 |
| Update repository | `ioanniskostoulis/SK-PlotForge` (`identity.repository`): Settings › Updates (`updatesPage`) reads its latest public release; there is no check at launch |

## 2. Documents

| Field | Value |
|---|---|
| Primary noun | document |
| Extension and MIME type | `.pfg`, `application/vnd.plotforge.document` |
| Document icon files | `build/identity/pfg.png`, `.icns`, `.ico`, drawn by forge-shell |
| Document icon ink colour | `#27a56a` |
| File association name and role | PlotForge document, Editor |
| New | An empty document, `Untitled n` |
| Open | File › Open… takes `.pfg` documents, PNG, JPEG and TIFF images, and data files (CSV, TSV, TXT, DAT, XLSX). An image or data file opens as a new `Untitled n` document that links to it; its first Save offers `<image name>.pfg`. A drop on the window does the same with no document open, and adds the images to the active document otherwise |
| Save and Save as | JSON (`format`, `version` 2, `grid`, the default `calibration`, `images`, each image with its `steps` and its `calibration`: a calibration, `"pixels"` or null to follow the default); format 1 documents open with no steps and are written as format 2. Image paths relative to the document's folder with forward slashes. Only `.pfg` paths are written (`isWritableProjectPath`, checked again in the main process) |
| Import | File › Import… links PNG, JPEG and TIFF images and data files (delimited text, Excel `.xlsx`; a legacy `.xls` is refused) to the active document. Originals are read-only and never written; a document stores a data file's path and read options (`read`). A file is shown as it is, read-only: columns by letter, rows by number, no header and no roles (`read.header` is `false` for every new link; an older document's `true` or missing header and its `columns` settings are kept but not offered). Named ranges of cells (`ranges`: id, name, unit, data, column, rows) label series and axes; plots store each series' cells (`x`, null for the row number, and `y`: data, column, rows) and `connect`. Each worksheet's position and size (`x`, `y`, `width`, `height`), only when it has data. Each data file is a worksheet object on the work surface beside the images |
| Plots | The toolbar's plot kinds (Scatter, Line, Line + symbol, Column; also Document › New plot, `plot new <kind>`), as Excel's Insert › Chart: with cells chosen in the selected worksheet they make a plot object of them by their roles; without, an empty plot in the middle of the view, selected, that waits for the next cells chosen in any worksheet (Choose cells in its Series section; Esc stops). A cell's right-click New plot › and dragging cells onto the work surface or a plot still plot at once. A plot reads its worksheets each time it is drawn; it is stored in the document's `plots` (written only when there are some) with its title, axes (`xAxis`, `yAxis`, and `y2Axis` for the right Y axis, written only while it is used or set; each `title`, `min`, `max`, `step`, `minor`, left out while automatic), legend and series (`data`, `x`, `y` by column key, `kind`, `colour`, `symbol`, `symbolSize` and `lineWidth` in points, `dash`, `name`, `rows`, and `axis: "y2"` for a series on the right Y axis). A series whose worksheet was removed is kept and shown as not drawn. Default look, from the owner's Excel report charts: Cambria, 11 pt title, 10 pt for everything else, black 0.75 pt chart border, plot-area frame and axes, major ticks across the axis and minor ticks inside, no gridlines, a legend without a border in the plot area's top-right corner, black square markers of 3 pt and 1 pt lines, then the Office 2007 accent colours. A plot is laid out at 96 px to the inch, so 100% zoom is print size. Every size (type, lines, ticks, markers, spacing) is set for the 480 × 320 px plot and drawn at one ratio to it, the lesser of the width and height ratios, so a resized plot keeps its proportions. Layout (`layoutPlot`): one outer margin (`padPt`, 8 pt) on all four sides, measured to the letters' ink (`TextInk`, from the canvas' actual bounding box); inside it, spacing by belonging: `tickGapPt` 3 pt from ticks to labels, `titleGapPt` 4.5 pt from labels to an axis title, `headGapPt` 6 pt from the title to the plot. The plot area takes the room left, not mirrored; the title and X axis title are centred on it, and the title's ink is centred halfway between the top edge and the top axis (owner, 2026-11-19). Text between `$` signs is LaTeX-style mathematics (`plot-math.ts`), laid out in runs that the canvas and the SVG draw alike. The legend stands `legendInsetPt` 6 pt in from the frame's top and right, rows a tick gap apart, on white. Owner, 2026-11-16: space is used, not mirrored, but the figure must feel balanced and put together. A series is drawn against the left Y axis or a right one with its own range, ticks, labels and title, shown while a series is on it. A plot is one vector scene (`plotScene`), drawn on the canvas, written as SVG (`plotSvg`, sized in points) or rasterised at `exportDpi` as PNG (with a pHYs chunk) or JPEG (JFIF density); `exportFormat` and `exportDpi` are stored only when not PNG at 300 dpi. Axes round out to a step of 1, 2 or 5 times a power of ten, and an axis of positive values starts at zero when the data spans more than a sixth of its largest value, as in Excel. |
| Export formats | Plots as PNG, JPEG (at the resolution of Settings › Export › Plots) or SVG; PNG and JPEG images (File › Export image…) and the CSV results table (File › Export results…), through the shell's export (`exportFiles`, `registerExportIpc`; formats `EXPORT_FORMATS`). One file goes through the export dialog, several into a chosen folder, where If the file exists decides: Ask (Replace, Keep both or Cancel, `askReplace`), New name, or Replace after a confirmation. Never a `.pfg` or an original. The browser preview downloads |
| Document tabs | yes; one document per tab; dragged to rearrange them |
| Dirty-state rule | The project differs from the last saved state (for an unsaved document, from an empty one); undoing back to it clears the mark |
| Close prompt | Save, Discard, Cancel |
| Recovery | While a document has unsaved edits its draft is kept in the application's storage; after a crash the next launch offers the drafts (Restore, Cancel) |
| Project holds several files | no; it links to images outside itself |
| New view content | The empty dot grid |
| Welcome button labels | New document, Open… |

## 3. Theme

| Token | Dark | Light |
|---|---|---|
| `--accent` | `#27a56a` | `#1e8052` |
| `--accent-light` | `#27a56a` | `#1e8052` |
| `--accent-about` | `#2dbe7a` | `#1e8052` |
| `--accent-fill` | `#1e8052` | `#1e8052` |
| `--accent-hover` | `#186742` | `#186742` |

Emerald green, chosen by the owner on 2026-11-07 and derived by the shell's `deriveAccents` from `#27a56a` (hue 152°). It replaces the magenta of the same day (`#be698e` family), which read as plum (`forge.config.json`).

| Item | Value |
|---|---|
| Contrast (the shell's `contrastRatio`) | Dark accent on the input well 5.48:1, About accent 7.18:1; white on the fill 4.92:1 and on the hover 6.87:1; Light accent on its well 4.63:1. `brandCss` accepts the theme |
| Semantic data colours | `dataColors`: region outlines in the shell's overlay palette in order (`overlayColor`, by the picture's lightness), threshold mask overlays `#e040fb8c` (magenta, default), `#ff8c1a8c`, `#3d8bff8c`, `#00d0c88c`. Selected regions use `--pick`. Images are drawn from their own pixels: 16-bit values are shown across 0 to 65535 |
| Work-surface colours | The shell's welcome surface (`--empty-sheet`, `--empty-grid-dot`, `--empty-grid-line`), read from its element at draw time; content selection in `--pick` |

## 4. Workspace

| Field | Value |
|---|---|
| Centre view or views | The work surface: a canvas with the dot grid (16 px, major lines every 128 px) and the document's images placed on it at their pixel size |
| Inspector sections and default folds | A head that stays on top while the inspector scrolls: Export… (primary), Copy and Measure (`createButtonGroup`), then page chips (`createChips`), each with a tooltip. One image: Edit (Steps with On import, the step list, Add step with a Filters submenu, Remove; the current step's parameters under its name: Convert to grey Method; Convert to 8-bit Mapping, Low, High; Crop X, Y, Width, Height, Image; Rotate Angle; Flip Axis; Levels Black point, White point, Gamma sliders; Invert Values; Filter Filter, Sigma or Radius, Weight, Kernel and Normalise; Maths Operation, Value; Enhance contrast Method, Saturated; Fill Region, Area, Value; Threshold: Add, Remove (and Pick on a colour image), the histogram with each phase's band, the phases, In no phase, In two or more, Show as, then the current phase's Masked, Split, Name, Colour, Method and Range or colour; a mask step Operation, Iterations, Acts on; Placement X, Y, Width, Height, and Angle for an image), Analyse (Calibration: Calibration, the fields of a known length or a scale, Pixel length and From line for a calibration from a line, Unit, Aspect ratio, Use selected line, Pixel size, Size; Regions; the selected region under its name with Crop to region; Measurements: a check row per measurement and Measure), Info (Image: Name, File, Status, Format, Pixels, Bit depth, Colour, File size; Display: Lookup table, Colours for Custom, Minimum and Maximum sliders, Auto, Reset; Histogram of the image or the selected region with Pixels, Mean, Std dev, Min and max, Mode, Log scale, Copy values; Profile of a selected line or rectangle with Kind, Samples, Length, Range, Copy values) and Output (Export: Selection, Format, Quality, Calibration bar, Include overlays, If the file exists, Writes). Nothing selected: Document (Document, Calibration) and Output (Export). The app's own settings are in Settings (Images, Export). Several: Selection and Output. Placement and Image settings start folded; the rest open |
| Folds that persist | Every section's fold and the page of each context (image, document, several), in the app settings (`inspectorFolds`, `inspectorPages`) |
| Bottom tabs in order | Terminal, Results, Export, Messages. Results: the document's results table (sortable headings, a row selects its image and region), with Export CSV… and Clear at the right of the tab bar while it is selected |
| Default panel sizes and justified overrides | Shell defaults; no overrides |

## 5. Navigation

| Centre view | Pointer | Wheel | Pinch | Pan | Zoom | Keyboard | Drag |
|---|---|---|---|---|---|---|---|
| Work surface | Click selects (Shift adds, Cmd toggles); a click on empty space clears; with a region tool, a drag draws a rectangle, ellipse, line or freehand outline and clicks place a polygon's points (a double click, Return or a click on the first point closes it); in Select, once its image is selected, a region is taken by its outline only (hovered in `--pick`, move cursor) and a drag on the outline moves it; hovering an image shows the pixel under the pointer, of the result of its steps, in the status bar, with its real position when the image is calibrated | Mouse wheel zooms at the pointer; trackpad scroll pans (`wheelIntent`) | Zooms at the pointer | Space and drag, middle button, trackpad scroll | 5% to 1200% (`Viewport`); Fit (Cmd+0, or Space tapped twice) frames the selected images, or every image with none selected (`fitBounds`), and never magnifies beyond 100% | Arrows move the selection one grid step (one pixel with Option or snapping off; Shift ten times); Backspace or Delete removes; Esc clears | Drag an image to move the selection, snapped to the grid unless Option is held; drag on empty space draws a selection box |

## 6. Actions

Every standard item is built by the shell (`standardItem`, `zoomItems`), with its label and key; the profile records only which items PlotForge has and when they are enabled.

| Menu | Action ID | Label | Shortcut | Enabled when | Checked when | Welcome |
|---|---|---|---|---|---|---|
| File | `file.new` | New document | Cmd+N | always | | enabled |
| File | `file.open` | Open… | Cmd+O | always | | enabled |
| File | `file.recent.*` | Open recent | | desktop | | enabled |
| File | `file.save` | Save | Cmd+S | document | | disabled |
| File | `file.saveAs` | Save as… | Shift+Cmd+S | document | | disabled |
| File | `file.import` | Import image… | Shift+Cmd+I (App tier) | document | | disabled |
| File | `file.export` | Export image… | Shift+Cmd+E (App tier) | images selected and shown | | disabled |
| File | `file.exportResults` | Export results… | | the results table has rows | | disabled |
| File | `file.autosave.*` | Autosave | | always | the choice | enabled |
| File | `file.close` | Close | Cmd+W | document | | disabled |
| File | `app.settings` | Settings… | Cmd+, (macOS: the application menu, after About) | always | | enabled |
| Edit | `edit.undo`, `edit.redo` | Undo, Redo | Cmd+Z, Shift+Cmd+Z | an undo or redo step exists | | disabled |
| Edit | `edit.cut`, `edit.paste` | Cut, Paste (roles; outside a text field, Paste adds a PNG, JPEG or TIFF image from the clipboard, kept inside the document) | Cmd+X, V | text fields; Paste always | | |
| Edit | `edit.copy` | Copy (no role: the selected text, or else the one selected image as shown) | Cmd+C | always | | |
| Edit | `edit.delete` | Delete | Backspace on macOS, Delete on Windows (shown; handled by the work surface) | a selection | | disabled |
| Edit | `edit.selectAll` | Select all (no role: PlotForge selects the field's text, the Terminal transcript or the images) | Cmd+A | always | | enabled |
| View | `view.zoomIn`, `view.zoomOut` | Zoom in, Zoom out | Cmd+=, Cmd+- | document | | disabled |
| View | `view.fit` | Fit | Cmd+0 | document | | disabled |
| View | `view.actualSize` | Actual size | Cmd+1 | document | | disabled |
| View | `view.inspector`, `view.bottomPanel` | Show inspector, Show bottom panel | Cmd+I, Cmd+J | always | visible | enabled |
| View | `view.snap` | Snap to grid | | document | snapping on | disabled |
| View | `view.mask` | Show mask | | document | masks drawn | disabled |
| View | `view.theme.*` | Appearance › Dark, Light | | always | the appearance | enabled |
| View | `view.fullScreen` | Toggle full screen (desktop, role) | the platform's own | always | | enabled |
| Document | `document.step.add.*` | Add step › Convert to grey, Convert to 8-bit, Crop, Rotate 90° clockwise, Rotate 90° counter-clockwise, Rotate 180°, Flip horizontal, Flip vertical, Levels, Invert, Maths, Enhance contrast, Filters › Gaussian blur, Mean, Median, Minimum, Maximum, Variance, Unsharp mask, Smooth, Sharpen, Find edges, Convolve, Combine › Image calculator, Threshold › Threshold, Erode, Dilate, Open, Close, Outline, Fill holes | none | one image selected and shown; Threshold only without a Threshold step, the mask steps only with one | | disabled |
| Document | `document.step.enabled` | Step enabled | none | a current step | the step is enabled | disabled |
| Document | `document.step.up`, `document.step.down` | Move step up, Move step down | none | a current step that can move | | disabled |
| Document | `document.step.remove` | Remove step | none | a current step | | disabled |
| Document | `document.tool.*` | Tool › Select, Rectangle, Ellipse, Polygon, Freehand, Line, Crop (bare keys V, R, E, P, F, L, C on the work surface, not shown in the menu) | | document | the current tool | disabled |
| Document | `document.measure`, `document.results.clear` | Measure, Clear results | Shift+Cmd+M (App tier), none | one image selected and shown; rows exist | | disabled |
| Document | `document.roi.crop`, `document.roi.fill`, `document.roi.clear` | Crop to region, Fill region, Clear outside region | | a region selected | | disabled |
| Document | `document.roi.remove` | Remove region | | a region selected | | disabled |
| Document | `document.threshold.*` | Threshold › None, Manual range, Otsu, Mean, Li | | one grey image selected and shown | the image's choice | disabled |
| Help | shell (`helpMenu`) | About PlotForge (Windows and the browser; the app menu on macOS), What's new…; Keyboard shortcuts…; Licenses… (no guides of PlotForge's own). About adds PlotForge's paragraphs to the shell's dialog; Licenses lists the shared works (forge-shell and Electron) and the GPL; the fonts are credited in `NOTICE.md` (`source/app/about.ts`) | | always | | enabled |

`checkShortcuts` reports nothing for the whole registry on macOS and Windows (`tests/app/interface.test.ts`).

| Group | Buttons | Tooltip text |
|---|---|---|
| History | Undo, Redo | `Undo (Cmd + Z)`, `Redo (Shift + Cmd + Z)` |
| View | Zoom out, Zoom in, Fit | With their standard shortcuts |
| App | Select (`UI_ICONS.pointer`), Region flyout (Rectangle, Ellipse, Polygon, Freehand, Line; domain icons by `toolIcon`), Crop | `Select (V)`, `Region: Rectangle (R)`, `Crop (C)`; the mode label reads `Draw rectangle. Press Esc to finish`, `Draw crop area. Press Esc to finish` |
| App | Import image… (`UI_ICONS.import`), Export image… (`UI_ICONS.export`) | `Import image… (Shift + Cmd + I)`, `Export image… (Shift + Cmd + E)` |

## 7. Terminal

The catalogue is `source/app/commands.ts`: the shell's shared commands for the standard actions PlotForge has (`sharedCommands`, run by `runSharedCommand`), then PlotForge's own. Shared: File `new open recent save close autosave settings` (`settings [page]`: general, images, export, terminal, updates); Edit `undo redo`; View `fit zoom panel inspector theme font`; Help `about version changes shortcuts licenses`; Console `help history clear`. Shared verbs of document tabs: File `tabs tab` (`consoleTabCommand`). PlotForge's own: File `import export` (`export [png | jpeg [quality]]`); Edit `select`; View `snap`; Document `data` (`list`, `info [number]`, `select <number>`, `move <number> <x> <y>`, `size <number> <width> <height>`, `columns [number]`, `names`, `name <cells> [name|=cell]`, `header off`, `delimiter auto|comma|tab|semicolon|bar`, `decimal auto|point|comma`, `skip <rows>`, `sheet <name>`, `range <cells>|all`, `remove <number>`), `image` (`list`, `info [number]`, `rename <number> <name>`, `remove <number>`), `measure`, `results` (`results`, `remove <number>`, `clear`, `export`), `threshold` (`threshold`, `manual <low> <high>`, `otsu|mean|li [objects]`, `mask`, `mask erode|dilate|open|close [iterations]`, `mask outline|fill`, `mask remove <number>`, `mask clear`, `off`), `roi` (`list`, `info <number>`, `add rectangle|ellipse <x> <y> <width> <height>`, `add polygon <x> <y> <x> <y> <x> <y> [<x> <y>...]`, `add line <x> <y> <x> <y>`, `crop <number>`, `fill <number> [value]`, `clear <number> [value]`, `remove <number>`), `step` (`list`, `add <type> [<value>...]`, `set <number> <parameter> <value>`, `on <number>`, `off <number>`, `move <number> <position>`, `remove <number>`; `help step add` lists the types and values) `pixel <x> <y>`, `display` (`display`, `lut <name>`, `range <min> <max>`, `auto`, `reset`), `histogram [bins]`, `profile` and `peak <from> <to>`. `calibrate` (`calibrate`, `<pixels> <length> <unit>`, `scale <length> <unit>`, `line <number> <length> <unit>`, `aspect <ratio>`, `pixels`, `follow`, and `default` with `[<pixels> <length> <unit>]`, `scale`, `aspect` or `none` for the document's default). `step`, `pixel` and the image forms of `calibrate` act on the one selected image and answer `Select one image first.` otherwise. None are cancellable, and output is lines or a numbered table. Help groups follow the menus: File, Edit, View, Document, Help, Console.

Aliases accepted and not listed in help: `<command> -h`, `--help`, `?`.

Welcome-state commands and their completion choices: the shared commands that need no document, and `tabs`; other verbs answer `Open a document first.` and are not completed.

## 8. Messages

| Event | Kind | Text | Object link | Standing key |
|---|---|---|---|---|
| Files dropped that are not documents or images | Error | `Cannot open notes.docx. Drop a .pfg, .png, .jpg, .jpeg, .tif or .tiff file.` (the shell's drop target, "Drop images or a .pfg document to open them.", shows while files are over the window) | | |
| Image added | Info | `Added cells.png, 480 × 320 px.` | none yet | |
| File not readable as an image | Error | `Couldn't add a.tif: TIFF JPEG is not supported.` | | |
| Linked image missing on open | Warning | `cells.png is missing from /path.` | | |
| Linked image changed since added (CRC-32) | Warning | `cells.png changed since it was added. The new version is shown.` | | |
| Browser preview cannot read links | Warning | `cells.png is not shown: the browser preview cannot read linked files.` | | |
| Document cannot open | Error | `Couldn't open a.pfg: The document was made by a newer PlotForge (format 2). Update PlotForge to open it.` | | |
| Invalid placement value | Error | `Invalid X position. Enter a whole number of pixels.` | | |
| Step added or removed (menu, inspector) | Info | `Added Levels to grad16.`, `Removed Crop from grad16.` | | |
| A step cannot run (logged once until it can run again) | Warning | `Levels (step 3 of grad16) is passed over. Levels takes values from 0 to 65535 on this image.` | | image, step and reason |
| Calibration set (inspector) | Info | `grad16 is calibrated: 200 px = 10 µm.`, `The document's default calibration is 200 px = 50 µm.` | | |
| Invalid calibration value | Error | `Invalid real length. Enter a number above 0.` | | |
| Region added or removed | Info | `Added Rectangle 1 to grad16.`, `Removed Line 1 from grad16.` | | |
| Images exported | Info | `Exported grad16 to grad16.png.`, `Exported 3 images to results.`; in the browser `Downloaded grad16.png.` | | |
| Image copied | Info | `Copied grad16 as it is shown.` | | |
| Export or copy failed | Error | `Couldn't export: grad16.png is an original image of the document; originals are never written.` | | |
| Invalid step parameter | Error | `Invalid gamma. Enter a number above 0.` | | |

## 9. Persistence

Each value is of one kind of the shell's GUIDELINES-TERMINAL.md (Where a value appears and what Undo covers).

| Value | Kind | Stored in |
|---|---|---|
| Shell preferences, autosave choice; the app layers: export settings, image settings, default calibration (only values that differ from the built-in ones), set in Settings (General, Images, Export, Terminal) | Application preferences | Preferences |
| Recovery drafts of documents with unsaved work (`hasUnsavedWork`), the update preferences of Settings › Updates (`plotforge.updates`) | Application preferences | Application storage, not preferences |
| Images, positions, names, linked file facts (format, size, depth, colour, bytes, CRC-32), each image's steps, calibration, regions, threshold (never its mask) and settings overrides, the results table, the document's default calibration | Document content (undoable) | The document |
| Snap to grid, grid spacing | Document options: they mark the document dirty, and Undo neither records nor reverts them | The document |
| Zoom and pan, selection, undo history, inspector folds, the current step of each image, the selected region, the current tool, Show mask, the masks, the per-export overrides, the pixel readout | Session state | Nothing |
| Export…, Copy, Measure, Crop to region, Auto and Reset (display), Copy values | Actions | Nothing |

One surface per value: Settings › Images and Plots hold the app's defaults of new work, and Settings › Export how Export… writes images and plots: General (If the file exists, JPEG quality, shared by both), Images (Format, Include overlays), Calibration bar (Place, Style, Length, Blocks, Size) and Plots (Format, Resolution) (application preferences), and the inspector's Limit to threshold is the selected image's own (document content). Each is a separate value, stored in one place.

## 10. Verification

| View or flow | How to reach it | What to confirm |
|---|---|---|
| Welcome | Launch | Dot grid, New and Open, help lists the welcome set only |
| Image document | Drop or open a PNG, JPEG or TIFF | New `Untitled n`, image fitted at 100% or less, inspector Image section |
| Selection | Click, box, Shift, Cmd, Esc | Cyan outlines, inspector follows |
| Move and snap | Drag, arrows, Option | Positions on 16 px steps; free with Option |
| Undo | Cmd+Z after move, remove, rename; toggle Snap to grid | Each edit is one step and Snap to grid is none; the dirty mark clears at the saved state |
| Reopen | Save, close, open | Relative paths resolve; missing file shows the placeholder and a warning |
| Tabs | Drag a tab | A drop line, and the tab lands where it was dropped |
| Recovery | Edit, then reload the preview without saving | The restore dialog lists the document; Restore reopens it, dirty |
| Pixel readout | Hover an image | The status bar shows `x, y px` and `Grey v` (or `R G B`) of the result of the steps; nothing outside an image |
| Calibration | The inspector's Calibration section, `calibrate` | Pixel size and Size follow the scale and the quarter turns; the readout adds the real position; grey values and the image do not change |
| Thresholds | The Threshold step's parameters, Document › Threshold, `threshold`, `phase`, `step add threshold` and `step add mask` | Otsu, Mean and Li match the reference; light and dark masks cover the image once; sliders draw live and make one undo step; a colour image offers Convert to grey |
| Regions | The Region tools, `roi` | Each type draws, lists, selects, moves and undoes; areas, pixels and lengths follow the calibration |
| Export | The Export section, File › Export image…, `export` | One image opens a Save dialog; several go to a folder with free names; an original is refused |
| Steps | Document › Add step, the inspector, `step` | The image redraws at once; disabling a step shows the result without it; a slider drag is one undo step; a step that cannot run shows a warning icon and one Messages warning |

Platform checks: macOS packaged app, Windows automated build and launch.
