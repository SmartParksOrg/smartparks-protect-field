/** The tracks on the map (decision D25), Protect's `layers.ts` cut to what the app draws: the
 * track source and its four layers, the colours shared with the chart and the table, the
 * point click, the marked point, and the offload stations as square markers. */
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";

import { ensureStationMarker, STATION_MARKER } from "@/components/icons/markers";
import { PALETTE } from "@/lib/chartStyle";

export const TRACK_SOURCE = "track";
export const STATION_SOURCE = "stations";

/** A colour past the palette: hues spread by the golden angle. */
function extraColour(index: number): string {
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue} 60% 38%)`;
}

/** Distinct colours for the trackers shown together, steady in the order they are listed, the
 * same on the map, the chart and the table (Protect's `assignTrackColors` in small). */
export function colourTrackers(ids: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  ids.forEach((id, index) => out.set(id, index < PALETTE.length ? PALETTE[index] : extraColour(index - PALETTE.length)));
  return out;
}

export interface TrackLayer {
  ownerId: string;
  name: string;
  geometry: GeoJSON.Geometry;
  times: string[];
  color?: string;
}

export interface TrackPointProperties {
  owner_id: string;
  time: string;
  key: string;
  color: string;
}

export const trackPointKey = (ownerId: string, time: string): string => `${ownerId}|${time}`;

export function ensureTrackLayers(map: MapLibreMap): void {
  if (map.getSource(TRACK_SOURCE)) return;
  map.addSource(TRACK_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "track-line",
    type: "line",
    source: TRACK_SOURCE,
    filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": ["coalesce", ["get", "color"], "#2F4A3A"], "line-width": 3, "line-opacity": 0.85 },
  });
  map.addLayer({
    id: "track-points",
    type: "circle",
    source: TRACK_SOURCE,
    filter: ["==", ["geometry-type"], "Point"],
    paint: { "circle-radius": 3, "circle-color": "#ffffff", "circle-stroke-color": ["coalesce", ["get", "color"], "#2F4A3A"], "circle-stroke-width": 1.5 },
  });
  // the point a person clicked or the moment the slider stands at: a larger ring on top
  map.addLayer({
    id: "track-point-selected",
    type: "circle",
    source: TRACK_SOURCE,
    filter: ["==", ["get", "key"], ""],
    paint: { "circle-radius": 7, "circle-color": ["coalesce", ["get", "color"], "#2F4A3A"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
  });
  for (const layer of ["track-points", "track-point-selected"]) {
    map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
  }
}

/** Bind the track point click; the returned function unbinds it. */
export function bindTrackPointClicks(map: MapLibreMap, onClick: (props: TrackPointProperties) => void): () => void {
  const onPoint = (e: MapLayerMouseEvent) => {
    const feature = e.features?.[0];
    if (feature) onClick(feature.properties as unknown as TrackPointProperties);
  };
  map.on("click", "track-points", onPoint);
  map.on("click", "track-point-selected", onPoint);
  return () => {
    map.off("click", "track-points", onPoint);
    map.off("click", "track-point-selected", onPoint);
  };
}

/** Every track shown at once, each in its colour. */
export function setTracks(map: MapLibreMap, tracks: TrackLayer[]): void {
  const source = map.getSource(TRACK_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  const features: GeoJSON.Feature[] = [];
  for (const track of tracks) {
    const color = track.color ?? PALETTE[0];
    features.push({ type: "Feature", geometry: track.geometry, properties: { color, owner_id: track.ownerId } });
    const coordinates = track.geometry.type === "LineString" ? track.geometry.coordinates : track.geometry.type === "MultiPoint" ? track.geometry.coordinates : [];
    coordinates.forEach((c, i) =>
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: c },
        properties: { color, time: track.times[i], owner_id: track.ownerId, name: track.name, key: trackPointKey(track.ownerId, track.times[i]) },
      }),
    );
  }
  source.setData({ type: "FeatureCollection", features });
}

export interface StationMarker {
  device_id: string;
  name: string;
  lat: number;
  lon: number;
}

/** The offload stations as Protect draws them (F18): its device marker, the LoRaWAN gateway
 * icon in a rounded square with the green ring, and the name under it, as on Protect's entity
 * layer. The image is drawn once and registered before the layer is added. */
export async function ensureStationLayers(map: MapLibreMap): Promise<void> {
  if (map.getSource(STATION_SOURCE)) return;
  await ensureStationMarker(map);
  if (map.getSource(STATION_SOURCE)) return;
  map.addSource(STATION_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "station-markers",
    type: "symbol",
    source: STATION_SOURCE,
    layout: {
      "icon-image": STATION_MARKER,
      "icon-size": 0.9,
      "icon-allow-overlap": true,
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-font": ["Noto Sans Regular"],
      "text-offset": [0, 1.8],
      "text-anchor": "top",
      "text-optional": true,
    },
    paint: { "text-color": "#1f2a24", "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
  });
}

/** Bind the station marker click; the returned function unbinds it. */
export function bindStationClicks(map: MapLibreMap, onClick: (deviceId: string) => void): () => void {
  const onMarker = (e: MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.device_id;
    if (typeof id === "string") onClick(id);
  };
  const enter = () => (map.getCanvas().style.cursor = "pointer");
  const leave = () => (map.getCanvas().style.cursor = "");
  map.on("click", "station-markers", onMarker);
  map.on("mouseenter", "station-markers", enter);
  map.on("mouseleave", "station-markers", leave);
  return () => {
    map.off("click", "station-markers", onMarker);
    map.off("mouseenter", "station-markers", enter);
    map.off("mouseleave", "station-markers", leave);
  };
}

export function setStations(map: MapLibreMap, stations: StationMarker[]): void {
  const source = map.getSource(STATION_SOURCE) as GeoJSONSource | undefined;
  if (!source) return;
  source.setData({
    type: "FeatureCollection",
    features: stations.map((s) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { name: s.name, device_id: s.device_id } })),
  });
}
