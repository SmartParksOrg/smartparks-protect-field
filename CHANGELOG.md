# Changelog

All notable changes to Smart Parks Protect Go. The format follows Keep a Changelog; versions are git tags. Each entry names the Protect commit the release decodes with.

## Unreleased

Nothing yet.

## v0.8.5, 2026-10-17

### Fixed

- After an update the new window could show the old interface: the installer closed the old window but its backend kept running on the port, and the new window used it (decision D20). The app now stops a backend of another version before starting its own, so what you see is always the version you installed. If an older backend will not stop, the app says so and names the way out.

### Changed

- "Load a project" moved under Settings, next to Server, since a project belongs to a server (Tim, 2026-10-17). The Overview's server card leads to the Server page alone; "Another server" lives there.

## v0.8.4, 2026-10-17

### Changed

- The notice's download buttons fetch this computer's installer straight from the newest release (`ProtectGo-Setup.exe`, the dmg or the deb) instead of opening the user page, with "All versions" beside them; the user page starts its Install section with a table of the three downloads (Tim, 2026-10-17: the page's links were inside its text).

## v0.8.3, 2026-10-17

### Fixed

- The self-update refused its own download: electron-updater demanded the publisher's signature on the installer, which the unsigned installers do not carry ("not signed by the application owner"). An unsigned build now says so and skips that check; a signed build keeps it (Tim, 2026-10-17). From v0.7.0 to v0.8.2 the update has to be installed by hand once more.

### Changed

- The download of an update shows a progress bar.
- The release check repeats every quarter hour and when the window regains focus, so a release made while the app runs shows soon; the start's answer stood for an hour (Tim, 2026-10-17).

## v0.8.2, 2026-10-17

### Changed

- "Check for updates…" in the menu answers on whatever page is open: a note at the top says that the check runs, then that the app is up to date, that a newer version exists with the way to it, or that the check failed (Tim, 2026-10-17: nothing came back, not even "up to date").
- A release is published only once its installers are attached (decision D19): the workflow builds on the pushed tag and takes the release out of draft at the end. An installed app that checked while the files were still being built got "Cannot find latest.yml" (Tim, 2026-10-17).

## v0.8.1, 2026-10-17

### Changed

- The full screen note is a short pill at the top centre, away from the connection dot, and fades after a few seconds; the pointer at the top edge brings it back (Tim, 2026-10-17).

## v0.8.0, 2026-10-17

### Changed

- The Server page shows what the app is connected to (decision D18): the server with its Protect version, whether it answers right now with the time of the last check and a "Check now", and the account on that server, signed in until when, with Sign out and Sign in as someone else; the forms appear only when something is to be changed or the sign-in has run out. Account left the sidebar; it lives on the Server page. The top bar's dot follows the live state: green online and signed in, amber online without a sign-in, grey when the server does not answer.

## v0.7.0, 2026-10-17

### Added

- The app updates itself on Windows (decision D17): the notice's "Download and install" fetches the new version in the background and "Restart to update" installs it and opens the app again; a finished download installs on quit too. The release carries `latest.yml` and the blockmap beside the Windows installer for this. macOS waits for code signing, which it demands for self-updates; the Debian package keeps the download link.

## v0.6.0, 2026-10-17

### Added

- The SD card found by itself (decision D16): the Files page lists the removable drives in the computer with the station files found on them, and "Read this SD card" reads the whole card at once; "Pick the card's folder" opens the system's folder dialog for a copy of the card. The way out of full screen: Esc or F11 leaves it, and a bar on the page offers a button, since the menu bar disappears in full screen on Windows.
- Signed in from Protect's Offload page (decision D15): the `protect-go://connect` link carries a one-time code beside the server, the app exchanges it at `POST /api/v1/auth/go-handoff/exchange` for a token of 30 days and lands on Overview; nothing is typed. Email and password stay as the way in when the app was not opened from that page. Protect's side is its decision D333.

### Changed

- The app icon is the Smart Parks logo with its name, white on brand green, instead of the mark alone.
- The user guide tells Windows 11 users with Smart App Control what to do, since it blocks an unsigned app with no way to run it anyway.

## v0.5.0, 2026-10-17

Protect's file explorer for the files; only projects with an offload station are offered. Protect pinned at d79ffaf.

### Changed

- The Files page is Protect's file explorer (decision D14): one line per file with its SD card, station, upload state, frames, positions and size, or tiles, with a search, a column picker and the view remembered; a click opens the file's properties with the counts, the trackers, what could not be read and the way to its SD card's page. The SD card is a filter above the list.
- Loading a project offers only the projects that have an offload station, since a project without one has no card to read; the page says how many it left out.

## v0.4.0, 2026-10-17

Protect's shell and words, and the project map. Protect pinned at d79ffaf.

### Added

- The project map (decision D4, phase 2 F3): every tracker's track from the files on the laptop in its own colour over the offline map, a tracker and a time window to choose, a click on a fix for who and when. A page per tracker with its track, the metrics it reported with their newest values, and one metric's values as a table.

### Changed

- The app wears Protect's shell (decision D13): the same sidebar and drawer, top bar with the logo, page headers, theme switch and language choice, so the pages look and navigate as Protect's do.
- The SD card's files are called files, never cards: the Files page, "Read SD card files", "Files on this laptop"; in Dutch "bestanden", so the map ("kaart") is the only map.

## v0.3.0, 2026-10-17

### Changed

- The app is Protect Go (decision D12): the installers are `ProtectGo-Setup.exe`, `ProtectGo-arm64.dmg` and `ProtectGo-amd64.deb`, the data folder `ProtectGo` in your home folder, the link from Protect's Offload page `protect-go://`. Install this version over Protect Field; the server, your sign-in and the project you loaded are kept in the old folder `ProtectField`, so load the project again once (a minute online), and read any card you had read again if you still have it. Every text names the app once and says "the app" after that.

## v0.2.0, 2026-10-17

The whole cycle: load a project, read a card offline, see it on the map, upload it. Protect pinned at d79ffaf.

### Added

- The upload to Protect: the Upload page sends the card files that wait to the server, one by one and exactly as they were on the card, and keeps the server's answer on each: taken, had already, refused. A sign-in that expired stops the run and says so; a card whose station the project does not know waits until the station is made on Protect's Offload page.
- Reading a card: drop a card's LOG folders or a zip of them on the Cards page; every frame is read with the project's keys through Protect's own decode path, the records kept on the laptop, the positions drawn on the offline map, and every frame that could not be read listed with the server's own reason. The files are kept as they were for the upload.
- Loading a project (decision D11): the Load page fetches the project's field bundle from the Protect server, the devices, entities, stations and the LP0 keys the account may see, and the map with it, in one button; the bundle is kept encrypted on the laptop with a key in the operating system's keychain, or in a key file where there is none, and the first screen says what is on the laptop and warns after a week.
- Protect pinned at d79ffaf (main of 2026-10-17), which brings `shared.station_decode`, the one decode path of a station frame the server's pipeline and Protect Go share; the proof test opens a frame and reads a stored stream through it.
- The offline map (decision D4): the Map page fetches the project's PMTiles map from the Protect server while online (asking the server to cut it when it has none yet) and draws it on the laptop without a connection, with Protomaps' basemap style and its sprites and glyphs shipped inside Protect Go; the backend serves the file with range requests. The account's projects are listed for the picker.

## v0.1.0, 2026-10-17

The first release: the installers and the first-run setup. Reading a card, the map and the upload queue come in the next releases.

### Added

- The repository: Protect's conventions mirrored, the git hooks, CI (ruff, mypy, pytest; the frontend's lint, catalogue check, build and tests; the documentation site built strictly; a dependency audit), Dependabot for security updates, MIT licence (2026-10-17).
- The Python package `protect_go` with a local FastAPI server (`/api/health` naming the version and the Protect commit) that serves the built interface, settings under `FIELD_`, and the dependency on Protect's `shared` package pinned by commit (decision D1). A test proves Protect's LP0 codec and OpenCollar driver work here with no database, broker or Protect settings.
- The frontend skeleton on Protect's stack (React 19, Vite, TypeScript strict, Tailwind 4, shadcn/ui, TanStack Query, React Router, i18next with English as the key and Dutch beside it) with Protect's colour tokens and its first screen.
- `scripts/dev.sh` with `run`, `test`, `lint`, `format`, `docs`, `hooks` and `bump-protect`, which moves the Protect pin and reruns the decoding proof.
- The documentation site: the contract with Protect (the field bundle down, the card files up), ADR 0001, and a user page (where Protect Go runs, how to install it, the cycle of bundle, card and upload), published from `main`.

- Installers after AddaxAI's (decision D6): an Electron shell (`electron/`) that starts the PyInstaller-frozen backend (`backend.spec`) and shows the interface; electron-builder makes `ProtectGo-Setup.exe` (Windows, per user), `ProtectGo-arm64.dmg` (macOS, Apple Silicon) and `ProtectGo-amd64.deb`; the workflow `build-installers.yml` builds them when a release is published and attaches them, signed and notarised when the certificates are present. The Smart Parks mark on brand green as the icon.
- The first-run setup (decision D7): the Protect server, checked by its `/api/version`, then the account's email and password through Protect's own login; the token is kept in the data folder, the password never. `protect-go://connect?server=…` opens Protect Go with the server filled in (decision D9), for Protect's Offload page.
- The update notice (decision D8): at start Protect Go looks at the newest release on GitHub and shows a newer version with its notes and a download button; Check for updates in the menu does the same.
- Protect pinned at 8c0a6b6 (main of 2026-10-17), which brings `shared.station_files`, the parser without a database, and the field bundle endpoint; the proof test parses a station line with it.

Protect pinned at 8c0a6b6 (main of 2026-10-17).
