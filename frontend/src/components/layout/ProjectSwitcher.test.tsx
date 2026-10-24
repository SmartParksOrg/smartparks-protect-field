import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { ProjectSwitcher } from "@/components/layout/ProjectSwitcher";

const BUNDLE = { present: true, project_id: "p1", project_name: "LP0", generated_at: null, fetched_at: "2026-10-24T08:00:00Z", protect_version: "v2.9.0", server_url: "https://dev-protect.example.org", devices: 4, stations: 3, entities: 4, trackers_with_keys: 1, credentials_included: true, stale: false, key_kept_in: "file" };
const LAPTOP = [
  { project_id: "p1", project_name: "LP0", fetched_at: "2026-10-24T08:00:00Z", stale: false, current: true, map_present: true, cards: 3 },
  { project_id: "p2", project_name: "Smart Parks - LP0", fetched_at: "2026-10-24T09:00:00Z", stale: false, current: false, map_present: false, cards: 1 },
];
const SERVER = [
  { id: "p1", name: "LP0", stations: 3 },
  { id: "p2", name: "Smart Parks - LP0", stations: 1 },
  { id: "p3", name: "Okonjima", stations: 2 },
  { id: "p4", name: "Cows", stations: 0 },
];
const MAP = { present: false, project_id: "p2", project_name: null, build: null, size_bytes: null, downloaded_at: null, west: null, south: null, east: null, north: null, max_zoom: null, server_state: null };

function renderSwitcher(posted: { url: string; body: unknown }[], signedIn = true, online: boolean | undefined = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      if (init?.method === "POST") {
        posted.push({ url, body: JSON.parse(String(init.body)) });
        const target = url.endsWith("/switch") ? LAPTOP[1] : SERVER[2];
        return json({ bundle: { ...BUNDLE, project_id: "project_id" in target ? target.project_id : target.id, project_name: "project_name" in target ? target.project_name : target.name }, map: MAP, frames_read_again: 0, cards_adopted: 0 });
      }
      if (url.endsWith("/api/bundle")) return json(BUNDLE);
      if (url.endsWith("/api/bundle/projects")) return json(LAPTOP);
      if (url.endsWith("/api/projects")) return json(SERVER);
      return new Response("down", { status: 503 });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProjectSwitcher signedIn={signedIn} online={online} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // cmdk scrolls the chosen item into view and watches its size; jsdom has neither
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

test("names the loaded project and switches to another on the laptop without the server", async () => {
  const posted: { url: string; body: unknown }[] = [];
  renderSwitcher(posted);
  const button = await screen.findByRole("combobox", { name: "Project" });
  await waitFor(() => expect(button).toHaveTextContent("LP0"));
  fireEvent.click(button);
  await screen.findByText("On this laptop");
  expect(screen.getByText("loaded")).toBeInTheDocument();
  // the server's projects with a station that are not on the laptop, the one without none
  await screen.findByText("Okonjima");
  expect(screen.queryByText("Cows")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Smart Parks - LP0"));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0].url).toContain("/api/bundle/switch");
  expect(posted[0].body).toEqual({ project_id: "p2" });
});

test("loads a project of the server that is not on the laptop yet", async () => {
  const posted: { url: string; body: unknown }[] = [];
  renderSwitcher(posted);
  fireEvent.click(await screen.findByRole("combobox", { name: "Project" }));
  fireEvent.click(await screen.findByText("Okonjima"));
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0].url).toContain("/api/bundle/fetch");
  expect(posted[0].body).toEqual({ project_id: "p3", project_name: "Okonjima" });
});

test("offline, only the laptop's projects are offered", async () => {
  const posted: { url: string; body: unknown }[] = [];
  renderSwitcher(posted, true, false);
  fireEvent.click(await screen.findByRole("combobox", { name: "Project" }));
  await screen.findByText("Smart Parks - LP0");
  expect(screen.getByText(/Offline: only the projects on this laptop/)).toBeInTheDocument();
  expect(screen.queryByText("Okonjima")).not.toBeInTheDocument();
});
