# Developer documentation

This file describes how the Smart Parks Protect Go codebase works today. The plan for where it is going lives in `PROJECT_PLAN.md`. Conventions live in `CONVENTIONS.md`, mirrored from Protect; the frontend's in `frontend/FRONTEND_CONVENTIONS.md`.

Status: v0.5.0 (2026-10-17) is the last tag: Protect's file explorer and the projects offered (D14); v0.4.0 the same day brought Protect's shell and words (D13), the project map and the tracker pages (F3); v0.3.0 the same day was the rename to Protect Go (D12), v0.2.0 the same day was the whole cycle (the offline map D4, the bundle D11, a card read, the upload). Before it v0.1.0 the same day with the repository, the Electron shell, the frozen backend, the installers' workflow, the first-run setup (server, account) and the update notice; phase 2 (a card read offline) next. Protect's `shared` package is pinned at d79ffaf (Protect's `main` of 2026-10-17, decisions up to D332, with `shared.station_files`, `shared.station_decode` and the field bundle and map endpoints). Decisions here at D10.

## What this program is

Smart Parks Protect Go reads the SD card of a RangerEdge offload station where there is no connection, decodes the trackers' frames with Protect's own code, shows the result, and hands the untouched card files to Protect when there is a connection. Protect is the source of truth; Protect Go is a reader with a queue. The reasoning is ADR 0001 in `docs/adr/`.

## Relationship to Protect

- **One decoder.** `pyproject.toml` depends on `smartparks-protect-shared` from Protect's repository, subdirectory `shared`, pinned to a commit under `[tool.uv.sources]`. `scripts/dev.sh bump-protect [rev]` moves the pin, relocks and reruns `tests/test_protect_decoding.py`, which unwraps the firmware's LP0 fixture with Protect's codec and loads the OpenCollar driver. Record a bump in `CHANGELOG.md` and in the status line above.
- **Modules Protect Go may import from `shared`:** `shared.station_decode` (the one decode path of a station frame: `unwrap_station_frame` with its refusals, `decode_station_frame`; Protect's phase 43 P6), `shared.connectivity.adapters.lp0_station` (the LP0 codec and adapter), `shared.device_drivers` (the drivers and their base), `shared.connectivity.base`, `shared.enums`, `shared.timeutil`, `shared.geodesy`, and `shared.station_files` (the station file parser, split out for Protect Go by Protect's phase 43 P1). **Never:** `shared.config` (wants a database URL and a broker), `shared.bus`, `shared.models`, `shared.database`, `shared.storage`, `shared.trace`'s database half, `shared.domain.*`. The tests run without `DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT` or `JWT_SECRET` and one test asserts none is set; CI sets none.
- **What Protect provides** (planned there, see the contract in `docs/contract.md`): the field bundle endpoint and the map extract; the card upload is Protect's existing log files endpoint.
- **Conventions, tooling and documents** are copied from Protect: `CONVENTIONS.md`, `CODE_OF_CONDUCT.md`, the git hooks, the ruff and mypy configuration, the CI shape, Dependabot, the MkDocs site, the frontend's configuration and its shadcn components. Protect's copies are the master. When Protect changes one, copy the change here.

### Differences from Protect

- One Python package (`protect_go`) instead of a uv workspace; `src = ["."]` for ruff.
- No database server: the local store (phase 2) is SQLite, through SQLAlchemy since `shared` brings it.
- No authentication: the program runs on one person's computer and listens on 127.0.0.1. The bundle on disk is encrypted with a key in the laptop's keychain, or a key file where there is none (decision D11).
- Settings carry the prefix `PROTECT_GO_` (`protect_go/config.py`, `.env.example`).
- The pre-commit hook has no Ansible paths and refuses the `data/` folder and a LoRaWAN session key given a value in code, with the firmware's synthetic fixture allowed.
- The docs check has no MCP half. The documentation site is published from `main` by the pages job, as Protect's is, at https://smartparksorg.github.io/smartparks-protect-go/.
- CI has no services, no OpenAPI drift job yet (comes with the first API the frontend types against) and no compose job.

## Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Backend | Python 3.12, FastAPI 0.141, uvicorn, Pydantic 2, httpx, PyJWT (from `shared`) | `protect_go/main.py` builds the app: `/api/health` (version, Protect commit, decoders), the setup and session endpoints (`routers/setup.py`), the built interface from `frontend/dist`, every unknown path answered with `index.html` so the browser router owns it |
| Desktop shell | Electron 44, electron-builder 26, PyInstaller 6.22 | `electron/` after AddaxAI's shell (decision D6): starts `dist/backend/backend` from the app's resources, waits for `/api/health`, shows `http://127.0.0.1:18090`; `backend.spec` freezes the backend with the built interface, `VERSION` and `uv.lock` inside |
| Decoding | Protect's `shared` package | See above |
| Frontend | React 19, Vite 8, TypeScript 6 strict, Tailwind 4, shadcn/ui on Radix, TanStack Query 5, React Router 8, i18next, Vitest 4, ESLint 10 | `frontend/`, Protect's configuration; `npm run build` type checks first |
| Docs | MkDocs Material, built strictly | `docs/`, `mkdocs.yml`, `scripts/docs_check.py` |
| Tooling | uv 0.12, ruff 0.16, mypy 2.3 strict, pytest 9 | Exact pins as Protect |

## Layout

```
protect_go/        the Python package: main.py (the server), config.py (settings), version.py,
                      decoding.py (Protect's decoding imported in one place), store.py (settings.json),
                      protect.py (the Protect server: probe, sign-in), routers/setup.py
frontend/             the interface: src/api (client, query keys), src/pages (Setup, SignIn, Home),
                      src/components (layout/ Protect's shell, UpdateNotice, OfflineMap, common/, ui/ shadcn
                      copies), src/hooks (useLatestRelease, useTheme, useMediaQuery), src/lib (version,
                      shell, windows, palette, theme), src/stores (layout), src/locales
electron/             the desktop shell: src/main.ts, src/preload.ts, build/ (icon, entitlements,
                      notarize.js, installer.nsh), package.json with the electron-builder block
backend.spec          PyInstaller: the frozen backend in dist/backend/
tests/                pytest; test_protect_decoding.py is the proof that Protect's code works here
scripts/dev.sh        run | desktop | freeze | test | lint | format | docs | hooks | bump-protect
docs/                 the site: index, Using Protect Go (the user page), the contract with Protect, ADRs
.github/workflows/    ci.yml (python, frontend, shell, frozen backend, docs, audit, pages),
                      build-installers.yml (the three installers on a published release)
.githooks/            commit-msg (strips assistant trailers), pre-commit (refuses credentials)
```

## Packaging, after AddaxAI (decision D6)

The desktop AddaxAI ships an Electron shell with a PyInstaller-frozen Python backend as `extraResources`, built by electron-builder into an NSIS installer (`-Setup.exe`, per user, no administrator), a dmg (drag to Applications) and a deb, attached to a GitHub release by a workflow that runs when the release is published, the version copied from the tag into `VERSION` and `electron/package.json`. Its website links `releases/latest/download/<fixed name>` per system, and the app checks GitHub's releases list at start and shows a notice; the user installs the new installer over the old one, which keeps the data folder outside the install folder. Protect Go does the same:

- `electron/src/main.ts`: one instance; `protect-go://connect?server=…` from a second instance or macOS's `open-url` becomes the route `/setup?server=…` (decision D9); the backend is `process.resourcesPath/backend/backend(.exe)` when packaged, else the repository's `.venv` python with `-m protect_go`; `PROTECT_GO_PORT`, `PROTECT_GO_DATA_DIR` (`~/ProtectGo`) and `PROTECT_GO_HOST` passed in the environment; the backend's output goes to the console and `logs/backend.log` in the data folder; a Protect Go backend already answering on the port is used, a stranger on it is an error with the way out named; the window loads `http://127.0.0.1:18090`, web links open in the system browser, the window never navigates away; the menu has Check for updates (sent to the page as `menu:command`), Documentation, Open the data folder. `preload.ts` exposes `window.protectGo` (version, platform, openExternal, onMenuCommand).
- `backend.spec`: entry `protect_go/__main__.py`, `datas` the built interface, `VERSION` and `uv.lock` (read through `sys._MEIPASS`, `version.py`), the OpenCollar driver's catalogue and codec files, `hiddenimports` for the decoding modules, `excludes` for the server-only packages `shared` depends on and Protect Go never imports (matplotlib, weasyprint, pyarrow, Pillow, openpyxl, chirpstack, grpc, minio, mqtt, asyncpg, psycopg). About 150 MB on Linux. `protect_go/decoding.py` imports the parser, the codec and the driver at start so a frozen build that lacks one fails at once, and `/api/health` names the decoders.
- `electron/package.json`'s `build`: appId `org.smartparks.protect.field`, product name Protect Go, artifacts `ProtectGo-Setup.exe`, `ProtectGo-arm64.dmg`, `ProtectGo-amd64.deb`, the `protect-go` scheme, NSIS not one-click with the directory changeable and `installer.nsh` (the uninstaller asks before removing `~/ProtectGo`), hardened runtime and `notarize.js` after signing on macOS, the icon from `build/icon.png` (the Smart Parks mark on brand green, 1024 px; electron-builder derives the icns and ico).
- `.github/workflows/build-installers.yml`: on a published release, and by hand for debug builds kept 14 days. Windows signs when `WINDOWS_CERT_PFX_BASE64` and `WINDOWS_CERT_PFX_PASSWORD` are set, macOS signs and notarises when `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PWD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are; without them the build warns and the installer is unsigned (`REQUIRE_SIGNING` in the workflow turns that into an error once the certificates exist; AddaxAI hard-fails, Protect Go cannot yet). Every build starts the frozen backend and checks that health names the decoders before packaging.
- Updates (decision D8): `hooks/useLatestRelease.ts` asks `api.github.com/repos/SmartParksOrg/smartparks-protect-go/releases?per_page=1` once per start (the newest release of any kind, so a pre-release counts), compares with `lib/version.ts`, and `UpdateNotice` shows the newer version with its notes and a button to the user page; the menu's Check for updates shows the result either way. A dev build (`v0.0.0-dev`) never nags. Automatic download and install (electron-updater) waits for signed builds.
- Releasing: tag `vX.Y.Z` on `main` with `VERSION` written, publish a GitHub release with notes written for users (the notice shows them verbatim), and the workflow attaches the installers. The docs' download links point at `releases/latest/download/<name>`, so they never change.

## The bundle (decisions D2 and D11)

`protect_go/bundle.py`: `BundleStore` keeps the whole bundle Protect gave (`GET /projects/{id}/field-bundle`) in `bundle.enc`, Fernet-encrypted, with the fetch time in the envelope; `load()` gives it back whole, `summary()` the counts the pages show (never a key), stale after seven days. The key comes from `protect_go/secrets.py`: the operating system's keychain through `keyring` (service "Smart Parks Protect Go"), made on first use; where no keychain answers (no backend, a locked keychain, a denied prompt, this WSL machine), a key file `bundle.key` in the data folder with mode 600; `PROTECT_GO_KEY_STORE=file` forces the file (the tests, a headless machine). `routers/bundle.py`: `GET /api/bundle`, `DELETE /api/bundle`, `POST /api/bundle/fetch {project_id, project_name}`, which fetches the bundle (401 when the sign-in expired, 502 with the server's words, a shape other than `format_version` 1 refused), keeps it, then calls the map fetch and returns both states. `pages/LoadPage.tsx` is the one button before leaving; the Map page points to it. `backend.spec` collects `keyring`'s backends so the frozen build finds the right one per system.

## A card read (decision D2, phase 2 F2)

`protect_go/cards.py`: `CardStore` owns `field.db` (SQLite, WAL, foreign keys) with `cards`, `card_files`, `frames` and `records`. `import_card(name, files, bundle)` takes what was dropped as `(name, bytes)` pairs: a `.zip` goes through `unpack_card_zip`, a `.jsonl` is a member with the folder from its name, the rest is skipped by name; each member is kept under `cards/<card id>/<folder>/<name>` and parsed with `parse_station_jsonl`; each frame is routed by the LP0 address in its clear header to the bundle's tracker (`trackers_of`: the devices with an `lp0` address, their keys as `Credentials` when the bundle carries them), a frame whose digest was decoded before is `repeated`, else `unwrap_station_frame` and `decode_station_frame` with the device's driver from Protect's registry; a `FrameRefused` or the driver's `ApplicationError` is a `refused` frame with the code and words; an address nobody has is `unknown_address`; a line that is not a frame is `line_error`. Records go in under Protect's canonical key (device, time, kind, the metric or fingerprint) with `INSERT OR IGNORE`, so the counts are new records. The station's reception time counts only when plausible (2020 to tomorrow), as Protect's D324. `card_detail` adds the files, the trackers with their span and the first 100 failures; `positions` is bounded at 5000. `routers/cards.py` is the API (multipart `POST /api/cards`, 409 without a bundle, 422 without a station file). In the interface, `CardsPage` has the drop zone (a folder through `webkitdirectory`, a zip, or dragged files; the relative path travels as the file name) and the list; `CardPage` the counts, the trackers, the positions on `OfflineMap` (which now takes `points` and draws a track per tracker and its fixes), the failures and the files.

## The shell and the pages (decision D13)

`components/layout/AppLayout.tsx`, `Sidebar.tsx`, `navigation.ts` and `ThemeSwitch.tsx` are Protect's, cut down: no project switcher, search, permissions or server pages; the sidebar's sections are the project's pages (Overview, Load a project, Map, Files, Upload, the last three once a project is on the laptop) and the settings (Server, Account); the top bar has the landscape logo with "Protect Go", the loaded project's name, the theme switch and a connection dot (green when signed in). `hooks/useTheme.ts` keeps the theme in the browser (`protect-go-theme`), `stores/layout.ts` the hidden sidebar (`protect-go-layout`). Every page uses `PageHeader` and `Page` from `components/common/PageHeader.tsx`; the map page takes the full height with `flex-1`. `App.tsx` shows the setup page alone until a server is known, then the shell with the routes `/`, `/load`, `/map`, `/files`, `/files/{id}`, `/trackers/{id}`, `/upload`, `/setup`, `/sign-in`; `/cards` redirects to `/files`. The words: the SD card's files are "files" in the interface and the documents, never "cards" (in Dutch "kaart" is the map); the API keeps `/api/cards` and the store its `cards` table.

## The files explorer (decision D14)

Protect's `components/data/DataTable.tsx` is copied as it is (with `ui/dialog.tsx`, `ui/dropdown-menu.tsx`, `ui/table.tsx`, `ui/select.tsx`, `ui/skeleton.tsx`, `common/StatusBadge.tsx`, `lib/format.ts` and `lib/portalContainer.ts`); `hooks/usePreference.ts` keeps a choice in the browser under `protect-go-pref:<key>` where Protect keeps it on the account. `components/files/FilesExplorer.tsx` is Protect's `LogFilesCard` for the app: the list (`GET /api/files`, one row per file with its SD card, station, upload state, counts and size; `searchable`, `columnsKey` "files", the measurements and size hidden by default, the station and SD card hidden on a phone, a card per row on a phone) or tiles, the view under the preference `files_view`, a row's menu with Properties and Open the SD card; `FileDialog.tsx` is its `LogFileDialog`: the properties from `GET /api/files/{id}` (the trackers the file carried, the first 100 frames not read with the reason). `lib/files.ts` holds the size label, the upload's words and tone, and the one-line summary. `pages/FilesPage.tsx` keeps the drop zone and adds the SD card filter; `CardStore.files()` and `file_detail()` serve the rows, aggregating `frames` per file. The project list (`GET /api/projects`) asks the server's Offload overview per project and counts its stations; the Load page offers only projects with one.

## The project map and the trackers (phase 2 F3)

`CardStore.trackers()` (every device in the records with its counts, span and newest position), `positions(... since, until)` (bounded at 20000), `metrics(device_id)` and `measurements(device_id, metric, since, until, limit)`; `routers/trackers.py` serves them. `pages/MapPage.tsx` draws every tracker's positions with `OfflineMap` (which takes a `colour` per point, data-driven line and circle colours, a popup on a click and a `className` so it fills the page), a tracker and a window from `lib/windows.ts` (the window counts back from the newest record, since a card is read days after its last fix), a legend from `lib/palette.ts` (Protect's series palette) linking to the tracker pages. `pages/TrackerPage.tsx`: the track, the metrics table and one metric's values.

## The upload (decision D2, phase 2 F4)

`card_files` carries the upload's state per file (`upload_status`: pending, uploaded, duplicate, refused, failed; `upload_answer`, `uploaded_at`, `attempts`, `log_file_id`), added to an existing database by `CardStore._migrate`. `protect_go/uploads.py`'s `run_uploads` takes the pending and failed files of one card or all (`pending_files`, oldest card first), posts each as `file` to the station's `POST /api/v1/devices/{station_device_id}/offload-files` with the sign-in's token, and settles the answer (`_settle`): 201 with a file row is `uploaded` (the log file id kept), 201 with the one member skipped reads the reason, a 422 whose words say "uploaded before" is `duplicate`, another 422 is `refused` with the words, 401 and 403 mark the file `failed` and stop the run with the way out named (sign in again; the account needs device control in the project), a transport error marks it `failed` and stops the run too. A card whose `station_device_id` is empty (the project knew no station with that EUI when the bundle was loaded) is left pending with the word to make the station on the Offload page and load the project again. `routers/uploads.py`: `GET /api/uploads` (per card and the totals), `POST /api/uploads/run {card_id?}`. The interface: `pages/UploadPage.tsx`; the first screen's Upload button carries the waiting count.

## The offline map (decision D4)

`protect_go/routers/map.py`: `POST /api/map/fetch {project_id, project_name}` calls the server's `GET /projects/{id}/field-bundle/map` with the token; a 200 is streamed to `map.pmtiles` in the data folder (through a `.part` file) with `map.json` beside it (project, build, digest, the bounds and zoom read from the PMTiles header with the `pmtiles` package); a 404 or 202 makes Protect Go `POST` for the map and answer with the server's state in words (`server_state`); 401 and 403 say the sign-in expired. `GET /api/map` is the state on the laptop; `GET /api/map/tiles.pmtiles` serves the file with `Range` (206, `Content-Range`, 416 beyond the end), which the pmtiles protocol of MapLibre needs. `GET /api/projects` lists the account's projects from the server for the picker. In the interface, `components/OfflineMap.tsx` registers the pmtiles protocol once, builds the style from `@protomaps/basemaps` (`layers("protomaps", namedFlavor("light"|"dark"), {lang: "en"})`) with glyphs and sprites from `public/map/` (the ranges and licence listed in its README), fits the map's bounds and credits OpenStreetMap and Protomaps; `pages/MapPage.tsx` shows the map on the laptop or the project picker and the fetch button. Tests: `tests/test_map.py` against a mock server, `MapPage.test.tsx` with the map component mocked.

## The setup (decision D7)

`protect_go/store.py` keeps `settings.json` in the data folder (mode 600): the server, its version, the account's email, Protect's token and its expiry read from the token's `exp`; never the password. `protect_go/protect.py` talks to the server: `probe_version` (`GET /api/version`, anything else is "not a Protect server"), `sign_in` (`POST /api/v1/auth/login` form-encoded, then `GET /api/v1/users/me`). `routers/setup.py`: `GET /api/setup`, `PUT /api/setup/server` (a new server ends the session), `POST /api/session`, `DELETE /api/session`. The tests hand `app.state.http_transport` an `httpx.MockTransport`. The interface gates on the setup (`App.tsx`): no server sends to `/setup`, which reads `?server=` from the protocol link; a server without an account to `/sign-in`.

## Commands

```bash
scripts/dev.sh hooks            # once per clone
uv sync --all-groups
(cd frontend && npm ci)
(cd electron && npm ci)         # on npm 11, if node_modules/electron/dist is missing: node node_modules/electron/install.js
scripts/dev.sh lint             # ruff, mypy, eslint, tsc (frontend and shell)
scripts/dev.sh test             # pytest, vitest
scripts/dev.sh docs             # mkdocs --strict and the docs check
scripts/dev.sh run              # the server with the built interface on http://127.0.0.1:18090
(cd frontend && npm run dev)    # live reload on http://127.0.0.1:5173, /api proxied to the server
scripts/dev.sh desktop          # the Electron shell against .venv and the built interface
scripts/dev.sh freeze           # the frozen backend in dist/backend/, as the installers carry it
scripts/dev.sh bump-protect     # move the Protect pin to the newest main and prove the decoding
```

Under WSL the shell runs through WSLg; `--no-sandbox` may be needed there. A terminal inside VS Code sets `ELECTRON_RUN_AS_NODE=1`, which makes the Electron binary run as plain Node and fail on `ipcMain`; `scripts/dev.sh desktop` unsets it. `PROTECT_GO_DATA_DIR` and `PROTECT_GO_PORT` point a run elsewhere. With `--remote-debugging-port=9333`, `curl http://127.0.0.1:9333/json` lists the page the window loaded.

After adding UI strings: `cd frontend && npm run i18n:extract`, then write the Dutch lines in `src/locales/nl/translation.json` by hand, appended.

## Versions

`VERSION` at the root holds the last tag (`v0.0.0` until the first release); `protect_go/version.py` reads it and reads the Protect commit from `uv.lock`. `/api/health` names both and the first screen shows them, so a difference between what Protect Go showed and what Protect decoded can be traced to a version.

## Working with the plan

- Read `PROJECT_PLAN.md` at the start of every session and work the next unchecked item.
- Tick the checkbox in the same commit as the code and the docs.
- Add a session log entry at the end of every session.
- Update this file whenever a mechanism, convention or command changes.
