import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, PanelLeftOpen } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";

import { api, send, type Bundle, type Setup } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import logoLandscape from "@/assets/brand/logo-landscape.webp";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeSwitch } from "@/components/layout/ThemeSwitch";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLayoutStore } from "@/stores/layout";

/**
 * The shell, after Protect's (decision D13): a fixed sidebar from 1024 px and a drawer below,
 * one viewport high with the main area scrolling, so the map page takes the full height with
 * `flex-1`. The top bar carries the landscape logo with the product name on the left and the
 * theme switch and the connection dot on the right. The dot is green when signed in to the
 * server, grey otherwise, with the server's address as its title.
 */
export function AppLayout({ setup }: { setup: Setup }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const sidebarHidden = useLayoutStore((s) => s.sidebarHidden);
  const setSidebarHidden = useLayoutStore((s) => s.setSidebarHidden);
  const bundle = useQuery({ queryKey: queryKeys.bundle, queryFn: () => api<Bundle>("/api/bundle") });
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
      <aside className={`hidden w-64 shrink-0 border-r bg-card ${sidebarHidden ? "" : "lg:block"}`}>
        <div className="h-full">{sidebar(undefined, true)}</div>
      </aside>
      {sidebarHidden && (
        <div className="hidden w-10 shrink-0 flex-col items-center border-r bg-card py-2 lg:flex">
          <Button variant="ghost" size="icon" aria-label={t("Show navigation")} title={t("Show navigation")} onClick={() => setSidebarHidden(false)}>
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
          <Button variant="ghost" size="icon" className="size-8 shrink-0 sm:size-9 lg:hidden" aria-label={t("Open navigation")} onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <img src={logoLandscape} alt="" className="h-6 w-auto shrink-0 sm:h-7" />
          <span className="min-w-0 truncate text-sm font-medium whitespace-nowrap sm:text-base">{t("Protect Go")}</span>
          {bundle.data?.present && (
            <span className="hidden min-w-0 truncate text-sm text-muted-foreground sm:inline">· {bundle.data.project_name}</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeSwitch className="size-8 sm:size-9" />
            <span
              role="status"
              aria-label={setup.signed_in ? t("Signed in to {{server}}", { server: setup.server_url }) : t("Not signed in to {{server}}", { server: setup.server_url })}
              title={setup.signed_in ? t("Signed in to {{server}}", { server: setup.server_url }) : t("Not signed in to {{server}}", { server: setup.server_url })}
              className={`mx-2 inline-block size-2.5 rounded-full ${setup.signed_in ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
            />
          </span>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
