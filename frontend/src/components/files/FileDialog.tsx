import { useQuery } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { api, type FileDetail, type FileRow } from "@/api/client";
import { queryKeys } from "@/api/queryKeys";
import { Callout } from "@/components/common/Callout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatAgo, formatTime } from "@/lib/format";
import { sizeLabel, uploadLabel } from "@/lib/files";

/** One file's properties, as Protect's log file dialog opens them: the SD card and the
 * station, the size and when it was read, the upload's state, the counts, the trackers it
 * carried, and every frame that could not be read with the reason. */
export function FileDialog({ file, onClose }: { file: FileRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const detail = useQuery({
    queryKey: queryKeys.file(file?.id ?? ""),
    queryFn: () => api<FileDetail>(`/api/files/${file?.id}`),
    enabled: file !== null,
  });
  const f = file;
  return (
    <Dialog open={f !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {f && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 break-all">
                <HardDrive className="size-4 shrink-0" /> {f.name}
              </DialogTitle>
              <DialogDescription>
                {t("{{card}}, {{folder}}, {{size}}, read {{ago}}", { card: f.card_name, folder: f.folder || t("no folder"), size: sizeLabel(f.size), ago: formatAgo(f.imported_at) })}
                {f.station_name ? `; ${f.station_name}` : f.station_eui ? `; ${f.station_eui}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{uploadLabel(f.upload_status, t)}</Badge>
                {f.uploaded_at && <span className="text-xs text-muted-foreground">{formatTime(f.uploaded_at)}</span>}
              </div>
              {f.upload_answer && f.upload_status !== "uploaded" && f.upload_status !== "duplicate" && <Callout kind={f.upload_status === "pending" ? "info" : "warning"}>{f.upload_answer}</Callout>}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">{t("Frames")}</dt>
                <dd>
                  {f.frames}
                  {f.refused + f.unknown + f.errors > 0 && <span className="text-destructive"> {t("({{count}} not read)", { count: f.refused + f.unknown + f.errors })}</span>}
                </dd>
                <dt className="text-muted-foreground">{t("Decoded")}</dt>
                <dd>{t("{{decoded}} decoded, {{repeated}} repeats", { decoded: f.decoded, repeated: f.repeated })}</dd>
                <dt className="text-muted-foreground">{t("Records")}</dt>
                <dd>{t("{{positions}} positions, {{measurements}} measurements", { positions: f.positions, measurements: f.measurements })}</dd>
                {f.unknown > 0 && (
                  <>
                    <dt className="text-muted-foreground">{t("Of trackers not known")}</dt>
                    <dd>{f.unknown}</dd>
                  </>
                )}
                {f.refused > 0 && (
                  <>
                    <dt className="text-muted-foreground">{t("Refused")}</dt>
                    <dd>{f.refused}</dd>
                  </>
                )}
                {f.errors > 0 && (
                  <>
                    <dt className="text-muted-foreground">{t("Unreadable lines")}</dt>
                    <dd>{f.errors}</dd>
                  </>
                )}
              </dl>
              {detail.data && detail.data.trackers.length > 0 && (
                <div>
                  <div className="mb-1 font-medium">{t("Trackers")}</div>
                  <ul className="space-y-0.5">
                    {detail.data.trackers.map((tr) => (
                      <li key={tr.device_id} className="flex items-center justify-between gap-2">
                        <Link className="underline underline-offset-4" to={`/trackers/${tr.device_id}`} onClick={onClose}>
                          {tr.device_name}
                        </Link>
                        <span className="text-muted-foreground tabular-nums">{t("{{decoded}} of {{frames}} frames, {{positions}} positions", { decoded: tr.decoded, frames: tr.frames, positions: tr.positions })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.data && detail.data.failures.length > 0 && (
                <div>
                  <div className="mb-1 font-medium">{t("Not read")}</div>
                  <ul className="max-h-48 space-y-1 overflow-auto text-xs">
                    {detail.data.failures.map((fail, index) => (
                      <li key={index}>
                        <span className="text-muted-foreground">{t("line {{line}}", { line: fail.line })}</span> {fail.device_name ?? fail.dev_addr ?? ""} <span className="font-mono text-muted-foreground">{fail.code}</span> {fail.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button asChild type="button" variant="outline" size="sm">
                <Link to={`/files/${f.card_id}`} onClick={onClose}>
                  {t("Open the SD card")}
                </Link>
              </Button>
              <Button type="button" onClick={onClose}>
                {t("Close")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
