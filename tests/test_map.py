"""The offline map on the laptop (decision D4): fetched from the server once ready, asked for
when the server has none yet, and served to MapLibre with range requests."""

import json
from pathlib import Path

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer

from protect_go.config import get_settings
from protect_go.main import create_app
from tests.test_setup import TOKEN, protect_server

PROJECT = "11111111-1111-1111-1111-111111111111"


def small_map(path: Path) -> bytes:
    tiles = sorted(
        (zxy_to_tileid(z, x, y), f"{z}/{x}/{y}".encode())
        for z in range(3)
        for x in range(2**z)
        for y in range(2**z)
    )
    with path.open("wb") as handle:
        writer = Writer(handle)
        for tileid, data in tiles:
            writer.write_tile(tileid, data)
        writer.finalize(
            {
                "tile_type": TileType.MVT,
                "tile_compression": Compression.NONE,
                "min_zoom": 0,
                "max_zoom": 2,
                "min_lon_e7": -110_000_000,
                "min_lat_e7": 76_000_000,
                "max_lon_e7": -108_000_000,
                "max_lat_e7": 79_000_000,
                "clustered": True,
                "center_zoom": 0,
                "center_lon_e7": 0,
                "center_lat_e7": 0,
            },
            {"name": "gola"},
        )
    return path.read_bytes()


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("PROTECT_GO_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    application = create_app()
    yield application
    get_settings.cache_clear()


async def _signed_in(client: AsyncClient, app) -> None:
    app.state.http_transport = httpx.MockTransport(protect_server)
    await client.put("/api/setup/server", json={"server_url": "https://dev-protect.example.org"})
    signed = await client.post(
        "/api/session", json={"email": "ranger@example.org", "password": "right"}
    )
    assert signed.status_code == 200, signed.text


async def test_the_map_is_asked_for_then_fetched_then_served_in_ranges(app, tmp_path):
    planet = small_map(tmp_path / "server-map.pmtiles")
    state = {"ready": False, "asked": 0}

    def server(request: httpx.Request) -> httpx.Response:
        if request.url.path == f"/api/v1/projects/{PROJECT}/field-bundle/map":
            assert request.headers["Authorization"] == f"Bearer {TOKEN}"
            if request.method == "POST":
                if state.get("forbid"):
                    return httpx.Response(
                        403, json={"detail": "Permission exports:create required"}
                    )
                state["asked"] += 1
                return httpx.Response(202, json={"status": "queued"})
            if not state["ready"]:
                return httpx.Response(404, json={"detail": "No offline map yet"})
            return httpx.Response(
                200, content=planet, headers={"X-Map-Build": "20261015", "X-Content-SHA256": "abc"}
            )
        return protect_server(request)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/map")).json()["present"] is False
        refused = await client.post("/api/map/fetch", json={"project_id": PROJECT})
        assert refused.status_code == 409 and "Sign in" in refused.text
        await _signed_in(client, app)
        app.state.http_transport = httpx.MockTransport(server)

        # the server has no map yet: Protect Go asks for one and says so
        first = await client.post(
            "/api/map/fetch", json={"project_id": PROJECT, "project_name": "LP0"}
        )
        assert first.status_code == 200, first.text
        assert first.json()["present"] is False and "making the map" in first.json()["server_state"]
        assert state["asked"] == 1

        # a viewer's account may not ask the server to cut a map; Protect Go says whom to ask
        state["forbid"] = True
        told = await client.post("/api/map/fetch", json={"project_id": PROJECT})
        assert told.status_code == 200 and "ask an analyst" in told.json()["server_state"]
        state["forbid"] = False

        state["ready"] = True
        got = await client.post(
            "/api/map/fetch", json={"project_id": PROJECT, "project_name": "LP0"}
        )
        assert got.status_code == 200, got.text
        body = got.json()
        assert body["present"] and body["build"] == "20261015" and body["project_name"] == "LP0"
        assert body["size_bytes"] == len(planet) and body["max_zoom"] == 2
        assert round(body["west"], 1) == -11.0 and round(body["north"], 1) == 7.9
        assert json.loads((tmp_path / "data" / "map.json").read_text())["project_id"] == PROJECT

        whole = await client.get("/api/map/tiles.pmtiles")
        assert whole.status_code == 200 and whole.content == planet
        assert whole.headers["accept-ranges"] == "bytes"
        head = await client.get("/api/map/tiles.pmtiles", headers={"Range": "bytes=0-126"})
        assert head.status_code == 206 and head.content == planet[:127]
        assert head.headers["content-range"] == f"bytes 0-126/{len(planet)}"
        tail = await client.get(
            "/api/map/tiles.pmtiles", headers={"Range": f"bytes={len(planet) - 10}-"}
        )
        assert tail.status_code == 206 and tail.content == planet[-10:]
        beyond = await client.get(
            "/api/map/tiles.pmtiles", headers={"Range": f"bytes={len(planet) + 5}-"}
        )
        assert beyond.status_code == 416
