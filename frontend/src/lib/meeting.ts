// Meeting-specific helpers shared by the dashboard and the meeting room.

import { formatDuration, formatLongDate, formatMeetingCode, formatTime } from "./format";
import type { Meeting } from "./types";

/**
 * Accepts what people actually paste into "Join": a meeting ID with or without spaces/dashes
 * ("852 1234 5678") or a full invite link ("https://host/j/85212345678").
 * Returns the bare numeric meeting code, or null if the input isn't recognisable.
 */
export function parseMeetingInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const fromLink = value.match(/\/(?:j|meeting)\/(\d{9,11})(?:[/?#]|$)/);
  if (fromLink) return fromLink[1];

  const digits = value.replace(/[\s-]/g, "");
  return /^\d{9,11}$/.test(digits) ? digits : null;
}

export function meetingStart(meeting: Meeting): Date {
  return new Date(meeting.scheduled_start);
}

export function meetingEnd(meeting: Meeting): Date {
  return new Date(meetingStart(meeting).getTime() + meeting.duration_minutes * 60_000);
}

/** Actual length of an ended meeting in minutes (falls back to the planned duration). */
export function actualDurationMinutes(meeting: Meeting): number {
  if (!meeting.started_at || !meeting.ended_at) return meeting.duration_minutes;
  const ms = new Date(meeting.ended_at).getTime() - new Date(meeting.started_at).getTime();
  return Math.max(1, Math.round(ms / 60_000));
}

/** The full invitation text, in the format Zoom's "Copy invitation" produces. */
export function buildInvitation(meeting: Meeting): string {
  const isScheduled = meeting.meeting_type === "scheduled";
  const lines = [
    `${meeting.host.name} is inviting you to a ${isScheduled ? "scheduled " : ""}Zoom meeting.`,
    "",
    `Topic: ${meeting.title}`,
  ];
  if (isScheduled) {
    const start = meetingStart(meeting);
    lines.push(`Time: ${formatLongDate(start)}, ${formatTime(start)} (${formatDuration(meeting.duration_minutes)})`);
  }
  lines.push("", "Join Zoom Meeting", meeting.join_url, "", `Meeting ID: ${formatMeetingCode(meeting.meeting_code)}`);
  return lines.join("\n");
}

/** URL of the pre-join screen. `host` starts the meeting as its host. */
export function meetingRoomPath(code: string, options: { host?: boolean; name?: string } = {}): string {
  const params = new URLSearchParams();
  if (options.host) params.set("host", "1");
  if (options.name) params.set("name", options.name);
  const query = params.toString();
  return `/meeting/${code}${query ? `?${query}` : ""}`;
}
