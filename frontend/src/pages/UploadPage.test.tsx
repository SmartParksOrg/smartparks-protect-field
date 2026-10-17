import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { UploadPage } from "@/pages/UploadPage";

const CARD = { card_id: "c1", name: "SP050101-card.zip", station_name: "Station SP050101", station_eui: "0016C001F0500101", station_device_id: "d2", imported_at: "2026-10-17T12:00:00Z", files: 31, pending: 31, uploaded: 0, duplicate: 0, refused: 0, failed: 0, last_uploaded_at: null, last_problem: null };

function renderPage(responses: Record<string, (init?: RequestInit) => unknown>, signedIn = true) {
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
        <UploadPage signedIn={signedIn} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

test("sends what waits and relays the server's answers", async () => {
  const after = { cards: [{ ...CARD, pending: 0, uploaded: 1, duplicate: 30 }], pending: 0, failed: 0 };
  renderPage({
    "/api/uploads": () => ({ cards: [CARD], pending: 31, failed: 0 }),
    "/api/uploads/run": () => ({ attempted: 31, uploaded: 1, duplicate: 30, refused: 0, failed: 0, skipped_no_station: 0, stopped: null, state: after }),
  });
  expect(await screen.findByText("31 files wait to go up")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Upload everything that waits" }));
  await waitFor(() => expect(screen.getByText(/31 files sent: 1 taken by the server, 30 it had already/)).toBeInTheDocument());
  expect(screen.getByText("Nothing waits to go up")).toBeInTheDocument();
});

test("says when the run stopped on an expired sign-in", async () => {
  renderPage({
    "/api/uploads": () => ({ cards: [CARD], pending: 31, failed: 0 }),
    "/api/uploads/run": () => ({ attempted: 1, uploaded: 0, duplicate: 0, refused: 0, failed: 1, skipped_no_station: 0, stopped: "The sign-in has expired; sign in again and upload again", state: { cards: [{ ...CARD, pending: 30, failed: 1 }], pending: 30, failed: 1 } }),
  });
  await screen.findByText("31 files wait to go up");
  fireEvent.click(screen.getByRole("button", { name: "Upload everything that waits" }));
  await waitFor(() => expect(screen.getByText(/The sign-in has expired/)).toBeInTheDocument());
  expect(screen.getAllByRole("link", { name: "Sign in" }).length).toBeGreaterThan(0);
});
