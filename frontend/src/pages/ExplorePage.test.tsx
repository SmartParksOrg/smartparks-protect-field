import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { ExplorePage } from "@/pages/ExplorePage";

vi.mock("@/components/explore/ExploreMap", () => ({
  ExploreMap: ({ tracks, stations }: { tracks: { name: string; times: string[] }[]; stations: unknown[] }) => (
    <div data-testid="map">
      {tracks.map((tr) => `${tr.name}:${tr.times.length}`).join(" ")} · {stations.length} stations
    </div>
  ),
}));
vi.mock("@/components/explore/ExploreChart", () => ({
  ExploreChart: ({ groups }: { groups: { label: string; unit: string | null; series: { name: string; data: number[][] }[] }[] }) => (
    <div data-testid="chart">{groups.map((g) => `${g.label}(${g.unit ?? ""}) ${g.series.map((s) => `${s.name}:${s.data.length}`).join(" ")}`).join(" | ")}</div>
  ),
}));

const TRACKER = { device_id: "d1", device_name: "SP100001", entity_id: "e1", positions: 2, measurements: 3, first_time: "2026-10-01T00:00:00Z", last_time: "2026-10-15T00:00:00Z", last_lat: 7.7, last_lon: -10.9 };
const ROWS = [
  { time: "2026-10-15T00:00:00Z", device_id: "d1", device_name: "SP100001", entity_id: "e1", lat: 7.7, lon: -10.9, values: { battery_voltage: 4.011 } },
  { time: "2026-10-14T00:00:00Z", device_id: "d1", device_name: "SP100001", entity_id: "e1", lat: 7.71, lon: -10.91, values: { battery_voltage: 4.02 } },
  { time: "2026-10-13T12:00:00Z", device_id: "d1", device_name: "SP100001", entity_id: "e1", lat: null, lon: null, values: { battery_voltage: 4.03 } },
];
const RESPONSES: Record<string, unknown> = {
  "/api/trackers": [TRACKER],
  "/api/bundle/metrics": [{ key: "battery_voltage", label: "Battery voltage", unit: "V", value_type: "float", category: "power", description: null }],
  "/api/bundle/stations": [{ device_id: "s1", name: "Station SP050101", station_eui: "0016C001F0500101", lat: 7.76, lon: -10.89 }],
  "/api/records/metrics": [{ key: "battery_voltage", count: 3 }],
  "/api/records": ROWS,
};

function renderPage(responses: Record<string, unknown>, route = "/explore") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const path = url.replace(/\?.*$/, "");
      const key = Object.keys(responses)
        .sort((a, b) => b.length - a.length)
        .find((k) => path.endsWith(k));
      if (!key) return new Response("down", { status: 503 });
      return new Response(JSON.stringify(responses[key]), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <ExplorePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

test("opens on the map with the tracks and the stations, the table in the drawer (D25)", async () => {
  renderPage(RESPONSES);
  expect(await screen.findByText("3 records")).toBeInTheDocument();
  expect(await screen.findByText(/SP100001:2 · 1 stations/)).toBeInTheDocument();
  // the drawer's table shows the rows with Protect's name and unit for the metric
  expect(screen.getAllByText("Battery voltage").length).toBeGreaterThan(0);
  expect(screen.getByRole("tab", { name: /Map/ })).toHaveAttribute("aria-selected", "true");
});

test("the chart draws the chosen metric as one line per tracker", async () => {
  renderPage(RESPONSES, "/explore?mode=chart");
  expect(await screen.findByTestId("chart")).toHaveTextContent("Battery voltage(V) SP100001:3");
});

test("points to the Files page when nothing was read yet", async () => {
  renderPage({ ...RESPONSES, "/api/trackers": [] });
  expect(await screen.findByText("No data on this laptop yet")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("href", "/files");
});
