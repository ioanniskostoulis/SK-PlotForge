// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Crisp lines and the acrylic material on the work surface's canvas. Lines drawn in content pixels under the view's
// zoom land between device pixels and blur; `crisp` gives a line width of whole device pixels and positions that put
// such a line on them. `drawAcrylic` gives an object the translucent material of a floating panel: what is behind it
// blurred and tinted, with a soft shadow outside it; `drawObjectShadow` gives images and plots the same shadow.

/** A line width of whole device pixels near `width` (content px), and positions that land it on device pixels. */
export function crisp(ctx: CanvasRenderingContext2D, width: number): { width: number; x(value: number): number; y(value: number): number } {
  const m = ctx.getTransform();
  const sx = m.a || 1, sy = m.d || 1;
  const device = Math.max(1, Math.round(width * sx));
  const half = device % 2 ? 0.5 : 0;
  return {
    width: device / sx,
    x: (value) => (Math.round(sx * value + m.e - half) + half - m.e) / sx,
    y: (value) => (Math.round(sy * value + m.f - half) + half - m.f) / sy,
  };
}

/** Whether a CSS colour, as a hex code or in the rgb function notation, is dark. */
export function isDark(colour: string): boolean {
  let r = 0, g = 0, b = 0;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})/i.exec(colour.trim());
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(colour);
    if (rgb) [r, g, b] = rgb.slice(1, 4).map(Number);
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

type Box = { x: number; y: number; width: number; height: number };

/** Whether objects on the work surface cast shadows (Settings › General › Object shadows, `settings shadows`). */
let shadows = true;
export function setObjectShadows(on: boolean): void { shadows = on; }

/**
 * The shadow an object on the work surface casts, as a menu's (0 10 px 30 px, black at 50 % on a dark surface, 20 % on
 * a light one), outside its rounded box (content px under the context's transform) only, so that the object's own
 * pixels and any backdrop it reads stay clear of it. Screen pixels at any zoom. Never drawn into an export, which draws
 * its objects apart from the work surface. Nothing while Object shadows is off.
 */
export function drawObjectShadow(ctx: CanvasRenderingContext2D, box: Box, radius: number, dark: boolean): void {
  if (!shadows) return;
  const m = ctx.getTransform(), canvas = ctx.canvas, ratio = window.devicePixelRatio || 1;
  const dx = m.a * box.x + m.e, dy = m.d * box.y + m.f, dw = m.a * box.width, dh = m.d * box.height, r = radius * m.a;
  // The shadow reaches about its blur beyond the box, more below it.
  const reach = 40 * ratio;
  if (dx - reach > canvas.width || dy - reach > canvas.height || dx + dw + reach < 0 || dy + dh + reach < 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.roundRect(dx, dy, dw, dh, r);
  ctx.clip("evenodd");
  ctx.shadowColor = dark ? "#00000080" : "#00000033";
  ctx.shadowBlur = 30 * ratio;
  ctx.shadowOffsetY = 10 * ratio;
  // The fill is clipped away; only its shadow shows.
  ctx.fillStyle = ctx.shadowColor;
  ctx.beginPath();
  ctx.roundRect(dx, dy, dw, dh, r);
  ctx.fill();
  ctx.restore();
}

/**
 * The shell's menu material (`.menu-popup`) over a rounded box (content px under the context's transform): its shadow
 * (`drawObjectShadow`), then what is already drawn behind it blurred 24 px and saturated 1.6 times, under the tint at
 * `alpha` (a menu's is `--panel` at 90 %). The blur is screen pixels, as a menu's, at any zoom. The backdrop is read
 * from the canvas itself, so images and the grid behind a worksheet show through it as they do through a menu.
 */
export function drawAcrylic(ctx: CanvasRenderingContext2D, box: Box, radius: number, tint: string, alpha: number): void {
  const m = ctx.getTransform(), canvas = ctx.canvas, ratio = window.devicePixelRatio || 1;
  const dx = m.a * box.x + m.e, dy = m.d * box.y + m.f, dw = m.a * box.width, dh = m.d * box.height, r = radius * m.a;
  drawObjectShadow(ctx, box, radius, isDark(tint));
  if (dx > canvas.width || dy > canvas.height || dx + dw < 0 || dy + dh < 0) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.roundRect(dx, dy, dw, dh, r);
  ctx.clip();
  // The backdrop: the canvas under the box (and a margin, so that the blur's edge does not darken), blurred in place.
  const blur = 24 * ratio, margin = blur * 2;
  const sx = Math.max(0, Math.floor(dx - margin)), sy = Math.max(0, Math.floor(dy - margin));
  const sw = Math.min(canvas.width, Math.ceil(dx + dw + margin)) - sx, sh = Math.min(canvas.height, Math.ceil(dy + dh + margin)) - sy;
  if (sw > 0 && sh > 0) {
    ctx.filter = `blur(${blur}px) saturate(1.6)`;
    ctx.drawImage(canvas, sx, sy, sw, sh, sx, sy, sw, sh);
    ctx.filter = "none";
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = tint;
  ctx.fillRect(dx, dy, dw, dh);
  ctx.restore();
}
