"""Loading a project for the field (decisions D2 and D11): one call fetches the bundle from the
Protect server and keeps it encrypted, then fetches the project's map the same way, so a person
presses one button before leaving. The bundle is read back by the card pages (phase 2 F2)."""

import contextlib
from dataclasses import asdict

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from protect_go.bundle import BundleStore, BundleSummary
from protect_go.routers.map import MapFetch, MapRead, fetch_map
from protect_go.store import Store

router = APIRouter(prefix="/api")


class BundleRead(BaseModel):
    present: bool
    project_id: str | None = None
    project_name: str | None = None
    generated_at: str | None = None
    fetched_at: str | None = None
    protect_version: str | None = None
    server_url: str | None = None
    devices: int = 0
    stations: int = 0
    entities: int = 0
    trackers_with_keys: int = 0
    credentials_included: bool = False
    stale: bool = False
    key_kept_in: str | None = Field(default=None, description="keychain or file")


class LoadRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=64)
    project_name: str | None = Field(default=None, max_length=200)


class LoadResult(BaseModel):
    bundle: BundleRead
    map: MapRead


def _bundle_store(request: Request) -> BundleStore:
    store: BundleStore = request.app.state.bundle_store
    return store


def _read(summary: BundleSummary | None) -> BundleRead:
    if summary is None:
        return BundleRead(present=False)
    return BundleRead(present=True, **asdict(summary))


@router.get("/bundle", response_model=BundleRead)
async def read_bundle(request: Request) -> BundleRead:
    return _read(_bundle_store(request).summary())


@router.delete("/bundle", response_model=BundleRead)
async def clear_bundle(request: Request) -> BundleRead:
    _bundle_store(request).clear()
    return BundleRead(present=False)


@router.post("/bundle/fetch", response_model=LoadResult)
async def load_project(body: LoadRequest, request: Request) -> LoadResult:
    """Fetch the project's bundle and keep it, then its map; the server's own words when
    either does not come."""
    store: Store = request.app.state.store
    settings = store.load()
    if settings.server_url is None or not settings.signed_in:
        raise HTTPException(409, "Sign in to the server first")
    transport: httpx.AsyncBaseTransport | None = getattr(request.app.state, "http_transport", None)
    try:
        async with httpx.AsyncClient(
            base_url=settings.server_url, timeout=httpx.Timeout(60.0), transport=transport
        ) as http:
            response = await http.get(
                f"/api/v1/projects/{body.project_id}/field-bundle",
                headers={"Authorization": f"Bearer {settings.token}"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"No answer from the server: {exc.__class__.__name__}") from None
    if response.status_code in (401, 403):
        raise HTTPException(401, "The sign-in has expired or may not read this project")
    if response.status_code != 200:
        detail = ""
        with contextlib.suppress(ValueError):
            detail = str(response.json().get("detail") or "")
        raise HTTPException(502, f"The server answered {response.status_code}: {detail}")
    try:
        bundle = response.json()
    except ValueError:
        raise HTTPException(502, "The server's bundle is not JSON") from None
    if not isinstance(bundle, dict) or bundle.get("format_version") != 1:
        raise HTTPException(502, "The server's bundle has a shape this version does not read")
    summary = _bundle_store(request).save(bundle)
    name = body.project_name or summary.project_name
    try:
        map_state = await fetch_map(
            MapFetch(project_id=body.project_id, project_name=name), request
        )
    except HTTPException as exc:
        map_state = MapRead(present=False, server_state=f"The map did not come: {exc.detail}")
    return LoadResult(bundle=_read(summary), map=map_state)
