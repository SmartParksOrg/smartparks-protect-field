"""The field bundles on the laptop (decisions D2, D11 and D31): the project's devices, entities,
stations and the LP0 credentials the account may see, as Protect's `GET /projects/{id}/field-bundle`
gave them, one file per project under `bundles/<project id>.enc`, Fernet-encrypted, read back
whole; nothing of it is logged. One of them is the loaded project, named in `bundles/current`,
and a person switches between the projects on the laptop without a connection (D31). A bundle
older than a week is stale: the devices and keys may have changed."""

import json
import os
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from protect_go.secrets import bundle_key

STALE_AFTER = timedelta(days=7)
#: A project id as Protect writes it (a UUID), which is also the file's name on disk.
PROJECT_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@dataclass(frozen=True, slots=True)
class BundleSummary:
    """What the pages show of the bundle: never a key."""

    project_id: str
    project_name: str
    generated_at: str
    fetched_at: str
    protect_version: str
    server_url: str
    devices: int
    stations: int
    entities: int
    trackers_with_keys: int
    credentials_included: bool
    stale: bool
    key_kept_in: str
    revision: str = ""


class BundleStore:
    def __init__(self, data_dir: Path, key_store: str) -> None:
        self.data_dir = data_dir
        self.folder = data_dir / "bundles"
        self.current_path = self.folder / "current"
        self.key_store = key_store
        self._migrate_legacy()

    # --- the files

    def _fernet(self) -> tuple[Fernet, str]:
        key = bundle_key(self.data_dir, self.key_store)
        return Fernet(key.key), key.kept_in

    def _path(self, project_id: str) -> Path:
        if not PROJECT_ID.match(project_id):
            raise ValueError(f"Not a project id: {project_id!r}")
        return self.folder / f"{project_id}.enc"

    def _migrate_legacy(self) -> None:
        """The one `bundle.enc` of versions before D31 becomes the project's own file and the
        loaded project; the key is only touched when there is such a file."""
        legacy = self.data_dir / "bundle.enc"
        if not legacy.is_file():
            return
        fernet, _ = self._fernet()
        try:
            envelope = json.loads(fernet.decrypt(legacy.read_bytes()))
            project_id = str(envelope["bundle"]["project"]["id"])
            target = self._path(project_id)
        except (InvalidToken, ValueError, KeyError, TypeError):
            legacy.unlink()  # another account's keychain or a replaced key: nothing to keep
            return
        self.folder.mkdir(parents=True, exist_ok=True)
        if target.exists():
            legacy.unlink()
        else:
            legacy.replace(target)
        if self.current_project_id() is None:
            self._set_current(project_id)

    def current_project_id(self) -> str | None:
        """The loaded project, or None: the one `bundles/current` names, when its file exists."""
        if not self.current_path.is_file():
            return None
        project_id = self.current_path.read_text(encoding="utf-8").strip()
        if not PROJECT_ID.match(project_id) or not self._path(project_id).is_file():
            return None
        return project_id

    def _set_current(self, project_id: str | None) -> None:
        self.folder.mkdir(parents=True, exist_ok=True)
        if project_id is None:
            if self.current_path.is_file():
                self.current_path.unlink()
            return
        tmp = self.current_path.with_suffix(".tmp")
        tmp.write_text(project_id, encoding="utf-8")
        tmp.replace(self.current_path)

    def project_ids(self) -> list[str]:
        """Every project with a bundle on the laptop, by id."""
        if not self.folder.is_dir():
            return []
        return sorted(
            path.stem for path in self.folder.glob("*.enc") if PROJECT_ID.match(path.stem)
        )

    # --- one bundle

    def save(self, bundle: dict[str, Any]) -> BundleSummary:
        """Keep a bundle under its project's file and make that project the loaded one."""
        project_id = str(bundle["project"]["id"])
        fernet, _ = self._fernet()
        envelope = {"fetched_at": datetime.now(UTC).isoformat(), "bundle": bundle}
        self.folder.mkdir(parents=True, exist_ok=True)
        path = self._path(project_id)
        tmp = path.with_suffix(".enc.tmp")
        tmp.write_bytes(fernet.encrypt(json.dumps(envelope).encode()))
        os.chmod(tmp, 0o600)
        tmp.replace(path)
        self._set_current(project_id)
        summary = self.summary()
        assert summary is not None
        return summary

    def load(self, project_id: str | None = None) -> tuple[dict[str, Any], str] | None:
        """A project's bundle (the loaded one without an id) and when it was fetched, or None
        without one; a file the key no longer opens (another account's keychain, a replaced
        key file) reads as none."""
        project_id = project_id or self.current_project_id()
        if project_id is None or not PROJECT_ID.match(project_id):
            return None
        path = self._path(project_id)
        if not path.is_file():
            return None
        fernet, _ = self._fernet()
        try:
            envelope = json.loads(fernet.decrypt(path.read_bytes()))
        except (InvalidToken, ValueError):
            return None
        return envelope["bundle"], str(envelope["fetched_at"])

    def switch(self, project_id: str) -> BundleSummary | None:
        """Make a project on the laptop the loaded one; None when it is not on the laptop."""
        if not PROJECT_ID.match(project_id) or not self._path(project_id).is_file():
            return None
        self._set_current(project_id)
        return self.summary()

    def clear(self, project_id: str | None = None) -> None:
        """Remove a project's bundle (the loaded one without an id); when it was the loaded
        project, none is loaded then, so nothing is read with another project's keys."""
        project_id = project_id or self.current_project_id()
        if project_id is None:
            return
        path = self._path(project_id)
        if path.is_file():
            path.unlink()
        if self.current_project_id() is None:
            self._set_current(None)

    def summary(self, project_id: str | None = None) -> BundleSummary | None:
        loaded = self.load(project_id)
        if loaded is None:
            return None
        bundle, fetched_at = loaded
        _, kept_in = self._fernet()
        return self._summary_of(bundle, fetched_at, kept_in)

    def summaries(self) -> list[BundleSummary]:
        """Every project on the laptop, by name."""
        rows = [summary for pid in self.project_ids() if (summary := self.summary(pid))]
        return sorted(rows, key=lambda s: s.project_name.lower())

    @staticmethod
    def _summary_of(bundle: dict[str, Any], fetched_at: str, kept_in: str) -> BundleSummary:
        devices = bundle.get("devices", [])
        fetched = datetime.fromisoformat(fetched_at)
        return BundleSummary(
            project_id=str(bundle["project"]["id"]),
            project_name=str(bundle["project"]["name"]),
            generated_at=str(bundle.get("generated_at")),
            fetched_at=fetched_at,
            protect_version=str(bundle.get("protect_version")),
            server_url=str(bundle.get("server_url")),
            devices=len(devices),
            stations=len(bundle.get("stations", [])),
            entities=len(bundle.get("entities", [])),
            trackers_with_keys=sum(
                1 for d in devices if d.get("lp0") and d["lp0"].get("app_s_key")
            ),
            credentials_included=bool(bundle.get("credentials_included")),
            stale=datetime.now(UTC) - fetched > STALE_AFTER,
            key_kept_in=kept_in,
            revision=str(bundle.get("revision") or ""),
        )
