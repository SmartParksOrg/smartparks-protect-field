"""Talking to the Protect server: the version probe, the sign-in and the account, with the
same words the interface shows. One client factory so the tests hand in a mock transport."""

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import jwt

TIMEOUT = httpx.Timeout(15.0)


class ProtectError(Exception):
    """A reason in words, and the HTTP status Field answers with."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def normalise_server_url(text: str) -> str:
    url = text.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    parsed = httpx.URL(url)
    if not parsed.host:
        raise ProtectError(400, "That is not a web address")
    return str(parsed.copy_with(path="", query=None, fragment=None)).rstrip("/")


def client(server_url: str, transport: httpx.AsyncBaseTransport | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=server_url, timeout=TIMEOUT, transport=transport)


async def probe_version(
    server_url: str, transport: httpx.AsyncBaseTransport | None
) -> dict[str, Any]:
    """`GET /api/version` of a Protect server; anything else is not a Protect server."""
    try:
        async with client(server_url, transport) as http:
            response = await http.get("/api/version")
    except httpx.HTTPError as exc:
        raise ProtectError(502, f"No answer from {server_url}: {exc.__class__.__name__}") from None
    if response.status_code != 200:
        raise ProtectError(502, f"{server_url} answered {response.status_code} to /api/version")
    try:
        body = response.json()
    except ValueError:
        raise ProtectError(502, f"{server_url} is not a Protect server") from None
    if not isinstance(body, dict) or "version" not in body:
        raise ProtectError(502, f"{server_url} is not a Protect server")
    return body


def token_expiry(token: str) -> datetime:
    """The token's own `exp`, read without verifying (Protect signed it; Field only needs the
    time), or an hour from now when it has none."""
    try:
        claims = jwt.decode(token, options={"verify_signature": False})
        exp = claims.get("exp")
        if isinstance(exp, int | float):
            return datetime.fromtimestamp(exp, tz=UTC)
    except jwt.PyJWTError:
        pass
    return datetime.now(UTC) + timedelta(hours=1)


async def sign_in(
    server_url: str, email: str, password: str, transport: httpx.AsyncBaseTransport | None
) -> tuple[str, str, datetime]:
    """Protect's password login; returns the token, the account's email and when it expires."""
    try:
        async with client(server_url, transport) as http:
            response = await http.post(
                "/api/v1/auth/login", data={"username": email, "password": password}
            )
            if response.status_code in (400, 401, 403):
                raise ProtectError(401, "Wrong email or password, or the account is not active")
            if response.status_code != 200:
                raise ProtectError(
                    502, f"The server answered {response.status_code} to the sign-in"
                )
            token = str(response.json()["access_token"])
            me = await http.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
            if me.status_code != 200:
                raise ProtectError(502, f"The server answered {me.status_code} for the account")
            account_email = str(me.json().get("email") or email)
    except httpx.HTTPError as exc:
        raise ProtectError(502, f"No answer from {server_url}: {exc.__class__.__name__}") from None
    return token, account_email, token_expiry(token)
