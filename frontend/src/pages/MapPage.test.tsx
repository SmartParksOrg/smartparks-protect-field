import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { MapPage } from "@/pages/MapPage";

vi.mock("@/components/OfflineMap", () => ({
  OfflineMap: ({ bounds }: { bounds: { west: number } }) => <div data-testid="map">west {bounds.west}</div>,
}));

const ABSENT = { present: false, project_id: null, project_name: null, build: null, size_bytes: null, downloaded_at: null, west: null, south: null, east: null, north: null, max_zoom: null, server_state: null };
const PRESENT = { ...ABSENT, present: true, project_id: "p1", project_name: "LP0", build: "20261015", size_bytes: 31457280, west: -11.0, south: 7.6, east: -10.8, north: 7.9, max_zoom: 14 };

function renderPage(responses: Record<string, unknown>, signedIn = true) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      const key = Object.keys(responses).find((k) => url.endsWith(k));
      if (!key) return new Response("down", { status: 503 });
      return new Response(JSON.stringify(responses[key]), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MapPage signedIn={signedIn} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

test("draws the map that is on the laptop", async () => {
  renderPage({ "/api/map": PRESENT, "/api/projects": [{ id: "p1", name: "LP0" }] });
  expect(await screen.findByTestId("map")).toHaveTextContent("west -11");
  expect(screen.getByText(/LP0, map of 20261015, 30.0 MB, down to zoom 14/)).toBeInTheDocument();
});

test("fetches the chosen project's map and relays what the server said", async () => {
  const calls = renderPage({
    "/api/map": ABSENT,
    "/api/projects": [{ id: "p1", name: "LP0" }, { id: "p2", name: "Gola" }],
    "/api/map/fetch": { ...ABSENT, server_state: "The server is making the map (queued); try again in a few minutes" },
  });
  expect(await screen.findByText("No map on this laptop yet")).toBeInTheDocument();
  await screen.findByRole("option", { name: "Gola" });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "p2" } });
  fireEvent.click(screen.getByRole("button", { name: "Fetch the map" }));
  await waitFor(() => expect(screen.getByText(/making the map/)).toBeInTheDocument());
  expect(calls.some((c) => c.startsWith("POST") && c.endsWith("/api/map/fetch"))).toBe(true);
});

test("asks to sign in first when not signed in", async () => {
  renderPage({ "/api/map": ABSENT }, false);
  expect(await screen.findByText(/Sign in first/)).toBeInTheDocument();
});
