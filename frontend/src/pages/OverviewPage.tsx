import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, type Bundle, type Card, type Health, type Setup, type Uploads } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { OverviewMap } from "@/components/OverviewMap";
import { UpdateNotice } from "@/components/UpdateNotice";
import { Button } from "@/components/ui/button";
import { Card as Panel, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The first page: the server and the account, the project on the laptop, the files read and
 * what waits to go up, the versions, the update notice, and a small map with the offload
 * stations and every tracker's last known position (Tim, 2026-10-17). Every card leads to its
 * page. */
export function OverviewPage({ setup }: { setup: Setup }) {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: queryKeys.health, queryFn: () => api<Health>("/api/health") });
  const bundle = useQuery({ queryKey: queryKeys.bundle, queryFn: () => api<Bundle>("/api/bundle") });
  const uploads = useQuery({ queryKey: queryKeys.uploads, queryFn: () => api<Uploads>("/api/uploads") });
  const files = useQuery({ queryKey: queryKeys.cards, queryFn: () => api<Card[]>("/api/cards") });
  const waiting = uploads.data ? uploads.data.pending + uploads.data.failed : 0;
  const expires = setup.token_expires_at ? new Date(setup.token_expires_at) : null;
  return (
    <>
      <PageHeader title={t("Overview")} description={t("The project on this laptop, the files read, and the server the app works with.")} />
      <Page>
        {health.data && <UpdateNotice currentVersion={health.data.version} />}
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="md:col-span-2">
            <CardHeader>
              <CardTitle>{t("Where things are")}</CardTitle>
              <CardDescription>{t("The offload stations and the last known position of every tracker on this laptop. A click on one opens its page.")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <OverviewMap />
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/explore">{t("Data explorer")}</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/trackers">{t("Trackers")}</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/stations">{t("Offload stations")}</Link>
                </Button>
              </div>
            </CardContent>
          </Panel>
          <Panel>
            <CardHeader>
              <CardTitle>{bundle.data?.present ? t("Project on this laptop") : t("No project on this laptop yet")}</CardTitle>
              <CardDescription>
                {bundle.data?.present
                  ? t("{{project}}: {{devices}} devices, {{stations}} stations, keys for {{keys}} trackers; fetched {{when}}.", {
                      project: bundle.data.project_name,
                      devices: bundle.data.devices,
                      stations: bundle.data.stations,
                      keys: bundle.data.trackers_with_keys,
                      when: new Date(bundle.data.fetched_at ?? "").toLocaleString(),
                    })
                  : t("Load a project while you are online: its devices, keys and map come to this laptop for the field.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {bundle.data?.stale && <Callout kind="warning">{t("This bundle is older than a week; load the project again while you are online.")}</Callout>}
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/setup">{bundle.data?.present ? t("Load again") : t("Load a project")}</Link>
                </Button>
                {bundle.data?.present && (
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/explore">{t("Data explorer")}</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Panel>
          <Panel>
            <CardHeader>
              <CardTitle>{t("Files")}</CardTitle>
              <CardDescription>
                {files.data
                  ? t("{{batches}} SD cards read, {{positions}} positions in all; {{waiting}} files wait to go up.", {
                      batches: files.data.length,
                      positions: files.data.reduce((sum, c) => sum + c.positions, 0),
                      waiting,
                    })
                  : t("Checking")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant={bundle.data?.present ? "default" : "secondary"} disabled={!bundle.data?.present}>
                <Link to="/files">{t("Read SD card files")}</Link>
              </Button>
              <Button asChild variant={waiting > 0 ? "default" : "secondary"} size="sm">
                <Link to="/upload">{waiting > 0 ? t("Upload ({{count}} waiting)", { count: waiting }) : t("Upload")}</Link>
              </Button>
            </CardContent>
          </Panel>
          <Panel>
            <CardHeader>
              <CardTitle>{t("Connected to {{server}}", { server: setup.server_url })}</CardTitle>
              <CardDescription>
                {setup.signed_in
                  ? t("Signed in as {{email}}. The sign-in lasts until {{time}}; the app asks for your password again when it needs the server after that.", {
                      email: setup.email,
                      time: expires?.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
                    })
                  : t("Not signed in. Sign in when you are online to load a bundle or upload cards.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant={setup.signed_in ? "outline" : "default"}>
                <Link to="/setup">{setup.signed_in ? t("Server") : t("Sign in")}</Link>
              </Button>
            </CardContent>
          </Panel>
          <Panel>
            <CardHeader>
              <CardTitle>{t("About the app")}</CardTitle>
              <CardDescription>{t("The files are decoded here with Protect's own code and handed to Protect when there is a connection.")}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {health.isPending && <p>{t("Checking the local server")}</p>}
              {health.isError && <p role="alert">{t("The local server does not answer.")}</p>}
              {health.data && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt>{t("Version")}</dt>
                  <dd className="font-mono">{health.data.version}</dd>
                  <dt>{t("Protect's decoding")}</dt>
                  <dd className="font-mono">{health.data.protect_revision?.slice(0, 7) ?? t("unknown")}</dd>
                  <dt>{t("Server version")}</dt>
                  <dd className="font-mono">{setup.protect_version ?? t("unknown")}</dd>
                  <dt>{t("Data folder")}</dt>
                  <dd className="font-mono break-all">{health.data.data_dir}</dd>
                </dl>
              )}
            </CardContent>
          </Panel>
        </div>
      </Page>
    </>
  );
}
