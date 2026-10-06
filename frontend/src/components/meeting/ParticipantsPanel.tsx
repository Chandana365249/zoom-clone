"use client";

import { Ellipsis, Link2, Mic, MicOff, UserX, Video, VideoOff, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";
import { cn } from "@/lib/cn";
import type { Participant } from "@/lib/types";

interface ParticipantsPanelProps {
  participants: Participant[];
  meId: number;
  isHost: boolean;
  onClose: () => void;
  onInvite: () => void;
  onMuteAll: () => void;
  onMute: (participant: Participant) => void;
  onRemove: (participant: Participant) => void;
}

export function ParticipantsPanel({
  participants,
  meId,
  isHost,
  onClose,
  onInvite,
  onMuteAll,
  onMute,
  onRemove,
}: ParticipantsPanelProps) {
  const othersUnmuted = participants.some((p) => p.id !== meId && !p.is_muted);

  return (
    <aside
      aria-label="Participants"
      className={cn(
        "flex flex-col bg-room-bar text-room-text",
        // Full-screen sheet on phones, side panel from md up.
        "fixed inset-0 z-30 animate-fade-in md:static md:z-auto md:w-80 md:animate-slide-in-right md:rounded-xl md:border md:border-room-line",
      )}
    >
      <header className="flex items-center justify-between border-b border-room-line px-4 py-3">
        <h2 className="text-sm font-semibold">Participants ({participants.length})</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close participants"
          className="rounded-md p-1 text-room-muted hover:bg-white/10 hover:text-white"
        >
          <X className="size-5" />
        </button>
      </header>

      <ul className="flex-1 overflow-y-auto py-2">
        {participants.map((participant) => {
          const isMe = participant.id === meId;
          const tags = [participant.role === "host" && "Host", isMe && "me"].filter(Boolean).join(", ");
          return (
            <li key={participant.id} className="group flex items-center gap-3 px-4 py-2 hover:bg-white/5">
              <Avatar name={participant.display_name} className="size-8 text-[12px]" />
              <p className="min-w-0 flex-1 truncate text-sm">
                {participant.display_name}
                {tags && <span className="text-room-muted"> ({tags})</span>}
              </p>
              {isHost && !isMe && (
                <Menu
                  dark
                  trigger={(props) => (
                    <button
                      type="button"
                      aria-label={`Actions for ${participant.display_name}`}
                      className="rounded-md p-1 text-room-muted hover:bg-white/10 hover:text-white aria-expanded:bg-white/10"
                      {...props}
                    >
                      <Ellipsis className="size-4" />
                    </button>
                  )}
                  items={[
                    ...(participant.is_muted
                      ? []
                      : [{ label: "Mute", icon: <MicOff />, onSelect: () => onMute(participant) }]),
                    { label: "Remove", icon: <UserX />, onSelect: () => onRemove(participant), danger: true },
                  ]}
                />
              )}
              <span className="flex items-center gap-2 text-room-muted">
                {participant.is_muted ? (
                  <MicOff aria-label="Muted" className="size-4 text-[#ff5c5c]" />
                ) : (
                  <Mic aria-label="Unmuted" className="size-4" />
                )}
                {participant.is_video_on ? (
                  <Video aria-label="Video on" className="size-4" />
                ) : (
                  <VideoOff aria-label="Video off" className="size-4 text-[#ff5c5c]" />
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <footer className="flex gap-2 border-t border-room-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onInvite}
          className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-room-raised text-[13px] font-semibold hover:bg-[#444]"
        >
          <Link2 className="size-4" />
          Invite
        </button>
        {isHost && (
          <button
            type="button"
            onClick={onMuteAll}
            disabled={!othersUnmuted}
            className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-room-raised text-[13px] font-semibold hover:bg-[#444] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MicOff className="size-4" />
            Mute all
          </button>
        )}
      </footer>
    </aside>
  );
}
