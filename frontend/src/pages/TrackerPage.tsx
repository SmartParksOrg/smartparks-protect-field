import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { api, type BundleDevice, type Metric, type MetricDefinition, type Tracker } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { OverviewMap } from "@/components/OverviewMap";
import { Button } from "@/components/ui/button";
import { Card as Panel, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format";

/** One tracker (Tim, 2026-10-17): what the bundle says of it, what the files brought, its last
 * known position on the small map, the measurements with their newest values, and the ways on:
 * the Data explorer with this tracker alone, the Files. Protect's device page in small. */
export function TrackerPage() {
  const { t } = useTranslation();
  const { deviceId = "" } = useParams();
  const devices = useQuery({ queryKey: queryKeys.devices, queryFn: () => api<BundleDevice[]>("/api/bundle/devices") });
  const trackers = useQuery({ queryKey: queryKeys.trackers, queryFn: () => api<Tracker[]>("/api/trackers") });
  const definitions = useQuery({ queryKey: queryKeys.metricDefinitions, queryFn: () => api<MetricDefinition[]>("/api/bundle/metrics") });
  const metrics = useQuery({ queryKey: queryKeys.metrics(deviceId), queryFn: () => api<Metric[]>(`/api/trackers/${deviceId}/metrics`), retry: false });
  const device = devices.data?.find((d) => d.id === deviceId) ?? null;
  const stats = trackers.data?.find((tr) => tr.device_id === deviceId) ?? null;
  const name = device?.name ?? stats?.device_name ?? t("Tracker");
  const defined = new Map((definitions.data ?? []).map((d) => [d.key, d]));
  const label = (key: string) => {
    const d = defined.get(key);
    return d ? (d.unit ? `${d.label} (${d.unit})` : d.label) : key;
  };
  const format = (value: Metric["latest"]) => (typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : value === null || value === undefined ? "" : String(value));
  const unknown = devices.data !== undefined && trackers.data !== undefined && !device && !stats;
  return (
    <>
      <PageHeader
        title={name}
        description={device?.entity_name ? t("Tracks {{entity}}", { entity: device.entity_name }) : device ? t("Tracks nothing at the moment") : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to={`/explore?tracker=${encodeURIComponent(deviceId)}`}>{t("Data explorer")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/trackers">{t("All trackers")}</Link>
            </Button>
          </div>
        }
      />
      <Page>
        {unknown && <Callout kind="error">{t("No such tracker on this laptop.")}</Callout>}
        <div className="grid gap-4 md:grid-cols-2">
          <Panel className="md:col-span-2">
            <CardHeader>
              <CardTitle>{t("Last known position")}</CardTitle>
              <CardDescription>{stats?.last_time ? t("At {{time}}, from the files on this laptop.", { time: formatTime(stats.last_time) }) : t("No position on this laptop yet.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <OverviewMap trackerIds={[deviceId]} stationIds={[]} className="h-64" />
            </CardContent>
          </Panel>
          <Panel>
            <CardHeader>
              <CardTitle>{t("About the device")}</CardTitle>
              <CardDescription>{device ? t("As the project's bundle describes it.") : t("Not in the bundle; known from the files alone.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t("Type")}</dt>
                <dd>{device?.device_type_label ?? ""}</dd>
                <dt className="text-muted-foreground">{t("Serial")}</dt>
                <dd className="font-mono text-xs">{device?.serial_number ?? ""}</dd>
                <dt className="text-muted-foreground">{t("DevEUI")}</dt>
                <dd className="font-mono text-xs">{device?.dev_eui ?? ""}</dd>
                <dt className="text-muted-foreground">{t("Firmware")}</dt>
                <dd>{device?.firmware_version ?? ""}</dd>
                <dt className="text-muted-foreground">{t("Status")}</dt>
                <dd>{device?.status ?? ""}</dd>
                <dt className="text-muted-foreground">{t("Keys")}</dt>
                <dd>{device ? (device.has_keys ? t("on this laptop; its frames are read here") : t("not for this account; its frames are refused here and read by Protect")) : ""}</dd>
              </dl>
            </CardContent>
          </Panel>
          <Panel>
            <CardHeader>
              <CardTitle>{t("On this laptop")}</CardTitle>
              <CardDescription>{t("What the files read here brought for this tracker.")}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t("Positions")}</dt>
                <dd className="tabular-nums">{stats?.positions ?? 0}</dd>
                <dt className="text-muted-foreground">{t("Measurements")}</dt>
                <dd className="tabular-nums">{stats?.measurements ?? 0}</dd>
                <dt className="text-muted-foreground">{t("First record")}</dt>
                <dd>{stats?.first_time ? formatTime(stats.first_time) : ""}</dd>
                <dt className="text-muted-foreground">{t("Last record")}</dt>
                <dd>{stats?.last_time ? formatTime(stats.last_time) : ""}</dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/files">{t("Files")}</Link>
                </Button>
              </div>
            </CardContent>
          </Panel>
          <Panel className="md:col-span-2">
            <CardHeader>
              <CardTitle>{t("Measurements")}</CardTitle>
              <CardDescription>{t("Each measurement this tracker reported, with its newest value; the Data explorer draws them over time.")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {metrics.data && metrics.data.length === 0 && <p className="text-sm text-muted-foreground">{t("No measurements on this laptop for this tracker.")}</p>}
              {metrics.data && metrics.data.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">{t("Metric")}</th>
                      <th className="py-1 pr-3 text-right font-medium">{t("Newest value")}</th>
                      <th className="py-1 pr-3 text-right font-medium">{t("Values")}</th>
                      <th className="py-1 font-medium">{t("Last")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.data.map((m) => (
                      <tr key={m.metric} className="border-t">
                        <td className={`py-1 pr-3 ${defined.has(m.metric) ? "" : "font-mono text-xs"}`}>
                          <Link className="underline-offset-4 hover:underline" to={`/explore?mode=chart&tracker=${encodeURIComponent(deviceId)}&metric=${encodeURIComponent(m.metric)}`}>
                            {label(m.metric)}
                          </Link>
                        </td>
                        <td className="py-1 pr-3 text-right tabular-nums">{format(m.latest)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{m.count}</td>
                        <td className="py-1 whitespace-nowrap">{formatTime(m.last_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Panel>
        </div>
      </Page>
    </>
  );
}
