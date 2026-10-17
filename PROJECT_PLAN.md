# Smart Parks Protect Go project plan

Living plan for building Smart Parks Protect Go, the companion of Smart Parks Protect for the place without a connection. It is the first thing to read in every coding session and the last thing to update before the session ends. It follows the shape of Protect's `PROJECT_PLAN.md` so a reader of one knows the other.

## How to use this document

1. **Start of a session.** Read "Current status" and the active phase. Pick the next unchecked item in order, unless the last session log entry says otherwise.
2. **During work.** Tick `[x]` only when the item is done and verified: code works, tests pass, docs are updated. Tick the box in the same commit as the code. An item that is started but not finished gets a short note in brackets after it.
3. **End of a session.** Add an entry to the session log at the bottom: date, what was done, decisions taken, what is next, blockers. Update "Current status".
4. **Changing the plan.** The plan may change. Record why in the session log. If a decision from the decisions table changes, update the table and write or amend the ADR.
5. **Definition of done** below applies to every item, not only to phases.
6. `DEVELOPERS.md` describes how the code works today. This plan describes where it is going. Keep both current.
7. Session log entries name the agent that did the work (Claude or Codex) so either can pick up where the other stopped.
8. Work that belongs in Protect (the parser split, the bundle endpoint) is listed here under "Protect side" so it is not forgotten, and is done in Protect's repository under Protect's plan.

## Current status

| Field | Value |
| --- | --- |
| Active phase | Phase 2: F0 (the offline map), F1 (the bundle, D11), F2 (a card read) and F4 (the upload) built on 2026-10-17; the loop of ADR 0001 is closed (Protect's P3 the same day); phase 1b (installed like AddaxAI, D6 to D10) built on 2026-10-17: the shell, the frozen backend, the installers' workflow, the setup, the update notice, the user page; v0.1.0 released the same day (I8); I9 (certificates) waits for Tim. Phase 1 (the Protect side) P1, P2 and P4 done in Protect (8c0a6b6), P3 open. Phase 2 (a card read offline) next |
| Latest release | v0.3.0 (2026-10-17): the app is Protect Go; the whole cycle; Protect pinned at d79ffaf |
| Last session | 2026-10-17 (Claude and Tim): the design chosen (ADR 0001, D1 to D5), the repository created with Protect's conventions, hooks, CI, docs and frontend tooling mirrored, the Python package with the server skeleton and the proof that Protect's decoding runs here, the frontend skeleton with its first screen, the documentation site; Protect pinned at 2755c92. Committed as 9391087, pushed to `SmartParksOrg/smartparks-protect-go` (private); the first CI run failed on the audit's export of the git package, fixed in ad9bafa, CI green since |
| Next item | Tim tries the whole loop with v0.2.0 on a laptop against dev (install from the Offload page, load LP0, read a demo card, upload); then F3 the tracker pages across cards, F5 the Docker Desktop route, F6 Bluetooth; the certificates (I9) |
| Blockers | No code-signing certificates (Windows Authenticode, Apple Developer ID), so the installers are unsigned and users click through SmartScreen and Gatekeeper as the user page explains; I9 is Tim's. A real LP0 v5 card does not exist yet (Protect's O8 waits for the firmware developer); until then the cards are synthetic, built with `build_uplink` as Protect's demo script builds them |

## What we are building

A local program, a Python server with a browser interface, that a person runs on a laptop in the field. They load a field bundle of their project from Protect while online, go to the stations, copy the SD cards, read them in Protect Go, see the positions and the measurements of the trackers on an offline map and in tables, and upload the card files to Protect when they are back online. Protect decodes the files itself; Protect Go's reading is for the field, Protect's is the record.

Design principles, from Protect's: devices are hardware and entities are what you care about; raw data is kept and is what travels; canonical time is device time; every list and map is bounded; nothing a person reads is hard-coded English.

## Decisions

| ID | Decision | Detail | Why |
| --- | --- | --- | --- |
| D1 | A companion in its own repository, on Protect's `shared` package pinned by commit | ADR 0001. Protect Go installs `smartparks-protect-shared` from Protect's repository (subdirectory `shared`) at a commit; `scripts/dev.sh bump-protect` moves the pin and reruns the decoding proof. Protect Go keeps no decoding code of its own | Tim (2026-10-17) asked whether to build an offline app with map tiles separately or inside Protect; Claude recommended the companion over Protect offline (a replication problem), an offline browser mode (a second decoder in TypeScript) and extending the replay app (a third decoder). Tim: "I think you are correct" |
| D2 | The card files are the unit of sync, in both directions | Down: a field bundle from Protect (devices, entities, the credentials the user may see, stations, area, map extract). Up: the untouched card files to Protect's log files endpoint. Nothing decoded leaves Protect Go. Notes or edits made offline are out of scope until asked; then an append-only outbox, never a merge | Protect already dedups a card by digest and a frame by hash, so the upload needs no protocol; two decodings of the same bytes by the same code need no reconciliation |
| D3 | Protect's conventions, tooling and documents mirrored, Protect's copies the master | `CONVENTIONS.md`, `CODE_OF_CONDUCT.md`, the hooks, ruff and mypy configuration, the CI shape, Dependabot, MkDocs, the frontend configuration and shadcn components copied; differences listed in `DEVELOPERS.md` | Tim (2026-10-17): "make sure it adheres to all the relevant rules and conventions from the protect repo (so we do not have to define that all again)" |
| D4 | Offline map tiles as a PMTiles extract of the project's area, made by Protect in the bundle | Protomaps' daily planet builds support range extraction; Protect cuts the project's bounding box server side; MapLibre reads the file locally through the pmtiles protocol. A park at zoom 14 is tens of megabytes | Protect's own base maps (OpenFreeMap styles) need a connection; a single file travels with the bundle and needs no tile server on the laptop |
| D5 | The name `smartparks-protect-go`, public, MIT (the product Protect Go; D12) | Under SmartParksOrg beside `smartparks-protect`; the Python package is `protect_go`, the product name "Smart Parks Protect Go" | Named for where it runs. Private at creation so Tim decided what is shown; opened by Tim the same morning, which let GitHub Pages publish the docs site and private vulnerability reporting be switched on |

| D6 | Installed the way AddaxAI is: an Electron shell with the PyInstaller-frozen backend, electron-builder installers (NSIS per user, dmg, deb) attached to a GitHub release by a workflow, fixed asset names under `releases/latest/download/` | `electron/`, `backend.spec`, `.github/workflows/build-installers.yml`; version from the tag into `VERSION` and `electron/package.json`; the data folder `~/ProtectGo` outside the install so an update keeps it; signing and notarisation when the secrets exist, unsigned with a warning until then (AddaxAI hard-fails; Smart Parks has no certificates yet) | Tim (2026-10-17): check how AddaxAI offers installs on Apple and Windows and use the same methods, most users are not technical. Read from AddaxAI's repository: `build-electron.yml`, `electron/package.json`, `backend.spec`, `main.ts`, the install page of docs.addaxai.com |
| D7 | Setup: the server address first, then the account's email and password through Protect's own login; the token kept, the password never | `PUT /api/setup/server` probes `/api/version`; `POST /api/session` is Protect's `/api/v1/auth/login` and `/users/me`; `settings.json` mode 600 in the data folder; the token lasts Protect's hour and Protect Go asks again when it needs the server after that | Tim (2026-10-17): the user defines the server URL of the Protect instance (dev-protect for testing), then authenticates with email and password. OAuth refresh tokens (Protect has the authorisation server) are the step if the hourly sign-in annoys |
| D8 | Updates as AddaxAI does them: a check of GitHub's releases list at start, a notice with the notes and a download button, the new installer over the old | `hooks/useLatestRelease.ts`, `UpdateNotice.tsx`, the menu's Check for updates; quiet without a connection or on a dev build | Tim (2026-10-17): Protect Go will be updated frequently, so it must check automatically. electron-updater (download and install in place) needs signed builds on macOS; it follows the certificates |
| D9 | Protect Go is offered from Protect's Offload page: the installer for the visitor's system, the server address, and "Open Protect Go" through the `protect-go://connect?server=` link the app registers | The shell registers the scheme (electron-builder `protocols`, `setAsDefaultProtocolClient`), the route `/setup?server=…` prefills the setup page; Protect's card is decision D332 there | Tim (2026-10-17): the install must be initiated from within Protect on the Offload page |
| D10 | macOS on Apple Silicon alone, as AddaxAI; Windows 64-bit; Debian and Ubuntu | One backend per architecture is frozen; an Intel dmg would need an Intel runner, which GitHub is retiring | Keeps one macOS build; added when a user asks |
| D11 | The bundle is protected at rest by a key in the laptop's keychain, not by a second password | `protect_go/secrets.py`: a Fernet key in the operating system's keychain (Windows Credential Manager, macOS Keychain, a Secret Service on Linux) through the `keyring` package, made on first use; where no keychain answers, a key file in the data folder readable by the owner alone, and the page says which protects the bundle. `bundle.enc` holds the whole bundle encrypted; the summary the pages show never holds a key | Claude (2026-10-17), with Tim's go-ahead to continue: most users are not technical and the laptop's login is already a password; a second one would be forgotten or written down. The plan's earlier wording (a password the user gives) is superseded |
| D12 | The product is Protect Go; in every text the full name once, then "the app", never the bare word as a sentence's subject | Repository `smartparks-protect-go`, package `protect_go`, command `protect-go`, installers `ProtectGo-*`, scheme `protect-go://`, data folder `~/ProtectGo`, settings prefix `PROTECT_GO_`, keychain service "Smart Parks Protect Go"; the catalogues, the user page and Protect's Offload card say "Protect Go" where the program is introduced and "the app" after that | Tim (2026-10-17): "Field" alone read strangely in a sentence; Protect Go chosen over keeping the name with a wording rule, and over Protect Offline and Protect Companion. Renamed from Field with release v0.3.0 the same day |

## Definition of done

Every item, every phase:

- Code follows `CONVENTIONS.md`; ruff, mypy strict and the tests pass; the frontend lints, type checks, builds and its tests pass; the English catalogue is current.
- Tests exist for new behaviour. Cards in tests are synthetic, built from the firmware's fixture; no real keys.
- `DEVELOPERS.md`, `docs/`, `CHANGELOG.md` (Unreleased) updated in the same commit; an ADR for an architectural choice.
- Every list and map bounded. Nothing decoded leaves Protect Go. No decoding code outside Protect's `shared`.
- The plan ticked in the same commit; a session log entry at the end of the session.

## Phases

### Phase 0: the repository and its tooling (2026-10-17)

- [x] The repository under SmartParksOrg with Protect's licence, code of conduct, conventions (mirrored), contributing, security policy, changelog, Dependabot
- [x] The git hooks: assistant trailers stripped, credentials refused (the firmware's synthetic fixture allowed)
- [x] `pyproject.toml` with Protect's pins and the dependency on `smartparks-protect-shared` by commit; `uv.lock`
- [x] `protect_go`: settings under `FIELD_`, the server with `/api/health` naming the version and the Protect commit, the built interface served
- [x] `tests/test_protect_decoding.py`: Protect's LP0 codec unwraps the firmware fixture here, the OpenCollar driver loads, no Protect environment variable is set
- [x] The frontend skeleton on Protect's stack and configuration with its colour tokens, the first screen, English and Dutch catalogues, a component test
- [x] CI: python, frontend, docs, audit; `scripts/dev.sh` with `bump-protect`
- [x] The documentation site: index, the contract with Protect, ADR 0001

### Phase 1: the Protect side (in Protect's repository)

- [x] P1. Split the station file parser (`parse_station_jsonl`, `parse_station_line`, `_lp0_metadata`, `unpack_card_zip`, `looks_like_station_file`, `StationFrame`) out of `shared/logfiles.py` into a module without database imports, so Protect Go can read a card with it; Protect's own code imports it from there (done in Protect, 8c0a6b6, 2026-10-17)
- [x] P2. `GET /projects/{id}/field-bundle`: the project's devices with type, serial, DevEUI and current entity; the entities' names; the LP0 credentials of the trackers the caller may see (the permission that shows keys on the device page), none for a caller without it; the stations; the project's area; a version stamp and the Protect version. Access control tested per role. Bounded: one project (done in Protect, 8c0a6b6, 2026-10-17; the shape is in `docs/contract.md`)
- [ ] P3. The map extract: the project's bounding box cut from a Protomaps planet build as PMTiles, cached per project on the server, part of the bundle or fetched beside it. Decide the zoom range by size against the areas Protect has; record it
- [x] P4. Document the contract on Protect's side (`docs/devices/field-companion.md` there) and pin Protect Go to the commit (8c0a6b6, 2026-10-17)

### Phase 1b: installed like AddaxAI (2026-10-17)

- [x] I1. The Electron shell (`electron/`): starts the frozen backend, waits for health, shows the interface, registers `protect-go://`, menu with Check for updates and the data folder
- [x] I2. The frozen backend (`backend.spec`) with the built interface, `VERSION` and `uv.lock` inside; health names the decoders; 148 MB on Linux
- [x] I3. electron-builder: `ProtectGo-Setup.exe`, `ProtectGo-arm64.dmg`, `ProtectGo-amd64.deb`, the icon, NSIS asking before removing the data, hardened runtime and notarisation hook
- [x] I4. `build-installers.yml` on a published release and by hand; signing when the secrets exist; the frozen backend checked before packaging. Proven by a manual run on 2026-10-17 (39017725897): `ProtectGo-Setup.exe` 143 MB, `ProtectGo-arm64.dmg` 158 MB, `ProtectGo-amd64.deb` 145 MB, unsigned; the first run failed on Linux until the shell's package named a homepage
- [x] I5. The first-run setup: the server (probed), the account (Protect's login), the token kept and the password not; `?server=` prefilled from the protocol link
- [x] I6. The update notice from GitHub's releases list, and Check for updates in the menu
- [x] I7. The user page rewritten after AddaxAI's install guide: per system, the warnings, updates, uninstall, the data folder
- [x] I8. The first release `v0.1.0` published on 2026-10-17 at Tim's word, with notes written for users; the workflow attached the three installers
- [ ] I9. Certificates: a Windows Authenticode certificate and an Apple Developer ID with notarisation credentials as repository secrets, then `REQUIRE_SIGNING` on (Tim)

### Phase 2: a card read offline

- [x] F1. The bundle (2026-10-17): the Load page picks the project and `POST /api/bundle/fetch` fetches the field bundle and then the map in one go; `bundle.enc` in the data folder, encrypted with the keychain key (D11); the first screen shows what is on the laptop and warns after a week; `GET /api/bundle`, `DELETE /api/bundle`. The SQLite store for the cards comes with F2
- [x] F2. The card (2026-10-17): `protect_go/cards.py`, a zip or the `LOG_*` folders' files dropped in, each file parsed with `shared.station_files`, every frame opened and read through `shared.station_decode` with the bundle's keys, the records under Protect's canonical keys in `field.db` (SQLite) so a repeat counts once, every frame with its outcome (decoded, repeated, refused with the server's code and words, unknown address, unreadable line), the files kept under `cards/<id>/` for the upload; `POST /api/cards`, `GET /api/cards`, `GET /api/cards/{id}` (files, trackers, failures), `GET /api/cards/{id}/positions`, `DELETE`. The Cards page with the drop zone and the card page with the positions on the offline map
- [x] F0. The offline map (D4; 2026-10-17): `POST /api/map/fetch` gets the project's PMTiles from Protect's `GET /projects/{id}/field-bundle/map` (asking for it when the server has none), `GET /api/map/tiles.pmtiles` serves it with range requests, the Map page draws it with Protomaps' style and the sprites and glyphs shipped in `public/map/`; `GET /api/projects` for the picker
- [ ] F3. The pages beyond the card: per tracker across cards a map of its positions and a table of its measurements, bounded by a window; per station what it collected (the card page shows a card's own trackers, positions and failures since F2)
- [x] F4. The upload (2026-10-17): `protect_go/uploads.py` sends each pending or failed file of a card to the station's `POST /devices/{id}/offload-files`, one request per file, and keeps the server's answer on the file (`uploaded` with the log file id, `duplicate` when the server had it, `refused` with the words, `failed` to try again); a 401 or 403 stops the run with the way out named; a card whose station the project does not know waits with a word. `GET /api/uploads`, `POST /api/uploads/run`; the Upload page and the first screen's waiting count
- [ ] F5. Packaging as the replay app was packaged: Docker Desktop launchers for Windows and macOS, and a plain `uv run` path; the data folder outside the repository
- [ ] F6. A tracker or station read over Web Bluetooth in the field (Chrome on a laptop), as Protect's station dialog does, so a device's credentials reach the bundle without a connection; decide whether this is Protect Go's or stays Protect's

### Phase 3: parked

- [ ] Notes or events recorded offline that must travel to Protect, as an append-only outbox, only when asked for
- [ ] A core package split in Protect if `shared`'s server dependencies weigh on the laptop install

## Risks

| Risk | Mitigation |
| --- | --- |
| Protect's `shared` moves a module Protect Go imports | The proof test fails on `bump-protect` before a release; the allowed modules are listed in `DEVELOPERS.md` |
| Session keys on a laptop | Encrypted at rest with the user's key; never logged; the bundle carries only what the user may see in Protect; the pre-commit hook refuses keys in code |
| The map extract is too large for a field laptop | Zoom range decided by size in P3; the extract is optional, the data pages work without it |
| Two readings of one card differ | Same code at a pinned commit; the first screen names the commit; Protect's reading is the record |

## Session log

### 2026-10-17, the design and the repository (Claude and Tim)

- Tim asked whether offline review of SD card files should be a separate app with its own map tiles or part of Protect. Claude checked that Protect's LP0 codec and OpenCollar driver have no server dependencies, that the station file parser mixes parsing with database writes, that Protect's base maps come from OpenFreeMap over the network, and that the existing replay app (`smartparks-lp0-replay-app`, Flask, 9500 lines in one file, the TTN JavaScript decoder, Semtech UDP logs) is a different input with its own decoder. Recommended a companion in its own repository on Protect's `shared` package with the card files as the unit of sync. Tim agreed and asked for a new repository under Protect's rules.
- Built phase 0: the repository with Protect's documents mirrored, the Python package and the proof test (Protect's codec unwraps the firmware fixture here with no database), the frontend skeleton on Protect's configuration, CI, the docs site, `bump-protect`. Protect pinned at 2755c92. Decisions D1 to D5, ADR 0001.
- Noted for Protect: P1 to P4 under phase 1; recorded in Protect's plan as decision D331 so the two plans point at each other.
- CI: the first run failed in the dependency audit because the export listed Protect's shared package, which pip-audit cannot find on PyPI; the audit leaves it out as Protect's image audit leaves its path packages out (ad9bafa). Green since. Dependabot alerts switched on as Protect has them. Tim opened the repository; private vulnerability reporting switched on, the pages job added, and a user page written (`docs/using-protect-go.md`: where Protect Go runs, install, the cycle; the planned steps marked as such).
- Next: P1 and P2 in Protect, then phase 2 here.

### 2026-10-17, the Protect side built, the repository public (Claude and Tim)

- Tim opened the repository; the docs site publishes from `main` (the Pages site had to be created once with Tim's token, the workflow token may not), private vulnerability reporting on. A user page (`docs/using-protect-go.md`) says where Protect Go runs (the user's laptop, 127.0.0.1, never the server) and how the cycle goes, with the unbuilt steps marked planned.
- Protect built P1 (the parser as `shared.station_files`), P2 (`GET /projects/{id}/field-bundle`) and P4 (the page in Protect's docs) in commit 8c0a6b6; Protect Go pinned at it with `bump-protect`, the proof test now also parses a station line with Protect's parser. `docs/contract.md` carries the bundle's shape as built.
- Next: phase 2 F1 and F2.

### 2026-10-17, installed like AddaxAI (Claude and Tim)

- Tim: look at how the desktop AddaxAI (not Connect) offers installs on Apple and Windows, use the same methods, users are not technical; the install must start from Protect's Offload page; the setup asks the server URL, then email and password; think about automatic update checks. Read AddaxAI's `build-electron.yml`, `electron/package.json`, `backend.spec`, `main.ts`, `useLatestRelease.ts`, the download cards and the install page: an Electron shell over a PyInstaller backend, NSIS and dmg and deb from electron-builder on a published release, signed and notarised, fixed asset names, a releases-list check at start with a notice, the new installer over the old.
- Built the same here (D6 to D10, phase 1b): the shell, the frozen backend (runs on Linux, health names the decoders), the electron-builder block, the installers' workflow (signing when the secrets exist, else a warning), the setup and session endpoints with tests, the setup and sign-in pages, the update notice, the user page after AddaxAI's. The Protect side (the Offload page's card and the protocol link) is Protect's D332.
- The manual installer build on GitHub made all three installers (the Linux one after the shell's package got a homepage, 935c777). The artifacts of a manual run live 14 days; a release carries them for good.
- Open for Tim: publish v0.1.0 so the installers exist (I8), and the certificates (I9).

### 2026-10-17, the offline map (Claude and Tim)

- Tim asked for the next steps and then to start with the first: the offline map of the LP0 network's area. Protect's side (P3, commit 282eac0 there): the export worker cuts the project's area, with a 5 km margin, from the newest Protomaps planet build with go-pmtiles down to zoom 14 and keeps it in MinIO; `GET /projects/{id}/field-bundle/map` streams it. Here: `POST /api/map/fetch`, the range-serving `GET /api/map/tiles.pmtiles`, the Map page with Protomaps' style and the sprites and glyphs shipped in `public/map/` (2.4 MB: light and dark sprites, Noto Sans Regular, Medium and Italic for Latin, Greek, Cyrillic and punctuation), `GET /api/projects` for the picker. Tests with a mock server and a synthetic PMTiles file. Then against dev itself: Protect Go set to dev-protect, signed in as the ops account, the LP0 project's map fetched (505 KB, build 20261017, zoom 14, cut by dev in nine seconds) and drawn on the Map page in a headless browser with no failed request.
- Next: Protect P6 (one decode function), then F1 and F2.

### 2026-10-17, the shared decode path pinned (Claude and Tim)

- Protect's P6 (d79ffaf): `shared.station_decode` opens a station frame with the tracker's keys, refuses it with the trace's codes and words, and has the driver read the records; the pipeline calls it and a test decodes a frame both ways. Protect Go pinned at it; `protect_go/decoding.py` imports it and the proof test reads a stored stream through it. F2 reads a card with these two calls.
- Next: F1 and F2.

### 2026-10-17, the bundle (Claude and Tim)

- F1: the Load page and `POST /api/bundle/fetch` (the bundle, then the map, one button), `BundleStore` with `bundle.enc` encrypted under a key from the keychain or a key file (D11), the summary without keys on the first screen with the week-old warning, `DELETE /api/bundle`. The Map page lost its own picker; the Load page does both. Tests: a mock server, the file on disk holding no key or address in the clear, the key file mode 600, a stale envelope, another key reading nothing.
- Next: F2.

### 2026-10-17, a card read (Claude and Tim)

- F2: `CardStore` in SQLite (`field.db`): the dropped files as members (a zip's `*.jsonl` with their folders, loose `.jsonl` with the folder from the name), each parsed with Protect's parser, each frame routed to the tracker by its LP0 address from the bundle, opened and read through `shared.station_decode` with the bundle's keys, the records under canonical keys so a repeat counts once, every frame with its outcome and the server's code and words when refused, the files kept for the upload. The Cards page (drop zone, folder and zip pickers, the list) and the card page (counts, trackers with their span, the positions on the offline map, the failures, the files, removal). Tests on a synthetic card: one decoded frame, one repeat, one unknown address, one wrong key, one unreadable line, the same card again all repeats; a bundle without keys refusing with `CREDENTIALS_MISSING`. Against dev: the LP0 project loaded, the three demo cards of `scripts/lp0_demo_cards.py --out` read in under half a second each, every frame decoded (555, 560 and 560; the hippo's 932, 960 and 960 positions over a month, the stations' 360 own reports each), none refused, the positions drawn on the offline map of Gola.
- Next: F4.

### 2026-10-17, the upload (Claude and Tim)

- F4: the upload state per file on `card_files` (added to an existing database by `_migrate`), `run_uploads` sending one file a request to the station's offload-files endpoint with the server's answer kept per file, a 401 or 403 stopping the run with the way out named, a card of a station the project does not know waiting with a word; the Upload page with the counts per card and one button; the first screen's Upload button carries the waiting count. Tests: one file taken and one the server had already (its 422 naming "uploaded before"), an expired sign-in stopping the run, an unknown station waiting. Against dev: the demo card SP050101 (31 files) uploaded in 3.1 seconds, every file taken; the same card read into a fresh Protect Go and uploaded again came back as 31 duplicates. Note: the demo script's `--out` run of 2026-10-17 writes files relative to that day, so they differed from the 19 files the script uploaded on 2026-10-16 and dev took them as new (a day-shifted copy of the demo month on the station SP050101); synthetic data in the demo project, cleaned by hand if it bothers.
- Released as v0.2.0 the same day.

### 2026-10-17, Protect Go (Claude and Tim)

- Tim: "Field" looks strange in a sentence; after the choices (keep the name with a wording rule, or a name that works as a word), Protect Go. D12: everything renamed (repository, package, command, installers, scheme, data folder, settings prefix, keychain service), and the wording rule applied to every text: the full name once, "the app" after that. Released as v0.3.0 so the Offload page's links, which point at the newest release's names, resolve.
