# Using Protect Go

Protect Go is a program for your own laptop. It reads the SD card of an offload station where there is no connection, with the same decoding code the Protect server uses, and hands the card's files to Protect when you are online again. Protect stays the record; The app is a reader with a queue.

Status (2026-10-17): the whole cycle is built: the installers, the first-run setup, the update notice, loading a project, the offline map, reading a card and the upload to Protect.

## Where it runs

On your laptop, not on the server. The app opens its own window; behind it a small program on the same laptop does the work at `127.0.0.1:18090`. Nothing is sent anywhere until you are online and ask for it, and nobody else can reach it.

## Install

Pick your system, download the file, and follow the steps. The download links are on the Offload page of your Protect server too, so you can start from there: it offers the file for the computer you are on, shows the server address to type, and once the app is installed its "Open the app" button opens the program connected to that server.

### Windows

1. Download **ProtectGo-Setup.exe** (Windows 10 and 11, 64-bit): [download](https://github.com/SmartParksOrg/smartparks-protect-go/releases/latest/download/ProtectGo-Setup.exe).
2. Run the file and follow the installer. It installs for your user account; no administrator is needed.
3. Windows may show "Windows protected your PC". The app is not code signed yet, so this is expected: click **More info**, then **Run anyway**. If a work computer blocks it completely, ask your IT administrator to allow it.
4. On some Windows 11 computers the message is "Smart App Control blocked an app that may be unsafe" instead, with no way to run it anyway. Smart App Control is on only on computers where Windows 11 was installed fresh, and it refuses every program without a signature. Until the app is signed, it has to be off to use the app: open **Start**, type **Smart App Control**, open **Smart App Control settings** (the same page is under Settings, Privacy & security, Windows Security, App & browser control), and choose **Off**. Windows asks once to confirm. Know that it stays off: Windows only turns it on again after a reinstall. On a computer managed by an organisation, this setting is the IT administrator's.
5. Protect Go is in the Start menu. The first start takes a little longer.

**Full screen.** The View menu's "Toggle Full Screen" and the F11 key make the window fill the screen, and the menu bar disappears with it. **Esc** or **F11** brings it back, and a small bar at the top right of the page offers the way out too.

### macOS

1. Download **ProtectGo-arm64.dmg** (Apple Silicon, M1 and later; Intel Macs are not supported): [download](https://github.com/SmartParksOrg/smartparks-protect-go/releases/latest/download/ProtectGo-arm64.dmg).
2. Open the file and drag **Protect Go** into **Applications**.
3. On the first start macOS may say the app cannot be checked because the file came from the internet. Click **Open**; if that is greyed out, open **System Settings**, **Privacy & Security**, and click **Open Anyway**.

### Linux (Debian, Ubuntu)

1. Download **ProtectGo-amd64.deb**: [download](https://github.com/SmartParksOrg/smartparks-protect-go/releases/latest/download/ProtectGo-amd64.deb).
2. Double-click it, or run `sudo apt install ./ProtectGo-amd64.deb`. The App Center may warn about an unknown publisher; that is normal for a program outside the store.
3. Protect Go is in the app grid.

## First start: the server and your account

The short way: on Protect's Offload page, signed in, press **Open Protect Go**. The app opens connected to that server and signed in as you, for 30 days, and nothing is typed. The link carries a code that is good once, for two minutes; the password never leaves the browser.

When the app did not come from that button, or the code has expired, it asks two things:

1. **The server.** Which Protect server this laptop works with: the address you open Protect at in your browser, for example `https://dev-protect.smartparks.org`. The Offload page shows it with a copy button. The app checks that the address answers as a Protect server before keeping it.
2. **Your account.** Sign in with the email and password you use for Protect. The password goes to the server and is not kept on the laptop. This sign-in lasts an hour; when the app needs the server after that, it asks for your password again. You can also sign out.

**Server** under Settings shows what the app is connected to: the server's address and Protect version, whether it answers right now (checked every minute and with **Check now**, with the time of the last check), and your account on that server, signed in until when, with **Sign out** and **Sign in as someone else**. When the sign-in has run out or the server no longer accepts it, the sign-in form is there. **Another server** on the same page changes the server.

## Loading a project

Open **Load a project** from the first screen while you are online, choose the project and press **Load the project**. Only projects with an offload station are offered; a project without one has no card to read, and the page says how many it left out. The app fetches the project's devices, entities and stations, the LP0 keys your account is allowed to see, and the map of the area, and keeps them on the laptop. The keys are encrypted with a key in your laptop's keychain, so your login is the password; on a laptop without a keychain a key file only your account can read stands in, and the page says which. The first screen shows what is on the laptop and warns when it is older than a week: load the project again while you are online, since devices and keys change.

If your Protect account may not see the LP0 keys of a tracker (its device page does not show them to you), the bundle holds no keys for it and the app will show that tracker's frames undecoded. Ask a project administrator.

## The map

The pages look and navigate as Protect's do: the navigation on the left, or behind the menu button on a small screen, the theme switch at the top right, and the language at the foot of the navigation. The map comes with the project. The first time, the server has to cut it first, which takes a few minutes, and the app says so: open **Map** a little later, or load the project again. Asking the server to cut a map takes an analyst's or administrator's account; a viewer fetches the map once it exists, or asks one of them to prepare it from the Offload page. Once fetched, the map is drawn on the laptop without any connection, down to street level around the stations, with place names in Latin script. It is OpenStreetMap's map as Protomaps builds it, not satellite imagery, which cannot be taken offline. Load the project again now and then: the server renews its map once a month, and a project whose area grew needs a new one.

## The cycle

### 1. Before you leave, online: load the bundle

*Planned.* Choose the project. The app downloads its field bundle: the project's devices and entities, the LP0 credentials of the trackers you are allowed to see, the stations and the area; the map is fetched as above. The bundle is stored in the data folder. A bundle older than a week is marked stale; load a fresh one whenever you are online.

If your Protect account may not see the LP0 keys of a tracker (its device page does not show them to you), the bundle holds no keys for it and the app shows that tracker's frames undecoded. Ask a project administrator.

### 2. At the station, offline: read the card

Take the SD card out of the station and put it in the laptop. Open **Files**: the card appears under "Read SD card files" by its name, with the station and the number of files the app found on it, and **Read this SD card** reads the whole card at once. The app looks for the station's files on every removable drive, a few folders deep, so the card's `LOG_*` folders need no picking. A copy of the card in a folder, made as a backup first, reads the same way: **Pick the card's folder** opens the system's folder dialog, and the folder is read like the card. Dropping the `LOG_*` folders or a zip of them on the page still works. The files then appear as in Protect's file explorer: one line per file with its SD card, station, upload state, frames and positions, or tiles, switched at the top of the list; search the list or choose the columns; a click on a file opens its properties with the counts, the trackers it carried, what could not be read and the way to its SD card's page. The app names the station by the EUI in the file names, reads every frame with the tracker's keys from the project you loaded, and opens the card: how many frames were read, how many were repeats (the station stores a frame again when its receipt was lost), how many it could not read and why, each tracker with the span of its positions, and the positions on the offline map. The frames it could not read are listed by file and line with the same reason the server would give: no keys for that tracker, a tracker the project does not know, a frame that does not verify. The files stay on the laptop exactly as they were on the card, for the upload.

**Map** then shows every tracker's track from all the files you read, each in its own colour over the offline map, with a tracker and a time window to choose; click a fix for who and when. A tracker's name, on the map or in a file's trackers, opens its page: its track, the measurements it reported with their newest values, and one measurement's values over time.

### 3. Back where there is a connection: upload

*Planned.* The Upload page lists every card file and whether Protect has it. Press Upload; The app sends the files exactly as it read them to Protect, which decodes them itself and refuses a file it already holds.

## Updates

The app is updated often. At every start it looks at the newest release and, when there is a newer one, shows it on the first screen with its notes. **Check for updates…** in the menu does the same at any time.

- **Windows:** the app installs the update itself. Press **Download and install**; the download runs in the background, and **Restart to update** closes the app, installs the new version and opens it again. If you close the app with the download finished, it installs on the way out. The first version that does this is v0.7.0; from v0.6.0 or older, run the new setup file once by hand.
- **macOS:** open the new dmg, drag Protect Go into Applications and choose **Replace**. The app will install updates itself once it is code signed, which macOS demands for that.
- **Linux:** `sudo apt install ./ProtectGo-amd64.deb` again.

Your bundles and cards are kept in every case. Without a connection the check fails quietly and the app works as before.

## Uninstall

- Windows: **Settings**, **Apps**, Protect Go, **Uninstall**. The uninstaller asks whether to remove your data and keeps it unless you say yes.
- macOS: drag Protect Go from Applications to the Trash.
- Linux: `sudo apt remove protect-go`.

## Where the data lives

In `ProtectGo` in your home folder (`C:\Users\<you>\ProtectGo`, `/Users/<you>/ProtectGo`, `/home/<you>/ProtectGo`): the server and your sign-in, the bundles, the cards you read, and `logs/backend.log` for troubleshooting. Delete the folder to start over; the cards on Protect are unaffected. **Help**, **Open the data folder** opens it from the menu.

## When something is wrong

- The app says it could not start: the log in the data folder names the reason. Another program may hold port 18090; quit it and start the app again.
- "Not a Protect server": the address is wrong or the server is down. Open it in your browser first.
- "Wrong email or password": the same as Protect would say. Reset your password in Protect.
- A tracker's frames are "not decoded" (*planned*): the bundle has no keys for it, or the keys in Protect are wrong. Load a fresh bundle.
