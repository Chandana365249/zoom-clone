"use client";

import { useNow } from "@/hooks/useNow";
import { formatLongDate, formatTime } from "@/lib/format";

/** The large time/date header at the top of Zoom's home card. */
export function ClockBanner() {
  const now = useNow(1000);

  return (
    <div className="relative overflow-hidden bg-[#0b2a6f] px-6 py-7 text-white sm:px-8 sm:py-9">
      {/* Soft decorative glow; purely visual. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(120% 140% at 100% 0%, #3f7bff 0%, transparent 55%), radial-gradient(90% 120% at 0% 100%, #0b5cff 0%, transparent 60%)",
        }}
      />
      <div className="relative">
        <p className="text-4xl font-light tracking-tight tabular-nums sm:text-5xl" suppressHydrationWarning>
          {now ? formatTime(now) : " "}
        </p>
        <p className="mt-1.5 text-sm font-medium text-white/80 sm:text-[15px]">{now ? formatLongDate(now) : " "}</p>
      </div>
    </div>
  );
}
