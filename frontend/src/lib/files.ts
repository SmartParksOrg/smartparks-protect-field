/** Pure helpers of the files explorer, after Protect's `lib/logFiles.ts`. */
import type { TFunction } from "i18next";

import type { FileRow } from "@/api/client";

/** "12 kB", "1.3 MB": the size as a file explorer prints it. */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/** The upload's state in a person's words, for the status badge. */
export function uploadLabel(status: string, t: TFunction): string {
  switch (status) {
    case "pending":
      return t("waiting to go up");
    case "uploaded":
      return t("taken by the server");
    case "duplicate":
      return t("server had it");
    case "refused":
      return t("refused by the server");
    case "failed":
      return t("upload failed");
    default:
      return status;
  }
}

/** The badge's tone per upload state, the tones Protect's status badge uses. */
export function uploadTone(status: string): string {
  switch (status) {
    case "uploaded":
      return "success";
    case "duplicate":
      return "duplicate";
    case "refused":
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

/** The one line under a file's name: what the file brought and what could not be read. */
export function summaryOf(file: FileRow, t: TFunction): string {
  const parts = [t("{{count}} frames", { count: file.frames }), t("{{count}} decoded", { count: file.decoded })];
  if (file.positions > 0) parts.push(t("{{count}} positions", { count: file.positions }));
  if (file.repeated > 0) parts.push(t("{{count}} repeats", { count: file.repeated }));
  const notRead = file.refused + file.unknown + file.errors;
  if (notRead > 0) parts.push(t("{{count}} not read", { count: notRead }));
  return parts.join(", ");
}
