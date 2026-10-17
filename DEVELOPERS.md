# Developer documentation

This file describes how the Smart Parks Protect Field codebase works today. The plan for where it is going lives in `PROJECT_PLAN.md`. Conventions live in `CONVENTIONS.md`, mirrored from Protect; the frontend's in `frontend/FRONTEND_CONVENTIONS.md`.

Status: phase 0 (2026-10-17), the repository and its tooling; nothing a user can run yet. Protect's `shared` package is pinned at 8c0a6b6 (Protect's `main` of 2026-10-17, decisions up to D331, with `shared.station_files` and the field bundle endpoint). Decisions here at D5.

## What this program is

Smart Parks Protect Field reads the SD card of a RangerEdge offload station where there is no connection, decodes the trackers' frames with Protect's own code, shows the result, and hands the untouched card files to Protect when there is a connection. Protect is the source of truth; Field is a reader with a queue. The reasoning is ADR 0001 in `docs/adr/`.

## Relationship to Protect

- **One decoder.** `pyproject.toml` depends on `smartparks-protect-shared` from Protect's repository, subdirectory `shared`, pinned to a commit under `[tool.uv.sources]`. `scripts/dev.sh bump-protect [rev]` moves the pin, relocks and reruns `tests/test_protect_decoding.py`, which unwraps the firmware's LP0 fixture with Protect's codec and loads the OpenCollar driver. Record a bump in `CHANGELOG.md` and in the status line above.
- **Modules Field may import from `shared`:** `shared.connectivity.adapters.lp0_station` (the LP0 codec and adapter), `shared.device_drivers` (the drivers and their base), `shared.connectivity.base`, `shared.enums`, `shared.timeutil`, `shared.geodesy`, and `shared.station_files` (the station file parser, split out for Field by Protect's phase 43 P1). **Never:** `shared.config` (wants a database URL and a broker), `shared.bus`, `shared.models`, `shared.database`, `shared.storage`, `shared.trace`'s database half, `shared.domain.*`. The tests run without `DATABASE_URL`, `REDIS_URL`, `MINIO_ENDPOINT` or `JWT_SECRET` and one test asserts none is set; CI sets none.
- **What Protect provides** (planned there, see the contract in `docs/contract.md`): the field bundle endpoint and the map extract; the card upload is Protect's existing log files endpoint.
- **Conventions, tooling and documents** are copied from Protect: `CONVENTIONS.md`, `CODE_OF_CONDUCT.md`, the git hooks, the ruff and mypy configuration, the CI shape, Dependabot, the MkDocs site, the frontend's configuration and its shadcn components. Protect's copies are the master. When Protect changes one, copy the change here.

### Differences from Protect

- One Python package (`protect_field`) instead of a uv workspace; `src = ["."]` for ruff.
- No database server: the local store (phase 2) is SQLite, through SQLAlchemy since `shared` brings it.
- No authentication: the program runs on one person's computer and listens on 127.0.0.1. The bundle on disk is encrypted with a key the user gives (phase 2).
- Settings carry the prefix `FIELD_` (`protect_field/config.py`, `.env.example`).
- The pre-commit hook has no Ansible paths and refuses the `data/` folder and a LoRaWAN session key given a value in code, with the firmware's synthetic fixture allowed.
- The docs check has no MCP half. The documentation site is published from `main` by the pages job, as Protect's is, at https://smartparksorg.github.io/smartparks-protect-field/.
- CI has no services, no OpenAPI drift job yet (comes with the first API the frontend types against) and no compose job.

## Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Backend | Python 3.12, FastAPI 0.141, uvicorn, Pydantic 2 | `protect_field/main.py` builds the app: `/api/health`, the built interface from `frontend/dist`, every unknown path answered with `index.html` so the browser router owns it |
| Decoding | Protect's `shared` package | See above |
| Frontend | React 19, Vite 8, TypeScript 6 strict, Tailwind 4, shadcn/ui on Radix, TanStack Query 5, React Router 8, i18next, Vitest 4, ESLint 10 | `frontend/`, Protect's configuration; `npm run build` type checks first |
| Docs | MkDocs Material, built strictly | `docs/`, `mkdocs.yml`, `scripts/docs_check.py` |
| Tooling | uv 0.12, ruff 0.16, mypy 2.3 strict, pytest 9 | Exact pins as Protect |

## Layout

```
protect_field/        the Python package: main.py (the server), config.py (settings), version.py
frontend/             the interface: src/api (client, query keys), src/pages, src/components/ui (shadcn copies), src/locales
tests/                pytest; test_protect_decoding.py is the proof that Protect's code works here
scripts/dev.sh        run | test | lint | format | docs | hooks | bump-protect
docs/                 the site: index, the contract with Protect, ADRs
.githooks/            commit-msg (strips assistant trailers), pre-commit (refuses credentials)
```

## Commands

```bash
scripts/dev.sh hooks            # once per clone
uv sync --all-groups
(cd frontend && npm ci)
scripts/dev.sh lint             # ruff, mypy, eslint, tsc
scripts/dev.sh test             # pytest, vitest
scripts/dev.sh docs             # mkdocs --strict and the docs check
scripts/dev.sh run              # the server with the built interface on http://127.0.0.1:18090
(cd frontend && npm run dev)    # live reload on http://127.0.0.1:5173, /api proxied to the server
scripts/dev.sh bump-protect     # move the Protect pin to the newest main and prove the decoding
```

After adding UI strings: `cd frontend && npm run i18n:extract`, then write the Dutch lines in `src/locales/nl/translation.json` by hand, appended.

## Versions

`VERSION` at the root holds the last tag (`v0.0.0` until the first release); `protect_field/version.py` reads it and reads the Protect commit from `uv.lock`. `/api/health` names both and the first screen shows them, so a difference between what Field showed and what Protect decoded can be traced to a version.

## Working with the plan

- Read `PROJECT_PLAN.md` at the start of every session and work the next unchecked item.
- Tick the checkbox in the same commit as the code and the docs.
- Add a session log entry at the end of every session.
- Update this file whenever a mechanism, convention or command changes.
