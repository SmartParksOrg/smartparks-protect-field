import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { ExplorePage } from "@/pages/ExplorePage";

vi.mock("@/components/OfflineMap", () => ({
  OfflineMap: ({ bounds, points }: { bounds: { west: number }; points: unknown[] }) => <div data-testid="map">west {bounds.west}, {points.length} points</div>,
}));
vi.mock("@/components/explore/ExploreChart", () => ({
  ExploreChart: ({ series }: { series: { name: string; data: number[][] }[] }) => <div data-testid="chart">{series.map((s) => `${s.name}:${s.data.length}`).join(" ")}</div>,
}));

const MAP = { present: true, project_id: "p1", project_name: "LP0", build: "20261015", size_bytes: 31457280, downloaded_at: null, west: -11.0, south: 7.6, east: -10.8, north: 7.9, max_zoom: 14, server_state: null };
const TRACKER = { device_id: "d1", device_name: "SP100001", entity_id: "e1", positions: 2, measurements: 3, first_time: "2026-10-01T00:00:00Z", last_time: "2026-10-15T00:00:00Z", last_lat: 7.7, last_lon: -10.9 };

function renderPage(responses: Record<string, unknown>, route = "/explore") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const path = url.replace(/\?.*$/, "");
      const key = Object.keys(responses).find((k) => path.endsWith(k));
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

test("draws the tracks on the map and the first measurement as a graph (D21)", async () => {
  renderPage({
    "/api/map": MAP,
    "/api/trackers": [TRACKER],
    "/api/positions": [
      { device_id: "d1", entity_id: "e1", time: "2026-10-15T00:00:00Z", lat: 7.7, lon: -10.9 },
      { device_id: "d1", entity_id: "e1", time: "2026-10-14T00:00:00Z", lat: 7.71, lon: -10.91 },
    ],
    "/api/bundle/metrics": [{ key: "battery_mv", label: "Battery", unit: "mV", value_type: "int", category: "power", description: null }],
    "/metrics": [{ metric: "battery_mv", count: 3, first_time: "2026-10-01T00:00:00Z", last_time: "2026-10-15T00:00:00Z", latest: 4011 }],
    "/measurements": [
      { time: "2026-10-15T00:00:00Z", value: 4011 },
      { time: "2026-10-14T00:00:00Z", value: 4020 },
    ],
  });
  expect(await screen.findByText(/west -10\.9/)).toBeInTheDocument();
  expect(await screen.findByText(/2 positions/)).toBeInTheDocument();
  expect(await screen.findByTestId("chart")).toHaveTextContent("SP100001:2");
  expect(screen.getByRole("button", { name: "SP100001" })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByRole("button", { name: "Battery (mV)" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("4,011")).toBeInTheDocument();
});

test("points to the Files page when nothing was read yet", async () => {
  renderPage({ "/api/map": MAP, "/api/trackers": [], "/api/bundle/metrics": [] });
  expect(await screen.findByText(/No data on this laptop yet/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Files" })).toHaveAttribute("href", "/files");
});
