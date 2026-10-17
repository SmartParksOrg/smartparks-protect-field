<div align="center">

![Licence](https://img.shields.io/github/license/SmartParksOrg/smartparks-protect-go)
![Last commit](https://img.shields.io/github/last-commit/SmartParksOrg/smartparks-protect-go)
[![CI and docs](https://github.com/SmartParksOrg/smartparks-protect-go/actions/workflows/ci.yml/badge.svg)](https://smartparksorg.github.io/smartparks-protect-go/)

Documentation: https://smartparksorg.github.io/smartparks-protect-go/

</div>

# Smart Parks Protect Go

The companion of [Smart Parks Protect](https://github.com/SmartParksOrg/smartparks-protect) for the place without a connection. It reads the SD card of a RangerEdge offload station on a laptop in the field, decodes the trackers' frames with Protect's own code, shows the positions and the measurements on a map and in tables, and hands the untouched card files to Protect the moment there is a connection. Protect decodes them itself; nothing decoded here is sent, so there is nothing to reconcile.

Status: v0.3.0 (2026-10-17): the app is Protect Go, named Field until then; the whole cycle. Install, connect to your Protect server, load a project while online, read a station's card where there is none and see it on the offline map, upload the files when back. `PROJECT_PLAN.md` has what comes next.

## How it fits

- **Protect is the source of truth.** The app keeps a local copy of what a project needs offline (the field bundle: devices, entities, the LP0 credentials the user may see, the area and its map) and the cards it read. When online it downloads a fresh bundle and uploads the cards.
- **One decoder.** The app installs Protect's `shared` package pinned to a commit, so a card decodes here byte for byte as it does on the server. No second implementation.
- **The card files are the unit of sync.** The app never pushes rows. Protect's content digest and frame hash refuse a card it already holds.

## Where it runs

On your own laptop, not on the Protect server. The program serves its page at `http://127.0.0.1:18090` on the same machine, so it works with the connection off. How people install and use it, from the installer to uploading the cards, is in [Using the app](https://smartparksorg.github.io/smartparks-protect-go/using-protect-go/).

## Install

Download the installer for your system from the [latest release](https://github.com/SmartParksOrg/smartparks-protect-go/releases/latest): `ProtectGo-Setup.exe` (Windows), `ProtectGo-arm64.dmg` (macOS, Apple Silicon) or `ProtectGo-amd64.deb` (Debian, Ubuntu). The Offload page of a Protect server offers the same download and opens the app connected to that server.

## Run from source

```bash
uv sync
cd frontend && npm ci && npm run build && cd ..
uv run protect-go        # http://127.0.0.1:18090
```

Contributing: `CONTRIBUTING.md`. The house style: `CONVENTIONS.md` (Protect's, mirrored). How the code works: `DEVELOPERS.md`. The plan and the decisions: `PROJECT_PLAN.md`. Security problems: `SECURITY.md`.

## Licence

MIT, as Protect.
