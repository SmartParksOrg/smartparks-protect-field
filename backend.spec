# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Field backend, the way AddaxAI freezes its backend: one folder
with the Python runtime, `protect_field`, Protect's `shared` package and what they import, plus
the built interface, `VERSION` and `uv.lock` (the Protect commit is read from it). The Electron
shell starts `backend/backend` from its resources (`electron/src/main.ts`).

    uv run pyinstaller backend.spec --clean       # writes dist/backend/
"""

from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

root = Path(SPECPATH).resolve()

datas = [
    (str(root / "frontend" / "dist"), "frontend/dist"),
    (str(root / "VERSION"), "."),
    (str(root / "uv.lock"), "."),
]
datas += collect_data_files("pydantic")
datas += collect_data_files("fastapi")
# the OpenCollar driver reads its catalogue and decoder files from its package folder
datas += collect_data_files("shared.device_drivers.opencollar")
datas += collect_data_files("shared.metrics")

hiddenimports = []
hiddenimports += collect_submodules("fastapi")
hiddenimports += collect_submodules("starlette")
hiddenimports += collect_submodules("uvicorn")
hiddenimports += collect_submodules("pydantic")
hiddenimports += collect_submodules("pydantic_settings")
hiddenimports += collect_submodules("shared.station_files")
hiddenimports += collect_submodules("shared.connectivity.adapters.lp0_station")
hiddenimports += collect_submodules("shared.device_drivers.opencollar")

a = Analysis(
    [str(root / "protect_field" / "__main__.py")],
    pathex=[str(root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    # the server-only heavy packages the shared package depends on and Field never imports
    excludes=["tkinter", "matplotlib", "weasyprint", "pyarrow", "PIL", "openpyxl", "chirpstack_api", "grpc", "minio", "aiomqtt", "asyncpg", "psycopg"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="backend")
