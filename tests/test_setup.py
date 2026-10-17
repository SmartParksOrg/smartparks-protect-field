"""The setup (decision D7): a Protect server kept once it answers, the sign-in through Protect's
own login with the token kept and the password not, a wrong password named, a server that is
not Protect refused."""

import json

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from protect_go.config import get_settings
from protect_go.main import create_app

TOKEN = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiJhYmMiLCJhdWQiOlsiZmFzdGFwaS11c2VyczphdXRoIl0sImV4cCI6NDEwMjQ0NDgwMH0."
    "c2ln"
)  # exp 2100-01-01; the signature is not checked by Protect Go, Protect made the token


def protect_server(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/api/version":
        return httpx.Response(200, json={"version": "v2.9.0", "commit": "8c0a6b6"})
    if request.url.path == "/api/v1/auth/login":
        form = dict(pair.split("=") for pair in request.content.decode().split("&"))
        if form.get("password") == "right":
            return httpx.Response(200, json={"access_token": TOKEN, "token_type": "bearer"})
        return httpx.Response(400, json={"detail": "LOGIN_BAD_CREDENTIALS"})
    if request.url.path == "/api/v1/users/me":
        assert request.headers["Authorization"] == f"Bearer {TOKEN}"
        return httpx.Response(200, json={"email": "ranger@example.org"})
    return httpx.Response(404)


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("PROTECT_GO_DATA_DIR", str(tmp_path / "data"))
    get_settings.cache_clear()
    application = create_app()
    application.state.http_transport = httpx.MockTransport(protect_server)
    yield application
    get_settings.cache_clear()


async def test_server_then_sign_in_keeps_the_token_and_never_the_password(app, tmp_path):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        before = (await client.get("/api/setup")).json()
        assert before["server_url"] is None and before["signed_in"] is False

        kept = await client.put(
            "/api/setup/server", json={"server_url": "dev-protect.example.org/"}
        )
        assert kept.status_code == 200, kept.text
        assert kept.json()["server_url"] == "https://dev-protect.example.org"
        assert kept.json()["protect_version"] == "v2.9.0"

        wrong = await client.post(
            "/api/session", json={"email": "ranger@example.org", "password": "wrong"}
        )
        assert wrong.status_code == 401 and "Wrong email or password" in wrong.text

        signed = await client.post(
            "/api/session", json={"email": "ranger@example.org", "password": "right"}
        )
        assert signed.status_code == 200, signed.text
        assert signed.json()["signed_in"] is True and signed.json()["email"] == "ranger@example.org"
        assert signed.json()["token_expires_at"].startswith("2100-01-01")

        on_disk = json.loads((tmp_path / "data" / "settings.json").read_text())
        assert on_disk["token"] == TOKEN and "password" not in json.dumps(on_disk)
        assert "right" not in json.dumps(on_disk)
        assert oct((tmp_path / "data" / "settings.json").stat().st_mode)[-3:] == "600"

        ended = await client.delete("/api/session")
        assert ended.json()["signed_in"] is False and ended.json()["email"] is None

        # a new server ends the session too
        await client.post("/api/session", json={"email": "ranger@example.org", "password": "right"})
        moved = await client.put(
            "/api/setup/server", json={"server_url": "https://other.example.org"}
        )
        assert moved.json()["signed_in"] is False


async def test_a_server_that_is_not_protect_is_refused(app):
    def not_protect(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>hello</html>")

    app.state.http_transport = httpx.MockTransport(not_protect)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        refused = await client.put("/api/setup/server", json={"server_url": "https://example.org"})
        assert refused.status_code == 502 and "not a Protect server" in refused.text
        assert (await client.get("/api/setup")).json()["server_url"] is None
        no_server = await client.post("/api/session", json={"email": "a@b.c", "password": "x"})
        assert no_server.status_code == 409


async def test_the_projects_come_from_the_server(app):
    def server(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/projects":
            assert request.headers["Authorization"] == f"Bearer {TOKEN}"
            return httpx.Response(
                200,
                json={"items": [{"id": "p1", "name": "LP0", "role": "project_admin"}], "total": 1},
            )
        return protect_server(request)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/projects")).status_code == 409
        await client.put(
            "/api/setup/server", json={"server_url": "https://dev-protect.example.org"}
        )
        await client.post("/api/session", json={"email": "ranger@example.org", "password": "right"})
        app.state.http_transport = httpx.MockTransport(server)
        projects = await client.get("/api/projects")
        assert projects.status_code == 200 and projects.json() == [{"id": "p1", "name": "LP0"}]
