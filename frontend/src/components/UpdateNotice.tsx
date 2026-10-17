import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { ALL_RELEASES_URL, detectPlatform, installerFor, useLatestRelease } from "@/hooks/useLatestRelease";
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
  const [platform, setPlatform] = useState<string>("");
  useEffect(() => {
    void detectPlatform().then(setPlatform);
    const bridge = shell();
    if (!bridge?.onUpdateStatus || !bridge.updateStatus) return;
    void bridge.updateStatus().then(setStatus);
    return bridge.onUpdateStatus(setStatus);
  }, []);
  const installer = installerFor(platform);
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
        <SelfUpdate status={status} installer={installer} />
      ) : (
        <ManualDownload installer={installer} />
      )}
    </Callout>
  );
}

/** The newest installer for this computer as a download, and the list of all versions. */
function ManualDownload({ installer }: { installer: { name: string; url: string } | null }) {
  const { t } = useTranslation();
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" onClick={() => openExternal(installer?.url ?? ALL_RELEASES_URL)}>
        {installer ? t("Download {{name}}", { name: installer.name }) : t("Download the new version")}
      </Button>
      <span className="text-xs text-muted-foreground">
        {t("Run it over this version; your bundles and files are kept.")}{" "}
        <button type="button" className="underline underline-offset-4" onClick={() => openExternal(ALL_RELEASES_URL)}>
          {t("All versions")}
        </button>
      </span>
    </p>
  );
}

function SelfUpdate({ status, installer }: { status: UpdateStatus; installer: { name: string; url: string } | null }) {
  const { t } = useTranslation();
  const bridge = shell();
  // the click answers at once (Tim, 2026-10-17: "nothing happens"): the check runs, and a
  // release whose installer is still being built says so instead of staying silent
  const [asked, setAsked] = useState(false);
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
    const percent = Math.min(100, Math.max(0, status.percent ?? 0));
    return (
      <div className="mt-2 flex flex-col gap-1.5" role="status">
        <div
          className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t("Downloading the new version")}
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{t("Downloading the new version, {{percent}}%", { percent })}</p>
      </div>
    );
  }
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        disabled={status.state === "checking"}
        onClick={() => {
          setAsked(true);
          void bridge?.downloadUpdate?.();
        }}
      >
        {status.state === "checking" ? t("Checking") : t("Download and install")}
      </Button>
      {asked && status.state === "none" ? (
        <span className="text-xs text-muted-foreground">{t("The newest release has no installer to fetch yet; it is still being built. Try again in a few minutes.")}</span>
      ) : status.state === "error" ? (
        <span className="text-xs text-destructive">
          {t("The update could not be fetched: {{message}}", { message: status.message ?? "" })}{" "}
          <button type="button" className="underline underline-offset-4" onClick={() => openExternal(installer?.url ?? ALL_RELEASES_URL)}>
            {installer ? t("Download {{name}} by hand", { name: installer.name }) : t("Download it by hand")}
          </button>
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{t("The app fetches the new version and installs it when you say so; your bundles and cards are kept.")}</span>
      )}
    </p>
  );
}
