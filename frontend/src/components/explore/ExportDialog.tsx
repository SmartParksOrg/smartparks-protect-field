import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Field } from "@/components/common/FormField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ExportSelection {
  trackers: string[];
  from: string | null;
  to: string | null;
  metrics: string[];
  /** What the selection reads as, for the dialog's summary. */
  summary: string;
  rows: number;
}

type Dataset = "records" | "positions";
type RecordsFormat = "csv-wide" | "csv-long";
type PositionsFormat = "geojson" | "gpx";

/** The export of the Data explorer's selection (decision D27), Protect's export dialog in
 * small: the records as CSV, wide (a column per metric, the default) or long (a row per
 * value), or the positions as GeoJSON or GPX. The file comes from the laptop's own data and
 * the browser saves it; Protect's export stays the one of record. */
export function ExportDialog({ open, onOpenChange, selection }: { open: boolean; onOpenChange: (open: boolean) => void; selection: ExportSelection }) {
  const { t } = useTranslation();
  const [dataset, setDataset] = useState<Dataset>("records");
  const [recordsFormat, setRecordsFormat] = useState<RecordsFormat>("csv-wide");
  const [positionsFormat, setPositionsFormat] = useState<PositionsFormat>("geojson");
  const format = dataset === "records" ? recordsFormat : positionsFormat;
  const query = new URLSearchParams();
  query.set("format", format);
  for (const id of selection.trackers) query.append("device_id", id);
  if (selection.from) query.set("since", selection.from);
  if (selection.to) query.set("until", selection.to);
  if (dataset === "records") for (const m of selection.metrics) query.append("metric", m);
  const href = `/api/export?${query.toString()}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Export")}</DialogTitle>
          <DialogDescription>{t("The decoded data on this laptop for the selection, as a file. Times are written in UTC. Protect's own export stays the one of record.")}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {selection.summary} · {t("{{count}} records", { count: selection.rows })}
        </p>
        <Field label={t("Data")} htmlFor="export-dataset">
          <Select value={dataset} onValueChange={(v) => setDataset(v as Dataset)}>
            <SelectTrigger id="export-dataset" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="records">{t("Records: the positions and the measurements")}</SelectItem>
              <SelectItem value="positions">{t("Positions: the tracks")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("Format")} htmlFor="export-format" hint={dataset === "records" ? t("Wide: one row per tracker and moment, a column per metric. Long: one row per value.") : t("GeoJSON: a line per tracker and its fixes as points. GPX: a track per tracker, for GPS tools.")}>
          {dataset === "records" ? (
            <Select value={recordsFormat} onValueChange={(v) => setRecordsFormat(v as RecordsFormat)}>
              <SelectTrigger id="export-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv-wide">{t("CSV, wide")}</SelectItem>
                <SelectItem value="csv-long">{t("CSV, long")}</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Select value={positionsFormat} onValueChange={(v) => setPositionsFormat(v as PositionsFormat)}>
              <SelectTrigger id="export-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="geojson">{t("GeoJSON")}</SelectItem>
                <SelectItem value="gpx">{t("GPX")}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
        <DialogFooter>
          <Button asChild disabled={selection.rows === 0}>
            <a href={href} download onClick={() => onOpenChange(false)}>
              <Download className="size-4" /> {t("Download")}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
