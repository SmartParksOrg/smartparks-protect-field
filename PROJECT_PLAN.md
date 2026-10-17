# Smart Parks Protect Field project plan

Living plan for building Smart Parks Protect Field, the companion of Smart Parks Protect for the place without a connection. It is the first thing to read in every coding session and the last thing to update before the session ends. It follows the shape of Protect's `PROJECT_PLAN.md` so a reader of one knows the other.

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
| Active phase | Phase 0 (the repository and its tooling) built on 2026-10-17; phase 1 (the Protect side) next |
| Latest release | None. `VERSION` is `v0.0.0` |
| Last session | 2026-10-17 (Claude and Tim): the design chosen (ADR 0001, D1 to D5), the repository created with Protect's conventions, hooks, CI, docs and frontend tooling mirrored, the Python package with the server skeleton and the proof that Protect's decoding runs here, the frontend skeleton with its first screen, the documentation site; Protect pinned at 2755c92. Committed as 9391087, pushed to `SmartParksOrg/smartparks-protect-field` (private); the first CI run failed on the audit's export of the git package, fixed in ad9bafa, CI green since |
| Next item | P1 and P2 in Protect (the parser split and the field bundle endpoint), then phase 2 here |
| Blockers | A real LP0 v5 card does not exist yet (Protect's O8 waits for the firmware developer); until then the cards are synthetic, built with `build_uplink` as Protect's demo script builds them |

## What we are building

A local program, a Python server with a browser interface, that a person runs on a laptop in the field. They load a field bundle of their project from Protect while online, go to the stations, copy the SD cards, read them in Field, see the positions and the measurements of the trackers on an offline map and in tables, and upload the card files to Protect when they are back online. Protect decodes the files itself; Field's reading is for the field, Protect's is the record.

Design principles, from Protect's: devices are hardware and entities are what you care about; raw data is kept and is what travels; canonical time is device time; every list and map is bounded; nothing a person reads is hard-coded English.

## Decisions

| ID | Decision | Detail | Why |
| --- | --- | --- | --- |
| D1 | A companion in its own repository, on Protect's `shared` package pinned by commit | ADR 0001. Field installs `smartparks-protect-shared` from Protect's repository (subdirectory `shared`) at a commit; `scripts/dev.sh bump-protect` moves the pin and reruns the decoding proof. Field keeps no decoding code of its own | Tim (2026-10-17) asked whether to build an offline app with map tiles separately or inside Protect; Claude recommended the companion over Protect offline (a replication problem), an offline browser mode (a second decoder in TypeScript) and extending the replay app (a third decoder). Tim: "I think you are correct" |
| D2 | The card files are the unit of sync, in both directions | Down: a field bundle from Protect (devices, entities, the credentials the user may see, stations, area, map extract). Up: the untouched card files to Protect's log files endpoint. Nothing decoded leaves Field. Notes or edits made offline are out of scope until asked; then an append-only outbox, never a merge | Protect already dedups a card by digest and a frame by hash, so the upload needs no protocol; two decodings of the same bytes by the same code need no reconciliation |
| D3 | Protect's conventions, tooling and documents mirrored, Protect's copies the master | `CONVENTIONS.md`, `CODE_OF_CONDUCT.md`, the hooks, ruff and mypy configuration, the CI shape, Dependabot, MkDocs, the frontend configuration and shadcn components copied; differences listed in `DEVELOPERS.md` | Tim (2026-10-17): "make sure it adheres to all the relevant rules and conventions from the protect repo (so we do not have to define that all again)" |
| D4 | Offline map tiles as a PMTiles extract of the project's area, made by Protect in the bundle | Protomaps' daily planet builds support range extraction; Protect cuts the project's bounding box server side; MapLibre reads the file locally through the pmtiles protocol. A park at zoom 14 is tens of megabytes | Protect's own base maps (OpenFreeMap styles) need a connection; a single file travels with the bundle and needs no tile server on the laptop |
| D5 | The name `smartparks-protect-field`, private until Tim opens it, MIT | Under SmartParksOrg beside `smartparks-protect`; the Python package is `protect_field`, the product name "Smart Parks Protect Field" | Named for where it runs. Private at creation so Tim decides what is shown; one click opens it and lets GitHub Pages publish the docs site |

## Definition of done

Every item, every phase:

- Code follows `CONVENTIONS.md`; ruff, mypy strict and the tests pass; the frontend lints, type checks, builds and its tests pass; the English catalogue is current.
- Tests exist for new behaviour. Cards in tests are synthetic, built from the firmware's fixture; no real keys.
- `DEVELOPERS.md`, `docs/`, `CHANGELOG.md` (Unreleased) updated in the same commit; an ADR for an architectural choice.
- Every list and map bounded. Nothing decoded leaves Field. No decoding code outside Protect's `shared`.
- The plan ticked in the same commit; a session log entry at the end of the session.

## Phases

### Phase 0: the repository and its tooling (2026-10-17)

- [x] The repository under SmartParksOrg with Protect's licence, code of conduct, conventions (mirrored), contributing, security policy, changelog, Dependabot
- [x] The git hooks: assistant trailers stripped, credentials refused (the firmware's synthetic fixture allowed)
- [x] `pyproject.toml` with Protect's pins and the dependency on `smartparks-protect-shared` by commit; `uv.lock`
- [x] `protect_field`: settings under `FIELD_`, the server with `/api/health` naming the version and the Protect commit, the built interface served
- [x] `tests/test_protect_decoding.py`: Protect's LP0 codec unwraps the firmware fixture here, the OpenCollar driver loads, no Protect environment variable is set
- [x] The frontend skeleton on Protect's stack and configuration with its colour tokens, the first screen, English and Dutch catalogues, a component test
- [x] CI: python, frontend, docs, audit; `scripts/dev.sh` with `bump-protect`
- [x] The documentation site: index, the contract with Protect, ADR 0001

### Phase 1: the Protect side (in Protect's repository)

- [ ] P1. Split the station file parser (`parse_station_jsonl`, `parse_station_line`, `_lp0_metadata`, `unpack_card_zip`, `looks_like_station_file`, `StationFrame`) out of `shared/logfiles.py` into a module without database imports, so Field can read a card with it; Protect's own code imports it from there
- [ ] P2. `GET /projects/{id}/field-bundle`: the project's devices with type, serial, DevEUI and current entity; the entities' names; the LP0 credentials of the trackers the caller may see (the permission that shows keys on the device page), none for a caller without it; the stations; the project's area; a version stamp and the Protect version. Access control tested per role. Bounded: one project
- [ ] P3. The map extract: the project's bounding box cut from a Protomaps planet build as PMTiles, cached per project on the server, part of the bundle or fetched beside it. Decide the zoom range by size against the areas Protect has; record it
- [ ] P4. Document the contract on Protect's side (`docs/devices/offload-stations.md` or a page of its own) and pin Field to the commit

### Phase 2: a card read offline

- [ ] F1. The local store: SQLite in the data folder; a bundle loaded from a file or fetched from a Protect server the user signs in to, encrypted on disk with a key the user gives; the bundle's age shown and a fresh one asked for when online
- [ ] F2. The card: a folder or zip dropped in, routed to the station by its EUI from the file names, parsed with P1, every frame unwrapped with the tracker's credentials from the bundle and decoded with the OpenCollar driver; the result (positions, measurements, states, events) stored per card; a frame that fails kept with its reason
- [ ] F3. The pages: the cards read with their status; per tracker a map of its positions on the offline tiles (D4) and a table of its measurements, bounded by a window; per station what it collected
- [ ] F4. The upload queue: each card file to Protect's log files endpoint when online, Protect's answer kept (accepted, duplicate, refused), retried on failure, shown
- [ ] F5. Packaging as the replay app was packaged: Docker Desktop launchers for Windows and macOS, and a plain `uv run` path; the data folder outside the repository
- [ ] F6. A tracker or station read over Web Bluetooth in the field (Chrome on a laptop), as Protect's station dialog does, so a device's credentials reach the bundle without a connection; decide whether this is Field's or stays Protect's

### Phase 3: parked

- [ ] Notes or events recorded offline that must travel to Protect, as an append-only outbox, only when asked for
- [ ] A core package split in Protect if `shared`'s server dependencies weigh on the laptop install

## Risks

| Risk | Mitigation |
| --- | --- |
| Protect's `shared` moves a module Field imports | The proof test fails on `bump-protect` before a release; the allowed modules are listed in `DEVELOPERS.md` |
| Session keys on a laptop | Encrypted at rest with the user's key; never logged; the bundle carries only what the user may see in Protect; the pre-commit hook refuses keys in code |
| The map extract is too large for a field laptop | Zoom range decided by size in P3; the extract is optional, the data pages work without it |
| Two readings of one card differ | Same code at a pinned commit; the first screen names the commit; Protect's reading is the record |

## Session log

### 2026-10-17, the design and the repository (Claude and Tim)

- Tim asked whether offline review of SD card files should be a separate app with its own map tiles or part of Protect. Claude checked that Protect's LP0 codec and OpenCollar driver have no server dependencies, that the station file parser mixes parsing with database writes, that Protect's base maps come from OpenFreeMap over the network, and that the existing replay app (`smartparks-lp0-replay-app`, Flask, 9500 lines in one file, the TTN JavaScript decoder, Semtech UDP logs) is a different input with its own decoder. Recommended a companion in its own repository on Protect's `shared` package with the card files as the unit of sync. Tim agreed and asked for a new repository under Protect's rules.
- Built phase 0: the repository with Protect's documents mirrored, the Python package and the proof test (Protect's codec unwraps the firmware fixture here with no database), the frontend skeleton on Protect's configuration, CI, the docs site, `bump-protect`. Protect pinned at 2755c92. Decisions D1 to D5, ADR 0001.
- Noted for Protect: P1 to P4 under phase 1; recorded in Protect's plan as decision D331 so the two plans point at each other.
- CI: the first run failed in the dependency audit because the export listed Protect's shared package, which pip-audit cannot find on PyPI; the audit leaves it out as Protect's image audit leaves its path packages out (ad9bafa). Green since. Dependabot alerts switched on as Protect has them; private vulnerability reporting waits for the repository to be public.
- Next: P1 and P2 in Protect, then phase 2 here.
