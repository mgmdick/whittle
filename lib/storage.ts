"use client";

import { useEffect, useState } from "react";

// Everything stays on the device. Storage can be unavailable (private mode,
// blocked site data), so every access is guarded and the app still works.

// Components rendered during the first (server-matched) render must start from
// `initial` to avoid hydration mismatches; anything mounted later can read
// storage synchronously, so switching tabs never flashes default state.
let hydrated = false;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw != null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => (hydrated ? read(key, initial) : initial));
  const [ready, setReady] = useState(hydrated);

  useEffect(() => {
    if (!ready) {
      setValue(read(key, initial));
      setReady(true); // batched with setValue, so the first write is the loaded value
    }
    hydrated = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value, ready]);

  return [value, setValue] as const;
}
