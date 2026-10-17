import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FolderOpen, HardDrive, LayoutGrid, List, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, type FileRow } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { DataTable } from "@/components/data/DataTable";
import { FileDialog } from "@/components/files/FileDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePreference } from "@/hooks/usePreference";
import { formatAgo, formatTime } from "@/lib/format";
import { sizeLabel, summaryOf, uploadLabel } from "@/lib/files";

type View = "list" | "tiles";

/**
 * The files read on this laptop as a file explorer shows them, Protect's log files card (Tim,
 * 2026-10-17: the same layout as on Protect): a list with one line per file, or tiles, switched
 * at the top and remembered on this browser; a click opens the file's properties, where the
 * counts, the trackers, what could not be read and the way to its SD card's page live. A filter
 * narrows the list to one SD card.
 */
export function FilesExplorer({ cardId, stationEui = null }: { cardId: string | null; stationEui?: string | null }) {
  const { t } = useTranslation();
  const [view, setView] = usePreference<View>("files_view", "list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const files = useQuery({ queryKey: queryKeys.files, queryFn: () => api<FileRow[]>("/api/files") });
  const rows = (files.data ?? []).filter((f) => (!cardId || f.card_id === cardId) && (!stationEui || (f.station_eui ?? "").toUpperCase() === stationEui.toUpperCase()));
  const selected = files.data?.find((f) => f.id === selectedId) ?? null;

  const menu = (f: FileRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={t("Actions for {{name}}", { name: f.name })} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => setSelectedId(f.id)}>{t("Properties")}</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={`/files/${f.card_id}`}>
            <FolderOpen className="size-4" /> {t("Open the SD card")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const name = (f: FileRow, className = "") => (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      <HardDrive className="size-4 shrink-0 text-muted-foreground" />
      <span className="max-w-[16rem] min-w-0 truncate font-medium" title={f.name}>
        {f.folder && <span className="font-normal text-muted-foreground">{f.folder}/</span>}
        {f.name}
      </span>
    </span>
  );
  const statusWords = (f: FileRow) => <Badge variant="outline">{uploadLabel(f.upload_status, t)}</Badge>;

  const columns: ColumnDef<FileRow, unknown>[] = [
    { header: t("Name"), accessorKey: "name", cell: ({ row }) => name(row.original) },
    { header: t("SD card"), accessorKey: "card_name", cell: ({ row }) => <span className="truncate">{row.original.card_name}</span> },
    {
      header: t("Station"),
      accessorKey: "station_name",
      cell: ({ row }) =>
        row.original.station_eui ? (
          <Link className="underline-offset-4 hover:underline" to={`/stations/${encodeURIComponent(row.original.station_eui)}`} onClick={(e) => e.stopPropagation()}>
            {row.original.station_name ?? row.original.station_eui}
          </Link>
        ) : (
          <span className="text-muted-foreground">{t("unknown")}</span>
        ),
    },
    { header: t("Upload"), accessorKey: "upload_status", cell: ({ row }) => statusWords(row.original) },
    {
      header: t("Frames"),
      accessorKey: "frames",
      cell: ({ row }) => {
        const notRead = row.original.refused + row.original.unknown + row.original.errors;
        return (
          <span className="tabular-nums">
            {row.original.frames}
            {notRead > 0 && <span className="text-destructive"> ({notRead})</span>}
          </span>
        );
      },
    },
    { header: t("Positions"), accessorKey: "positions", cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span> },
    { header: t("Measurements"), accessorKey: "measurements", cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span> },
    { header: t("Size"), accessorKey: "size", cell: ({ getValue }) => <span className="tabular-nums">{sizeLabel(getValue<number>())}</span> },
    {
      header: t("Read"),
      accessorKey: "imported_at",
      cell: ({ getValue }) => (
        <span className="whitespace-nowrap" title={formatTime(getValue<string>())}>
          {formatAgo(getValue<string>())}
        </span>
      ),
    },
    { header: "", id: "actions", cell: ({ row }) => menu(row.original) },
  ];

  const tiles = (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-4">
      {rows.map((f) => (
        <div
          key={f.id}
          role="button"
          tabIndex={0}
          onClick={() => setSelectedId(f.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setSelectedId(f.id);
          }}
          className="relative flex min-w-0 cursor-pointer flex-col gap-1 rounded-md border p-3 text-left hover:bg-muted/60"
        >
          <div className="absolute top-1 right-1">{menu(f)}</div>
          <HardDrive className="size-8 text-muted-foreground" />
          <div className="line-clamp-2 text-sm font-medium break-all" title={f.name}>
            {f.folder && <span className="font-normal text-muted-foreground">{f.folder}/</span>}
            {f.name}
          </div>
          <div>{statusWords(f)}</div>
          <div className="line-clamp-2 text-xs text-muted-foreground">{summaryOf(f, t)}</div>
          <div className="text-xs text-muted-foreground">
            {sizeLabel(f.size)} · {formatAgo(f.imported_at)}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="size-4" /> {t("Files on this laptop")}
            {rows.length > 0 && <span className="text-sm font-normal text-muted-foreground">{rows.length}</span>}
          </CardTitle>
          <div className="flex rounded-md border p-0.5" role="group" aria-label={t("View")}>
            <Button type="button" variant={view === "list" ? "secondary" : "ghost"} size="icon" className="size-7" aria-pressed={view === "list"} aria-label={t("List")} onClick={() => setView("list")}>
              <List className="size-4" />
            </Button>
            <Button type="button" variant={view === "tiles" ? "secondary" : "ghost"} size="icon" className="size-7" aria-pressed={view === "tiles"} aria-label={t("Tiles")} onClick={() => setView("tiles")}>
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">{t("One row per file of the SD cards you read, with the project's keys. A click on a file opens its properties: the counts, the trackers, what could not be read, and its SD card.")}</p>
          {view === "tiles" && rows.length > 0 ? (
            tiles
          ) : (
            <DataTable
              columns={columns}
              data={files.data ? rows : undefined}
              isLoading={files.isPending}
              searchable
              columnsKey="files"
              defaultHidden={["measurements", "size"]}
              defaultHiddenSmall={["measurements", "size", "station_name", "card_name"]}
              onRowClick={(f) => setSelectedId(f.id)}
              emptyMessage={t("No files read yet.")}
              cardOf={(f) => (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    {name(f)}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {statusWords(f)}
                      <span className="text-muted-foreground">
                        {sizeLabel(f.size)} · {formatAgo(f.imported_at)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{summaryOf(f, t)}</div>
                  </div>
                  {menu(f)}
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>
      <FileDialog file={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
