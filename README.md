# PlotForge

PlotForge (SK PlotForge) is a workspace for plotting data and analysing images: worksheets, plots and images side by side on one work surface, saved in a document that links to its files.

It runs on macOS, Windows and the browser. The work surface is a dot grid and the document is a `.pfg` file; the original images and data files are read-only and never changed. Plots follow the look of report charts made in Excel, and image analysis follows the steps of ImageJ, each kept as an editable step rather than baked into the pixels.

## Capabilities

| Area | Content |
|---|---|
| Worksheets | CSV, TSV, TXT, DAT and Excel `.xlsx` files open as read-only worksheets, shown as Excel shows them: number formats, dates and times, merged cells, column widths and hidden rows and columns. Cells are chosen as in a spreadsheet, named with a unit, and copied as tab-separated text. |
| Plots | Scatter, Line, Line + symbol and Column plots, made from chosen cells or from the toolbar, with left and right Y axes, top and bottom X axes, linear or log scales, minor ticks, error bars, data labels, callouts, a legend and category axes for text X values. Series and points are chosen on the plot and right-clicked for their own options; the inspector holds the plot's general settings. |
| Fits | Linear, polynomial, exponential, power and logarithmic regressions, moving average and Savitzky–Golay smoothing, and nonlinear least-squares models: exponential decay, Gaussian, Lorentzian, pseudo-Voigt, multiple Gaussian peaks, Boltzmann, logistic (4PL, 5PL) and Michaelis–Menten. Each fit reports its parameters with standard errors and 95% intervals, R², adjusted R², SSE and RMSE, and is fitted again when its cells change. |
| Templates and batches | A plot's look is saved as a template and applied to other plots or set for new ones. Batch plotting makes the same plot from every chosen worksheet. |
| Images | PNG, JPEG and TIFF (8 or 16 bits, grey, RGB or a palette; uncompressed, PackBits, LZW or Deflate). A JPEG is turned upright by its EXIF orientation. |
| Image steps | Convert to grey or 8-bit, crop, rotate, flip, canvas size and translate, levels, invert, filters and image maths, threshold into named phases (manual or automatic methods), and mask operations (erode, dilate, open, close, outline, fill holes, skeletonize). Steps can be reordered, turned off or removed. |
| Measurements | Regions (rectangle, ellipse, polygon, freehand, line), calibration by a known length, area, area fraction, grey values, centroid, perimeter, shape descriptors and optical density, collected in a results table. Histograms, line profiles and peak areas. |
| Export | Plots as PNG, JPEG (at a chosen resolution) or SVG; images as PNG or JPEG, with or without overlays; the results table as CSV. |
| Terminal | A command console for the same operations. The command `help` lists the commands. |

## Terminal

The Terminal takes the operations of the menus and the inspector, so that work can be typed or repeated. `help <command>` shows a command's forms and an example.

| Command | Purpose |
|---|---|
| `data`, `plot`, `image`, `step`, `roi`, `phase`, `label` | List, inspect, select, rename, move, resize and remove items, plus each one's own subcommands (`plot new scatter`, `plot series 1 kind column`, `step add crop`) |
| `fit` | Add fits, list models, set starting values, hold or free parameters, weights, ranges, residuals and the equation on the plot |
| `calibrate`, `threshold`, `measure`, `density`, `results` | Calibration, thresholds, measurements, optical density and the results table |
| `histogram`, `profile`, `peaks`, `peak`, `pixel`, `xy`, `display` | Look into an image's values and how it is drawn |
| `import`, `export`, `select`, `snap`, `scalebar`, `rename`, `tabs`, `tab` | Files, selection and the work surface |
| `settings list`, `settings <key> [<value>]` | Every preference of Settings |

## Documents

A `.pfg` document is a JSON file that holds the work surface: the linked images with their steps and calibrations, the linked data files with their read options and named ranges, the plots with their axes, series and fits, and the place and size of every object. Image and data paths are stored relative to the document's folder, with each file's size and checksum, so that a moved or changed original is reported when the document opens. Older documents open and are saved in the current format.

## Installation

Each release carries two unsigned installers.

| Platform | File | Notes |
|---|---|---|
| macOS | `SK-PlotForge-v<version>.dmg` | The first launch requires a right click and **Open**. |
| Windows x64 | `SK-PlotForge-v<version>.exe` | The SK Forge setup installs for all users in `C:\Program Files\SK Forge\SK PlotForge` and requests administrator rights. SmartScreen may require **More info** and **Run anyway**. |

The installed application reads its latest release in Settings › Updates; it does not check at launch.

## Building and testing

| Command | Purpose |
|---|---|
| `npm install` | Installs the dependencies and the version hook |
| `npm start` | Builds and runs the desktop application |
| `npm run web` | Serves the browser preview on `http://127.0.0.1:4278/` |
| `npm run checks` | Runs the typecheck, the engine tests, the interface tests and the shell check, as CI does |
| `npm run dist` | Packages the macOS disk image; on Windows, the unpacked application and the setup |

The browser preview has no file access beyond the files given to it, so Save and linked originals need the desktop application. Each commit raises the patch version in `VERSION`, `package.json` and the lockfile. A push to `main` builds both installers and publishes them to the release `v<version>`, whose notes are the version's section of `CHANGELOG.md`.

## Project layout

| Path | Content |
|---|---|
| `source/engine` | The domain, free of the interface: file readers (TIFF, PNG, XLSX, delimited text), image steps and thresholds, regions and measurements, number formats, plots and their layout, fits and the document format |
| `source/app` | The interface: the work surface, worksheets, plots, the inspector, Settings and the Terminal's commands |
| `source/desktop` | The Electron main process |
| `source/forge-shell-<version>.tgz` | The pinned `forge-shell` package, the shared frame of menus, tabs, Terminal, dialogs and Settings |
| `tests/engine`, `tests/app` | Engine and interface tests, with sample files in `tests/fixtures` |
| `scripts` | Build, test, packaging and release scripts |
| `documentation` | The documents below |

## Documentation

| Document | Content |
|---|---|
| [Interface profile](documentation/INTERFACE.md) | The product and domain choices within the forge-shell guidelines |
| [Image analysis](documentation/IMAGE-ANALYSIS.md) | Image types, steps, thresholds, measurements and export |
| [Inspector layout](documentation/INSPECTOR-LAYOUT.md) | The inspector's modes and sections |
| [Development](documentation/DEVELOPMENT.md) | Building, checking and releasing |
| [Changelog](CHANGELOG.md) | The changes of each version |
| [Notice](NOTICE.md) | Borrowed work, licences and credits |

## Licence

PlotForge is part of the SK Forge family of apps designed and directed by Ioannis Kostoulis. It is licensed under the GNU General Public License, version 2 or, at the option of the user, any later version ([LICENSE](LICENSE)). Each build includes the licence texts and the corresponding source. The PlotForge and SK PlotForge names, logo and icon are not granted by it. [NOTICE.md](NOTICE.md) records the works PlotForge uses; Help › About and Help › Licenses show the same credits in the app.
