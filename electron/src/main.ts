/**
 * The desktop shell of Smart Parks Protect Field, after AddaxAI's: it starts the frozen Python
 * backend from the app's resources (or the repository's virtual environment in development),
 * waits for its health answer, and shows the interface the backend serves at 127.0.0.1. The
 * window is a browser without chrome; external links open in the system browser. The shell
 * registers the `protect-field://` scheme so Protect's Offload page can open Field with the
 * server to connect to (`protect-field://connect?server=https://...`, decision D9).
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";

const BACKEND_PORT = Number(process.env.PROTECT_FIELD_PORT ?? 18090);
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const DATA_DIR = process.env.FIELD_DATA_DIR ?? path.join(os.homedir(), "ProtectField");
const LOG_DIR = path.join(DATA_DIR, "logs");
const DOCS_URL = "https://smartparksorg.github.io/smartparks-protect-field/";
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

// --- The protocol link: protect-field://connect?server=https://protect.example.org

/** The in-app route a protocol link asks for, or null for a link we do not understand. */
export function routeForProtocolUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "protect-field:") return null;
  const action = (url.hostname || url.pathname.replace(/^\/+/, "")).toLowerCase();
  if (action !== "connect") return null;
  const server = url.searchParams.get("server") ?? "";
  if (!/^https?:\/\/[^\s/]+/.test(server)) return null;
  return `/setup?server=${encodeURIComponent(server)}`;
}

function protocolUrlIn(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith("protect-field://")) ?? null;
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
  return { executable: python, args: ["-m", "protect_field"], cwd: root };
}

function spawnBackend(): void {
  backendSpawnError = null;
  lastBackendExit = null;
  const { executable, args, cwd } = resolveBackendCommand();
  logLine("[shell]", `starting backend ${executable} ${args.join(" ")}`);
  const proc = spawn(executable, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FIELD_PORT: String(BACKEND_PORT), FIELD_DATA_DIR: DATA_DIR, FIELD_HOST: "127.0.0.1" },
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

/** A backend of ours that answers already (an earlier window, or a developer's `uv run`) is
 * used as it is; a port held by something else is an error with the way out named. */
async function ensureBackend(): Promise<void> {
  const existing = await probeHealth(1500);
  if (isFieldHealth(existing)) {
    logLine("[shell]", `a Field backend answers on ${BACKEND_PORT} already (version ${existing?.version}); using it`);
    return;
  }
  if (existing !== null) {
    throw new Error(
      `Port ${BACKEND_PORT} is in use by another program. Quit it and start Protect Field again, ` +
        `or set PROTECT_FIELD_PORT to a free port.`,
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
  return `<!doctype html><html><head><meta charset="utf-8"><title>Protect Field</title><style>
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
    title: `Protect Field v${app.getVersion()}`,
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
  await loadHtml(shellPage("<h1>Protect Field</h1><p>Starting</p>"));
}

async function showError(message: string): Promise<void> {
  logLine("[shell]", `error: ${message}`);
  await loadHtml(
    shellPage(
      `<h1>Protect Field could not start</h1><p>${message.replace(/</g, "&lt;")}</p>` +
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

function sendMenuCommand(id: string): void {
  mainWindow?.webContents.send("menu:command", id);
}

function setupMenu(): void {
  const isMac = process.platform === "darwin";
  const checkForUpdates = { label: "Check for updates…", click: () => sendMenuCommand("check-updates") };
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
        ...(isMac ? [] : [{ label: `About Protect Field v${app.getVersion()}`, enabled: false }]),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- IPC for the interface (preload.ts)

ipcMain.handle("app:getVersion", () => app.getVersion());
ipcMain.handle("app:getPlatform", () => process.platform);
ipcMain.handle("shell:openExternal", async (_event, url: string) => {
  if (/^https?:\/\//.test(url)) await shell.openExternal(url);
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
  if (app.isPackaged) app.setAsDefaultProtocolClient("protect-field");

  const firstUrl = protocolUrlIn(process.argv);
  if (firstUrl) pendingRoute = routeForProtocolUrl(firstUrl) ?? "";

  void app.whenReady().then(async () => {
    setupMenu();
    await startAndLoad();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void startAndLoad();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => stopBackend());
}
