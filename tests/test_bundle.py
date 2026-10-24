"""The bundle on the laptop (decisions D2 and D11): fetched with the sign-in, kept encrypted so
the file holds no key in the clear, read back whole, stale after a week, and the map fetched
in the same call."""

import json
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from protect_go.bundle import BundleStore
from protect_go.config import get_settings
from protect_go.main import create_app
from tests.test_setup import LONG_TOKEN, TOKEN, protect_server

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
    "metrics": [
        {
            "key": "battery_voltage",
            "label": "Battery voltage",
            "unit": "V",
            "value_type": "float",
            "category": "power",
            "description": None,
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


#: The server's project as the mock serves it; a test moves it to see the app follow (D29).
SERVED: dict[str, Any] = {"bundle": BUNDLE, "revision": "rev-one"}


def server(request: httpx.Request) -> httpx.Response:
    if request.url.path == f"/api/v1/projects/{PROJECT}/field-bundle/revision":
        return httpx.Response(200, json={"revision": SERVED["revision"], "checked_at": "now"})
    if request.url.path == f"/api/v1/projects/{PROJECT}/field-bundle":
        assert request.headers["Authorization"] in (f"Bearer {TOKEN}", f"Bearer {LONG_TOKEN}")
        return httpx.Response(200, json={**SERVED["bundle"], "revision": SERVED["revision"]})
    if request.url.path == f"/api/v1/projects/{PROJECT}/field-bundle/map":
        return (
            httpx.Response(404, json={"detail": "No offline map yet"})
            if request.method == "GET"
            else httpx.Response(202, json={"status": "queued"})
        )
    return protect_server(request)


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("PROTECT_GO_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("PROTECT_GO_KEY_STORE", "file")
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

        # on disk: the key, mode 600, and a file per project that holds no key in the clear
        data = tmp_path / "data"
        kept = data / "bundles" / f"{PROJECT}.enc"
        assert oct((data / "bundle.key").stat().st_mode)[-3:] == "600"
        assert oct(kept.stat().st_mode)[-3:] == "600"
        assert (data / "bundles" / "current").read_text() == PROJECT
        raw = kept.read_bytes()
        assert APP_KEY.encode() not in raw and b"26010203" not in raw and b"SP100001" not in raw

        # read back whole by the store the card pages will use
        store = BundleStore(data, "file")
        bundle, fetched_at = store.load()
        assert bundle["devices"][0]["lp0"]["app_s_key"] == APP_KEY
        assert datetime.fromisoformat(fetched_at).year == datetime.now(UTC).year

        again = (await client.get("/api/bundle")).json()
        assert again["present"] and again["entities"] == 1

        cleared = await client.delete("/api/bundle")
        assert cleared.json()["present"] is False and not kept.exists()


def test_a_week_old_bundle_is_stale_and_another_key_reads_nothing(tmp_path):
    store = BundleStore(tmp_path, "file")
    store.save(BUNDLE)
    summary = store.summary()
    assert summary is not None and summary.stale is False
    # age the envelope by rewriting it with an old fetched_at through the same key
    from cryptography.fernet import Fernet

    key = (tmp_path / "bundle.key").read_bytes()
    old = {"fetched_at": (datetime.now(UTC) - timedelta(days=8)).isoformat(), "bundle": BUNDLE}
    (tmp_path / "bundles" / f"{PROJECT}.enc").write_bytes(
        Fernet(key).encrypt(json.dumps(old).encode())
    )
    aged = store.summary()
    assert aged is not None and aged.stale is True
    (tmp_path / "bundle.key").unlink()
    assert BundleStore(tmp_path, "file").load() is None


async def test_the_metric_definitions_come_from_the_bundle(app, tmp_path):
    """Protect's D334: the registry rides in the bundle; the app serves it to the explorer."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/bundle/metrics")).json() == []
        BundleStore(tmp_path / "data", "file").save(BUNDLE)
        rows = (await client.get("/api/bundle/metrics")).json()
        assert rows == BUNDLE["metrics"]


async def test_the_project_follows_the_server_by_itself(app):
    """A station added in Protect reaches the laptop without a hand on Server (D29): the
    connection probe compares the bundle's revision with the server's and loads again."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        app.state.http_transport = httpx.MockTransport(protect_server)
        await client.put(
            "/api/setup/server", json={"server_url": "https://dev-protect.example.org"}
        )
        await client.post("/api/session", json={"email": "ranger@example.org", "password": "right"})
        app.state.http_transport = httpx.MockTransport(server)
        SERVED["revision"] = "rev-one"
        loaded = await client.post(
            "/api/bundle/fetch", json={"project_id": PROJECT, "project_name": "LP0"}
        )
        assert loaded.json()["bundle"]["revision"] == "rev-one"

        # the same revision: checked, nothing loaded (the sync runs in the background, D34)
        first = (await client.get("/api/setup/connection")).json()
        await app.state.bundle_sync_task
        first = (await client.get("/api/setup/connection")).json()
        assert first["bundle_checked_at"] and first["bundle_updated_at"] is None
        assert first["bundle_outdated"] is False and first["projects_synced_at"]

        # the project changes on the server: a third device; the next due check loads it
        third = {**BUNDLE["devices"][1], "id": "d3", "name": "SP050102", "entity_id": None}
        SERVED["bundle"] = {**BUNDLE, "devices": [*BUNDLE["devices"], third]}
        SERVED["revision"] = "rev-two"
        app.state.bundle_follow = {**app.state.bundle_follow, "due": None}
        await client.get("/api/setup/connection")
        await app.state.bundle_sync_task
        second = (await client.get("/api/setup/connection")).json()
        assert second["bundle_updated_at"] is not None and second["bundle_outdated"] is False
        again = (await client.get("/api/bundle")).json()
        assert again["devices"] == 3 and again["revision"] == "rev-two"

        # within the five minutes: the last comparison is told again, the server not asked
        SERVED["revision"] = "rev-three"
        third_probe = (await client.get("/api/setup/connection")).json()
        assert third_probe["bundle_checked_at"] == second["bundle_checked_at"]
        SERVED["bundle"] = BUNDLE
        SERVED["revision"] = "rev-one"


OTHER = "6a50d563-9a4c-44bd-b85a-c733fb32c72f"


def _other_bundle() -> dict[str, Any]:
    """A second project's bundle: another station, another tracker."""
    other = json.loads(json.dumps(BUNDLE))
    other["project"] = {"id": OTHER, "name": "Smart Parks - LP0", "slug": "sp-lp0"}
    other["devices"][0].update(id="t2", name="SP052104T")
    other["devices"][0]["lp0"]["dev_addr"] = "260B5243"
    other["devices"][1].update(id="s2", name="SP052104", serial_number="0016C001F0520104")
    other["stations"] = [
        {
            "device_id": "s2",
            "device_name": "SP052104",
            "station_eui": "0016C001F0520104",
            "entity_id": "e9",
            "entity_name": "Station 2",
            "geometry": {"type": "Point", "coordinates": [5.1, 52.1]},
        }
    ]
    return other


def test_the_laptop_holds_a_bundle_per_project_and_one_is_loaded(tmp_path):
    """D31: a bundle per project under `bundles/`, the loaded one named in `current`, a
    switch without a connection, and the one file of before moved under its project."""
    store = BundleStore(tmp_path, "file")
    assert store.current_project_id() is None and store.summaries() == []
    store.save(BUNDLE)
    store.save(_other_bundle())
    assert store.current_project_id() == OTHER
    assert [s.project_name for s in store.summaries()] == ["LP0", "Smart Parks - LP0"]
    assert store.switch(PROJECT) is not None and store.current_project_id() == PROJECT
    assert store.load()[0]["project"]["name"] == "LP0"
    assert store.load(OTHER)[0]["project"]["name"] == "Smart Parks - LP0"
    assert store.switch("not-on-the-laptop") is None and store.current_project_id() == PROJECT
    store.clear()
    assert store.current_project_id() is None and store.project_ids() == [OTHER]
    assert store.load() is None and store.load(OTHER) is not None

    # a laptop from before D31: its one bundle.enc is the project's file and the loaded one
    legacy = tmp_path / "legacy"
    legacy.mkdir()
    first = BundleStore(legacy, "file")
    first.save(BUNDLE)
    (legacy / "bundles" / f"{PROJECT}.enc").rename(legacy / "bundle.enc")
    (legacy / "bundles" / "current").unlink()
    again = BundleStore(legacy, "file")
    assert again.current_project_id() == PROJECT and not (legacy / "bundle.enc").exists()


async def test_the_projects_on_the_laptop_are_listed_and_switched(app, tmp_path):
    """D31 and D33 at the API: the switcher's list and the switch; the cards and the map
    follow the loaded project (D32)."""
    data = tmp_path / "data"
    store = BundleStore(data, "file")
    store.save(BUNDLE)
    store.save(_other_bundle())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        projects = (await client.get("/api/bundle/projects")).json()
        assert [(p["project_name"], p["current"]) for p in projects] == [
            ("LP0", False),
            ("Smart Parks - LP0", True),
        ]
        assert all(p["map_present"] is False and p["cards"] == 0 for p in projects)
        switched = await client.post("/api/bundle/switch", json={"project_id": PROJECT})
        assert switched.status_code == 200, switched.text
        assert switched.json()["bundle"]["project_name"] == "LP0"
        assert (await client.get("/api/bundle")).json()["project_id"] == PROJECT
        missing = await client.post("/api/bundle/switch", json={"project_id": "nobody-0001"})
        assert missing.status_code == 404
        # a bundle that names another project than the one asked is refused
        app.state.http_transport = httpx.MockTransport(protect_server)
        await client.put(
            "/api/setup/server", json={"server_url": "https://dev-protect.example.org"}
        )
        await client.post("/api/session", json={"email": "ranger@example.org", "password": "right"})
        app.state.http_transport = httpx.MockTransport(server)
        wrong = await client.post(
            "/api/bundle/fetch", json={"project_id": PROJECT.replace("2", "3", 1)}
        )
        assert wrong.status_code == 502


async def test_every_project_with_a_station_is_kept_on_the_laptop_in_the_background(app, tmp_path):
    """D34 (Tim, 2026-10-24: switching projects should be a view change, nothing to fetch): the
    connection probe starts a sync that loads every project with an offload station the account
    may read, with its map, beside the loaded one, which stays the loaded one."""
    other = _other_bundle()
    planet = (
        (tmp_path / "planet.pmtiles").read_bytes()
        if (tmp_path / "planet.pmtiles").exists()
        else None
    )

    def server_with_projects(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/projects":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {"id": PROJECT, "name": "LP0"},
                        {"id": OTHER, "name": "Smart Parks - LP0"},
                        {"id": "no-station-0001", "name": "Cows"},
                    ]
                },
            )
        if request.url.path.endswith("/offload"):
            with_station = request.url.path.split("/")[-2] in (PROJECT, OTHER)
            return httpx.Response(
                200, json={"stations": [{"device_id": "x"}] if with_station else []}
            )
        if request.url.path == f"/api/v1/projects/{OTHER}/field-bundle/revision":
            return httpx.Response(200, json={"revision": "other-one"})
        if request.url.path == f"/api/v1/projects/{OTHER}/field-bundle":
            return httpx.Response(200, json={**other, "revision": "other-one"})
        if request.url.path == f"/api/v1/projects/{OTHER}/field-bundle/map":
            return (
                httpx.Response(404, json={"detail": "No offline map yet"})
                if request.method == "GET"
                else httpx.Response(202, json={"status": "queued"})
            )
        return server(request)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        app.state.http_transport = httpx.MockTransport(protect_server)
        await client.put(
            "/api/setup/server", json={"server_url": "https://dev-protect.example.org"}
        )
        await client.post("/api/session", json={"email": "ranger@example.org", "password": "right"})
        app.state.http_transport = httpx.MockTransport(server_with_projects)
        SERVED["revision"] = "rev-one"
        loaded = await client.post(
            "/api/bundle/fetch", json={"project_id": PROJECT, "project_name": "LP0"}
        )
        assert loaded.status_code == 200, loaded.text
        assert [p["project_name"] for p in (await client.get("/api/bundle/projects")).json()] == [
            "LP0"
        ]

        # the probe starts the sync; the other project comes beside the loaded one, Cows not
        await client.get("/api/setup/connection")
        await app.state.bundle_sync_task
        projects = (await client.get("/api/bundle/projects")).json()
        assert [(p["project_name"], p["current"]) for p in projects] == [
            ("LP0", True),
            ("Smart Parks - LP0", False),
        ]
        probe = (await client.get("/api/setup/connection")).json()
        assert probe["projects_loaded"] == 1 and probe["projects_on_laptop"] == 2
        assert probe["projects_synced_at"] and probe["bundle_updated_at"] is None
        assert (await client.get("/api/bundle")).json()["project_id"] == PROJECT

        # the next sync loads nothing anew; a switch is a view change
        app.state.bundle_follow = {**app.state.bundle_follow, "due": None}
        await client.get("/api/setup/connection")
        await app.state.bundle_sync_task
        assert (await client.get("/api/setup/connection")).json()["projects_loaded"] == 1
        switched = await client.post("/api/bundle/switch", json={"project_id": OTHER})
        assert switched.json()["bundle"]["project_name"] == "Smart Parks - LP0"
        assert planet is None  # nothing of the map is asserted here; test_map covers it
