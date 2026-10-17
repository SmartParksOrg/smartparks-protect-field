import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { LoadPage } from "@/pages/LoadPage";

const EMPTY = { present: false, project_id: null, project_name: null, generated_at: null, fetched_at: null, protect_version: null, server_url: null, devices: 0, stations: 0, entities: 0, trackers_with_keys: 0, credentials_included: false, stale: false, key_kept_in: null };
const LOADED = { ...EMPTY, present: true, project_id: "p1", project_name: "LP0", fetched_at: new Date().toISOString(), protect_version: "v2.9.0", server_url: "https://dev-protect.example.org", devices: 4, stations: 3, entities: 4, trackers_with_keys: 1, credentials_included: true, key_kept_in: "file" };
const MAP = { present: true, project_id: "p1", project_name: "LP0", build: "20261017", size_bytes: 505370, downloaded_at: null, west: -10.9, south: 7.7, east: -10.8, north: 7.8, max_zoom: 14, server_state: null };

function renderPage(responses: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const key = Object.keys(responses).find((k) => url.endsWith(k));
      if (!key) return new Response("down", { status: 503 });
      return new Response(JSON.stringify(responses[key]), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LoadPage signedIn />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

test("loads the chosen project and says what came", async () => {
  renderPage({ "/api/bundle": EMPTY, "/api/projects": [{ id: "p1", name: "LP0" }], "/api/bundle/fetch": { bundle: LOADED, map: MAP } });
  await screen.findByRole("option", { name: "LP0" });
  fireEvent.click(screen.getByRole("button", { name: "Load the project" }));
  await waitFor(() => expect(screen.getByText(/LP0 loaded: 4 devices, 3 stations, 4 entities, keys for 1 trackers/)).toBeInTheDocument());
  expect(screen.getByText(/The map came too \(0\.5 MB\)/)).toBeInTheDocument();
  expect(screen.getByText(/key file only your account can read/)).toBeInTheDocument();
});

test("warns about a stale bundle", async () => {
  renderPage({ "/api/bundle": { ...LOADED, stale: true }, "/api/projects": [{ id: "p1", name: "LP0" }] });
  expect(await screen.findByText(/older than a week/)).toBeInTheDocument();
});
