"""Protect Go's settings on disk: the Protect server, who is signed in and their token, in
`settings.json` in the data folder, readable by the owner alone. The password is never kept
(decision D7); the token is Protect's, an hour long, and Protect Go asks for the password again when
it needs the server after that."""

import json
import os
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path


@dataclass(slots=True)
class Settings:
    server_url: str | None = None
    protect_version: str | None = None
    email: str | None = None
    token: str | None = field(default=None, repr=False)
    token_expires_at: datetime | None = None

    @property
    def signed_in(self) -> bool:
        return (
            self.token is not None
            and self.token_expires_at is not None
            and self.token_expires_at > datetime.now(UTC)
        )


class Store:
    def __init__(self, data_dir: Path) -> None:
        self.path = data_dir / "settings.json"

    def load(self) -> Settings:
        if not self.path.is_file():
            return Settings()
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        expires = raw.get("token_expires_at")
        return Settings(
            server_url=raw.get("server_url"),
            protect_version=raw.get("protect_version"),
            email=raw.get("email"),
            token=raw.get("token"),
            token_expires_at=datetime.fromisoformat(expires) if expires else None,
        )

    def save(self, settings: Settings) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = asdict(settings)
        data["token_expires_at"] = (
            settings.token_expires_at.isoformat() if settings.token_expires_at else None
        )
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
        os.chmod(tmp, 0o600)
        tmp.replace(self.path)
