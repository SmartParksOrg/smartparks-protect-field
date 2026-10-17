/** The desktop shell's bridge (electron/src/preload.ts), present when the page runs inside
 * Protect Field's window and absent in a plain browser during development. */
export interface ShellBridge {
  getVersion(): Promise<string>;
  getPlatform(): Promise<string>;
  openExternal(url: string): Promise<void>;
  onMenuCommand(handler: (id: string) => void): () => void;
}

declare global {
  interface Window {
    protectField?: ShellBridge;
  }
}

export function shell(): ShellBridge | undefined {
  return typeof window === "undefined" ? undefined : window.protectField;
}

/** Opens a web page outside the app: through the shell when there is one, else a new tab. */
export function openExternal(url: string): void {
  const bridge = shell();
  if (bridge) void bridge.openExternal(url);
  else window.open(url, "_blank", "noopener");
}
