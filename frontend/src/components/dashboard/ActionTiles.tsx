"use client";

import { CalendarDays, Plus, Video } from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { useMeetingActions } from "@/providers/MeetingActionsProvider";

/** The three big square buttons from Zoom's home screen. */
export function ActionTiles() {
  const { startInstantMeeting, isStartingInstant, openJoin, openSchedule } = useMeetingActions();

  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-5">
      <ActionTile
        label="New meeting"
        hint="Start an instant meeting"
        color="accent"
        onClick={startInstantMeeting}
        busy={isStartingInstant}
        icon={<Video />}
      />
      <ActionTile label="Join" hint="Join with an ID or link" onClick={openJoin} icon={<Plus />} />
      <ActionTile label="Schedule" hint="Plan a future meeting" onClick={openSchedule} icon={<CalendarDays />} />
    </div>
  );
}

interface ActionTileProps {
  label: string;
  hint: string;
  icon: ReactNode;
  onClick: () => void;
  color?: "brand" | "accent";
  busy?: boolean;
}

function ActionTile({ label, hint, icon, onClick, color = "brand", busy = false }: ActionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={hint}
      className="group flex flex-col items-center gap-2.5 rounded-2xl p-1 text-center disabled:cursor-wait"
    >
      <span
        className={cn(
          "flex aspect-square w-full max-w-[96px] items-center justify-center rounded-[22px] text-white shadow-sm",
          "transition-[transform,background-color,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md",
          "group-active:translate-y-0 [&>svg]:size-8 sm:[&>svg]:size-9",
          color === "accent" ? "bg-accent group-hover:bg-accent-hover" : "bg-brand group-hover:bg-brand-hover",
        )}
      >
        {busy ? <Spinner className="size-8!" /> : icon}
      </span>
      <span className="text-[13px] font-semibold text-ink sm:text-sm">{label}</span>
    </button>
  );
}
