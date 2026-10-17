import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";

import { send, type Setup } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Step one of the setup (decision D7): the Protect server this laptop synchronises with. The
 * address is prefilled when the app was opened from Protect's Offload page
 * (`protect-go://connect?server=...`, decision D9); the app keeps it once the server answers. */
export function SetupPage({ current }: { current?: Setup }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [server, setServer] = useState(params.get("server") ?? current?.server_url ?? "");
  const save = useMutation({
    mutationFn: () => send<Setup>("PUT", "/api/setup/server", { server_url: server }),
    onSuccess: (setup) => {
      queryClient.setQueryData(queryKeys.setup, setup);
      void navigate("/sign-in", { replace: true });
    },
  });
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("Which Protect server does this laptop work with?")}</CardTitle>
          <CardDescription>
            {t("The address you open Protect at in your browser. The app downloads the project's bundle from it and uploads the cards to it.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="server">{t("Server address")}</Label>
              <Input
                id="server"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://protect.example.org"
                value={server}
                onChange={(event) => setServer(event.target.value)}
                required
              />
            </div>
            {save.isError && <Callout kind="error">{save.error.message}</Callout>}
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={save.isPending || server.trim() === ""}>
                {save.isPending ? t("Checking the server") : t("Continue")}
              </Button>
              {current?.server_url && (
                <Button type="button" variant="ghost" onClick={() => void navigate("/")}>
                  {t("Cancel")}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
