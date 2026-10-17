import { layers, namedFlavor } from "@protomaps/basemaps";
import { Protocol } from "pmtiles";
import { useEffect, useRef } from "react";

import { maplibregl } from "@/lib/maplibre";

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface MapPoint {
  lat: number;
  lon: number;
  time: string;
  label: string;
}

/** The positions as GeoJSON: a line per label in time order, and the points. */
function pointsToGeoJson(points: MapPoint[]): GeoJSON.FeatureCollection {
  const byLabel = new Map<string, MapPoint[]>();
  for (const point of points) {
    const list = byLabel.get(point.label) ?? [];
    list.push(point);
    byLabel.set(point.label, list);
  }
  const features: GeoJSON.Feature[] = [];
  for (const [label, list] of byLabel) {
    const ordered = [...list].sort((a, b) => a.time.localeCompare(b.time));
    if (ordered.length > 1) {
      features.push({
        type: "Feature",
        properties: { label, kind: "track" },
        geometry: { type: "LineString", coordinates: ordered.map((p) => [p.lon, p.lat]) },
      });
    }
    for (const p of ordered) {
      features.push({
        type: "Feature",
        properties: { label, kind: "fix", time: p.time },
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

let protocolRegistered = false;

/** The offline map (decision D4): MapLibre over the project's PMTiles file served by the local
 * backend with range requests, drawn with Protomaps' basemap style whose sprites and glyphs
 * ship inside Field (`public/map/`), so nothing is fetched from the internet. */
export function OfflineMap({ bounds, dark, points = [] }: { bounds: MapBounds; dark: boolean; points?: MapPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InstanceType<typeof maplibregl.Map> | null>(null);
  useEffect(() => {
    if (!container.current) return;
    if (!protocolRegistered) {
      maplibregl.addProtocol("pmtiles", new Protocol().tile);
      protocolRegistered = true;
    }
    const origin = window.location.origin;
    const map = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
        sprite: `${origin}/map/sprites/${dark ? "dark" : "light"}`,
        sources: {
          protomaps: {
            type: "vector",
            url: `pmtiles://${origin}/api/map/tiles.pmtiles`,
            attribution:
              '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>, <a href="https://protomaps.com">Protomaps</a>',
          },
        },
        layers: layers("protomaps", namedFlavor(dark ? "dark" : "light"), { lang: "en" }),
      },
      bounds: [bounds.west, bounds.south, bounds.east, bounds.north],
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: false },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => {
      map.addSource("positions", { type: "geojson", data: pointsToGeoJson(points) });
      map.addLayer({
        id: "tracks",
        type: "line",
        source: "positions",
        filter: ["==", ["get", "kind"], "track"],
        paint: { "line-color": "#52735E", "line-width": 2, "line-opacity": 0.8 },
      });
      map.addLayer({
        id: "fixes",
        type: "circle",
        source: "positions",
        filter: ["==", ["get", "kind"], "fix"],
        paint: {
          "circle-radius": 4,
          "circle-color": "#52735E",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      mapRef.current = map;
    });
    return () => {
      mapRef.current = null;
      map.remove();
    };
    // the points are refreshed by the effect below; a new box or theme rebuilds the map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, dark]);
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("positions");
    if (source && "setData" in source) {
      (source as { setData: (data: GeoJSON.FeatureCollection) => void }).setData(pointsToGeoJson(points));
    }
  }, [points]);
  return <div ref={container} className="z-0 h-[60vh] min-h-80 w-full rounded-md border" />;
}
