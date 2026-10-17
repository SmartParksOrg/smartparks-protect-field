import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, type Position, type Tracker } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { OfflineMap, type MapPoint } from "@/components/OfflineMap";
import { colourFor } from "@/lib/palette";
import { sinceFor, WINDOWS } from "@/lib/windows";

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

/** The project's map (decision D4 and phase 2 F3), as Protect's live map but from the files on
 * the laptop: every tracker's track in its own colour over the offline tiles, a tracker and a
 * window to choose, a click on a fix for who and when. The window counts back from the newest
 * record, since a card is read days after its last fix. */
export function MapPage() {
  const { t } = useTranslation();
  const map = useQuery({ queryKey: queryKeys.map, queryFn: () => api<MapState>("/api/map") });
  const trackers = useQuery({ queryKey: queryKeys.trackers, queryFn: () => api<Tracker[]>("/api/trackers") });
  const [deviceId, setDeviceId] = useState("");
  const [windowKey, setWindowKey] = useState("30d");
  const window = WINDOWS.find((w) => w.key === windowKey) ?? WINDOWS[3];
  const latest = useMemo(() => {
    const times = (trackers.data ?? []).map((tr) => tr.last_time).filter((v): v is string => v !== null);
    return times.length ? times.sort().at(-1)! : null;
  }, [trackers.data]);
  const since = sinceFor(window, latest);
  const positions = useQuery({
    queryKey: queryKeys.positions(deviceId, since ?? null),
    queryFn: () => api<Position[]>(`/api/positions?${new URLSearchParams({ ...(deviceId ? { device_id: deviceId } : {}), ...(since ? { since } : {}) })}`),
    enabled: trackers.data !== undefined,
  });
  const colours = useMemo(() => new Map((trackers.data ?? []).map((tr, index) => [tr.device_id, colourFor(index)])), [trackers.data]);
  const names = useMemo(() => new Map((trackers.data ?? []).map((tr) => [tr.device_id, tr.device_name])), [trackers.data]);
  const points: MapPoint[] = useMemo(
    () => (positions.data ?? []).map((p) => ({ lat: p.lat, lon: p.lon, time: p.time, label: names.get(p.device_id) ?? p.device_id, colour: colours.get(p.device_id) })),
    [positions.data, names, colours],
  );
  const state = map.data;
  const bounds = useMemo(() => {
    if (points.length > 0) {
      const lats = points.map((p) => p.lat);
      const lons = points.map((p) => p.lon);
      const pad = 0.005;
      return { west: Math.min(...lons) - pad, south: Math.min(...lats) - pad, east: Math.max(...lons) + pad, north: Math.max(...lats) + pad };
    }
    if (state?.present && state.west !== null && state.south !== null && state.east !== null && state.north !== null) {
      return { west: state.west, south: state.south, east: state.east, north: state.north };
    }
    return null;
  }, [points, state]);
  const dark = document.documentElement.classList.contains("dark");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm md:px-6">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">{t("Tracker")}</span>
          <select className="h-8 rounded-md border border-input bg-transparent px-2 text-sm" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} aria-label={t("Tracker")}>
            <option value="">{t("All trackers")}</option>
            {(trackers.data ?? []).map((tr) => (
              <option key={tr.device_id} value={tr.device_id}>
                {tr.device_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">{t("Window")}</span>
          <select className="h-8 rounded-md border border-input bg-transparent px-2 text-sm" value={windowKey} onChange={(event) => setWindowKey(event.target.value)} aria-label={t("Window")}>
            {WINDOWS.map((w) => (
              <option key={w.key} value={w.key}>
                {t(w.label)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-foreground">
          {positions.data ? t("{{count}} positions", { count: positions.data.length }) : t("Checking")}
        </span>
        <ul className="ml-auto flex flex-wrap items-center gap-3">
          {(trackers.data ?? []).map((tr) => (
            <li key={tr.device_id} className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colours.get(tr.device_id) }} />
              <Link className="underline-offset-4 hover:underline" to={`/trackers/${tr.device_id}`}>
                {tr.device_name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {bounds && state?.present ? (
        <OfflineMap bounds={bounds} dark={dark} points={points} className="min-h-0 flex-1" />
      ) : (
        <div className="p-4 md:p-6">
          <Callout kind="info">
            {state?.present
              ? t("No positions on this laptop yet; read SD card files first.")
              : t("No map on this laptop yet. Load the project while you are online; the map comes with it.")}{" "}
            <Link className="underline underline-offset-4" to={state?.present ? "/files" : "/load"}>
              {state?.present ? t("Files") : t("Load a project")}
            </Link>
          </Callout>
        </div>
      )}
      {state?.present && (
        <p className="border-t px-4 py-1 text-xs text-muted-foreground md:px-6">
          {t("{{project}}, map of {{build}}, {{size}} MB, down to zoom {{zoom}}. OpenStreetMap data built by Protomaps.", {
            project: state.project_name ?? state.project_id,
            build: state.build ?? t("unknown"),
            size: ((state.size_bytes ?? 0) / 1048576).toFixed(1),
            zoom: state.max_zoom ?? "",
          })}
        </p>
      )}
    </div>
  );
}
