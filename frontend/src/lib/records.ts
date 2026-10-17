/** The records table of the Data explorer (decision D25), after Protect's `lib/records.ts`:
 * the rows the backend merges per tracker and moment, the columns they carry, one cell's
 * value, the order and the filters. */
import { t } from "@/lib/i18nMark";
import type { MetricDefinition } from "@/api/client";
import { scaledUnit } from "@/lib/format";

export interface RecordRow {
  time: string;
  device_id: string;
  device_name: string;
  entity_id: string | null;
  lat: number | null;
  lon: number | null;
  values: Record<string, number | string | boolean | null>;
}

export type CellValue = number | string | boolean | null;

export interface RecordColumn {
  key: string;
  label: string;
  unit?: string | null;
  kind: "fixed" | "metric";
  numeric: boolean;
  /** A factor on the stored value before it is shown, with the unit people read. */
  factor?: number;
}

export const FIXED: RecordColumn[] = [
  { key: "time", label: t("Time"), kind: "fixed", numeric: false },
  { key: "tracker", label: t("Tracker"), kind: "fixed", numeric: false },
  { key: "lat", label: t("Latitude"), kind: "fixed", numeric: true },
  { key: "lon", label: t("Longitude"), kind: "fixed", numeric: true },
];

/** The fixed columns and one per metric the rows carry, named and united by the registry. */
export function columnsOf(rows: RecordRow[], definitions: Map<string, MetricDefinition>): RecordColumn[] {
  const metricKeys = new Map<string, boolean>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.values)) {
      metricKeys.set(key, (metricKeys.get(key) ?? true) && (value === null || typeof value === "number"));
    }
  }
  return [
    ...FIXED,
    ...[...metricKeys].map(([key, numeric]) => {
      const read = scaledUnit(definitions.get(key)?.unit);
      return {
        key: `m:${key}`,
        label: definitions.get(key)?.label ?? key,
        unit: read.unit,
        kind: "metric" as const,
        numeric,
        ...(read.factor !== 1 ? { factor: read.factor } : {}),
      };
    }),
  ];
}

/** The columns limited to the chosen metrics, in the chosen order; the fixed ones stay. */
export function withChosenMetrics(columns: RecordColumn[], chosen: string[] | null): RecordColumn[] {
  if (chosen === null) return columns;
  const byKey = new Map(columns.map((c) => [c.key, c]));
  return [...columns.filter((c) => c.kind === "fixed"), ...chosen.map((m) => byKey.get(`m:${m}`)).filter((c): c is RecordColumn => c !== undefined)];
}

export function cellOf(row: RecordRow, column: RecordColumn): CellValue {
  switch (column.key) {
    case "time":
      return row.time;
    case "tracker":
      return row.device_name;
    case "lat":
      return row.lat;
    case "lon":
      return row.lon;
    default: {
      const raw = row.values[column.key.slice(2)];
      if (raw === undefined) return null;
      if (typeof raw === "number" && column.factor) return raw * column.factor;
      return raw;
    }
  }
}

export function formatCell(value: CellValue): string {
  if (value === null) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) < 10 ? 3 : 2);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value;
}

export interface RecordSort {
  key: string;
  direction: "asc" | "desc";
}
export const DEFAULT_SORT: RecordSort = { key: "time", direction: "desc" };

function compareCells(a: CellValue, b: CellValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

export function sortRows(rows: RecordRow[], columns: RecordColumn[], sort: RecordSort): RecordRow[] {
  const column = columns.find((c) => c.key === sort.key);
  if (!column) return rows;
  const sign = sort.direction === "asc" ? 1 : -1;
  const ordered = (x: CellValue, y: CellValue): number => (x === null || y === null ? compareCells(x, y) : sign * compareCells(x, y));
  return [...rows]
    .map((row, index) => ({ row, index, cell: cellOf(row, column) }))
    .sort((x, y) => ordered(x.cell, y.cell) || x.index - y.index)
    .map((x) => x.row);
}

/** A filter per column, typed in the header, as Protect's: a number column takes `> 3.5`,
 * `<= 2`, `3.5-4` or a plain number; every other column a piece of text. */
export function matchesFilter(value: CellValue, text: string, numeric: boolean): boolean {
  const wanted = text.trim();
  if (wanted === "") return true;
  if (value === null) return false;
  if (numeric && typeof value === "number") {
    const range = wanted.match(/^(-?[\d.]+)\s*-\s*(-?[\d.]+)$/);
    if (range) return value >= Number(range[1]) && value <= Number(range[2]);
    const bound = wanted.match(/^(>=|<=|>|<|=)?\s*(-?[\d.]+)$/);
    if (bound) {
      const n = Number(bound[2]);
      switch (bound[1]) {
        case ">":
          return value > n;
        case ">=":
          return value >= n;
        case "<":
          return value < n;
        case "<=":
          return value <= n;
        default:
          return Math.abs(value - n) < 0.005;
      }
    }
    return false;
  }
  return formatCell(value).toLowerCase().includes(wanted.toLowerCase());
}

export function filterRows(rows: RecordRow[], columns: RecordColumn[], filters: Record<string, string>): RecordRow[] {
  const active = columns.filter((c) => (filters[c.key] ?? "").trim() !== "");
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every((c) => matchesFilter(cellOf(row, c), filters[c.key], c.numeric)));
}
