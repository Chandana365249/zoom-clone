// The single place where the frontend talks to the FastAPI backend.

import type {
  AuthResult,
  JoinMeetingInput,
  JoinMeetingResult,
  Meeting,
  MeetingScope,
  Participant,
  RoomState,
  ScheduleMeetingInput,
  Signal,
  SignalKind,
  User,
} from "./types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const TOKEN_KEY = "zoom-clone:token";

/**
 * The session token, kept in localStorage and sent as `Authorization: Bearer <token>`.
 * A header (rather than a cookie) works when the frontend and API are on different domains
 * (Vercel + Render) without third-party-cookie problems.
 */
export const authToken = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null): void {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage unavailable: the session just won't survive a reload.
    }
  },
};

let handleUnauthorized: (() => void) | null = null;

/** Registers what to do when the server rejects our token (expired or revoked session). */
export function onUnauthorized(handler: (() => void) | null): void {
  handleUnauthorized = handler;
}

/** Error thrown for any failed request. `code` mirrors the backend's machine-readable code. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = authToken.get();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      "Can't reach the server. Check your connection and try again.",
      0,
      "network_error",
    );
  }

  if (response.status === 401 && token) handleUnauthorized?.();

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      body?.detail ?? `Something went wrong (HTTP ${response.status}).`,
      response.status,
      body?.code ?? "http_error",
    );
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  signup: (input: { name: string; email: string; password: string }) =>
    post<AuthResult>("/api/auth/signup", input),
  login: (input: { email: string; password: string }) => post<AuthResult>("/api/auth/login", input),
  logout: () => post<void>("/api/auth/logout"),
  getCurrentUser: () => request<User>("/api/users/me"),

  listMeetings: (scope: MeetingScope) => request<Meeting[]>(`/api/meetings?scope=${scope}`),
  getMeeting: (code: string) => request<Meeting>(`/api/meetings/${encodeURIComponent(code)}`),
  createInstantMeeting: () => post<Meeting>("/api/meetings/instant"),
  scheduleMeeting: (input: ScheduleMeetingInput) => post<Meeting>("/api/meetings", input),
  updateMeeting: (code: string, input: Partial<ScheduleMeetingInput>) =>
    request<Meeting>(`/api/meetings/${code}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteMeeting: (code: string) => request<void>(`/api/meetings/${code}`, { method: "DELETE" }),

  joinMeeting: (code: string, input: JoinMeetingInput) =>
    post<JoinMeetingResult>(`/api/meetings/${code}/join`, input),
  heartbeat: (participantId: number) =>
    post<RoomState>(`/api/participants/${participantId}/heartbeat`),
  updateMediaState: (participantId: number, state: Partial<Pick<Participant, "is_muted" | "is_video_on">>) =>
    request<Participant>(`/api/participants/${participantId}`, {
      method: "PATCH",
      body: JSON.stringify(state),
    }),
  leaveMeeting: (participantId: number) => post<void>(`/api/participants/${participantId}/leave`),
  /** Fire-and-forget leave that survives the tab closing (used on `pagehide`). */
  leaveMeetingOnUnload: (participantId: number) => {
    fetch(`${API_URL}/api/participants/${participantId}/leave`, { method: "POST", keepalive: true }).catch(
      () => undefined,
    );
  },

  // WebRTC signaling relay (see hooks/usePeerConnections.ts).
  sendSignal: (participantId: number, signal: { recipient_id: number; kind: SignalKind; payload: string }) =>
    post<Signal>(`/api/participants/${participantId}/signals`, signal),
  fetchSignals: (participantId: number, after: number) =>
    request<Signal[]>(`/api/participants/${participantId}/signals?after=${after}`),

  // Host controls: the acting host's participant id proves they hold the host role.
  endMeeting: (code: string, hostParticipantId: number) =>
    post<Meeting>(`/api/meetings/${code}/end`, { host_participant_id: hostParticipantId }),
  muteAll: (code: string, hostParticipantId: number) =>
    post<{ muted: number }>(`/api/meetings/${code}/mute-all`, { host_participant_id: hostParticipantId }),
  muteParticipant: (participantId: number, hostParticipantId: number) =>
    post<Participant>(`/api/participants/${participantId}/mute`, { host_participant_id: hostParticipantId }),
  removeParticipant: (participantId: number, hostParticipantId: number) =>
    post<Participant>(`/api/participants/${participantId}/remove`, { host_participant_id: hostParticipantId }),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
