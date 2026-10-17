"""The project map and the trackers (phase 2 F3): every position across the files read, within
a window and bounded, each tracker with its span and newest position, and a tracker's metrics
and measurements. What Protect's map and explorer show of a project, here from the files on the
laptop."""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel

from protect_go import exports
from protect_go.cards import POSITIONS_LIMIT, RECORDS_LIMIT, CardStore

router = APIRouter(prefix="/api")


class TrackerRead(BaseModel):
    device_id: str
    device_name: str
    entity_id: str | None
    positions: int
    measurements: int
    first_time: str | None
    last_time: str | None
    last_lat: float | None
    last_lon: float | None


class MetricRead(BaseModel):
    metric: str
    count: int
    first_time: str
    last_time: str
    latest: float | bool | str | None


class MeasurementRead(BaseModel):
    time: str
    value: float | bool | str | None


class PositionRead(BaseModel):
    device_id: str
    entity_id: str | None
    time: str
    lat: float
    lon: float


def _cards(request: Request) -> CardStore:
    store: CardStore = request.app.state.card_store
    return store


@router.get("/trackers", response_model=list[TrackerRead])
def list_trackers(request: Request) -> list[dict[str, Any]]:
    return _cards(request).trackers()


@router.get("/positions", response_model=list[PositionRead])
def positions(
    request: Request,
    device_id: str | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int = POSITIONS_LIMIT,
) -> list[dict[str, Any]]:
    """Every position on the laptop, or one tracker's, within the window, newest first; at
    most `limit` (20000), so a month of fixes every 15 minutes for a few trackers fits."""
    return _cards(request).positions(
        None, device_id, min(limit, POSITIONS_LIMIT), since=since, until=until
    )


class RecordRead(BaseModel):
    time: str
    device_id: str
    device_name: str
    entity_id: str | None
    lat: float | None
    lon: float | None
    values: dict[str, Any]


class OfferedMetricRead(BaseModel):
    key: str
    count: int


@router.get("/records", response_model=list[RecordRead])
def records(
    request: Request,
    device_id: Annotated[list[str] | None, Query()] = None,
    since: str | None = None,
    until: str | None = None,
    limit: int = RECORDS_LIMIT,
) -> list[dict[str, Any]]:
    """The Data explorer's rows (decision D25): one per tracker and moment with the fix and
    the measurements of that moment, newest first, at most `limit` (50,000)."""
    return _cards(request).records(
        device_id or None, since=since, until=until, limit=min(limit, RECORDS_LIMIT)
    )


@router.get("/records/metrics", response_model=list[OfferedMetricRead])
def offered_metrics(
    request: Request,
    device_id: Annotated[list[str] | None, Query()] = None,
    since: str | None = None,
    until: str | None = None,
) -> list[dict[str, Any]]:
    """The metrics the chosen trackers reported in the window, with counts."""
    return _cards(request).offered_metrics(device_id or None, since=since, until=until)


@router.get("/export")
def export(
    request: Request,
    format: str,
    device_id: Annotated[list[str] | None, Query()] = None,
    metric: Annotated[list[str] | None, Query()] = None,
    since: str | None = None,
    until: str | None = None,
) -> Response:
    """The decoded data of the selection as a file (decision D27): the records as CSV, wide or
    long, or the positions as GeoJSON or GPX; the browser saves it."""
    if format not in exports.FORMATS:
        raise HTTPException(422, f"Unknown format; one of {', '.join(exports.FORMATS)}")
    rows = _cards(request).records(device_id or None, since=since, until=until)
    body = exports.render(format, rows, metric or None)
    media_type, extension = exports.FORMATS[format]
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M")
    what = "records" if format.startswith("csv") else "positions"
    name = f"protect-go-{what}-{stamp}.{extension}"
    return Response(
        content=body,
        media_type=f"{media_type}; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/trackers/{device_id}/metrics", response_model=list[MetricRead])
def metrics(device_id: str, request: Request) -> list[dict[str, Any]]:
    rows = _cards(request).metrics(device_id)
    if not rows and not any(t["device_id"] == device_id for t in _cards(request).trackers()):
        raise HTTPException(404, "No such tracker on this laptop")
    return rows


@router.get("/trackers/{device_id}/measurements", response_model=list[MeasurementRead])
def measurements(
    device_id: str,
    request: Request,
    metric: str,
    since: str | None = None,
    until: str | None = None,
    limit: int = 5000,
) -> list[dict[str, Any]]:
    """One metric of one tracker within the window, newest first, at most `limit` (5000)."""
    return _cards(request).measurements(
        device_id, metric, since=since, until=until, limit=min(limit, 5000)
    )
