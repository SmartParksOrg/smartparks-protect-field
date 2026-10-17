"""The upload (decision D2; phase 2 F4): the card's files to the Protect server exactly as they
were on the card, one request per file to the station's `POST /devices/{id}/offload-files`, the
server's answer kept on the file. The server decodes the files itself and refuses one it already
holds, so a card read in the field and uploaded later costs nothing twice. Nothing decoded here
is sent."""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from protect_go.cards import CardStore
from protect_go.store import Settings

TIMEOUT = httpx.Timeout(30.0, read=300.0)


@dataclass(slots=True)
class UploadRun:
    attempted: int = 0
    uploaded: int = 0
    duplicate: int = 0
    refused: int = 0
    failed: int = 0
    skipped_no_station: int = 0
    #: Why the run stopped early, in words: the sign-in expired, the account may not upload
    stopped: str | None = None
    cards: set[str] = field(default_factory=set)


def _file_bytes(path: str) -> bytes | None:
    """The kept file as it was on the card, or None when it is gone."""
    file = Path(path)
    return file.read_bytes() if file.is_file() else None


def _words(response: httpx.Response) -> str:
    try:
        detail = response.json().get("detail")
        return str(detail) if detail else response.text[:300]
    except ValueError:
        return response.text[:300]


async def run_uploads(
    store: CardStore,
    settings: Settings,
    *,
    card_id: str | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> UploadRun:
    """Upload every pending or failed file of one card, or of all cards. A file whose card has
    no station of the project is left pending with a word; a 401 or 403 stops the run."""
    run = UploadRun()
    if settings.server_url is None or settings.token is None:
        run.stopped = "Sign in to the server first"
        return run
    headers = {"Authorization": f"Bearer {settings.token}"}
    async with httpx.AsyncClient(
        base_url=settings.server_url, timeout=TIMEOUT, transport=transport
    ) as http:
        for item in store.pending_files(card_id):
            run.cards.add(item["card_id"])
            if not item["station_device_id"]:
                run.skipped_no_station += 1
                store.mark_upload(
                    item["id"],
                    "pending",
                    f"The project has no offload station with EUI {item['station_eui'] or '?'}; "
                    "make the RangerEdge an offload station on Protect's Offload page, load the "
                    "project again, then upload",
                )
                continue
            content = _file_bytes(item["path"])
            if content is None:
                run.refused += 1
                store.mark_upload(item["id"], "refused", "The file is no longer on this laptop")
                continue
            run.attempted += 1
            try:
                response = await http.post(
                    f"/api/v1/devices/{item['station_device_id']}/offload-files",
                    files={"file": (item["name"], content, "application/jsonl")},
                    headers=headers,
                )
            except httpx.HTTPError as exc:
                run.failed += 1
                store.mark_upload(
                    item["id"], "failed", f"No answer from the server: {exc.__class__.__name__}"
                )
                run.stopped = "The server did not answer; try again when online"
                break
            _settle(store, item, response, run)
            if run.stopped:
                break
    return run


def _settle(
    store: CardStore, item: dict[str, Any], response: httpx.Response, run: UploadRun
) -> None:
    """The server's answer on the file: 201 with the file row is uploaded (or the one member
    skipped with its reason), 422 naming "uploaded before" is a duplicate, other 422s a refusal,
    401 and 403 stop the run, anything else is a failure to try again."""
    if response.status_code == 201:
        body = response.json()
        files = body.get("files") or []
        skipped = body.get("skipped") or []
        if files:
            run.uploaded += 1
            store.mark_upload(
                item["id"],
                "uploaded",
                "Accepted by the server",
                log_file_id=str(files[0].get("id")),
            )
        elif skipped:
            reason = str(skipped[0].get("reason") or "")
            if "uploaded before" in reason:
                run.duplicate += 1
                store.mark_upload(item["id"], "duplicate", "The server had this file already")
            else:
                run.refused += 1
                store.mark_upload(item["id"], "refused", reason)
        else:
            run.refused += 1
            store.mark_upload(item["id"], "refused", "The server accepted nothing of the file")
        return
    words = _words(response)
    if response.status_code == 422:
        if "uploaded before" in words:
            run.duplicate += 1
            store.mark_upload(item["id"], "duplicate", "The server had this file already")
        else:
            run.refused += 1
            store.mark_upload(item["id"], "refused", words)
        return
    if response.status_code == 401:
        store.mark_upload(item["id"], "failed", "The sign-in has expired")
        run.failed += 1
        run.stopped = "The sign-in has expired; sign in again and upload again"
        return
    if response.status_code == 403:
        store.mark_upload(item["id"], "failed", "This account may not upload to the station")
        run.failed += 1
        run.stopped = (
            "Your account may not upload to this station (it takes device control in the "
            "project); ask an operator or an administrator"
        )
        return
    run.failed += 1
    store.mark_upload(item["id"], "failed", f"The server answered {response.status_code}: {words}")
