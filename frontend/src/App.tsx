import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router";

import { api, type Health, type Setup } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { FullScreenNotice } from "@/components/FullScreenNotice";
import { UpdateCheckFeedback } from "@/components/UpdateCheckFeedback";
import { AppLayout } from "@/components/layout/AppLayout";
import { BatchPage } from "@/pages/BatchPage";
import { ExplorePage } from "@/pages/ExplorePage";
import { FilesPage } from "@/pages/FilesPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { ServerPage } from "@/pages/ServerPage";
import { SetupPage } from "@/pages/SetupPage";
import { StationPage } from "@/pages/StationPage";
import { StationsPage } from "@/pages/StationsPage";
import { TrackerPage } from "@/pages/TrackerPage";
import { TrackersPage } from "@/pages/TrackersPage";
import { UploadPage } from "@/pages/UploadPage";

/** The setup gates the app (decision D7): with no server known, the setup page stands alone;
 * once a server is set, every page lives in Protect's shell (decision D13), the sign-in among
 * them under Settings, and the pages that need the server say so themselves. */
export default function App() {
  const { t } = useTranslation();
  const setup = useQuery({ queryKey: queryKeys.setup, queryFn: () => api<Setup>("/api/setup") });
  const health = useQuery({ queryKey: queryKeys.health, queryFn: () => api<Health>("/api/health") });
  if (setup.isPending) {
    return <main className="p-4 text-sm text-muted-foreground">{t("Starting")}</main>;
  }
  if (setup.isError) {
    return (
      <main className="p-4 text-sm" role="alert">
        {t("The local server does not answer.")} {setup.error.message}
      </main>
    );
  }
  const current = setup.data;
  if (!current.server_url) {
    return (
      <main className="flex min-h-dvh flex-col justify-center">
        <FullScreenNotice />
        <h1 className="mx-auto w-full max-w-xl px-4 text-2xl font-semibold text-primary">{t("Smart Parks Protect Go")}</h1>
        <Routes>
          <Route path="*" element={<SetupPage current={current} />} />
        </Routes>
      </main>
    );
  }
  return (
    <>
      <FullScreenNotice />
      {health.data && <UpdateCheckFeedback currentVersion={health.data.version} />}
      <Routes>
      <Route element={<AppLayout setup={current} />}>
        <Route path="/" element={<OverviewPage setup={current} />} />
        <Route path="/load" element={<ServerPage current={current} />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/map" element={<Navigate to="/explore" replace />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/files/:cardId" element={<BatchPage />} />
        <Route path="/trackers" element={<TrackersPage />} />
        <Route path="/trackers/:deviceId" element={<TrackerPage />} />
        <Route path="/stations" element={<StationsPage />} />
        <Route path="/stations/:key" element={<StationPage />} />
        <Route path="/upload" element={<UploadPage signedIn={current.signed_in} />} />
        <Route path="/setup" element={<ServerPage current={current} />} />
        <Route path="/sign-in" element={<ServerPage current={current} />} />
        <Route path="/cards" element={<Navigate to="/files" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      </Routes>
    </>
  );
}
