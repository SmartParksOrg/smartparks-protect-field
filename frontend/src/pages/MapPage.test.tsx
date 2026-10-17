import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { MapPage } from "@/pages/MapPage";

vi.mock("@/components/OfflineMap", () => ({
  OfflineMap: ({ bounds }: { bounds: { west: number } }) => <div data-testid="map">west {bounds.west}</div>,
}));

const ABSENT = { present: false, project_id: null, project_name: null, build: null, size_bytes: null, downloaded_at: null, west: null, south: null, east: null, north: null, max_zoom: null, server_state: null };
const PRESENT = { ...ABSENT, present: true, project_id: "p1", project_name: "LP0", build: "20261015", size_bytes: 31457280, west: -11.0, south: 7.6, east: -10.8, north: 7.9, max_zoom: 14 };

function renderPage(responses: Record<string, unknown>) {
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
      <MemoryRouter>
        <MapPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

test("draws the map that is on the laptop", async () => {
  renderPage({ "/api/map": PRESENT, "/api/trackers": [{ device_id: "d1", device_name: "SP100001", entity_id: "e1", positions: 3, measurements: 10, first_time: "2026-10-01T00:00:00Z", last_time: "2026-10-15T00:00:00Z", last_lat: 7.7, last_lon: -10.9 }], "/api/positions": [{ device_id: "d1", entity_id: "e1", time: "2026-10-15T00:00:00Z", lat: 7.7, lon: -10.9 }] });
  // the map first opens on the map file's bounds, then on the positions once they arrive
  expect(await screen.findByText(/west -10\.90/)).toBeInTheDocument();
  expect(screen.getByText(/LP0, map of 20261015, 30.0 MB, down to zoom 14/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "SP100001" })).toHaveAttribute("href", "/trackers/d1");
  expect(screen.getByText("1 positions")).toBeInTheDocument();
});

test("points to the Load page when there is no map", async () => {
  renderPage({ "/api/map": ABSENT, "/api/trackers": [], "/api/positions": [] });
  expect(await screen.findByText(/No map on this laptop yet/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Load a project" })).toHaveAttribute("href", "/load");
});
