import { useTranslation } from "react-i18next";

import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { DOWNLOAD_URL, useLatestRelease } from "@/hooks/useLatestRelease";
import { openExternal } from "@/lib/shell";

/** "A new version is available" at the top of the first screen, as AddaxAI shows it at start
 * (decision D8): the version, its notes, and the way to the download page; the new installer
 * replaces this version and keeps the data. Quiet when up to date, when offline, or when this
 * is a dev build. */
export function UpdateNotice({ currentVersion, forceShow = false }: { currentVersion: string; forceShow?: boolean }) {
  const { t } = useTranslation();
  const release = useLatestRelease(currentVersion);
  if (release.isLoading) return null;
  if (!release.updateAvailable) {
    if (!forceShow) return null;
    return (
      <Callout kind="success">
        {release.failed
          ? t("Could not check for updates. There may be no connection.")
          : release.upToDate
            ? t("Protect Go is up to date (v{{version}}).", { version: release.current })
            : t("This build (v{{version}}) is newer than the newest release.", { version: release.current })}
      </Callout>
    );
  }
  return (
    <Callout kind="info">
      <p className="font-medium">
        {t("Protect Go v{{latest}} is available; you have v{{current}}.", {
          latest: release.latest,
          current: release.current,
        })}
      </p>
      {release.latestNotes && (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-xs">{release.latestNotes}</pre>
      )}
      <p className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => openExternal(DOWNLOAD_URL)}>
          {t("Download the new version")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("Install it over this one; your bundles and cards are kept.")}
        </span>
      </p>
    </Callout>
  );
}
