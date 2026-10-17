/** The newest release on GitHub against the running version, the way AddaxAI's update check
 * does it (decision D8): one request at start, shared by the notice and the menu's "Check for
 * updates"; a failure is quiet, so the app works without a connection. The newest release of any
 * kind is taken, not `/releases/latest`, which hides pre-releases. */
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/api/queryKeys";
import { compareVersions, parseVersion } from "@/lib/version";

export const RELEASES_API =
  "https://api.github.com/repos/SmartParksOrg/smartparks-protect-go/releases?per_page=1";
export const DOWNLOAD_URL = "https://smartparksorg.github.io/smartparks-protect-go/using-protect-go/";
export const ALL_RELEASES_URL = "https://github.com/SmartParksOrg/smartparks-protect-go/releases";

export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
}

export interface LatestReleaseState {
  latest: string | null;
  latestNotes: string | null;
  current: string;
  updateAvailable: boolean;
  upToDate: boolean;
  isLoading: boolean;
  isFetching: boolean;
  failed: boolean;
}

export function useLatestRelease(currentVersion: string, enabled = true): LatestReleaseState {
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: queryKeys.latestRelease,
    queryFn: async (): Promise<GitHubRelease> => {
      const response = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const releases = (await response.json()) as GitHubRelease[];
      if (releases.length === 0) throw new Error("no release yet");
      return releases[0];
    },
    enabled,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const latest = data ? data.tag_name.replace(/^v/, "") : null;
  const current = currentVersion.replace(/^v/, "");
  const upToDate = latest !== null && latest === current;
  const updateAvailable =
    latest !== null && !upToDate && parseVersion(current) !== null && compareVersions(current, latest) === -1;
  return {
    latest,
    latestNotes: data?.body ?? null,
    current,
    updateAvailable,
    upToDate,
    isLoading,
    isFetching,
    failed: error !== null,
  };
}
