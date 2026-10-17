import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import type { Setup } from "@/api/client";

vi.mock("@/components/OverviewMap", () => ({ OverviewMap: () => <div data-testid="overview-map" /> }));
import { OverviewPage } from "@/pages/OverviewPage";

const SETUP: Setup = {
  server_url: "https://dev-protect.example.org",
  protect_version: "v2.9.0",
  email: "ranger@example.org",
  signed_in: true,
  token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
};

function renderPage(responses: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const key = Object.keys(responses).find((k) => url.includes(k));
      if (!key) return new Response("down", { status: 503 });
      return new Response(JSON.stringify(responses[key]), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OverviewPage setup={SETUP} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const BUNDLE = { present: false, project_id: null, project_name: null, generated_at: null, fetched_at: null, protect_version: null, server_url: null, devices: 0, stations: 0, entities: 0, trackers_with_keys: 0, credentials_included: false, stale: false, key_kept_in: null };
const UPLOADS = { cards: [], pending: 0, failed: 0 };
const HEALTH = { status: "ok", version: "v0.1.0", protect_revision: "8c0a6b6c52a8", decoders: ["opencollar"], data_dir: "/x/data" };

afterEach(() => vi.unstubAllGlobals());

test("shows the server, the account and the versions", async () => {
  renderPage({ "/api/health": HEALTH, "api.github.com": [{ tag_name: "v0.1.0", html_url: "", body: null }], "/api/bundle": BUNDLE, "/api/uploads": UPLOADS, "/api/cards": [] });
  expect(await screen.findByText("v0.1.0")).toBeInTheDocument();
  expect(screen.getByText("8c0a6b6")).toBeInTheDocument();
  expect(screen.getByText(/Connected to https:\/\/dev-protect.example.org/)).toBeInTheDocument();
  expect(screen.getByText(/Signed in as ranger@example.org/)).toBeInTheDocument();
  expect(screen.queryByText(/is available/)).not.toBeInTheDocument();
});

test("says when a newer release exists", async () => {
  renderPage({ "/api/health": HEALTH, "api.github.com": [{ tag_name: "v0.2.0", html_url: "", body: "- Cards read offline" }], "/api/bundle": BUNDLE, "/api/uploads": UPLOADS, "/api/cards": [] });
  expect(await screen.findByText(/Protect Go v0.2.0 is available; you have v0.1.0/)).toBeInTheDocument();
  expect(screen.getByText("- Cards read offline")).toBeInTheDocument();
});

test("keeps quiet when GitHub does not answer", async () => {
  renderPage({ "/api/health": HEALTH, "/api/bundle": BUNDLE, "/api/uploads": UPLOADS, "/api/cards": [] });
  expect(await screen.findByText("v0.1.0")).toBeInTheDocument();
  expect(screen.queryByText(/is available/)).not.toBeInTheDocument();
});
