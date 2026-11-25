// Licensed under the GNU General Public License v2 or later. See LICENSE.
// CRC-32 (the polynomial of PNG and ZIP, reflected 0xEDB88320). A project records the checksum of each image it links
// to, so that a changed or replaced original can be recognised, and the tests use it to show an original is unchanged.

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of the bytes, as eight lowercase hexadecimal digits. */
export function crc32(bytes: Uint8Array): string {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}
