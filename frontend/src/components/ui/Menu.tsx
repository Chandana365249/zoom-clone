"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "@/hooks/useDismiss";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

interface MenuProps {
  /** Renders the trigger; receives props that must be spread onto a <button>. */
  trigger: (props: { onClick: () => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  items: MenuItem[];
  /** Optional non-interactive content above the items (e.g. a profile summary). */
  header?: ReactNode;
  align?: "left" | "right";
  placement?: "bottom" | "top";
  dark?: boolean;
  className?: string;
}

/** Small dropdown menu. Closes on outside click, Escape, or after choosing an item. */
export function Menu({ trigger, items, header, align = "right", placement = "bottom", dark = false, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, close);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {trigger({ onClick: () => setOpen((value) => !value), "aria-expanded": open, "aria-haspopup": "menu" })}
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-50 min-w-48 animate-pop-in rounded-xl border p-1.5 shadow-pop",
            dark ? "border-room-line bg-room-raised text-room-text" : "border-line bg-surface text-ink",
            align === "right" ? "right-0" : "left-0",
            placement === "bottom" ? "top-full mt-1.5" : "bottom-full mb-2",
          )}
        >
          {header}
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                dark ? "hover:bg-white/10" : "hover:bg-canvas",
                item.danger && (dark ? "text-[#ff6b6b]" : "text-danger"),
              )}
            >
              {item.icon && <span className="shrink-0 [&>svg]:size-4">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
