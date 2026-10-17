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
