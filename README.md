<div align="center">

![Licence](https://img.shields.io/github/license/SmartParksOrg/smartparks-protect-field)
![Last commit](https://img.shields.io/github/last-commit/SmartParksOrg/smartparks-protect-field)
[![CI and docs](https://github.com/SmartParksOrg/smartparks-protect-field/actions/workflows/ci.yml/badge.svg)](https://smartparksorg.github.io/smartparks-protect-field/)

Documentation: https://smartparksorg.github.io/smartparks-protect-field/

</div>

# Smart Parks Protect Field

The companion of [Smart Parks Protect](https://github.com/SmartParksOrg/smartparks-protect) for the place without a connection. It reads the SD card of a RangerEdge offload station on a laptop in the field, decodes the trackers' frames with Protect's own code, shows the positions and the measurements on a map and in tables, and hands the untouched card files to Protect the moment there is a connection. Protect decodes them itself; nothing decoded here is sent, so there is nothing to reconcile.

Status: phase 0, the repository and its tooling (2026-10-17). Nothing to run for a user yet; `PROJECT_PLAN.md` says what comes in which order.

## How it fits

- **Protect is the source of truth.** Field keeps a local copy of what a project needs offline (the field bundle: devices, entities, the LP0 credentials the user may see, the area and its map) and the cards it read. When online it downloads a fresh bundle and uploads the cards.
- **One decoder.** Field installs Protect's `shared` package pinned to a commit, so a card decodes here byte for byte as it does on the server. No second implementation.
- **The card files are the unit of sync.** Field never pushes rows. Protect's content digest and frame hash refuse a card it already holds.

## Where it runs

On your own laptop, not on the Protect server. The program serves its page at `http://127.0.0.1:18090` on the same machine, so it works with the connection off. How people use it, from loading a bundle to uploading the cards, is in [Using Field](https://smartparksorg.github.io/smartparks-protect-field/using-field/).

## Run

```bash
uv sync
cd frontend && npm ci && npm run build && cd ..
uv run protect-field        # http://127.0.0.1:18090
```

Contributing: `CONTRIBUTING.md`. The house style: `CONVENTIONS.md` (Protect's, mirrored). How the code works: `DEVELOPERS.md`. The plan and the decisions: `PROJECT_PLAN.md`. Security problems: `SECURITY.md`.

## Licence

MIT, as Protect.
