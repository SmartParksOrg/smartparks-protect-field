"""Version of the running code: the `VERSION` file at the repository root, committed before each
release tag, or `v0.0.0-dev` in a checkout without it. The Protect commit the decoding code comes
from is read from the lockfile so the health answer can name both."""

import re
from pathlib import Path

DEV_VERSION = "v0.0.0-dev"
ROOT = Path(__file__).resolve().parents[1]


def read_version() -> str:
    path = ROOT / "VERSION"
    if path.is_file():
        text = path.read_text(encoding="utf-8").strip()
        if text:
            return text
    return DEV_VERSION


def protect_revision() -> str | None:
    """The commit of Smart Parks Protect whose `shared` package is installed, from `uv.lock`."""
    lock = ROOT / "uv.lock"
    if not lock.is_file():
        return None
    match = re.search(
        r"smartparks-protect\?subdirectory=shared&rev=([0-9a-f]+)", lock.read_text(encoding="utf-8")
    )
    return match.group(1) if match else None


__version__ = read_version()
