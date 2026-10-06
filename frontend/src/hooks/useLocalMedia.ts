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

// How many times a camera that stops on its own is restarted before giving up.
const MAX_VIDEO_RECOVERIES = 3;

/**
 * Owns this browser's camera and microphone.
 *
 * Audio and video are requested separately so a missing/blocked camera doesn't also take
 * away the microphone. Muting disables the audio track; turning video off fully stops the
 * camera (so the camera light goes off). All tracks are released on unmount.
 *
 * If the camera stops by itself (unplugged, taken by another app, driver hiccup), the track
 * fires "ended"; we restart it a few times, then fall back to "video off" so the UI and other
 * participants never show a frozen camera.
 */
export function useLocalMedia(initial: { muted: boolean; videoOn: boolean }) {
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(initial.muted);
  const [isVideoOn, setIsVideoOn] = useState(initial.videoOn);
  const [errors, setErrors] = useState<Partial<Record<DeviceKind, DeviceError>>>({});
  const streams = useRef<Record<DeviceKind, MediaStream | null>>({ audio: null, video: null });
  const initialRef = useRef(initial);
  const videoRecoveries = useRef(0);

  const setError = useCallback(
    (kind: DeviceKind, error: DeviceError | undefined) => setErrors((current) => ({ ...current, [kind]: error })),
    [],
  );

  /** Makes `stream` the active camera stream and watches it for the camera stopping on its own. */
  const installVideo = useCallback(
    (stream: MediaStream) => {
      function install(active: MediaStream) {
        streams.current.video = active;
        setVideoStream(active);
        const track = active.getVideoTracks()[0];
        if (!track) return;
        // "ended" only fires when the source stops by itself — never for our own track.stop().
        track.onended = async () => {
          if (streams.current.video !== active) return; // already replaced or turned off
          const giveUp = (error: DeviceError) => {
            streams.current.video = null;
            setVideoStream(null);
            setIsVideoOn(false);
            setError("video", error);
          };
          if (videoRecoveries.current >= MAX_VIDEO_RECOVERIES) return giveUp("failed");
          videoRecoveries.current += 1;
          try {
            const fresh = await requestStream("video");
            if (streams.current.video !== active) return stopStream(fresh); // user changed it meanwhile
            install(fresh);
          } catch (error) {
            if (streams.current.video === active) giveUp(toDeviceError(error));
          }
        };
      }
      install(stream);
    },
    [setError],
  );

  // Acquire devices once on mount; release them on unmount.
  //
  // React Strict Mode (development) mounts, unmounts and immediately remounts components.
  // Requesting the camera twice and stopping the first request at once can kill the device in
  // some browsers, so the release is deferred by one tick: an immediate remount cancels it and
  // keeps the devices, while a real unmount goes ahead and stops them.
  const releaseTimer = useRef<number | null>(null);
  const disposed = useRef(false);

  useEffect(() => {
    const release = () => {
      releaseTimer.current = window.setTimeout(() => {
        releaseTimer.current = null;
        disposed.current = true;
        stopStream(streams.current.audio);
        stopStream(streams.current.video);
        streams.current.audio = null;
        streams.current.video = null;
      }, 0);
    };

    if (releaseTimer.current !== null) {
      // Remounted straight away (Strict Mode): keep what we already have or are acquiring.
      window.clearTimeout(releaseTimer.current);
      releaseTimer.current = null;
      return release;
    }

    disposed.current = false;
    const { muted, videoOn } = initialRef.current;

    async function acquire(kind: DeviceKind) {
      try {
        const stream = await requestStream(kind);
        if (disposed.current) return stopStream(stream); // unmounted while waiting
        if (kind === "audio") {
          streams.current.audio = stream;
          stream.getAudioTracks().forEach((track) => (track.enabled = !muted));
          setAudioStream(stream);
        } else {
          installVideo(stream);
        }
      } catch (error) {
        if (disposed.current) return;
        setError(kind, toDeviceError(error));
        if (kind === "audio") setIsMuted(true);
        else setIsVideoOn(false);
      }
    }

    acquire("audio");
    if (videoOn) acquire("video");
    return release;
  }, [installVideo, setError]);

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
  }, [setError]);

  const setVideoOn = useCallback(async (on: boolean): Promise<DeviceError | null> => {
    if (!on) {
      stopStream(streams.current.video);
      streams.current.video = null;
      setVideoStream(null);
      setIsVideoOn(false);
      return null;
    }
    try {
      const previous = streams.current.video;
      streams.current.video = null; // so the old track's "ended" handler stands down
      stopStream(previous);
      installVideo(await requestStream("video"));
      videoRecoveries.current = 0;
      setIsVideoOn(true);
      setError("video", undefined);
      return null;
    } catch (error) {
      const deviceError = toDeviceError(error);
      setError("video", deviceError);
      return deviceError;
    }
  }, [installVideo, setError]);

  return { audioStream, videoStream, isMuted, isVideoOn, errors, setMuted, setVideoOn };
}

export type LocalMedia = ReturnType<typeof useLocalMedia>;
