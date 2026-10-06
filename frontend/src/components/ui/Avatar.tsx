import { avatarColor, getInitials } from "@/lib/format";
import { cn } from "@/lib/cn";

interface AvatarProps {
  name: string;
  className?: string;
}

/** Initials on a stable per-name color. Size is controlled with className (e.g. "size-9 text-sm"). */
export function Avatar({ name, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white",
        className ?? "size-9 text-sm",
      )}
      style={{ backgroundColor: avatarColor(name) }}
    >
      {getInitials(name)}
    </span>
  );
}
