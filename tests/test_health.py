"""The local server answers, names its version and the Protect commit its decoding comes from."""

from httpx import ASGITransport, AsyncClient

from protect_go.main import create_app


async def test_health_names_both_versions(tmp_path, monkeypatch):
    monkeypatch.setenv("PROTECT_GO_DATA_DIR", str(tmp_path / "data"))
    from protect_go.config import get_settings

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


async def test_the_interface_is_never_cached(tmp_path, monkeypatch):
    """Decision D23: after an update the window showed the old pages from its cache."""
    from protect_go import main as main_module
    from protect_go.config import get_settings

    monkeypatch.setenv("PROTECT_GO_DATA_DIR", str(tmp_path / "data"))
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>Protect Go</title>")
    (dist / "map").mkdir()
    (dist / "map" / "sprite.json").write_text("{}")
    monkeypatch.setattr(main_module, "DIST", dist)
    get_settings.cache_clear()
    application = main_module.create_app()
    async with AsyncClient(
        transport=ASGITransport(app=application), base_url="http://test"
    ) as client:
        for path in ("/", "/files", "/map/sprite.json"):
            response = await client.get(path)
            assert response.status_code == 200, path
            assert response.headers["cache-control"] == "no-cache", path
    get_settings.cache_clear()
