"use client";

import { Copy, ShieldCheck } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useDismiss } from "@/hooks/useDismiss";
import { formatMeetingCode } from "@/lib/format";
import { buildInvitation } from "@/lib/meeting";
import type { Meeting } from "@/lib/types";

/** The green shield "Meeting information" popover in the top-left of Zoom's meeting window. */
export function MeetingInfoPopover({ meeting, myName }: { meeting: Meeting; myName: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const copy = useCopyToClipboard();
  useDismiss(rootRef, open, close);

  const rows = [
    { label: "Meeting ID", value: formatMeetingCode(meeting.meeting_code) },
    { label: "Host", value: meeting.host.name },
    { label: "Participant", value: myName },
  ];

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10"
      >
        <ShieldCheck className="size-5 shrink-0 text-[#3ccf6e]" />
        <span className="truncate text-sm font-semibold text-room-text">{meeting.title}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-40 mt-2 w-[min(22rem,calc(100vw-1.5rem))] animate-pop-in rounded-xl border border-room-line bg-room-raised p-4 text-room-text shadow-pop">
          <p className="font-semibold">{meeting.title}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
            {rows.map(({ label, value }) => (
              <div key={label} className="contents">
                <dt className="text-room-muted">{label}</dt>
                <dd className="truncate">{value}</dd>
              </div>
            ))}
            <dt className="text-room-muted">Invite link</dt>
            <dd className="break-all text-[#6ea0ff]">{meeting.join_url}</dd>
          </dl>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => copy(meeting.join_url, "Invite link copied")}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand text-[13px] font-semibold text-white hover:bg-brand-hover"
            >
              <Copy className="size-3.5" />
              Copy link
            </button>
            <button
              type="button"
              onClick={() => copy(buildInvitation(meeting), "Invitation copied")}
              className="flex h-8 flex-1 items-center justify-center rounded-lg bg-white/10 text-[13px] font-semibold hover:bg-white/15"
            >
              Copy invitation
            </button>
          </div>
          <p className="mt-3 border-t border-room-line pt-3 text-[12px] leading-5 text-room-muted">
            Presence, mute state and host controls sync live through the server. Audio and video are
            local previews only in this build — media streaming between participants would need WebRTC.
          </p>
        </div>
      )}
    </div>
  );
}
