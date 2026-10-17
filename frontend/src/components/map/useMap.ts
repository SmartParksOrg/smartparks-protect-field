/** One MapLibre map bound to a container, after Protect's `useMap` (its decisions D137 and
 * D173): the offline PMTiles basemap in a Protomaps flavour, two empty controls the page
 * renders its strips into (the tools top right, zoom and north bottom right), the scale bottom
 * left, and `ready` once the style has loaded so layers can be added. */
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { IControl, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { type RefObject, useEffect, useRef, useState } from "react";

import { maplibregl } from "@/lib/maplibre";

export const FLAVOURS = ["light", "dark", "white", "grayscale", "black"] as const;
export type Flavour = (typeof FLAVOURS)[number];

let protocolRegistered = false;

class StripHost implements IControl {
  readonly element = document.createElement("div");
  onAdd(): HTMLElement {
    this.element.className = "maplibregl-ctrl protect-strip";
    return this.element;
  }
  onRemove(): void {
    this.element.remove();
  }
}

/** The offline map's style: the project's PMTiles, the glyphs and sprites shipped with the
 * app, drawn in a Protomaps flavour. */
export function offlineStyle(flavour: Flavour): StyleSpecification {
  const origin = window.location.origin;
  const dark = flavour === "dark" || flavour === "black";
  return {
    version: 8,
    glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/map/sprites/${dark ? "dark" : "light"}`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${origin}/api/map/tiles.pmtiles`,
        attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>, <a href="https://protomaps.com">Protomaps</a>',
      },
    },
    layers: layers("protomaps", namedFlavor(flavour), { lang: "en" }),
  };
}

export function useMap(container: RefObject<HTMLDivElement | null>, flavour: Flavour, bounds: [number, number, number, number] | null) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [stripHost, setStripHost] = useState<HTMLElement | null>(null);
  const [cornerHost, setCornerHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    if (!protocolRegistered) {
      maplibregl.addProtocol("pmtiles", new Protocol().tile);
      protocolRegistered = true;
    }
    const map = new maplibregl.Map({
      container: container.current,
      style: offlineStyle(flavour),
      ...(bounds ? { bounds, fitBoundsOptions: { padding: 24 } } : { center: [0, 0] as [number, number], zoom: 1 }),
      attributionControl: { compact: true },
    });
    const strip = new StripHost();
    map.addControl(strip, "top-right");
    setStripHost(strip.element);
    const corner = new StripHost();
    map.addControl(corner, "bottom-right");
    setCornerHost(corner.element);
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => {
      map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      setReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
      setStripHost(null);
      setCornerHost(null);
    };
    // the map is created once; a new flavour goes through setStyle below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setReady(false);
    map.setStyle(offlineStyle(flavour));
    map.once("style.load", () => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flavour]);

  return { mapRef, ready, stripHost, cornerHost };
}
