"use client";

import { CalendarPlus, ChevronRight, History } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useMeetings } from "@/hooks/useMeetings";
import { useMeetingActions } from "@/providers/MeetingActionsProvider";
import { ClockBanner } from "./ClockBanner";
import { MeetingListSkeleton, RecentMeetingItem, UpcomingMeetingItem } from "./MeetingItems";

const HOME_LIST_LIMIT = 5;

function SectionHeader({ title, count, href }: { title: string; count?: number; href: string }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2 sm:px-6">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        {title}
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-ink-muted">{count}</span>
        )}
      </h2>
      <Link
        href={href}
        className="inline-flex items-center gap-0.5 rounded-md text-[13px] font-semibold text-brand hover:text-brand-hover"
      >
        View all
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-line bg-surface shadow-card", className)}>
      {children}
    </section>
  );
}

export function UpcomingMeetingsCard() {
  const { status, meetings, error, retry } = useMeetings("upcoming");
  const { openSchedule } = useMeetingActions();

  return (
    <Card>
      <ClockBanner />
      <SectionHeader title="Upcoming meetings" count={meetings?.length} href="/meetings" />
      {status === "loading" && <MeetingListSkeleton rows={4} />}
      {status === "error" && <ErrorState message={error} onRetry={retry} />}
      {status === "success" &&
        (meetings.length === 0 ? (
          <EmptyState
            icon={<CalendarPlus />}
            title="No upcoming meetings"
            description="Meetings you schedule will show up here, with one-click Start and invite links."
            action={
              <Button size="sm" onClick={openSchedule}>
                Schedule a meeting
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line pb-2">
            {meetings.slice(0, HOME_LIST_LIMIT).map((meeting) => (
              <UpcomingMeetingItem key={meeting.meeting_code} meeting={meeting} />
            ))}
          </ul>
        ))}
    </Card>
  );
}

export function RecentMeetingsCard() {
  const { status, meetings, error, retry } = useMeetings("recent");

  return (
    <Card>
      <SectionHeader title="Recent meetings" href="/meetings?tab=previous" />
      {status === "loading" && <MeetingListSkeleton rows={3} />}
      {status === "error" && <ErrorState message={error} onRetry={retry} />}
      {status === "success" &&
        (meetings.length === 0 ? (
          <EmptyState
            icon={<History />}
            title="No recent meetings"
            description="Meetings you host will appear here after they end."
          />
        ) : (
          <ul className="divide-y divide-line pb-2">
            {meetings.slice(0, HOME_LIST_LIMIT).map((meeting) => (
              <RecentMeetingItem key={meeting.meeting_code} meeting={meeting} />
            ))}
          </ul>
        ))}
    </Card>
  );
}
