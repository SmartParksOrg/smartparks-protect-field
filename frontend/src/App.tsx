import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router";

import { api, type Setup } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { CardPage } from "@/pages/CardPage";
import { CardsPage } from "@/pages/CardsPage";
import { HomePage } from "@/pages/HomePage";
import { LoadPage } from "@/pages/LoadPage";
import { MapPage } from "@/pages/MapPage";
import { SetupPage } from "@/pages/SetupPage";
import { SignInPage } from "@/pages/SignInPage";

/** The setup gates the app (decision D7): no server known sends every route to the setup page,
 * a server without a sign-in to the sign-in page, except the pages themselves. */
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
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage current={current} />} />
      <Route
        path="/sign-in"
        element={current.server_url ? <SignInPage setup={current} /> : <Navigate to="/setup" replace />}
      />
      <Route path="/cards" element={current.server_url ? <CardsPage /> : <Navigate to="/setup" replace />} />
      <Route path="/cards/:cardId" element={current.server_url ? <CardPage /> : <Navigate to="/setup" replace />} />
      <Route
        path="/load"
        element={current.server_url ? <LoadPage signedIn={current.signed_in} /> : <Navigate to="/setup" replace />}
      />
      <Route
        path="/map"
        element={current.server_url ? <MapPage /> : <Navigate to="/setup" replace />}
      />
      <Route
        path="/"
        element={
          current.server_url ? (
            current.signed_in || current.email ? <HomePage setup={current} /> : <Navigate to="/sign-in" replace />
          ) : (
            <Navigate to="/setup" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
