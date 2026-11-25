# Image analysis

Status: decided 2026-11-07 for the image phase (roadmap Phase 5). Changes to these rules are recorded here with a date.

| Date | Change |
|---|---|
| 2026-11-07 | JPEG export may include overlays (owner): "include overlays" is a per-export choice for JPEG as for PNG; its app default stays off, as below |
| 2026-11-07 | The owner confirmed the implementation choices of milestones I2 to I4 as "academically correct and user friendly": crop coordinates in the pixels the step receives; levels and invert applied to each channel of an RGB image; calibration by a known length measured along x; regions in pixels of the result of the steps; copy as shown, export at full depth. A JPEG with an EXIF orientation is turned upright on import, and the turn is recorded like the other import conversions |

## Principles

| Principle | Rule |
|---|---|
| Originals are read-only | An imported image is never written to. Edits are a list of steps stored in the project |
| Pixels and units are separate | Calibration changes reported units only. It never changes pixel values, thresholds, masks or percentages |
| Every conversion is a step | Bit-depth and colour conversions appear in the step list, so a result can always be traced |
| Results are data | Every measurement goes to a results table that can be plotted like any dataset |

## Image types

| Input | Support | Notes |
|---|---|---|
| 8-bit grey | Full | Native analysis depth |
| 8-bit RGB (PNG, JPEG, TIFF) | Full | Converted to grey by a conversion step, or analysed per channel |
| 16-bit grey (TIFF, PNG) | Full | Kept at 16 bits for analysis. Thresholds are in 16-bit values. Scientific images often need this |
| Alpha channel | Ignored | Composited on white on import, and the step is recorded |

JPEG is lossy. The import records that, and the analysis warns that results depend on the compression.

## Step list

Steps run in order on a copy. Each step has a type, its parameters, and an enabled flag.

| Step | Parameters | Notes |
|---|---|---|
| Convert to grey | Method: luminance (Rec. 601 weights 0.299, 0.587, 0.114), channel R, G or B, or mean | Default luminance. Chosen explicitly, never silent |
| Convert to 8-bit | Mapping: min-max of the image, or a fixed range | Only when a later step needs 8-bit. Default: keep 16-bit |
| Crop | Rectangle | Pixel coordinates of the source |
| Rotate | 90 steps, or any angle with interpolation choice | Any angle interpolates, and the step says so |
| Flip | Horizontal or vertical | |
| Canvas (Canvas size, Translate) | Width, height, the image's position x and y, background value | The image placed at x, y (negative cuts it) on a canvas of the background value; Translate is a canvas of the image's own size. Regions move with the step when it is added |
| Levels | Black point, white point, gamma | Applied to grey values |
| Invert | None | |
| Background subtraction | Rolling-ball radius | Later tier |
| Threshold | Phases, each a name, a colour and a range or method | One per image. Grey steps before it, mask steps after it (Threshold as a step) |
| Mask: erode, dilate, open, close, outline, fill holes, skeletonize | Iterations and count (erode to close); every phase, or one phase | After the Threshold step only, on each phase's mask separately (Mask operations) |

Steps can be reordered, disabled or removed. Disabling a step shows the result without it, so a user can check each one.

## Thresholds

- **Input:** the grey working image, at its current bit depth.
- **Range:** a lower and an upper value, in the image's own values (0 to 255, or 0 to 65535).
- **Modes:** manual range; auto methods Otsu, Mean, Li, IsoData, Percentile, Triangle, Intermodes, Minimum, Moments, MaxEntropy, Yen, IJ IsoData (ImageJ's Default), Huang, MinError, RenyiEntropy and Shanbhag (defined at the head of each function in `source/engine/threshold.ts`); and objects dark or light on a light or dark background. Huang, MinError, RenyiEntropy, Shanbhag and the remaining Auto Threshold methods are not built.
- **Output:** a binary mask. The mask is part of the project, computed from the steps, and never written to disk unless exported.
- **Colour thresholds:** later. The first version thresholds grey values only, which keeps the mask definition clear.

## Percentages and areas

Definitions used everywhere in the app:

| Measure | Definition |
|---|---|
| Area fraction (%) | Masked pixels divided by the pixels of the region, times 100 |
| Region | A ROI, or the whole image when no ROI is set |
| Area | Masked pixel count times the pixel area in calibrated units |
| Mean, min, max grey | Over the region's pixels, in the image's own values |
| Centroid | Mean position of the masked pixels |
| Perimeter | Boundary length of the mask, in calibrated units |

The area fraction shows its definition in the inspector, so the number is never a black box.

## Colour and display

Three separate meanings, never mixed:

| Meaning | Where | Exported |
|---|---|---|
| Mask overlay colour | Display only. Default is a fixed colour from the palette. The user can choose it | Off by default |
| Pseudocolour lookup table | Display of grey values, such as a heat-map view | Off by default |
| ROI outline colour | Display only: each image's regions take the shell's overlay palette in order, by the picture's lightness | Off by default |

Overlay colours come from the shared palette. They avoid the magenta accent so the mask never reads as interface.

## Pasted images

An image pasted from the clipboard has no file of its own, so it is kept inside the `.pfg` (its bytes as base64, with the format, size and CRC-32 of any image). It is read-only like a linked original, and a copy whose checksum does not match is refused when the document opens. Pasted images make the document larger by about a third more than the image's own size.

## Filters, maths and editing steps

Filters, maths with a constant, contrast enhancement and Fill are steps like the others: they act on a copy, can be turned off, and are saved in the document. The exact definitions are at the head of `source/engine/filters.ts`, `arithmetic.ts` and `steps.ts`. Edge pixels repeat beyond the image; results are rounded and clipped to the depth's range. Rank filters use ImageJ's circular neighbourhood; Convolve applies its kernel as written. Despeckle is the 3 × 3 median; Remove bright (dark) outliers replaces a value more than the threshold above (below) its neighbourhood's median by that median.

### Threshold as a step (decided 2026-11-14, built 2026-11-14)

Threshold is a step in the step list. Its input is the grey working image at that point; its output is one binary mask per phase. With several phases, every step after it runs on each phase's mask separately and never mixes phases, as in multiphase analysis (ImageJ/Fiji, stereology): a morphological step on one phase never takes pixels from another, and each phase is measured on its own mask. Grey steps (filters, levels, maths) are placed before the Threshold step; after it only mask steps apply. Overlaps between phases are reported as today, never resolved by a later step.

- An image has one Threshold step; a second is passed over. A grey step placed after it, or a mask step before it, is passed over and says why. A new grey step is added before the Threshold step, a mask step at the end.
- The working image (what is drawn, read by the pixel readout, measured and exported) is the grey result before the Threshold step; the masks are drawn over it.
- A mask step acts on every phase's mask, each on its own, or on one phase's mask when it names that phase. A Threshold step that is off makes no masks, so every pixel is measured.
- Removing the last phase removes the Threshold step and the mask steps after it; removing a phase removes the mask steps that act on it alone.
- Documents from before the Threshold step, whose images carry `phases` (or, before phases, one `threshold`), open with a Threshold step at the end of the list and their mask operations as mask steps after it: one step on every phase when all phases had the same operations, else steps that name their phase. The masks are the same, so results rows and their mask checks stay valid (`source/engine/steps.ts`, `source/engine/project.ts`).

## Mask operations

Mask steps after the Threshold step run in order on each phase's mask: erode, dilate, open and close (with iterations and a neighbour count from 1 to 8, ImageJ's Binary Options count), outline, fill holes and skeletonize (Zhang and Suen's thinning; it can differ from ImageJ's lookup-table thinning by a pixel). Objects are 8-connected and the background 4-connected, and outside the image counts as background. A results row keeps its phase's threshold with the mask steps that acted on it as its operations, so it measures the same mask again (`source/engine/binary.ts`).

## Histogram and profile

The histogram counts grey values of the working image or a region in equal bins. A line profile samples once per pixel of length by bilinear interpolation between pixel centres; a rectangle is read as a gel lane, the mean across its short side along its long side. Peak area is the area above the straight baseline between two samples (`source/engine/profile.ts`).

## Display

Each image may have a lookup table and a display range, saved in the document. They change how the image is drawn and nothing else: values, measurements and data exports are unchanged (`source/engine/display.ts`).

## Calibration

- A calibration is per image. It holds a pixel length, a real length, a unit, and the pixel aspect ratio (default 1).
- Scale can also be set directly as units per pixel.
- The pixel length can be taken from a line region drawn over a scale bar; the calibration then follows the line until the line is removed.
- Calibration applies only to reported lengths, areas and perimeters. Changing it recalculates measurements. It never changes pixels, thresholds, steps or percentages.
- A default calibration can be set for the project, so a batch of images from one microscope needs one entry.
- With no calibration, measurements are in pixels, and the unit says so.

## Measurements

| Measurement | Unit | Default on |
|---|---|---|
| Area | calibrated unit squared, or px² | Yes |
| Area fraction | % | Yes |
| Mean grey | grey value | Yes |
| Min and max grey | grey value | No |
| Centroid X and Y | calibrated unit, or px | No |
| Perimeter | calibrated unit, or px | No |

The measurement set is chosen in the inspector, and the choice is saved with the project.

- The full set (roadmap I18) adds the standard deviation, modal and median grey, integrated density, centre of mass and mean optical density of the region's pixels, and the bounding rectangle, circularity, aspect ratio and roundness of the masked pixels; skewness and (excess) kurtosis of the region's grey values; the fitted ellipse (major and minor axes scaled to the area, and the major axis's angle counter-clockwise from x); and Feret's diameter (the longest caliper distance and its angle, and the narrowest, min Feret, on the convex hull of the masked pixels' squares). Definitions are at the head of `source/engine/measure.ts`.

## Results table

- Each measurement is a row, with the image, the ROI, the step list version and the calibration recorded beside it.
- The table is a dataset. It can be sorted, plotted, and exported as CSV.
- A row records the threshold and the mask settings it came from, so a result can be reproduced.

## Export

| Format | Rules |
|---|---|
| PNG | Default. Lossless. 8-bit or 16-bit, matching the working image |
| JPEG | 8-bit RGB only. Quality setting, default 90. Writes a lossy warning in Messages. Overlays excluded by default; "include overlays" adds them (decided 2026-11-07) |
| TIFF | Later. For 16-bit scientific output |

Export always writes the result of the enabled steps. Overlays (mask, ROI outlines) are added only when "include overlays" is on, and then they are part of the picture, not the data. What happens when the target exists follows the overwrite setting above. The original is never overwritten.

## Settings layers

The same layering as plot styling: app setting, then per-image or per-export override. The inspector lists every option with its value in effect, marks overrides, and offers "Reset to app setting" and "Reset all".

| Option | App setting | Per-image or per-export override |
|---|---|---|
| Grey conversion method | Luminance | Per image |
| Threshold mode | Otsu (Manual until 2026-11-14: a new phase now starts from a split the image itself gives) | Per image |
| Mask overlay colour | Palette colour | Per image |
| Default calibration | None (pixels) | Per image |
| Measurement set | Area, area fraction, mean grey | Per image |
| JPEG quality | 90 | Per export |
| Include overlays on export | Off | Per export |
| Overwrite behaviour on export | Ask | Per export |

**Overwrite behaviour** has three choices:

- **Ask:** when a name is taken in the chosen folder, the shell asks Replace, Keep both or Cancel. This is the default.
- **New name:** a taken name becomes a numbered one, such as `image-1.png`, and the existing file is kept.
- **Replace:** taken names are replaced after one confirmation.

The choice applies when several images go into a folder. One image goes through the export dialog, which itself asks before replacing a file. The rules are the shell's (`exportFiles`, `export-plan.ts`).

Originals are never overwritten, whatever the setting. That rule is not configurable.

## Opportunities built into the design

- **16-bit throughout:** most scientific cameras write 16-bit, and this design keeps their precision.
- **Results as a dataset:** measurements plot and fit with the same tools as any other data.
- **Reproducible results:** each row records its settings, so a result can be checked.
- **Batch later:** one step list and one threshold can be applied to a set of images, using the same rules.
- **Stacks later:** a time series or z-stack can reuse the step list.

## Out of scope for the first image milestone

- Watershed and particle analysis (colour thresholds and skeletonising were built after the first milestone).
- Macros and scripting.
- Stacks and batch processing.

These are recorded in the feature catalogue of the roadmap, so they can be added without changing the rules above.
