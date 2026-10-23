"""A card read on the laptop (phase 2 F2): the files of a synthetic card, built with Protect's
own frame builder from the decoder tests' flash stream under the fixture keys, read with the
bundle's keys through the shared decode path; the frames counted by outcome, the records
deduplicated, the files kept, the failures named."""

import base64
import io
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from protect_go.bundle import BundleStore
from protect_go.cards import CardStore
from protect_go.config import get_settings
from protect_go.main import create_app
from tests.test_bundle import BUNDLE
from tests.test_protect_decoding import CREDENTIALS, FLASH, build_uplink
from tests.test_setup import protect_server

STATION = "0016C001F0500101"
OTHER_KEYS = type(CREDENTIALS)("26010203", bytes(range(1, 17)), bytes(range(2, 18)))


def line(
    phy: bytes,
    *,
    time: str = "2026-10-12T08:50:31Z",
    lp0: dict | None = None,
    station: str = STATION,
) -> str:
    document: dict = {"gatewayEui": station}
    if lp0 is not None:
        document["lp0"] = lp0
    document["rxpk"] = {
        "time": time,
        "tmst": 1791795031,
        "freq": 864.629,
        "datr": "SF7BW250",
        "codr": "4/5",
        "rssi": -71,
        "lsnr": 9,
        "size": len(phy),
        "data": base64.b64encode(phy).decode(),
    }
    return json.dumps(document)


def card_zip(station: str = STATION) -> bytes:
    frames = [
        build_uplink(CREDENTIALS, 1, 29, FLASH),  # three stored fixes
        build_uplink(CREDENTIALS, 1, 29, FLASH),  # the station saved it again
        build_uplink(
            type(CREDENTIALS)("26010299", CREDENTIALS.app_s_key, CREDENTIALS.nwk_s_key),
            5,
            29,
            FLASH,
        ),  # nobody's address
        build_uplink(OTHER_KEYS, 2, 29, FLASH),  # the tracker's address, the wrong keys
    ]
    first = (
        "\n".join(
            [
                "",
                line(frames[0], station=station),
                line(frames[1], station=station),
                line(frames[2], station=station),
            ]
        )
        + "\n"
    )
    second = (
        "\n".join(
            ["", line(frames[3], time="2026-10-12T09:00:00Z", station=station), "not json at all"]
        )
        + "\n"
    )
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(f"LOG_1/{station}_1791795031.jsonl", first)
        archive.writestr(f"LOG_2/{station}_1791796000.jsonl", second)
        archive.writestr("LOG_2/notes.txt", "hello")
    return buffer.getvalue()


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("PROTECT_GO_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("PROTECT_GO_KEY_STORE", "file")
    get_settings.cache_clear()
    application = create_app()
    application.state.http_transport = httpx.MockTransport(protect_server)
    yield application
    get_settings.cache_clear()


async def test_a_card_is_read_with_the_bundles_keys_and_every_frame_has_an_outcome(app, tmp_path):
    data = tmp_path / "data"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        refused = await client.post(
            "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
        )
        assert refused.status_code == 409 and "Load a project first" in refused.text
        BundleStore(data, "file").save(BUNDLE)

        nothing = await client.post(
            "/api/cards", files=[("files", ("notes.txt", b"hello", "text/plain"))]
        )
        assert nothing.status_code == 422 and "No station file" in nothing.text

        read = await client.post(
            "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
        )
        assert read.status_code == 201, read.text
        card = read.json()
        assert card["station_eui"] == STATION and card["station_name"] == "Station 1"
        assert card["files"] == 2 and card["frames"] == 4 and card["line_errors"] == 1
        assert (
            card["decoded"] == 1
            and card["repeated"] == 1
            and card["unknown"] == 1
            and card["refused"] == 1
        )
        assert card["positions"] == 3 and card["skipped"] == ["LOG_2/notes.txt"]

        detail = (await client.get(f"/api/cards/{card['id']}")).json()
        assert [f["name"] for f in detail["files_list"]] == [
            f"{STATION}_1791795031.jsonl",
            f"{STATION}_1791796000.jsonl",
        ]
        (tracker,) = detail["trackers"]
        assert (
            tracker["device_name"] == "SP100001"
            and tracker["decoded"] == 1
            and tracker["positions"] == 3
        )
        assert tracker["entity_id"] == "e1" and tracker["first_time"] < tracker["last_time"]
        statuses = {(f["status"], f["code"]) for f in detail["failures"]}
        assert ("unknown_address", "DEVICE_UNKNOWN") in statuses
        assert ("refused", "PAYLOAD_DECODE_FAILED") in statuses
        assert ("line_error", "LINE_UNREADABLE") in statuses
        wrong = next(f for f in detail["failures"] if f["code"] == "PAYLOAD_DECODE_FAILED")
        assert "does not verify" in wrong["reason"] and wrong["device_name"] == "SP100001"

        positions = (await client.get(f"/api/cards/{card['id']}/positions")).json()
        assert len(positions) == 3 and all(
            p["device_id"] == "d1" and p["entity_id"] == "e1" for p in positions
        )
        assert positions[0]["time"] > positions[-1]["time"]

        # the files are kept untouched for the upload
        kept = sorted(p.name for p in (data / "cards" / card["id"]).rglob("*.jsonl"))
        assert kept == [f"{STATION}_1791795031.jsonl", f"{STATION}_1791796000.jsonl"]

        # the same card again: every file was read before, so no card is made and nothing
        # is read or kept twice; the answer names the files and the card that holds them (D30)
        again = await client.post(
            "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
        )
        assert again.status_code == 200, again.text
        assert again.json()["id"] is None and again.json()["files"] == 0
        assert [(f["name"], f["card_name"]) for f in again.json()["read_before"]] == [
            (f"{STATION}_1791795031.jsonl", "card.zip"),
            (f"{STATION}_1791796000.jsonl", "card.zip"),
        ]
        assert again.json()["read_before"][0]["imported_at"] == card["imported_at"]
        assert len((await client.get("/api/cards")).json()) == 1
        assert len((await client.get("/api/files")).json()) == 2

        # the card read again after it grew: the file read before is left out, the new one read
        grown = io.BytesIO()
        with (
            zipfile.ZipFile(io.BytesIO(card_zip())) as old_zip,
            zipfile.ZipFile(grown, "w") as new_zip,
        ):
            new_zip.writestr(
                f"LOG_1/{STATION}_1791795031.jsonl",
                old_zip.read(f"LOG_1/{STATION}_1791795031.jsonl"),
            )
            new_zip.writestr(
                f"LOG_3/{STATION}_1791799000.jsonl",
                "\n" + line(build_uplink(CREDENTIALS, 7, 29, FLASH), time="2026-10-13T08:00:00Z"),
            )
        more = await client.post(
            "/api/cards", files=[("files", ("card.zip", grown.getvalue(), "application/zip"))]
        )
        assert more.status_code == 201, more.text
        assert more.json()["files"] == 1 and more.json()["frames"] == 1
        assert [f["name"] for f in more.json()["read_before"]] == [f"{STATION}_1791795031.jsonl"]
        assert len((await client.get("/api/files")).json()) == 3
        assert (await client.delete(f"/api/cards/{more.json()['id']}")).status_code == 204

        gone = await client.delete(f"/api/cards/{card['id']}")
        assert gone.status_code == 204 and not (data / "cards" / card["id"]).exists()
        assert (await client.get(f"/api/cards/{card['id']}")).status_code == 404


def test_loose_files_with_their_folders_read_as_a_card(tmp_path):
    store = CardStore(tmp_path)
    phy = build_uplink(CREDENTIALS, 3, 29, FLASH)
    text = (
        "\n"
        + line(
            phy,
            lp0={
                "version": 5,
                "source_eui": "0016C001F0100001",
                "session": 1,
                "window": 1,
                "slot": 1,
            },
        )
        + "\n"
    )
    card = store.import_card(
        "LOG_1",
        [(f"LOG_1/{STATION}_1791795031.jsonl", text.encode()), ("LOG_1/Thumbs.db", b"x")],
        BUNDLE,
        now=datetime(2026, 10, 17, tzinfo=UTC),
    )
    assert (
        card["decoded"] == 1 and card["positions"] == 3 and card["skipped"] == ["LOG_1/Thumbs.db"]
    )
    assert (
        Path(tmp_path) / "cards" / card["id"] / "LOG_1" / f"{STATION}_1791795031.jsonl"
    ).is_file()


def test_a_bundle_without_keys_reads_frames_as_refused(tmp_path):
    store = CardStore(tmp_path)
    bundle = json.loads(json.dumps(BUNDLE))
    bundle["devices"][0]["lp0"]["app_s_key"] = None
    bundle["devices"][0]["lp0"]["nwk_s_key"] = None
    bundle["credentials_included"] = False
    text = "\n" + line(build_uplink(CREDENTIALS, 3, 29, FLASH)) + "\n"
    card = store.import_card("LOG_1", [(f"LOG_1/{STATION}_1.jsonl", text.encode())], bundle)
    assert card["refused"] == 1 and card["decoded"] == 0
    (failure,) = store.card_detail(card["id"])["failures"]
    assert (
        failure["code"] == "CREDENTIALS_MISSING" and "SP100001 has no LP0 keys" in failure["reason"]
    )


async def test_the_trackers_their_positions_and_measurements_across_files(app, tmp_path):
    BundleStore(tmp_path / "data", "file").save(BUNDLE)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/trackers")).json() == []
        read = await client.post(
            "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
        )
        assert read.status_code == 201, read.text
        (tracker,) = (await client.get("/api/trackers")).json()
        assert tracker["device_name"] == "SP100001" and tracker["positions"] == 3
        assert tracker["last_lat"] is not None and tracker["first_time"] <= tracker["last_time"]
        everything = (await client.get("/api/positions")).json()
        assert len(everything) == 3 and everything[0]["time"] >= everything[-1]["time"]
        windowed = (
            await client.get(
                "/api/positions", params={"device_id": "d1", "since": tracker["last_time"]}
            )
        ).json()
        assert len(windowed) == 1
        metrics = (await client.get("/api/trackers/d1/metrics")).json()
        assert isinstance(metrics, list)
        if metrics:
            first = metrics[0]
            values = (
                await client.get(
                    "/api/trackers/d1/measurements", params={"metric": first["metric"]}
                )
            ).json()
            assert len(values) == first["count"] and values[0]["value"] == first["latest"]
        assert (await client.get("/api/trackers/nobody/metrics")).status_code == 404


async def test_every_file_is_a_row_with_its_counts_and_its_properties(app, tmp_path):
    BundleStore(tmp_path / "data", "file").save(BUNDLE)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        read = await client.post(
            "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
        )
        assert read.status_code == 201, read.text
        files = (await client.get("/api/files")).json()
        assert [f["name"] for f in files] == [
            f"{STATION}_1791795031.jsonl",
            f"{STATION}_1791796000.jsonl",
        ]
        first, second = files
        assert (
            first["folder"] == "LOG_1"
            and first["card_name"] == "card.zip"
            and first["station_name"] == "Station 1"
        )
        assert (
            first["frames"],
            first["decoded"],
            first["repeated"],
            first["unknown"],
            first["positions"],
        ) == (3, 1, 1, 1, 3)
        assert (second["frames"], second["refused"], second["errors"]) == (1, 1, 1)
        assert first["upload_status"] == "pending" and first["size"] > 0
        detail = (await client.get(f"/api/files/{second['id']}")).json()
        assert detail["trackers"] == [
            {
                "device_id": "d1",
                "device_name": "SP100001",
                "frames": 1,
                "decoded": 0,
                "positions": 0,
            }
        ]
        assert [f["code"] for f in detail["failures"]] == [
            "LINE_UNREADABLE",
            "PAYLOAD_DECODE_FAILED",
        ] or [f["code"] for f in detail["failures"]] == ["PAYLOAD_DECODE_FAILED", "LINE_UNREADABLE"]
        assert (await client.get("/api/files/nothing")).status_code == 404


async def test_the_records_rows_merge_the_fix_and_the_measurements_of_a_moment(app, tmp_path):
    """Decision D25: the Data explorer's rows, one per tracker and moment, with the offered
    metrics beside them."""
    BundleStore(tmp_path / "data", "file").save(BUNDLE)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
        )
        rows = (await client.get("/api/records", params={"device_id": ["d1"]})).json()
        assert rows and all(r["device_id"] == "d1" and r["device_name"] == "SP100001" for r in rows)
        assert rows[0]["time"] >= rows[-1]["time"]
        with_fix = [r for r in rows if r["lat"] is not None]
        assert len(with_fix) == 3
        assert all(isinstance(r["values"], dict) for r in rows)
        metrics = (await client.get("/api/records/metrics", params={"device_id": ["d1"]})).json()
        assert all(set(m) == {"key", "count"} for m in metrics)
        nothing = (await client.get("/api/records", params={"device_id": ["nobody"]})).json()
        assert nothing == []
        stations = (await client.get("/api/bundle/stations")).json()
        assert stations and stations[0]["station_eui"] == STATION


async def test_the_stations_and_the_devices_for_their_pages(app, tmp_path):
    """The Offload stations and Trackers pages: what the files brought per station, and the
    bundle's devices without a key."""
    BundleStore(tmp_path / "data", "file").save(BUNDLE)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/stations")).json() == []
        await client.post(
            "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
        )
        (station,) = (await client.get("/api/stations")).json()
        assert station["station_eui"] == STATION and station["station_name"] == "Station 1"
        assert station["cards"] == 1 and station["files"] == 2 and station["pending"] == 2
        assert station["frames"] == 4 and station["last_read"]
        devices = (await client.get("/api/bundle/devices")).json()
        assert devices and all("app_s_key" not in d and "nwk_s_key" not in d for d in devices)
        tracker = next(d for d in devices if d["name"] == "SP100001")
        assert tracker["has_address"] is True and tracker["has_keys"] is True
        assert any(d["is_station"] for d in devices)


async def test_an_unknown_tracker_is_listed_and_read_again_once_the_bundle_knows_it(app, tmp_path):
    """Protect's D338 on the laptop: the address nobody has is listed with its frames, so the
    person adds the tracker in Protect; the bundle loaded again knows it, and its frames are
    read again from the kept files without a second import."""
    data = tmp_path / "data"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        BundleStore(data, "file").save(BUNDLE)
        card = (
            await client.post(
                "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
            )
        ).json()
        assert card["unknown"] == 1 and card["decoded"] == 1 and card["positions"] == 3
        unknown = (await client.get("/api/trackers/unknown")).json()
        assert [u["dev_addr"] for u in unknown] == ["26010299"]
        assert unknown[0]["frames"] == 1 and unknown[0]["stations"] == ["Station 1"]
        assert unknown[0]["source_eui"] is None and unknown[0]["last_at"] is not None

        # the tracker added in Protect: the next bundle carries it, with its keys
        known = json.loads(json.dumps(BUNDLE))
        known["devices"].append(
            {
                **BUNDLE["devices"][0],
                "id": "d3",
                "name": "SP100003",
                "serial_number": "0016C001F0100003",
                "dev_eui": "0016C001F0100003",
                "entity_id": None,
                "entity_name": None,
                "lp0": {**BUNDLE["devices"][0]["lp0"], "dev_addr": "26010299"},
            }
        )
        BundleStore(data, "file").save(known)
        read_again = CardStore(data).read_unknown_again(known)
        assert read_again == 1
        after = (await client.get(f"/api/cards/{card['id']}")).json()
        assert after["unknown"] == 0 and after["decoded"] == 2 and after["positions"] == 6
        assert (await client.get("/api/trackers/unknown")).json() == []
        trackers = (await client.get("/api/trackers")).json()
        assert {t["device_id"] for t in trackers} == {"d1", "d3"}
        assert CardStore(data).read_unknown_again(known) == 0
