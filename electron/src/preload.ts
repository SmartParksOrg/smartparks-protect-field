/** What the interface may ask the shell: its version, the platform, to open a web link in the
 * system browser, to pick a folder in the system's dialog, to leave full screen, and to check,
 * download and install an update (decision D17); and the menu's commands, the full screen state
 * and the update's progress. Nothing else of Node or Electron reaches the page. */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("protectGo", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  getPlatform: (): Promise<string> => ipcRenderer.invoke("app:getPlatform"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("shell:openExternal", url),
  onMenuCommand: (handler: (id: string) => void): (() => void) => {
    const listener = (_event: unknown, id: string) => handler(id);
    ipcRenderer.on("menu:command", listener);
    return () => ipcRenderer.removeListener("menu:command", listener);
  },
  pickFolder: (title: string): Promise<string | null> => ipcRenderer.invoke("dialog:pickFolder", title),
  leaveFullScreen: (): Promise<void> => ipcRenderer.invoke("window:leaveFullScreen"),
  onFullScreen: (handler: (on: boolean) => void): (() => void) => {
    const listener = (_event: unknown, on: boolean) => handler(on);
    ipcRenderer.on("window:fullscreen", listener);
    return () => ipcRenderer.removeListener("window:fullscreen", listener);
  },
  updateStatus: (): Promise<unknown> => ipcRenderer.invoke("update:status"),
  checkForUpdates: (): Promise<boolean> => ipcRenderer.invoke("update:check"),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke("update:download"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("update:install"),
  onUpdateStatus: (handler: (status: unknown) => void): (() => void) => {
    const listener = (_event: unknown, status: unknown) => handler(status);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },
});
