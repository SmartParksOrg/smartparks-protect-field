import { offlineStyle, tilesUrl } from "@/components/map/useMap";

test("every project's tiles have an address of their own, so a switch reads a fresh archive", () => {
  expect(tilesUrl("6a50d563-9a4c-44bd-b85a-c733fb32c72f")).toMatch(/\/api\/map\/6a50d563-9a4c-44bd-b85a-c733fb32c72f\/tiles\.pmtiles$/);
  expect(tilesUrl(null)).toMatch(/\/api\/map\/tiles\.pmtiles$/);
  const source = offlineStyle("light", "p1").sources.protomaps;
  expect(source.type === "vector" && source.url).toMatch(/pmtiles:\/\/.*\/api\/map\/p1\/tiles\.pmtiles$/);
  expect(offlineStyle("dark", "p1").sprite).toMatch(/dark$/);
});
