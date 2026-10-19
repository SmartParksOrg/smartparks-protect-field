"""Loading a project for the field (decisions D2 and D11): one call fetches the bundle from the
Protect server and keeps it encrypted, then fetches the project's map the same way, so a person
presses one button before leaving. The bundle is read back by the card pages (phase 2 F2)."""

import contextlib
from dataclasses import asdict
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from protect_go.bundle import BundleStore, BundleSummary
from protect_go.cards import CardStore
from protect_go.routers.map import MapFetch, MapRead, fetch_map
from protect_go.store import Store

router = APIRouter(prefix="/api")


class BundleRead(BaseModel):
    present: bool
    revision: str = Field(default="", description="The server's fingerprint of the content")
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
    frames_read_again: int = Field(
        default=0,
        description="Frames of addresses unknown before that the fresh bundle knows (D338)",
    )


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


class MetricDefinition(BaseModel):
    key: str
    label: str
    unit: str | None = None
    value_type: str
    category: str
    description: str | None = None


@router.get("/bundle/metrics", response_model=list[MetricDefinition])
async def metric_definitions(request: Request) -> list[dict[str, Any]]:
    """Protect's metric registry as the bundle carried it (Protect's decision D334), so the
    Data explorer names and units the values as Protect does; empty without a bundle or with
    one from a server older than the registry's arrival."""
    loaded = _bundle_store(request).load()
    if loaded is None:
        return []
    bundle, _fetched = loaded
    rows: list[dict[str, Any]] = list(bundle.get("metrics") or [])
    return rows


class StationRead(BaseModel):
    device_id: str
    name: str
    station_eui: str
    lat: float | None = None
    lon: float | None = None


class DeviceRead(BaseModel):
    id: str
    name: str
    serial_number: str | None = None
    dev_eui: str | None = None
    device_type_label: str | None = None
    driver_key: str | None = None
    status: str | None = None
    firmware_version: str | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    is_station: bool = False
    has_address: bool = False
    has_keys: bool = False


@router.get("/bundle/devices", response_model=list[DeviceRead])
async def devices(request: Request) -> list[dict[str, Any]]:
    """The project's devices as the bundle knows them, never a key: what the Trackers and the
    Offload stations pages list beside what the files brought."""
    loaded = _bundle_store(request).load()
    if loaded is None:
        return []
    bundle, _fetched = loaded
    out: list[dict[str, Any]] = []
    for d in bundle.get("devices", []):
        lp0 = d.get("lp0") or {}
        out.append(
            {
                "id": str(d["id"]),
                "name": str(d["name"]),
                "serial_number": d.get("serial_number"),
                "dev_eui": d.get("dev_eui"),
                "device_type_label": d.get("device_type_label"),
                "driver_key": d.get("driver_key"),
                "status": d.get("status"),
                "firmware_version": d.get("firmware_version"),
                "entity_id": str(d["entity_id"]) if d.get("entity_id") else None,
                "entity_name": d.get("entity_name"),
                "is_station": bool(d.get("is_station")),
                "has_address": bool(lp0.get("dev_addr")),
                "has_keys": bool(lp0.get("app_s_key") and lp0.get("nwk_s_key")),
            }
        )
    return out


@router.get("/bundle/stations", response_model=list[StationRead])
async def stations(request: Request) -> list[dict[str, Any]]:
    """The offload stations of the bundle with where they stand, for the explorer's map."""
    loaded = _bundle_store(request).load()
    if loaded is None:
        return []
    bundle, _fetched = loaded
    out: list[dict[str, Any]] = []
    for s in bundle.get("stations", []):
        geometry = s.get("geometry") or {}
        coordinates = geometry.get("coordinates") if geometry.get("type") == "Point" else None
        out.append(
            {
                "device_id": str(s["device_id"]),
                "name": str(s.get("entity_name") or s.get("device_name") or s["station_eui"]),
                "station_eui": str(s["station_eui"]),
                "lon": coordinates[0] if coordinates else None,
                "lat": coordinates[1] if coordinates else None,
            }
        )
    return out


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
    # a tracker added in Protect since the cards were read: its frames decode now (D338)
    cards: CardStore | None = getattr(request.app.state, "card_store", None)
    read_again = cards.read_unknown_again(bundle) if cards is not None else 0
    name = body.project_name or summary.project_name
    try:
        map_state = await fetch_map(
            MapFetch(project_id=body.project_id, project_name=name), request
        )
    except HTTPException as exc:
        map_state = MapRead(present=False, server_state=f"The map did not come: {exc.detail}")
    return LoadResult(bundle=_read(summary), map=map_state, frames_read_again=read_again)
