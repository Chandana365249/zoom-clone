import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StatusScreenProps {
  icon: ReactNode;
  tone?: "neutral" | "danger";
  title: string;
  description: ReactNode;
  /** Extra buttons shown before "Back to home". */
  actions?: ReactNode;
}

/** Full-page message for meeting states outside the room: left, removed, ended, invalid ID, errors. */
export function StatusScreen({ icon, tone = "neutral", title, description, actions }: StatusScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-16 items-center px-4 sm:px-6">
        <Link href="/" className="text-[26px] leading-none font-extrabold tracking-[-0.04em] text-brand">
          zoom
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md animate-pop-in rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <div
            className={cn(
              "mx-auto flex size-14 items-center justify-center rounded-2xl [&>svg]:size-7",
              tone === "danger" ? "bg-danger/10 text-danger" : "bg-brand-soft text-brand",
            )}
          >
            {icon}
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">{title}</h1>
          <div className="mt-2 text-[15px] leading-6 text-ink-muted">{description}</div>
          <div className="mt-7 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-[10px] border border-line-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-canvas"
            >
              Back to home
            </Link>
            {actions}
          </div>
        </div>
      </main>
    </div>
  );
}
