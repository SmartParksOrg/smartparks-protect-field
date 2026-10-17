import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { applyTheme, nextTheme, readStoredTheme, resolveTheme, storeTheme, type Theme } from "@/lib/theme";

const QUERY = "(prefers-color-scheme: dark)";
const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const prefersDark = () => window.matchMedia(QUERY).matches;

/** Light, dark or system, as Protect has it (its decision D183), kept in the browser: there is
 * no account on the app's own server to keep it on. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const dark = useSyncExternalStore(subscribe, prefersDark, () => false);
  const resolved = resolveTheme(theme, dark);
  useEffect(() => {
    applyTheme(resolved);
    storeTheme(theme);
  }, [resolved, theme]);
  const cycle = useCallback(() => setTheme(nextTheme(theme)), [theme]);
  return { theme, resolved, setTheme, cycle };
}
