import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api, send, type Connection, type Setup } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/format";
import { SetupPage } from "@/pages/SetupPage";
import { SignInPage } from "@/pages/SignInPage";

/** The Server page under Settings (decision D18; Tim, 2026-10-17: the page showed the form as
 * if nothing were connected, and the account is the server's, not a thing of its own): the
 * connected server with its version, whether it answers right now and when that was last
 * checked, and the account on that server, signed in until when or the sign-in form. "Another
 * server" and "Sign in as someone else" bring the forms back. */
export function ServerPage({ current }: { current: Setup }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [changingServer, setChangingServer] = useState(false);
  const [changingAccount, setChangingAccount] = useState(false);
  const connection = useQuery({
    queryKey: queryKeys.connection,
    queryFn: () => api<Connection>("/api/setup/connection"),
    refetchInterval: 60_000,
    retry: false,
  });
  const signOut = useMutation({
    mutationFn: () => send<Setup>("DELETE", "/api/session"),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.setup, next);
      void queryClient.invalidateQueries({ queryKey: queryKeys.connection });
    },
  });
  const state = connection.data;
  return (
    <>
      <PageHeader title={t("Server")} description={t("The Protect server this laptop works with, and your account on it.")} />
      <Page>
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          {changingServer ? (
            <SetupPage current={current} onCancel={() => setChangingServer(false)} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t("Connected to {{server}}", { server: current.server_url })}</CardTitle>
                <CardDescription>
                  {current.protect_version
                    ? t("Protect {{version}}. The app downloads the project's bundle from it and uploads the files to it.", { version: current.protect_version })
                    : t("The app downloads the project's bundle from it and uploads the files to it.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">{t("Connection")}</dt>
                  <dd className="flex items-center gap-2" role="status">
                    <span className={`inline-block size-2.5 rounded-full ${state === undefined ? "bg-muted-foreground/40" : state.online ? "bg-emerald-500" : "bg-amber-500"}`} />
                    {state === undefined
                      ? connection.isError
                        ? t("Could not check")
                        : t("Checking")
                      : state.online
                        ? t("Online")
                        : t("Offline: {{reason}}", { reason: state.error ?? "" })}
                  </dd>
                  <dt className="text-muted-foreground">{t("Last checked")}</dt>
                  <dd>{state ? formatTime(state.checked_at) : t("Not yet")}</dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={connection.isFetching} onClick={() => void connection.refetch()}>
                    {connection.isFetching ? t("Checking") : t("Check now")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setChangingServer(true)}>
                    {t("Another server")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          {!current.signed_in || changingAccount ? (
            <SignInPage setup={current} onCancel={current.signed_in ? () => setChangingAccount(false) : undefined} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t("Signed in as {{email}}", { email: current.email })}</CardTitle>
                <CardDescription>
                  {current.token_expires_at
                    ? t("The sign-in holds until {{time}}; after that the app asks for your password, or open it from Protect's Offload page again.", { time: formatTime(current.token_expires_at) })
                    : t("The app keeps the server's sign-in and never your password.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {state?.account_ok === false && (
                  <Callout kind="error">{t("The server no longer accepts this sign-in. Sign in again.")}</Callout>
                )}
                {state?.account_ok === true && <p className="text-sm text-muted-foreground">{t("The server accepts the sign-in.")}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
                    {t("Sign out")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setChangingAccount(true)}>
                    {t("Sign in as someone else")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </Page>
    </>
  );
}
