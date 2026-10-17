import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, send, type Bundle } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MapState } from "@/pages/MapPage";

interface Project {
  id: string;
  name: string;
}

interface LoadResult {
  bundle: Bundle;
  map: MapState;
}

/** Loading a project before leaving (decisions D2 and D11): one button fetches the project's
 * bundle (devices, entities, stations, the keys the account may see) and its map from the
 * server. The bundle is kept encrypted with a key in the laptop's keychain, or in a key file
 * where there is none; the page says which. */
export function LoadPage({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bundle = useQuery({ queryKey: queryKeys.bundle, queryFn: () => api<Bundle>("/api/bundle") });
  const projects = useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api<Project[]>("/api/projects"),
    enabled: signedIn,
  });
  const [choice, setChoice] = useState("");
  const [result, setResult] = useState<LoadResult | null>(null);
  const load = useMutation({
    mutationFn: (project: Project) =>
      send<LoadResult>("POST", "/api/bundle/fetch", { project_id: project.id, project_name: project.name }),
    onSuccess: (loaded) => {
      queryClient.setQueryData(queryKeys.bundle, loaded.bundle);
      queryClient.setQueryData(queryKeys.map, loaded.map);
      setResult(loaded);
    },
  });
  const current = bundle.data;
  const wanted = choice || current?.project_id || "";
  const chosen = projects.data?.find((p) => p.id === wanted) ?? projects.data?.[0];
  return (
    <>
      <PageHeader title={t("Load a project")} description={t("Before you leave, while online: the project's devices, keys and map come to this laptop.")} />
      <Page>
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
                {projects.data.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" disabled={!chosen || load.isPending} onClick={() => chosen && load.mutate(chosen)}>
                {load.isPending ? t("Loading the project") : t("Load the project")}
              </Button>
            </div>
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
                  : (result.map.server_state ?? t("The map did not come; fetch it from the Map page later."))}
              </p>
            </Callout>
          )}
        </CardContent>
      </Card>
      {current?.present && (
        <Card>
          <CardHeader>
            <CardTitle>{t("On this laptop")}</CardTitle>
            <CardDescription>
              {t("{{project}}, fetched {{when}} from {{server}}; Protect {{version}}.", {
                project: current.project_name,
                when: new Date(current.fetched_at ?? "").toLocaleString(),
                server: current.server_url,
                version: current.protect_version,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {current.stale && <Callout kind="warning">{t("This bundle is older than a week; load the project again while you are online.")}</Callout>}
            <p className="text-muted-foreground">
              {current.key_kept_in === "keychain"
                ? t("The keys are protected by this laptop's keychain: your login is the password.")
                : t("No keychain on this laptop: the keys are protected by a key file only your account can read.")}
            </p>
          </CardContent>
        </Card>
      )}
      </Page>
    </>
  );
}
