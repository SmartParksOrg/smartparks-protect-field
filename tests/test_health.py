"""The local server answers, names its version and the Protect commit its decoding comes from."""

from httpx import ASGITransport, AsyncClient

from protect_field.main import create_app


async def test_health_names_both_versions(tmp_path, monkeypatch):
    monkeypatch.setenv("FIELD_DATA_DIR", str(tmp_path / "data"))
    from protect_field.config import get_settings

    get_settings.cache_clear()
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"].startswith("v")
    assert body["protect_revision"] is not None and len(body["protect_revision"]) >= 7
    assert (tmp_path / "data").is_dir()
    get_settings.cache_clear()
