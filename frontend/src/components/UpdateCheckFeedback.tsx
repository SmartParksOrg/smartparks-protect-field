import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useLatestRelease } from "@/hooks/useLatestRelease";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { shell } from "@/lib/shell";

/** The menu's "Check for updates…" answers on whatever page is open (Tim, 2026-10-17: nothing
 * was given back, not even "up to date"): a pill at the top centre says that the check runs,
 * then the result: up to date, a newer version with the way to it, or that the check failed.
 * The check is fresh, not the hour-old one from the start. */
export function UpdateCheckFeedback({ currentVersion }: { currentVersion: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [asked, setAsked] = useState(0);
  const [visible, setVisible] = useState(false);
  const release = useLatestRelease(currentVersion);
  useEffect(
    () =>
      shell()?.onMenuCommand((id) => {
        if (id !== "check-updates") return;
        setAsked((n) => n + 1);
        setVisible(true);
        void queryClient.invalidateQueries({ queryKey: queryKeys.latestRelease });
      }),
    [queryClient],
  );
  useEffect(() => {
    if (!visible || release.isLoading || release.isFetching) return;
    if (release.updateAvailable) return; // stays until dismissed
    const timer = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, [visible, asked, release.isLoading, release.isFetching, release.updateAvailable]);
  if (!visible || asked === 0) return null;
  const checking = release.isLoading || release.isFetching;
  return (
    <div role="status" className="fixed left-1/2 top-14 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 py-1 pl-3 pr-1 text-xs shadow">
      <span>
        {checking
          ? t("Checking for updates")
          : release.failed
            ? t("Could not check for updates. There may be no connection.")
            : release.updateAvailable
              ? t("Protect Go v{{latest}} is available; you have v{{current}}.", { latest: release.latest, current: release.current })
              : release.upToDate
                ? t("Protect Go is up to date (v{{version}}).", { version: release.current })
                : t("This build (v{{version}}) is newer than the newest release.", { version: release.current })}
      </span>
      {!checking && release.updateAvailable && (
        <Button
          type="button"
          size="sm"
          className="h-6 rounded-full px-2 text-xs"
          onClick={() => {
            setVisible(false);
            void navigate("/");
          }}
        >
          {t("Show")}
        </Button>
      )}
      <Button type="button" size="sm" variant="ghost" className="h-6 rounded-full px-2 text-xs" aria-label={t("Dismiss")} onClick={() => setVisible(false)}>
        ×
      </Button>
    </div>
  );
}
