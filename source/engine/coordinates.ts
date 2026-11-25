// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Save XY coordinates (roadmap I26): every pixel of a working image, or of a region's mask, as a CSV row of its
// position and value. Positions are whole pixels from the top-left corner, y running down, as the pixel readout gives
// them; a grey image has one value column, a colour image red, green and blue. Pixels a Canvas step added are left out.
import { withinImage, type Raster } from "./raster";

/** The most pixels written at once; a larger image is exported a region at a time. */
export const MAX_XY_PIXELS = 5_000_000;

/** The pixels a region covers (the whole image without one), or a sentence when there are none or too many. */
export function xyProblem(raster: Raster, region: Uint8Array | null): string | null {
  region = withinImage(raster, region);
  let n = raster.widthPx * raster.heightPx;
  if (region) { n = 0; for (const inside of region) n += inside; }
  if (!n) return "The region covers no pixel centre.";
  if (n > MAX_XY_PIXELS) return `That is ${n.toLocaleString("en")} pixels, more than ${MAX_XY_PIXELS.toLocaleString("en")}. Select a smaller region.`;
  return null;
}

/** The pixels as CSV: a header, then one row per pixel in reading order, each line ending in CR LF. */
export function xyCoordinatesCsv(raster: Raster, region: Uint8Array | null): { csv: string; pixels: number } {
  const { widthPx: W, heightPx: H, channels: c, data } = raster;
  // Pixels a Canvas step added around the image are not written.
  region = withinImage(raster, region);
  const lines = [c === 1 ? "X,Y,Value" : "X,Y,Red,Green,Blue"];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (region && !region[i]) continue;
      lines.push(c === 1 ? `${x},${y},${data[i]}` : `${x},${y},${data[3 * i]},${data[3 * i + 1]},${data[3 * i + 2]}`);
    }
  }
  return { csv: lines.join("\r\n") + "\r\n", pixels: lines.length - 1 };
}
