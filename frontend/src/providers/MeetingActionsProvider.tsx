"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DeleteMeetingDialog } from "@/components/dashboard/DeleteMeetingDialog";
import { JoinMeetingDialog } from "@/components/dashboard/JoinMeetingDialog";
import { ScheduleMeetingDialog } from "@/components/dashboard/ScheduleMeetingDialog";
import { useToast } from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/api";
import { meetingRoomPath } from "@/lib/meeting";
import type { Meeting } from "@/lib/types";
import { useCurrentUser } from "./AuthProvider";

interface MeetingActions {
  startInstantMeeting: () => Promise<void>;
  isStartingInstant: boolean;
  startMeeting: (meeting: Meeting) => void;
  openJoin: () => void;
  openSchedule: () => void;
  openEdit: (meeting: Meeting) => void;
  confirmDelete: (meeting: Meeting) => void;
  /** Incremented after any create/update/delete so meeting lists know to refetch. */
  version: number;
}

const MeetingActionsContext = createContext<MeetingActions | null>(null);

/**
 * Owns the dashboard's dialogs and meeting actions so any component (top bar buttons,
 * dashboard tiles, meeting cards) can trigger them without prop drilling.
 */
export function MeetingActionsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const user = useCurrentUser();
  const userName = user?.name ?? "";

  const [joinOpen, setJoinOpen] = useState(false);
  const [schedule, setSchedule] = useState<{ open: boolean; editing: Meeting | null }>({ open: false, editing: null });
  const [deleting, setDeleting] = useState<Meeting | null>(null);
  const [isStartingInstant, setIsStartingInstant] = useState(false);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const startInstantMeeting = useCallback(async () => {
    setIsStartingInstant(true);
    try {
      const meeting = await api.createInstantMeeting();
      router.push(meetingRoomPath(meeting.meeting_code, { host: true, name: userName }));
    } catch (error) {
      toast.error(errorMessage(error));
      setIsStartingInstant(false);
    }
  }, [router, toast, userName]);

  const value = useMemo<MeetingActions>(
    () => ({
      startInstantMeeting,
      isStartingInstant,
      startMeeting: (meeting) => router.push(meetingRoomPath(meeting.meeting_code, { host: true, name: userName })),
      openJoin: () => setJoinOpen(true),
      openSchedule: () => setSchedule({ open: true, editing: null }),
      openEdit: (meeting) => setSchedule({ open: true, editing: meeting }),
      confirmDelete: setDeleting,
      version,
    }),
    [startInstantMeeting, isStartingInstant, router, userName, version],
  );

  return (
    <MeetingActionsContext.Provider value={value}>
      {children}
      <JoinMeetingDialog open={joinOpen} onClose={() => setJoinOpen(false)} defaultName={userName} />
      <ScheduleMeetingDialog
        open={schedule.open}
        editing={schedule.editing}
        defaultTitle={userName ? `${userName}'s Zoom Meeting` : "My Meeting"}
        onClose={() => setSchedule({ open: false, editing: null })}
        onSaved={refresh}
      />
      <DeleteMeetingDialog meeting={deleting} onClose={() => setDeleting(null)} onDeleted={refresh} />
    </MeetingActionsContext.Provider>
  );
}

export function useMeetingActions(): MeetingActions {
  const context = useContext(MeetingActionsContext);
  if (!context) throw new Error("useMeetingActions must be used inside <MeetingActionsProvider>");
  return context;
}
