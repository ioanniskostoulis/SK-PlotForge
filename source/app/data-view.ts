// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Data files in the interface: each is a worksheet on the work surface, as a workbook window in Origin (its title, the
// headings with designations, the Long Name and Units rows, its rows and a workbook's sheet tabs) on a translucent panel, and the inspector's
// Data mode (the file, how it is read, its named ranges, the chosen column and its placement). The file is read-only,
// shown as it is: columns by letter, rows by number. Names of its cells, read options and placement are the document's.
import { createRow } from "forge-shell/app/builders";
import { drawIcon } from "forge-shell/app/canvas-icons";
import { roleFont } from "forge-shell/app/fonts";
import { setTip } from "forge-shell/app/tips";
import { createUnitField } from "forge-shell/app/unit-field";
import {
  columnLetters, headingText, ROWS_TOP, SHEET, tabLayout, sheetAxes, scrollAlong,
  columnTitle, DATA_EXTENSIONS, formatDate, DATA_FORMAT_LABELS, DELIMITER_NAMES, DELIMITERS, formatMeasure, parseRangeInput, cellsText,
  type DataColumn, type NamedRange, type DataTable, type DataReadOptions, type DecimalMark, type Delimiter, type LoadedData, type ProjectData,
  type SheetSelection,
} from "../engine";
import { selectField } from "./settings-view";
import { crisp, drawAcrylic } from "./crisp";
import { renderPlacement } from "./placement-view";

/** The raw deflate of an .xlsx archive, by the platform's DecompressionStream. */
export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const DATA_ACCEPT = DATA_EXTENSIONS.map((extension) => `.${extension}`).join(",");

/**
 * A data file in the session: being read, read (its bytes kept, so that a change of how it is read needs no new read
 * of the file, and its table for the read options and column settings in `key`), missing, or unreadable. A file that
 * was read but cannot be read with the chosen options (a sheet that is gone) keeps its bytes and says why.
 */
export type DataState =
  | { kind: "loading" }
  | { kind: "ready"; bytes: Uint8Array; key: string; loaded: LoadedData }
  | { kind: "missing" }
  | { kind: "unreadable"; reason: string; bytes?: Uint8Array; key?: string };

/** What a table is made from: the read options and column settings; a different key means the table is made again. */
export function tableKey(data: ProjectData): string {
  return JSON.stringify([data.read, data.columns]);
}

/**
 * The selected data file: the column the inspector shows (by key; the column last pressed) and the cells chosen in
 * the sheet (whole columns, rows or blocks), which a new plot takes.
 */
export interface DataSelection { id: string; column: string | null; cells: SheetSelection | null }

export const STATUS_TEXT = (state: DataState | undefined): string =>
  state?.kind === "missing" ? "Missing" : state?.kind === "unreadable" ? "Unreadable" : state?.kind === "loading" || !state ? "Loading" : "Linked, read-only";

// MARK: the worksheet on the work surface

/** The colours a sheet is drawn in, read from the theme's tokens once per frame. */
export interface SheetColours { panel: string; well: string; control: string; text: string; textStrong: string; text2: string; text3: string; line: string; hairline: string; accent: string; accentLight: string; pick: string }

export function sheetColours(): SheetColours {
  const body = getComputedStyle(document.body);
  const read = (name: string) => body.getPropertyValue(name).trim();
  return {
    panel: read("--panel"), well: read("--well"), control: read("--control"), text: read("--text"), textStrong: read("--text-strong") || read("--text"),
    text2: read("--text2"), text3: read("--text3"), line: read("--separator"), hairline: read("--hairline"), accent: read("--accent"), accentLight: read("--accent-light") || read("--accent"), pick: read("--pick"),
  };
}

/** Text cut to a width, with an ellipsis. */
function fitText(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let low = 0, high = text.length;
  while (low < high) { const mid = (low + high + 1) >> 1; if (ctx.measureText(`${text.slice(0, mid)}…`).width <= width) low = mid; else high = mid - 1; }
  return `${text.slice(0, low)}…`;
}

/** Corner radius of a worksheet: square, as the images and plots beside it on the work surface. */
const SHEET_RADIUS = 0;
/**
 * The sheet's material: the menus' blur (`drawAcrylic`) under the well colour at 70 %, more see-through than a menu so
 * that the canvas shows through; its bars (title, label rows, tabs) a little denser, its heading band denser still.
 */
const SHEET_TINT = 0.7, BAR_TINT = 0.5, HEADER_TINT = 0.85;
/** The menus' border: `--text` at 14 %. */
const EDGE_ALPHA = 0.14;
/** Every other data row a shade lighter, in `--control`. */
const BAND_ALPHA = 0.3;
/** The chosen cells: `--pick` washed over them and over their headings, and a border this many screen pixels wide. */
const PICK_WASH = 0.16, PICK_HEADING = 0.3, PICK_BORDER = 1;

/**
 * A selected plot's source cells, outlined on their sheet in a colour of their own, as Excel outlines a chart's data:
 * X ranges in one colour, each series' Y in the next, its error bars' cells dashed in the Y's colour.
 */
export interface SheetHighlight { column: string; rows: { first: number; last: number } | null; colour: string; dashed: boolean }
/**
 * Source outlines: their wash and width in screen pixels. They lie on the cells' grid lines, as Excel's do, so two
 * ranges side by side share the line between them, and the chosen cells' border is drawn over them.
 */
const SOURCE_WASH = 0.08, SOURCE_BORDER = 1;

/** Fill a box with a colour at an opacity. */
function fillAlpha(ctx: CanvasRenderingContext2D, colour: string, alpha: number, x: number, y: number, width: number, height: number): void {
  if (width <= 0 || height <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

/**
 * Draw a worksheet in content pixels (the context already carries the view's zoom; `scale` is that zoom): the
 * translucent material (what is behind it blurred, under the well colour), the title bar with the name and the
 * re-read mark, the heading band in the control grey (the column letters bold with Origin's designations across the
 * top, the row numbers in tabular figures down the left, both ending with the last row), the Long Name and Units rows
 * on the bar colour, banded rows from the scroll position (which may fall between rows and columns, for a smooth
 * scroll), and a workbook's sheet tabs. The chosen cells are washed in
 * the pick colour (cyan) with a 2 px border per block, their heading cells and row numbers washed too. Lines fall on
 * whole device pixels. A file that is not read shows why.
 */
export function drawSheet(ctx: CanvasRenderingContext2D, link: ProjectData, state: DataState | undefined, scroll: { row: number; column: number }, chosen: SheetSelection | null, colours: SheetColours, scale: number, highlights: readonly SheetHighlight[] = [], hoverTab: number | null = null): void {
  const { x, y, width, height } = link;
  const pad = SHEET.pad;
  const loaded = state?.kind === "ready" ? state.loaded : null;
  const tabs = link.source.format === "xlsx" ? loaded?.sheets ?? [] : [];
  const font = (bold = false, size: number = SHEET.font) => roleFont("ui", size, bold ? 600 : 400);
  const figures = (size: number = SHEET.font - 1) => roleFont("mono", size);
  drawAcrylic(ctx, link, SHEET_RADIUS, colours.well, SHEET_TINT);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, SHEET_RADIUS);
  ctx.clip();
  ctx.textBaseline = "middle";
  const line = crisp(ctx, 1 / scale);
  // Title bar on the bar colour: the name alone (the file and its state are the inspector's); the re-read mark at the right.
  fillAlpha(ctx, colours.panel, BAR_TINT, x, y, width, SHEET.title);
  ctx.font = font(true);
  ctx.fillStyle = colours.textStrong;
  ctx.fillText(fitText(ctx, link.name, width - SHEET.title - 2 * pad), x + pad, y + SHEET.title / 2);
  // The re-read mark is the shared refresh icon, drawn as its button draws it.
  const mark = SHEET.font + 2;
  drawIcon(ctx, "refresh", x + width - SHEET.title / 2 - mark / 2, y + SHEET.title / 2 - mark / 2, mark, colours.text2);
  if (!loaded) {
    const text = state?.kind === "missing" ? `${link.file} is missing` : state?.kind === "unreadable" ? `Couldn't read ${link.file}: ${state.reason}` : `Reading ${link.file}…`;
    ctx.font = font();
    ctx.fillStyle = colours.text3;
    ctx.textAlign = "center";
    ctx.fillText(fitText(ctx, text, width - 2 * pad), x + width / 2, y + (height + SHEET.title) / 2);
    ctx.restore();
    strokeFrame(ctx, link, colours, scale);
    return;
  }
  const { table } = loaded;
  const top = y + SHEET.title;
  const bottom = y + height - (tabs.length ? SHEET.tabs : 0);
  const rowsTop = y + ROWS_TOP;
  const cellsLeft = x + SHEET.rowHeader, right = x + width;
  // The scroll is fractional, so that it moves smoothly: a row's and a column's place follow it to the pixel, and the
  // parts that scroll are clipped to their own area (rows below the headings, columns right of the numbers).
  // A workbook's columns keep their widths and its hidden rows and columns take no room (sheet-layout's axes).
  const axes = sheetAxes(table), rowBase = axes.rows.at(scroll.row), columnBase = axes.columns.at(scroll.column);
  const rowY = (row: number) => rowsTop + axes.rows.at(row) - rowBase;
  const cellLeft = (column: number) => cellsLeft + axes.columns.at(column) - columnBase;
  const rowHeight = (row: number) => axes.rows.size(row), columnWidth = (column: number) => axes.columns.size(column);
  const banded = (row: number) => axes.rows.order(row) % 2 === 1;
  const shownRows: number[] = [], hiddenRowEdges: number[] = [];
  for (let row = Math.max(0, Math.floor(scroll.row)); row < table.rows && rowY(row) < bottom; row++) {
    if (rowHeight(row) > 0) shownRows.push(row);
    else if (row === 0 || rowHeight(row - 1) > 0) hiddenRowEdges.push(rowY(row));
  }
  const shownColumns: number[] = [], hiddenColumnEdges: number[] = [];
  for (let index = Math.max(0, Math.floor(scroll.column)); index < table.columns.length && cellLeft(index) < right; index++) {
    if (columnWidth(index) > 0) shownColumns.push(index);
    else if (index === 0 || columnWidth(index - 1) > 0) hiddenColumnEdges.push(cellLeft(index));
  }
  const rowsBottom = Math.max(rowsTop, Math.min(rowY(table.rows), bottom));
  const columnsRight = Math.max(cellsLeft, Math.min(cellLeft(table.columns.length), right));
  const clipped = (left: number, upper: number, rightEdge: number, lower: number, draw: () => void) => {
    if (rightEdge <= left || lower <= upper) return;
    ctx.save(); ctx.beginPath(); ctx.rect(left, upper, rightEdge - left, lower - upper); ctx.clip(); draw(); ctx.restore();
  };
  /** A block's outline on its grid lines, kept whole inside the cells' area where it meets the headings or an edge. */
  const onGrid = (pen: { width: number; x(value: number): number; y(value: number): number }, box: { left: number; right: number; upper: number; lower: number }) => {
    const inside = pen.width / 2;
    return {
      left: Math.max(pen.x(box.left), cellsLeft + inside), rightEdge: Math.min(pen.x(box.right), columnsRight - inside),
      upper: Math.max(pen.y(box.upper), rowsTop + inside), lower: Math.min(pen.y(box.lower), rowsBottom - inside),
    };
  };
  const ranges = chosen?.ranges ?? [];
  const columnChosen = (index: number) => ranges.some((range) => range.c0 <= index && index <= range.c1);
  const rowChosen = (row: number) => ranges.some((range) => range.rows !== null && range.rows.first <= row && row <= range.rows.last);
  // The heading band in the control grey: the letters' row across the top and the numbers' column down the left to the
  // last row, as a spreadsheet has; the file's own rows follow straight under the letters.
  fillAlpha(ctx, colours.control, HEADER_TINT, x, top, width, SHEET.heading);
  clipped(x, rowsTop, cellsLeft, rowsBottom, () => fillAlpha(ctx, colours.control, HEADER_TINT, x, rowsTop, SHEET.rowHeader, rowsBottom - rowsTop));
  // The cells: banded rows (every other one a shade lighter), the chosen cells washed in the pick colour, and the values.
  const blocks = ranges.map((range) => ({
    left: cellLeft(range.c0), right: cellLeft(range.c1 + 1),
    upper: range.rows ? rowY(range.rows.first) : rowY(0), lower: range.rows ? rowY(range.rows.last + 1) : rowY(table.rows),
  }));
  // Merged cells (a workbook's Merge Cells) are drawn as one: banded as their first row, without the lines inside them,
  // their first cell's text centred across them.
  const merges = table.merges, inMerge = (row: number, column: number) => merges.find((m) => m.r0 <= row && row <= m.r1 && m.c0 <= column && column <= m.c1);
  const mergeBox = (m: { r0: number; c0: number; r1: number; c1: number }) => ({ left: cellLeft(m.c0), right: cellLeft(m.c1 + 1), upper: rowY(m.r0), lower: rowY(m.r1 + 1) });
  const tall = merges.filter((m) => m.r1 > m.r0);
  clipped(cellsLeft, rowsTop, right, bottom, () => {
    for (const row of shownRows) {
      if (!banded(row)) continue;
      // The band across the row, broken where a merge of several rows takes it.
      let from = cellsLeft;
      for (const box of tall.filter((m) => m.r0 <= row && row <= m.r1).map(mergeBox).sort((a, b) => a.left - b.left)) {
        fillAlpha(ctx, colours.control, BAND_ALPHA, from, rowY(row), box.left - from, rowHeight(row));
        from = Math.max(from, box.right);
      }
      fillAlpha(ctx, colours.control, BAND_ALPHA, from, rowY(row), right - from, rowHeight(row));
    }
    for (const m of tall) if (banded(m.r0)) { const box = mergeBox(m); fillAlpha(ctx, colours.control, BAND_ALPHA, box.left, box.upper, box.right - box.left, box.lower - box.upper); }
    for (const block of blocks) fillAlpha(ctx, colours.pick, PICK_WASH, block.left, block.upper, block.right - block.left, block.lower - block.upper);
    for (const index of shownColumns) {
      const column = table.columns[index], left = cellLeft(index);
      ctx.fillStyle = column.role === "ignored" ? colours.text3 : colours.text;
      // Each cell is set by what it holds, as a spreadsheet does: numbers and dates right in figures, text left.
      for (const row of shownRows) {
        const text = column.text[row];
        if (!text || inMerge(row, index)) continue;
        const numeric = column.values[row] !== null;
        ctx.textAlign = numeric ? "right" : "left";
        ctx.font = numeric ? figures(SHEET.font) : font();
        const cellWidth = columnWidth(index);
        ctx.fillText(fitText(ctx, text, cellWidth - 2 * pad), numeric ? left + cellWidth - pad : left + pad, rowY(row) + SHEET.row / 2);
      }
    }
    // A merged block's text, from its first cell, centred across it and on its rows, as Merge and Center sets it.
    for (const m of merges) {
      const column = table.columns[m.c0], text = column?.text[m.r0];
      if (!text) continue;
      const box = mergeBox(m);
      if (box.right < cellsLeft || box.left > right || box.lower < rowsTop || box.upper > bottom) continue;
      const numeric = column.values[m.r0] !== null;
      ctx.font = numeric ? figures(SHEET.font) : font();
      ctx.textAlign = "center";
      ctx.fillStyle = colours.text;
      ctx.fillText(fitText(ctx, text, box.right - box.left - 2 * pad), (box.left + box.right) / 2, (box.upper + box.lower) / 2);
    }
    ctx.textAlign = "left";
  });
  // The headings that scroll sideways: each column's letters (bold, with its designation).
  clipped(cellsLeft, top, right, rowsTop, () => {
    for (const index of shownColumns) if (columnChosen(index)) fillAlpha(ctx, colours.pick, PICK_HEADING, cellLeft(index), top, columnWidth(index), SHEET.heading);
    for (const index of shownColumns) {
      const left = cellLeft(index), column = table.columns[index], ignored = column.role === "ignored";
      const letters = columnLetters(index), designation = headingText(letters, column.role).slice(letters.length);
      ctx.font = font(true);
      const lettersWidth = ctx.measureText(letters).width;
      ctx.font = font(false, SHEET.font - 1);
      const designationWidth = ctx.measureText(designation).width;
      // Centred; a column too narrow for its heading shows it from its left edge, cut there.
      const start = left + Math.max(SHEET.headerPad / 2, (columnWidth(index) - lettersWidth - designationWidth) / 2);
      clipped(left, top, left + columnWidth(index), rowsTop, () => {
        ctx.font = font(true);
        ctx.fillStyle = ignored ? colours.text3 : colours.textStrong;
        ctx.fillText(letters, start, top + SHEET.heading / 2);
        ctx.font = font(false, SHEET.font - 1);
        ctx.fillStyle = ignored ? colours.text3 : columnChosen(index) ? colours.text : colours.text2;
        ctx.fillText(designation, start + lettersWidth, top + SHEET.heading / 2);
      });
    }
  });
  // The row numbers that scroll up and down, in tabular figures, right-aligned; a chosen row's washed.
  clipped(x, rowsTop, cellsLeft, rowsBottom, () => {
    for (const row of shownRows) if (rowChosen(row)) fillAlpha(ctx, colours.pick, PICK_HEADING, x, rowY(row), SHEET.rowHeader, rowHeight(row));
    ctx.font = figures();
    ctx.textAlign = "right";
    for (const row of shownRows) {
      ctx.fillStyle = rowChosen(row) ? colours.textStrong : colours.text;
      ctx.fillText(String(row + 1), cellsLeft - SHEET.headerPad, rowY(row) + SHEET.row / 2);
    }
    ctx.textAlign = "left";
  });
  // Lines on whole device pixels: the heading band's inner edges in the separator colour, which sets it apart from
  // the cells; columns (down to the last row) as hairlines; rows by banding alone.
  ctx.lineWidth = line.width;
  ctx.strokeStyle = colours.line;
  ctx.beginPath();
  for (const edge of [top, rowsTop]) { ctx.moveTo(x, line.y(edge)); ctx.lineTo(right, line.y(edge)); }
  ctx.moveTo(line.x(cellsLeft), top); ctx.lineTo(line.x(cellsLeft), rowsBottom);
  // Where columns or rows are hidden, a double line in the headings, as a spreadsheet marks them.
  const gap = 1.5 / scale;
  for (const edge of hiddenColumnEdges) {
    if (edge <= cellsLeft || edge >= right) continue;
    for (const side of [-gap, gap]) { ctx.moveTo(line.x(edge + side), top); ctx.lineTo(line.x(edge + side), rowsTop); }
  }
  for (const edge of hiddenRowEdges) {
    if (edge <= rowsTop || edge >= rowsBottom) continue;
    for (const side of [-gap, gap]) { ctx.moveTo(x, line.y(edge + side)); ctx.lineTo(cellsLeft, line.y(edge + side)); }
  }
  ctx.stroke();
  ctx.strokeStyle = colours.hairline;
  ctx.beginPath();
  for (const index of shownColumns) {
    const edge = cellLeft(index + 1);
    if (edge <= cellsLeft || edge >= right) continue;
    // The line through the headings, then down the cells, broken where a merged block spans this edge.
    ctx.moveTo(line.x(edge), top); ctx.lineTo(line.x(edge), rowsTop);
    let from = rowsTop;
    for (const box of merges.filter((m) => m.c0 <= index && index < m.c1).map(mergeBox).sort((a, b) => a.upper - b.upper)) {
      const upper = Math.max(rowsTop, box.upper), lower = Math.min(rowsBottom, box.lower);
      if (upper > from) { ctx.moveTo(line.x(edge), from); ctx.lineTo(line.x(edge), upper); }
      from = Math.max(from, lower);
    }
    if (rowsBottom > from) { ctx.moveTo(line.x(edge), from); ctx.lineTo(line.x(edge), rowsBottom); }
  }
  ctx.stroke();
  // A selected plot's source cells, each outlined and lightly washed in its colour, inside the cells.
  const sources = highlights.flatMap((item) => {
    const index = table.columns.findIndex((column) => column.key === item.column);
    if (index < 0) return [];
    const first = item.rows ? item.rows.first : 0, last = item.rows ? Math.min(item.rows.last, table.rows - 1) : table.rows - 1;
    return last < first ? [] : [{ ...item, left: cellLeft(index), right: cellLeft(index + 1), upper: rowY(first), lower: rowY(last + 1) }];
  });
  if (sources.length) clipped(cellsLeft, rowsTop, columnsRight, rowsBottom, () => {
    const border = crisp(ctx, SOURCE_BORDER / scale);
    ctx.lineWidth = border.width;
    for (const item of sources) {
      fillAlpha(ctx, item.colour, SOURCE_WASH, item.left, item.upper, item.right - item.left, item.lower - item.upper);
      const { left, rightEdge, upper, lower } = onGrid(border, item);
      if (rightEdge <= left || lower <= upper) continue;
      ctx.strokeStyle = item.colour;
      ctx.setLineDash(item.dashed ? [3 / scale, 2 / scale] : []);
      ctx.strokeRect(left, upper, rightEdge - left, lower - upper);
    }
    ctx.setLineDash([]);
  });
  // Each chosen block's border in the pick colour, 1 screen pixel on its grid lines, over any source outline; cut where it scrolls out.
  if (blocks.length) clipped(cellsLeft, rowsTop, columnsRight, rowsBottom, () => {
    const border = crisp(ctx, PICK_BORDER / scale);
    ctx.strokeStyle = colours.pick;
    ctx.lineWidth = border.width;
    ctx.beginPath();
    for (const block of blocks) {
      // On the grid lines, as the cells' own lines are, one screen pixel wide.
      const { left, rightEdge, upper, lower } = onGrid(border, block);
      if (rightEdge > left && lower > upper) ctx.rect(left, upper, rightEdge - left, lower - upper);
    }
    ctx.stroke();
  });
  ctx.lineWidth = line.width;
  // A workbook's sheet tabs on the bar colour, as the shell's bottom tabs (GUIDELINES-TABS-MENUS, Bottom tabs): every
  // label in the strong weight, the one read in --text with a 2 px --accent-light line along its bottom edge, the one
  // under the pointer in --text2, the rest in --text3. A sheet's name keeps its own case, as the workbook writes it.
  if (tabs.length) {
    fillAlpha(ctx, colours.panel, BAR_TINT, x, bottom, width, SHEET.tabs);
    const places = tabLayout(tabs, width);
    tabs.forEach((sheet, index) => {
      const tab = places[index].width, left = x + places[index].left;
      const current = sheet === loaded.sheet;
      if (current) fillAlpha(ctx, colours.accentLight, 1, left, bottom + SHEET.tabs - 2, tab, 2);
      ctx.fillStyle = current ? colours.text : hoverTab === index ? colours.text2 : colours.text3;
      ctx.font = font(true, SHEET.font - 1);
      ctx.textAlign = "center";
      ctx.fillText(fitText(ctx, sheet, tab - 2 * pad), left + tab / 2, bottom + SHEET.tabs / 2);
    });
    ctx.textAlign = "left";
    ctx.strokeStyle = colours.line;
    ctx.beginPath(); ctx.moveTo(x, line.y(bottom)); ctx.lineTo(right, line.y(bottom)); ctx.stroke();
  }
  // The resize grip: two short diagonals in the corner.
  ctx.strokeStyle = colours.text3;
  ctx.lineWidth = 1 / scale;
  ctx.beginPath();
  for (const inset of [5, 10]) { ctx.moveTo(x + width - inset, y + height - 3); ctx.lineTo(x + width - 3, y + height - inset); }
  ctx.stroke();
  ctx.restore();
  strokeFrame(ctx, link, colours, scale);
}

/** The worksheet's outline, one device pixel inside its edge, as the menus' border: `--text` at 14 %. */
function strokeFrame(ctx: CanvasRenderingContext2D, box: { x: number; y: number; width: number; height: number }, colours: SheetColours, scale: number): void {
  ctx.save();
  const line = crisp(ctx, 1 / scale);
  ctx.globalAlpha = EDGE_ALPHA;
  ctx.strokeStyle = colours.text;
  ctx.lineWidth = line.width;
  ctx.beginPath();
  ctx.roundRect(line.x(box.x), line.y(box.y), line.x(box.x + box.width) - line.x(box.x) - line.width, line.y(box.y + box.height) - line.y(box.y) - line.width, SHEET_RADIUS);
  ctx.stroke();
  ctx.restore();
}

/**
 * The scroll of a sheet, moved by a travel in content pixels and kept within its rows and columns, in fractions of a
 * row and a column, so that it moves smoothly: at the end the last row sits on the bottom edge and the last column on
 * the right edge. Hidden rows and columns are passed over; a workbook's wide column takes its width of travel.
 */
export function clampScroll(link: ProjectData, state: DataState | undefined, scroll: { row: number; column: number }, travel: { x: number; y: number } = { x: 0, y: 0 }): { row: number; column: number } {
  const loaded = state?.kind === "ready" ? state.loaded : null;
  if (!loaded) return { row: 0, column: 0 };
  const tabs = link.source.format === "xlsx" && loaded.sheets.length > 0;
  const axes = sheetAxes(loaded.table);
  return {
    row: scrollAlong(axes.rows, scroll.row, travel.y, link.height - ROWS_TOP - (tabs ? SHEET.tabs : 0)),
    column: scrollAlong(axes.columns, scroll.column, travel.x, link.width - SHEET.rowHeader),
  };
}

// MARK: the inspector's Data mode

export interface DataSectionsHost {
  section(title: string, key: "subject" | "reading" | "columns" | "column" | "placement"): HTMLElement;
  nameRow(name: string, rename: { current(): string; validate(next: string): string | null; apply(next: string): void }): HTMLElement;
  setRead(id: string, patch: Partial<DataReadOptions>): void;
  /** Choose the cells of a named range in its worksheet. */
  selectName(name: NamedRange): void;
  rename(id: string, name: string): void;
  report(text: string, kind: "info" | "error"): void;
  fileSize(bytes: number): string;
  place(id: string, box: Partial<{ x: number; y: number; width: number; height: number }>): void;
  /** The worksheet's action row (new plots of its columns), first in its section. */
  actions(table: DataTable | null): HTMLElement;
}

const DECIMAL_NAMES: Record<DecimalMark, string> = { ".": "Point", ",": "Comma" };

/** The Data section, Reading, Columns and, with a column chosen, Column. */
export function renderDataSections(host: DataSectionsHost, link: ProjectData, others: readonly ProjectData[], state: DataState | undefined, column: string | null, names: readonly NamedRange[]): void {
  const loaded = state?.kind === "ready" ? state.loaded : null;
  const name = host.nameRow(link.name, {
    current: () => link.name,
    validate: (next) => (others.some((other) => other !== link && other.name.toLowerCase() === next.trim().toLowerCase()) ? `The name ${next.trim()} is already used.` : null),
    apply: (next) => host.rename(link.id, next.trim()),
  });
  const file = createRow("File", link.file);
  setTip(file, link.path ? `Read-only: shown as it is at ${link.path}, never written. Name its cells to label them in plots.` : "Read-only: shown as it is, never written; the browser preview gives no folder.");
  const status = createRow("Status", STATUS_TEXT(state));
  if (state?.kind === "unreadable") setTip(status, state.reason);
  host.section("Worksheet", "subject").append(host.actions(loaded?.table ?? null), name, file, status,
    createRow("Format", DATA_FORMAT_LABELS[link.source.format]),
    createRow("Rows", loaded ? loaded.table.rows.toLocaleString("en") : "—"),
    createRow("Columns", loaded ? String(loaded.table.columns.length) : "—"),
    createRow("File size", host.fileSize(link.source.bytes)));
  renderReading(host, link, state);
  if (!loaded) return;
  const own = names.filter((name) => name.data === link.id);
  if (own.length) {
    const section = host.section("Names", "columns");
    for (const name of own) {
      const row = createRow(name.unit ? `${name.name} (${name.unit})` : name.name, cellsText(name, loaded.table));
      row.classList.add("data-column-row");
      row.tabIndex = 0;
      setTip(row, `${name.name} names ${cellsText(name, loaded.table)}. Select it to choose those cells.`);
      row.addEventListener("click", () => host.selectName(name));
      row.addEventListener("keydown", (event) => { if (event.key === "Enter") host.selectName(name); });
      section.append(row);
    }
  }
  const chosen = loaded.table.columns.find((item) => item.key === column);
  if (chosen) renderColumn(host, link, chosen, loaded.table);
  renderSheetPlacement(host, link);
}

/** Where the worksheet sits and how big it is; folded, as for an image. */
function renderSheetPlacement(host: DataSectionsHost, link: ProjectData): void {
  renderPlacement(host.section("Placement", "placement"), {
    noun: "the worksheet", box: link, min: { width: SHEET.minWidth, height: SHEET.minHeight },
    apply: (key, value) => host.place(link.id, { [key]: value }), report: (message) => host.report(message, "error"),
  });
}

function renderReading(host: DataSectionsHost, link: ProjectData, state: DataState | undefined): void {
  const section = host.section("Reading", "reading");
  const loaded = state?.kind === "ready" ? state.loaded : null;
  const read = link.read;
  if (link.source.format === "xlsx") {
    const sheets = loaded?.sheets ?? (read.sheet ? [read.sheet] : []);
    const first = sheets[0] ?? "";
    if (sheets.length) {
      section.append(selectField("Sheet", sheets.map((sheet) => [sheet, sheet] as const), read.sheet ?? first,
        (sheet) => host.setRead(link.id, { sheet: sheet === first && read.sheet === null ? null : sheet, range: null })));
    }
    const range = createRow("Range", read.range ?? "All", document, {
      current: () => read.range ?? "", label: "Cell range",
      validate: (next) => { try { parseRangeInput(next); return null; } catch (error) { return (error as Error).message; } },
      apply: (next) => host.setRead(link.id, { range: parseRangeInput(next) }),
      onError: (message) => host.report(message, "error"),
    });
    setTip(range, "The cells to read, as B2:F40; empty reads every used cell.");
    section.append(range);
  } else {
    const delimiter = read.delimiter ?? loaded?.delimiter ?? null;
    section.append(selectField<"auto" | Delimiter>("Delimiter",
      [["auto", `Auto${loaded?.delimiter && read.delimiter === null ? ` (${loaded.delimiter === "\t" ? "tab" : loaded.delimiter})` : ""}`], ...DELIMITERS.map((item) => [item, DELIMITER_NAMES[item]] as const)],
      read.delimiter ?? "auto", (next) => host.setRead(link.id, { delimiter: next === "auto" ? null : next })));
    section.append(selectField<"auto" | DecimalMark>("Decimal mark",
      [["auto", `Auto${loaded?.decimal && read.decimal === null ? ` (${loaded.decimal})` : ""}`], ...(Object.keys(DECIMAL_NAMES) as DecimalMark[]).map((item) => [item, DECIMAL_NAMES[item]] as const)],
      read.decimal ?? "auto", (next) => host.setRead(link.id, { decimal: next === "auto" ? null : next }), delimiter === ","));
    if (loaded?.encoding) section.append(createRow("Encoding", loaded.encoding));
  }
  // The file is shown as it is: no row is a header. An older document that had one, set or guessed, can be read as it is.
  if (read.header !== false) {
    const header = selectField<"keep" | "no">("Header", [["keep", read.header === null ? "Guessed" : "First row"], ["no", "None (as it is)"]], "keep", (next) => { if (next === "no") host.setRead(link.id, { header: false }); });
    setTip(header, "This document is from before files were shown as they are. None shows the file as it is: columns by letter, every row a row.");
    section.append(header);
  }
  const skip = createUnitField({
    label: "Skip rows", unit: "", value: read.skipRows, format: (value) => String(value),
    parse: (text) => (/^\s*\d+\s*$/.test(text) ? Number(text) : NaN),
    apply: (value) => host.setRead(link.id, { skipRows: value }),
    reportError: (message) => host.report(message, "error"), invalidMessage: "Invalid number of rows. Enter a whole number from 0.",
  });
  setTip(skip.row, "Rows to leave out at the top; blank rows at the top hold nothing and are left out.");
  section.append(skip.row);
}

/** The chosen column, by its letter: what was read in it. */
function renderColumn(host: DataSectionsHost, link: ProjectData, column: DataColumn, table: DataTable): void {
  const section = host.section(`Column ${columnLetters(table.columns.indexOf(column))}`, "column");
  const kind = { number: "Numbers", date: "Dates", text: "Text", empty: "Empty" }[column.kind];
  const stat = (value: number | null) => (value === null ? "—" : column.kind === "date" ? formatDate(value) : formatMeasure(value));
  section.append(createRow("Kind", kind));
  if (column.stats.count) {
    const { stats } = column;
    section.append(createRow("Count", String(stats.count)), createRow("Missing", String(stats.missing)),
      createRow("Min", stat(stats.min)), createRow("Max", stat(stats.max)));
    if (column.kind !== "date") section.append(createRow("Mean", stat(stats.mean)), createRow("SD", stat(stats.sd)));
  }
}
