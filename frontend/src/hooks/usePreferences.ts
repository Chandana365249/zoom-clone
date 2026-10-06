"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Per-browser meeting preferences (Settings page). These are personal device defaults,
// so localStorage is the right home for them rather than the database.

export interface MeetingPreferences {
  joinMuted: boolean;
  joinWithVideoOff: boolean;
}

const STORAGE_KEY = "zoom-clone:preferences";
const DEFAULTS: MeetingPreferences = { joinMuted: false, joinWithVideoOff: false };
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage disabled (e.g. some private modes)
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener); // changes made in other tabs
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function parse(raw: string | null): MeetingPreferences {
  if (!raw) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

/**
 * useSyncExternalStore keeps every component reading preferences in sync, and the server
 * snapshot (`null` -> defaults) avoids hydration mismatches.
 */
export function usePreferences(): [MeetingPreferences, (next: MeetingPreferences) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const preferences = useMemo(() => parse(raw), [raw]);

  const update = useCallback((next: MeetingPreferences) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not fatal: the preference just won't persist.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return [preferences, update];
}
