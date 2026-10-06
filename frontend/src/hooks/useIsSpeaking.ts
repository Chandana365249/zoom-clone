"use client";

import { useEffect, useState } from "react";

const SAMPLE_INTERVAL_MS = 120;
const LOUDNESS_THRESHOLD = 0.035; // RMS of the waveform, 0..1
const HOLD_MS = 450; // keep the indicator on briefly to avoid flicker between words

/**
 * Detects whether the local microphone is picking up speech, using the Web Audio API.
 * Drives the green "active speaker" border on your own tile, like Zoom's.
 */
export function useIsSpeaking(stream: MediaStream | null, enabled: boolean): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || !enabled || typeof AudioContext === "undefined") return;

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    context.resume().catch(() => undefined);

    const samples = new Uint8Array(analyser.fftSize);
    let lastLoudAt = 0;
    let current = false;

    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sumOfSquares = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sumOfSquares += normalized * normalized;
      }
      const now = Date.now();
      if (Math.sqrt(sumOfSquares / samples.length) > LOUDNESS_THRESHOLD) lastLoudAt = now;
      const next = now - lastLoudAt < HOLD_MS;
      if (next !== current) {
        current = next;
        setSpeaking(next);
      }
    }, SAMPLE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      source.disconnect();
      context.close().catch(() => undefined);
    };
  }, [stream, enabled]);

  return enabled && speaking;
}
