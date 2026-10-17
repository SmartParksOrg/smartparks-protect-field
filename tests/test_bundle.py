"""The bundle on the laptop (decisions D2 and D11): fetched with the sign-in, kept encrypted so
the file holds no key in the clear, read back whole, stale after a week, and the map fetched
in the same call."""

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from protect_field.bundle import BundleStore
from protect_field.config import get_settings
from protect_field.main import create_app
from tests.test_setup import TOKEN, protect_server

PROJECT = "29fff2c4-1c20-476d-bb78-5de07b642e4b"
APP_KEY = "101112131415161718191A1B1C1D1E1F"
BUNDLE = {
    "format_version": 1,
    "generated_at": "2026-10-17T10:00:00Z",
    "protect_version": "v2.9.0",
    "protect_commit": "d79ffaf",
    "server_url": "https://dev-protect.example.org",
    "project": {"id": PROJECT, "name": "LP0", "slug": "lp0", "timezone": "UTC"},
    "area": {"west": -10.9, "south": 7.7, "east": -10.8, "north": 7.8},
    "map": None,
    "credentials_included": True,
    "devices": [
        {
            "id": "d1",
            "name": "SP100001",
            "serial_number": "SP100001",
            "dev_eui": "0016C001F0100001",
            "device_type_key": "oc",
            "device_type_label": "OpenCollar",
            "driver_key": "opencollar",
            "status": "active",
            "firmware_version": "8.1.0",
            "entity_id": "e1",
            "entity_name": "Hippo 1",
            "is_station": False,
            "lp0": {
                "dev_addr": "26010203",
                "keys_set": True,
                "app_s_key": APP_KEY,
                "nwk_s_key": "000102030405060708090a0b0c0d0e0f",
                "set_at": None,
                "source": "person",
            },
        },
        {
            "id": "d2",
            "name": "SP050101",
            "serial_number": "0016C001F0500101",
            "dev_eui": "0016C001F0500101",
            "device_type_key": "oc",
            "device_type_label": "OpenCollar",
            "driver_key": "opencollar",
            "status": "active",
            "firmware_version": None,
            "entity_id": "e2",
            "entity_name": "Station 1",
            "is_station": True,
            "lp0": None,
        },
    ],
    "entities": [
        {
            "id": "e1",
            "name": "Hippo 1",
            "entity_type_key": "hippo",
            "entity_type_label": "Hippo",
            "icon_key": None,
            "geometry": None,
        }
    ],
    "stations": [
        {
            "device_id": "d2",
            "device_name": "SP050101",
            "station_eui": "0016C001F0500101",
            "entity_id": "e2",
            "entity_name": "Station 1",
            "geometry": {"type": "Point", "coordinates": [-10.85, 7.75]},
        }
    ],
}


def server(request: httpx.Request) -> httpx.Response:
    if request.url.path == f"/api/v1/projects/{PROJECT}/field-bundle":
        assert request.headers["Authorization"] == f"Bearer {TOKEN}"
        return httpx.Response(200, json=BUNDLE)
    if request.url.path == f"/api/v1/projects/{PROJECT}/field-bundle/map":
        return (
            httpx.Response(404, json={"detail": "No offline map yet"})
            if request.method == "GET"
            else httpx.Response(202, json={"status": "queued"})
        )
    return protect_server(request)


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("FIELD_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("FIELD_KEY_STORE", "file")
    get_settings.cache_clear()
    application = create_app()
    yield application
    get_settings.cache_clear()


async def test_the_bundle_is_fetched_kept_encrypted_and_read_back(app, tmp_path):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/bundle")).json()["present"] is False
        assert (
            await client.post("/api/bundle/fetch", json={"project_id": PROJECT})
        ).status_code == 409
        app.state.http_transport = httpx.MockTransport(protect_server)
        await client.put(
            "/api/setup/server", json={"server_url": "https://dev-protect.example.org"}
        )
        await client.post("/api/session", json={"email": "ranger@example.org", "password": "right"})
        app.state.http_transport = httpx.MockTransport(server)

        loaded = await client.post(
            "/api/bundle/fetch", json={"project_id": PROJECT, "project_name": "LP0"}
        )
        assert loaded.status_code == 200, loaded.text
        body = loaded.json()
        assert body["bundle"]["present"] and body["bundle"]["project_name"] == "LP0"
        assert body["bundle"]["devices"] == 2 and body["bundle"]["stations"] == 1
        assert (
            body["bundle"]["trackers_with_keys"] == 1
            and body["bundle"]["credentials_included"] is True
        )
        assert body["bundle"]["stale"] is False and body["bundle"]["key_kept_in"] == "file"
        assert "making the map" in body["map"]["server_state"]
        assert "app_s_key" not in loaded.text and APP_KEY not in loaded.text

        # on disk: the key, mode 600, and a file that holds no key in the clear
        data = tmp_path / "data"
        assert oct((data / "bundle.key").stat().st_mode)[-3:] == "600"
        assert oct((data / "bundle.enc").stat().st_mode)[-3:] == "600"
        raw = (data / "bundle.enc").read_bytes()
        assert APP_KEY.encode() not in raw and b"26010203" not in raw and b"SP100001" not in raw

        # read back whole by the store the card pages will use
        store = BundleStore(data, "file")
        bundle, fetched_at = store.load()
        assert bundle["devices"][0]["lp0"]["app_s_key"] == APP_KEY
        assert datetime.fromisoformat(fetched_at).year == datetime.now(UTC).year

        again = (await client.get("/api/bundle")).json()
        assert again["present"] and again["entities"] == 1

        cleared = await client.delete("/api/bundle")
        assert cleared.json()["present"] is False and not (data / "bundle.enc").exists()


def test_a_week_old_bundle_is_stale_and_another_key_reads_nothing(tmp_path):
    store = BundleStore(tmp_path, "file")
    store.save(BUNDLE)
    summary = store.summary()
    assert summary is not None and summary.stale is False
    # age the envelope by rewriting it with an old fetched_at through the same key
    from cryptography.fernet import Fernet

    key = (tmp_path / "bundle.key").read_bytes()
    old = {"fetched_at": (datetime.now(UTC) - timedelta(days=8)).isoformat(), "bundle": BUNDLE}
    (tmp_path / "bundle.enc").write_bytes(Fernet(key).encrypt(json.dumps(old).encode()))
    aged = store.summary()
    assert aged is not None and aged.stale is True
    (tmp_path / "bundle.key").unlink()
    assert BundleStore(tmp_path, "file").load() is None
