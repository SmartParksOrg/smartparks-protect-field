import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { FilesPage } from "@/pages/FilesPage";

const BUNDLE = { present: true, project_id: "p1", project_name: "LP0", generated_at: null, fetched_at: null, protect_version: null, server_url: null, devices: 4, stations: 3, entities: 4, trackers_with_keys: 4, credentials_included: true, stale: false, key_kept_in: "file" };
const CARD = { id: "c1", name: "card.zip", imported_at: "2026-10-17T12:00:00Z", station_eui: "0016C001F0500101", station_device_id: "d2", station_name: "Station 1", files: 2, lines: 5, frames: 4, decoded: 1, repeated: 1, refused: 1, unknown: 1, line_errors: 1, positions: 3, measurements: 0, states: 0, events: 0, skipped: [] };

function renderPage(responses: Record<string, (init?: RequestInit) => unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const key = Object.keys(responses).find((k) => url.endsWith(k));
      if (!key) return new Response("down", { status: 503 });
      return new Response(JSON.stringify(responses[key](init)), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FilesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

test("lists the cards read and reads a dropped zip", async () => {
  let posted = false;
  renderPage({
    "/api/bundle": () => BUNDLE,
    "/api/cards": (init) => {
      if (init?.method === "POST") {
        posted = true;
        return { ...CARD, id: "c2", name: "LOG_1" };
      }
      return [CARD];
    },
  });
  expect(await screen.findByRole("link", { name: "card.zip" })).toHaveAttribute("href", "/files/c1");
  expect(screen.getByText("Station 1")).toBeInTheDocument();
  const zone = screen.getByRole("region", { name: "Drop the files here" });
  const file = new File(["x"], "card.zip", { type: "application/zip" });
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/LOG_1 read: 4 frames, 1 decoded, 3 new positions/)).toBeInTheDocument());
  expect(posted).toBe(true);
});

test("asks for a project first when none is loaded", async () => {
  renderPage({ "/api/bundle": () => ({ ...BUNDLE, present: false }), "/api/cards": () => [] });
  expect(await screen.findByText(/Load a project first/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pick the card's folder" })).toBeDisabled();
});
