/**
 * Marker images for MapLibre, Protect's `components/icons/markers.ts` cut to what the app
 * draws (decision F18): an icon rendered onto a canvas inside the marker family's shape
 * (round for entities, a rounded square for infrastructure and devices) with the state colour
 * as a ring, then registered with `map.addImage`. An offload station is a device, so a square
 * with Protect's green ring, the LoRaWAN gateway icon inside.
 */
import type { Map as MapLibreMap } from "maplibre-gl";

import loraGateway from "@/assets/icons/lora_gateway.svg?raw";

export type MarkerFamily = "entity" | "infrastructure";

const NORMAL = "#52735E";

export const STATION_MARKER = "marker:device.lora_gateway:normal";

async function svgToImage(svg: string, colour: string, size: number): Promise<HTMLImageElement> {
  const coloured = svg.replace(/currentColor/g, colour);
  const image = new Image(size, size);
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coloured)}`;
  await image.decode();
  return image;
}

export async function ensureMarkerImage(map: MapLibreMap, id: string, svg: string, family: MarkerFamily, colour = NORMAL): Promise<string> {
  if (map.hasImage(id)) return id;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return id;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = colour;
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (family === "entity") ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  else ctx.roundRect(4, 4, size - 8, size - 8, 10);
  ctx.fill();
  ctx.stroke();
  const icon = await svgToImage(svg, colour, size);
  const inset = 14;
  ctx.drawImage(icon, inset, inset, size - inset * 2, size - inset * 2);
  if (!map.hasImage(id)) map.addImage(id, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
  return id;
}

/** The offload station's marker, as Protect's device layer draws it. */
export function ensureStationMarker(map: MapLibreMap): Promise<string> {
  return ensureMarkerImage(map, STATION_MARKER, loraGateway, "infrastructure");
}
