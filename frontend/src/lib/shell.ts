/** The desktop shell's bridge (electron/src/preload.ts), present when the page runs inside
 * Protect Go's window and absent in a plain browser during development. */
export interface ShellBridge {
  getVersion(): Promise<string>;
  getPlatform(): Promise<string>;
  openExternal(url: string): Promise<void>;
  onMenuCommand(handler: (id: string) => void): () => void;
  /** The system's folder dialog: the path picked, or null when the person closed it. */
  pickFolder?(title: string): Promise<string | null>;
  leaveFullScreen?(): Promise<void>;
  onFullScreen?(handler: (on: boolean) => void): () => void;
  /** The self-update (decision D17): Windows only; elsewhere the state is "unsupported". */
  updateStatus?(): Promise<UpdateStatus>;
  checkForUpdates?(): Promise<boolean>;
  downloadUpdate?(): Promise<void>;
  installUpdate?(): Promise<void>;
  onUpdateStatus?(handler: (status: UpdateStatus) => void): () => void;
}

export interface UpdateStatus {
  state: "unsupported" | "idle" | "checking" | "none" | "available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

declare global {
  interface Window {
    protectGo?: ShellBridge;
  }
}

export function shell(): ShellBridge | undefined {
  return typeof window === "undefined" ? undefined : window.protectGo;
}

/** Opens a web page outside the app: through the shell when there is one, else a new tab. */
export function openExternal(url: string): void {
  const bridge = shell();
  if (bridge) void bridge.openExternal(url);
  else window.open(url, "_blank", "noopener");
}
