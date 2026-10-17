/** The Data explorer as one canvas (decision D25), after Protect's `lib/explore.ts` (its
 * decisions D150 to D155): one selection of trackers over a period, looked at as a table, a
 * chart or a map. The state is the URL, so a link reproduces it. */
import type { TrackLayer } from "@/components/map/trackLayers";
import { type ChartType, CHART_TYPES, RANGE_PRESETS, type RangePreset } from "@/lib/analytics";
import { cellOf, type RecordColumn, type RecordRow } from "@/lib/records";

export type ExploreMode = "table" | "chart" | "map";
export const MAX_METRICS = 12;

export interface ExploreState {
  mode: ExploreMode;
  trackers: string[];
  range: RangePreset | "custom";
  from: string | null;
  to: string | null;
  /** The metrics chosen; null is "every metric the selection reported", the start. */
  metrics: string[] | null;
  chart: ChartType;
  /** The pinned moment. */
  at: string | null;
}

function validTime(raw: string | null): string | null {
  const ms = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function readExploreState(params: URLSearchParams): ExploreState {
  const raw = params.get("mode");
  const range = params.get("range") ?? "30d";
  const chart = params.get("chart");
  return {
    mode: raw === "chart" || raw === "table" ? raw : "map",
    trackers: params.getAll("tracker"),
    range: range === "custom" ? "custom" : ((range in RANGE_PRESETS ? range : "30d") as RangePreset),
    from: params.get("from"),
    to: params.get("to"),
    metrics: params.has("metric") ? params.getAll("metric").filter((m) => m !== "") : null,
    chart: CHART_TYPES.includes(chart as ChartType) ? (chart as ChartType) : "line",
    at: validTime(params.get("at")),
  };
}

export function writeExploreState(state: ExploreState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("mode", state.mode);
  for (const id of state.trackers) params.append("tracker", id);
  params.set("range", state.range);
  if (state.range === "custom") {
    if (state.from) params.set("from", state.from);
    if (state.to) params.set("to", state.to);
  }
  if (state.metrics !== null) {
    if (state.metrics.length === 0) params.set("metric", "");
    for (const m of state.metrics) params.append("metric", m);
  }
  if (state.chart !== "line") params.set("chart", state.chart);
  if (state.at) params.set("at", state.at);
  return params;
}

/** The period's bounds: a preset counts back from the newest record of the selection. */
export function windowFor(state: ExploreState, latest: string | null): { from: string | null; to: string | null } {
  if (state.range === "custom") {
    return { from: validTime(state.from), to: validTime(state.to) };
  }
  const hours = RANGE_PRESETS[state.range].hours;
  if (hours === null) return { from: null, to: null };
  const end = latest ? new Date(latest) : new Date();
  return { from: new Date(end.getTime() - hours * 3600_000).toISOString(), to: null };
}

export interface ChartSeries {
  ownerId: string;
  name: string;
  /** `[time in ms, value]`, oldest first. */
  data: number[][];
}

export interface ChartGroup {
  metric: string;
  label: string;
  unit: string | null;
  series: ChartSeries[];
}

function numberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return null;
}

/** One group per metric, one series per tracker, from the loaded rows. */
export function chartGroups(rows: RecordRow[], metrics: string[], columns: RecordColumn[]): ChartGroup[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const groups: ChartGroup[] = [];
  for (const metric of metrics) {
    const column = byKey.get(`m:${metric}`);
    if (!column) continue;
    const series = new Map<string, ChartSeries>();
    for (const row of rows) {
      const value = numberOf(cellOf(row, column));
      if (value === null) continue;
      let s = series.get(row.device_id);
      if (!s) {
        s = { ownerId: row.device_id, name: row.device_name, data: [] };
        series.set(row.device_id, s);
      }
      s.data.push([Date.parse(row.time), value]);
    }
    for (const s of series.values()) s.data.sort((a, b) => a[0] - b[0]);
    if (series.size > 0) groups.push({ metric, label: column.label, unit: column.unit ?? null, series: [...series.values()] });
  }
  return groups;
}

/** The chartable metrics among the columns: the numeric measurements. */
export function chartableColumns(columns: RecordColumn[]): RecordColumn[] {
  return columns.filter((c) => c.kind === "metric" && c.numeric);
}

/** The units on the chart in the order the metrics come: the first is the left axis, every
 * other unit shares the right axis. A metric without a unit counts as its own unit. */
export function unitAxes(groups: ChartGroup[]): string[] {
  const units: string[] = [];
  for (const g of groups) {
    const unit = g.unit ?? g.label;
    if (!units.includes(unit)) units.push(unit);
  }
  return units;
}

export function axisIndexOf(group: ChartGroup, units: string[]): 0 | 1 {
  return units.indexOf(group.unit ?? group.label) <= 0 ? 0 : 1;
}

/** The time of the loaded row nearest to a moment; the rows come newest first. */
export function nearestRowTime(rows: RecordRow[], ms: number): string | null {
  if (rows.length === 0) return null;
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (Date.parse(rows[mid].time) > ms) lo = mid + 1;
    else hi = mid;
  }
  const candidates = [rows[lo], rows[lo - 1]].filter(Boolean);
  let best = candidates[0];
  for (const c of candidates) if (Math.abs(Date.parse(c.time) - ms) < Math.abs(Date.parse(best.time) - ms)) best = c;
  return best.time;
}

/** The tracks of the loaded rows: one per tracker, oldest first. */
export function tracksOf(rows: RecordRow[], colours: Map<string, string>): TrackLayer[] {
  const byOwner = new Map<string, { name: string; coordinates: number[][]; times: string[] }>();
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.lat === null || row.lon === null) continue;
    let track = byOwner.get(row.device_id);
    if (!track) {
      track = { name: row.device_name, coordinates: [], times: [] };
      byOwner.set(row.device_id, track);
    }
    track.coordinates.push([row.lon, row.lat]);
    track.times.push(row.time);
  }
  return [...byOwner.entries()].map(([ownerId, track]) => ({
    ownerId,
    name: track.name,
    color: colours.get(ownerId),
    geometry: track.coordinates.length > 1 ? { type: "LineString", coordinates: track.coordinates } : { type: "MultiPoint", coordinates: track.coordinates },
    times: track.times,
  }));
}

/** The bounding box of the tracks, `[[west, south], [east, north]]`, or null without points. */
export function boundsOfTracks(tracks: TrackLayer[]): [[number, number], [number, number]] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const track of tracks) {
    const coordinates = track.geometry.type === "LineString" || track.geometry.type === "MultiPoint" ? track.geometry.coordinates : [];
    for (const [lon, lat] of coordinates) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return Number.isFinite(west)
    ? [
        [west, south],
        [east, north],
      ]
    : null;
}

/** The point of each track at or before a moment: the marked moment on the map. */
export function pointsAt(tracks: TrackLayer[], ms: number): { ownerId: string; time: string }[] {
  const out: { ownerId: string; time: string }[] = [];
  for (const track of tracks) {
    let found: string | null = null;
    for (const time of track.times) {
      if (Date.parse(time) > ms) break;
      found = time;
    }
    if (found) out.push({ ownerId: track.ownerId, time: found });
  }
  return out;
}
