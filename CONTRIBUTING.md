# Contributing

Thanks for helping build Smart Parks Protect Go. The house style is `CONVENTIONS.md` (mirrored from Protect, which is the master copy), the code is explained in `DEVELOPERS.md`, the roadmap is `PROJECT_PLAN.md`.

## Before you start

1. Read `CONVENTIONS.md`. Crash early, type hints everywhere, no em dashes, natural capitalisation, no quick fixes.
2. Read the active phase in `PROJECT_PLAN.md`. Work follows the plan; if you want something that is not in it, open an issue first.
3. Install the git hooks once per clone. They strip assistant co-author lines from commit messages and refuse a commit that contains a credential or a filled-in `.env`:

```bash
scripts/dev.sh hooks
```

## Development setup

```bash
uv sync --all-groups
cd frontend && npm ci
```

`scripts/dev.sh` wraps the daily commands: `run`, `test`, `lint`, `format`, `docs`, `hooks`, `bump-protect`. See `DEVELOPERS.md`.

## Branches and commits

- Work on `main` for normal changes. Ask before opening a branch; branches are for large rewrites.
- Commit messages: a short imperative first line, a blank line, then why the change is needed. No co-author trailers.
- Tick the matching checkbox in `PROJECT_PLAN.md` in the same commit as the code.

## Definition of done

A change is done when all of these hold:

- Code follows `CONVENTIONS.md` and passes `ruff`, `mypy` and the tests.
- Tests exist for new behaviour. Decoding is tested with synthetic cards built from the firmware's fixture, never with a real tracker's keys.
- Documentation is updated in the same commit: `DEVELOPERS.md` for mechanisms, `docs/` for users, an ADR in `docs/adr/` for architectural choices, `CHANGELOG.md` under Unreleased.
- Every list and map the interface shows has an explicit bound.
- Nothing decoded leaves this program; only the card files go to Protect.
- No decoding code of its own: a frame, a record or a credential is read by Protect's `shared` package. What Protect lacks is added to Protect first.

## Reporting bugs

Open a GitHub issue with the version (the first screen names it and the Protect commit it decodes with), what you did, what you expected and what happened. Security problems go through `SECURITY.md`, not the issue tracker.
