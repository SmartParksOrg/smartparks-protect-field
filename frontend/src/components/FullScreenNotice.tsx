import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { shell } from "@/lib/shell";

/** Full screen hides the shell's menu bar, so the way out must be on the page (Tim, 2026-10-17,
 * on Windows): a small pill at the top centre, where nothing else sits (the top right holds the
 * connection dot), with the key and a button. It fades after a few seconds and comes back when
 * the pointer reaches the top edge. */
export function FullScreenNotice() {
  const { t } = useTranslation();
  const [on, setOn] = useState(false);
  const [shown, setShown] = useState(false);
  useEffect(
    () =>
      shell()?.onFullScreen?.((next) => {
        setOn(next);
        setShown(next);
      }),
    [],
  );
  useEffect(() => {
    if (!on) return;
    const timer = window.setTimeout(() => setShown(false), 4000);
    const onMove = (event: MouseEvent) => {
      if (event.clientY <= 4) setShown(true);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", onMove);
    };
  }, [on]);
  if (!on) return null;
  return (
    <div
      role="status"
      className={`fixed left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 py-1 pl-3 pr-1 text-xs shadow transition-opacity ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}
      onMouseLeave={() => setShown(false)}
    >
      <span>{t("Esc leaves full screen")}</span>
      <Button type="button" size="sm" variant="outline" className="h-6 rounded-full px-2 text-xs" onClick={() => void shell()?.leaveFullScreen?.()}>
        {t("Leave")}
      </Button>
    </div>
  );
}
