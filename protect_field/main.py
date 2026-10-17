"""The local server: a small API under `/api` and the built interface from `frontend/dist`.

Started with `protect-field` (or `uv run protect-field`); the browser opens
http://127.0.0.1:18090. During development Vite serves the interface itself and proxies `/api`
here (`frontend/vite.config.ts`).
"""

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from protect_field.config import get_settings
from protect_field.decoding import decoders
from protect_field.routers.setup import router as setup_router
from protect_field.store import Store
from protect_field.version import ROOT, __version__, protect_revision

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
    app = FastAPI(title="Smart Parks Protect Field", version=__version__, docs_url="/api/docs")
    app.state.store = Store(settings.data_dir)
    app.state.http_transport = None  # the tests hand in a mock transport
    app.include_router(setup_router)

    @app.get("/api/health", response_model=Health)
    async def health() -> Health:
        return Health(
            status="ok",
            version=__version__,
            protect_revision=protect_revision(),
            decoders=decoders(),
            data_dir=str(settings.data_dir.resolve()),
        )

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
