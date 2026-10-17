/** The rows of the Trackers and the Offload stations pages (Tim, 2026-10-17): what the bundle
 * names joined with what the files brought, so a tracker or a station the files named but the
 * bundle does not know is listed too, marked so. */
import type { BundleDevice, Station, StationStats, Tracker } from "@/api/client";
import { colourTrackers } from "@/components/map/trackLayers";

export interface TrackerRow {
  device_id: string;
  name: string;
  entity_name: string | null;
  dev_eui: string | null;
  device_type_label: string | null;
  firmware_version: string | null;
  has_keys: boolean;
  known_to_bundle: boolean;
  positions: number;
  measurements: number;
  first_time: string | null;
  last_time: string | null;
  colour: string | undefined;
}

/** The trackers the bundle names (the project's devices with an LP0 address, the stations
 * aside) joined with what the files brought for each; a tracker the files named but the bundle
 * does not know is listed too, marked so. */
export function trackerRows(devices: BundleDevice[], trackers: Tracker[]): TrackerRow[] {
  const stats = new Map(trackers.map((tr) => [tr.device_id, tr]));
  const colours = colourTrackers(trackers.map((tr) => tr.device_id));
  const rows: TrackerRow[] = devices
    .filter((d) => !d.is_station && d.has_address)
    .map((d) => {
      const s = stats.get(d.id);
      return {
        device_id: d.id,
        name: d.name,
        entity_name: d.entity_name,
        dev_eui: d.dev_eui,
        device_type_label: d.device_type_label,
        firmware_version: d.firmware_version,
        has_keys: d.has_keys,
        known_to_bundle: true,
        positions: s?.positions ?? 0,
        measurements: s?.measurements ?? 0,
        first_time: s?.first_time ?? null,
        last_time: s?.last_time ?? null,
        colour: colours.get(d.id),
      };
    });
  const listed = new Set(rows.map((r) => r.device_id));
  for (const tr of trackers) {
    if (listed.has(tr.device_id)) continue;
    rows.push({ device_id: tr.device_id, name: tr.device_name, entity_name: null, dev_eui: null, device_type_label: null, firmware_version: null, has_keys: false, known_to_bundle: false, positions: tr.positions, measurements: tr.measurements, first_time: tr.first_time, last_time: tr.last_time, colour: colours.get(tr.device_id) });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}


export interface StationRow {
  key: string;
  device_id: string | null;
  name: string;
  station_eui: string;
  lat: number | null;
  lon: number | null;
  known_to_bundle: boolean;
  cards: number;
  files: number;
  frames: number;
  pending: number;
  last_read: string | null;
}

/** The stations the bundle names joined with what their files brought; a station the files
 * named but the bundle does not know is listed too, marked so. The row's key is the device id
 * when known, else the EUI, which the station page takes either way. */
export function stationRows(stations: Station[], stats: StationStats[]): StationRow[] {
  const byEui = new Map(stats.map((s) => [s.station_eui.toUpperCase(), s]));
  const rows: StationRow[] = stations.map((s) => {
    const st = byEui.get(s.station_eui.toUpperCase());
    return { key: s.device_id, device_id: s.device_id, name: s.name, station_eui: s.station_eui, lat: s.lat, lon: s.lon, known_to_bundle: true, cards: st?.cards ?? 0, files: st?.files ?? 0, frames: st?.frames ?? 0, pending: (st?.pending ?? 0) + (st?.failed ?? 0), last_read: st?.last_read ?? null };
  });
  const listed = new Set(rows.map((r) => r.station_eui.toUpperCase()));
  for (const st of stats) {
    if (listed.has(st.station_eui.toUpperCase())) continue;
    rows.push({ key: st.station_device_id ?? st.station_eui, device_id: st.station_device_id, name: st.station_name ?? st.station_eui, station_eui: st.station_eui, lat: null, lon: null, known_to_bundle: false, cards: st.cards, files: st.files, frames: st.frames, pending: st.pending + st.failed, last_read: st.last_read });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

