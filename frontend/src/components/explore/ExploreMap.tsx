import { Compass, Layers, Maximize2, Minus, Plus } from "lucide-react";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { ControlStrip } from "@/components/map/ControlStrip";
import { bindTrackPointClicks, ensureStationLayers, ensureTrackLayers, setStations, setTracks, type StationMarker, type TrackLayer, trackPointKey } from "@/components/map/trackLayers";
import { FLAVOURS, type Flavour, useMap } from "@/components/map/useMap";
import { useTheme } from "@/hooks/useTheme";
import { usePreference } from "@/hooks/usePreference";
import { formatInZone } from "@/lib/analytics";
import { boundsOfTracks, pointsAt } from "@/lib/explore";
import { t as mark } from "@/lib/i18nMark";

const FLAVOUR_LABELS: Record<Flavour | "auto", string> = {
  auto: mark("Follows the theme"),
  light: mark("Light"),
  dark: mark("Dark"),
  white: mark("White"),
  grayscale: mark("Grayscale"),
  black: mark("Black"),
};

/**
 * The map of the Data explorer, Protect's Explore map (its decision D153) on the offline
 * tiles: the tracks of the selection over the period with the offload stations, Protect's
 * control strips (zoom, north and fit bottom right; Layers top left with the trackers to show
 * or hide and the base map's flavour), a time slider that moves the marked moment along the
 * tracks, and the point of every track at that moment ringed. Hovering a track point marks its
 * moment in the other views; a click pins it.
 */
export function ExploreMap({
  tracks,
  stations,
  window,
  timezone,
  marked,
  fitKey,
  hidden,
  onHidden,
  onHover,
  onPick,
}: {
  tracks: TrackLayer[];
  stations: StationMarker[];
  window: { from: number; to: number };
  timezone: string;
  marked: number | null;
  /** Changes when the selection changes: the map fits the tracks again. */
  fitKey: string;
  /** The trackers hidden on the map (the Layers panel). */
  hidden: string[];
  onHidden: (ids: string[]) => void;
  onHover: (ms: number | null) => void;
  onPick: (ms: number) => void;
}) {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const [chosenFlavour, setChosenFlavour] = usePreference<Flavour | "auto">("map_flavour", "auto");
  const flavour: Flavour = chosenFlavour === "auto" ? (resolved === "dark" ? "dark" : "light") : chosenFlavour;
  const container = useRef<HTMLDivElement | null>(null);
  const initialBounds = useMemo(() => {
    const b = boundsOfTracks(tracks);
    return b ? ([b[0][0], b[0][1], b[1][0], b[1][1]] as [number, number, number, number]) : null;
    // the first fit alone; later fits follow fitKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { mapRef, ready, cornerHost } = useMap(container, flavour, initialBounds);
  const handlers = useRef({ onHover, onPick });
  useEffect(() => {
    handlers.current = { onHover, onPick };
  }, [onHover, onPick]);
  const shownTracks = useMemo(() => tracks.filter((tr) => !hidden.includes(tr.ownerId)), [tracks, hidden]);

  useEffect(() => {
    const map = mapRef.current;
    const element = container.current;
    if (!map || !ready || !element) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(element);
    ensureStationLayers(map);
    ensureTrackLayers(map);
    const unbind = bindTrackPointClicks(map, (props) => handlers.current.onPick(Date.parse(props.time)));
    const onMove = (e: MapLayerMouseEvent) => {
      const time = e.features?.[0]?.properties?.time;
      if (typeof time === "string") handlers.current.onHover(Date.parse(time));
    };
    const onLeave = () => handlers.current.onHover(null);
    map.on("mousemove", "track-points", onMove);
    map.on("mouseleave", "track-points", onLeave);
    return () => {
      observer.disconnect();
      unbind();
      map.off("mousemove", "track-points", onMove);
      map.off("mouseleave", "track-points", onLeave);
    };
  }, [mapRef, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setStations(map, stations);
  }, [mapRef, ready, stations]);

  const fitted = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setTracks(map, shownTracks);
    const bounds = boundsOfTracks(shownTracks);
    if (bounds && fitted.current !== fitKey) {
      fitted.current = fitKey;
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
    }
  }, [mapRef, ready, shownTracks, fitKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("track-point-selected")) return;
    const keys = marked === null ? [] : pointsAt(shownTracks, marked).map((p) => trackPointKey(p.ownerId, p.time));
    map.setFilter("track-point-selected", ["in", ["get", "key"], ["literal", keys]]);
  }, [mapRef, ready, shownTracks, marked]);

  const [layersOpen, setLayersOpen] = useState(false);
  const [sliding, setSliding] = useState<number | null>(null);
  const value = sliding ?? marked ?? window.to;
  const fit = () => {
    const map = mapRef.current;
    const bounds = boundsOfTracks(shownTracks);
    if (map && bounds) map.fitBounds(bounds, { padding: 48, maxZoom: 14 });
  };
  const corner = cornerHost
    ? createPortal(
        <ControlStrip
          label={t("Zoom and north")}
          items={[
            { key: "in", icon: Plus, label: t("Zoom in"), onClick: () => mapRef.current?.zoomIn() },
            { key: "out", icon: Minus, label: t("Zoom out"), onClick: () => mapRef.current?.zoomOut() },
            { key: "north", icon: Compass, label: t("North up"), onClick: () => mapRef.current?.resetNorthPitch() },
            { key: "fit", icon: Maximize2, label: t("Fit the tracks"), disabled: shownTracks.length === 0, onClick: fit },
          ]}
        />,
        cornerHost,
      )
    : null;

  return (
    <div className="absolute inset-0">
      <div ref={container} className="absolute! inset-0 z-0" />
      {corner}
      {/* Layers top left, as on Protect's map (its decision D174): the trackers and the base map */}
      <div className="absolute top-3 left-3 z-10 flex items-start gap-2">
        <ControlStrip
          label={t("Layers")}
          items={[{ key: "layers", icon: Layers, label: t("Layers"), active: layersOpen, emphasis: true, badge: shownTracks.length, onClick: () => setLayersOpen((o) => !o) }]}
        />
        {layersOpen && (
          <div className="w-64 rounded-md border bg-card/95 p-3 text-sm shadow" role="dialog" aria-label={t("Layers")}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t("Trackers")}</p>
            <ul className="flex flex-col gap-1">
              {tracks.map((tr) => {
                const on = !hidden.includes(tr.ownerId);
                return (
                  <li key={tr.ownerId}>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" className="accent-primary" checked={on} onChange={() => onHidden(on ? [...hidden, tr.ownerId] : hidden.filter((id) => id !== tr.ownerId))} />
                      <span className="inline-block size-2.5 rounded-full" style={{ background: tr.color }} />
                      <span className="truncate">{tr.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{tr.times.length}</span>
                    </label>
                  </li>
                );
              })}
              {tracks.length === 0 && <li className="text-xs text-muted-foreground">{t("No positions in this period.")}</li>}
            </ul>
            <div className="mt-2 flex gap-2 text-xs">
              <button type="button" className="underline underline-offset-4" onClick={() => onHidden([])}>
                {t("Show all")}
              </button>
              <button type="button" className="underline underline-offset-4" onClick={() => onHidden(tracks.map((tr) => tr.ownerId))}>
                {t("Hide all")}
              </button>
            </div>
            <p className="mt-3 mb-1 text-xs font-medium text-muted-foreground">{t("Base map")}</p>
            <select className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={chosenFlavour} onChange={(e) => setChosenFlavour(e.target.value as Flavour | "auto")} aria-label={t("Base map")}>
              {(["auto", ...FLAVOURS] as const).map((f) => (
                <option key={f} value={f}>
                  {t(FLAVOUR_LABELS[f])}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">{t("{{count}} stations on the map", { count: stations.length })}</p>
          </div>
        )}
      </div>
      {/* the time slider (Protect's decision D153): its moment is the marked one, released it pins */}
      {Number.isFinite(window.from) && Number.isFinite(window.to) && window.to > window.from && (
        <div className="absolute right-14 bottom-8 left-3 z-10 flex items-center gap-3 rounded-md border bg-card/95 px-3 py-1.5 text-xs shadow">
          <span className="hidden whitespace-nowrap text-muted-foreground sm:inline">{formatInZone(new Date(window.from).toISOString(), timezone)}</span>
          <input
            type="range"
            aria-label={t("Moment on the tracks")}
            className="min-w-0 flex-1 accent-primary"
            min={window.from}
            max={window.to}
            step={60_000}
            value={Math.min(window.to, Math.max(window.from, value))}
            onChange={(e) => {
              const ms = Number(e.target.value);
              setSliding(ms);
              onHover(ms);
            }}
            onPointerUp={() => {
              if (sliding !== null) onPick(sliding);
              setSliding(null);
            }}
            onKeyUp={() => {
              if (sliding !== null) onPick(sliding);
              setSliding(null);
            }}
          />
          <span className="whitespace-nowrap font-medium">{formatInZone(new Date(value).toISOString(), timezone)}</span>
        </div>
      )}
      {tracks.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-md border bg-card/95 px-3 py-1.5 text-sm text-muted-foreground shadow">{t("No positions in this period.")}</span>
        </div>
      )}
    </div>
  );
}
