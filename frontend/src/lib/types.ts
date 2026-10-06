// TypeScript mirrors of the backend's Pydantic schemas (backend/app/schemas.py).

export type MeetingType = "instant" | "scheduled";
export type MeetingStatus = "scheduled" | "live" | "ended";
export type ParticipantRole = "host" | "attendee";
export type ParticipantStatus = "joined" | "left" | "removed";
export type MeetingScope = "upcoming" | "recent";

export interface User {
  id: number;
  name: string;
  email: string;
  job_title: string | null;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface Meeting {
  meeting_code: string;
  title: string;
  description: string | null;
  meeting_type: MeetingType;
  status: MeetingStatus;
  scheduled_start: string; // ISO 8601, UTC
  duration_minutes: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  participant_count: number;
  join_url: string;
  host: { id: number; name: string };
}

export interface Participant {
  id: number;
  display_name: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  is_muted: boolean;
  is_video_on: boolean;
  joined_at: string;
}

export interface ScheduleMeetingInput {
  title: string;
  description: string | null;
  scheduled_start: string;
  duration_minutes: number;
}

export interface JoinMeetingInput {
  display_name: string;
  as_host: boolean;
  is_muted: boolean;
  is_video_on: boolean;
}

export interface JoinMeetingResult {
  participant: Participant;
  meeting: Meeting;
}

export interface RoomState {
  me: Participant;
  meeting: Meeting;
  participants: Participant[];
}
