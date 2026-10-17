"""Exports of the decoded data on the laptop (decision D27), after Protect's export formats:
the records as CSV in the wide layout (a column per metric, the default) or the long one (a
row per value), and the positions as GeoJSON (a line per tracker and its fixes as points) or
GPX (a track per tracker). The rows are the Data explorer's, merged per tracker and moment;
times are UTC, as Protect writes them."""

import csv
import io
import json
from typing import Any
from xml.sax.saxutils import escape

FORMATS = {
    "csv-wide": ("text/csv", "csv"),
    "csv-long": ("text/csv", "csv"),
    "geojson": ("application/geo+json", "geojson"),
    "gpx": ("application/gpx+xml", "gpx"),
}

FIXED = ("time_utc", "tracker", "device_id", "latitude", "longitude")


def _oldest_first(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda r: (str(r["time"]), str(r["device_name"])))


def metric_keys(rows: list[dict[str, Any]], chosen: list[str] | None) -> list[str]:
    """The metric columns: the chosen ones in their order, else every key the rows carry in
    the order they first appear."""
    if chosen:
        return list(chosen)
    seen: list[str] = []
    for row in rows:
        for key in row["values"]:
            if key not in seen:
                seen.append(key)
    return seen


def csv_wide(rows: list[dict[str, Any]], chosen: list[str] | None) -> str:
    keys = metric_keys(rows, chosen)
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow([*FIXED, *keys])
    for row in _oldest_first(rows):
        writer.writerow(
            [
                row["time"],
                row["device_name"],
                row["device_id"],
                row["lat"] if row["lat"] is not None else "",
                row["lon"] if row["lon"] is not None else "",
                *[
                    row["values"].get(key) if row["values"].get(key) is not None else ""
                    for key in keys
                ],
            ]
        )
    return out.getvalue()


def csv_long(rows: list[dict[str, Any]], chosen: list[str] | None) -> str:
    keys = set(metric_keys(rows, chosen))
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["time_utc", "tracker", "device_id", "metric", "value"])
    for row in _oldest_first(rows):
        if row["lat"] is not None and row["lon"] is not None:
            writer.writerow(
                [row["time"], row["device_name"], row["device_id"], "latitude", row["lat"]]
            )
            writer.writerow(
                [row["time"], row["device_name"], row["device_id"], "longitude", row["lon"]]
            )
        for key, value in row["values"].items():
            if key in keys and value is not None:
                writer.writerow([row["time"], row["device_name"], row["device_id"], key, value])
    return out.getvalue()


def _tracks(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    tracks: dict[str, dict[str, Any]] = {}
    for row in _oldest_first(rows):
        if row["lat"] is None or row["lon"] is None:
            continue
        track = tracks.setdefault(str(row["device_id"]), {"name": row["device_name"], "points": []})
        track["points"].append((row["lon"], row["lat"], row["time"]))
    return tracks


def geojson(rows: list[dict[str, Any]]) -> str:
    features: list[dict[str, Any]] = []
    for device_id, track in _tracks(rows).items():
        points = track["points"]
        if len(points) > 1:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[lon, lat] for lon, lat, _ in points],
                    },
                    "properties": {
                        "tracker": track["name"],
                        "device_id": device_id,
                        "kind": "track",
                        "from": points[0][2],
                        "to": points[-1][2],
                        "points": len(points),
                    },
                }
            )
        for lon, lat, time in points:
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {
                        "tracker": track["name"],
                        "device_id": device_id,
                        "kind": "fix",
                        "time_utc": time,
                    },
                }
            )
    return json.dumps({"type": "FeatureCollection", "features": features})


def gpx(rows: list[dict[str, Any]]) -> str:
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>\n',
        '<gpx version="1.1" creator="Smart Parks Protect Go" '
        'xmlns="http://www.topografix.com/GPX/1/1">\n',
    ]
    for track in _tracks(rows).values():
        out.append(f"<trk><name>{escape(str(track['name']))}</name><trkseg>\n")
        for lon, lat, time in track["points"]:
            out.append(f'<trkpt lat="{lat}" lon="{lon}"><time>{escape(str(time))}</time></trkpt>\n')
        out.append("</trkseg></trk>\n")
    out.append("</gpx>\n")
    return "".join(out)


def render(fmt: str, rows: list[dict[str, Any]], chosen: list[str] | None) -> str:
    if fmt == "csv-wide":
        return csv_wide(rows, chosen)
    if fmt == "csv-long":
        return csv_long(rows, chosen)
    if fmt == "geojson":
        return geojson(rows)
    if fmt == "gpx":
        return gpx(rows)
    raise ValueError(f"Unknown export format {fmt}")
