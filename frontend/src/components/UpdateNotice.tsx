import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { DOWNLOAD_URL, useLatestRelease } from "@/hooks/useLatestRelease";
import { openExternal, shell, type UpdateStatus } from "@/lib/shell";

/** "A new version is available" at the top of the first screen, as AddaxAI shows it at start
 * (decision D8): the version, its notes, and the way to it. On Windows the app installs the
 * update itself (decision D17): one button downloads it, the next restarts into it, the data
 * stays. Elsewhere the button leads to the download page and the new installer replaces this
 * version. Quiet when up to date, when offline, or when this is a dev build. */
export function UpdateNotice({ currentVersion, forceShow = false }: { currentVersion: string; forceShow?: boolean }) {
  const { t } = useTranslation();
  const release = useLatestRelease(currentVersion);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    const bridge = shell();
    if (!bridge?.onUpdateStatus || !bridge.updateStatus) return;
    void bridge.updateStatus().then(setStatus);
    return bridge.onUpdateStatus(setStatus);
  }, []);
  const selfUpdating = status !== null && status.state !== "unsupported";
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
      {selfUpdating ? (
        <SelfUpdate status={status} />
      ) : (
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => openExternal(DOWNLOAD_URL)}>
            {t("Download the new version")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("Install it over this one; your bundles and cards are kept.")}
          </span>
        </p>
      )}
    </Callout>
  );
}

function SelfUpdate({ status }: { status: UpdateStatus }) {
  const { t } = useTranslation();
  const bridge = shell();
  if (status.state === "downloaded") {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void bridge?.installUpdate?.()}>
          {t("Restart to update")}
        </Button>
        <span className="text-xs text-muted-foreground">{t("The app closes, installs the new version and opens again; your bundles and cards are kept.")}</span>
      </p>
    );
  }
  if (status.state === "downloading") {
    return (
      <p className="mt-2 text-xs text-muted-foreground" role="status">
        {t("Downloading the new version, {{percent}}%", { percent: status.percent ?? 0 })}
      </p>
    );
  }
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" disabled={status.state === "checking"} onClick={() => void bridge?.downloadUpdate?.()}>
        {t("Download and install")}
      </Button>
      {status.state === "error" ? (
        <span className="text-xs text-destructive">
          {t("The update could not be fetched: {{message}}", { message: status.message ?? "" })}{" "}
          <button type="button" className="underline underline-offset-4" onClick={() => openExternal(DOWNLOAD_URL)}>
            {t("Download it by hand")}
          </button>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{t("The app fetches the new version and installs it when you say so; your bundles and cards are kept.")}</span>
      )}
    </p>
  );
}
