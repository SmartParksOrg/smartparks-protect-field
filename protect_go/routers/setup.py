"""The setup of Protect Go (decision D7): the Protect server it synchronises with, and who is signed
in. `PUT /api/setup/server` probes the server before keeping it; `POST /api/session` signs in
with Protect's own login and keeps the token, never the password."""

import asyncio
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from protect_go.protect import (
    ProtectError,
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
