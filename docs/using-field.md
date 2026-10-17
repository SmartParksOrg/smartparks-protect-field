# Using Field

Protect Field is a program for your own laptop. It reads the SD card of an offload station where there is no connection, with the same decoding code the Protect server uses, and hands the card's files to Protect when you are online again. Protect stays the record; Field is a reader with a queue.

Status (2026-10-17): the installers, the first-run setup, the update notice and the offline map are built. Reading a card and the upload queue are phase 2 of the plan and marked *planned* below.

## Where it runs

On your laptop, not on the server. Field opens its own window; behind it a small program on the same laptop does the work at `127.0.0.1:18090`. Nothing is sent anywhere until you are online and ask for it, and nobody else can reach it.

## Install

Pick your system, download the file, and follow the steps. The download links are on the Offload page of your Protect server too, so you can start from there: it offers the file for the computer you are on, shows the server address to type, and once Field is installed its "Open Field" button opens the program connected to that server.

### Windows

1. Download **ProtectField-Setup.exe** (Windows 10 and 11, 64-bit): [download](https://github.com/SmartParksOrg/smartparks-protect-field/releases/latest/download/ProtectField-Setup.exe).
2. Run the file and follow the installer. It installs for your user account; no administrator is needed.
3. Windows may show "Windows protected your PC". Field is not code signed yet, so this is expected: click **More info**, then **Run anyway**. If a work computer blocks it completely, ask your IT administrator to allow it.
4. Protect Field is in the Start menu. The first start takes a little longer.

### macOS

1. Download **ProtectField-arm64.dmg** (Apple Silicon, M1 and later; Intel Macs are not supported): [download](https://github.com/SmartParksOrg/smartparks-protect-field/releases/latest/download/ProtectField-arm64.dmg).
2. Open the file and drag **Protect Field** into **Applications**.
3. On the first start macOS may say the app cannot be checked because the file came from the internet. Click **Open**; if that is greyed out, open **System Settings**, **Privacy & Security**, and click **Open Anyway**.

### Linux (Debian, Ubuntu)

1. Download **ProtectField-amd64.deb**: [download](https://github.com/SmartParksOrg/smartparks-protect-field/releases/latest/download/ProtectField-amd64.deb).
2. Double-click it, or run `sudo apt install ./ProtectField-amd64.deb`. The App Center may warn about an unknown publisher; that is normal for a program outside the store.
3. Protect Field is in the app grid.

## First start: the server and your account

1. **The server.** Field asks which Protect server this laptop works with: the address you open Protect at in your browser, for example `https://dev-protect.smartparks.org`. If you came from Protect's Offload page with "Open Field", the address is filled in. Field checks that the address answers as a Protect server before keeping it.
2. **Your account.** Sign in with the email and password you use for Protect. The password goes to the server and is not kept on the laptop. The sign-in lasts an hour; when Field needs the server after that, it asks for your password again. You can also sign out.

To change the server later, choose **Another server** on the first screen.

## The map

Open **Map** from the first screen while you are online, choose the project and press **Fetch the map**. Field asks the server for the map of the project's area; the first time, the server has to cut it first, which takes a few minutes, and Field says so: try again a little later. Once fetched, the map is drawn on the laptop without any connection, down to street level around the stations, with place names in Latin script. It is OpenStreetMap's map as Protomaps builds it, not satellite imagery, which cannot be taken offline. Fetch it again now and then: the server renews its copy once a month, and a project whose area grew needs a new one.

## The cycle

### 1. Before you leave, online: load the bundle

*Planned.* Choose the project. Field downloads its field bundle: the project's devices and entities, the LP0 credentials of the trackers you are allowed to see, the stations and the area; the map is fetched as above. The bundle is stored in the data folder. A bundle older than a week is marked stale; load a fresh one whenever you are online.

If your Protect account may not see the LP0 keys of a tracker (its device page does not show them to you), the bundle holds no keys for it and Field shows that tracker's frames undecoded. Ask a project administrator.

### 2. At the station, offline: read the card

*Planned.* Take the SD card out of the station, or copy its `LOG_*` folders. Drop the folders or a zip of them on the Cards page. Field names the station by the EUI in the file names, decodes every frame with the tracker's credentials from the bundle, and shows per tracker a map of its positions and a table of its measurements; per station, what it collected and which frames it could not read, with the reason.

### 3. Back where there is a connection: upload

*Planned.* The Upload page lists every card file and whether Protect has it. Press Upload; Field sends the files exactly as it read them to Protect, which decodes them itself and refuses a file it already holds.

## Updates

Field is updated often. At every start it looks at the newest release and, when there is a newer one, shows it on the first screen with its notes and a download button. **Check for updates…** in the menu does the same at any time. Install the new version over the old one:

- Windows: run the new setup file. It replaces the old version.
- macOS: open the new dmg, drag Protect Field into Applications and choose **Replace**.
- Linux: `sudo apt install ./ProtectField-amd64.deb` again.

Your bundles and cards are kept in every case. Without a connection the check fails quietly and Field works as before.

## Uninstall

- Windows: **Settings**, **Apps**, Protect Field, **Uninstall**. The uninstaller asks whether to remove your data and keeps it unless you say yes.
- macOS: drag Protect Field from Applications to the Trash.
- Linux: `sudo apt remove protect-field`.

## Where the data lives

In `ProtectField` in your home folder (`C:\Users\<you>\ProtectField`, `/Users/<you>/ProtectField`, `/home/<you>/ProtectField`): the server and your sign-in, the bundles, the cards you read, and `logs/backend.log` for troubleshooting. Delete the folder to start over; the cards on Protect are unaffected. **Help**, **Open the data folder** opens it from the menu.

## When something is wrong

- Field says it could not start: the log in the data folder names the reason. Another program may hold port 18090; quit it and start Field again.
- "Not a Protect server": the address is wrong or the server is down. Open it in your browser first.
- "Wrong email or password": the same as Protect would say. Reset your password in Protect.
- A tracker's frames are "not decoded" (*planned*): the bundle has no keys for it, or the keys in Protect are wrong. Load a fresh bundle.
