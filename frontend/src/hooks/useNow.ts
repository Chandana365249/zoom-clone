"use client";

import { useEffect, useState } from "react";

/**
 * Current time, refreshed every `intervalMs`. Returns null until mounted so server-rendered
 * HTML never contains a time that won't match the browser's (avoids hydration mismatches).
 */
export function useNow(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, intervalMs);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
