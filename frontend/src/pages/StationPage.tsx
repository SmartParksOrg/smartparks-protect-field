import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { api, type Card, type Station, type StationStats } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { FilesExplorer } from "@/components/files/FilesExplorer";
import { OverviewMap } from "@/components/OverviewMap";
import { Button } from "@/components/ui/button";
import { Card as Panel, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format";

/** One offload station (Tim, 2026-10-17), by its device id or its EUI: where it stands on the
 * small map with Protect's marker, what its SD card files brought, the batches read from it,
 * and its files in Protect's explorer; the ways on: the Upload, the Data explorer. */
export function StationPage() {
  const { t } = useTranslation();
  const { key = "" } = useParams();
  const stations = useQuery({ queryKey: queryKeys.stations, queryFn: () => api<Station[]>("/api/bundle/stations") });
  const stats = useQuery({ queryKey: queryKeys.stationStats, queryFn: () => api<StationStats[]>("/api/stations") });
  const cards = useQuery({ queryKey: queryKeys.cards, queryFn: () => api<Card[]>("/api/cards") });
  const station = (stations.data ?? []).find((s) => s.device_id === key || s.station_eui.toUpperCase() === key.toUpperCase()) ?? null;
  const eui = (station?.station_eui ?? (key.length === 16 ? key : "")).toUpperCase();
  const stat = (stats.data ?? []).find((s) => s.station_eui.toUpperCase() === eui) ?? null;
  const name = station?.name ?? stat?.station_name ?? eui ?? t("Offload station");
  const batches = (cards.data ?? []).filter((c) => (c.station_eui ?? "").toUpperCase() === eui);
  const unknown = stations.data !== undefined && stats.data !== undefined && !station && !stat;
  return (
    <>
      <PageHeader
        title={name}
        description={eui ? t("Offload station {{eui}}", { eui }) : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/upload">{t("Upload")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/stations">{t("All offload stations")}</Link>
            </Button>
          </div>
        }
      />
      <Page>
        {unknown && <Callout kind="error">{t("No such offload station on this laptop.")}</Callout>}
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="md:col-span-2">
            <CardHeader>
              <CardTitle>{t("Where it stands")}</CardTitle>
              <CardDescription>{station?.lat !== null && station?.lat !== undefined && station.lon !== null ? `${station.lat.toFixed(5)}, ${station.lon.toFixed(5)}` : t("The bundle has no place for this station.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <OverviewMap trackerIds={[]} stationIds={station ? [station.device_id] : []} className="h-64" />
            </CardContent>
          </Panel>
          <Panel>
            <CardHeader>
              <CardTitle>{t("About the station")}</CardTitle>
              <CardDescription>{station ? t("As the project's bundle describes it.") : t("Not in the bundle; known from the files alone.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t("EUI")}</dt>
                <dd className="font-mono text-xs">{eui}</dd>
                <dt className="text-muted-foreground">{t("Device")}</dt>
                <dd className="font-mono text-xs">{station?.device_id ?? stat?.station_device_id ?? ""}</dd>
              </dl>
            </CardContent>
          </Panel>
          <Panel>
            <CardHeader>
              <CardTitle>{t("On this laptop")}</CardTitle>
              <CardDescription>{t("What this station's SD card files brought here.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t("Batches read")}</dt>
                <dd className="tabular-nums">{stat?.cards ?? 0}</dd>
                <dt className="text-muted-foreground">{t("Files")}</dt>
                <dd className="tabular-nums">{stat?.files ?? 0}</dd>
                <dt className="text-muted-foreground">{t("Frames")}</dt>
                <dd className="tabular-nums">{stat?.frames ?? 0}</dd>
                <dt className="text-muted-foreground">{t("To upload")}</dt>
                <dd className="tabular-nums">{(stat?.pending ?? 0) + (stat?.failed ?? 0)}</dd>
                <dt className="text-muted-foreground">{t("Uploaded")}</dt>
                <dd className="tabular-nums">{(stat?.uploaded ?? 0) + (stat?.duplicate ?? 0)}</dd>
                <dt className="text-muted-foreground">{t("Last read")}</dt>
                <dd>{stat?.last_read ? formatTime(stat.last_read) : ""}</dd>
              </dl>
              {batches.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                  {batches.map((c) => (
                    <li key={c.id}>
                      <Link className="underline underline-offset-4" to={`/files/${c.id}`}>
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Panel>
        </div>
        <h2 className="mt-2 text-base font-semibold">{t("Files")}</h2>
        <FilesExplorer cardId={null} stationEui={eui || null} />
      </Page>
    </>
  );
}
