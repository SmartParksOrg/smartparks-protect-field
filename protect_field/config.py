"""Settings, read from the environment with the prefix `FIELD_` and an optional `.env` file.

The companion runs on one person's computer, so there is little to configure: where it keeps its
data and which address it listens on. Protect's own settings (`shared.config`) are never read;
they want a database and a broker this program does not have (DEVELOPERS.md, the allowed modules).
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FIELD_", env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    data_dir: Path = Field(
        default=Path("data"),
        description="Where the bundles, cards and the local database live; created on start",
    )
    host: str = "127.0.0.1"
    port: int = 18090
    key_store: Literal["auto", "file"] = Field(
        default="auto",
        description="Where the key that protects the bundle lives: the operating system's "
        "keychain when there is one (auto), else a file in the data folder readable by the "
        "owner alone; `file` forces the file (the tests, a headless machine)",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
