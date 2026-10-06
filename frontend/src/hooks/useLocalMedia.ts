"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DeviceKind = "audio" | "video";
export type DeviceError = "denied" | "not-found" | "in-use" | "unsupported" | "failed";

const ERROR_MESSAGES: Record<DeviceError, Record<DeviceKind, string>> = {
  denied: {
    audio: "Microphone access is blocked. Allow it from your browser's address bar.",
    video: "Camera access is blocked. Allow it from your browser's address bar.",
  },
  "not-found": { audio: "No microphone was found.", video: "No camera was found." },
  "in-use": {
    audio: "Your microphone is being used by another app.",
    video: "Your camera is being used by another app.",
  },
  unsupported: {
    audio: "This browser can't access a microphone here (HTTPS is required).",
    video: "This browser can't access a camera here (HTTPS is required).",
  },
  failed: { audio: "Couldn't start your microphone.", video: "Couldn't start your camera." },
};

export function deviceErrorMessage(kind: DeviceKind, error: DeviceError): string {
  return ERROR_MESSAGES[error][kind];
}

function toDeviceError(error: unknown): DeviceError {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "not-found";
  if (name === "NotReadableError" || name === "AbortError") return "in-use";
  if (name === "UnsupportedError") return "unsupported";
  return "failed";
}

async function requestStream(kind: DeviceKind): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("getUserMedia is unavailable", "UnsupportedError");
  }
  return navigator.mediaDevices.getUserMedia(
    kind === "video"
      ? { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } }
      : { audio: { echoCancellation: true, noiseSuppression: true } },
  );
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Owns this browser's camera and microphone.
 *
 * Audio and video are requested separately so a missing/blocked camera doesn't also take
 * away the microphone. Muting disables the audio track; turning video off fully stops the
 * camera (so the camera light goes off). All tracks are released on unmount.
 */
export function useLocalMedia(initial: { muted: boolean; videoOn: boolean }) {
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(initial.muted);
  const [isVideoOn, setIsVideoOn] = useState(initial.videoOn);
  const [errors, setErrors] = useState<Partial<Record<DeviceKind, DeviceError>>>({});
  const streams = useRef<Record<DeviceKind, MediaStream | null>>({ audio: null, video: null });
  const initialRef = useRef(initial);

  const setError = (kind: DeviceKind, error: DeviceError | undefined) =>
    setErrors((current) => ({ ...current, [kind]: error }));

  // Acquire devices once on mount.
  useEffect(() => {
    let cancelled = false;
    const { muted, videoOn } = initialRef.current;

    async function acquire(kind: DeviceKind) {
      try {
        const stream = await requestStream(kind);
        if (cancelled) return stopStream(stream);
        streams.current[kind] = stream;
        if (kind === "audio") {
          stream.getAudioTracks().forEach((track) => (track.enabled = !muted));
          setAudioStream(stream);
        } else {
          setVideoStream(stream);
        }
      } catch (error) {
        if (cancelled) return;
        setError(kind, toDeviceError(error));
        if (kind === "audio") setIsMuted(true);
        else setIsVideoOn(false);
      }
    }

    acquire("audio");
    if (videoOn) acquire("video");

    const current = streams.current;
    return () => {
      cancelled = true;
      stopStream(current.audio);
      stopStream(current.video);
      current.audio = null;
      current.video = null;
    };
  }, []);

  /** Returns the error if the change couldn't be applied (e.g. permission denied). */
  const setMuted = useCallback(async (muted: boolean): Promise<DeviceError | null> => {
    if (!muted && !streams.current.audio) {
      try {
        streams.current.audio = await requestStream("audio");
        setAudioStream(streams.current.audio);
        setError("audio", undefined);
      } catch (error) {
        const deviceError = toDeviceError(error);
        setError("audio", deviceError);
        return deviceError;
      }
    }
    streams.current.audio?.getAudioTracks().forEach((track) => (track.enabled = !muted));
    setIsMuted(muted);
    return null;
  }, []);

  const setVideoOn = useCallback(async (on: boolean): Promise<DeviceError | null> => {
    if (!on) {
      stopStream(streams.current.video);
      streams.current.video = null;
      setVideoStream(null);
      setIsVideoOn(false);
      return null;
    }
    try {
      stopStream(streams.current.video);
      streams.current.video = await requestStream("video");
      setVideoStream(streams.current.video);
      setIsVideoOn(true);
      setError("video", undefined);
      return null;
    } catch (error) {
      const deviceError = toDeviceError(error);
      setError("video", deviceError);
      return deviceError;
    }
  }, []);

  return { audioStream, videoStream, isMuted, isVideoOn, errors, setMuted, setVideoOn };
}

export type LocalMedia = ReturnType<typeof useLocalMedia>;
