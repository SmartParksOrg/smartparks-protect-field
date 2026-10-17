/** The pieces of Protect's `lib/analytics.ts` the Data explorer needs (decision D25): the
 * period presets, the chart kinds and the time formatting. The periods count back from the
 * newest record on the laptop rather than from now, since a card is read days after its last
 * fix; "Everything" has no bound. */
import { t } from "@/lib/i18nMark";
import { CLOCK } from "@/lib/format";

export const RANGE_PRESETS = {
  "24h": { label: t("Last 24 hours"), hours: 24 },
  "7d": { label: t("Last 7 days"), hours: 24 * 7 },
  "30d": { label: t("Last 30 days"), hours: 24 * 30 },
  "90d": { label: t("Last 90 days"), hours: 24 * 90 },
  all: { label: t("Everything"), hours: null },
} as const;

export type RangePreset = keyof typeof RANGE_PRESETS;

export const CHART_TYPES = ["line", "bar", "state"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export function formatInZone(iso: string, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  try {
    return new Date(iso).toLocaleString(undefined, { timeZone: timezone, dateStyle: "medium", timeStyle: "short", ...CLOCK, ...options });
  } catch {
    return new Date(iso).toLocaleString(undefined, CLOCK);
  }
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
