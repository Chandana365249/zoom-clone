"use client";

import { useEffect, useRef } from "react";
import { useIsSpeaking } from "@/hooks/useIsSpeaking";
import type { PeerStatus } from "@/hooks/usePeerConnections";
import type { Participant } from "@/lib/types";
import { VideoTile } from "./VideoTile";

interface RemoteParticipantTileProps {
  participant: Participant;
  stream: MediaStream | undefined;
  status: PeerStatus | undefined;
}

/** Another participant: their WebRTC video in the tile, their audio through a hidden <audio>. */
export function RemoteParticipantTile({ participant, stream, status }: RemoteParticipantTileProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hasVideo = Boolean(stream?.getVideoTracks().length);
  const isSpeaking = useIsSpeaking(stream ?? null, !participant.is_muted && Boolean(stream?.getAudioTracks().length));

  // Audio plays even when their camera is off (the tile then shows an avatar, not a <video>).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream ?? null;
    if (stream) audio.play().catch(() => undefined);
  }, [stream]);

  const name = participant.role === "host" ? `${participant.display_name} (Host)` : participant.display_name;
  const statusLabel = status === "failed" ? " · can't connect" : status === "connecting" ? " · connecting…" : "";

  return (
    <>
      <VideoTile
        name={participant.display_name}
        label={`${name}${statusLabel}`}
        stream={stream}
        isVideoOn={participant.is_video_on && hasVideo}
        isMuted={participant.is_muted}
        isSpeaking={isSpeaking}
      />
      <audio ref={audioRef} autoPlay className="hidden" />
    </>
  );
}
