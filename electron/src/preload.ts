/** What the interface may ask the shell: its version, the platform, and to open a web link in
 * the system browser; and the menu's commands. Nothing else of Node or Electron reaches the page. */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("protectField", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  getPlatform: (): Promise<string> => ipcRenderer.invoke("app:getPlatform"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("shell:openExternal", url),
  onMenuCommand: (handler: (id: string) => void): (() => void) => {
    const listener = (_event: unknown, id: string) => handler(id);
    ipcRenderer.on("menu:command", listener);
    return () => ipcRenderer.removeListener("menu:command", listener);
  },
});
