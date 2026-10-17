"""Protect's decoding code works here without a database, a broker or Protect's settings.

The frame is the firmware's own fixture, the "saved replay packet" of the LP0 wire format
document (protocol version 4), with its synthetic keys and address; Protect's test suite holds
the same bytes. If this test fails after `scripts/dev.sh bump-protect`, the pinned Protect commit
moved something the companion depends on (decision D1): read Protect's changelog first.
"""

import os

from shared.connectivity.adapters.lp0_station.lorawan import Credentials, build_uplink, unwrap
from shared.device_drivers.opencollar import OpenCollarDriver

NWK_S_KEY = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
APP_S_KEY = bytes.fromhex("101112131415161718191a1b1c1d1e1f")
CREDENTIALS = Credentials("26010203", APP_S_KEY, NWK_S_KEY)
SAVED_REPLAY_PACKET = bytes.fromhex(
    "40030201260065001d9903be5dd95f109a3aab9e6baecc7e09a376a185164d2db542bae5d933560201d06b58b64e"
)
THREE_RECORDS = bytes.fromhex("120704040302017856341212070404030201785634121207040403020178563412")


def test_runs_without_protects_environment():
    for name in ("DATABASE_URL", "REDIS_URL", "MINIO_ENDPOINT", "JWT_SECRET"):
        assert name not in os.environ, f"{name} is set; the companion must not need it"


def test_the_firmware_fixture_unwraps_with_protects_codec():
    unwrapped = unwrap(SAVED_REPLAY_PACKET, CREDENTIALS)
    assert (unwrapped.payload, unwrapped.f_port, unwrapped.f_cnt) == (THREE_RECORDS, 29, 101)
    assert build_uplink(CREDENTIALS, 101, 29, THREE_RECORDS) == SAVED_REPLAY_PACKET


def test_the_opencollar_driver_is_importable_and_has_a_catalog():
    catalog = OpenCollarDriver.catalog()
    assert catalog, "the driver catalog is empty"


def test_a_station_file_parses_with_protects_parser():
    """Protect's phase 43 P1: the station file parser imports without a database."""
    import base64
    import json

    from shared.station_files import parse_station_jsonl, station_eui_from_name

    line = json.dumps(
        {
            "gatewayEui": "0016C001F0ABCDEF",
            "rxpk": {
                "time": "2026-10-12T08:50:31Z",
                "tmst": 1791795031,
                "freq": 864.629,
                "datr": "SF7BW250",
                "codr": "4/5",
                "rssi": -71,
                "lsnr": 9,
                "size": len(SAVED_REPLAY_PACKET),
                "data": base64.b64encode(SAVED_REPLAY_PACKET).decode(),
            },
            "lp0": {
                "version": 5,
                "source_eui": "0016C001F0100001",
                "session": 1,
                "window": 2,
                "slot": 3,
            },
        }
    )
    parsed = parse_station_jsonl("\n" + line + "\n")
    assert not parsed.errors and len(parsed.frames) == 1
    frame = parsed.frames[0]
    assert frame.station_eui == "0016C001F0ABCDEF" and frame.data == SAVED_REPLAY_PACKET
    assert frame.lp0_version == 5 and frame.source_eui == "0016C001F0100001"
    assert unwrap(frame.data, CREDENTIALS).payload == THREE_RECORDS
    assert (
        station_eui_from_name("LOG_3/0016c001f0abcdef_1791795031_002.jsonl") == "0016C001F0ABCDEF"
    )


# Three stored short positions of 21 bytes, the OpenCollar wiki's port 29 example as Protect's
# decoder tests keep it (tests/fixtures/payloads/opencollar/uplinks.jsonl there)
FLASH = bytes.fromhex(
    "0D930E3C636865FCA10D1F7D160E030C00436368650D930EF9636865ABA50D1F8E090E031500006468650D930EBA"
    "64686536A30D1F0D140E031300C2646865"
)


def test_a_frame_is_opened_and_read_through_protects_shared_decode_path():
    """Protect's phase 43 P6: the two calls Field makes for every line of a card, the same two
    the server's pipeline makes, so the readings cannot differ."""
    from datetime import UTC, datetime

    from protect_field.decoding import (
        FrameRefused,
        OpenCollarDriver,
        decode_station_frame,
        unwrap_station_frame,
    )

    phy = build_uplink(CREDENTIALS, 7, 29, FLASH)
    frame = unwrap_station_frame(
        phy,
        CREDENTIALS,
        device_name="SP100001",
        device_eui="0016C001F0100001",
        source_eui="0016C001F0100001",
        lp0_version=5,
        last_f_cnt=None,
    )
    assert (frame.f_port, frame.f_cnt, frame.dev_addr) == (29, 7, "26010203")
    records = decode_station_frame(
        OpenCollarDriver(),
        frame,
        document={"gatewayEui": "0016C001F0ABCDEF", "rxpk": {}},
        received_at=datetime(2026, 10, 12, 8, 50, 31, tzinfo=UTC),
        fallback_time=datetime(2026, 10, 17, tzinfo=UTC),
        firmware_version=None,
    )
    assert records.stored and len(records.positions) == 3
    try:
        unwrap_station_frame(
            phy,
            None,
            device_name="SP100001",
            device_eui=None,
            source_eui=None,
            lp0_version=None,
            last_f_cnt=None,
        )
    except FrameRefused as refused:
        assert "has no LP0 keys" in refused.message
    else:
        raise AssertionError("a frame without keys was opened")
