import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, send } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { OfflineMap } from "@/components/OfflineMap";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

interface Project {
  id: string;
  name: string;
}

/** The map of the project's area (decision D4): fetched from the server while online, drawn
 * offline from then on. Without one yet, the page lists the account's projects and fetches the
 * map of the chosen one; a server that has not cut it yet is asked to, and the page says so. */
export function MapPage({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const map = useQuery({ queryKey: queryKeys.map, queryFn: () => api<MapState>("/api/map") });
  const projects = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api<Project[]>("/api/projects"),
    enabled: signedIn,
  });
  const [choice, setChoice] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const fetchMap = useMutation({
    mutationFn: (project: Project) =>
      send<MapState>("POST", "/api/map/fetch", { project_id: project.id, project_name: project.name }),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKeys.map, state);
      setNotice(state.server_state);
    },
  });
  const chosen = projects.data?.find((p) => p.id === choice) ?? projects.data?.[0];
  const dark = document.documentElement.classList.contains("dark");
  const state = map.data;
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
      <Card>
        <CardHeader>
          <CardTitle>{state?.present ? t("A fresh map") : t("No map on this laptop yet")}</CardTitle>
          <CardDescription>
            {t("While you are online, fetch the map of the project's area from the server. It is then drawn here without a connection.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {!signedIn && (
            <Callout kind="info">
              {t("Sign in first; the map comes from the server you are signed in to.")}{" "}
              <Link className="underline underline-offset-4" to="/sign-in">
                {t("Sign in")}
              </Link>
            </Callout>
          )}
          {signedIn && projects.isError && <Callout kind="error">{projects.error.message}</Callout>}
          {signedIn && projects.data && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="project">
                {t("Project")}
              </label>
              <select
                id="project"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={chosen?.id ?? ""}
                onChange={(event) => setChoice(event.target.value)}
              >
                {projects.data.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" disabled={!chosen || fetchMap.isPending} onClick={() => chosen && fetchMap.mutate(chosen)}>
                {fetchMap.isPending ? t("Fetching the map") : t("Fetch the map")}
              </Button>
            </div>
          )}
          {notice && <Callout kind="info">{notice}</Callout>}
          {fetchMap.isError && <Callout kind="error">{fetchMap.error.message}</Callout>}
        </CardContent>
      </Card>
    </main>
  );
}
