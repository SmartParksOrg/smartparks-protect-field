"""The upload queue (phase 2 F4): what waits per card, and one button that sends it."""

from typing import Any

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from protect_go.cards import CardStore
from protect_go.store import Store
from protect_go.uploads import run_uploads

router = APIRouter(prefix="/api")


class UploadCardRead(BaseModel):
    card_id: str
    name: str
    station_name: str | None
    station_eui: str | None
    station_device_id: str | None
    imported_at: str
    files: int
    pending: int
    uploaded: int
    duplicate: int
    refused: int
    failed: int
    last_uploaded_at: str | None
    last_problem: str | None


class UploadsRead(BaseModel):
    cards: list[UploadCardRead]
    pending: int
    failed: int


class UploadRequest(BaseModel):
    card_id: str | None = Field(default=None, description="One card, or every card when empty")


class UploadRunRead(BaseModel):
    attempted: int
    uploaded: int
    duplicate: int
    refused: int
    failed: int
    skipped_no_station: int
    stopped: str | None
    state: UploadsRead


def _cards(request: Request) -> CardStore:
    store: CardStore = request.app.state.card_store
    return store


def _state(store: CardStore) -> UploadsRead:
    rows: list[dict[str, Any]] = store.upload_summary()
    return UploadsRead(
        cards=[UploadCardRead(**row) for row in rows],
        pending=sum(int(r["pending"] or 0) for r in rows),
        failed=sum(int(r["failed"] or 0) for r in rows),
    )


@router.get("/uploads", response_model=UploadsRead)
def read_uploads(request: Request) -> UploadsRead:
    return _state(_cards(request))


@router.post("/uploads/run", response_model=UploadRunRead)
async def run(body: UploadRequest, request: Request) -> UploadRunRead:
    """Send the pending and failed files of one card or all cards to the server, one file a
    request, and say what the server made of each."""
    store: Store = request.app.state.store
    settings = store.load()
    transport: httpx.AsyncBaseTransport | None = getattr(request.app.state, "http_transport", None)
    outcome = await run_uploads(
        _cards(request), settings, card_id=body.card_id, transport=transport
    )
    return UploadRunRead(
        attempted=outcome.attempted,
        uploaded=outcome.uploaded,
        duplicate=outcome.duplicate,
        refused=outcome.refused,
        failed=outcome.failed,
        skipped_no_station=outcome.skipped_no_station,
        stopped=outcome.stopped,
        state=_state(_cards(request)),
    )
