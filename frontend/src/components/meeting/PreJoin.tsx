"use client";

import { CalendarDays, CircleAlert, Copy, Mic, MicOff, Video, VideoOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useIsSpeaking } from "@/hooks/useIsSpeaking";
import { deviceErrorMessage, type LocalMedia } from "@/hooks/useLocalMedia";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDuration, formatMeetingCode, formatRelativeDay, formatTime } from "@/lib/format";
import { loadIceServers } from "@/lib/ice";
import { meetingStart } from "@/lib/meeting";
import type { JoinMeetingResult, Meeting } from "@/lib/types";
import { VideoTile } from "./VideoTile";

interface PreJoinProps {
  meeting: Meeting;
  media: LocalMedia;
  asHost: boolean;
  initialName: string;
  onJoined: (result: JoinMeetingResult) => void;
}

/** The "check your camera and mic, enter your name" screen shown before entering the room. */
export function PreJoin({ meeting, media, asHost, initialName, onJoined }: PreJoinProps) {
  const copy = useCopyToClipboard();
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const isSpeaking = useIsSpeaking(media.audioStream, !media.isMuted);
  const start = meetingStart(meeting);

  // Fetch STUN/TURN servers while the user checks their camera, so calls start faster.
  useEffect(() => {
    loadIceServers();
  }, []);
  const deviceErrors = (["audio", "video"] as const)
    .filter((kind) => media.errors[kind])
    .map((kind) => deviceErrorMessage(kind, media.errors[kind]!));

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    const displayName = name.trim();
    if (!displayName) {
      setNameError("Enter the name others will see.");
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const result = await api.joinMeeting(meeting.meeting_code, {
        display_name: displayName,
        as_host: asHost,
        is_muted: media.isMuted,
        is_video_on: media.isVideoOn,
      });
      onJoined(result);
    } catch (error) {
      setJoinError(errorMessage(error));
      setJoining(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-room text-room-text">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-[26px] leading-none font-extrabold tracking-[-0.04em] text-white">
          zoom
        </Link>
        <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium text-room-muted hover:bg-white/10 hover:text-white">
          Back to home
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10">
        <section aria-label="Camera preview" className="flex flex-col gap-4">
          <VideoTile
            name={name.trim() || "You"}
            stream={media.videoStream}
            isVideoOn={media.isVideoOn}
            isMuted={media.isMuted}
            isSpeaking={isSpeaking}
            isSelf
            className="w-full shadow-2xl shadow-black/40"
          />
          <div className="flex justify-center gap-3">
            <DeviceToggle
              on={!media.isMuted}
              onIcon={<Mic />}
              offIcon={<MicOff />}
              label={media.isMuted ? "Unmute" : "Mute"}
              onClick={() => media.setMuted(!media.isMuted)}
            />
            <DeviceToggle
              on={media.isVideoOn}
              onIcon={<Video />}
              offIcon={<VideoOff />}
              label={media.isVideoOn ? "Stop Video" : "Start Video"}
              onClick={() => media.setVideoOn(!media.isVideoOn)}
            />
          </div>
          {deviceErrors.map((message) => (
            <p key={message} className="flex items-center justify-center gap-2 text-center text-[13px] text-[#f5c86b]">
              <CircleAlert className="size-4 shrink-0" />
              {message}
            </p>
          ))}
        </section>

        <section className="rounded-2xl border border-room-line bg-room-bar p-6 sm:p-7">
          <p className="text-[13px] font-semibold tracking-wide text-[#6ea0ff] uppercase">
            {asHost ? "You're the host" : "Ready to join?"}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight break-words">{meeting.title}</h1>

          <dl className="mt-4 space-y-1.5 text-sm text-room-muted">
            <div className="flex gap-2">
              <dt className="sr-only">Host</dt>
              <dd>Hosted by {meeting.host.name}</dd>
            </div>
            <div className="flex gap-2">
              <dt>Meeting ID</dt>
              <dd className="text-room-text tabular-nums">{formatMeetingCode(meeting.meeting_code)}</dd>
            </div>
            {meeting.meeting_type === "scheduled" && meeting.status === "scheduled" && (
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4" />
                <dt className="sr-only">Scheduled for</dt>
                <dd>
                  {formatRelativeDay(start)}, {formatTime(start)} · {formatDuration(meeting.duration_minutes)}
                </dd>
              </div>
            )}
            {meeting.status === "live" && (
              <div className="flex items-center gap-2 text-[#3ccf6e]">
                <span className="size-2 rounded-full bg-[#3ccf6e]" />
                <dt className="sr-only">Status</dt>
                <dd>In progress</dd>
              </div>
            )}
          </dl>

          <form onSubmit={handleJoin} noValidate className="mt-6 flex flex-col gap-3">
            <label htmlFor="prejoin-name" className="text-[13px] font-semibold">
              Your name
            </label>
            <input
              id="prejoin-name"
              value={name}
              maxLength={50}
              autoComplete="name"
              autoFocus={!initialName}
              placeholder="Enter your name"
              aria-invalid={Boolean(nameError) || undefined}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
              }}
              className={cn(
                "h-11 rounded-[10px] border bg-room-tile px-3.5 text-[15px] text-white outline-none placeholder:text-room-muted",
                "focus:border-brand focus:ring-4 focus:ring-brand/25",
                nameError ? "border-danger" : "border-room-line",
              )}
            />
            {nameError && (
              <p role="alert" className="text-[13px] font-medium text-[#ff6b6b]">
                {nameError}
              </p>
            )}
            {joinError && (
              <p role="alert" className="rounded-lg bg-danger/15 px-3 py-2 text-[13px] font-medium text-[#ff8a8a]">
                {joinError}
              </p>
            )}
            <button
              type="submit"
              disabled={joining}
              className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-70"
            >
              {joining && <Spinner />}
              {asHost ? (meeting.status === "live" ? "Rejoin as host" : "Start meeting") : "Join"}
            </button>
            <button
              type="button"
              onClick={() => copy(meeting.join_url, "Invite link copied")}
              className="flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-room-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <Copy className="size-4" />
              Copy invite link
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

interface DeviceToggleProps {
  on: boolean;
  onIcon: ReactNode;
  offIcon: ReactNode;
  label: string;
  onClick: () => void;
}

function DeviceToggle({ on, onIcon, offIcon, label, onClick }: DeviceToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!on}
      className="flex flex-col items-center gap-1.5 text-[12px] font-medium text-room-muted"
    >
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-full transition-colors [&>svg]:size-5",
          on ? "bg-room-raised text-white hover:bg-[#444]" : "bg-danger text-white hover:bg-danger-hover",
        )}
      >
        {on ? onIcon : offIcon}
      </span>
      {label}
    </button>
  );
}
