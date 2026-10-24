"""What every router asks first (decision D32): which project is loaded on the laptop. The
lists, the explorer, the files and the uploads show that project's and nothing of another."""

from fastapi import Request

from protect_go.bundle import BundleStore


def current_project_id(request: Request) -> str | None:
    store: BundleStore = request.app.state.bundle_store
    return store.current_project_id()
