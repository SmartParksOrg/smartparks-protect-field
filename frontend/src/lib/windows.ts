/** The time windows the map and the tracker pages offer, after Protect's traffic pages: the
 * last day, week or month of the records on the laptop, or everything. */
import { t } from "@/lib/i18nMark";

export interface Window {
  key: string;
  label: string;
  hours: number | null;
}

export const WINDOWS: Window[] = [
  { key: "24h", label: t("Last 24 hours"), hours: 24 },
  { key: "7d", label: t("Last 7 days"), hours: 24 * 7 },
  { key: "30d", label: t("Last 30 days"), hours: 24 * 30 },
  { key: "all", label: t("Everything"), hours: null },
];

/** The `since` for a window, measured back from the newest record (`latest`) rather than from
 * now, since a card is read days after its last fix. */
export function sinceFor(window: Window, latest: string | null): string | undefined {
  if (window.hours === null) return undefined;
  const end = latest ? new Date(latest) : new Date();
  return new Date(end.getTime() - window.hours * 3600_000).toISOString();
}
