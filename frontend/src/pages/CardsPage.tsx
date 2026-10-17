import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, type Bundle, type Card } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Button } from "@/components/ui/button";
import { Card as Panel, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The cards read on this laptop (phase 2 F2): drop a card's folders or a zip of them, and the
 * list of what was read, each a link to its detail. Reading needs the loaded project's keys. */
export function CardsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cards = useQuery({ queryKey: queryKeys.cards, queryFn: () => api<Card[]>("/api/cards") });
  const bundle = useQuery({ queryKey: queryKeys.bundle, queryFn: () => api<Bundle>("/api/bundle") });
  const [dragging, setDragging] = useState(false);
  const [last, setLast] = useState<Card | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const read = useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      for (const file of files) {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        form.append("files", file, path);
      }
      const response = await fetch("/api/cards", { method: "POST", body: form });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? `${response.status}`);
      }
      return (await response.json()) as Card;
    },
    onSuccess: (card) => {
      setLast(card);
      void queryClient.invalidateQueries({ queryKey: queryKeys.cards });
    },
  });
  const onFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    read.mutate(Array.from(list));
  };
  const canRead = bundle.data?.present === true;
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-primary">{t("Cards")}</h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">{t("Back")}</Link>
        </Button>
      </div>
      {!canRead && bundle.data && (
        <Callout kind="info">
          {t("Load a project first; a card is read with the project's keys.")}{" "}
          <Link className="underline underline-offset-4" to="/load">
            {t("Load a project")}
          </Link>
        </Callout>
      )}
      <div
        role="region"
        aria-label={t("Drop a card here")}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (canRead) onFiles(event.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 text-center text-sm ${
          dragging ? "border-primary bg-accent" : "border-border"
        }`}
      >
        <p className="font-medium">{t("Read a card")}</p>
        <p className="text-muted-foreground">
          {t("Drop the card's LOG folders or a zip of them here, or pick them below. The files are read with the project's keys and kept for the upload.")}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" size="sm" disabled={!canRead || read.isPending} onClick={() => folderInput.current?.click()}>
            {t("Pick the card's folder")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!canRead || read.isPending} onClick={() => zipInput.current?.click()}>
            {t("Pick a zip")}
          </Button>
        </div>
        <input
          ref={folderInput}
          type="file"
          multiple
          className="hidden"
          aria-label={t("The card's folder")}
          // @ts-expect-error webkitdirectory is not in the typings but every Chromium browser has it
          webkitdirectory=""
          onChange={(event) => onFiles(event.target.files)}
        />
        <input ref={zipInput} type="file" accept=".zip,.jsonl" multiple className="hidden" aria-label={t("A zip of the card")} onChange={(event) => onFiles(event.target.files)} />
        {read.isPending && <p className="text-muted-foreground">{t("Reading the card")}</p>}
        {read.isError && <Callout kind="error">{read.error.message}</Callout>}
        {last && (
          <Callout kind="success">
            {t("{{name}} read: {{frames}} frames, {{decoded}} decoded, {{positions}} new positions; {{refused}} refused, {{unknown}} of unknown trackers, {{repeated}} repeats.", {
              name: last.name,
              frames: last.frames,
              decoded: last.decoded,
              positions: last.positions,
              refused: last.refused,
              unknown: last.unknown,
              repeated: last.repeated,
            })}{" "}
            <Link className="underline underline-offset-4" to={`/cards/${last.id}`}>
              {t("Open")}
            </Link>
          </Callout>
        )}
      </div>
      <Panel>
        <CardHeader>
          <CardTitle>{t("Cards on this laptop")}</CardTitle>
          <CardDescription>{t("Newest first. Open one for its files, its trackers and what could not be read.")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {cards.data && cards.data.length === 0 && <p className="text-sm text-muted-foreground">{t("No card read yet.")}</p>}
          {cards.data && cards.data.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">{t("Card")}</th>
                  <th className="py-1 pr-3 font-medium">{t("Station")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("Files")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("Frames")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("Positions")}</th>
                  <th className="py-1 pr-3 text-right font-medium">{t("Not read")}</th>
                  <th className="py-1 font-medium">{t("Read on")}</th>
                </tr>
              </thead>
              <tbody>
                {cards.data.map((card) => (
                  <tr key={card.id} className="border-t">
                    <td className="py-1 pr-3">
                      <Link className="underline underline-offset-4" to={`/cards/${card.id}`}>
                        {card.name}
                      </Link>
                    </td>
                    <td className="py-1 pr-3">{card.station_name ?? card.station_eui ?? t("unknown")}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{card.files}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{card.frames}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{card.positions}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{card.refused + card.unknown + card.line_errors}</td>
                    <td className="py-1 whitespace-nowrap">{new Date(card.imported_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Panel>
    </main>
  );
}
