"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Menu } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { useAuth } from "@/providers/AuthProvider";
import { useMeetingActions } from "@/providers/MeetingActionsProvider";
import { Logo } from "./Logo";
import { NAV_ITEMS, isActive } from "./navItems";

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { openJoin, openSchedule } = useMeetingActions();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Main" className="hidden h-full items-stretch gap-1 md:flex">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 px-4 text-[12px] font-semibold transition-colors",
                  active ? "text-brand" : "text-ink-muted hover:text-ink",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {label}
                {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-1 lg:flex">
            <button
              type="button"
              onClick={openJoin}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              Join a meeting
            </button>
            <button
              type="button"
              onClick={openSchedule}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
            >
              Schedule a meeting
            </button>
            <span className="mx-2 h-6 w-px bg-line" />
          </div>

          <Link
            href="/settings"
            aria-label="Settings"
            className="hidden rounded-lg p-2 text-ink-muted transition-colors hover:bg-canvas hover:text-ink sm:block"
          >
            <Settings className="size-5" />
          </Link>

          {user ? (
            <Menu
              trigger={(props) => (
                <button type="button" aria-label="Account menu" className="rounded-full p-0.5" {...props}>
                  <Avatar name={user.name} className="size-9 text-[13px]" />
                </button>
              )}
              header={
                <div className="mb-1 flex items-center gap-3 border-b border-line px-3 pt-2 pb-3">
                  <Avatar name={user.name} className="size-10 text-sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{user.name}</p>
                    <p className="truncate text-[13px] text-ink-muted">{user.email}</p>
                  </div>
                </div>
              }
              items={[
                { label: "Settings", icon: <Settings />, onSelect: () => router.push("/settings") },
                { label: "Sign out", icon: <LogOut />, onSelect: logout },
              ]}
              className="[&_[role=menu]]:min-w-64"
            />
          ) : (
            <Skeleton className="size-9 rounded-full" />
          )}
        </div>
      </div>
    </header>
  );
}
