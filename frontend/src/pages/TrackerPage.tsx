import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { api, type Measurement, type Metric, type Position, type Tracker } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { OfflineMap } from "@/components/OfflineMap";
import { Card as Panel, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MapState } from "@/pages/MapPage";
import { sinceFor, WINDOWS } from "@/lib/windows";

/** One tracker across every file read (phase 2 F3), as Protect's device page in small: its
 * track on the offline map within a window, the metrics it reported with their newest values,
 * and the values of one metric as a table. */
export function TrackerPage() {
  const { t } = useTranslation();
  const { deviceId = "" } = useParams();
  const trackers = useQuery({ queryKey: queryKeys.trackers, queryFn: () => api<Tracker[]>("/api/trackers") });
  const tracker = trackers.data?.find((tr) => tr.device_id === deviceId);
  const [windowKey, setWindowKey] = useState("30d");
  const window = WINDOWS.find((w) => w.key === windowKey) ?? WINDOWS[3];
  const since = sinceFor(window, tracker?.last_time ?? null);
  const positions = useQuery({
    queryKey: queryKeys.positions(deviceId, since ?? null),
    queryFn: () => api<Position[]>(`/api/positions?${new URLSearchParams({ device_id: deviceId, ...(since ? { since } : {}) })}`),
    enabled: tracker !== undefined,
  });
  const metrics = useQuery({ queryKey: queryKeys.metrics(deviceId), queryFn: () => api<Metric[]>(`/api/trackers/${deviceId}/metrics`) });
  const [metric, setMetric] = useState("");
  const chosen = metric || metrics.data?.[0]?.metric || "";
  const values = useQuery({
    queryKey: queryKeys.measurements(deviceId, chosen, since ?? null),
    queryFn: () => api<Measurement[]>(`/api/trackers/${deviceId}/measurements?${new URLSearchParams({ metric: chosen, ...(since ? { since } : {}), limit: "500" })}`),
    enabled: chosen !== "",
  });
  const map = useQuery({ queryKey: queryKeys.map, queryFn: () => api<MapState>("/api/map") });
  const points = useMemo(() => (positions.data ?? []).map((p) => ({ lat: p.lat, lon: p.lon, time: p.time, label: tracker?.device_name ?? deviceId })), [positions.data, tracker, deviceId]);
  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    return { west: Math.min(...lons) - 0.005, south: Math.min(...lats) - 0.005, east: Math.max(...lons) + 0.005, north: Math.max(...lats) + 0.005 };
  }, [points]);
  const dark = document.documentElement.classList.contains("dark");
  const format = (value: Measurement["value"]) => (typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(value ?? ""));
  return (
    <>
      <PageHeader
        title={tracker?.device_name ?? t("Tracker")}
        description={
          tracker
            ? t("{{positions}} positions and {{measurements}} measurements on this laptop, from {{first}} to {{last}}.", {
                positions: tracker.positions,
                measurements: tracker.measurements,
                first: tracker.first_time ? new Date(tracker.first_time).toLocaleDateString() : "",
                last: tracker.last_time ? new Date(tracker.last_time).toLocaleDateString() : "",
              })
            : undefined
        }
        actions={
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("Window")}</span>
            <select className="h-8 rounded-md border border-input bg-transparent px-2 text-sm" value={windowKey} onChange={(event) => setWindowKey(event.target.value)} aria-label={t("Window")}>
              {WINDOWS.map((w) => (
                <option key={w.key} value={w.key}>
                  {t(w.label)}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <Page>
        {trackers.data && !tracker && <Callout kind="error">{t("No such tracker on this laptop.")}</Callout>}
        {bounds && map.data?.present && <OfflineMap bounds={bounds} dark={dark} points={points} />}
        {bounds && !map.data?.present && <Callout kind="info">{t("{{count}} positions, but no map on this laptop to draw them on; load the project while online.", { count: points.length })}</Callout>}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <CardHeader>
              <CardTitle>{t("Measurements")}</CardTitle>
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
                      <tr key={m.metric} className={`cursor-pointer border-t ${m.metric === chosen ? "bg-accent" : "hover:bg-accent/50"}`} onClick={() => setMetric(m.metric)}>
                        <td className="py-1 pr-3 font-mono text-xs">{m.metric}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{format(m.latest)}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{m.count}</td>
                        <td className="py-1 whitespace-nowrap">{new Date(m.last_time).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Panel>
          <Panel>
            <CardHeader>
              <CardTitle>{chosen ? t("{{metric}} over time", { metric: chosen }) : t("Values")}</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[28rem] overflow-auto">
              {values.data && values.data.length === 0 && <p className="text-sm text-muted-foreground">{t("Nothing in this window.")}</p>}
              {values.data && values.data.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">{t("Time")}</th>
                      <th className="py-1 text-right font-medium">{t("Value")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {values.data.map((v) => (
                      <tr key={v.time} className="border-t">
                        <td className="py-1 pr-3 whitespace-nowrap">{new Date(v.time).toLocaleString()}</td>
                        <td className="py-1 text-right tabular-nums">{format(v.value)}</td>
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
