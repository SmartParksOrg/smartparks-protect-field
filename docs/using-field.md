# Using Field

Status: this page describes how Field is used once phase 2 of the plan is built. Today (2026-10-17) the program starts and shows its version, nothing more. The steps marked *planned* do not work yet.

## Where it runs

Field runs on your own computer: a laptop you take to the stations. It is not on the Protect server and it is not a website. When you start it, it opens a page in your browser at `http://127.0.0.1:18090`; that page is served by the program on the same laptop, so it works with the Wi-Fi off. Nobody else can reach it.

Protect, the server at your organisation's address, stays the record. Field is a reader with a queue: it reads cards where you are, and hands the files to Protect when you are back online.

## Install

Two ways, pick one.

**With Docker Desktop** (Windows, macOS; no terminal), *planned*: install Docker Desktop, download the release zip, double-click the launcher in `scripts/` for your system. The first start downloads the program image, which needs a connection once.

**With uv** (any system with Python 3.12):

```bash
git clone https://github.com/SmartParksOrg/smartparks-protect-field.git
cd smartparks-protect-field
uv sync
cd frontend && npm ci && npm run build && cd ..
uv run protect-field
```

Then open `http://127.0.0.1:18090`. Stop it with Ctrl-C.

## The cycle

### 1. Before you leave, online: load the bundle

*Planned.* On the first screen, sign in to your Protect server and choose the project. Field downloads the field bundle: the project's devices and entities, the LP0 credentials of the trackers you are allowed to see, the stations, the area and an offline map of it. You give Field a password; the bundle is stored encrypted with it in the data folder. A bundle older than a week is marked stale; load a fresh one whenever you are online.

If your Protect account may not see the LP0 keys of a tracker (the device page does not show them to you), the bundle holds no keys for it and Field shows that tracker's frames undecoded. Ask a project administrator.

### 2. At the station, offline: read the card

*Planned.* Take the SD card out of the station, or copy its `LOG_*` folders. Open Field, unlock the bundle with your password, and drop the folders or a zip of them on the Cards page. Field names the station by the EUI in the file names, decodes every frame with the tracker's credentials from the bundle, and shows per tracker a map of its positions and a table of its measurements; per station, what it collected and which frames it could not read, with the reason.

Nothing you see here is sent anywhere. It is Field's reading of the card, made with Protect's own decoding code at the version the first screen names.

### 3. Back where there is a connection: upload

*Planned.* Open Field online. The Upload page lists every card file and whether Protect has it. Press Upload; Field sends the files exactly as it read them to Protect, which decodes them itself and refuses a file it already holds. A file that failed stays in the queue and is retried next time.

## Where the data lives

In the data folder, `data/` beside the program unless `FIELD_DATA_DIR` says otherwise: the encrypted bundle, the cards you read, Field's own database. Delete the folder to start over; the cards on Protect are unaffected.

## When something is wrong

- The page does not open: the program is not running, or another program holds port 18090. Start it from a terminal and read its output; `FIELD_PORT` changes the port.
- A tracker's frames are "not decoded": the bundle has no keys for it, or the keys in Protect are wrong. Load a fresh bundle; if it persists, check the tracker's LP0 credentials on its device page in Protect.
- Protect refuses an upload as a duplicate: the card was read before, by you or someone else. Nothing is lost.
