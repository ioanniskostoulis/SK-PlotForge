// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Electron main process: the windows (documents open as tabs inside them), the native menu bar, file dialogs and
// recent documents. Original images are read and never written. This process writes a .pfg document the user chose in
// a Save dialog, and exports through the shell's export IPC (`registerExportIpc`), never onto an original or a project
// file. The interface is the same web app as the browser version, served from the app:// protocol.
import { app, BrowserWindow, clipboard, ClipboardItem, dialog, ipcMain, Menu, type MenuItemConstructorOptions, nativeTheme, net, protocol, screen, shell } from "electron";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { OpenedFile } from "forge-shell/desktop/bridge";
import type { MenuNode } from "forge-shell/app/menus";
import { createNativeMenuTemplate } from "forge-shell/desktop/native-menu";
import { DesktopWindowState } from "forge-shell/desktop/window-state";
import { forwardFullScreen } from "forge-shell/desktop/full-screen";
import { DARK_WINDOW_BACKGROUND, registerTitleBarIpc, usesNativeMenu, windowChrome } from "forge-shell/desktop/title-bar";
import { documentArguments, readOpenedFiles, WriteApprovals } from "forge-shell/desktop/files";
import { registerShellMainIpc } from "forge-shell/desktop/ipc-main";
import { registerUpdater } from "forge-shell/desktop/updater";
import { pinSettingsFolder } from "forge-shell/desktop/settings-folder";
import { sharedSettingsArgument } from "forge-shell/desktop/shared-settings-file";
import { openSplash, SPLASH_STEPS, type SplashElectron, type SplashHandle } from "forge-shell/desktop/splash";
import config from "../../forge.config.json";
import { registerExportIpc } from "forge-shell/desktop/export-main";
import { DATA_EXTENSIONS, EXPORT_FORMAT_LIST, IMAGE_EXTENSIONS, isDataPath, isImagePath, isWritableProjectPath } from "../engine";
import { CHANNELS, type ChosenFile } from "./plotforge-bridge";

const isMac = process.platform === "darwin";
const devUrl = !app.isPackaged ? process.env.FORGE_DEV_URL : undefined;
pinSettingsFolder(app, config.identity.name, !!devUrl);
/** Root of the bundled files: build/ in development, resources/app.asar/build when packaged. */
const buildRoot = join(__dirname, "..");
const extension = config.document.extension;
const DOCUMENT_FILE = new RegExp(`\\.${extension}$`, "i");

const windows = new DesktopWindowState<OpenedFile>();
/** The document files each window opened or chose to save as, and so may write. */
const writes = new WriteApprovals((path) => DOCUMENT_FILE.test(path));
/** Every image and data file this process has read: an export never replaces one of them. */
const readImages = new Set<string>();
let pendingOpen: string[] = [];

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function readFiles(paths: string[]): OpenedFile[] {
  return readOpenedFiles(paths, (path) => readFileSync(path, "utf8"),
    (path, error) => dialog.showErrorBox(`Can't open ${config.document.noun}`, `${path}\n${error.message}`));
}

/** Open files as tabs in the frontmost window, or in a new window when there is none. */
function openFiles(paths: string[]): void {
  const files = readFiles(paths);
  if (!files.length) return;
  for (const file of files) app.addRecentDocument(file.path);
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (win) {
    win.webContents.send("openFiles", writes.opened(win.webContents.id, files));
    if (win.isMinimized()) win.restore();
    win.focus();
  } else openWindow(files);
}

/** The splash, until the first window takes over from it. */
let splash: SplashHandle | null = null;

function openWindow(files: OpenedFile[] = []): void {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 600,
    backgroundColor: DARK_WINDOW_BACKGROUND,
    title: config.identity.name,
    ...windowChrome(process.platform),
    show: false,
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: false,
      // The settings every installed child app shares (forge-shell shared-settings-file).
      additionalArguments: [sharedSettingsArgument(app.getPath("appData"), !!devUrl)] },
  });
  const id = win.webContents.id;
  splash?.follow(win);
  windows.setStartupFiles(id, writes.opened(id, files));
  // The first window is shown by the splash once the 史 is written; later windows show when ready.
  win.once("ready-to-show", () => {
    const first = splash;
    splash = null;
    if (first) void first.handOff(win); else win.show();
  });
  forwardFullScreen(win);
  // Unsaved documents: the window asks in its own prompt (save the chosen ones, discard or cancel).
  win.on("close", (event) => {
    if (!windows.needsClosePrompt(id)) return;
    event.preventDefault();
    win.webContents.send("closeRequest");
  });
  win.on("closed", () => {
    writes.forget(id);
    exportIpc.forget(id);
    if (windows.closed(id, BrowserWindow.getAllWindows().length)) app.quit();
  });
  // Links (the About window's credits) open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: "deny" }; });
  win.loadURL(`${devUrl ?? `app://${config.identity.id}`}/index.html`);
  // A launch capture, used by the desktop smoke checks.
  const capture = process.env.FORGE_CAPTURE;
  if (capture) {
    win.webContents.once("did-finish-load", () => setTimeout(async () => {
      try {
        const image = await win.webContents.capturePage();
        // Publish only the complete PNG: CI polls for its existence before opening it.
        writeFileSync(`${capture}.tmp`, image.toPNG());
        renameSync(`${capture}.tmp`, capture);
        console.log(`capture: wrote ${capture}`);
      } catch (error) { console.error(`capture: ${String(error)}`); }
    }, Number(process.env.FORGE_CAPTURE_DELAY ?? 5000)));
  }
}

// MARK: native menu from the renderer's menu definition

function installMenu(nodes: MenuNode[]): void {
  // Windows draws the menus in the page; no native menu bar is installed.
  if (!usesNativeMenu(process.platform)) { Menu.setApplicationMenu(null); return; }
  const template = createNativeMenuTemplate(nodes, {
    productName: config.identity.productName, isMac, isPackaged: app.isPackaged,
    onCommand: (id, win) => (win as BrowserWindow | undefined)?.webContents.send("command", id),
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template as MenuItemConstructorOptions[]));
}

// MARK: IPC

registerShellMainIpc(ipcMain, {
  windows,
  windowFor: (event) => BrowserWindow.fromWebContents(event.sender as Electron.WebContents),
  focusedWindow: () => BrowserWindow.getFocusedWindow(),
  installMenu,
  newWindow: () => openWindow(),
  canWriteFile: (event, path) => isWritableProjectPath(path) && writes.allows(event.sender.id, path),
  writeFile: (path, text) => writeFile(path, text, "utf8"),
  addRecentDocument: (path) => app.addRecentDocument(path),
});
// One-click updates from the releases of the repository named in the profile (Settings › Updates).
const { repository }: { repository?: string } = config.identity;
if (repository && app.isPackaged) registerUpdater(ipcMain, { repository, executable: process.execPath, platform: process.platform, quit: () => app.quit(), hasUnsavedWork: () => windows.hasEdited(), openPath: (path) => shell.openPath(path) });
// The colours of the Windows window controls follow the page's appearance.
registerTitleBarIpc(ipcMain, (event) => BrowserWindow.fromWebContents(event.sender as Electron.WebContents));
ipcMain.handle("openFileDialog", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const result = await dialog.showOpenDialog(win, {
    title: `Open ${config.document.noun}`,
    filters: [{ name: config.desktop.document.name, extensions: [extension] }],
    properties: ["openFile", "multiSelections"],
  });
  return result.canceled ? [] : readFiles(result.filePaths);
});
// PlotForge's own calls: images are read-only, and only files with an image extension are read.
const IMAGE_FILTER = { name: "Images", extensions: [...IMAGE_EXTENSIONS] };
ipcMain.handle(CHANNELS.readImage, async (_event, path: string) => {
  if (typeof path !== "string" || !isImagePath(path)) throw new Error("Only PNG, JPEG and TIFF images are read.");
  const bytes = new Uint8Array(await readFile(path));
  readImages.add(resolve(path));
  return bytes;
});
// Data files are read-only too, and only files with a data extension are read.
const DATA_FILTER = { name: "Data", extensions: [...DATA_EXTENSIONS] };
ipcMain.handle(CHANNELS.readData, async (_event, path: string) => {
  if (typeof path !== "string" || !isDataPath(path)) throw new Error("Only CSV, text and Excel data files are read.");
  const bytes = new Uint8Array(await readFile(path));
  readImages.add(resolve(path));
  return bytes;
});
ipcMain.handle(CHANNELS.readDocument, async (event, path: string) => {
  if (typeof path !== "string" || !DOCUMENT_FILE.test(path)) throw new Error(`Only .${extension} documents are read here.`);
  const text = await readFile(path, "utf8");
  writes.allow(event.sender.id, [path]);
  app.addRecentDocument(path);
  return text;
});
ipcMain.handle(CHANNELS.openDialog, async (event): Promise<ChosenFile[]> => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const result = await dialog.showOpenDialog(win, {
    title: "Open",
    filters: [{ name: `${config.desktop.document.name}s, images and data`, extensions: [extension, ...IMAGE_EXTENSIONS, ...DATA_EXTENSIONS] }, { name: config.desktop.document.name, extensions: [extension] }, IMAGE_FILTER, DATA_FILTER],
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled) return [];
  const documents = new Map(writes.opened(event.sender.id, readFiles(result.filePaths.filter((path) => DOCUMENT_FILE.test(path)))).map((file) => [file.path, file.text]));
  return result.filePaths.flatMap((path) => (DOCUMENT_FILE.test(path) ? (documents.has(path) ? [{ path, text: documents.get(path) }] : []) : isImagePath(path) || isDataPath(path) ? [{ path }] : []));
});
ipcMain.handle(CHANNELS.importDialog, async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const result = await dialog.showOpenDialog(win, { title: "Import", filters: [{ name: "Images and data", extensions: [...IMAGE_EXTENSIONS, ...DATA_EXTENSIONS] }, IMAGE_FILTER, DATA_FILTER], properties: ["openFile", "multiSelections"] });
  return result.canceled ? [] : result.filePaths.filter((path) => isImagePath(path) || isDataPath(path));
});
ipcMain.handle("saveDialog", async (event, defaultName: string) => {
  const win = BrowserWindow.fromWebContents(event.sender)!;
  const result = await dialog.showSaveDialog(win, { title: `Save ${config.document.noun}`, defaultPath: defaultName, filters: [{ name: config.desktop.document.name, extensions: [extension] }] });
  if (result.canceled || !result.filePath) return null;
  const path = DOCUMENT_FILE.test(result.filePath) ? result.filePath : `${result.filePath}.${extension}`;
  writes.allow(event.sender.id, [path]);
  return path;
});

// Exports: PNG, JPEG and CSV through the shell's export dialog, folder dialog and guarded binary writes (shell 5.0.0);
// an export never writes a project file, an image this process has read, or an original the page names.
const exportIpc = registerExportIpc(ipcMain, {
  formats: EXPORT_FORMAT_LIST,
  ignoreCase: process.platform !== "linux",
  protectedPaths: () => [...readImages],
  saveDialog: async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender as Electron.WebContents);
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    return result.canceled || !result.filePath ? null : result.filePath;
  },
  folderDialog: async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender as Electron.WebContents);
    const settings = { ...options, properties: ["openDirectory", "createDirectory"] as ("openDirectory" | "createDirectory")[] };
    const result = win ? await dialog.showOpenDialog(win, settings) : await dialog.showOpenDialog(settings);
    return result.canceled ? null : result.filePaths[0] ?? null;
  },
  readdir: (folder) => readdir(folder),
  writeFile: (path, bytes, flag) => writeFile(path, bytes, { flag }),
  resolve: (path) => resolve(path),
  dirname: (path) => dirname(path),
});
ipcMain.handle(CHANNELS.copyImage, async (_event, bytes: Uint8Array) => {
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error("The image could not be copied.");
  await clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes as BlobPart], { type: "image/png" }) })]);
});

// MARK: app lifecycle

/** Document files among command-line arguments. */
function argFiles(argv: string[], cwd = process.cwd()): string[] {
  return documentArguments(argv, cwd, (path) => DOCUMENT_FILE.test(path), resolve, existsSync);
}

// One instance: a second launch (opening a file from the command line) adds tabs here.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", (_event, argv, cwd) => {
  const files = argFiles(argv.slice(1), cwd);
  if (files.length) openFiles(files);
  else BrowserWindow.getAllWindows()[0]?.focus();
});
// macOS: files opened from Finder, before or after launch.
app.on("open-file", (event, path) => {
  event.preventDefault();
  if (app.isReady()) openFiles([path]);
  else pendingOpen.push(path);
});
app.whenReady().then(() => {
  splash = openSplash({ BrowserWindow, ipcMain, screen, dark: nativeTheme.shouldUseDarkColors } as unknown as SplashElectron, buildRoot);
  protocol.handle("app", (request) => net.fetch(pathToFileURL(join(buildRoot, "app", decodeURIComponent(new URL(request.url).pathname))).toString()));
  // Windows and Linux: files passed on the command line.
  const files = [...pendingOpen, ...argFiles(process.argv.slice(app.isPackaged ? 1 : 2))];
  pendingOpen = [];
  if (files.length) splash.status(SPLASH_STEPS.opening(files.length));
  openWindow(readFiles(files));
});
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) openWindow(); });
app.on("before-quit", () => windows.beginQuit());
app.on("window-all-closed", () => { if (!isMac) app.quit(); });
