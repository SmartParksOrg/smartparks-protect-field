import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { stationRows, trackerRows } from "@/lib/entities";
import { TrackersPage } from "@/pages/TrackersPage";

const DEVICES = [
  { id: "d1", name: "SP100001", serial_number: "SP100001", dev_eui: "0016C001F0100001", device_type_label: "CollarEdge", driver_key: "opencollar", status: "active", firmware_version: "8.1", entity_id: "e1", entity_name: "Pygmy hippo Nyama", is_station: false, has_address: true, has_keys: true },
  { id: "s1", name: "SP050101", serial_number: "SP050101", dev_eui: "0016C001F0500101", device_type_label: "RangerEdge", driver_key: "opencollar", status: "active", entity_id: "e2", entity_name: "Station SP050101", firmware_version: "8.1", is_station: true, has_address: true, has_keys: true },
];
const TRACKERS = [
  { device_id: "d1", device_name: "SP100001", entity_id: "e1", positions: 12, measurements: 30, first_time: "2026-10-01T00:00:00Z", last_time: "2026-10-15T00:00:00Z", last_lat: 7.7, last_lon: -10.9 },
  { device_id: "d9", device_name: "SP100009", entity_id: null, positions: 1, measurements: 0, first_time: "2026-10-02T00:00:00Z", last_time: "2026-10-02T00:00:00Z", last_lat: 7.7, last_lon: -10.9 },
];

test("the tracker rows join the bundle's trackers with the files' and leave the stations out", () => {
  const rows = trackerRows(DEVICES, TRACKERS);
  expect(rows.map((r) => r.name)).toEqual(["SP100001", "SP100009"]);
  expect(rows[0]).toMatchObject({ positions: 12, entity_name: "Pygmy hippo Nyama", known_to_bundle: true });
  expect(rows[1]).toMatchObject({ positions: 1, known_to_bundle: false });
});

test("the station rows take the device id as key when known, else the EUI", () => {
  const rows = stationRows(
    [{ device_id: "s1", name: "Station SP050101", station_eui: "0016C001F0500101", lat: 7.76, lon: -10.89 }],
    [
      { station_eui: "0016c001f0500101", station_device_id: "s1", station_name: "Station SP050101", cards: 2, files: 28, frames: 500, pending: 3, failed: 1, uploaded: 24, duplicate: 0, last_read: "2026-10-17T10:00:00Z" },
      { station_eui: "0016C001F0500109", station_device_id: null, station_name: null, cards: 1, files: 2, frames: 9, pending: 2, failed: 0, uploaded: 0, duplicate: 0, last_read: "2026-10-17T11:00:00Z" },
    ],
  );
  expect(rows.map((r) => [r.key, r.files, r.pending, r.known_to_bundle])).toEqual([
    ["0016C001F0500109", 2, 2, false],
    ["s1", 28, 4, true],
  ]);
});

test("the Trackers page lists each tracker as a link to its page", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const path = String(input).replace(/\?.*$/, "");
      const body = path.endsWith("/api/bundle/devices") ? DEVICES : path.endsWith("/api/trackers") ? TRACKERS : null;
      return body ? new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }) : new Response("down", { status: 503 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TrackersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const links = await screen.findAllByRole("link", { name: "SP100001" });
  expect(links[0]).toHaveAttribute("href", "/trackers/d1");
  vi.unstubAllGlobals();
});
