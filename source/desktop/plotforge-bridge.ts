// Licensed under the GNU General Public License v2 or later. See LICENSE.
// PlotForge's own desktop calls, beside the shell's bridge (`window.forge`), which also exports (shell 5.0.0). Original
// images are only ever read; nothing here writes a file.

/** A file chosen in the Open dialog: a document comes with its text, an image or data file with its path only. */
export interface ChosenFile { path: string; text?: string }

export interface PlotForgeBridge {
  /** The bytes of an image file, read-only. Rejects a path without a PNG, JPEG or TIFF extension. */
  readImage(path: string): Promise<Uint8Array>;
  /** The bytes of a data file (CSV and other text, Excel), read-only. Rejects a path without a data extension. */
  readData(path: string): Promise<Uint8Array>;
  /** The text of a .pfg document, for Open recent. Rejects any other path. */
  readDocument(path: string): Promise<string>;
  /** Open dialog for documents and images. */
  openDialog(): Promise<ChosenFile[]>;
  /** Open dialog for images and data files, for File › Import…. */
  importDialog(): Promise<string[]>;
  /** Put a PNG image on the system clipboard. */
  copyImage(bytes: Uint8Array): Promise<void>;
}

export const CHANNELS = { readImage: "plotforge:readImage", readDocument: "plotforge:readDocument", openDialog: "plotforge:openDialog", importDialog: "plotforge:importDialog", readData: "plotforge:readData",
  copyImage: "plotforge:copyImage",
} as const;
