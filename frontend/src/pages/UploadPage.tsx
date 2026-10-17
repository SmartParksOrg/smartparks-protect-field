import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, send, type UploadRun, type Uploads } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card as Panel, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The upload to Protect (phase 2 F4): every card with how many files wait, went up, were there
 * already, were refused or failed, and one button that sends what waits. The files go up as
 * they were on the card; the server decodes them itself. */
export function UploadPage({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const uploads = useQuery({ queryKey: queryKeys.uploads, queryFn: () => api<Uploads>("/api/uploads") });
  const [last, setLast] = useState<UploadRun | null>(null);
  const run = useMutation({
    mutationFn: (cardId: string | null) => send<UploadRun>("POST", "/api/uploads/run", { card_id: cardId }),
    onSuccess: (result) => {
      setLast(result);
      queryClient.setQueryData(queryKeys.uploads, result.state);
      void queryClient.invalidateQueries({ queryKey: queryKeys.cards });
    },
  });
  const state = uploads.data;
  return (
    <>
      <PageHeader title={t("Upload to Protect")} description={t("When you are online: the files you read go to the server as they were on the card.")} />
      <Page>
      <Panel>
        <CardHeader>
          <CardTitle>
            {state
              ? state.pending + state.failed > 0
                ? t("{{count}} files wait to go up", { count: state.pending + state.failed })
                : t("Nothing waits to go up")
              : t("Checking")}
          </CardTitle>
          <CardDescription>
            {t("When you are online, the card files go to the server exactly as they were on the card, one by one. The server decodes them itself and says of each whether it took it, had it already, or refused it.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {!signedIn && (
            <Callout kind="info">
              {t("Sign in first; the files go to the server you are signed in to.")}{" "}
              <Link className="underline underline-offset-4" to="/sign-in">
                {t("Sign in")}
              </Link>
            </Callout>
          )}
          <div>
            <Button type="button" size="sm" disabled={!signedIn || run.isPending || !state || state.pending + state.failed === 0} onClick={() => run.mutate(null)}>
              {run.isPending ? t("Uploading") : t("Upload everything that waits")}
            </Button>
          </div>
          {run.isError && <Callout kind="error">{run.error.message}</Callout>}
          {last && (
            <Callout kind={last.stopped ? "warning" : "success"}>
              <p>
                {t("{{attempted}} files sent: {{uploaded}} taken by the server, {{duplicate}} it had already, {{refused}} refused, {{failed}} failed.", {
                  attempted: last.attempted,
                  uploaded: last.uploaded,
                  duplicate: last.duplicate,
                  refused: last.refused,
                  failed: last.failed,
                })}
              </p>
              {last.skipped_no_station > 0 && (
                <p className="mt-1">{t("{{count}} files wait for their station to exist in the project.", { count: last.skipped_no_station })}</p>
              )}
              {last.stopped && (
                <p className="mt-1">
                  {last.stopped}{" "}
                  {last.stopped.includes("sign") && (
                    <Link className="underline underline-offset-4" to="/sign-in">
                      {t("Sign in")}
                    </Link>
                  )}
                </p>
              )}
            </Callout>
          )}
        </CardContent>
      </Panel>
      <Panel>
        <CardHeader>
          <CardTitle>{t("Cards")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {state && state.cards.length === 0 && <p className="text-sm text-muted-foreground">{t("No card read yet.")}</p>}
          {state && state.cards.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t("Card")}</th>
                  <th className="py-1 pr-3 font-medium">{t("Station")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("Files")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("Waiting")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("Taken")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("Had already")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("Refused")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("Failed")}</th>
                  <th className="py-1 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {state.cards.map((card) => (
                  <tr key={card.card_id} className="border-t align-top">
                    <td className="py-1 pr-3">
                      <Link className="underline underline-offset-4" to={`/cards/${card.card_id}`}>
                        {card.name}
                      </Link>
                      {card.last_problem && <p className="text-xs text-muted-foreground">{card.last_problem}</p>}
                    </td>
                    <td className="py-1 pr-3">{card.station_name ?? card.station_eui ?? t("unknown")}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{card.files}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{card.pending}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{card.uploaded}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{card.duplicate}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{card.refused}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{card.failed}</td>
                    <td className="py-1 text-right">
                      {card.pending + card.failed > 0 && (
                        <Button type="button" variant="outline" size="xs" disabled={!signedIn || run.isPending} onClick={() => run.mutate(card.card_id)}>
                          {t("Upload")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Panel>
      </Page>
    </>
  );
}
