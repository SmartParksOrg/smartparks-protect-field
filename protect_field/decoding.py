"""Protect's decoding code, imported in one place so the frozen backend proves at start that
it carries it (decision D1): the station file parser, the LP0 codec and the OpenCollar driver.
Everything Field decodes goes through these; nothing is decoded with code of Field's own."""

from shared.connectivity.adapters.lp0_station.lorawan import Credentials, FrameError, unwrap
from shared.device_drivers.opencollar import OpenCollarDriver
from shared.station_files import (
    StationFrame,
    parse_station_jsonl,
    station_eui_from_name,
    unpack_card_zip,
)

__all__ = [
    "Credentials",
    "FrameError",
    "OpenCollarDriver",
    "StationFrame",
    "parse_station_jsonl",
    "station_eui_from_name",
    "unpack_card_zip",
    "unwrap",
]


def decoders() -> list[str]:
    """The drivers Field can decode with, by key; the health answer names them."""
    return [OpenCollarDriver.key]
