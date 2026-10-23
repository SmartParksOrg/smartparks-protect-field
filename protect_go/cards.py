"""A card read on the laptop (decision D2; phase 2 F2): the station's files parsed with
Protect's parser, every frame opened and read through Protect's shared decode path with the
tracker's keys from the bundle, and the result kept in a SQLite database in the data folder,
every frame with its outcome and every refusal with the server's own code and words. The files
themselves are kept beside it, untouched, for the upload (F4). Nothing decoded here is sent.

The records are deduplicated the way Protect does it (ADR 0008): one key per device, time and
record type, with the metric or the fingerprint, so a frame the station stored twice counts once.
"""

import contextlib
import hashlib
import json
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from shared.connectivity.adapters.lp0_station.lorawan import Credentials, FrameError, parse_uplink
from shared.device_drivers.base import DecodedRecords
from shared.device_drivers.registry import DRIVERS
from shared.station_decode import FrameRefused, decode_station_frame, unwrap_station_frame
from shared.station_files import (
    StationFrame,
    parse_station_jsonl,
    station_eui_from_name,
    unpack_card_zip,
)
from shared.trace import ApplicationError

MEMBER_MAX_BYTES = 64 * 1024 * 1024


def sha256(data: bytes) -> str:
    """The digest Protect keys a frame and a file by; `shared.storage` has the same, but that
    module wants the MinIO client, which the frozen backend leaves out."""
    return hashlib.sha256(data).hexdigest()


EARLIEST_RECEPTION = datetime(2020, 1, 1, tzinfo=UTC)
#: The counts a card row carries, all zero in the answer to a drop with nothing new in it.
COUNT_COLUMNS = (
    "files",
    "lines",
    "frames",
    "decoded",
    "repeated",
    "refused",
    "unknown",
    "line_errors",
    "positions",
    "measurements",
    "states",
    "events",
)
LIST_LIMIT = 200
RECORDS_LIMIT = 50_000
POSITIONS_LIMIT = 20000
FAILURES_LIMIT = 100

SCHEMA = """
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, imported_at TEXT NOT NULL,
    station_eui TEXT, station_device_id TEXT, station_name TEXT,
    files INTEGER NOT NULL DEFAULT 0, lines INTEGER NOT NULL DEFAULT 0,
    frames INTEGER NOT NULL DEFAULT 0, decoded INTEGER NOT NULL DEFAULT 0,
    repeated INTEGER NOT NULL DEFAULT 0, refused INTEGER NOT NULL DEFAULT 0,
    unknown INTEGER NOT NULL DEFAULT 0, line_errors INTEGER NOT NULL DEFAULT 0,
    positions INTEGER NOT NULL DEFAULT 0, measurements INTEGER NOT NULL DEFAULT 0,
    states INTEGER NOT NULL DEFAULT 0, events INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS card_files (
    id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    name TEXT NOT NULL, folder TEXT NOT NULL, path TEXT NOT NULL, sha256 TEXT NOT NULL,
    size INTEGER NOT NULL, station_eui TEXT, lines INTEGER NOT NULL, frames INTEGER NOT NULL,
    errors INTEGER NOT NULL,
    upload_status TEXT NOT NULL DEFAULT 'pending', upload_answer TEXT, uploaded_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0, log_file_id TEXT
);
CREATE TABLE IF NOT EXISTS frames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    file_id TEXT NOT NULL REFERENCES card_files(id) ON DELETE CASCADE,
    line INTEGER NOT NULL, dev_addr TEXT, f_cnt INTEGER, f_port INTEGER, received_at TEXT,
    device_id TEXT, device_name TEXT, status TEXT NOT NULL, code TEXT, reason TEXT,
    phy_sha256 TEXT, positions INTEGER NOT NULL DEFAULT 0, measurements INTEGER NOT NULL DEFAULT 0,
    source_eui TEXT
);
CREATE INDEX IF NOT EXISTS frames_card ON frames(card_id, status);
CREATE INDEX IF NOT EXISTS frames_phy ON frames(phy_sha256);
CREATE TABLE IF NOT EXISTS records (
    key TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    frame_id INTEGER NOT NULL, device_id TEXT NOT NULL, entity_id TEXT, kind TEXT NOT NULL,
    time TEXT NOT NULL, lat REAL, lon REAL, metric TEXT, value REAL, data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_device ON records(device_id, kind, time);
CREATE INDEX IF NOT EXISTS records_card ON records(card_id, kind);
"""


@dataclass(slots=True)
class Tracker:
    """A device of the bundle as the importer needs it."""

    id: str
    name: str
    dev_eui: str | None
    driver_key: str
    firmware_version: str | None
    entity_id: str | None
    entity_name: str | None
    credentials: Credentials | None


@dataclass(slots=True)
class Member:
    name: str
    folder: str
    data: bytes


@dataclass(slots=True)
class Counts:
    lines: int = 0
    frames: int = 0
    decoded: int = 0
    repeated: int = 0
    refused: int = 0
    unknown: int = 0
    line_errors: int = 0
    positions: int = 0
    measurements: int = 0
    states: int = 0
    events: int = 0
    trackers: set[str] = field(default_factory=set)


def trackers_of(bundle: dict[str, Any]) -> dict[str, Tracker]:
    """The bundle's devices by LP0 address; a device without an address is no tracker here."""
    result: dict[str, Tracker] = {}
    for device in bundle.get("devices", []):
        lp0 = device.get("lp0")
        if not lp0 or not lp0.get("dev_addr"):
            continue
        credentials = None
        if lp0.get("app_s_key") and lp0.get("nwk_s_key"):
            credentials = Credentials(
                str(lp0["dev_addr"]).upper(),
                bytes.fromhex(str(lp0["app_s_key"])),
                bytes.fromhex(str(lp0["nwk_s_key"])),
            )
        result[str(lp0["dev_addr"]).upper()] = Tracker(
            id=str(device["id"]),
            name=str(device["name"]),
            dev_eui=device.get("dev_eui"),
            driver_key=str(device.get("driver_key") or ""),
            firmware_version=device.get("firmware_version"),
            entity_id=device.get("entity_id"),
            entity_name=device.get("entity_name"),
            credentials=credentials,
        )
    return result


def members_of(files: list[tuple[str, bytes]]) -> tuple[list[Member], list[str]]:
    """The station files among what was dropped in: a zip's `*.jsonl` members with their
    folders, a `.jsonl` as it is (its folder from the name when it carries one); the rest
    skipped by name."""
    members: list[Member] = []
    skipped: list[str] = []
    for name, data in files:
        clean = name.replace("\\", "/").strip("/")
        if clean.lower().endswith(".zip"):
            card = unpack_card_zip(data, member_max_bytes=MEMBER_MAX_BYTES)
            members.extend(Member(m.name, m.folder, m.data) for m in card.members)
            skipped.extend(card.skipped)
        elif clean.lower().endswith(".jsonl"):
            parts = clean.split("/")
            members.append(Member(parts[-1], parts[-2] if len(parts) > 1 else "", data))
        else:
            skipped.append(clean)
    return members, skipped


class CardStore:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.files_dir = data_dir / "cards"
        self.path = data_dir / "field.db"
        data_dir.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.executescript(SCHEMA)
            self._migrate(db)

    @staticmethod
    def _migrate(db: sqlite3.Connection) -> None:
        """Columns added after a database was made: the upload's state per file (F4), the
        tracker EUI a v5 station wrote beside a frame (Protect's D338)."""
        have = {row["name"] for row in db.execute("PRAGMA table_info(card_files)").fetchall()}
        for column, definition in (
            ("upload_status", "TEXT NOT NULL DEFAULT 'pending'"),
            ("upload_answer", "TEXT"),
            ("uploaded_at", "TEXT"),
            ("attempts", "INTEGER NOT NULL DEFAULT 0"),
            ("log_file_id", "TEXT"),
        ):
            if column not in have:
                db.execute(f"ALTER TABLE card_files ADD COLUMN {column} {definition}")
        frame_columns = {row["name"] for row in db.execute("PRAGMA table_info(frames)").fetchall()}
        if "source_eui" not in frame_columns:
            db.execute("ALTER TABLE frames ADD COLUMN source_eui TEXT")

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("PRAGMA journal_mode = WAL")
        return db

    # --- reading a card

    def import_card(
        self,
        name: str,
        files: list[tuple[str, bytes]],
        bundle: dict[str, Any],
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        """Parse, open and read every frame of the dropped files; one card row with the counts,
        the files kept under `cards/<id>/`. A file whose bytes were read before, on an earlier
        card or earlier in this drop, is left out and named in `read_before` (decision D30):
        the same card read twice, or a card read again after it grew, adds what is new and
        nothing else, and nothing waits twice for the upload. When nothing in the drop is new
        the answer carries no card (`id` None) and every file under `read_before`. Raises
        ValueError when nothing in the drop is a station file."""
        members, skipped = members_of(files)
        if not members:
            raise ValueError(
                "No station file among what was dropped: a card's LOG folders hold "
                "STATIONEUI_timestamp.jsonl files, or a zip of them"
            )
        now = now or datetime.now(UTC)
        trackers = trackers_of(bundle)
        stations = {
            str(s["station_eui"]).upper(): s
            for s in bundle.get("stations", [])
            if s.get("station_eui")
        }
        ordered = sorted(members, key=lambda m: (m.folder, m.name))
        fresh: list[Member] = []
        read_before: list[dict[str, Any]] = []
        with self._connect() as db:
            seen_here: set[str] = set()
            for member in ordered:
                digest = sha256(member.data)
                earlier = db.execute(
                    "SELECT c.name AS card_name, c.imported_at "
                    "FROM card_files f JOIN cards c ON c.id = f.card_id WHERE f.sha256 = ? "
                    "ORDER BY c.imported_at LIMIT 1",
                    (digest,),
                ).fetchone()
                if earlier is not None or digest in seen_here:
                    read_before.append(
                        {
                            "name": member.name,
                            "folder": member.folder,
                            "card_name": earlier["card_name"] if earlier else name,
                            "imported_at": earlier["imported_at"] if earlier else now.isoformat(),
                        }
                    )
                    continue
                seen_here.add(digest)
                fresh.append(member)
        if not fresh:
            nothing: dict[str, Any] = {column: 0 for column in COUNT_COLUMNS}
            nothing.update(
                id=None,
                name=name,
                imported_at=now.isoformat(),
                station_eui=None,
                station_device_id=None,
                station_name=None,
                skipped=skipped,
                read_before=read_before,
            )
            return nothing
        card_id = str(uuid.uuid4())
        folder = self.files_dir / card_id
        counts = Counts()
        station_eui: str | None = None
        with self._connect() as db:
            db.execute(
                "INSERT INTO cards (id, name, imported_at) VALUES (?, ?, ?)",
                (card_id, name, now.isoformat()),
            )
            for member in fresh:
                file_id = str(uuid.uuid4())
                kept = folder / (member.folder or "LOG") / member.name
                kept.parent.mkdir(parents=True, exist_ok=True)
                kept.write_bytes(member.data)
                parsed = parse_station_jsonl(member.data.decode("utf-8", errors="replace"))
                eui = station_eui_from_name(member.name) or (
                    parsed.frames[0].station_eui if parsed.frames else None
                )
                station_eui = station_eui or eui
                db.execute(
                    "INSERT INTO card_files (id, card_id, name, folder, path, sha256, size, "
                    "station_eui, lines, frames, errors) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        file_id,
                        card_id,
                        member.name,
                        member.folder,
                        str(kept),
                        sha256(member.data),
                        len(member.data),
                        eui,
                        parsed.lines,
                        len(parsed.frames),
                        len(parsed.errors),
                    ),
                )
                counts.lines += parsed.lines
                for number, error in parsed.errors:
                    counts.line_errors += 1
                    db.execute(
                        "INSERT INTO frames (card_id, file_id, line, status, code, reason) "
                        "VALUES (?, ?, ?, 'line_error', 'LINE_UNREADABLE', ?)",
                        (card_id, file_id, number, error),
                    )
                for frame in parsed.frames:
                    counts.frames += 1
                    self._read_frame(db, card_id, file_id, frame, trackers, counts, now)
            station = stations.get(station_eui or "")
            db.execute(
                "UPDATE cards SET station_eui = ?, station_device_id = ?, station_name = ?, "
                "files = ?, lines = ?, frames = ?, decoded = ?, repeated = ?, refused = ?, "
                "unknown = ?, line_errors = ?, positions = ?, measurements = ?, states = ?, "
                "events = ? WHERE id = ?",
                (
                    station_eui,
                    station.get("device_id") if station else None,
                    (station.get("entity_name") or station.get("device_name")) if station else None,
                    len(fresh),
                    counts.lines,
                    counts.frames,
                    counts.decoded,
                    counts.repeated,
                    counts.refused,
                    counts.unknown,
                    counts.line_errors,
                    counts.positions,
                    counts.measurements,
                    counts.states,
                    counts.events,
                    card_id,
                ),
            )
        summary = self.card(card_id)
        assert summary is not None
        summary["skipped"] = skipped
        summary["read_before"] = read_before
        return summary

    def _read_frame(
        self,
        db: sqlite3.Connection,
        card_id: str,
        file_id: str,
        frame: StationFrame,
        trackers: dict[str, Tracker],
        counts: Counts,
        now: datetime,
    ) -> None:
        digest = sha256(frame.data)
        received = frame.received_at
        if received is not None and not (EARLIEST_RECEPTION <= received <= now + timedelta(days=1)):
            received = None  # the station's clock was not plausible (Protect's D324)
        base = {
            "card_id": card_id,
            "file_id": file_id,
            "line": frame.line,
            "received_at": frame.received_at.isoformat() if frame.received_at else None,
            "phy_sha256": digest,
            "source_eui": frame.source_eui.upper() if frame.source_eui else None,
        }
        try:
            uplink = parse_uplink(frame.data)
        except FrameError as exc:
            counts.line_errors += 1
            self._frame_row(db, base, status="line_error", code="LINE_UNREADABLE", reason=str(exc))
            return
        base.update(dev_addr=uplink.dev_addr, f_cnt=uplink.f_cnt, f_port=uplink.f_port)
        tracker = trackers.get(uplink.dev_addr.upper())
        if tracker is None:
            counts.unknown += 1
            self._frame_row(
                db,
                base,
                status="unknown_address",
                code="DEVICE_UNKNOWN",
                reason=f"no device of the project has LP0 address {uplink.dev_addr}"
                + (f" (the station says tracker {frame.source_eui})" if frame.source_eui else ""),
            )
            return
        base.update(device_id=tracker.id, device_name=tracker.name)
        seen = db.execute(
            "SELECT id FROM frames WHERE phy_sha256 = ? AND status = 'decoded' LIMIT 1", (digest,)
        ).fetchone()
        if seen is not None:
            counts.repeated += 1
            self._frame_row(
                db,
                base,
                status="repeated",
                code=None,
                reason="the station stored this frame before",
            )
            return
        try:
            opened = unwrap_station_frame(
                frame.data,
                tracker.credentials,
                device_name=tracker.name,
                device_eui=tracker.dev_eui,
                source_eui=frame.source_eui,
                lp0_version=frame.lp0_version,
                last_f_cnt=None,
            )
        except FrameRefused as refused:
            counts.refused += 1
            self._frame_row(
                db, base, status="refused", code=str(refused.code), reason=refused.message
            )
            return
        driver = DRIVERS.get(tracker.driver_key)
        if driver is None:
            counts.refused += 1
            self._frame_row(
                db,
                base,
                status="refused",
                code="DRIVER_UNKNOWN",
                reason=f"Protect Go has no driver {tracker.driver_key!r} for {tracker.name}",
            )
            return
        try:
            records = decode_station_frame(
                driver,
                opened,
                document=frame.document,
                received_at=received,
                fallback_time=now,
                firmware_version=tracker.firmware_version,
            )
        except ApplicationError as exc:
            counts.refused += 1
            self._frame_row(db, base, status="refused", code=str(exc.code), reason=exc.message)
            return
        frame_id = self._frame_row(db, base, status="decoded", code=None, reason=None)
        new = self._store_records(db, card_id, frame_id, tracker, records)
        counts.decoded += 1
        counts.trackers.add(tracker.id)
        counts.positions += new["position"]
        counts.measurements += new["measurement"]
        counts.states += new["state"]
        counts.events += new["event"]
        db.execute(
            "UPDATE frames SET positions = ?, measurements = ? WHERE id = ?",
            (new["position"], new["measurement"], frame_id),
        )

    def _frame_row(
        self,
        db: sqlite3.Connection,
        base: dict[str, Any],
        *,
        status: str,
        code: str | None,
        reason: str | None,
    ) -> int:
        cursor = db.execute(
            "INSERT INTO frames (card_id, file_id, line, dev_addr, f_cnt, f_port, received_at, "
            "device_id, device_name, status, code, reason, phy_sha256, source_eui) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                base["card_id"],
                base["file_id"],
                base["line"],
                base.get("dev_addr"),
                base.get("f_cnt"),
                base.get("f_port"),
                base.get("received_at"),
                base.get("device_id"),
                base.get("device_name"),
                status,
                code,
                reason,
                base["phy_sha256"],
                base.get("source_eui"),
            ),
        )
        return int(cursor.lastrowid or 0)

    def _store_records(
        self,
        db: sqlite3.Connection,
        card_id: str,
        frame_id: int,
        tracker: Tracker,
        records: DecodedRecords,
    ) -> dict[str, int]:
        """The records under Protect's canonical keys; a key seen before (another frame, another
        card) is not stored again, so the counts are new records."""
        new = {"position": 0, "measurement": 0, "state": 0, "event": 0}

        def put(
            kind: str,
            time: datetime,
            extra: str | None,
            lat: float | None,
            lon: float | None,
            metric: str | None,
            value: float | None,
            data: dict[str, Any],
        ) -> None:
            key = f"{tracker.id}:{time.astimezone(UTC).isoformat()}:{kind}" + (
                f":{extra}" if extra else ""
            )
            cursor = db.execute(
                "INSERT OR IGNORE INTO records "
                "(key, card_id, frame_id, device_id, entity_id, kind, "
                "time, lat, lon, metric, value, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    key,
                    card_id,
                    frame_id,
                    tracker.id,
                    tracker.entity_id,
                    kind,
                    time.astimezone(UTC).isoformat(),
                    lat,
                    lon,
                    metric,
                    value,
                    json.dumps(data, default=str),
                ),
            )
            if cursor.rowcount:
                new[kind] += 1

        for p in records.positions:
            put(
                "position",
                p.time,
                p.fingerprint or p.record_type,
                p.latitude,
                p.longitude,
                None,
                None,
                {
                    "record_type": p.record_type,
                    "altitude_m": p.altitude_m,
                    "accuracy_m": p.accuracy_m,
                    "speed_mps": p.speed_mps,
                    "heading_deg": p.heading_deg,
                    "satellites": p.satellites,
                },
            )
        for m in records.measurements:
            number = (
                float(m.value)
                if isinstance(m.value, int | float) and not isinstance(m.value, bool)
                else None
            )
            put(
                "measurement",
                m.time,
                m.fingerprint or m.metric_key,
                None,
                None,
                m.metric_key,
                number,
                {"value": m.value},
            )
        for s in records.states:
            put("state", s.time, None, None, None, None, None, s.state)
        for e in records.events:
            put(
                "event",
                e.time,
                e.event_type,
                e.latitude,
                e.longitude,
                None,
                None,
                {
                    "event_type": e.event_type,
                    "title": e.title,
                    "severity": str(e.severity),
                    "description": e.description,
                    "context": e.context,
                },
            )
        return new

    # --- what the pages ask

    def cards(self, limit: int = LIST_LIMIT) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT * FROM cards ORDER BY imported_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(row) for row in rows]

    def card(self, card_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        return dict(row) if row else None

    def card_detail(self, card_id: str) -> dict[str, Any] | None:
        summary = self.card(card_id)
        if summary is None:
            return None
        with self._connect() as db:
            files = db.execute(
                "SELECT id, name, folder, size, station_eui, lines, frames, errors FROM card_files "
                "WHERE card_id = ? ORDER BY folder, name",
                (card_id,),
            ).fetchall()
            trackers = db.execute(
                "SELECT device_id, device_name, COUNT(*) AS frames, "
                "SUM(status = 'decoded') AS decoded, SUM(status = 'refused') AS refused, "
                "SUM(status = 'repeated') AS repeated, SUM(positions) AS positions, "
                "SUM(measurements) AS measurements FROM frames "
                "WHERE card_id = ? AND device_id IS NOT NULL GROUP BY device_id, device_name "
                "ORDER BY device_name",
                (card_id,),
            ).fetchall()
            spans = {
                row["device_id"]: row
                for row in db.execute(
                    "SELECT device_id, entity_id, MIN(time) AS first_time, MAX(time) AS last_time "
                    "FROM records WHERE card_id = ? AND kind = 'position' "
                    "GROUP BY device_id, entity_id",
                    (card_id,),
                ).fetchall()
            }
            failures = db.execute(
                "SELECT f.line, c.name AS file, f.dev_addr, f.device_name, f.status, f.code, "
                "f.reason "
                "FROM frames f JOIN card_files c ON c.id = f.file_id "
                "WHERE f.card_id = ? AND f.status NOT IN ('decoded', 'repeated') "
                "ORDER BY c.folder, c.name, f.line LIMIT ?",
                (card_id, FAILURES_LIMIT),
            ).fetchall()
        summary["files_list"] = [dict(row) for row in files]
        summary["trackers"] = [
            {
                **dict(row),
                "entity_id": spans[row["device_id"]]["entity_id"]
                if row["device_id"] in spans
                else None,
                "first_time": spans[row["device_id"]]["first_time"]
                if row["device_id"] in spans
                else None,
                "last_time": spans[row["device_id"]]["last_time"]
                if row["device_id"] in spans
                else None,
            }
            for row in trackers
        ]
        summary["failures"] = [dict(row) for row in failures]
        return summary

    def records(
        self,
        device_ids: list[str] | None,
        *,
        since: str | None = None,
        until: str | None = None,
        limit: int = RECORDS_LIMIT,
    ) -> list[dict[str, Any]]:
        """The rows of the Data explorer (decision D25), as Protect's records: one row per
        tracker and moment with the fix, when there was one, and every measurement of that
        moment as a column; newest first, bounded."""
        clauses, params = ["kind IN ('position', 'measurement')"], []
        if device_ids:
            clauses.append(f"device_id IN ({','.join('?' * len(device_ids))})")
            params.extend(device_ids)
        if since:
            clauses.append("time >= ?")
            params.append(since)
        if until:
            clauses.append("time <= ?")
            params.append(until)
        with self._connect() as db:
            names = {
                row["device_id"]: row["device_name"]
                for row in db.execute(
                    "SELECT device_id, MAX(device_name) AS device_name FROM frames "
                    "WHERE device_id IS NOT NULL GROUP BY device_id"
                ).fetchall()
            }
            rows = db.execute(
                "SELECT device_id, entity_id, kind, time, lat, lon, metric, value, data "
                f"FROM records WHERE {' AND '.join(clauses)} ORDER BY time DESC",
                params,
            ).fetchall()
        merged: dict[tuple[str, str], dict[str, Any]] = {}
        for row in rows:
            key = (str(row["device_id"]), str(row["time"]))
            entry = merged.get(key)
            if entry is None:
                if len(merged) >= limit:
                    break
                entry = {
                    "time": row["time"],
                    "device_id": row["device_id"],
                    "device_name": names.get(row["device_id"]) or row["device_id"],
                    "entity_id": row["entity_id"],
                    "lat": None,
                    "lon": None,
                    "values": {},
                }
                merged[key] = entry
            if row["kind"] == "position":
                entry["lat"], entry["lon"] = row["lat"], row["lon"]
            elif row["metric"]:
                value: Any = row["value"]
                if value is None:
                    with contextlib.suppress(ValueError, TypeError):
                        value = json.loads(row["data"]).get("value")
                entry["values"][str(row["metric"])] = value
        return list(merged.values())

    def offered_metrics(
        self,
        device_ids: list[str] | None,
        *,
        since: str | None = None,
        until: str | None = None,
    ) -> list[dict[str, Any]]:
        """The metrics the chosen trackers reported in the window, with counts, for the
        explorer's picker (as Protect's analytics metrics)."""
        clauses, params = ["kind = 'measurement'", "metric IS NOT NULL"], []
        if device_ids:
            clauses.append(f"device_id IN ({','.join('?' * len(device_ids))})")
            params.extend(device_ids)
        if since:
            clauses.append("time >= ?")
            params.append(since)
        if until:
            clauses.append("time <= ?")
            params.append(until)
        with self._connect() as db:
            rows = db.execute(
                "SELECT metric, COUNT(*) AS count FROM records "
                f"WHERE {' AND '.join(clauses)} GROUP BY metric ORDER BY count DESC",
                params,
            ).fetchall()
        return [{"key": row["metric"], "count": int(row["count"])} for row in rows]

    def stations(self) -> list[dict[str, Any]]:
        """Every offload station whose files were read, by EUI: the batches and files read,
        the frames and what became of them, the files still to upload, and the last read."""
        with self._connect() as db:
            rows = db.execute(
                "SELECT c.station_eui, MAX(c.station_device_id) AS station_device_id, "
                "MAX(c.station_name) AS station_name, "
                "COUNT(DISTINCT c.id) AS cards, COUNT(DISTINCT f.id) AS files, "
                "COALESCE(SUM(f.frames), 0) AS frames, "
                "COALESCE(SUM(f.upload_status = 'pending'), 0) AS pending, "
                "COALESCE(SUM(f.upload_status = 'failed'), 0) AS failed, "
                "COALESCE(SUM(f.upload_status = 'uploaded'), 0) AS uploaded, "
                "COALESCE(SUM(f.upload_status = 'duplicate'), 0) AS duplicate, "
                "MAX(c.imported_at) AS last_read "
                "FROM cards c LEFT JOIN card_files f ON f.card_id = c.id "
                "WHERE c.station_eui IS NOT NULL GROUP BY c.station_eui ORDER BY c.station_eui"
            ).fetchall()
        return [dict(row) for row in rows]

    def positions(
        self,
        card_id: str | None,
        device_id: str | None,
        limit: int = POSITIONS_LIMIT,
        *,
        since: str | None = None,
        until: str | None = None,
    ) -> list[dict[str, Any]]:
        """Positions of a batch of files, a device or everything, within a window, newest first,
        bounded."""
        clauses, params = ["kind = 'position'"], []
        if card_id:
            clauses.append("card_id = ?")
            params.append(card_id)
        if device_id:
            clauses.append("device_id = ?")
            params.append(device_id)
        if since:
            clauses.append("time >= ?")
            params.append(since)
        if until:
            clauses.append("time <= ?")
            params.append(until)
        with self._connect() as db:
            rows = db.execute(
                "SELECT device_id, entity_id, time, lat, lon FROM records "
                f"WHERE {' AND '.join(clauses)} "
                f"ORDER BY time DESC LIMIT ?",
                (*params, limit),
            ).fetchall()
        return [dict(row) for row in rows]

    # --- the files, one row each, as a file explorer shows them (F2, Tim 2026-10-17)

    def files(self) -> list[dict[str, Any]]:
        """Every file read, newest batch first, with its outcome counts and its upload state."""
        with self._connect() as db:
            rows = db.execute(
                "SELECT f.id, f.card_id, c.name AS card_name, c.station_name, c.station_eui, "
                "c.imported_at, f.name, f.folder, f.size, f.lines, f.frames, f.errors, "
                "f.upload_status, f.upload_answer, f.uploaded_at, "
                "COALESCE(SUM(fr.status = 'decoded'), 0) AS decoded, "
                "COALESCE(SUM(fr.status = 'repeated'), 0) AS repeated, "
                "COALESCE(SUM(fr.status = 'refused'), 0) AS refused, "
                "COALESCE(SUM(fr.status = 'unknown_address'), 0) AS unknown, "
                "COALESCE(SUM(fr.positions), 0) AS positions, "
                "COALESCE(SUM(fr.measurements), 0) AS measurements "
                "FROM card_files f JOIN cards c ON c.id = f.card_id "
                "LEFT JOIN frames fr ON fr.file_id = f.id "
                "GROUP BY f.id ORDER BY c.imported_at DESC, f.folder, f.name LIMIT ?",
                (LIST_LIMIT * 100,),
            ).fetchall()
        return [dict(row) for row in rows]

    def file_detail(self, file_id: str) -> dict[str, Any] | None:
        """One file's properties: the counts, the trackers it carried and the frames not read."""
        rows = [f for f in self.files() if f["id"] == file_id]
        if not rows:
            return None
        detail = rows[0]
        with self._connect() as db:
            trackers = db.execute(
                "SELECT device_id, device_name, COUNT(*) AS frames, "
                "SUM(status = 'decoded') AS decoded, SUM(positions) AS positions "
                "FROM frames WHERE file_id = ? AND device_id IS NOT NULL "
                "GROUP BY device_id, device_name ORDER BY device_name",
                (file_id,),
            ).fetchall()
            failures = db.execute(
                "SELECT line, dev_addr, device_name, status, code, reason FROM frames "
                "WHERE file_id = ? AND status NOT IN ('decoded', 'repeated') ORDER BY line LIMIT ?",
                (file_id, FAILURES_LIMIT),
            ).fetchall()
        detail["trackers"] = [dict(row) for row in trackers]
        detail["failures"] = [dict(row) for row in failures]
        return detail

    # --- the upload (F4)

    def pending_files(self, card_id: str | None = None) -> list[dict[str, Any]]:
        """The files still to upload, or to try again: pending and failed ones, oldest card
        first, with the card's station."""
        clauses = ["f.upload_status IN ('pending', 'failed')"]
        params: list[Any] = []
        if card_id:
            clauses.append("f.card_id = ?")
            params.append(card_id)
        with self._connect() as db:
            rows = db.execute(
                "SELECT f.id, f.card_id, f.name, f.folder, f.path, f.attempts, "
                "c.station_device_id, c.station_eui, c.name AS card_name "
                f"FROM card_files f JOIN cards c ON c.id = f.card_id WHERE {' AND '.join(clauses)} "
                "ORDER BY c.imported_at, f.folder, f.name",
                params,
            ).fetchall()
        return [dict(row) for row in rows]

    def mark_upload(
        self, file_id: str, status: str, answer: str | None, *, log_file_id: str | None = None
    ) -> None:
        with self._connect() as db:
            db.execute(
                "UPDATE card_files SET upload_status = ?, upload_answer = ?, "
                "attempts = attempts + 1, "
                "uploaded_at = CASE WHEN ? IN ('uploaded', 'duplicate') THEN ? "
                "ELSE uploaded_at END, "
                "log_file_id = COALESCE(?, log_file_id) WHERE id = ?",
                (status, answer, status, datetime.now(UTC).isoformat(), log_file_id, file_id),
            )

    def upload_summary(self) -> list[dict[str, Any]]:
        """Per card: how many files wait, went up, were there already, were refused or failed."""
        with self._connect() as db:
            rows = db.execute(
                "SELECT c.id AS card_id, c.name, c.station_name, c.station_eui, "
                "c.station_device_id, c.imported_at, COUNT(*) AS files, "
                "SUM(f.upload_status = 'pending') AS pending, "
                "SUM(f.upload_status = 'uploaded') AS uploaded, "
                "SUM(f.upload_status = 'duplicate') AS duplicate, "
                "SUM(f.upload_status = 'refused') AS refused, "
                "SUM(f.upload_status = 'failed') AS failed, "
                "MAX(f.uploaded_at) AS last_uploaded_at, "
                "(SELECT upload_answer FROM card_files WHERE card_id = c.id "
                " AND upload_status IN ('failed', 'refused') ORDER BY uploaded_at DESC LIMIT 1) "
                "AS last_problem "
                "FROM cards c JOIN card_files f ON f.card_id = c.id "
                "GROUP BY c.id ORDER BY c.imported_at DESC LIMIT ?",
                (LIST_LIMIT,),
            ).fetchall()
        return [dict(row) for row in rows]

    # --- the trackers across every batch of files (F3)

    def trackers(self) -> list[dict[str, Any]]:
        """Every tracker that appears in the records: its name, entity, how many positions and
        measurements, the span of its positions and its newest position."""
        with self._connect() as db:
            names = {
                row["device_id"]: row["device_name"]
                for row in db.execute(
                    "SELECT device_id, MAX(device_name) AS device_name FROM frames "
                    "WHERE device_id IS NOT NULL GROUP BY device_id"
                ).fetchall()
            }
            rows = db.execute(
                "SELECT device_id, entity_id, "
                "SUM(kind = 'position') AS positions, SUM(kind = 'measurement') AS measurements, "
                "MIN(CASE WHEN kind = 'position' THEN time END) AS first_time, "
                "MAX(CASE WHEN kind = 'position' THEN time END) AS last_time "
                "FROM records GROUP BY device_id, entity_id ORDER BY device_id"
            ).fetchall()
            result = []
            for row in rows:
                last = db.execute(
                    "SELECT time, lat, lon FROM records WHERE device_id = ? AND kind = 'position' "
                    "ORDER BY time DESC LIMIT 1",
                    (row["device_id"],),
                ).fetchone()
                result.append(
                    {
                        **dict(row),
                        "device_name": names.get(row["device_id"], row["device_id"]),
                        "last_lat": last["lat"] if last else None,
                        "last_lon": last["lon"] if last else None,
                    }
                )
        return result

    def unknown_trackers(self) -> list[dict[str, Any]]:
        """The LP0 addresses the cards hold frames for that no device of the bundle has
        (Protect's D338): the address, the tracker EUI when a v5 station wrote it, how many
        frames, the span of their reception and the stations that heard them. What Protect's
        Offload page lists as "Addresses no device has", here from the files on the laptop."""
        with self._connect() as db:
            rows = db.execute(
                "SELECT f.dev_addr, MAX(f.source_eui) AS source_eui, COUNT(*) AS frames, "
                "MIN(f.received_at) AS first_at, MAX(f.received_at) AS last_at, "
                "GROUP_CONCAT(DISTINCT COALESCE(c.station_name, c.station_eui)) AS stations "
                "FROM frames f JOIN cards c ON c.id = f.card_id "
                "WHERE f.status = 'unknown_address' AND f.dev_addr IS NOT NULL "
                "GROUP BY f.dev_addr ORDER BY MAX(f.received_at) DESC"
            ).fetchall()
        return [
            {
                **dict(row),
                "stations": sorted(set((row["stations"] or "").split(",")))
                if row["stations"]
                else [],
            }
            for row in rows
        ]

    def read_unknown_again(self, bundle: dict[str, Any], *, now: datetime | None = None) -> int:
        """Read the frames of unknown addresses again with a fresh bundle (Protect's D338): a
        tracker added in Protect since is in the bundle now, with its keys when the account may
        see them, so its frames decode here without a second import. The kept files are read
        line by line, only the lines that were unknown and whose address the bundle knows now;
        each card's counts are summed anew from its frames. Returns how many frames were read."""
        now = now or datetime.now(UTC)
        trackers = trackers_of(bundle)
        if not trackers:
            return 0
        read = 0
        with self._connect() as db:
            pending = db.execute(
                "SELECT f.id, f.card_id, f.file_id, f.line, f.dev_addr, cf.path "
                "FROM frames f JOIN card_files cf ON cf.id = f.file_id "
                "WHERE f.status = 'unknown_address' AND f.dev_addr IS NOT NULL "
                "ORDER BY f.card_id, f.file_id, f.line"
            ).fetchall()
            wanted = [row for row in pending if row["dev_addr"].upper() in trackers]
            by_file: dict[str, list[sqlite3.Row]] = {}
            for row in wanted:
                by_file.setdefault(row["file_id"], []).append(row)
            touched: set[str] = set()
            for file_id, rows in by_file.items():
                path = Path(rows[0]["path"])
                if not path.exists():
                    continue
                parsed = parse_station_jsonl(path.read_text(encoding="utf-8", errors="replace"))
                by_line = {frame.line: frame for frame in parsed.frames}
                for row in rows:
                    frame = by_line.get(row["line"])
                    if frame is None:
                        continue
                    db.execute("DELETE FROM frames WHERE id = ?", (row["id"],))
                    counts = Counts()
                    self._read_frame(db, row["card_id"], file_id, frame, trackers, counts, now)
                    read += 1
                    touched.add(row["card_id"])
            for card_id in touched:
                self._recount(db, card_id)
        return read

    @staticmethod
    def _recount(db: sqlite3.Connection, card_id: str) -> None:
        """A card's counts summed anew from its frames and records."""
        totals = db.execute(
            "SELECT COALESCE(SUM(status = 'decoded'), 0) AS decoded, "
            "COALESCE(SUM(status = 'repeated'), 0) AS repeated, "
            "COALESCE(SUM(status = 'refused'), 0) AS refused, "
            "COALESCE(SUM(status = 'unknown_address'), 0) AS unknown, "
            "COALESCE(SUM(status = 'line_error'), 0) AS line_errors "
            "FROM frames WHERE card_id = ?",
            (card_id,),
        ).fetchone()
        records = db.execute(
            "SELECT COALESCE(SUM(kind = 'position'), 0) AS positions, "
            "COALESCE(SUM(kind = 'measurement'), 0) AS measurements, "
            "COALESCE(SUM(kind = 'state'), 0) AS states, "
            "COALESCE(SUM(kind = 'event'), 0) AS events FROM records WHERE card_id = ?",
            (card_id,),
        ).fetchone()
        db.execute(
            "UPDATE cards SET decoded = ?, repeated = ?, refused = ?, unknown = ?, "
            "line_errors = ?, positions = ?, measurements = ?, states = ?, events = ? "
            "WHERE id = ?",
            (
                totals["decoded"],
                totals["repeated"],
                totals["refused"],
                totals["unknown"],
                totals["line_errors"],
                records["positions"],
                records["measurements"],
                records["states"],
                records["events"],
                card_id,
            ),
        )

    def metrics(self, device_id: str) -> list[dict[str, Any]]:
        """The metrics a tracker reported, each with its count, span and newest value."""
        with self._connect() as db:
            rows = db.execute(
                "SELECT metric, COUNT(*) AS count, MIN(time) AS first_time, MAX(time) AS last_time "
                "FROM records WHERE device_id = ? AND kind = 'measurement' GROUP BY metric "
                "ORDER BY metric",
                (device_id,),
            ).fetchall()
            result = []
            for row in rows:
                last = db.execute(
                    "SELECT value, data FROM records WHERE device_id = ? AND kind = 'measurement' "
                    "AND metric = ? ORDER BY time DESC LIMIT 1",
                    (device_id, row["metric"]),
                ).fetchone()
                latest = (
                    last["value"]
                    if last and last["value"] is not None
                    else (json.loads(last["data"]).get("value") if last else None)
                )
                result.append({**dict(row), "latest": latest})
        return result

    def measurements(
        self,
        device_id: str,
        metric: str,
        *,
        since: str | None = None,
        until: str | None = None,
        limit: int = POSITIONS_LIMIT,
    ) -> list[dict[str, Any]]:
        clauses = ["device_id = ?", "kind = 'measurement'", "metric = ?"]
        params: list[Any] = [device_id, metric]
        if since:
            clauses.append("time >= ?")
            params.append(since)
        if until:
            clauses.append("time <= ?")
            params.append(until)
        with self._connect() as db:
            rows = db.execute(
                f"SELECT time, value, data FROM records WHERE {' AND '.join(clauses)} "
                "ORDER BY time DESC LIMIT ?",
                (*params, limit),
            ).fetchall()
        return [
            {
                "time": row["time"],
                "value": row["value"]
                if row["value"] is not None
                else json.loads(row["data"]).get("value"),
            }
            for row in rows
        ]

    def delete_card(self, card_id: str) -> bool:
        with self._connect() as db:
            gone = db.execute("DELETE FROM cards WHERE id = ?", (card_id,)).rowcount
        folder = self.files_dir / card_id
        if folder.is_dir():
            for path in sorted(folder.rglob("*"), reverse=True):
                path.unlink() if path.is_file() else path.rmdir()
            folder.rmdir()
        return bool(gone)
