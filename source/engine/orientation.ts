// Licensed under the GNU General Public License v2 or later. See LICENSE.
// EXIF orientation of JPEG files. A camera often stores the pixels as the sensor read them and adds a tag (0x0112,
// values 1 to 8) saying how to turn them upright. PlotForge turns the image upright on import and records the turn,
// so that a photo is shown as taken and its pixel coordinates can still be traced to the file. Decoders differ in
// whether they apply the tag themselves, so the decoder is given a copy of the file with the tag set to 1, and the
// turn is made here. The original's bytes are never changed.
import { flip, rotate } from "./steps";
import type { Raster } from "./raster";

// MARK: given values

const ORIENTATION_TAG = 0x0112;
/** Orientations 5 to 8 swap width and height. */
export const swapsSides = (orientation: number): boolean => orientation >= 5 && orientation <= 8;

interface OrientationEntry { orientation: number; valueAt: number; littleEndian: boolean }

/** The orientation tag of a JPEG's EXIF block, with where its value is stored; null when there is none. */
function findOrientation(bytes: Uint8Array): OrientationEntry | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1], length = view.getUint16(at + 2);
    if (marker === 0xda || marker === 0xd9) return null; // image data begins: no EXIF block before it
    // APP1 holding "Exif\0\0", then a TIFF header: byte order, 42, the first directory's offset.
    if (marker === 0xe1 && at + 10 + 8 <= bytes.length && String.fromCharCode(...bytes.subarray(at + 4, at + 8)) === "Exif") {
      const tiff = at + 10;
      const littleEndian = bytes[tiff] === 0x49;
      const u16 = (p: number) => view.getUint16(p, littleEndian), u32 = (p: number) => view.getUint32(p, littleEndian);
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > bytes.length) return null;
      for (let i = 0, n = u16(ifd); i < n; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > bytes.length) return null;
        if (u16(entry) === ORIENTATION_TAG) {
          const orientation = u16(entry + 8);
          return orientation >= 1 && orientation <= 8 ? { orientation, valueAt: entry + 8, littleEndian } : null;
        }
      }
      return null;
    }
    at += 2 + length;
  }
  return null;
}

/** The EXIF orientation of a JPEG file, 1 to 8; 1 (as stored) when it has none or is not a JPEG. */
export function jpegOrientation(bytes: Uint8Array): number {
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? findOrientation(bytes)?.orientation ?? 1 : 1;
}

/** A copy of a JPEG file with its orientation tag set to 1, so that any decoder gives the pixels as stored. */
export function storedOrientationCopy(bytes: Uint8Array): Uint8Array {
  const found = bytes[0] === 0xff && bytes[1] === 0xd8 ? findOrientation(bytes) : null;
  if (!found || found.orientation === 1) return bytes;
  const copy = bytes.slice();
  new DataView(copy.buffer).setUint16(found.valueAt, 1, found.littleEndian);
  return copy;
}

/**
 * Turn stored pixels upright by an EXIF orientation: 2 mirror, 3 half turn, 4 vertical mirror, 5 transpose
 * ((x, y) to (y, x)), 6 quarter turn clockwise, 7 transverse, 8 quarter turn counter-clockwise.
 */
export function orientRaster(raster: Raster, orientation: number): Raster {
  switch (orientation) {
    case 2: return flip(raster, "horizontal");
    case 3: return rotate(raster, 2);
    case 4: return flip(raster, "vertical");
    case 5: return flip(rotate(raster, 1), "horizontal");
    case 6: return rotate(raster, 1);
    case 7: return flip(rotate(raster, 3), "horizontal");
    case 8: return rotate(raster, 3);
    default: return raster;
  }
}
