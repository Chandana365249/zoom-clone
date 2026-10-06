// STUN/TURN servers for WebRTC come from the backend (/api/ice-servers), which keeps TURN
// secrets server-side and can hand out short-lived credentials.

import { api } from "./api";

const FALLBACK: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const REFRESH_AFTER_MS = 30 * 60 * 1000;

let cached: { servers: Promise<RTCIceServer[]>; fetchedAt: number } | null = null;

/** Shared by every connection on the page; fetched once and refreshed every 30 minutes. */
export function loadIceServers(): Promise<RTCIceServer[]> {
  if (!cached || Date.now() - cached.fetchedAt > REFRESH_AFTER_MS) {
    const servers = api.getIceServers().then(
      ({ ice_servers }) => (ice_servers.length ? ice_servers : FALLBACK),
      () => FALLBACK, // API unreachable: direct connections may still work
    );
    cached = { servers, fetchedAt: Date.now() };
  }
  return cached.servers;
}
