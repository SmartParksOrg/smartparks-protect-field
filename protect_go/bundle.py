"""The field bundle on the laptop (decisions D2 and D11): the project's devices, entities,
stations and the LP0 credentials the account may see, as Protect's `GET /projects/{id}/field-bundle`
gave them, kept encrypted in `bundle.enc` in the data folder and read back whole; nothing of it
is logged. A bundle older than a week is stale: the devices and keys may have changed."""

import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from protect_go.secrets import bundle_key

STALE_AFTER = timedelta(days=7)


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
        self.path = data_dir / "bundle.enc"
        self.data_dir = data_dir
        self.key_store = key_store

    def _fernet(self) -> tuple[Fernet, str]:
        key = bundle_key(self.data_dir, self.key_store)
        return Fernet(key.key), key.kept_in

    def save(self, bundle: dict[str, Any]) -> BundleSummary:
        fernet, _ = self._fernet()
        envelope = {"fetched_at": datetime.now(UTC).isoformat(), "bundle": bundle}
        self.data_dir.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".enc.tmp")
        tmp.write_bytes(fernet.encrypt(json.dumps(envelope).encode()))
        os.chmod(tmp, 0o600)
        tmp.replace(self.path)
        summary = self.summary()
        assert summary is not None
        return summary

    def load(self) -> tuple[dict[str, Any], str] | None:
        """The bundle and when it was fetched, or None without one; a file the key no longer
        opens (another account's keychain, a replaced key file) reads as none."""
        if not self.path.is_file():
            return None
        fernet, _ = self._fernet()
        try:
            envelope = json.loads(fernet.decrypt(self.path.read_bytes()))
        except (InvalidToken, ValueError):
            return None
        return envelope["bundle"], str(envelope["fetched_at"])

    def clear(self) -> None:
        if self.path.is_file():
            self.path.unlink()

    def summary(self) -> BundleSummary | None:
        loaded = self.load()
        if loaded is None:
            return None
        bundle, fetched_at = loaded
        _, kept_in = self._fernet()
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
