// Licensed under the GNU General Public License v2 or later. See LICENSE.
// Electron preload: exposes `window.forge`, the shell's desktop bridge, and `window.plotforge`, PlotForge's own calls
// (reading images and data files, the Open and Import dialogs, copying an image).
import { contextBridge, ipcRenderer, webUtils } from "electron";
import { createDesktopBridge, type ForgeDesktopBridge } from "forge-shell/desktop/bridge";
import { createSharedSettingsFile, sharedSettingsPath } from "forge-shell/desktop/shared-settings-file";
import { CHANNELS, type ChosenFile, type PlotForgeBridge } from "./plotforge-bridge";

// Electron's webUtils gives the shell's bridge the paths of dropped files (`pathForFile`, shell 3.1.0); the settings
// every installed child app shares come from the file the main process passes (sharedSettingsArgument).
const sharedPath = sharedSettingsPath(process.argv);
const bridge: ForgeDesktopBridge<"pfg"> = createDesktopBridge<"pfg">(ipcRenderer, process.platform as ForgeDesktopBridge["platform"], require("../../package.json").version, webUtils,
  sharedPath ? createSharedSettingsFile(sharedPath) : undefined);

const plotforge: PlotForgeBridge = {
  readImage: (path) => ipcRenderer.invoke(CHANNELS.readImage, path) as Promise<Uint8Array>,
  readData: (path) => ipcRenderer.invoke(CHANNELS.readData, path) as Promise<Uint8Array>,
  readDocument: (path) => ipcRenderer.invoke(CHANNELS.readDocument, path) as Promise<string>,
  openDialog: () => ipcRenderer.invoke(CHANNELS.openDialog) as Promise<ChosenFile[]>,
  importDialog: () => ipcRenderer.invoke(CHANNELS.importDialog) as Promise<string[]>,
  copyImage: (bytes) => ipcRenderer.invoke(CHANNELS.copyImage, bytes) as Promise<void>,
};

contextBridge.exposeInMainWorld("forge", bridge);
contextBridge.exposeInMainWorld("plotforge", plotforge);
