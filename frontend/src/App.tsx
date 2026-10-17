import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router";

import { api, type Setup } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { AppLayout } from "@/components/layout/AppLayout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { BatchPage } from "@/pages/BatchPage";
import { FilesPage } from "@/pages/FilesPage";
import { LoadPage } from "@/pages/LoadPage";
import { MapPage } from "@/pages/MapPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { SetupPage } from "@/pages/SetupPage";
import { SignInPage } from "@/pages/SignInPage";
import { TrackerPage } from "@/pages/TrackerPage";
import { UploadPage } from "@/pages/UploadPage";

/** The setup gates the app (decision D7): with no server known, the setup page stands alone;
 * once a server is set, every page lives in Protect's shell (decision D13), the sign-in among
 * them under Settings, and the pages that need the server say so themselves. */
export default function App() {
  const { t } = useTranslation();
  const setup = useQuery({ queryKey: queryKeys.setup, queryFn: () => api<Setup>("/api/setup") });
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
        <h1 className="mx-auto w-full max-w-xl px-4 text-2xl font-semibold text-primary">{t("Smart Parks Protect Go")}</h1>
        <Routes>
          <Route path="*" element={<SetupPage current={current} />} />
        </Routes>
      </main>
    );
  }
  return (
    <Routes>
      <Route element={<AppLayout setup={current} />}>
        <Route path="/" element={<OverviewPage setup={current} />} />
        <Route path="/load" element={<LoadPage signedIn={current.signed_in} />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/files/:cardId" element={<BatchPage />} />
        <Route path="/trackers/:deviceId" element={<TrackerPage />} />
        <Route path="/upload" element={<UploadPage signedIn={current.signed_in} />} />
        <Route
          path="/setup"
          element={
            <>
              <PageHeader title={t("Server")} description={t("The Protect server this laptop works with.")} />
              <Page>
                <SetupPage current={current} />
              </Page>
            </>
          }
        />
        <Route
          path="/sign-in"
          element={
            <>
              <PageHeader title={t("Account")} description={t("Your Protect account on this server.")} />
              <Page>
                <SignInPage setup={current} />
              </Page>
            </>
          }
        />
        <Route path="/cards" element={<Navigate to="/files" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
