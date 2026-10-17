import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { shell } from "@/lib/shell";

/** Full screen hides the shell's menu bar, so the way out must be on the page (Tim, 2026-10-17,
 * on Windows): a small bar while the window is full screen, with the keys and a button. */
export function FullScreenNotice() {
  const { t } = useTranslation();
  const [on, setOn] = useState(false);
  useEffect(() => shell()?.onFullScreen?.(setOn), []);
  if (!on) return null;
  return (
    <div role="status" className="fixed right-3 top-3 z-50 flex items-center gap-2 rounded-md border bg-background/95 px-3 py-1.5 text-xs shadow">
      <span>{t("Full screen. Esc or F11 leaves it.")}</span>
      <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => void shell()?.leaveFullScreen?.()}>
        {t("Leave full screen")}
      </Button>
    </div>
  );
}
