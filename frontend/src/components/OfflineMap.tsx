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

let protocolRegistered = false;

/** The offline map (decision D4): MapLibre over the project's PMTiles file served by the local
 * backend with range requests, drawn with Protomaps' basemap style whose sprites and glyphs
 * ship inside Field (`public/map/`), so nothing is fetched from the internet. */
export function OfflineMap({ bounds, dark }: { bounds: MapBounds; dark: boolean }) {
  const container = useRef<HTMLDivElement>(null);
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
    return () => map.remove();
  }, [bounds, dark]);
  return <div ref={container} className="z-0 h-[60vh] min-h-80 w-full rounded-md border" />;
}
