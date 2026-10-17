import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import { HomePage } from "@/pages/HomePage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HomePage />
    </QueryClientProvider>,
  );
}

test("shows the versions the local server reports", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({ status: "ok", version: "v0.0.0-dev", protect_revision: "2755c929035d", data_dir: "/x/data" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  renderPage();
  expect(await screen.findByText("v0.0.0-dev")).toBeInTheDocument();
  expect(screen.getByText("2755c92")).toBeInTheDocument();
  vi.unstubAllGlobals();
});

test("says so when the local server does not answer", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
  renderPage();
  expect(await screen.findByRole("alert")).toHaveTextContent("does not answer");
  vi.unstubAllGlobals();
});
