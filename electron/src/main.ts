/**
 * The desktop shell of Smart Parks Protect Go, after AddaxAI's: it starts the frozen Python
 * backend from the app's resources (or the repository's virtual environment in development),
 * waits for its health answer, and shows the interface the backend serves at 127.0.0.1. The
 * window is a browser without chrome; external links open in the system browser. The shell
 * registers the `protect-go://` scheme so Protect's Offload page can open Protect Go with the
 * server to connect to (`protect-go://connect?server=https://...`, decision D9).
 */

import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import { autoUpdater, type NsisUpdater } from "electron-updater";

const BACKEND_PORT = Number(process.env.PROTECT_GO_PORT ?? 18090);
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const DATA_DIR = process.env.PROTECT_GO_DATA_DIR ?? path.join(os.homedir(), "ProtectGo");
const LOG_DIR = path.join(DATA_DIR, "logs");
const DOCS_URL = "https://smartparksorg.github.io/smartparks-protect-go/";
const SLOW_NOTICE_MS = 20_000;

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendSpawnError: Error | null = null;
let lastBackendExit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
let pendingRoute = "";

// --- Logging: the backend's lines go to the console and to logs/backend.log in the data folder

function logLine(prefix: string, text: string): void {
  const line = `${new Date().toISOString()} ${prefix} ${text.trimEnd()}\n`;
  process.stdout.write(line);
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, "backend.log"), line);
  } catch {
    // a log that cannot be written must not stop the app
  }
}

// --- The protocol link: protect-go://connect?server=https://protect.example.org

/** The in-app route a protocol link asks for, or null for a link we do not understand. */
export function routeForProtocolUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "protect-go:") return null;
  const action = (url.hostname || url.pathname.replace(/^\/+/, "")).toLowerCase();
  if (action !== "connect") return null;
  const server = url.searchParams.get("server") ?? "";
  if (!/^https?:\/\/[^\s/]+/.test(server)) return null;
  const code = url.searchParams.get("code");
  const query = new URLSearchParams({ server });
  if (code && /^[A-Za-z0-9_-]{16,128}$/.test(code)) query.set("code", code);
  return `/setup?${query.toString()}`;
}

function protocolUrlIn(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith("protect-go://")) ?? null;
}

function openRoute(route: string): void {
  if (mainWindow) {
    void mainWindow.loadURL(`${BACKEND_URL}${route}`);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingRoute = route;
  }
}

// --- The backend

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Health {
  status?: string;
  version?: string;
  decoders?: string[];
}

function probeHealth(timeoutMs = 2000): Promise<Health | null> {
  return new Promise((resolve) => {
    const request = http.get(`${BACKEND_URL}/api/health`, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        if (response.statusCode !== 200) return resolve(null);
        try {
          resolve(JSON.parse(body) as Health);
        } catch {
          resolve(null);
        }
      });
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
    request.on("error", () => resolve(null));
  });
}

function isFieldHealth(body: Health | null): boolean {
  return !!body && body.status === "ok" && typeof body.version === "string" && Array.isArray(body.decoders);
}

function resolveBackendCommand(): { executable: string; args: string[]; cwd: string } {
  if (app.isPackaged) {
    const executable = path.join(
      process.resourcesPath,
      "backend",
      process.platform === "win32" ? "backend.exe" : "backend",
    );
    if (!fs.existsSync(executable)) throw new Error(`The backend is missing: ${executable}`);
    return { executable, args: [], cwd: path.dirname(executable) };
  }
  // development: the repository's virtual environment
  const root = path.resolve(__dirname, "..", "..");
  const python =
    process.platform === "win32"
      ? path.join(root, ".venv", "Scripts", "python.exe")
      : path.join(root, ".venv", "bin", "python");
  if (!fs.existsSync(python)) throw new Error(`No virtual environment at ${python}; run uv sync`);
  return { executable: python, args: ["-m", "protect_go"], cwd: root };
}

function spawnBackend(): void {
  backendSpawnError = null;
  lastBackendExit = null;
  const { executable, args, cwd } = resolveBackendCommand();
  logLine("[shell]", `starting backend ${executable} ${args.join(" ")}`);
  const proc = spawn(executable, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PROTECT_GO_PORT: String(BACKEND_PORT), PROTECT_GO_DATA_DIR: DATA_DIR, PROTECT_GO_HOST: "127.0.0.1" },
  });
  backendProcess = proc;
  proc.stdout?.on("data", (data) => logLine("[backend]", String(data)));
  proc.stderr?.on("data", (data) => logLine("[backend]", String(data)));
  proc.on("error", (error) => {
    backendSpawnError = error;
    logLine("[shell]", `backend failed to start: ${error.message}`);
  });
  proc.on("exit", (code, signal) => {
    logLine("[shell]", `backend exited (code ${code}, signal ${signal})`);
    lastBackendExit = { code, signal };
    if (backendProcess === proc) backendProcess = null;
  });
}

async function waitForBackend(): Promise<void> {
  const start = Date.now();
  let noticeShown = false;
  for (;;) {
    if (!backendProcess) {
      const detail = backendSpawnError
        ? backendSpawnError.message
        : lastBackendExit
          ? `exit code ${lastBackendExit.code}`
          : "unknown reason";
      throw new Error(`The backend stopped while starting (${detail}). The log is in ${LOG_DIR}.`);
    }
    if (isFieldHealth(await probeHealth())) return;
    if (!noticeShown && Date.now() - start > SLOW_NOTICE_MS) {
      noticeShown = true;
      await loadHtml(shellPage("<h1>Still starting</h1><p>The first start takes a little longer.</p>"));
    }
    await delay(750);
  }
}

function sameVersion(a: string | undefined, b: string): boolean {
  return (a ?? "").replace(/^v/, "") === b.replace(/^v/, "");
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { windowsHide: true }, (_error, stdout) => resolve(String(stdout ?? "")));
  });
}

/** The process listening on the backend's port, killed: Windows by `netstat -ano`, the others
 * by `lsof`. Only called once the port is known to hold a Protect Go backend of another
 * version (decision D20), never for a stranger. */
async function killListenerOnPort(port: number): Promise<void> {
  const pids = new Set<string>();
  if (process.platform === "win32") {
    const table = await run("netstat", ["-ano", "-p", "tcp"]);
    for (const line of table.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[1]?.endsWith(`:${port}`) && parts[3] === "LISTENING") pids.add(parts[4]);
    }
    for (const pid of pids) await run("taskkill", ["/F", "/PID", pid]);
  } else {
    const out = await run("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
    for (const pid of out.split(/\s+/).filter(Boolean)) pids.add(pid);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        // gone already
      }
    }
  }
  logLine("[shell]", `stopped the listener on ${port} (pid ${[...pids].join(", ") || "none found"})`);
}

/** A backend of another version on the port is asked to stop (`POST /api/shutdown`), then
 * killed by its port when it does not; the backend an installer's close left behind would
 * otherwise serve the old interface to the new window (Tim, 2026-10-17; decision D20). */
async function stopStaleBackend(version: string | undefined): Promise<void> {
  logLine("[shell]", `a Protect Go backend of version ${version} answers on ${BACKEND_PORT}; this is ${app.getVersion()}, stopping it`);
  await new Promise<void>((resolve) => {
    const request = http.request(`${BACKEND_URL}/api/shutdown`, { method: "POST", timeout: 2000 }, (response) => {
      response.resume();
      response.on("end", resolve);
    });
    request.on("error", () => resolve());
    request.on("timeout", () => {
      request.destroy();
      resolve();
    });
    request.end();
  });
  for (let i = 0; i < 8; i++) {
    await delay(250);
    if ((await probeHealth(500)) === null) return;
  }
  await killListenerOnPort(BACKEND_PORT);
  for (let i = 0; i < 8; i++) {
    await delay(250);
    if ((await probeHealth(500)) === null) return;
  }
  throw new Error(`An older Protect Go backend (version ${version}) keeps port ${BACKEND_PORT}. End it in the task manager, or restart the computer, and start Protect Go again.`);
}

/** A backend of ours and of this version that answers already (an earlier window, or a
 * developer's `uv run`) is used as it is; one of another version is stopped first; a port held
 * by something else is an error with the way out named. */
async function ensureBackend(): Promise<void> {
  let existing = await probeHealth(1500);
  if (isFieldHealth(existing) && app.isPackaged && !sameVersion(existing?.version, app.getVersion())) {
    await stopStaleBackend(existing?.version);
    existing = null;
  }
  if (isFieldHealth(existing)) {
    logLine("[shell]", `a Protect Go backend answers on ${BACKEND_PORT} already (version ${existing?.version}); using it`);
    return;
  }
  if (existing !== null) {
    throw new Error(
      `Port ${BACKEND_PORT} is in use by another program. Quit it and start Protect Go again, ` +
        `or set PROTECT_GO_PORT to a free port.`,
    );
  }
  spawnBackend();
  await waitForBackend();
  logLine("[shell]", "backend ready");
}

function stopBackend(): void {
  if (!backendProcess) return;
  logLine("[shell]", "stopping backend");
  backendProcess.kill();
  backendProcess = null;
}

// --- The window

function shellPage(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Protect Go</title><style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#ffffff;color:#1f2a24}
    @media (prefers-color-scheme: dark){body{background:#121917;color:#e6ece8}}
    main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.25rem;font-weight:600;color:#52735E}p{line-height:1.5}
    button{margin-top:1rem;padding:.5rem 1rem;border-radius:.375rem;border:1px solid #52735E;background:#52735E;color:#fff;font:inherit;cursor:pointer}
  </style></head><body><main>${body}</main></body></html>`;
}

function loadHtml(html: string): Promise<void> {
  if (!mainWindow) return Promise.resolve();
  return mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: `Protect Go v${app.getVersion()}`,
    autoHideMenuBar: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("page-title-updated", (event) => event.preventDefault());
  // full screen hides the menu bar, and with it the way back (Tim, 2026-10-17, on Windows): F11
  // toggles and Escape leaves it whatever the menu does, and the page is told so it can show
  // the way out
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (!mainWindow || input.type !== "keyDown") return;
    if (input.key === "F11") {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    } else if (input.key === "Escape" && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });
  mainWindow.on("enter-full-screen", () => mainWindow?.webContents.send("window:fullscreen", true));
  mainWindow.on("leave-full-screen", () => mainWindow?.webContents.send("window:fullscreen", false));
  // links to the web open in the system browser; the window never leaves the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${BACKEND_URL}/`) || url === BACKEND_URL || url.startsWith("data:")) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  await loadHtml(shellPage("<h1>Protect Go</h1><p>Starting</p>"));
}

async function showError(message: string): Promise<void> {
  logLine("[shell]", `error: ${message}`);
  await loadHtml(
    shellPage(
      `<h1>Protect Go could not start</h1><p>${message.replace(/</g, "&lt;")}</p>` +
        `<button onclick="window.close()">Quit</button>`,
    ),
  );
}

async function startAndLoad(): Promise<void> {
  await createWindow();
  try {
    await ensureBackend();
  } catch (error) {
    await showError(error instanceof Error ? error.message : String(error));
    return;
  }
  if (!mainWindow) return;
  await mainWindow.loadURL(`${BACKEND_URL}${pendingRoute}`);
  pendingRoute = "";
}

// --- The menu

function checkForUpdatesFromMenu(): Promise<boolean> {
  return checkForUpdates();
}

function sendMenuCommand(id: string): void {
  mainWindow?.webContents.send("menu:command", id);
}

function setupMenu(): void {
  const isMac = process.platform === "darwin";
  const checkForUpdates = {
    label: "Check for updates…",
    click: () => {
      sendMenuCommand("check-updates");
      void checkForUpdatesFromMenu();
    },
  };
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ label: app.name, submenu: [{ role: "about" as const }, checkForUpdates, { type: "separator" as const }, { role: "quit" as const }] }]
      : [{ label: "File", submenu: [checkForUpdates, { type: "separator" as const }, { role: "quit" as const }] }]),
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { type: "separator" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
    {
      label: "Help",
      submenu: [
        { label: "Documentation", click: () => void shell.openExternal(DOCS_URL) },
        { label: "Open the data folder", click: () => void shell.openPath(DATA_DIR) },
        ...(isMac ? [] : [{ label: `About Protect Go v${app.getVersion()}`, enabled: false }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Updates (decision D17)
//
// On Windows the installed app updates itself: electron-updater reads `latest.yml` beside the
// installer of the newest GitHub release, downloads the installer when the page asks, and runs
// it on quit. macOS accepts that only from a signed app and the Debian package has no updater,
// so there the page keeps its download link.

const UPDATES_SUPPORTED = app.isPackaged && process.platform === "win32";

/** The build says in its package.json when it was not signed (the workflow's `extraMetadata`);
 * electron-updater then cannot demand the publisher's signature on the downloaded installer,
 * which an unsigned one does not carry. A signed build keeps that check. */
function unsignedBuild(): boolean {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "package.json"), "utf8")) as { unsignedBuild?: boolean };
    return manifest.unsignedBuild === true;
  } catch {
    return false;
  }
}

interface UpdateStatus {
  state: "unsupported" | "idle" | "checking" | "none" | "available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

let updateStatus: UpdateStatus = { state: UPDATES_SUPPORTED ? "idle" : "unsupported" };

function setUpdateStatus(next: UpdateStatus): void {
  updateStatus = next;
  logLine("[update]", JSON.stringify(next));
  mainWindow?.webContents.send("update:status", next);
}

function setupUpdater(): void {
  if (!UPDATES_SUPPORTED) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  if (unsignedBuild()) {
    logLine("[update]", "unsigned build: the downloaded installer's signature is not checked");
    (autoUpdater as NsisUpdater).verifyUpdateCodeSignature = () => Promise.resolve(null);
  }
  autoUpdater.logger = {
    info: (message: unknown) => logLine("[update]", String(message)),
    warn: (message: unknown) => logLine("[update]", `warning: ${String(message)}`),
    error: (message: unknown) => logLine("[update]", `error: ${String(message)}`),
    debug: () => undefined,
  };
  autoUpdater.on("checking-for-update", () => setUpdateStatus({ state: "checking" }));
  autoUpdater.on("update-available", (info) => setUpdateStatus({ state: "available", version: info.version }));
  autoUpdater.on("update-not-available", (info) => setUpdateStatus({ state: "none", version: info.version }));
  autoUpdater.on("download-progress", (progress) =>
    setUpdateStatus({ state: "downloading", percent: Math.round(progress.percent) }),
  );
  autoUpdater.on("update-downloaded", (info) => setUpdateStatus({ state: "downloaded", version: info.version }));
  autoUpdater.on("error", (error) => setUpdateStatus({ state: "error", message: error.message }));
}

async function checkForUpdates(): Promise<boolean> {
  if (!UPDATES_SUPPORTED) return false;
  try {
    const result = await autoUpdater.checkForUpdates();
    return result?.isUpdateAvailable ?? false;
  } catch (error) {
    setUpdateStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

async function downloadUpdate(): Promise<void> {
  if (!UPDATES_SUPPORTED) return;
  if (updateStatus.state === "downloading" || updateStatus.state === "downloaded") return;
  if (updateStatus.state !== "available" && !(await checkForUpdates())) return;
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    setUpdateStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

function installUpdate(): void {
  if (updateStatus.state !== "downloaded") return;
  stopBackend();
  // not silent: the installer's own window with its progress bar stays on the screen while the
  // files change, and `build/installer.nsh` closes it and starts the app again (decision D22)
  autoUpdater.quitAndInstall(false, true);
}

// --- IPC for the interface (preload.ts)

ipcMain.handle("update:status", () => updateStatus);
ipcMain.handle("update:check", () => checkForUpdates());
ipcMain.handle("update:download", () => downloadUpdate());
ipcMain.handle("update:install", () => installUpdate());

ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:getPlatform", () => process.platform);
ipcMain.handle("shell:openExternal", async (_event, url: string) => {
  if (/^https?:\/\//.test(url)) await shell.openExternal(url);
});
ipcMain.handle("window:leaveFullScreen", () => mainWindow?.setFullScreen(false));
// the SD card or the folder it was copied to, picked in the system's own dialog (decision D16)
ipcMain.handle("dialog:pickFolder", async (_event, title: string) => {
  if (!mainWindow) return null;
  const picked = await dialog.showOpenDialog(mainWindow, { title, properties: ["openDirectory"] });
  return picked.canceled || picked.filePaths.length === 0 ? null : picked.filePaths[0];
});

// --- Lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const url = protocolUrlIn(argv);
    const route = url ? routeForProtocolUrl(url) : null;
    if (route) openRoute(route);
    else if (mainWindow) mainWindow.focus();
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    const route = routeForProtocolUrl(url);
    if (route) openRoute(route);
  });
  if (app.isPackaged) app.setAsDefaultProtocolClient("protect-go");

  const firstUrl = protocolUrlIn(process.argv);
  if (firstUrl) pendingRoute = routeForProtocolUrl(firstUrl) ?? "";

  void app.whenReady().then(async () => {
    setupMenu();
    setupUpdater();
    await startAndLoad();
    // the check at start, once the page is up; the page shows what it finds
    setTimeout(() => void checkForUpdates(), 8000);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void startAndLoad();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => stopBackend());
}
