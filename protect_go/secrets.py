"""The key that protects the bundle at rest (decision D11): a Fernet key kept in the operating
system's keychain (Windows Credential Manager, macOS Keychain, a Secret Service on Linux) so the
laptop's own login is the password and nobody types a second one; where no keychain answers, a
key file in the data folder readable by the owner alone, and the status says so."""

import os
from dataclasses import dataclass
from pathlib import Path

from cryptography.fernet import Fernet

SERVICE = "Smart Parks Protect Go"
ACCOUNT = "bundle-key"


@dataclass(frozen=True, slots=True)
class BundleKey:
    key: bytes
    kept_in: str  # "keychain" or "file"


def _from_keychain() -> bytes | None:
    try:
        import keyring

        value = keyring.get_password(SERVICE, ACCOUNT)
        if value is None:
            value = Fernet.generate_key().decode()
            keyring.set_password(SERVICE, ACCOUNT, value)
        return value.encode()
    except Exception:  # no backend, a locked keychain, a denied prompt: the file stands in
        return None


def _from_file(data_dir: Path) -> bytes:
    path = data_dir / "bundle.key"
    if path.is_file():
        return path.read_bytes().strip()
    data_dir.mkdir(parents=True, exist_ok=True)
    key = Fernet.generate_key()
    tmp = path.with_suffix(".key.tmp")
    tmp.write_bytes(key)
    os.chmod(tmp, 0o600)
    tmp.replace(path)
    return key


def bundle_key(data_dir: Path, store: str) -> BundleKey:
    """The key, made on first use; the keychain first unless `store` is `file`."""
    if store == "auto":
        key = _from_keychain()
        if key is not None:
            return BundleKey(key=key, kept_in="keychain")
    return BundleKey(key=_from_file(data_dir), kept_in="file")
