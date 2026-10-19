"""The setup of Protect Go (decision D7): the Protect server it synchronises with, and who is signed
in. `PUT /api/setup/server` probes the server before keeping it; `POST /api/session` signs in
with Protect's own login and keeps the token, never the password."""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from protect_go.protect import (
    ProtectError,
    client,
    exchange_handoff,
    normalise_server_url,
    probe_version,
    sign_in,
)
from protect_go.store import Settings, Store

router = APIRouter(prefix="/api")


class SetupRead(BaseModel):
    server_url: str | None
    protect_version: str | None
    email: str | None
    signed_in: bool
    token_expires_at: str | None


class ConnectionRead(BaseModel):
    online: bool
    checked_at: str
    protect_version: str | None
    account_ok: bool | None
    error: str | None
    #: The project on the laptop against the server (decision D28): when its fingerprint was
    #: last compared, whether the server has a newer one the app could not fetch, and when the
    #: app last loaded the project again by itself
    bundle_checked_at: str | None = None
    bundle_outdated: bool = False
    bundle_updated_at: str | None = None
    frames_read_again: int = 0


class ServerUpdate(BaseModel):
    server_url: str = Field(min_length=1, max_length=500)


class SignIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=500)


class Handoff(BaseModel):
    server_url: str = Field(min_length=1, max_length=500)
    code: str = Field(min_length=16, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")


def _store(request: Request) -> Store:
    store: Store = request.app.state.store
    return store


def _transport(request: Request) -> httpx.AsyncBaseTransport | None:
    transport: httpx.AsyncBaseTransport | None = getattr(request.app.state, "http_transport", None)
    return transport


def _read(settings: Settings) -> SetupRead:
    return SetupRead(
        server_url=settings.server_url,
        protect_version=settings.protect_version,
        email=settings.email,
        signed_in=settings.signed_in,
        token_expires_at=settings.token_expires_at.isoformat()
        if settings.token_expires_at
        else None,
    )


@router.get("/setup", response_model=SetupRead)
async def read_setup(request: Request) -> SetupRead:
    return _read(_store(request).load())


@router.get("/setup/connection", response_model=ConnectionRead)
async def connection(request: Request) -> ConnectionRead:
    """Whether the connected server answers right now and still accepts the sign-in (decision
    D18): one probe of its version and, signed in, one read of the account. The Server page
    shows the result with the time; the top bar's dot follows it."""
    store = _store(request)
    settings = store.load()
    if not settings.server_url:
        raise HTTPException(409, "No server is set")
    transport = _transport(request)
    checked_at = datetime.now(UTC).isoformat()
    try:
        version: dict[str, Any] = await probe_version(settings.server_url, transport)
    except ProtectError as exc:
        return ConnectionRead(
            online=False,
            checked_at=checked_at,
            protect_version=settings.protect_version,
            account_ok=None,
            error=exc.message,
        )
    protect_version = str(version.get("version"))
    if protect_version != settings.protect_version:
        settings.protect_version = protect_version
        store.save(settings)
    account_ok: bool | None = None
    if settings.signed_in:
        try:
            async with client(settings.server_url, transport) as http:
                me = await http.get(
                    "/api/v1/users/me", headers={"Authorization": f"Bearer {settings.token}"}
                )
            account_ok = me.status_code == 200
        except httpx.HTTPError:
            account_ok = False
    refresh = await _follow_the_project(request, settings, transport, account_ok)
    return ConnectionRead(
        online=True,
        checked_at=checked_at,
        protect_version=protect_version,
        account_ok=account_ok,
        error=None,
        **refresh,
    )


#: How often the project's fingerprint is compared with the server's while the app is online.
REVISION_CHECK_EVERY = timedelta(minutes=5)


async def _follow_the_project(
    request: Request, settings: Any, transport: Any, account_ok: bool | None
) -> dict[str, Any]:
    """The project on the laptop follows the server by itself (decision D29, Tim, 2026-10-19:
    a station or a tracker added in Protect, or a map made, should reach the app without a hand
    on Server). Every few minutes online, the bundle's fingerprint is compared with the
    server's; when it moved, the project is loaded again, and the frames of trackers unknown
    before are read again with it. The state of the last comparison is what the pages show."""
    state = request.app.state
    last = getattr(state, "bundle_follow", None) or {}
    summary = request.app.state.bundle_store.summary()
    if not account_ok or summary is None:
        return {k: v for k, v in last.items() if k != "due"}
    now = datetime.now(UTC)
    due = last.get("due")
    if due is not None and now < due:
        return {k: v for k, v in last.items() if k != "due"}
    result: dict[str, Any] = {
        "bundle_checked_at": now.isoformat(),
        "bundle_outdated": False,
        "bundle_updated_at": last.get("bundle_updated_at"),
        "frames_read_again": last.get("frames_read_again", 0),
    }
    try:
        async with client(settings.server_url, transport) as http:
            answer = await http.get(
                f"/api/v1/projects/{summary.project_id}/field-bundle/revision",
                headers={"Authorization": f"Bearer {settings.token}"},
            )
        if answer.status_code == 200:
            revision = str(answer.json().get("revision") or "")
            if revision and revision != summary.revision:
                from protect_go.routers.bundle import LoadRequest, load_project

                try:
                    loaded = await load_project(
                        LoadRequest(
                            project_id=summary.project_id, project_name=summary.project_name
                        ),
                        request,
                    )
                    result["bundle_updated_at"] = loaded.bundle.fetched_at
                    result["frames_read_again"] = loaded.frames_read_again
                except HTTPException:
                    result["bundle_outdated"] = True
    except httpx.HTTPError:
        pass  # offline in the middle of the probe: the next check tells
    state.bundle_follow = {**result, "due": now + REVISION_CHECK_EVERY}
    return result


@router.put("/setup/server", response_model=SetupRead)
async def set_server(body: ServerUpdate, request: Request) -> SetupRead:
    """Keep a Protect server after it answered `/api/version`; a new server ends the session."""
    try:
        url = normalise_server_url(body.server_url)
        version: dict[str, Any] = await probe_version(url, _transport(request))
    except ProtectError as exc:
        raise HTTPException(exc.status, exc.message) from None
    store = _store(request)
    settings = store.load()
    if settings.server_url != url:
        settings.email = settings.token = settings.token_expires_at = None
    settings.server_url = url
    settings.protect_version = str(version.get("version"))
    store.save(settings)
    return _read(settings)


@router.post("/session", response_model=SetupRead)
async def create_session(body: SignIn, request: Request) -> SetupRead:
    store = _store(request)
    settings = store.load()
    if settings.server_url is None:
        raise HTTPException(409, "Set the Protect server first")
    try:
        token, email, expires = await sign_in(
            settings.server_url, body.email.strip(), body.password, _transport(request)
        )
    except ProtectError as exc:
        raise HTTPException(exc.status, exc.message) from None
    settings.email, settings.token, settings.token_expires_at = email, token, expires
    store.save(settings)
    return _read(settings)


@router.post("/session/handoff", response_model=SetupRead)
async def handoff(body: Handoff, request: Request) -> SetupRead:
    """Signed in from Protect's Offload page (decision D15): the link carried the server and a
    one-time code; the server is kept once it answers, the code exchanged for a token that
    lasts weeks, so nobody types the address or the password on the laptop."""
    store = _store(request)
    transport = _transport(request)
    try:
        url = normalise_server_url(body.server_url)
        version: dict[str, Any] = await probe_version(url, transport)
        token, email, expires = await exchange_handoff(url, body.code, transport)
    except ProtectError as exc:
        raise HTTPException(exc.status, exc.message) from None
    settings = store.load()
    settings.server_url = url
    settings.protect_version = str(version.get("version"))
    settings.email, settings.token, settings.token_expires_at = email, token, expires
    store.save(settings)
    return _read(settings)


@router.delete("/session", response_model=SetupRead)
async def end_session(request: Request) -> SetupRead:
    store = _store(request)
    settings = store.load()
    settings.email = settings.token = settings.token_expires_at = None
    store.save(settings)
    return _read(settings)


class ProjectRead(BaseModel):
    id: str
    name: str
    stations: int = Field(
        default=0, description="Offload stations the project has; none means nothing to load"
    )


@router.get("/projects", response_model=list[ProjectRead])
async def list_projects(request: Request) -> list[ProjectRead]:
    """The projects the signed-in account may read, from the server, each with how many offload
    stations it has (the Offload page's overview), so the Load page offers only projects with a
    station (Tim, 2026-10-17): a project without one has no card to read."""
    store = _store(request)
    settings = store.load()
    if settings.server_url is None or not settings.signed_in:
        raise HTTPException(409, "Sign in to the server first")
    try:
        async with httpx.AsyncClient(
            base_url=settings.server_url, timeout=httpx.Timeout(30.0), transport=_transport(request)
        ) as http:
            response = await http.get(
                "/api/v1/projects",
                params={"page_size": 200},
                headers={"Authorization": f"Bearer {settings.token}"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"No answer from the server: {exc.__class__.__name__}") from None
    if response.status_code in (401, 403):
        raise HTTPException(401, "The sign-in has expired")
    if response.status_code != 200:
        raise HTTPException(502, f"The server answered {response.status_code} for the projects")
    body = response.json()
    items = body.get("items", body) if isinstance(body, dict) else body
    projects = [ProjectRead(id=str(p["id"]), name=str(p["name"])) for p in items]
    try:
        async with httpx.AsyncClient(
            base_url=settings.server_url, timeout=httpx.Timeout(30.0), transport=_transport(request)
        ) as http:
            overviews = await asyncio.gather(
                *(
                    http.get(
                        f"/api/v1/projects/{project.id}/offload",
                        headers={"Authorization": f"Bearer {settings.token}"},
                    )
                    for project in projects
                ),
                return_exceptions=True,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"No answer from the server: {exc.__class__.__name__}") from None
    for project, overview in zip(projects, overviews, strict=True):
        if isinstance(overview, httpx.Response) and overview.status_code == 200:
            project.stations = len(overview.json().get("stations") or [])
    return projects
