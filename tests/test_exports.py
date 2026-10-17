"""The exports (decision D27): the records as CSV wide and long, the positions as GeoJSON and
GPX, from the Data explorer's rows, oldest first, times in UTC."""

import csv
import io
import json

import pytest
from httpx import ASGITransport, AsyncClient

from protect_go import exports
from protect_go.bundle import BundleStore
from tests.test_bundle import BUNDLE
from tests.test_cards import app, card_zip  # noqa: F401 (the app fixture)

ROWS = [
    {
        "time": "2026-10-15T00:00:00Z",
        "device_id": "d1",
        "device_name": "SP100001",
        "entity_id": "e1",
        "lat": 7.7,
        "lon": -10.9,
        "values": {"battery_voltage": 4.01, "temperature": 24.5},
    },
    {
        "time": "2026-10-14T00:00:00Z",
        "device_id": "d1",
        "device_name": "SP100001",
        "entity_id": "e1",
        "lat": 7.71,
        "lon": -10.91,
        "values": {"battery_voltage": 4.02},
    },
    {
        "time": "2026-10-13T12:00:00Z",
        "device_id": "d1",
        "device_name": "SP100001",
        "entity_id": "e1",
        "lat": None,
        "lon": None,
        "values": {"battery_voltage": 4.03},
    },
    {
        "time": "2026-10-14T06:00:00Z",
        "device_id": "d2",
        "device_name": "SP100002",
        "entity_id": None,
        "lat": 7.8,
        "lon": -10.8,
        "values": {},
    },
]


def test_csv_wide_has_a_column_per_metric_oldest_first():
    rows = list(csv.reader(io.StringIO(exports.csv_wide(ROWS, None))))
    assert rows[0] == [
        "time_utc",
        "tracker",
        "device_id",
        "latitude",
        "longitude",
        "battery_voltage",
        "temperature",
    ]
    assert rows[1][0] == "2026-10-13T12:00:00Z" and rows[1][3] == "" and rows[1][5] == "4.03"
    assert rows[-1][0] == "2026-10-15T00:00:00Z" and rows[-1][6] == "24.5"
    chosen = list(csv.reader(io.StringIO(exports.csv_wide(ROWS, ["temperature"]))))
    assert chosen[0][-1] == "temperature" and len(chosen[0]) == 6


def test_csv_long_has_a_row_per_value_with_the_fix_as_two():
    rows = list(csv.reader(io.StringIO(exports.csv_long(ROWS, None))))
    assert rows[0] == ["time_utc", "tracker", "device_id", "metric", "value"]
    metrics = [r[3] for r in rows[1:]]
    assert metrics.count("latitude") == 3 and metrics.count("battery_voltage") == 3
    assert metrics.count("temperature") == 1


def test_geojson_and_gpx_carry_a_track_per_tracker():
    collection = json.loads(exports.geojson(ROWS))
    kinds = [(f["properties"]["tracker"], f["properties"]["kind"]) for f in collection["features"]]
    assert ("SP100001", "track") in kinds and kinds.count(("SP100001", "fix")) == 2
    assert ("SP100002", "track") not in kinds and ("SP100002", "fix") in kinds  # one fix, no line
    track = next(f for f in collection["features"] if f["properties"]["kind"] == "track")
    assert track["geometry"]["coordinates"] == [[-10.91, 7.71], [-10.9, 7.7]]
    document = exports.gpx(ROWS)
    assert document.count("<trk>") == 2 and document.count("<trkpt") == 3
    assert (
        'creator="Smart Parks Protect Go"' in document
        and "<time>2026-10-14T00:00:00Z</time>" in document
    )


@pytest.mark.asyncio
async def test_the_export_endpoint_names_the_file_and_refuses_an_unknown_format(app, tmp_path):  # noqa: F811
    BundleStore(tmp_path / "data", "file").save(BUNDLE)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/api/cards", files=[("files", ("card.zip", card_zip(), "application/zip"))]
        )
        response = await client.get(
            "/api/export", params={"format": "csv-wide", "device_id": ["d1"]}
        )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")
        assert 'filename="protect-go-records-' in response.headers["content-disposition"]
        assert response.text.startswith("time_utc,tracker,device_id,latitude,longitude")
        positions = await client.get("/api/export", params={"format": "gpx"})
        assert positions.headers["content-type"].startswith("application/gpx+xml")
        assert (await client.get("/api/export", params={"format": "xlsx"})).status_code == 422
