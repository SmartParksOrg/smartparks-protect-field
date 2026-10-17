import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { FilesExplorer } from "@/components/files/FilesExplorer";

const FILE = { id: "f1", card_id: "c1", card_name: "SP050101-card.zip", station_name: "Station SP050101", station_eui: "0016C001F0500101", imported_at: new Date().toISOString(), name: "0016C001F0500101_1791795031.jsonl", folder: "LOG_1", size: 7000, lines: 13, frames: 12, errors: 0, upload_status: "pending", upload_answer: null, uploaded_at: null, decoded: 12, repeated: 0, refused: 0, unknown: 0, positions: 20, measurements: 300 };
const OTHER = { ...FILE, id: "f2", card_id: "c2", card_name: "SP050102-card.zip", name: "0016C001F0500102_1791795031.jsonl", upload_status: "duplicate", refused: 1 };

function renderExplorer(cardId: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/files")) return new Response(JSON.stringify([FILE, OTHER]), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/api/files/f1")) return new Response(JSON.stringify({ ...FILE, trackers: [{ device_id: "d1", device_name: "SP100001", frames: 12, decoded: 12, positions: 20 }], failures: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response("down", { status: 503 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FilesExplorer cardId={cardId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("lists one line per file, filters by SD card and opens a file's properties", async () => {
  renderExplorer(null);
  // the table and the phone card list are both in the document under jsdom
  expect((await screen.findAllByText("0016C001F0500101_1791795031.jsonl")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("0016C001F0500102_1791795031.jsonl").length).toBeGreaterThan(0);
  expect(screen.getAllByText("waiting to go up").length).toBeGreaterThan(0);
  expect(screen.getAllByText("server had it").length).toBeGreaterThan(0);
  fireEvent.click(screen.getAllByText("0016C001F0500101_1791795031.jsonl")[0]);
  await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  expect(await screen.findByRole("link", { name: "SP100001" })).toHaveAttribute("href", "/trackers/d1");
  expect(screen.getByRole("link", { name: "Open the SD card" })).toHaveAttribute("href", "/files/c1");
});

test("filters to one SD card and switches to tiles", async () => {
  renderExplorer("c2");
  expect((await screen.findAllByText("0016C001F0500102_1791795031.jsonl")).length).toBeGreaterThan(0);
  expect(screen.queryByText("0016C001F0500101_1791795031.jsonl")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tiles" }));
  expect(screen.getByRole("button", { name: "Tiles" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByText(/12 frames, 12 decoded, 20 positions, 1 not read/).length).toBeGreaterThan(0);
});
