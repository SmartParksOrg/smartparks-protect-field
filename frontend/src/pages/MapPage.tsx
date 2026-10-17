import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { OfflineMap } from "@/components/OfflineMap";
import { Button } from "@/components/ui/button";

export interface MapState {
  present: boolean;
  project_id: string | null;
  project_name: string | null;
  build: string | null;
  size_bytes: number | null;
  downloaded_at: string | null;
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
  max_zoom: number | null;
  server_state: string | null;
}

/** The map of the project's area (decision D4): fetched with the project on the Load page
 * while online, drawn offline from then on. */
export function MapPage() {
  const { t } = useTranslation();
  const map = useQuery({ queryKey: queryKeys.map, queryFn: () => api<MapState>("/api/map") });
  const state = map.data;
  const dark = document.documentElement.classList.contains("dark");
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-primary">{t("Map")}</h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">{t("Back")}</Link>
        </Button>
      </div>
      {state?.present && state.west !== null && state.south !== null && state.east !== null && state.north !== null && (
        <>
          <OfflineMap bounds={{ west: state.west, south: state.south, east: state.east, north: state.north }} dark={dark} />
          <p className="text-xs text-muted-foreground">
            {t("{{project}}, map of {{build}}, {{size}} MB, down to zoom {{zoom}}. OpenStreetMap data built by Protomaps.", {
              project: state.project_name ?? state.project_id,
              build: state.build ?? t("unknown"),
              size: ((state.size_bytes ?? 0) / 1048576).toFixed(1),
              zoom: state.max_zoom ?? "",
            })}
          </p>
        </>
      )}
      {!state?.present && (
        <Callout kind="info">
          {t("No map on this laptop yet. Load the project while you are online; the map comes with it.")}{" "}
          <Link className="underline underline-offset-4" to="/load">
            {t("Load a project")}
          </Link>
        </Callout>
      )}
    </main>
  );
}
