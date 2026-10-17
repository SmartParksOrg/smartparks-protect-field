"""The offline map (Field's decision D4; Protect's phase 43 P3): the project's PMTiles file,
downloaded from the Protect server while online and served to MapLibre here with range requests,
so the map draws without a connection. One map at a time, the project's, in `map.pmtiles` in the
data folder with `map.json` beside it saying which project and build it is."""

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from protect_field.store import Store

router = APIRouter(prefix="/api")

RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")
CHUNK = 1 << 20


class MapRead(BaseModel):
    present: bool
    project_id: str | None = None
    project_name: str | None = None
    build: str | None = None
    size_bytes: int | None = None
    sha256: str | None = None
    downloaded_at: str | None = None
    west: float | None = None
    south: float | None = None
    east: float | None = None
    north: float | None = None
    max_zoom: int | None = None
    #: What the server said when the map was asked for and was not ready: its state in words
    server_state: str | None = None


class MapFetch(BaseModel):
    project_id: str = Field(min_length=1, max_length=64)
    project_name: str | None = Field(default=None, max_length=200)


def _paths(request: Request) -> tuple[Path, Path]:
    store: Store = request.app.state.store
    folder = store.path.parent
    return folder / "map.pmtiles", folder / "map.json"


def _read(request: Request) -> MapRead:
    file, meta = _paths(request)
    if not file.is_file() or not meta.is_file():
        return MapRead(present=False)
    info: dict[str, Any] = json.loads(meta.read_text(encoding="utf-8"))
    return MapRead(present=True, size_bytes=file.stat().st_size, **info)


@router.get("/map", response_model=MapRead)
async def read_map(request: Request) -> MapRead:
    return _read(request)


@router.post("/map/fetch", response_model=MapRead)
async def fetch_map(body: MapFetch, request: Request) -> MapRead:
    """Ask the server for the project's map and keep it: the server's `GET
    /projects/{id}/field-bundle/map` streams the file when it is ready, answers 202 with its
    state while it is being cut (then this asks for it with POST and says so), 404 when none was
    asked for yet (the same POST), and 409 when the last attempt failed."""
    store: Store = request.app.state.store
    settings = store.load()
    if settings.server_url is None or not settings.signed_in:
        raise HTTPException(409, "Sign in to the server first")
    transport: httpx.AsyncBaseTransport | None = getattr(request.app.state, "http_transport", None)
    headers = {"Authorization": f"Bearer {settings.token}"}
    path = f"/api/v1/projects/{body.project_id}/field-bundle/map"
    file, meta = _paths(request)
    try:
        async with httpx.AsyncClient(
            base_url=settings.server_url,
            timeout=httpx.Timeout(60.0, read=600.0),
            transport=transport,
        ) as http:
            async with http.stream("GET", path, headers=headers) as response:
                if response.status_code == 200:
                    tmp = file.with_suffix(".pmtiles.part")
                    with tmp.open("wb") as handle:
                        async for chunk in response.aiter_bytes(CHUNK):
                            handle.write(chunk)
                    tmp.replace(file)
                    meta.write_text(
                        json.dumps(
                            {
                                "project_id": body.project_id,
                                "project_name": body.project_name,
                                "build": response.headers.get("x-map-build") or None,
                                "sha256": response.headers.get("x-content-sha256") or None,
                                "downloaded_at": datetime.now(UTC).isoformat(),
                                **_bounds(file),
                            }
                        ),
                        encoding="utf-8",
                    )
                    return _read(request)
                detail = await _detail(response)
            if response.status_code in (404, 202):
                asked = await http.post(path, json={}, headers=headers)
                if asked.status_code == 202:
                    state = asked.json()
                    read = _read(request)
                    read.server_state = (
                        f"The server is making the map ({state.get('status')}); "
                        "try again in a few minutes"
                    )
                    return read
                raise HTTPException(
                    502, f"The server answered {asked.status_code}: {await _detail(asked)}"
                )
            if response.status_code in (401, 403):
                raise HTTPException(401, "The sign-in has expired or may not read this project")
            raise HTTPException(502, f"The server answered {response.status_code}: {detail}")
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"No answer from the server: {exc.__class__.__name__}") from None


async def _detail(response: httpx.Response) -> str:
    try:
        body = await response.aread()
        detail = json.loads(body).get("detail")
        return str(detail) if detail else body.decode(errors="replace")[:200]
    except (ValueError, AttributeError):
        return ""


def _bounds(file: Path) -> dict[str, Any]:
    """The box and zoom from the PMTiles header, for the page to open the map on."""
    from pmtiles.reader import MmapSource, Reader

    with file.open("rb") as handle:
        header = Reader(MmapSource(handle)).header()
    return {
        "west": header["min_lon_e7"] / 1e7,
        "south": header["min_lat_e7"] / 1e7,
        "east": header["max_lon_e7"] / 1e7,
        "north": header["max_lat_e7"] / 1e7,
        "max_zoom": header["max_zoom"],
    }


@router.get("/map/tiles.pmtiles", include_in_schema=False)
async def serve_map(request: Request) -> Response:
    """The PMTiles file for the pmtiles protocol of MapLibre, which reads it with range
    requests: the header first, then the directories, then the tiles in view."""
    file, _meta = _paths(request)
    if not file.is_file():
        raise HTTPException(404, "No map on this laptop yet")
    size = file.stat().st_size
    header = request.headers.get("range")
    headers = {"Accept-Ranges": "bytes", "Cache-Control": "no-cache"}
    if header is None:
        return StreamingResponse(
            _chunks(file, 0, size - 1),
            media_type="application/vnd.pmtiles",
            headers={**headers, "Content-Length": str(size)},
        )
    match = RANGE.match(header.strip())
    if match is None:
        raise HTTPException(416, "Range not understood")
    start_text, end_text = match.groups()
    if start_text == "" and end_text == "":
        raise HTTPException(416, "Range not understood")
    if start_text == "":
        start, end = max(0, size - int(end_text)), size - 1
    else:
        start = int(start_text)
        end = min(int(end_text), size - 1) if end_text else size - 1
    if start >= size or start > end:
        raise HTTPException(
            416, "Range beyond the file", headers={"Content-Range": f"bytes */{size}"}
        )
    return StreamingResponse(
        _chunks(file, start, end),
        status_code=206,
        media_type="application/vnd.pmtiles",
        headers={
            **headers,
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(end - start + 1),
        },
    )


async def _chunks(file: Path, start: int, end: int):  # type: ignore[no-untyped-def]  # noqa: ANN202
    with file.open("rb") as handle:
        handle.seek(start)
        left = end - start + 1
        while left > 0:
            data = handle.read(min(CHUNK, left))
            if not data:
                break
            left -= len(data)
            yield data
