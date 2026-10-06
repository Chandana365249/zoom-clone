"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { RoomState } from "@/lib/types";

const POLL_INTERVAL_MS = 2000;
const FAILURES_BEFORE_RECONNECTING = 2;

/**
 * Keeps the meeting room in sync with the server by polling the participant heartbeat.
 *
 * Each heartbeat (1) tells the server this participant is still connected and (2) returns the
 * latest room state: the meeting, the participant list, and this participant's own record —
 * which is how a client learns that the host muted or removed it, or ended the meeting.
 *
 * `onUpdate` is called after every successful poll so the room can react to changes.
 */
export function useRoomState(initial: RoomState, onUpdate: (state: RoomState) => void) {
  const participantId = initial.me.id;
  const [state, setState] = useState<RoomState>(initial);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const handleUpdate = useEffectEvent(onUpdate);
  const pollNowRef = useRef<() => void>(() => undefined);
  const initialRef = useRef(initial);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;

    async function poll() {
      window.clearTimeout(timer);
      try {
        const next = await api.heartbeat(participantId);
        if (cancelled) return;
        failures = 0;
        setIsReconnecting(false);
        setState(next);
        handleUpdate(next);
      } catch (error) {
        if (cancelled) return;
        // A 404 means our session no longer exists; anything else is treated as transient.
        if (error instanceof ApiError && error.status === 404) {
          const snapshot = initialRef.current;
          handleUpdate({ ...snapshot, me: { ...snapshot.me, status: "left" } });
          return;
        }
        failures += 1;
        if (failures >= FAILURES_BEFORE_RECONNECTING) setIsReconnecting(true);
      }
      if (cancelled) return;
      // Clearing first guarantees a single pending timer even if refresh() overlapped a poll.
      window.clearTimeout(timer);
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    }

    pollNowRef.current = poll;
    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [participantId]);

  /** Poll immediately (e.g. right after a host action) instead of waiting for the next tick. */
  const refresh = useCallback(() => pollNowRef.current(), []);

  return { state, isReconnecting, refresh };
}
