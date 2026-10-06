"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { loadIceServers } from "@/lib/ice";
import type { Signal, SignalKind } from "@/lib/types";

/**
 * Peer-to-peer audio/video between everyone in the meeting (a WebRTC "mesh").
 *
 * - Each pair of participants has one RTCPeerConnection.
 * - To avoid both sides calling at once, the participant who joined LATER (higher id) sends the
 *   offer; the other side answers. A newcomer therefore calls everyone already in the room.
 * - Offers, answers and ICE candidates travel through our API (/participants/{id}/signals),
 *   which the room polls. Once connected, media flows browser-to-browser, not via our server.
 * - Every connection has one audio and one video transceiver from the start, so muting or
 *   turning the camera on/off is just `replaceTrack` — no renegotiation needed.
 * - STUN/TURN servers come from the backend (lib/ice.ts); TURN relays media when the two
 *   networks can't connect directly (mobile carriers, campus or corporate Wi-Fi).
 */

const SIGNAL_POLL_MS = 700;
const RECONNECT_DELAY_MS = 2000;
// Video watchdog: if someone's camera is on but no frames have arrived for this long, the
// connection is re-established (at most once per cooldown per participant).
const VIDEO_STALL_MS = 8000;
const VIDEO_RECOVERY_COOLDOWN_MS = 15000;
const WATCHDOG_INTERVAL_MS = 2000;

export type PeerStatus = "connecting" | "connected" | "failed";

interface Peer {
  pc: RTCPeerConnection;
  audio: RTCRtpTransceiver | null;
  video: RTCRtpTransceiver | null;
  stream: MediaStream;
  pendingCandidates: RTCIceCandidateInit[];
}

interface Options {
  meId: number;
  /** Ids of the other participants currently in the meeting (from the room state). */
  peerIds: number[];
  /** Of those, the ones whose camera is on (so we expect video frames from them). */
  videoOnIds: number[];
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
}

export function usePeerConnections({ meId, peerIds, videoOnIds, audioTrack, videoTrack }: Options) {
  const peers = useRef(new Map<number, Peer>());
  const knownIds = useRef(new Set<number>());
  const tracks = useRef({ audio: audioTrack, video: videoTrack });
  const expectVideo = useRef(new Set(videoOnIds));
  // Outgoing signals are sent one after another so the server stores them in order: an ICE
  // candidate must never overtake the offer/answer it belongs to.
  const outbox = useRef<Promise<unknown>>(Promise.resolve());
  // Candidates that arrive before we have a connection for that sender (kept until the offer).
  const earlyCandidates = useRef(new Map<number, RTCIceCandidateInit[]>());
  const [remoteStreams, setRemoteStreams] = useState<Map<number, MediaStream>>(new Map());
  const [statuses, setStatuses] = useState<Map<number, PeerStatus>>(new Map());

  /** Publishes the current peers' streams/statuses to React state. */
  const publish = useCallback(() => {
    setRemoteStreams(new Map([...peers.current].map(([id, peer]) => [id, peer.stream])));
    setStatuses(
      new Map(
        [...peers.current].map(([id, { pc }]) => [
          id,
          pc.connectionState === "connected" ? "connected" : pc.connectionState === "failed" ? "failed" : "connecting",
        ]),
      ),
    );
  }, []);

  const sendSignal = useCallback(
    (recipientId: number, kind: SignalKind, payload: unknown) => {
      const body = { recipient_id: recipientId, kind, payload: JSON.stringify(payload) };
      outbox.current = outbox.current
        .then(() => api.sendSignal(meId, body))
        .catch(() => {
          // The peer may have just left; the participant list update will clean up.
        });
    },
    [meId],
  );

  const closePeer = useCallback((remoteId: number) => {
    peers.current.get(remoteId)?.pc.close();
    peers.current.delete(remoteId);
  }, []);

  const attachLocalTracks = useCallback(async (peer: Peer) => {
    await Promise.all([
      peer.audio?.sender.replaceTrack(tracks.current.audio ?? null),
      peer.video?.sender.replaceTrack(tracks.current.video ?? null),
    ]);
  }, []);

  // Defined with a ref so createPeer and startCall can refer to each other (reconnects).
  const startCallRef = useRef<(remoteId: number) => Promise<void>>(async () => undefined);

  const createPeer = useCallback(
    async (remoteId: number): Promise<Peer> => {
      closePeer(remoteId);
      const iceServers = await loadIceServers();
      closePeer(remoteId); // in case another connection to this peer was made while waiting
      const pc = new RTCPeerConnection({ iceServers });
      const peer: Peer = { pc, audio: null, video: null, stream: new MediaStream(), pendingCandidates: [] };

      pc.onicecandidate = (event) => {
        if (event.candidate) sendSignal(remoteId, "ice", event.candidate.toJSON());
      };
      pc.ontrack = (event) => {
        // A new MediaStream object makes React (and the <video>/<audio> elements) pick it up.
        peer.stream = new MediaStream([...peer.stream.getTracks(), event.track]);
        publish();
      };
      pc.onconnectionstatechange = () => {
        publish();
        // The caller retries if the connection drops for good (e.g. a network change).
        if (pc.connectionState === "failed" && meId > remoteId) {
          window.setTimeout(() => {
            if (peers.current.get(remoteId)?.pc === pc) startCallRef.current(remoteId);
          }, RECONNECT_DELAY_MS);
        }
      };

      peers.current.set(remoteId, peer);
      publish();
      return peer;
    },
    [closePeer, meId, publish, sendSignal],
  );

  const startCall = useCallback(
    async (remoteId: number) => {
      const peer = await createPeer(remoteId);
      peer.audio = peer.pc.addTransceiver("audio", { direction: "sendrecv" });
      peer.video = peer.pc.addTransceiver("video", { direction: "sendrecv" });
      await attachLocalTracks(peer);
      await peer.pc.setLocalDescription(await peer.pc.createOffer());
      sendSignal(remoteId, "offer", peer.pc.localDescription?.toJSON());
    },
    [attachLocalTracks, createPeer, sendSignal],
  );
  useEffect(() => {
    startCallRef.current = startCall;
  }, [startCall]);

  const flushCandidates = useCallback(async (peer: Peer) => {
    for (const candidate of peer.pendingCandidates.splice(0)) {
      await peer.pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  const handleSignal = useCallback(
    async (signal: Signal) => {
      const from = signal.sender_id;
      const payload = JSON.parse(signal.payload);

      if (signal.kind === "offer") {
        // A (re)call from a newer participant: always start from a fresh connection.
        const peer = await createPeer(from);
        peer.pendingCandidates.push(...(earlyCandidates.current.get(from) ?? []));
        earlyCandidates.current.delete(from);
        await peer.pc.setRemoteDescription(payload);
        for (const transceiver of peer.pc.getTransceivers()) {
          transceiver.direction = "sendrecv";
          if (transceiver.receiver.track.kind === "audio") peer.audio = transceiver;
          if (transceiver.receiver.track.kind === "video") peer.video = transceiver;
        }
        await attachLocalTracks(peer);
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        sendSignal(from, "answer", peer.pc.localDescription?.toJSON());
        await flushCandidates(peer);
        return;
      }

      const peer = peers.current.get(from);
      if (!peer) {
        if (signal.kind === "ice") earlyCandidates.current.set(from, [...(earlyCandidates.current.get(from) ?? []), payload]);
        return;
      }
      if (signal.kind === "answer") {
        if (peer.pc.signalingState !== "have-local-offer") return;
        await peer.pc.setRemoteDescription(payload);
        await flushCandidates(peer);
      } else if (peer.pc.remoteDescription) {
        await peer.pc.addIceCandidate(payload).catch(() => undefined);
      } else {
        peer.pendingCandidates.push(payload); // arrived before the offer/answer was applied
      }
    },
    [attachLocalTracks, createPeer, flushCandidates, sendSignal],
  );

  // Poll the signaling relay. Messages are handled one at a time, in order.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let cursor = 0;

    async function poll() {
      try {
        const signals = await api.fetchSignals(meId, cursor);
        for (const signal of signals) {
          if (cancelled) return;
          cursor = signal.id;
          await handleSignal(signal).catch(() => undefined);
        }
      } catch {
        // Transient network error: try again on the next tick.
      }
      if (!cancelled) timer = window.setTimeout(poll, SIGNAL_POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [meId, handleSignal]);

  // Call newcomers and hang up on people who left.
  const peerIdsKey = [...peerIds].sort((a, b) => a - b).join(",");
  useEffect(() => {
    const present = new Set(peerIdsKey ? peerIdsKey.split(",").map(Number) : []);
    for (const id of present) {
      if (!knownIds.current.has(id)) {
        knownIds.current.add(id);
        if (meId > id && !peers.current.has(id)) startCall(id).catch(() => undefined);
      }
    }
    // Only close peers we've seen leave: an offer can arrive before the newcomer shows up
    // in our participant list, and that connection must not be torn down.
    for (const id of [...knownIds.current]) {
      if (!present.has(id)) {
        knownIds.current.delete(id);
        closePeer(id);
      }
    }
    publish();
  }, [peerIdsKey, meId, startCall, closePeer, publish]);

  // Video watchdog. Occasionally a connection comes up with audio flowing but one side's video
  // never arriving (seen intermittently in testing). If a participant's camera is on but their
  // video track has delivered no frames ("muted") for VIDEO_STALL_MS, call them again. The other
  // side accepts any offer by starting a fresh connection, so either side may do this.
  const videoOnKey = [...videoOnIds].sort((a, b) => a - b).join(",");
  useEffect(() => {
    expectVideo.current = new Set(videoOnKey ? videoOnKey.split(",").map(Number) : []);
  }, [videoOnKey]);
  useEffect(() => {
    const stalledSince = new Map<number, number>();
    const lastRecovery = new Map<number, number>();
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const [id, peer] of peers.current) {
        const video = peer.stream.getVideoTracks()[0];
        const stalled =
          peer.pc.connectionState === "connected" && expectVideo.current.has(id) && (!video || video.muted);
        if (!stalled) {
          stalledSince.delete(id);
          continue;
        }
        if (!stalledSince.has(id)) stalledSince.set(id, now);
        const waitedLongEnough = now - (stalledSince.get(id) ?? now) >= VIDEO_STALL_MS;
        const cooledDown = now - (lastRecovery.get(id) ?? 0) >= VIDEO_RECOVERY_COOLDOWN_MS;
        if (waitedLongEnough && cooledDown) {
          lastRecovery.set(id, now);
          stalledSince.delete(id);
          startCall(id).catch(() => undefined);
        }
      }
    }, WATCHDOG_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [startCall]);

  // Swap our outgoing tracks when the mic or camera changes (no renegotiation needed).
  useEffect(() => {
    tracks.current = { audio: audioTrack, video: videoTrack };
    for (const peer of peers.current.values()) attachLocalTracks(peer).catch(() => undefined);
  }, [audioTrack, videoTrack, attachLocalTracks]);

  // Hang up everything when leaving the room.
  useEffect(() => {
    const all = peers.current;
    const known = knownIds.current;
    return () => {
      for (const peer of all.values()) peer.pc.close();
      all.clear();
      known.clear(); // so a remount (e.g. React Strict Mode in dev) calls everyone again
    };
  }, []);

  return { remoteStreams, statuses };
}
