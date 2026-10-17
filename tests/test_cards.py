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

from protect_field.bundle import BundleStore
from protect_field.cards import CardStore
from protect_field.config import get_settings
from protect_field.main import create_app
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
    monkeypatch.setenv("FIELD_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("FIELD_KEY_STORE", "file")
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

        # the same card again: every frame a repeat, no new record
        again = (
            await client.post(
                "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
            )
        ).json()
        assert again["decoded"] == 0 and again["repeated"] == 2 and again["positions"] == 0
        assert len((await client.get("/api/cards")).json()) == 2

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
