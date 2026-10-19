import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import {
  api,
  type Bundle,
  type BundleDevice,
  type Setup,
  type Tracker,
  type UnknownTracker,
} from "@/api/client";
import { type TrackerRow, trackerRows } from "@/lib/entities";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Page, PageHeader } from "@/components/common/PageHeader";
import { DataTable } from "@/components/data/DataTable";
import { formatAgo, formatTime } from "@/lib/format";
import { openExternal } from "@/lib/shell";
import { Button } from "@/components/ui/button";

/** The Trackers page (Tim, 2026-10-17): every tracker the app knows, from the bundle and from
 * the files, one line each with what this laptop holds of it; a click opens the tracker. */
export function TrackersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const devices = useQuery({
    queryKey: queryKeys.devices,
    queryFn: () => api<BundleDevice[]>("/api/bundle/devices"),
  });
  const trackers = useQuery({
    queryKey: queryKeys.trackers,
    queryFn: () => api<Tracker[]>("/api/trackers"),
  });
  // the addresses no device of the bundle has (Protect's D338): Protect adds the tracker, the
  // bundle loaded again brings it here and the frames decode
  const unknown = useQuery({
    queryKey: queryKeys.unknownTrackers,
    queryFn: () => api<UnknownTracker[]>("/api/trackers/unknown"),
  });
  const setup = useQuery({
    queryKey: queryKeys.setup,
    queryFn: () => api<Setup>("/api/setup"),
  });
  const bundle = useQuery({
    queryKey: queryKeys.bundle,
    queryFn: () => api<Bundle>("/api/bundle"),
  });
  const offloadPage = (address: string) =>
    setup.data?.server_url && bundle.data?.project_id
      ? `${setup.data.server_url.replace(/\/$/, "")}/projects/${bundle.data.project_id}/network/offload?add=${encodeURIComponent(address)}`
      : null;
  const unknownColumns = useMemo<ColumnDef<UnknownTracker>[]>(
    () => [
      {
        header: t("LP0 address"),
        accessorKey: "dev_addr",
        cell: ({ getValue }) => (
          <span className="font-mono">{getValue<string>()}</span>
        ),
      },
      {
        header: t("Tracker EUI"),
        accessorKey: "source_eui",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">
            {getValue<string | null>() ?? (
              <span className="font-sans text-muted-foreground">
                {t("not on the card")}
              </span>
            )}
          </span>
        ),
      },
      {
        header: t("Frames"),
        accessorKey: "frames",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        header: t("Stations"),
        accessorKey: "stations",
        cell: ({ getValue }) => getValue<string[]>().join(", "),
      },
      {
        header: t("Last heard"),
        accessorKey: "last_at",
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          return v ? (
            <span className="whitespace-nowrap" title={formatTime(v)}>
              {formatAgo(v)}
            </span>
          ) : (
            ""
          );
        },
      },
      {
        header: "",
        id: "add",
        cell: ({ row }) => {
          const url = offloadPage(row.original.dev_addr);
          return url ? (
            <Button type="button" size="sm" onClick={() => openExternal(url)}>
              {t("Add in Protect")}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("sign in to a server to add it")}
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, setup.data?.server_url, bundle.data?.project_id],
  );
  const rows = useMemo(
    () => trackerRows(devices.data ?? [], trackers.data ?? []),
    [devices.data, trackers.data],
  );
  const columns = useMemo<ColumnDef<TrackerRow>[]>(
    () => [
      {
        header: t("Tracker"),
        accessorKey: "name",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{
                background: row.original.colour ?? "transparent",
                boxShadow: row.original.colour
                  ? undefined
                  : "inset 0 0 0 1.5px #8A9590",
              }}
            />
            <Link
              className="font-medium underline-offset-4 hover:underline"
              to={`/trackers/${row.original.device_id}`}
              onClick={(e) => e.stopPropagation()}
            >
              {row.original.name}
            </Link>
          </span>
        ),
      },
      {
        header: t("Tracks"),
        accessorKey: "entity_name",
        cell: ({ getValue }) =>
          getValue<string | null>() ?? (
            <span className="text-muted-foreground">{t("nothing")}</span>
          ),
      },
      {
        header: t("Type"),
        accessorKey: "device_type_label",
        cell: ({ getValue }) => getValue<string | null>() ?? "",
      },
      {
        header: t("DevEUI"),
        accessorKey: "dev_eui",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">
            {getValue<string | null>() ?? ""}
          </span>
        ),
      },
      {
        header: t("Keys"),
        accessorKey: "has_keys",
        cell: ({ row }) =>
          row.original.known_to_bundle ? (
            row.original.has_keys ? (
              t("on this laptop")
            ) : (
              t("not for this account")
            )
          ) : (
            <span className="text-muted-foreground">
              {t("not in the bundle")}
            </span>
          ),
      },
      {
        header: t("Positions"),
        accessorKey: "positions",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        header: t("Measurements"),
        accessorKey: "measurements",
        cell: ({ getValue }) => (
          <span className="tabular-nums">{getValue<number>()}</span>
        ),
      },
      {
        header: t("Last record"),
        accessorKey: "last_time",
        cell: ({ getValue }) => {
          const v = getValue<string | null>();
          return v ? (
            <span className="whitespace-nowrap" title={formatTime(v)}>
              {formatAgo(v)}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("none")}</span>
          );
        },
      },
    ],
    [t],
  );
  return (
    <>
      <PageHeader
        title={t("Trackers")}
        description={t(
          "Every tracker the app knows: the project's devices with an LP0 address, and what the files brought for each.",
        )}
      />
      <Page>
        {devices.data && devices.data.length === 0 && (
          <Callout kind="info">
            {t("Load a project first; its devices come with the bundle.")}{" "}
            <Link className="underline underline-offset-4" to="/setup">
              {t("Load a project")}
            </Link>
          </Callout>
        )}
        <DataTable
          columns={columns}
          data={rows}
          isLoading={devices.isPending || trackers.isPending}
          emptyMessage={t("No trackers yet.")}
          onRowClick={(row) => void navigate(`/trackers/${row.device_id}`)}
          columnsKey="trackers"
          defaultHiddenSmall={[
            "device_type_label",
            "dev_eui",
            "has_keys",
            "measurements",
          ]}
          searchable
        />
        {unknown.data && unknown.data.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-base font-semibold">{t("Unknown trackers")}</h2>
            <p className="text-xs text-muted-foreground">
              {t(
                'The cards hold frames of these LP0 addresses, and no device of the project has them. "Add in Protect" opens the project\'s Offload page on the address, where the tracker is made with the DevEUI the card named; then load the project again here and the frames decode.',
              )}
            </p>
            <DataTable
              columns={unknownColumns}
              data={unknown.data}
              emptyMessage={t("Every address has its tracker.")}
            />
          </section>
        )}
      </Page>
    </>
  );
}
