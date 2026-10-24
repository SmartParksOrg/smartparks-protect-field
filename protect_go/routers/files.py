"""The files read on this laptop, one row each, as a file explorer shows them (Tim, 2026-10-17:
the same explorer as Protect's device page): every file of every SD card read, with its counts
and its upload state, and one file's properties."""

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from protect_go.cards import CardStore
from protect_go.routers.common import current_project_id

router = APIRouter(prefix="/api")


class FileRead(BaseModel):
    id: str
    card_id: str
    card_name: str
    station_name: str | None
    station_eui: str | None
    imported_at: str
    name: str
    folder: str
    size: int
    lines: int
    frames: int
    errors: int
    upload_status: str
    upload_answer: str | None
    uploaded_at: str | None
    decoded: int
    repeated: int
    refused: int
    unknown: int
    positions: int
    measurements: int


class FileTrackerRead(BaseModel):
    device_id: str
    device_name: str
    frames: int
    decoded: int
    positions: int


class FileFailureRead(BaseModel):
    line: int
    dev_addr: str | None
    device_name: str | None
    status: str
    code: str | None
    reason: str | None


class FileDetailRead(FileRead):
    trackers: list[FileTrackerRead]
    failures: list[FileFailureRead]


def _cards(request: Request) -> CardStore:
    store: CardStore = request.app.state.card_store
    return store


@router.get("/files", response_model=list[FileRead])
def list_files(request: Request) -> list[dict[str, Any]]:
    """The files read for the loaded project (D32); none without one."""
    project = current_project_id(request)
    return _cards(request).files(project) if project else []


@router.get("/files/{file_id}", response_model=FileDetailRead)
def file_detail(file_id: str, request: Request) -> dict[str, Any]:
    detail = _cards(request).file_detail(file_id)
    if detail is None:
        raise HTTPException(404, "No such file on this laptop")
    return detail
