"""The cards read on this laptop (phase 2 F2): dropped in as a zip or as the `LOG_*` folders'
files, read with the bundle's keys, listed with their counts, each with its files, its trackers
and what could not be read, and their positions for the map."""

from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from protect_go import volumes
from protect_go.bundle import BundleStore
from protect_go.cards import POSITIONS_LIMIT, CardStore

router = APIRouter(prefix="/api")


class CardRead(BaseModel):
    id: str
    name: str
    imported_at: str
    station_eui: str | None
    station_device_id: str | None
    station_name: str | None
    files: int
    lines: int
    frames: int
    decoded: int
    repeated: int
    refused: int
    unknown: int
    line_errors: int
    positions: int
    measurements: int
    states: int
    events: int
    skipped: list[str] = []


class CardFileRead(BaseModel):
    id: str
    name: str
    folder: str
    size: int
    station_eui: str | None
    lines: int
    frames: int
    errors: int


class CardTrackerRead(BaseModel):
    device_id: str
    device_name: str
    entity_id: str | None = None
    frames: int
    decoded: int
    refused: int
    repeated: int
    positions: int
    measurements: int
    first_time: str | None = None
    last_time: str | None = None


class CardFailureRead(BaseModel):
    line: int
    file: str
    dev_addr: str | None
    device_name: str | None
    status: str
    code: str | None
    reason: str | None


class CardDetailRead(CardRead):
    files_list: list[CardFileRead]
    trackers: list[CardTrackerRead]
    failures: list[CardFailureRead]


class PositionRead(BaseModel):
    device_id: str
    entity_id: str | None
    time: str
    lat: float
    lon: float


def _cards(request: Request) -> CardStore:
    store: CardStore = request.app.state.card_store
    return store


@router.get("/cards", response_model=list[CardRead])
def list_cards(request: Request) -> list[dict[str, Any]]:
    return _cards(request).cards()


@router.post("/cards", response_model=CardRead, status_code=201)
async def read_card(
    request: Request,
    files: Annotated[list[UploadFile], File()],
    name: Annotated[str | None, Form()] = None,
) -> dict[str, Any]:
    """Read a card: the files of its `LOG_*` folders, or a zip of them, with the loaded bundle's
    keys. The bundle must be on the laptop; a drop with no station file in it is refused."""
    bundle_store: BundleStore = request.app.state.bundle_store
    loaded = bundle_store.load()
    if loaded is None:
        raise HTTPException(409, "Load a project first; the card is read with its keys")
    bundle, _fetched = loaded
    dropped: list[tuple[str, bytes]] = []
    for upload in files:
        dropped.append((upload.filename or "file", await upload.read()))
    label = name or (dropped[0][0].split("/")[0] if len(dropped) > 1 else dropped[0][0])
    try:
        return _cards(request).import_card(label, dropped, bundle)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


class VolumeStation(BaseModel):
    eui: str
    name: str | None


class VolumeRead(BaseModel):
    path: str
    label: str
    files: int
    size: int
    stations: list[VolumeStation]


class PathRead(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    name: str | None = Field(default=None, max_length=200)


def _station_names(request: Request) -> dict[str, str]:
    bundle_store: BundleStore = request.app.state.bundle_store
    loaded = bundle_store.load()
    if loaded is None:
        return {}
    bundle, _fetched = loaded
    return {
        str(s["station_eui"]).upper(): str(s.get("name") or s.get("device_name") or "")
        for s in bundle.get("stations", [])
        if s.get("station_eui")
    }


class StationStatsRead(BaseModel):
    station_eui: str
    station_device_id: str | None
    station_name: str | None
    cards: int
    files: int
    frames: int
    pending: int
    failed: int
    uploaded: int
    duplicate: int
    last_read: str | None


@router.get("/stations", response_model=list[StationStatsRead])
def list_stations(request: Request) -> list[dict[str, Any]]:
    """What the files brought per offload station, for the Offload stations page."""
    return _cards(request).stations()


@router.get("/cards/volumes", response_model=list[VolumeRead])
def list_volumes(request: Request) -> list[dict[str, Any]]:
    """The SD cards in this computer (decision D16): every removable volume with the station
    files found on it, so the card is read with one click and nothing is picked by hand."""
    names = _station_names(request)
    return [
        {
            "path": v.path,
            "label": v.label,
            "files": v.files,
            "size": v.size,
            "stations": [{"eui": eui, "name": names.get(eui)} for eui in v.stations],
        }
        for v in volumes.volumes()
    ]


@router.post("/cards/path", response_model=CardRead, status_code=201)
def read_card_from_path(body: PathRead, request: Request) -> dict[str, Any]:
    """Read a card from a path on this computer: the SD card itself or a folder it was copied
    to (decision D16). The station files under it are found a few levels deep."""
    bundle_store: BundleStore = request.app.state.bundle_store
    loaded = bundle_store.load()
    if loaded is None:
        raise HTTPException(409, "Load a project first; the card is read with its keys")
    bundle, _fetched = loaded
    root = Path(body.path)
    if not root.is_dir():
        raise HTTPException(404, f"No folder at {body.path}")
    files = volumes.read_files(root)
    if not files:
        raise HTTPException(
            422,
            "No station file under this folder: a card's LOG folders hold "
            "STATIONEUI_timestamp.jsonl files",
        )
    label = body.name or root.name or str(root)
    try:
        return _cards(request).import_card(label, files, bundle)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


@router.get("/cards/{card_id}", response_model=CardDetailRead)
def card_detail(card_id: str, request: Request) -> dict[str, Any]:
    detail = _cards(request).card_detail(card_id)
    if detail is None:
        raise HTTPException(404, "No such card")
    return detail


@router.delete("/cards/{card_id}", status_code=204)
def delete_card(card_id: str, request: Request) -> None:
    if not _cards(request).delete_card(card_id):
        raise HTTPException(404, "No such card")


@router.get("/cards/{card_id}/positions", response_model=list[PositionRead])
def card_positions(
    card_id: str, request: Request, device_id: str | None = None, limit: int = POSITIONS_LIMIT
) -> list[dict[str, Any]]:
    """The positions a card brought, newest first, at most `limit` (5000)."""
    if _cards(request).card(card_id) is None:
        raise HTTPException(404, "No such card")
    return _cards(request).positions(card_id, device_id, min(limit, POSITIONS_LIMIT))
