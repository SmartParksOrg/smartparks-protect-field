import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, PanelLeftOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import {
  api,
  send,
  type Bundle,
  type Connection,
  type Setup,
} from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import logoLandscape from "@/assets/brand/logo-landscape.webp";
import { ProjectSwitcher } from "@/components/layout/ProjectSwitcher";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeSwitch } from "@/components/layout/ThemeSwitch";
import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLayoutStore } from "@/stores/layout";

/**
 * The shell, after Protect's (decision D13): a fixed sidebar from 1024 px and a drawer below,
 * one viewport high with the main area scrolling, so the map page takes the full height with
 * `flex-1`. The top bar carries the landscape logo with the product name and the project
 * switcher (decision D33, as Protect's top bar) on the left and the theme switch and the
 * connection dot on the right; below `sm` the product name gives way to the switcher, which
 * truncates. The dot follows the live state (decision
 * D18): green when the server answers and the sign-in holds, amber when it answers without a
 * sign-in, grey when it does not answer, the words in its title.
 */
export function AppLayout({ setup }: { setup: Setup }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const sidebarHidden = useLayoutStore((s) => s.sidebarHidden);
  const setSidebarHidden = useLayoutStore((s) => s.setSidebarHidden);
  const bundle = useQuery({
    queryKey: queryKeys.bundle,
    queryFn: () => api<Bundle>("/api/bundle"),
  });
  const connection = useQuery({
    queryKey: queryKeys.connection,
    queryFn: () => api<Connection>("/api/setup/connection"),
    refetchInterval: 60_000,
    retry: false,
  });
  // the project followed the server (decision D28): every page reads the new bundle, and a line
  // says so until it is dismissed
  const updatedAt = connection.data?.bundle_updated_at ?? null;
  // the map the server was still cutting at the load came by itself (D32): the maps redraw
  const mapUpdatedAt = connection.data?.map_updated_at ?? null;
  const lastMapUpdate = useRef<string | null>(null);
  useEffect(() => {
    if (!mapUpdatedAt || mapUpdatedAt === lastMapUpdate.current) return;
    lastMapUpdate.current = mapUpdatedAt;
    void queryClient.invalidateQueries({ queryKey: queryKeys.map });
    void queryClient.invalidateQueries({ queryKey: queryKeys.laptopProjects });
  }, [mapUpdatedAt, queryClient]);
  // the background sync ran through (D34): the projects on the laptop and their maps may
  // have changed, so the switcher and the maps read again
  const syncedAt = connection.data?.projects_synced_at ?? null;
  const lastSync = useRef<string | null>(null);
  useEffect(() => {
    if (!syncedAt || syncedAt === lastSync.current) return;
    lastSync.current = syncedAt;
    void queryClient.invalidateQueries({ queryKey: queryKeys.laptopProjects });
    void queryClient.invalidateQueries({ queryKey: queryKeys.map });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bundle });
  }, [syncedAt, queryClient]);
  const [seenUpdate, setSeenUpdate] = useState<string | null>(() => {
    try {
      return localStorage.getItem("protect-go-seen-bundle-update");
    } catch {
      return null;
    }
  });
  const lastUpdate = useRef<string | null>(null);
  useEffect(() => {
    if (!updatedAt || updatedAt === lastUpdate.current) return;
    lastUpdate.current = updatedAt;
    void queryClient.invalidateQueries({ queryKey: queryKeys.bundle });
    void queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    void queryClient.invalidateQueries({ queryKey: queryKeys.stations });
    void queryClient.invalidateQueries({ queryKey: queryKeys.trackers });
    void queryClient.invalidateQueries({ queryKey: queryKeys.unknownTrackers });
    void queryClient.invalidateQueries({ queryKey: queryKeys.cards });
    void queryClient.invalidateQueries({ queryKey: queryKeys.map });
  }, [updatedAt, queryClient]);
  const dismissUpdate = () => {
    setSeenUpdate(updatedAt);
    try {
      if (updatedAt)
        localStorage.setItem("protect-go-seen-bundle-update", updatedAt);
    } catch {
      // nothing to remember without storage
    }
  };
  const online = connection.data?.online;
  const held = setup.signed_in && connection.data?.account_ok !== false;
  const dotWords =
    online === undefined
      ? setup.signed_in
        ? t("Signed in to {{server}}", { server: setup.server_url })
        : t("Not signed in to {{server}}", { server: setup.server_url })
      : !online
        ? t("{{server}} does not answer", { server: setup.server_url })
        : held
          ? t("Online, signed in to {{server}}", { server: setup.server_url })
          : t("Online, not signed in to {{server}}", {
              server: setup.server_url,
            });
  const dotColour =
    online === false
      ? "bg-muted-foreground/40"
      : online && held
        ? "bg-emerald-500"
        : online
          ? "bg-amber-500"
          : setup.signed_in
            ? "bg-emerald-500"
            : "bg-muted-foreground/40";
  const signOut = useMutation({
    mutationFn: () => send<Setup>("DELETE", "/api/session"),
    onSuccess: (next) => queryClient.setQueryData(queryKeys.setup, next),
  });
  const sidebar = (onNavigate?: () => void, collapsible = false) => (
    <Sidebar
      email={setup.email}
      hasBundle={bundle.data?.present === true}
      onNavigate={onNavigate}
      onSignOut={setup.email ? () => signOut.mutate() : undefined}
      collapsible={collapsible}
      onCollapse={() => setSidebarHidden(true)}
    />
  );
  return (
    <div className="flex h-dvh">
      <aside
        className={`hidden w-64 shrink-0 border-r bg-card ${sidebarHidden ? "" : "lg:block"}`}
      >
        <div className="h-full">{sidebar(undefined, true)}</div>
      </aside>
      {sidebarHidden && (
        <div className="hidden w-10 shrink-0 flex-col items-center border-r bg-card py-2 lg:flex">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("Show navigation")}
            title={t("Show navigation")}
            onClick={() => setSidebarHidden(false)}
          >
            <PanelLeftOpen className="size-5" />
          </Button>
        </div>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">{t("Navigation")}</SheetTitle>
          {sidebar(() => setOpen(false))}
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b bg-card px-2 py-1 sm:gap-2 sm:px-3 sm:py-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 sm:size-9 lg:hidden"
            aria-label={t("Open navigation")}
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <img
            src={logoLandscape}
            alt=""
            className="h-6 w-auto shrink-0 sm:h-7"
          />
          <span className="hidden min-w-0 truncate text-sm font-medium whitespace-nowrap sm:inline sm:text-base">
            {t("Protect Go")}
          </span>
          <ProjectSwitcher
            signedIn={setup.signed_in}
            online={connection.data?.online}
            className="h-8 min-w-0 flex-1 sm:ml-2 sm:h-9 sm:max-w-xs sm:flex-none"
          />
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeSwitch className="size-8 sm:size-9" />
            <span
              role="status"
              aria-label={dotWords}
              title={dotWords}
              className={`mx-2 inline-block size-2.5 rounded-full ${dotColour}`}
            />
          </span>
        </header>
        {updatedAt && updatedAt !== seenUpdate && (
          <div className="px-4 pt-3">
            <Callout kind="info">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {connection.data?.frames_read_again
                    ? t(
                        "The project changed on the server and was loaded again at {{time}}; {{count}} frames of trackers unknown before were read.",
                        {
                          time: formatTime(updatedAt),
                          count: connection.data.frames_read_again,
                        },
                      )
                    : t(
                        "The project changed on the server and was loaded again at {{time}}.",
                        { time: formatTime(updatedAt) },
                      )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={dismissUpdate}
                >
                  {t("Dismiss")}
                </Button>
              </span>
            </Callout>
          </div>
        )}
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
