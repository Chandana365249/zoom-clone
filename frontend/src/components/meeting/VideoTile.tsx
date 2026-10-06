"use client";

import { MicOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

interface VideoTileProps {
  name: string;
  /** Live camera stream; only available for this browser's own camera. */
  stream?: MediaStream | null;
  isVideoOn: boolean;
  isMuted: boolean;
  isSelf?: boolean;
  isSpeaking?: boolean;
  label?: string;
  className?: string;
}

export function VideoTile({ name, stream, isVideoOn, isMuted, isSelf, isSpeaking, label, className }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = isVideoOn && Boolean(stream);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = showVideo ? stream ?? null : null;
  }, [stream, showVideo]);

  return (
    <div
      className={cn(
        "@container relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-room-tile",
        "ring-2 ring-transparent transition-shadow duration-150",
        isSpeaking && "ring-speaking",
        className,
      )}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted // never play our own audio back
          className={cn("size-full object-cover", isSelf && "-scale-x-100")}
        />
      ) : (
        <Avatar name={name} className="size-[22cqw] max-h-28 max-w-28 min-h-12 min-w-12 text-[clamp(1rem,6cqw,2.25rem)]" />
      )}

      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[12px] font-medium text-white backdrop-blur-sm">
        {isMuted && <MicOff aria-label="Muted" className="size-3.5 shrink-0 text-[#ff5c5c]" />}
        <span className="truncate">{label ?? name}</span>
      </div>
    </div>
  );
}
