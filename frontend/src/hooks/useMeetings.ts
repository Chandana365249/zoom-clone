"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { Meeting, MeetingScope } from "@/lib/types";
import { useMeetingActions } from "@/providers/MeetingActionsProvider";

type MeetingsState =
  | { status: "loading"; meetings: null; error: null }
  | { status: "success"; meetings: Meeting[]; error: null }
  | { status: "error"; meetings: null; error: string };

/**
 * Loads upcoming or recent meetings. Refetches when meetings change (schedule/edit/delete)
 * and when the tab regains focus. Refetches keep showing the previous data instead of
 * flashing a skeleton.
 */
export function useMeetings(scope: MeetingScope) {
  const { version } = useMeetingActions();
  const [state, setState] = useState<MeetingsState>({ status: "loading", meetings: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.listMeetings(scope).then(
      (meetings) => !cancelled && setState({ status: "success", meetings, error: null }),
      (error) => !cancelled && setState({ status: "error", meetings: null, error: errorMessage(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [scope, version, attempt]);

  useEffect(() => {
    const onFocus = () => setAttempt((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const retry = useCallback(() => {
    setState({ status: "loading", meetings: null, error: null });
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, retry };
}
