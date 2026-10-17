import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";

import { api, type CardDetail, type Position } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { OfflineMap, type MapPoint } from "@/components/OfflineMap";
import { Button } from "@/components/ui/button";
import { Card as Panel, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MapState } from "@/pages/MapPage";

/** One card (phase 2 F2): its counts, its trackers with their span, its positions on the
 * offline map, its files, and every frame that was not read with the reason, so a person at
 * the station knows at once whether the card is good and whose keys are missing. */
export function CardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { cardId = "" } = useParams();
  const card = useQuery({ queryKey: queryKeys.card(cardId), queryFn: () => api<CardDetail>(`/api/cards/${cardId}`) });
  const positions = useQuery({
    queryKey: queryKeys.cardPositions(cardId),
    queryFn: () => api<Position[]>(`/api/cards/${cardId}/positions`),
  });
  const map = useQuery({ queryKey: queryKeys.map, queryFn: () => api<MapState>("/api/map") });
  const remove = useMutation({
    mutationFn: () => fetch(`/api/cards/${cardId}`, { method: "DELETE" }),
    onSuccess: () => void navigate("/cards", { replace: true }),
  });
  const names = useMemo(() => new Map((card.data?.trackers ?? []).map((tr) => [tr.device_id, tr.device_name])), [card.data]);
  const points: MapPoint[] = useMemo(
    () => (positions.data ?? []).map((p) => ({ lat: p.lat, lon: p.lon, time: p.time, label: names.get(p.device_id) ?? p.device_id })),
    [positions.data, names],
  );
  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    const pad = 0.01;
    return { west: Math.min(...lons) - pad, south: Math.min(...lats) - pad, east: Math.max(...lons) + pad, north: Math.max(...lats) + pad };
  }, [points]);
  const dark = document.documentElement.classList.contains("dark");
  const detail = card.data;
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-primary">{detail?.name ?? t("Card")}</h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/cards">{t("All cards")}</Link>
        </Button>
      </div>
      {card.isError && <Callout kind="error">{card.error.message}</Callout>}
      {detail && (
        <>
          <Panel>
            <CardHeader>
              <CardTitle>{detail.station_name ?? detail.station_eui ?? t("Unknown station")}</CardTitle>
              <CardDescription>
                {t("Read on {{when}}: {{files}} files, {{frames}} frames; {{decoded}} decoded, {{repeated}} repeats, {{refused}} refused, {{unknown}} of unknown trackers, {{errors}} unreadable lines. New records: {{positions}} positions, {{measurements}} measurements, {{states}} states, {{events}} events.", {
                  when: new Date(detail.imported_at).toLocaleString(),
                  files: detail.files,
                  frames: detail.frames,
                  decoded: detail.decoded,
                  repeated: detail.repeated,
                  refused: detail.refused,
                  unknown: detail.unknown,
                  errors: detail.line_errors,
                  positions: detail.positions,
                  measurements: detail.measurements,
                  states: detail.states,
                  events: detail.events,
                })}
              </CardDescription>
            </CardHeader>
          </Panel>
          {bounds && map.data?.present ? (
            <OfflineMap bounds={bounds} dark={dark} points={points} />
          ) : (
            points.length > 0 && (
              <Callout kind="info">
                {t("{{count}} positions, but no map on this laptop to draw them on; load the project while online.", { count: points.length })}
              </Callout>
            )
          )}
          <Panel>
            <CardHeader>
              <CardTitle>{t("Trackers")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {detail.trackers.length === 0 && <p className="text-sm text-muted-foreground">{t("No tracker of the project on this card.")}</p>}
              {detail.trackers.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">{t("Tracker")}</th>
                      <th className="py-1 pr-3 text-right font-medium">{t("Frames")}</th>
                      <th className="py-1 pr-3 text-right font-medium">{t("Decoded")}</th>
                      <th className="py-1 pr-3 text-right font-medium">{t("Refused")}</th>
                      <th className="py-1 pr-3 text-right font-medium">{t("Positions")}</th>
                      <th className="py-1 font-medium">{t("Period")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.trackers.map((tr) => (
                      <tr key={tr.device_id} className="border-t">
                        <td className="py-1 pr-3">{tr.device_name}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{tr.frames}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{tr.decoded}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{tr.refused}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{tr.positions}</td>
                        <td className="py-1 whitespace-nowrap">
                          {tr.first_time && tr.last_time
                            ? `${new Date(tr.first_time).toLocaleDateString()} – ${new Date(tr.last_time).toLocaleDateString()}`
                            : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Panel>
          {detail.failures.length > 0 && (
            <Panel>
              <CardHeader>
                <CardTitle>{t("Not read")}</CardTitle>
                <CardDescription>{t("The first {{count}} frames that could not be read, with the reason.", { count: detail.failures.length })}</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">{t("File")}</th>
                      <th className="py-1 pr-3 text-right font-medium">{t("Line")}</th>
                      <th className="py-1 pr-3 font-medium">{t("Tracker")}</th>
                      <th className="py-1 font-medium">{t("Reason")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.failures.map((f, index) => (
                      <tr key={index} className="border-t align-top">
                        <td className="py-1 pr-3 font-mono text-xs">{f.file}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{f.line}</td>
                        <td className="py-1 pr-3">{f.device_name ?? f.dev_addr ?? ""}</td>
                        <td className="py-1">
                          <span className="font-mono text-xs text-muted-foreground">{f.code}</span> {f.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Panel>
          )}
          <Panel>
            <CardHeader>
              <CardTitle>{t("Files")}</CardTitle>
              <CardDescription>{t("Kept as they were on the card, for the upload to Protect.")}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">{t("File")}</th>
                    <th className="py-1 pr-3 text-right font-medium">{t("Frames")}</th>
                    <th className="py-1 pr-3 text-right font-medium">{t("Unreadable")}</th>
                    <th className="py-1 text-right font-medium">{t("Size")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.files_list.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="py-1 pr-3 font-mono text-xs">{f.folder ? `${f.folder}/` : ""}{f.name}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{f.frames}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{f.errors}</td>
                      <td className="py-1 text-right tabular-nums">{t("{{size}} kB", { size: (f.size / 1024).toFixed(0) })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Panel>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {t("Remove this card from the laptop")}
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
