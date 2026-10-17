import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { send, type Setup } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Step two of the setup (decision D7): the user's Protect account, email and password, checked
 * by the server itself. The app keeps the server's token, an hour long, and never the password;
 * when the token has expired and the server is needed, this page comes back. */
export function SignInPage({ setup, onCancel }: { setup: Setup; onCancel?: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(setup.email ?? "");
  const [password, setPassword] = useState("");
  const signIn = useMutation({
    mutationFn: () => send<Setup>("POST", "/api/session", { email, password }),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.setup, next);
      void queryClient.invalidateQueries({ queryKey: queryKeys.connection });
      if (onCancel) onCancel();
      else void navigate("/", { replace: true });
    },
  });
  return (
    <div className="flex w-full flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("Sign in to {{server}}", { server: setup.server_url })}</CardTitle>
          <CardDescription>
            {t("The same email and password you use for Protect. The password goes to the server and is not kept here.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              signIn.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t("Email")}</Label>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t("Password")}</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {signIn.isError && <Callout kind="error">{signIn.error.message}</Callout>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={signIn.isPending}>
                {signIn.isPending ? t("Signing in") : t("Sign in")}
              </Button>
              {onCancel && (
                <Button type="button" variant="ghost" onClick={onCancel}>
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
