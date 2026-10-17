# The contract with Protect

Field and Protect exchange two things, and the second is the one Protect already accepts.

## Down: the field bundle

When Field is online, a user who is a member of a project asks Protect for the project's field bundle (planned on Protect's side as `GET /projects/{id}/field-bundle`, phase 1 of the plan). One file holds:

- the project's devices with their type, serial, DevEUI and the entity each is assigned to now, and the entity names;
- the LP0 credentials (DevAddr, AppSKey, NwkSKey) of the trackers the user may see, so a card decodes offline; a user who may not see keys in Protect gets a bundle without them and Field shows the frames undecoded;
- the stations the project knows, so a card is routed by the station's EUI;
- the area the project works in and a map extract of it (PMTiles, decision D4), so the map draws without a connection.

The bundle is encrypted on disk with a key the user gives Field. It expires; Field says when a bundle is older than a week and asks for a fresh one when online.

## Up: the card files

Field uploads the card's files exactly as it read them to Protect's existing log files endpoint, the one the station's device page uses. Protect decodes them with the same code, attributes the records to the entities as of their record time, and refuses a file it already holds by its content digest and a frame it already holds by its hash. Field keeps a queue of what is uploaded and what is not, and shows it.

## What never travels

- Nothing decoded leaves Field. A position or a measurement Field shows is Field's reading of the card, and Protect makes its own.
- No master key. Field holds session keys for the trackers in the bundle, never the LP0 master key, as Protect does not (Protect's decision D327).
- No notes, events or edits from Field, for now. Should the offline user need to record things that must travel back, that becomes a small append-only outbox, a later phase, never a general merge.

## Versions

Field pins Protect's `shared` package to a commit. The first screen names both the Field version and that commit, so a difference between what Field showed and what Protect decoded can be traced to a version. `scripts/dev.sh bump-protect` moves the pin and reruns the decoding proof.
