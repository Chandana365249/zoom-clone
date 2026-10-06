"use client";

import { Link2, Mic, MicOff, PhoneOff, Users, Video, VideoOff, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Menu } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useIsSpeaking } from "@/hooks/useIsSpeaking";
import { deviceErrorMessage, type LocalMedia } from "@/hooks/useLocalMedia";
import { useNow } from "@/hooks/useNow";
import { useRoomState } from "@/hooks/useRoomState";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatElapsed } from "@/lib/format";
import type { Participant, RoomState } from "@/lib/types";
import { ControlButton } from "./ControlButton";
import { MeetingInfoPopover } from "./MeetingInfoPopover";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { VideoTile } from "./VideoTile";

export type ExitReason = "left" | "removed" | "ended" | "ended-by-me";

// After a local mute/unmute, ignore the server's mute flag briefly: a heartbeat that was already
// in flight could still carry the old value and would otherwise undo the user's click.
const LOCAL_CHANGE_GRACE_MS = 4000;

function gridLayout(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-5xl";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2 max-w-6xl";
  if (count <= 4) return "grid-cols-2 max-w-5xl";
  if (count <= 9) return "grid-cols-2 sm:grid-cols-3 max-w-6xl";
  return "grid-cols-3 lg:grid-cols-4 max-w-7xl";
}

interface MeetingRoomProps {
  initial: RoomState;
  media: LocalMedia;
  onExit: (reason: ExitReason) => void;
}

export function MeetingRoom({ initial, media, onExit }: MeetingRoomProps) {
  const toast = useToast();
  const copy = useCopyToClipboard();
  const [showParticipants, setShowParticipants] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Participant | null>(null);
  const lastLocalChange = useRef(0);
  const meId = initial.me.id;

  const { state, isReconnecting, refresh } = useRoomState(initial, (next) => {
    if (next.me.status === "removed") return onExit("removed");
    if (next.me.status !== "joined" || next.meeting.status === "ended") return onExit("ended");
    const hostMutedMe = next.me.is_muted && !media.isMuted;
    if (hostMutedMe && Date.now() - lastLocalChange.current > LOCAL_CHANGE_GRACE_MS) {
      media.setMuted(true);
      toast.info("The host muted you");
    }
  });

  const { meeting, participants } = state;
  const me = state.me;
  const isHost = me.role === "host";
  const isSpeaking = useIsSpeaking(media.audioStream, !media.isMuted);
  const now = useNow(1000);
  const startedAt = meeting.started_at ? new Date(meeting.started_at).getTime() : null;

  // Tell the server we left if the tab is closed or reloaded.
  useEffect(() => {
    const onPageHide = () => api.leaveMeetingOnUnload(meId);
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [meId]);

  function syncMediaState(update: { is_muted?: boolean; is_video_on?: boolean }) {
    lastLocalChange.current = Date.now();
    api.updateMediaState(meId, update).catch((error) => {
      // 409 means we were removed or the meeting ended; the next heartbeat handles that.
      if (!(error instanceof ApiError && error.status === 409)) toast.error(errorMessage(error));
    });
  }

  async function toggleMute() {
    const muted = !media.isMuted;
    const error = await media.setMuted(muted);
    if (error) return toast.error(deviceErrorMessage("audio", error));
    syncMediaState({ is_muted: muted });
  }

  async function toggleVideo() {
    const on = !media.isVideoOn;
    const error = await media.setVideoOn(on);
    if (error) return toast.error(deviceErrorMessage("video", error));
    syncMediaState({ is_video_on: on });
  }

  async function runHostAction(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
      refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function leave() {
    try {
      await api.leaveMeeting(meId);
    } catch {
      // Leaving should always succeed from the user's point of view; the server
      // will expire this session via the heartbeat timeout if the request failed.
    }
    onExit("left");
  }

  async function endForAll() {
    try {
      await api.endMeeting(meeting.meeting_code, meId);
      onExit("ended-by-me");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  // Your own tile first, then everyone else in join order (host first).
  const tiles = [
    {
      key: meId,
      name: me.display_name,
      label: `${me.display_name} (You)`,
      isSelf: true,
      isMuted: media.isMuted,
      isVideoOn: media.isVideoOn,
      stream: media.videoStream,
      isSpeaking,
    },
    ...participants
      .filter((p) => p.id !== meId)
      .map((p) => ({
        key: p.id,
        name: p.display_name,
        label: p.role === "host" ? `${p.display_name} (Host)` : p.display_name,
        isSelf: false,
        isMuted: p.is_muted,
        isVideoOn: false, // remote media isn't streamed in this build (no WebRTC); show their avatar
        stream: null,
        isSpeaking: false,
      })),
  ];
  // Reflect local media state in the participant list immediately, without waiting for a poll.
  const panelParticipants = participants.map((p) =>
    p.id === meId ? { ...p, is_muted: media.isMuted, is_video_on: media.isVideoOn } : p,
  );

  return (
    <div className="flex h-dvh flex-col bg-room text-room-text">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-2 sm:px-3">
        <MeetingInfoPopover meeting={meeting} myName={me.display_name} />
        <div className="flex shrink-0 items-center gap-3 text-[13px]">
          {isReconnecting && (
            <span className="flex items-center gap-1.5 rounded-md bg-[#f5a524]/15 px-2 py-1 font-medium text-[#f5c86b]">
              <WifiOff className="size-3.5" />
              Reconnecting…
            </span>
          )}
          {startedAt && now && (
            <span className="font-medium text-room-muted tabular-nums">
              {formatElapsed((now.getTime() - startedAt) / 1000)}
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 px-2 pb-2 sm:px-3">
        <main className="flex min-w-0 flex-1 overflow-y-auto">
          <div className={cn("m-auto grid w-full gap-2 sm:gap-3", gridLayout(tiles.length))}>
            {tiles.map(({ key, ...tile }) => (
              <VideoTile key={key} {...tile} />
            ))}
          </div>
        </main>

        {showParticipants && (
          <ParticipantsPanel
            participants={panelParticipants}
            meId={meId}
            isHost={isHost}
            onClose={() => setShowParticipants(false)}
            onInvite={() => copy(meeting.join_url, "Invite link copied")}
            onMuteAll={() =>
              runHostAction(() => api.muteAll(meeting.meeting_code, meId), "Everyone else has been muted")
            }
            onMute={(p) => runHostAction(() => api.muteParticipant(p.id, meId), `${p.display_name} was muted`)}
            onRemove={setRemoveTarget}
          />
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-1 border-t border-room-line bg-room-bar px-1.5 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] sm:px-3">
        <div className="flex items-center">
          <ControlButton
            icon={media.isMuted ? <MicOff /> : <Mic />}
            label={media.isMuted ? "Unmute" : "Mute"}
            alert={media.isMuted}
            warning={Boolean(media.errors.audio)}
            onClick={toggleMute}
          />
          <ControlButton
            icon={media.isVideoOn ? <Video /> : <VideoOff />}
            label={media.isVideoOn ? "Stop Video" : "Start Video"}
            alert={!media.isVideoOn}
            warning={Boolean(media.errors.video)}
            onClick={toggleVideo}
          />
        </div>

        <div className="flex items-center">
          <ControlButton
            icon={<Users />}
            label="Participants"
            badge={participants.length}
            active={showParticipants}
            aria-pressed={showParticipants}
            onClick={() => setShowParticipants((value) => !value)}
          />
          <ControlButton
            icon={<Link2 />}
            label="Invite"
            className="hidden sm:flex"
            onClick={() => copy(meeting.join_url, "Invite link copied")}
          />
        </div>

        <Menu
          dark
          placement="top"
          trigger={(props) => (
            <button
              type="button"
              className="flex h-10 items-center gap-2 rounded-lg bg-danger px-3 text-sm font-semibold text-white transition-colors hover:bg-danger-hover sm:px-4"
              {...props}
            >
              <PhoneOff className="size-4" />
              {isHost ? "End" : "Leave"}
            </button>
          )}
          items={[
            ...(isHost ? [{ label: "End meeting for all", onSelect: endForAll, danger: true }] : []),
            { label: "Leave meeting", onSelect: leave },
          ]}
        />
      </footer>

      <Dialog
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title={`Remove ${removeTarget?.display_name ?? ""}?`}
        className="max-w-sm"
      >
        <p className="text-sm leading-6 text-ink-muted">They&apos;ll be removed from the meeting right away.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const target = removeTarget;
              setRemoveTarget(null);
              if (target) {
                runHostAction(() => api.removeParticipant(target.id, meId), `${target.display_name} was removed`);
              }
            }}
          >
            Remove
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
