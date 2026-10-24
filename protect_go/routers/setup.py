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
    #: When the loaded project's map last came by itself (D32): a map the server was still
    #: cutting at the load is fetched by the probe once it is ready
    map_updated_at: str | None = None
    #: The background sync of every project with a station (D34): when it last ran through,
    #: how many projects it loaded anew in all, and how many the laptop holds
    projects_synced_at: str | None = None
    projects_loaded: int = 0
    projects_on_laptop: int = 0


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
    refresh = await _follow_the_projects(request, settings, transport, account_ok)
    return ConnectionRead(
        online=True,
        checked_at=checked_at,
        protect_version=protect_version,
        account_ok=account_ok,
        error=None,
        **refresh,
    )


#: How often the laptop's projects are compared with the server's while the app is online.
REVISION_CHECK_EVERY = timedelta(minutes=5)


def _public(state: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in state.items() if k != "due"}


async def _follow_the_projects(
    request: Request, settings: Any, transport: Any, account_ok: bool | None
) -> dict[str, Any]:
    """Every project with an offload station the account may read is kept on this laptop and
    current (decision D34, Tim, 2026-10-24: switching projects should be a view change, with
    nothing left to fetch; before it, decision D29 followed the loaded project alone). Every
    few minutes online, a task in the background lists the server's projects, loads the ones
    with a station that are not on the laptop yet, loads again the ones whose revision moved
    (reading the frames of trackers unknown before, D28), and fetches a map that is missing;
    the loaded project's own changes are what the pages are told. The probe answers at once
    with the last state; a person's own load or switch starts the cycle over."""
    state = request.app.state
    last = getattr(state, "bundle_follow", None) or {}
    if not account_ok:
        return _public(last)
    now = datetime.now(UTC)
    due = last.get("due")
    task: asyncio.Task[None] | None = getattr(state, "bundle_sync_task", None)
    if (due is not None and now < due) or (task is not None and not task.done()):
        return _public(last)
    state.bundle_follow = {**last, "due": now + REVISION_CHECK_EVERY}
    state.bundle_sync_task = asyncio.create_task(
        _sync_projects(request.app, settings, transport, now)
    )
    return _public(state.bundle_follow)


async def _sync_projects(app: Any, settings: Any, transport: Any, started: datetime) -> None:
    """One pass of decision D34 over the server's projects and the laptop's."""
    from protect_go.routers.bundle import LoadRequest, load_bundle
    from protect_go.routers.map import MapFetch, fetch_project_map, read_map

    store = app.state.bundle_store
    last = dict(getattr(app.state, "bundle_follow", None) or {})
    result: dict[str, Any] = {
        **last,
        "bundle_checked_at": started.isoformat(),
        "bundle_outdated": False,
    }
    loaded_id = store.current_project_id()
    try:
        wanted: dict[str, str] = {}
        try:
            for project in await server_projects(settings, transport):
                if project.stations > 0:
                    wanted[project.id] = project.name
        except HTTPException:
            pass  # the list did not come: the projects on the laptop are still kept current
        on_laptop = {s.project_id: s for s in store.summaries()}
        async with client(settings.server_url, transport) as http:
            for project_id in sorted(set(wanted) | set(on_laptop)):
                name = wanted.get(project_id) or on_laptop[project_id].project_name
                body = LoadRequest(project_id=project_id, project_name=name)
                try:
                    if project_id not in on_laptop:
                        await load_bundle(app, body, make_current=False)
                        result["projects_loaded"] = int(result.get("projects_loaded") or 0) + 1
                        continue
                    answer = await http.get(
                        f"/api/v1/projects/{project_id}/field-bundle/revision",
                        headers={"Authorization": f"Bearer {settings.token}"},
                    )
                    if answer.status_code == 200:
                        revision = str(answer.json().get("revision") or "")
                        if revision and revision != on_laptop[project_id].revision:
                            loaded = await load_bundle(app, body, make_current=False)
                            if project_id == loaded_id:
                                result["bundle_updated_at"] = loaded.bundle.fetched_at
                                result["frames_read_again"] = loaded.frames_read_again
                            if loaded.map.present and project_id == loaded_id:
                                result["map_updated_at"] = started.isoformat()
                    if not read_map(app, project_id).present:
                        fetched = await fetch_project_map(
                            app, MapFetch(project_id=project_id, project_name=name)
                        )
                        if fetched.present and project_id == loaded_id:
                            result["map_updated_at"] = started.isoformat()
                except HTTPException:
                    if project_id == loaded_id:
                        result["bundle_outdated"] = True
    except httpx.HTTPError:
        pass  # offline in the middle of the sync: the next one tells
    result["projects_synced_at"] = datetime.now(UTC).isoformat()
    result["projects_on_laptop"] = len(store.project_ids())
    app.state.bundle_follow = result


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
    return await server_projects(store.load(), _transport(request))


async def server_projects(settings: Settings, transport: Any) -> list[ProjectRead]:
    """The account's projects on the server with their station counts; the route's answer and
    the background sync's list (D34)."""
    if settings.server_url is None or not settings.signed_in:
        raise HTTPException(409, "Sign in to the server first")
    try:
        async with httpx.AsyncClient(
            base_url=settings.server_url, timeout=httpx.Timeout(30.0), transport=transport
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
            base_url=settings.server_url, timeout=httpx.Timeout(30.0), transport=transport
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
