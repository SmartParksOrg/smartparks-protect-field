import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, send, type Bundle, type LaptopProject, type LoadResult } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Project {
  id: string;
  name: string;
  stations: number;
}

/** Loading a project before leaving (decisions D2 and D11): one button fetches the project's
 * bundle (devices, entities, stations, the keys the account may see) and its map from the
 * server. The bundle is kept encrypted with a key in the laptop's keychain, or in a key file
 * where there is none; the page says which. */
export function LoadPage({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("Load a project")} description={t("Before you leave, while online: the project's devices, keys and map come to this laptop.")} />
      <Page>
        <LoadSection signedIn={signedIn} />
      </Page>
    </>
  );
}

/** The project's loading as the Server page shows it (Tim, 2026-10-17: a project belongs to
 * the server, so it is set up there, under the server and the account). */
export function LoadSection({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bundle = useQuery({ queryKey: queryKeys.bundle, queryFn: () => api<Bundle>("/api/bundle") });
  const laptop = useQuery({ queryKey: queryKeys.laptopProjects, queryFn: () => api<LaptopProject[]>("/api/bundle/projects") });
  const projects = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api<Project[]>("/api/projects"),
    enabled: signedIn,
  });
  const [choice, setChoice] = useState("");
  const [result, setResult] = useState<LoadResult | null>(null);
  // a project loaded or switched: every page reads the new one (D31)
  const settle = (loaded: LoadResult) => {
    queryClient.setQueryData(queryKeys.bundle, loaded.bundle);
    queryClient.setQueryData(queryKeys.map, loaded.map);
    void queryClient.invalidateQueries();
    setResult(loaded);
  };
  const load = useMutation({
    mutationFn: (project: Project) =>
      send<LoadResult>("POST", "/api/bundle/fetch", { project_id: project.id, project_name: project.name }),
    onSuccess: settle,
  });
  const switchTo = useMutation({
    mutationFn: (project: LaptopProject) => send<LoadResult>("POST", "/api/bundle/switch", { project_id: project.project_id }),
    onSuccess: settle,
  });
  const current = bundle.data;
  // only a project with an offload station has a card to read (Tim, 2026-10-17)
  const withStations = (projects.data ?? []).filter((p) => p.stations > 0);
  const without = (projects.data ?? []).length - withStations.length;
  const wanted = choice || current?.project_id || "";
  const chosen = withStations.find((p) => p.id === wanted) ?? withStations[0];
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("Before you leave, while online")}</CardTitle>
          <CardDescription>
            {t("The app fetches the project's devices, entities and stations, the LP0 keys your account may see, and the map of the area. Everything is kept on this laptop for the field; the keys are encrypted.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {!signedIn && (
            <Callout kind="info">
              {t("Sign in first; the project comes from the server you are signed in to.")}{" "}
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
                {withStations.map((project) => (
                  <option key={project.id} value={project.id}>
                    {t("{{name}} ({{count}} stations)", { name: project.name, count: project.stations })}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" disabled={!chosen || load.isPending} onClick={() => chosen && load.mutate(chosen)}>
                {load.isPending ? t("Loading the project") : t("Load the project")}
              </Button>
            </div>
          )}
          {signedIn && projects.data && withStations.length === 0 && (
            <Callout kind="warning">{t("None of your projects has an offload station yet; make one on Protect's Offload page first.")}</Callout>
          )}
          {signedIn && without > 0 && withStations.length > 0 && (
            <p className="text-xs text-muted-foreground">{t("{{count}} projects without an offload station are not offered.", { count: without })}</p>
          )}
          {load.isError && <Callout kind="error">{load.error.message}</Callout>}
          {result && (
            <Callout kind="success">
              <p>
                {t("{{project}} loaded: {{devices}} devices, {{stations}} stations, {{entities}} entities, keys for {{keys}} trackers.", {
                  project: result.bundle.project_name,
                  devices: result.bundle.devices,
                  stations: result.bundle.stations,
                  entities: result.bundle.entities,
                  keys: result.bundle.trackers_with_keys,
                })}
              </p>
              {!result.bundle.credentials_included && (
                <p className="mt-1">{t("Your account may not see LP0 keys, so the trackers' frames will show undecoded. Ask a project administrator.")}</p>
              )}
              <p className="mt-1">
                {result.map.present
                  ? t("The map came too ({{size}} MB).", { size: ((result.map.size_bytes ?? 0) / 1048576).toFixed(1) })
                  : (result.map.server_state ?? t("The map did not come; the app fetches it by itself while online, or from the Overview."))}
              </p>
              {result.cards_adopted > 0 && <p className="mt-1">{t("{{count}} SD cards read before now belong to this project.", { count: result.cards_adopted })}</p>}
            </Callout>
          )}
        </CardContent>
      </Card>
      {current?.present && (
        <Card>
          <CardHeader>
            <CardTitle>{t("On this laptop")}</CardTitle>
            <CardDescription>
              {t("{{project}} is loaded, fetched {{when}} from {{server}}; Protect {{version}}.", {
                project: current.project_name,
                when: new Date(current.fetched_at ?? "").toLocaleString(),
                server: current.server_url,
                version: current.protect_version,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {current.stale && <Callout kind="warning">{t("This bundle is older than a week; load the project again while you are online.")}</Callout>}
            {laptop.data && laptop.data.length > 1 && (
              <ul className="flex flex-col divide-y rounded-md border" aria-label={t("Projects on this laptop")}>
                {laptop.data.map((project) => (
                  <li key={project.project_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{project.project_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {project.map_present
                          ? t("fetched {{when}}; {{cards}} SD cards; map on this laptop", { when: new Date(project.fetched_at).toLocaleString(), cards: project.cards })
                          : t("fetched {{when}}; {{cards}} SD cards; no map yet", { when: new Date(project.fetched_at).toLocaleString(), cards: project.cards })}
                      </p>
                    </div>
                    {project.current ? (
                      <span className="text-xs text-muted-foreground">{t("loaded")}</span>
                    ) : (
                      <Button type="button" size="sm" variant="outline" disabled={switchTo.isPending} onClick={() => switchTo.mutate(project)}>
                        {t("Use")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {switchTo.isError && <Callout kind="error">{switchTo.error.message}</Callout>}
            <p className="text-muted-foreground">
              {current.key_kept_in === "keychain"
                ? t("The keys are protected by this laptop's keychain: your login is the password.")
                : t("No keychain on this laptop: the keys are protected by a key file only your account can read.")}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
