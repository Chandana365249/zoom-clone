"use client";

import { CalendarPlus, History, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useMeetings } from "@/hooks/useMeetings";
import { cn } from "@/lib/cn";
import { formatLongDate, formatRelativeDay } from "@/lib/format";
import { meetingStart } from "@/lib/meeting";
import type { Meeting } from "@/lib/types";
import { useMeetingActions } from "@/providers/MeetingActionsProvider";
import { MeetingListSkeleton, RecentMeetingItem, UpcomingMeetingItem } from "./MeetingItems";

export type MeetingsTab = "upcoming" | "previous";

const TABS: { id: MeetingsTab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "previous", label: "Previous" },
];

/** Groups meetings under day headings ("Today", "Tomorrow", "Thu, Oct 8"), preserving order. */
function groupByDay(meetings: Meeting[]): { label: string; fullDate: string; meetings: Meeting[] }[] {
  const groups = new Map<string, { label: string; fullDate: string; meetings: Meeting[] }>();
  for (const meeting of meetings) {
    const start = meetingStart(meeting);
    const key = start.toDateString();
    if (!groups.has(key)) groups.set(key, { label: formatRelativeDay(start), fullDate: formatLongDate(start), meetings: [] });
    groups.get(key)!.meetings.push(meeting);
  }
  return [...groups.values()];
}

export function MeetingsView({ tab }: { tab: MeetingsTab }) {
  const { openSchedule } = useMeetingActions();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Meetings</h1>
          <p className="mt-1 text-[15px] text-ink-muted">Manage the meetings you host.</p>
        </div>
        <Button onClick={openSchedule}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Schedule a meeting</span>
          <span className="sm:hidden">Schedule</span>
        </Button>
      </div>

      <div role="tablist" aria-label="Meeting lists" className="mt-6 flex gap-6 border-b border-line">
        {TABS.map(({ id, label }) => (
          <Link
            key={id}
            href={id === "upcoming" ? "/meetings" : "/meetings?tab=previous"}
            role="tab"
            aria-selected={tab === id}
            replace
            scroll={false}
            className={cn(
              "-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition-colors",
              tab === id ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="mt-6">{tab === "upcoming" ? <UpcomingList /> : <PreviousList />}</div>
    </div>
  );
}

function UpcomingList() {
  const { status, meetings, error, retry } = useMeetings("upcoming");
  const { openSchedule } = useMeetingActions();

  if (status === "loading") return <Panel><MeetingListSkeleton rows={4} /></Panel>;
  if (status === "error") return <Panel><ErrorState message={error} onRetry={retry} /></Panel>;
  if (meetings.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={<CalendarPlus />}
          title="No upcoming meetings"
          description="Schedule a meeting to get a meeting ID and invite link you can share ahead of time."
          action={<Button size="sm" onClick={openSchedule}>Schedule a meeting</Button>}
        />
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groupByDay(meetings).map((group) => (
        <section key={group.fullDate} aria-label={group.fullDate}>
          <h2 className="mb-2 px-1 text-[13px] font-semibold text-ink-muted">
            {/^(Today|Tomorrow)$/.test(group.label) ? (
              <>
                {group.label}
                <span className="font-normal"> · {group.fullDate}</span>
              </>
            ) : (
              group.fullDate
            )}
          </h2>
          <Panel>
            <ul className="divide-y divide-line">
              {group.meetings.map((meeting) => (
                <UpcomingMeetingItem key={meeting.meeting_code} meeting={meeting} showDay={false} />
              ))}
            </ul>
          </Panel>
        </section>
      ))}
    </div>
  );
}

function PreviousList() {
  const { status, meetings, error, retry } = useMeetings("recent");

  return (
    <Panel>
      {status === "loading" && <MeetingListSkeleton rows={5} />}
      {status === "error" && <ErrorState message={error} onRetry={retry} />}
      {status === "success" &&
        (meetings.length === 0 ? (
          <EmptyState icon={<History />} title="No previous meetings" description="Meetings appear here after they end." />
        ) : (
          <ul className="divide-y divide-line">
            {meetings.map((meeting) => (
              <RecentMeetingItem key={meeting.meeting_code} meeting={meeting} />
            ))}
          </ul>
        ))}
    </Panel>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">{children}</div>;
}
