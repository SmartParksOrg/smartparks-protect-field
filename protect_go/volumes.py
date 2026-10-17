"""The SD card found by itself (decision D16; Tim, 2026-10-17): the removable volumes of this
computer, the station files on each (`LOG_*` folders of `STATIONEUI_timestamp.jsonl`, a few
levels deep), and a read straight from a path on this computer, so nobody picks files by hand.
A copy of the card in a folder reads the same way through the folder picker."""

import contextlib
import sys
from dataclasses import dataclass, field
from pathlib import Path

from shared.station_files import STATION_FILE, station_eui_from_name

MAX_DEPTH = 3
MAX_DIRS = 2000
SKIPPED_NAMES = {"System Volume Information", "$RECYCLE.BIN", ".Spotlight-V100", ".Trashes"}


@dataclass(slots=True)
class Volume:
    path: str
    label: str
    files: int
    size: int
    stations: list[str] = field(default_factory=list)


def station_files_under(root: Path, max_depth: int = MAX_DEPTH) -> list[Path]:
    """Every station file under `root`, a few levels deep, hidden and system folders skipped;
    sorted by folder and name so a card reads in the station's order."""
    found: list[Path] = []
    visited = 0

    def walk(folder: Path, depth: int) -> None:
        nonlocal visited
        visited += 1
        if visited > MAX_DIRS:
            return
        try:
            entries = sorted(folder.iterdir(), key=lambda p: p.name)
        except OSError:
            return
        for entry in entries:
            if entry.name.startswith(".") or entry.name in SKIPPED_NAMES:
                continue
            try:
                if entry.is_file():
                    if STATION_FILE.match(entry.name):
                        found.append(entry)
                elif entry.is_dir() and depth < max_depth:
                    walk(entry, depth + 1)
            except OSError:
                continue

    walk(root, 0)
    return found


def describe(root: Path, label: str | None = None) -> Volume:
    files = station_files_under(root)
    size = 0
    for path in files:
        with contextlib.suppress(OSError):
            size += path.stat().st_size
    stations = sorted({eui for eui in (station_eui_from_name(p.name) for p in files) if eui})
    return Volume(
        path=str(root),
        label=label or root.name or str(root),
        files=len(files),
        size=size,
        stations=stations,
    )


def _windows_removable() -> list[tuple[Path, str | None]]:
    import ctypes

    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
    mask = kernel32.GetLogicalDrives()
    volumes: list[tuple[Path, str | None]] = []
    for index in range(26):
        if not mask & (1 << index):
            continue
        root = f"{chr(65 + index)}:\\"
        if kernel32.GetDriveTypeW(root) != 2:  # DRIVE_REMOVABLE
            continue
        name = ctypes.create_unicode_buffer(261)
        ok = kernel32.GetVolumeInformationW(root, name, 261, None, None, None, None, 0)
        label = name.value if ok and name.value else None
        volumes.append((Path(root), f"{label} ({root[:2]})" if label else root[:2]))
    return volumes


def _mounted_under(parents: list[Path]) -> list[tuple[Path, str | None]]:
    volumes: list[tuple[Path, str | None]] = []
    for parent in parents:
        try:
            children = sorted(parent.iterdir(), key=lambda p: p.name)
        except OSError:
            continue
        for child in children:
            try:
                if not child.is_dir() or child.resolve() == Path("/"):
                    continue
            except OSError:
                continue
            volumes.append((child, child.name))
    return volumes


def removable_volumes() -> list[tuple[Path, str | None]]:
    """The volumes a card can sit on: Windows' removable drives, macOS's `/Volumes` but the
    boot volume, Linux's `/media` and `/run/media` mounts."""
    if sys.platform == "win32":
        return _windows_removable()
    if sys.platform == "darwin":
        return _mounted_under([Path("/Volumes")])
    parents = [Path("/media"), Path("/run/media")]
    nested: list[Path] = []
    for parent in parents:
        try:
            nested.extend(p for p in parent.iterdir() if p.is_dir())
        except OSError:
            continue
    return _mounted_under(parents + nested)


def volumes(roots: list[tuple[Path, str | None]] | None = None) -> list[Volume]:
    """Each removable volume (or each of `roots`) with its station files counted."""
    return [describe(root, label) for root, label in (roots or removable_volumes())]


def read_files(root: Path) -> list[tuple[str, bytes]]:
    """The station files under `root` as the drop would carry them: `folder/name` and bytes."""
    return [(f"{p.parent.name}/{p.name}", p.read_bytes()) for p in station_files_under(root)]
