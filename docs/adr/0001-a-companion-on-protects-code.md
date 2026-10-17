# 0001. A companion in its own repository on Protect's code, the card files as the unit of sync

Date: 2026-10-17

Status: accepted

## Context

Protect reads the SD cards of RangerEdge offload stations on its server (Protect phase 42). The people who collect such a card are often where there is no connection for days, and want to see what the card holds before they are back. Three ways were weighed: Protect itself running offline, an offline mode in Protect's browser app, and a companion program.

Protect is a server: PostgreSQL with TimescaleDB and PostGIS, Redis, MinIO and six services. It runs on a laptop under Docker, but two Protect instances would need two-way replication of positions, assignments and audit rows. An offline mode in the browser would need the LP0 decryption, the OpenCollar driver and the attribution rewritten in TypeScript, a second decoder that drifts from the first. The decoding code in Protect's `shared` package, on the other hand, is free of the server: the LP0 codec depends on the cryptography package alone and the OpenCollar driver has no database imports.

An earlier tool, the LP0 replay app, is a Flask program with its own copy of the TTN JavaScript decoder reading gateway logs; extending it would double the drift.

## Decision

Field is a companion program in its own repository, a local Python server with a browser interface, that installs Protect's `shared` package pinned to a commit and decodes a card with it. It keeps no decoding code of its own; what Protect lacks is added to Protect first.

The card files are the unit of synchronisation in both directions. Down, Protect exports a field bundle (devices, entities, the credentials the user may see, the area and a map extract). Up, Field uploads the untouched card files to Protect's existing log files endpoint, and Protect decodes them itself. Nothing decoded leaves Field.

Protect's conventions, tooling and document set are mirrored here rather than written again; Protect's copies are the master.

## Alternatives considered

- Protect offline on the laptop: a replication problem nobody wants to own, and a Docker stack for a field laptop.
- An offline mode in Protect's browser app: a second decoder in TypeScript.
- Extending the replay app: a third decoder, a 9500-line file, a different input.
- Pushing decoded rows to Protect: reconciliation of two decodings; refused by the principle that Protect's reading is the one that counts.

## Consequences

Protect's `shared` package drags its server dependencies along (SQLAlchemy, Redis, MinIO clients); they install and stay unused. Should that weigh, Protect can split a core package later; Field changes one pin. Field must never import Protect's settings, bus, models or storage modules; `DEVELOPERS.md` lists what it may import and the tests run without Protect's environment variables.

Protect gains two small pieces: the station file parser split from the database code, and the field bundle endpoint with the map extract. Field tracks Protect's `main` by pinned commits; a Protect change that moves a decoding module fails Field's proof test before it reaches a user.
