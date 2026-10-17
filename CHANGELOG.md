# Changelog

All notable changes to Smart Parks Protect Field. The format follows Keep a Changelog; versions are git tags. Each entry names the Protect commit the release decodes with.

## Unreleased

### Added

- The repository: Protect's conventions mirrored, the git hooks, CI (ruff, mypy, pytest; the frontend's lint, catalogue check, build and tests; the documentation site built strictly; a dependency audit), Dependabot for security updates, MIT licence (2026-10-17).
- The Python package `protect_field` with a local FastAPI server (`/api/health` naming the version and the Protect commit) that serves the built interface, settings under `FIELD_`, and the dependency on Protect's `shared` package pinned by commit (decision D1). A test proves Protect's LP0 codec and OpenCollar driver work here with no database, broker or Protect settings.
- The frontend skeleton on Protect's stack (React 19, Vite, TypeScript strict, Tailwind 4, shadcn/ui, TanStack Query, React Router, i18next with English as the key and Dutch beside it) with Protect's colour tokens and its first screen.
- `scripts/dev.sh` with `run`, `test`, `lint`, `format`, `docs`, `hooks` and `bump-protect`, which moves the Protect pin and reruns the decoding proof.
- The documentation site: the contract with Protect (the field bundle down, the card files up), ADR 0001, and a user page (where Field runs, how to install it, the cycle of bundle, card and upload), published from `main`.

Protect pinned at 2755c92 (main of 2026-10-16).
