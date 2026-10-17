import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, send, type Health, type Setup } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { UpdateNotice } from "@/components/UpdateNotice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shell } from "@/lib/shell";

/** The first screen once set up: which server and account this laptop works with, the versions
 * (Field's, and the Protect commit it decodes with), and the update notice. The pages for a
 * bundle, a card and the upload come with phase 2. */
export function HomePage({ setup }: { setup: Setup }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const health = useQuery({ queryKey: queryKeys.health, queryFn: () => api<Health>("/api/health") });
  const [checkAsked, setCheckAsked] = useState(false);
  useEffect(() => shell()?.onMenuCommand((id) => id === "check-updates" && setCheckAsked(true)), []);
  const signOut = useMutation({
    mutationFn: () => send<Setup>("DELETE", "/api/session"),
    onSuccess: (next) => queryClient.setQueryData(queryKeys.setup, next),
  });
  const expires = setup.token_expires_at ? new Date(setup.token_expires_at) : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold text-primary">{t("Smart Parks Protect Field")}</h1>
      {health.data && <UpdateNotice currentVersion={health.data.version} forceShow={checkAsked} />}
      <Card>
        <CardHeader>
          <CardTitle>{t("Connected to {{server}}", { server: setup.server_url })}</CardTitle>
          <CardDescription>
            {setup.signed_in
              ? t("Signed in as {{email}}. The sign-in lasts until {{time}}; Field asks for your password again when it needs the server after that.", {
                  email: setup.email,
                  time: expires?.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
                })
              : t("Not signed in. Sign in when you are online to load a bundle or upload cards.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {setup.signed_in ? (
            <Button type="button" variant="outline" size="sm" onClick={() => signOut.mutate()}>
              {t("Sign out")}
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/sign-in">{t("Sign in")}</Link>
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link to="/setup">{t("Another server")}</Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/map">{t("Map")}</Link>
          </Button>
        </CardContent>
      </Card>
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
              <dt>{t("Server version")}</dt>
              <dd className="font-mono">{setup.protect_version ?? t("unknown")}</dd>
              <dt>{t("Data folder")}</dt>
              <dd className="break-all font-mono">{health.data.data_dir}</dd>
            </dl>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
