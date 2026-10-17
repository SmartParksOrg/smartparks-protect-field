import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { api, type MapState, type Station, type Tracker } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { bindStationClicks, bindTrackPointClicks, colourTrackers, ensureStationLayers, ensureTrackLayers, setStations, setTracks, type StationMarker, type TrackLayer } from "@/components/map/trackLayers";
import { type Flavour, useMap } from "@/components/map/useMap";
import { useTheme } from "@/hooks/useTheme";

/** The small map of the Overview and of the entity pages (Tim, 2026-10-17): where the offload
 * stations stand, with Protect's marker, and the last known position of every tracker the app
 * knows, each in the colour it has everywhere else; a click on a station or a tracker opens its
 * page. `trackerIds` and `stationIds` narrow it to an entity's own page. Without the project's
 * map on the laptop the panel says so. */
export function OverviewMap({ trackerIds, stationIds, className = "h-56" }: { trackerIds?: string[]; stationIds?: string[]; className?: string } = {}) {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const flavour: Flavour = resolved === "dark" ? "dark" : "light";
  const map = useQuery({ queryKey: queryKeys.map, queryFn: () => api<MapState>("/api/map") });
  const trackers = useQuery({ queryKey: queryKeys.trackers, queryFn: () => api<Tracker[]>("/api/trackers") });
  const stationsQuery = useQuery({ queryKey: queryKeys.stations, queryFn: () => api<Station[]>("/api/bundle/stations") });
  const stations = useMemo<StationMarker[]>(
    () =>
      (stationsQuery.data ?? [])
        .filter((s): s is Station & { lat: number; lon: number } => s.lat !== null && s.lon !== null)
        .filter((s) => !stationIds || stationIds.includes(s.device_id))
        .map((s) => ({ device_id: s.device_id, name: s.name, lat: s.lat, lon: s.lon })),
    [stationsQuery.data, stationIds],
  );
  const everyTracker = useMemo(() => trackers.data ?? [], [trackers.data]);
  const all = useMemo(() => everyTracker.filter((tr) => !trackerIds || trackerIds.includes(tr.device_id)), [everyTracker, trackerIds]);
  // the colours follow every tracker's place in the list, so an entity page keeps the colour
  const colours = useMemo(() => colourTrackers(everyTracker.map((tr) => tr.device_id)), [everyTracker]);
  const last = useMemo(
    () =>
      all
        .filter((tr): tr is Tracker & { last_lat: number; last_lon: number; last_time: string } => tr.last_lat !== null && tr.last_lon !== null && tr.last_time !== null)
        .map((tr) => ({ ownerId: tr.device_id, name: tr.device_name, color: colours.get(tr.device_id), geometry: { type: "MultiPoint" as const, coordinates: [[tr.last_lon, tr.last_lat]] }, times: [tr.last_time] })),
    [all, colours],
  );
  const bounds = useMemo<[number, number, number, number] | null>(() => {
    const lons = [...stations.map((s) => s.lon), ...last.map((l) => l.geometry.coordinates[0][0])];
    const lats = [...stations.map((s) => s.lat), ...last.map((l) => l.geometry.coordinates[0][1])];
    if (lons.length === 0) {
      const m = map.data;
      return m?.present && m.west !== null && m.south !== null && m.east !== null && m.north !== null ? [m.west, m.south, m.east, m.north] : null;
    }
    const pad = 0.01;
    return [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad];
  }, [stations, last, map.data]);
  const present = map.data?.present === true;
  if (!present || bounds === null) {
    return (
      <p className="text-sm text-muted-foreground">
        {map.data && !present ? t("No map on this laptop yet. Load the project while you are online; the map comes with it.") : t("Nothing to place on the map yet.")}
      </p>
    );
  }
  return <OverviewMapCanvas flavour={flavour} bounds={bounds} stations={stations} last={last} className={className} />;
}

function OverviewMapCanvas({ flavour, bounds, stations, last, className }: { flavour: Flavour; bounds: [number, number, number, number]; stations: StationMarker[]; last: TrackLayer[]; className: string }) {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement | null>(null);
  const { mapRef, ready } = useMap(container, flavour, bounds);
  const stationsRef = useRef(stations);
  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    ensureTrackLayers(map);
    let unbindStations = () => undefined as void;
    void ensureStationLayers(map).then(() => {
      setStations(map, stationsRef.current);
      unbindStations = bindStationClicks(map, (id) => void navigate(`/stations/${id}`));
    });
    const unbindTrackers = bindTrackPointClicks(map, (props) => void navigate(`/trackers/${props.owner_id}`));
    const observer = new ResizeObserver(() => map.resize());
    if (container.current) observer.observe(container.current);
    return () => {
      observer.disconnect();
      unbindStations();
      unbindTrackers();
    };
  }, [mapRef, ready, navigate]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setTracks(map, last);
    setStations(map, stations);
    map.fitBounds([bounds[0], bounds[1], bounds[2], bounds[3]], { padding: 32, maxZoom: 13, duration: 0 });
  }, [mapRef, ready, last, stations, bounds]);
  return (
    <div className={`relative w-full overflow-hidden rounded-md border ${className}`}>
      <div ref={container} className="absolute! inset-0" />
    </div>
  );
}
