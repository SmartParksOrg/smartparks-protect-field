import { useCallback, useState } from "react";

/** A per-person choice kept in the browser (Protect keeps it on the account; the app has none
 * of its own): the files' view, a table's columns. Missing or broken storage reads as the
 * fallback and writes are best effort. */
export function usePreference<T>(key: string, fallback: T): [T, (value: T) => void] {
  const storageKey = `protect-go-pref:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // storage may be unavailable
      }
    },
    [storageKey],
  );
  return [value, set];
}
