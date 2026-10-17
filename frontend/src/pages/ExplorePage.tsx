import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { api, type MapState, type Measurement, type Metric, type Position, type Tracker } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { ExploreChart, type ChartSeries } from "@/components/explore/ExploreChart";
import { OfflineMap, type MapPoint } from "@/components/OfflineMap";
import { Card as Panel, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/hooks/useTheme";
import { colourFor } from "@/lib/palette";
import { sinceFor, WINDOWS } from "@/lib/windows";

// the combines live outside the page so TanStack can keep their results stable between renders
const flatten = <T,>(results: UseQueryResult<T[]>[]): T[] => results.flatMap((r) => r.data ?? []);
const lists = <T,>(results: UseQueryResult<T[]>[]): { loaded: boolean; lists: (T[] | undefined)[] } => ({
  loaded: results.every((r) => r.data !== undefined),
  lists: results.map((r) => r.data),
});

/** The Data explorer (decision D21; Tim, 2026-10-17: a user wants to explore the data that
 * came with the files, not "open the SD card"), as Protect's Explore canvas in small: whose
 * records (the trackers as chips, each in its colour), over which window, which measurements;
 * then the tracks on the offline map and one graph per measurement with a line per tracker,
 * and the newest values. `?tracker=` opens with one tracker chosen. */
export function ExplorePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { resolved } = useTheme();
  const dark = resolved === "dark";
  const map = useQuery({ queryKey: queryKeys.map, queryFn: () => api<MapState>("/api/map") });
  const trackers = useQuery({ queryKey: queryKeys.trackers, queryFn: () => api<Tracker[]>("/api/trackers") });
  const all = useMemo(() => trackers.data ?? [], [trackers.data]);
  const colours = useMemo(() => new Map(all.map((tr, index) => [tr.device_id, colourFor(index)])), [all]);

  // whose records: all trackers until one is chosen, or the one the link named
  const [chosen, setChosen] = useState<string[] | null>(params.get("tracker") ? [params.get("tracker")!] : null);
  const selected = useMemo(() => (chosen === null ? all.map((tr) => tr.device_id) : chosen.filter((id) => all.some((tr) => tr.device_id === id))), [chosen, all]);
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id];
    setChosen(next);
  };

  const [windowKey, setWindowKey] = useState("30d");
  const window = WINDOWS.find((w) => w.key === windowKey) ?? WINDOWS[3];
  const latest = useMemo(() => {
    const times = all.filter((tr) => selected.includes(tr.device_id)).map((tr) => tr.last_time).filter((v): v is string => v !== null);
    return times.length ? times.sort().at(-1)! : null;
  }, [all, selected]);
  const since = sinceFor(window, latest);

  // the positions of the chosen trackers within the window, one request per tracker
  const positions = useQueries({
    queries: selected.map((id) => ({
      queryKey: queryKeys.positions(id, since ?? null),
      queryFn: () => api<Position[]>(`/api/positions?${new URLSearchParams({ device_id: id, ...(since ? { since } : {}) })}`),
    })),
    combine: flatten<Position>,
  });
  const names = useMemo(() => new Map(all.map((tr) => [tr.device_id, tr.device_name])), [all]);
  const points: MapPoint[] = useMemo(
    () => positions.map((p) => ({ lat: p.lat, lon: p.lon, time: p.time, label: names.get(p.device_id) ?? p.device_id, colour: colours.get(p.device_id) })),
    [positions, names, colours],
  );
  const positionCount = points.length;
  const bounds = useMemo(() => {
    if (points.length > 0) {
      const lats = points.map((p) => p.lat);
      const lons = points.map((p) => p.lon);
      const pad = 0.005;
      return { west: Math.min(...lons) - pad, south: Math.min(...lats) - pad, east: Math.max(...lons) + pad, north: Math.max(...lats) + pad };
    }
    const state = map.data;
    if (state?.present && state.west !== null && state.south !== null && state.east !== null && state.north !== null) {
      return { west: state.west, south: state.south, east: state.east, north: state.north };
    }
    return null;
  }, [points, map.data]);

  // which measurements: the metrics the chosen trackers reported, the first chosen by default
  const metricLists = useQueries({
    queries: selected.map((id) => ({ queryKey: queryKeys.metrics(id), queryFn: () => api<Metric[]>(`/api/trackers/${id}/metrics`) })),
    combine: lists<Metric>,
  });
  const metricsLoaded = metricLists.loaded;
  const metrics = useMemo(() => {
    const seen = new Map<string, number>();
    for (const list of metricLists.lists) for (const m of list ?? []) seen.set(m.metric, (seen.get(m.metric) ?? 0) + m.count);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([metric]) => metric);
  }, [metricLists]);
  // the first measurement until some are chosen; none chosen falls back to the first
  const [shownMetrics, setShownMetrics] = useState<string[] | null>(null);
  const activeMetrics = useMemo(() => {
    const picked = shownMetrics === null ? [] : shownMetrics.filter((m) => metrics.includes(m));
    return picked.length > 0 ? picked : metrics.slice(0, 1);
  }, [shownMetrics, metrics]);
  const toggleMetric = (metric: string) => setShownMetrics(activeMetrics.includes(metric) ? activeMetrics.filter((m) => m !== metric) : [...activeMetrics, metric]);

  // the values: one request per tracker and metric, drawn as one graph per metric
  const pairs = useMemo(() => activeMetrics.flatMap((metric) => selected.map((id) => ({ id, metric }))), [activeMetrics, selected]);
  const valueLists = useQueries({
    queries: pairs.map(({ id, metric }) => ({
      queryKey: queryKeys.measurements(id, metric, since ?? null),
      queryFn: () => api<Measurement[]>(`/api/trackers/${id}/measurements?${new URLSearchParams({ metric, ...(since ? { since } : {}), limit: "5000" })}`),
    })),
    combine: lists<Measurement>,
  });
  const charts = useMemo(() => {
    return activeMetrics.map((metric) => {
      const series: ChartSeries[] = [];
      pairs.forEach((pair, index) => {
        if (pair.metric !== metric) return;
        const rows = valueLists.lists[index] ?? [];
        const data = rows
          .filter((row) => typeof row.value === "number")
          .map((row) => [new Date(row.time).getTime(), row.value as number])
          .sort((a, b) => a[0] - b[0]);
        series.push({ key: pair.id, name: names.get(pair.id) ?? pair.id, colour: colours.get(pair.id) ?? "#52735E", data });
      });
      return { metric, series, values: series.reduce((n, s) => n + s.data.length, 0) };
    });
  }, [activeMetrics, pairs, valueLists, names, colours]);

  const latestValues = useMemo(
    () =>
      selected.map((id, index) => ({
        id,
        name: names.get(id) ?? id,
        metrics: new Map((metricLists.lists[index] ?? []).map((m) => [m.metric, m])),
      })),
    [selected, names, metricLists],
  );
  const format = (value: Metric["latest"]) => (typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : value === null || value === undefined ? "" : String(value));
  const nothingYet = trackers.data !== undefined && all.length === 0;
  return (
    <>
      <PageHeader
        title={t("Data explorer")}
        description={t("The data that came with the files you read: whose records, over which time, and which measurements; the tracks on the map and the values as graphs.")}
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
        {nothingYet && (
          <Callout kind="info">
            {t("No data on this laptop yet; read SD card files first.")}{" "}
            <Link className="underline underline-offset-4" to="/files">
              {t("Files")}
            </Link>
          </Callout>
        )}
        {all.length > 0 && (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Trackers")}>
              <span className="mr-1 text-muted-foreground">{t("Trackers")}</span>
              {all.map((tr) => {
                const on = selected.includes(tr.device_id);
                const colour = colours.get(tr.device_id);
                return (
                  <button key={tr.device_id} type="button" aria-pressed={on} onClick={() => toggle(tr.device_id)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${on ? "bg-card" : "text-muted-foreground opacity-60"}`}>
                    <span className="inline-block size-2 rounded-full" style={{ background: on ? colour : "transparent", boxShadow: `inset 0 0 0 1.5px ${colour}` }} />
                    {tr.device_name}
                  </button>
                );
              })}
            </div>
            {metricsLoaded && metrics.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Measurements")}>
                <span className="mr-1 text-muted-foreground">{t("Measurements")}</span>
                {metrics.map((metric) => {
                  const on = activeMetrics.includes(metric);
                  return (
                    <button key={metric} type="button" aria-pressed={on} onClick={() => toggleMetric(metric)} className={`rounded-full border px-2.5 py-0.5 font-mono text-xs whitespace-nowrap ${on ? "bg-card" : "text-muted-foreground opacity-60"}`}>
                      {metric}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {bounds && map.data?.present && (
          <div className="flex flex-col gap-1">
            <OfflineMap bounds={bounds} dark={dark} points={points} className="h-[45vh] min-h-72 w-full rounded-md border" />
            <p className="text-xs text-muted-foreground">
              {t("{{count}} positions", { count: positionCount })}
              {map.data.build ? ` · ${t("Map of {{build}}, OpenStreetMap data built by Protomaps.", { build: map.data.build })}` : ""}
            </p>
          </div>
        )}
        {all.length > 0 && map.data && !map.data.present && (
          <Callout kind="info">
            {t("{{count}} positions, but no map on this laptop to draw them on; load the project while online.", { count: positionCount })}{" "}
            <Link className="underline underline-offset-4" to="/load">
              {t("Load a project")}
            </Link>
          </Callout>
        )}
        {charts.map((chart) => (
          <Panel key={chart.metric}>
            <CardHeader>
              <CardTitle className="font-mono text-sm">{chart.metric}</CardTitle>
            </CardHeader>
            <CardContent>
              {chart.values === 0 ? <p className="text-sm text-muted-foreground">{t("Nothing in this window.")}</p> : <ExploreChart series={chart.series} dark={dark} />}
            </CardContent>
          </Panel>
        ))}
        {all.length > 0 && metricsLoaded && metrics.length > 0 && (
          <Panel>
            <CardHeader>
              <CardTitle>{t("Newest values")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t("Tracker")}</th>
                    {activeMetrics.map((metric) => (
                      <th key={metric} className="py-1 pr-3 text-right font-mono text-xs font-medium">
                        {metric}
                      </th>
                    ))}
                    <th className="py-1 font-medium">{t("Last")}</th>
                  </tr>
                </thead>
                <tbody>
                  {latestValues.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="py-1 pr-3">
                        <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: colours.get(row.id) }} />
                        {row.name}
                      </td>
                      {activeMetrics.map((metric) => (
                        <td key={metric} className="py-1 pr-3 text-right tabular-nums">
                          {format(row.metrics.get(metric)?.latest ?? null)}
                        </td>
                      ))}
                      <td className="py-1 whitespace-nowrap text-muted-foreground">
                        {(() => {
                          const last = [...row.metrics.values()].map((m) => m.last_time).sort().at(-1);
                          return last ? new Date(last).toLocaleString() : "";
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Panel>
        )}
      </Page>
    </>
  );
}
