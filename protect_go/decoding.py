"""Protect's decoding code, imported in one place so the frozen backend proves at start that
it carries it (decision D1): the station file parser, the shared decode path of a frame (the
keys, the checks, the driver's read; Protect's phase 43 P6) and the OpenCollar driver.
Everything the app decodes goes through these; nothing is decoded with code of its own."""

from shared.connectivity.adapters.lp0_station.lorawan import Credentials, FrameError, unwrap
from shared.device_drivers.base import DecodedRecords
from shared.device_drivers.opencollar import OpenCollarDriver
from shared.station_decode import (
    FrameRefused,
    UnwrappedFrame,
    decode_station_frame,
    unwrap_station_frame,
)
from shared.station_files import (
    StationFrame,
    parse_station_jsonl,
    station_eui_from_name,
    unpack_card_zip,
)

__all__ = [
    "Credentials",
    "DecodedRecords",
    "FrameError",
    "FrameRefused",
    "OpenCollarDriver",
    "StationFrame",
    "UnwrappedFrame",
    "decode_station_frame",
    "parse_station_jsonl",
    "station_eui_from_name",
    "unpack_card_zip",
    "unwrap",
    "unwrap_station_frame",
]


def decoders() -> list[str]:
    """The drivers Protect Go can decode with, by key; the health answer names them."""
    return [OpenCollarDriver.key]
