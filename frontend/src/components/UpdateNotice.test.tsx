import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UpdateNotice } from "@/components/UpdateNotice";

const release = [{ tag_name: "v0.9.0", html_url: "https://example.org", body: "Notes" }];

function renderNotice() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UpdateNotice currentVersion="v0.8.0" />
    </QueryClientProvider>,
  );
}

describe("UpdateNotice", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(release), { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.protectGo;
  });

  it("leads to the download page where the app cannot update itself", async () => {
    renderNotice();
    expect(await screen.findByText("Download the new version")).toBeInTheDocument();
  });

  it("offers the download and then the restart inside a self-updating shell (D17)", async () => {
    let handler: ((status: unknown) => void) | undefined;
    const downloadUpdate = vi.fn(async () => undefined);
    window.protectGo = {
      getVersion: async () => "0.8.0",
      getPlatform: async () => "win32",
      openExternal: async () => undefined,
      onMenuCommand: () => () => undefined,
      updateStatus: async () => ({ state: "available" as const, version: "0.9.0" }),
      onUpdateStatus: (h: (status: never) => void) => {
        handler = h as (status: unknown) => void;
        return () => undefined;
      },
      downloadUpdate,
      installUpdate: async () => undefined,
    };
    renderNotice();
    const button = await screen.findByText("Download and install");
    button.click();
    expect(downloadUpdate).toHaveBeenCalled();
    handler?.({ state: "downloading", percent: 40 });
    expect(await screen.findByText("Downloading the new version, 40%")).toBeInTheDocument();
    handler?.({ state: "downloaded", version: "0.9.0" });
    expect(await screen.findByText("Restart to update")).toBeInTheDocument();
  });
});
