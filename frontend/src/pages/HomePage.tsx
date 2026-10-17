import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api, type Health } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The first screen: says what the program is and which version of it and of Protect's
 * decoding runs. The real pages (a bundle, a card, the map) come with phase 2. */
export function HomePage() {
  const { t } = useTranslation();
  const health = useQuery({ queryKey: queryKeys.health, queryFn: () => api<Health>("/api/health") });
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold text-primary">{t("Smart Parks Protect Field")}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("Reads an offload station's SD card where there is no connection")}</CardTitle>
          <CardDescription>
            {t("The card's files are decoded here with Protect's own code and handed to Protect when there is a connection.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {health.isPending && <p>{t("Checking the local server")}</p>}
          {health.isError && <p role="alert">{t("The local server does not answer.")}</p>}
          {health.data && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt>{t("Version")}</dt>
              <dd className="font-mono">{health.data.version}</dd>
              <dt>{t("Protect's decoding")}</dt>
              <dd className="font-mono">{health.data.protect_revision?.slice(0, 7) ?? t("unknown")}</dd>
              <dt>{t("Data folder")}</dt>
              <dd className="break-all font-mono">{health.data.data_dir}</dd>
            </dl>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
