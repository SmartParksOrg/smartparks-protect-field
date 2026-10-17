"""The local server: a small API under `/api` and the built interface from `frontend/dist`.

Started with `protect-go` (or `uv run protect-go`); the browser opens
http://127.0.0.1:18090. During development Vite serves the interface itself and proxies `/api`
here (`frontend/vite.config.ts`).
"""

import asyncio
import os

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from protect_go.bundle import BundleStore
from protect_go.cards import CardStore
from protect_go.config import get_settings
from protect_go.decoding import decoders
from protect_go.routers.bundle import router as bundle_router
from protect_go.routers.cards import router as cards_router
from protect_go.routers.files import router as files_router
from protect_go.routers.map import router as map_router
from protect_go.routers.setup import router as setup_router
from protect_go.routers.trackers import router as trackers_router
from protect_go.routers.uploads import router as uploads_router
from protect_go.store import Store
from protect_go.version import ROOT, __version__, protect_revision

DIST = ROOT / "frontend" / "dist"


class Health(BaseModel):
    status: str
    version: str
    protect_revision: str | None
    decoders: list[str]
    data_dir: str


def create_app() -> FastAPI:
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    app = FastAPI(title="Smart Parks Protect Go", version=__version__, docs_url="/api/docs")
    app.state.store = Store(settings.data_dir)
    app.state.bundle_store = BundleStore(settings.data_dir, settings.key_store)
    app.state.card_store = CardStore(settings.data_dir)
    app.state.http_transport = None  # the tests hand in a mock transport
    app.include_router(setup_router)
    app.include_router(map_router)
    app.include_router(bundle_router)
    app.include_router(cards_router)
    app.include_router(files_router)
    app.include_router(uploads_router)
    app.include_router(trackers_router)

    @app.get("/api/health", response_model=Health)
    async def health() -> Health:
        return Health(
            status="ok",
            version=__version__,
            protect_revision=protect_revision(),
            decoders=decoders(),
            data_dir=str(settings.data_dir.resolve()),
        )

    @app.post("/api/shutdown", status_code=202)
    async def shutdown() -> dict[str, str]:
        """The shell asks a backend of another version to stop, so its own can take the port
        (decision D20): an installer that closed the old window left the old backend running,
        and the new window used it, old interface and all. The answer goes out first."""
        loop = asyncio.get_running_loop()
        loop.call_later(0.3, os._exit, 0)
        return {"status": "stopping"}

    if DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def interface(path: str) -> FileResponse:
            """The built interface; every unknown path is the app, which routes it itself."""
            candidate = DIST / path
            if path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(DIST / "index.html")

    return app


def run() -> None:
    settings = get_settings()
    uvicorn.run(create_app(), host=settings.host, port=settings.port, log_level="info")
