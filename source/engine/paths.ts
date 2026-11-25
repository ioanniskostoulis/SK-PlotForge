// Licensed under the GNU General Public License v2 or later. See LICENSE.
// File paths of a project. A document stores the paths of its images relative to its own folder, written with forward
// slashes on every platform, so that a project folder can be moved or copied with its images and still open.

const DRIVE = /^[A-Za-z]:[\\/]/;

/** Is the path absolute (a POSIX root, a Windows drive or a network share)? */
export function isAbsolute(path: string): boolean {
  return path.startsWith("/") || DRIVE.test(path) || path.startsWith("\\\\");
}

const windowsStyle = (path: string) => DRIVE.test(path) || path.startsWith("\\\\");
const segments = (path: string) => path.split(/[\\/]+/).filter((part) => part !== "" && part !== ".");

/** The folder that holds a file. */
export function dirname(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut <= 0 ? (cut === 0 ? path[0] : ".") : path.slice(0, cut);
}

/** The file name at the end of a path. */
export function basename(path: string): string {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}

/** The file name without its last extension. */
export function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * The path of `target` as seen from the folder `fromDir`, with forward slashes. A target on another drive cannot be
 * reached by a relative path, so its absolute path is kept.
 */
export function relativePath(fromDir: string, target: string): string {
  const from = segments(fromDir), to = segments(target);
  const windows = windowsStyle(fromDir) || windowsStyle(target);
  const same = (a: string, b: string) => (windows ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (windows && !same(from[0] ?? "", to[0] ?? "")) return target;
  let common = 0;
  while (common < from.length && common < to.length && same(from[common], to[common])) common++;
  const up = from.slice(common).map(() => "..");
  return [...up, ...to.slice(common)].join("/") || ".";
}

/** An absolute path from a stored path: a relative one is joined to `fromDir` and its `..` steps are resolved. */
export function resolvePath(fromDir: string, stored: string): string {
  if (isAbsolute(stored)) return stored;
  const windows = windowsStyle(fromDir);
  const parts = segments(fromDir);
  for (const part of segments(stored)) {
    if (part === "..") { if (parts.length > (windows ? 1 : 0)) parts.pop(); }
    else parts.push(part);
  }
  if (windows) return parts.join("\\");
  return `${fromDir.startsWith("/") ? "/" : ""}${parts.join("/")}`;
}
