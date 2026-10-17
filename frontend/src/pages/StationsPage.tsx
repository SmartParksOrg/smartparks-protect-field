import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { api, type Station, type StationStats } from "@/api/client";
import { type StationRow, stationRows } from "@/lib/entities";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/data/DataTable";
import { formatAgo, formatTime } from "@/lib/format";

/** The Offload stations page (Tim, 2026-10-17): every station the app knows, from the bundle
 * and from the files, one line each with where it stands and what its files brought. */
export function StationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const stations = useQuery({ queryKey: queryKeys.stations, queryFn: () => api<Station[]>("/api/bundle/stations") });
  const stats = useQuery({ queryKey: queryKeys.stationStats, queryFn: () => api<StationStats[]>("/api/stations") });
  const rows = useMemo(() => stationRows(stations.data ?? [], stats.data ?? []), [stations.data, stats.data]);
  const columns = useMemo<ColumnDef<StationRow>[]>(
    () => [
      {
        header: t("Station"),
        accessorKey: "name",
        cell: ({ row }) => (
          <Link className="font-medium underline-offset-4 hover:underline" to={`/stations/${encodeURIComponent(row.original.key)}`} onClick={(e) => e.stopPropagation()}>
            {row.original.name}
          </Link>
        ),
      },
      { header: t("EUI"), accessorKey: "station_eui", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span> },
      {
        header: t("Place"),
        accessorKey: "lat",
        cell: ({ row }) => (row.original.lat !== null && row.original.lon !== null ? <span className="font-mono text-xs">{`${row.original.lat.toFixed(4)}, ${row.original.lon.toFixed(4)}`}</span> : <span className="text-muted-foreground">{row.original.known_to_bundle ? t("not set") : t("not in the bundle")}</span>),
      },
      { header: t("Files read"), accessorKey: "files", cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span> },
      { header: t("Frames"), accessorKey: "frames", cell: ({ getValue }) => <span className="tabular-nums">{getValue<number>()}</span> },
      { header: t("To upload"), accessorKey: "pending", cell: ({ getValue }) => <span className={`tabular-nums ${getValue<number>() > 0 ? "font-medium" : "text-muted-foreground"}`}>{getValue<number>()}</span> },
      {
        header: t("Last read"),
        accessorKey: "last_read",
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          return v ? (
            <span className="whitespace-nowrap" title={formatTime(v)}>
              {formatAgo(v)}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("never")}</span>
          );
        },
      },
    ],
    [t],
  );
  return (
    <>
      <PageHeader title={t("Offload stations")} description={t("Every offload station the app knows: where it stands and what its SD card files brought to this laptop.")} />
      <Page>
        {stations.data && stations.data.length === 0 && (
          <Callout kind="info">
            {t("Load a project first; its stations come with the bundle.")}{" "}
            <Link className="underline underline-offset-4" to="/setup">
              {t("Load a project")}
            </Link>
          </Callout>
        )}
        <DataTable columns={columns} data={rows} isLoading={stations.isPending || stats.isPending} emptyMessage={t("No offload stations yet.")} onRowClick={(row) => void navigate(`/stations/${encodeURIComponent(row.key)}`)} columnsKey="stations" defaultHiddenSmall={["station_eui", "lat", "frames"]} searchable />
      </Page>
    </>
  );
}
