"use client";

import { CircleAlert, DoorOpen, Hash, PhoneOff, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useLocalMedia } from "@/hooks/useLocalMedia";
import { usePreferences } from "@/hooks/usePreferences";
import { ApiError, api } from "@/lib/api";
import type { Meeting, RoomState } from "@/lib/types";
import { useCurrentUser } from "@/providers/AuthProvider";
import { MeetingRoom, type ExitReason } from "./MeetingRoom";
import { PreJoin } from "./PreJoin";
import { StatusScreen } from "./StatusScreen";

interface MeetingExperienceProps {
  code: string;
  asHost: boolean;
  initialName: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ready"; meeting: Meeting };

/**
 * Entry point for /meeting/[code]. Flow:
 *   load meeting → pre-join (camera/mic check + name) → room → exit screen.
 */
export function MeetingExperience({ code, asHost, initialName }: MeetingExperienceProps) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.getMeeting(code).then(
      (meeting) => !cancelled && setLoad({ status: "ready", meeting }),
      (error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) setLoad({ status: "not-found" });
        else setLoad({ status: "error", message: error instanceof Error ? error.message : "Something went wrong." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code, attempt]);

  if (load.status === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-room text-room-muted">
        <Spinner className="size-8 text-white" />
        <p className="text-sm">Connecting to meeting…</p>
      </div>
    );
  }

  if (load.status === "not-found") {
    return (
      <StatusScreen
        icon={<Hash />}
        tone="danger"
        title="This meeting ID is not valid"
        description="Check the meeting ID or invite link and try again. The host may also have deleted this meeting."
      />
    );
  }

  if (load.status === "error") {
    return (
      <StatusScreen
        icon={<CircleAlert />}
        tone="danger"
        title="Couldn't load the meeting"
        description={load.message}
        actions={
          <Button
            onClick={() => {
              setLoad({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
        }
      />
    );
  }

  return <MeetingSession meeting={load.meeting} asHost={asHost} initialName={initialName} />;
}

function MeetingSession({ meeting, asHost, initialName }: { meeting: Meeting; asHost: boolean; initialName: string }) {
  const user = useCurrentUser();
  const [exit, setExit] = useState<ExitReason | null>(meeting.status === "ended" && !asHost ? "ended" : null);
  // Hosts default to their profile name; guests opening an invite link type their own.
  const name = initialName || (asHost ? user?.name ?? "" : "");

  if (exit === null) {
    return <LiveSession meeting={meeting} asHost={asHost} initialName={name} onExit={setExit} />;
  }

  const screens = {
    left: {
      icon: <DoorOpen />,
      title: "You left the meeting",
      description: meeting.title,
      rejoin: true,
    },
    removed: {
      icon: <UserX />,
      title: "You were removed from the meeting",
      description: "The host removed you from this meeting.",
      rejoin: false,
    },
    ended: {
      icon: <PhoneOff />,
      title: "This meeting has ended",
      description: "The host ended the meeting, or everyone left.",
      rejoin: false,
    },
    "ended-by-me": {
      icon: <PhoneOff />,
      title: "Meeting ended for everyone",
      description: `${meeting.title} has ended. It now appears under Recent meetings.`,
      rejoin: false,
    },
  } as const;
  const screen = screens[exit];

  return (
    <StatusScreen
      icon={screen.icon}
      tone={exit === "removed" ? "danger" : "neutral"}
      title={screen.title}
      description={screen.description}
      actions={screen.rejoin && <Button onClick={() => setExit(null)}>Rejoin</Button>}
    />
  );
}

interface LiveSessionProps {
  meeting: Meeting;
  asHost: boolean;
  initialName: string;
  onExit: (reason: ExitReason) => void;
}

/** Owns the camera/mic for as long as the user is in the pre-join screen or the room. */
function LiveSession({ meeting, asHost, initialName, onExit }: LiveSessionProps) {
  const [preferences] = usePreferences();
  const media = useLocalMedia({ muted: preferences.joinMuted, videoOn: !preferences.joinWithVideoOff });
  const [joined, setJoined] = useState<RoomState | null>(null);

  if (!joined) {
    return (
      <PreJoin
        meeting={meeting}
        media={media}
        asHost={asHost}
        initialName={initialName}
        onJoined={({ participant, meeting: current }) =>
          setJoined({ me: participant, meeting: current, participants: [participant] })
        }
      />
    );
  }

  return <MeetingRoom initial={joined} media={media} onExit={onExit} />;
}
