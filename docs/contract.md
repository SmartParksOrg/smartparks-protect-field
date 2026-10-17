# The contract with Protect

Field and Protect exchange two things, and the second is the one Protect already accepts.

## Down: the field bundle

When Field is online, a user who is a member of a project asks Protect for the project's field bundle: `GET /projects/{id}/field-bundle` (Protect's phase 43 P2, built 2026-10-17; the page [Field, the companion](https://smartparksorg.github.io/smartparks-protect/devices/field-companion/) in Protect's documentation). One JSON document, `format_version` 1, with:

- `project`: id, name, slug, time zone; `generated_at`, `protect_version`, `protect_commit` and `server_url`, where the upload goes;
- `devices`: the project's devices the caller may see, each with `device_type_key`, `driver_key`, `serial_number`, `dev_eui`, `status`, `firmware_version`, the entity it tracks now (`entity_id`, `entity_name`), `is_station`, and `lp0`: the tracker's `dev_addr`, `keys_set`, and `app_s_key` and `nwk_s_key` as 32 hex digits when `credentials_included` is true, null otherwise;
- `credentials_included`: whether the caller may set keys in Protect (device control in the project, or a server admin); a viewer gets every address and no key, and Field shows that tracker's frames undecoded;
- `entities`: the entities those devices track, with type key and label, icon and a GeoJSON place when set by hand;
- `stations`: the offload stations with `station_eui` and a GeoJSON point where they stand, so a card is routed by the EUI in its file names;
- `area`: the project's bounding box (`west`, `south`, `east`, `north`) from its features, entity places and device places, or null when the project has none yet; `map`: the state of the offline map cut for it (below), once one was asked for.

Protect writes every download to its audit log with how many devices, stations and keys it carried. The bundle is encrypted on disk with a key the user gives Field. It expires; Field says when a bundle is older than a week and asks for a fresh one when online.

## Down: the offline map

`GET /projects/{id}/field-bundle/map` (Protect's phase 43 P3, built 2026-10-17) streams a PMTiles file: the project's area with a five kilometre margin, down to zoom 14, cut by Protect's export worker from the newest Protomaps planet build (OpenStreetMap data, ODbL). Headers `X-Map-Build` (the build's date) and `X-Content-SHA256`. While the map is being cut the answer is 202 with its state; 404 means none was asked for yet and `POST` on the same path asks for one (a map under a month that covers the area is kept; `force` cuts again); 409 carries the reason the last attempt failed. Field's `POST /api/map/fetch` does all of that for the chosen project, keeps the file as `map.pmtiles` in the data folder with `map.json` beside it, and serves it to MapLibre at `/api/map/tiles.pmtiles` with range requests. The sprites and glyphs of the Protomaps style ship inside Field (`frontend/public/map/`), so the map draws with nothing from the internet.

## Up: the card files

Field uploads the card's files exactly as it read them to `POST /devices/{station id}/offload-files` on the server the bundle came from, the upload the station's device page makes (a `.jsonl` or a zip of the card's folders). Protect decodes them with the same code, attributes the records to the entities as of their record time, and refuses a file it already holds by its content digest and a frame it already holds by its hash. Field keeps a queue of what is uploaded and what is not, and shows it.

## What never travels

- Nothing decoded leaves Field. A position or a measurement Field shows is Field's reading of the card, and Protect makes its own.
- No master key. Field holds session keys for the trackers in the bundle, never the LP0 master key, as Protect does not (Protect's decision D327).
- No notes, events or edits from Field, for now. Should the offline user need to record things that must travel back, that becomes a small append-only outbox, a later phase, never a general merge.

## The parser

Field reads a card with `shared.station_files` from Protect's `shared` package (Protect's phase 43 P1): `unpack_card_zip`, `parse_station_jsonl`, `station_eui_from_name`, with `shared.connectivity.adapters.lp0_station.lorawan.unwrap` for the frame and `shared.device_drivers.opencollar` for the records. None of these import a database.

## Versions

Field pins Protect's `shared` package to a commit. The first screen names both the Field version and that commit, so a difference between what Field showed and what Protect decoded can be traced to a version. `scripts/dev.sh bump-protect` moves the pin and reruns the decoding proof.
