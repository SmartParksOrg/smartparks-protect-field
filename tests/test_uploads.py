"""The upload (phase 2 F4): one request per file to the station's offload-files endpoint, the
server's answer kept per file (accepted, had it already, refused), a sign-in that expired stops
the run and leaves the rest pending, a card without a station of the project waits with a word."""

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from protect_go.bundle import BundleStore
from protect_go.config import get_settings
from protect_go.main import create_app
from tests.test_bundle import BUNDLE
from tests.test_cards import STATION, card_zip
from tests.test_setup import LONG_TOKEN, TOKEN, protect_server


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("PROTECT_GO_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("PROTECT_GO_KEY_STORE", "file")
    get_settings.cache_clear()
    application = create_app()
    application.state.http_transport = httpx.MockTransport(protect_server)
    yield application
    get_settings.cache_clear()


async def _ready(client: AsyncClient, app, tmp_path) -> str:
    await client.put("/api/setup/server", json={"server_url": "https://dev-protect.example.org"})
    await client.post("/api/session", json={"email": "ranger@example.org", "password": "right"})
    BundleStore(tmp_path / "data", "file").save(BUNDLE)
    read = await client.post(
        "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
    )
    assert read.status_code == 201, read.text
    return read.json()["id"]


async def test_each_file_goes_up_once_and_the_answer_is_kept(app, tmp_path):
    seen: list[str] = []
    state = {"expired": False}

    def server(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/devices/d2/offload-files":
            assert request.headers["Authorization"] in (f"Bearer {TOKEN}", f"Bearer {LONG_TOKEN}")
            if state["expired"]:
                return httpx.Response(401, json={"detail": "Unauthorized"})
            body = request.content
            name = (
                STATION + "_1791795031.jsonl"
                if b"1791795031" in body or b"ZQAd" in body
                else "second"
            )
            seen.append(name)
            if len(seen) == 1:
                return httpx.Response(
                    201, json={"files": [{"id": "lf-1", "original_filename": name}], "skipped": []}
                )
            # the server holds the bytes already: left out and flagged, no files, no error
            # (Protect's decision D353; a server before it answered 422 "uploaded before")
            return httpx.Response(
                201,
                json={
                    "files": [],
                    "skipped": [
                        {
                            "name": name,
                            "reason": "uploaded before",
                            "duplicate": True,
                            "uploaded_at": "2026-10-20T10:00:00Z",
                            "log_file_id": "lf-1",
                        }
                    ],
                },
            )
        return protect_server(request)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        card_id = await _ready(client, app, tmp_path)
        before = (await client.get("/api/uploads")).json()
        assert before["pending"] == 2 and before["cards"][0]["card_id"] == card_id
        app.state.http_transport = httpx.MockTransport(server)

        run = await client.post("/api/uploads/run", json={})
        assert run.status_code == 200, run.text
        result = run.json()
        assert (result["attempted"], result["uploaded"], result["duplicate"], result["failed"]) == (
            2,
            1,
            1,
            0,
        )
        assert result["stopped"] is None
        card = result["state"]["cards"][0]
        assert card["uploaded"] == 1 and card["duplicate"] == 1 and card["pending"] == 0
        assert result["state"]["pending"] == 0

        # nothing left: a second run sends nothing
        again = (await client.post("/api/uploads/run", json={})).json()
        assert again["attempted"] == 0 and len(seen) == 2

        # a new card while the sign-in has expired: the run stops and the file stays to retry
        state["expired"] = True
        second = await client.post(
            "/api/cards",
            files=[
                (
                    "files",
                    (
                        f"LOG_3/{STATION}_1791799000.jsonl",
                        b"\n"
                        + card_zip()[:0]
                        + b'{"gatewayEui":"'
                        + STATION.encode()
                        + b'","rxpk":{"data":"QAMBAiYAZQAdmQO+Xdlf"}}\n',
                        "application/octet-stream",
                    ),
                )
            ],
        )
        assert second.status_code == 201, second.text
        stopped = (
            await client.post("/api/uploads/run", json={"card_id": second.json()["id"]})
        ).json()
        assert stopped["failed"] == 1 and "sign-in has expired" in stopped["stopped"]
        assert stopped["state"]["failed"] == 1
        assert "expired" in stopped["state"]["cards"][0]["last_problem"]


async def test_a_card_of_an_unknown_station_waits_with_a_word(app, tmp_path):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.put(
            "/api/setup/server", json={"server_url": "https://dev-protect.example.org"}
        )
        await client.post("/api/session", json={"email": "ranger@example.org", "password": "right"})
        BundleStore(tmp_path / "data", "file").save(BUNDLE)
        other = card_zip(station="0016C001F0500199")
        read = await client.post(
            "/api/cards", files=[("files", ("other.zip", other, "application/zip"))]
        )
        assert read.status_code == 201 and read.json()["station_device_id"] is None
        run = (await client.post("/api/uploads/run", json={})).json()
        assert run["attempted"] == 0 and run["skipped_no_station"] == 2
        assert run["state"]["pending"] == 2
        detail = (await client.get("/api/uploads")).json()["cards"][0]
        assert detail["pending"] == 2
