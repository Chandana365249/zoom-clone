"use client";

import { Copy, Ellipsis, Link2, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { cn } from "@/lib/cn";
import { formatDuration, formatMeetingCode, formatRelativeDay, formatTime } from "@/lib/format";
import { actualDurationMinutes, buildInvitation, meetingEnd, meetingStart } from "@/lib/meeting";
import type { Meeting } from "@/lib/types";
import { useMeetingActions } from "@/providers/MeetingActionsProvider";

const iconButton =
  "rounded-lg p-2 text-ink-subtle transition-colors hover:bg-canvas hover:text-ink aria-expanded:bg-canvas aria-expanded:text-ink";

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-bold tracking-wide text-danger uppercase">
      <span className="size-1.5 animate-pulse rounded-full bg-danger" />
      Live
    </span>
  );
}

interface UpcomingMeetingItemProps {
  meeting: Meeting;
  /** Show the day next to the time (lists that aren't already grouped by day). */
  showDay?: boolean;
}

export function UpcomingMeetingItem({ meeting, showDay = true }: UpcomingMeetingItemProps) {
  const { startMeeting, openEdit, confirmDelete } = useMeetingActions();
  const copy = useCopyToClipboard();
  const start = meetingStart(meeting);
  const isLive = meeting.status === "live";

  return (
    <li className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-canvas/60 sm:px-6">
      <div className="hidden w-[76px] shrink-0 sm:block">
        <p className="text-sm font-semibold text-ink tabular-nums">{formatTime(start)}</p>
        <p className="text-[12px] text-ink-muted">{showDay ? formatRelativeDay(start) : formatTime(meetingEnd(meeting))}</p>
      </div>

      <div className={cn("hidden w-1 self-stretch rounded-full sm:block", isLive ? "bg-danger" : "bg-brand/80")} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-ink">{meeting.title}</p>
          {isLive && <LiveBadge />}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-ink-muted">
          <span className="sm:hidden">
            {formatRelativeDay(start)}, {formatTime(start)} ·{" "}
          </span>
          {formatDuration(meeting.duration_minutes)} · ID{" "}
          <span className="tabular-nums">{formatMeetingCode(meeting.meeting_code)}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Copy invite link for ${meeting.title}`}
          title="Copy invite link"
          onClick={() => copy(meeting.join_url, "Invite link copied")}
          className={cn(iconButton, "hidden sm:block")}
        >
          <Link2 className="size-[18px]" />
        </button>
        <Menu
          trigger={(props) => (
            <button type="button" aria-label={`More actions for ${meeting.title}`} className={iconButton} {...props}>
              <Ellipsis className="size-[18px]" />
            </button>
          )}
          items={[
            { label: "Copy invite link", icon: <Link2 />, onSelect: () => copy(meeting.join_url, "Invite link copied") },
            { label: "Copy invitation", icon: <Copy />, onSelect: () => copy(buildInvitation(meeting), "Invitation copied") },
            ...(isLive
              ? []
              : [
                  { label: "Edit", icon: <Pencil />, onSelect: () => openEdit(meeting) },
                  { label: "Delete", icon: <Trash2 />, onSelect: () => confirmDelete(meeting), danger: true },
                ]),
          ]}
        />
        <Button size="sm" className="ml-1" onClick={() => startMeeting(meeting)}>
          {isLive ? "Join" : "Start"}
        </Button>
      </div>
    </li>
  );
}

export function RecentMeetingItem({ meeting }: { meeting: Meeting }) {
  const copy = useCopyToClipboard();
  const startedAt = new Date(meeting.started_at ?? meeting.scheduled_start);

  return (
    <li className="flex items-center gap-4 px-5 py-3.5 sm:px-6">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{meeting.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-muted">
          <span>
            {formatRelativeDay(startedAt)}, {formatTime(startedAt)}
          </span>
          <span aria-hidden>·</span>
          <span>{formatDuration(actualDurationMinutes(meeting))}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {meeting.participant_count}
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => copy(meeting.meeting_code, "Meeting ID copied")}
        title="Copy meeting ID"
        className="hidden shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-ink-muted tabular-nums transition-colors hover:bg-canvas hover:text-ink sm:inline-flex"
      >
        {formatMeetingCode(meeting.meeting_code)}
        <Copy className="size-3.5" />
      </button>
    </li>
  );
}

export function MeetingListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-busy aria-label="Loading meetings" className="divide-y divide-line">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex items-center gap-4 px-5 py-4 sm:px-6">
          <div className="hidden w-[76px] space-y-2 sm:block">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3 w-10" />
          </div>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-16 rounded-lg" />
        </li>
      ))}
    </ul>
  );
}
