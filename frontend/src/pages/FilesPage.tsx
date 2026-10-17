import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, send, type Bundle, type Card, type Volume } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { FilesExplorer } from "@/components/files/FilesExplorer";
import { sizeLabel } from "@/lib/files";
import { shell } from "@/lib/shell";

/** The SD card files read on this laptop (phase 2 F2; "files", not "cards", since Tim,
 * 2026-10-17: in Dutch "kaart" is the map): the SD cards the computer holds, each read with one
 * click (decision D16), a folder picked in the system's dialog, or a drop of the card's LOG
 * folders or a zip of them; then the list of what was read. Reading needs the loaded project's
 * keys. */
export function FilesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cards = useQuery({ queryKey: queryKeys.cards, queryFn: () => api<Card[]>("/api/cards") });
  const bundle = useQuery({ queryKey: queryKeys.bundle, queryFn: () => api<Bundle>("/api/bundle") });
  const [dragging, setDragging] = useState(false);
  const [last, setLast] = useState<Card | null>(null);
  const [filter, setFilter] = useState("");
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.files });
    },
  });
  const onFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    read.mutate(Array.from(list));
  };
  const canRead = bundle.data?.present === true;
  // the SD cards in this computer, looked for every few seconds while the page is open
  const volumes = useQuery({
    queryKey: queryKeys.volumes,
    queryFn: () => api<Volume[]>("/api/cards/volumes"),
    enabled: canRead,
    refetchInterval: 5000,
  });
  const readPath = useMutation({
    mutationFn: (body: { path: string; name?: string }) => send<Card>("POST", "/api/cards/path", body),
    onSuccess: (card) => {
      setLast(card);
      void queryClient.invalidateQueries({ queryKey: queryKeys.cards });
      void queryClient.invalidateQueries({ queryKey: queryKeys.files });
    },
  });
  const pickFolder = async () => {
    const bridge = shell();
    if (bridge?.pickFolder) {
      const path = await bridge.pickFolder(t("The SD card or the folder it was copied to"));
      if (path) readPath.mutate({ path });
    } else {
      folderInput.current?.click();
    }
  };
  const busy = read.isPending || readPath.isPending;
  const error = read.error ?? readPath.error;
  return (
    <>
      <PageHeader title={t("Files")} description={t("The files of the offload stations' SD cards, read on this laptop with the project's keys.")} />
      <Page>
      {!canRead && bundle.data && (
        <Callout kind="info">
          {t("Load a project first; the files are read with the project's keys.")}{" "}
          <Link className="underline underline-offset-4" to="/load">
            {t("Load a project")}
          </Link>
        </Callout>
      )}
      <div
        role="region"
        aria-label={t("Drop the files here")}
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
        <p className="font-medium">{t("Read SD card files")}</p>
        {canRead && volumes.data && volumes.data.length > 0 && (
          <ul className="flex w-full max-w-xl flex-col gap-2 text-left" aria-label={t("SD cards in this computer")}>
            {volumes.data.map((volume) => (
              <li key={volume.path} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{volume.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {volume.files === 0
                      ? t("No station files on it")
                      : t("{{files}} files of {{stations}}, {{size}}", {
                          files: volume.files,
                          stations: volume.stations.map((s) => s.name || s.eui).join(", "),
                          size: sizeLabel(volume.size),
                        })}
                  </p>
                </div>
                <Button type="button" size="sm" disabled={busy || volume.files === 0} onClick={() => readPath.mutate({ path: volume.path, name: volume.label })}>
                  {t("Read this SD card")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground">
          {canRead && volumes.data && volumes.data.length === 0
            ? t("No SD card is in this computer. Put the card in, or pick the folder it was copied to, or drop the card's LOG folders or a zip of them here. The files are read with the project's keys and kept for the upload.")
            : t("Or pick the folder the card was copied to, or drop the card's LOG folders or a zip of them here. The files are read with the project's keys and kept for the upload.")}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!canRead || busy} onClick={() => void pickFolder()}>
            {t("Pick the card's folder")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!canRead || busy} onClick={() => zipInput.current?.click()}>
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
        {busy && <p className="text-muted-foreground">{t("Reading the files")}</p>}
        {error && <Callout kind="error">{error.message}</Callout>}
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
            <Link className="underline underline-offset-4" to={`/files/${last.id}`}>
              {t("Open")}
            </Link>
          </Callout>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex min-w-0 max-w-full flex-1 items-center gap-2 sm:flex-none">
          <span className="shrink-0 text-muted-foreground">{t("SD card")}</span>
          {/* a native select grows with its longest option; on a phone it must shrink to the row */}
          <select className="h-8 min-w-0 max-w-full flex-1 truncate rounded-md border border-input bg-transparent px-2 text-sm sm:max-w-md" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label={t("SD card")}>
            <option value="">{t("All SD cards")}</option>
            {(cards.data ?? []).map((card) => (
              <option key={card.id} value={card.id}>
                {card.name} · {card.station_name ?? card.station_eui ?? t("unknown")}
              </option>
            ))}
          </select>
        </label>
        {filter && (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/files/${filter}`}>{t("Open the SD card")}</Link>
          </Button>
        )}
      </div>
      <FilesExplorer cardId={filter || null} />
      </Page>
    </>
  );
}
