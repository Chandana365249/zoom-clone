import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ControlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  /** Highlights the icon in red (e.g. muted mic, stopped video). */
  alert?: boolean;
  /** Shows a dot on the icon (e.g. device problem). */
  warning?: boolean;
  badge?: number;
  active?: boolean;
}

/** Icon-over-label button used in the meeting toolbar, like Zoom's. */
export function ControlButton({ icon, label, alert, warning, badge, active, className, ...props }: ControlButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-room-text",
        "transition-colors duration-150 hover:bg-white/10 sm:min-w-[76px]",
        active && "bg-white/10",
        className,
      )}
      {...props}
    >
      <span className={cn("relative [&>svg]:size-[22px]", alert && "text-[#ff5c5c]")}>
        {icon}
        {warning && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-[#f5a524] ring-2 ring-room-bar" />}
        {badge !== undefined && (
          <span className="absolute -top-1.5 -right-3 min-w-[18px] rounded-full bg-room-raised px-1 text-center text-[10px] leading-[18px] font-semibold text-white ring-2 ring-room-bar">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium whitespace-nowrap text-room-muted sm:text-[12px]">{label}</span>
    </button>
  );
}
