# Changelog

All notable changes to Smart Parks Protect Field. The format follows Keep a Changelog; versions are git tags. Each entry names the Protect commit the release decodes with.

## Unreleased

### Added

- Loading a project (decision D11): the Load page fetches the project's field bundle from the Protect server, the devices, entities, stations and the LP0 keys the account may see, and the map with it, in one button; the bundle is kept encrypted on the laptop with a key in the operating system's keychain, or in a key file where there is none, and the first screen says what is on the laptop and warns after a week.
- Protect pinned at d79ffaf (main of 2026-10-17), which brings `shared.station_decode`, the one decode path of a station frame the server's pipeline and Field share; the proof test opens a frame and reads a stored stream through it.
- The offline map (decision D4): the Map page fetches the project's PMTiles map from the Protect server while online (asking the server to cut it when it has none yet) and draws it on the laptop without a connection, with Protomaps' basemap style and its sprites and glyphs shipped inside Field; the backend serves the file with range requests. The account's projects are listed for the picker.

## v0.1.0, 2026-10-17

The first release: the installers and the first-run setup. Reading a card, the map and the upload queue come in the next releases.

### Added

- The repository: Protect's conventions mirrored, the git hooks, CI (ruff, mypy, pytest; the frontend's lint, catalogue check, build and tests; the documentation site built strictly; a dependency audit), Dependabot for security updates, MIT licence (2026-10-17).
- The Python package `protect_field` with a local FastAPI server (`/api/health` naming the version and the Protect commit) that serves the built interface, settings under `FIELD_`, and the dependency on Protect's `shared` package pinned by commit (decision D1). A test proves Protect's LP0 codec and OpenCollar driver work here with no database, broker or Protect settings.
- The frontend skeleton on Protect's stack (React 19, Vite, TypeScript strict, Tailwind 4, shadcn/ui, TanStack Query, React Router, i18next with English as the key and Dutch beside it) with Protect's colour tokens and its first screen.
- `scripts/dev.sh` with `run`, `test`, `lint`, `format`, `docs`, `hooks` and `bump-protect`, which moves the Protect pin and reruns the decoding proof.
- The documentation site: the contract with Protect (the field bundle down, the card files up), ADR 0001, and a user page (where Field runs, how to install it, the cycle of bundle, card and upload), published from `main`.

- Installers after AddaxAI's (decision D6): an Electron shell (`electron/`) that starts the PyInstaller-frozen backend (`backend.spec`) and shows the interface; electron-builder makes `ProtectField-Setup.exe` (Windows, per user), `ProtectField-arm64.dmg` (macOS, Apple Silicon) and `ProtectField-amd64.deb`; the workflow `build-installers.yml` builds them when a release is published and attaches them, signed and notarised when the certificates are present. The Smart Parks mark on brand green as the icon.
- The first-run setup (decision D7): the Protect server, checked by its `/api/version`, then the account's email and password through Protect's own login; the token is kept in the data folder, the password never. `protect-field://connect?server=…` opens Field with the server filled in (decision D9), for Protect's Offload page.
- The update notice (decision D8): at start Field looks at the newest release on GitHub and shows a newer version with its notes and a download button; Check for updates in the menu does the same.
- Protect pinned at 8c0a6b6 (main of 2026-10-17), which brings `shared.station_files`, the parser without a database, and the field bundle endpoint; the proof test parses a station line with it.

Protect pinned at 8c0a6b6 (main of 2026-10-17).
