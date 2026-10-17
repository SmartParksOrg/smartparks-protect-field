"""The SD card found by itself (decision D16): the station files under a volume a few levels
deep, system folders skipped, and a card read from a path on this computer with the same
outcome as the same files dropped in."""

import io
import zipfile
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from protect_go import volumes
from protect_go.bundle import BundleStore
from tests.test_bundle import BUNDLE
from tests.test_cards import STATION, app, card_zip  # noqa: F401 (the app fixture)

pytestmark = pytest.mark.asyncio


def sd_card(root: Path) -> Path:
    """The card's layout on a volume: `LOG_N` folders, a system folder, a stray file."""
    with zipfile.ZipFile(io.BytesIO(card_zip())) as archive:
        archive.extractall(root)
    (root / "System Volume Information").mkdir()
    (root / "System Volume Information" / f"{STATION}_1.jsonl").write_text("{}\n")
    (root / "deep" / "deeper" / "deepest" / "LOG_9").mkdir(parents=True)
    (root / "deep" / "deeper" / "deepest" / "LOG_9" / f"{STATION}_2.jsonl").write_text("{}\n")
    return root


def test_station_files_are_found_a_few_levels_deep_and_system_folders_skipped(tmp_path):
    root = sd_card(tmp_path / "card")
    found = [str(p.relative_to(root)) for p in volumes.station_files_under(root)]
    assert found == [f"LOG_1/{STATION}_1791795031.jsonl", f"LOG_2/{STATION}_1791796000.jsonl"]
    described = volumes.volumes([(root, "CARD (E:)")])
    assert len(described) == 1
    volume = described[0]
    assert volume.label == "CARD (E:)" and volume.files == 2 and volume.stations == [STATION]
    assert volume.size > 0
    assert volumes.volumes([(tmp_path / "empty", None)])[0].files == 0


async def test_a_card_is_read_from_a_path_as_from_a_drop(app, tmp_path):  # noqa: F811
    root = sd_card(tmp_path / "card")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        refused = await client.post("/api/cards/path", json={"path": str(root)})
        assert refused.status_code == 409
        BundleStore(tmp_path / "data", "file").save(BUNDLE)

        missing = await client.post("/api/cards/path", json={"path": str(tmp_path / "nothing")})
        assert missing.status_code == 404
        (tmp_path / "plain").mkdir()
        empty = await client.post("/api/cards/path", json={"path": str(tmp_path / "plain")})
        assert empty.status_code == 422 and "No station file" in empty.text

        read = await client.post("/api/cards/path", json={"path": str(root), "name": "CARD (E:)"})
        assert read.status_code == 201, read.text
        card = read.json()
        assert card["name"] == "CARD (E:)" and card["station_eui"] == STATION
        assert card["files"] == 2 and card["frames"] == 4 and card["positions"] == 3
        assert card["decoded"] == 1 and card["repeated"] == 1 and card["skipped"] == []

        listed = await client.get("/api/cards/volumes")
        assert listed.status_code == 200 and isinstance(listed.json(), list)
