"use client";

import { CalendarDays, ShieldCheck, Video } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { JoinMeetingDialog } from "@/components/dashboard/JoinMeetingDialog";

const HIGHLIGHTS = [
  { icon: Video, text: "Start an instant meeting in one click" },
  { icon: CalendarDays, text: "Schedule ahead and share invite links" },
  { icon: ShieldCheck, text: "Host controls to keep every meeting on track" },
];

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/** Split layout for sign-in / sign-up: brand panel on large screens, form on the right. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-surface">
      <aside className="relative hidden w-[44%] max-w-2xl flex-col justify-between overflow-hidden bg-[#0b2a6f] p-12 text-white lg:flex">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(90% 70% at 100% 0%, #3f7bff 0%, transparent 60%), radial-gradient(80% 60% at 0% 100%, #0b5cff 0%, transparent 65%)",
          }}
        />
        <p className="relative text-[30px] leading-none font-extrabold tracking-[-0.04em]">zoom</p>
        <div className="relative">
          <h2 className="max-w-md text-[34px] leading-tight font-semibold tracking-tight">
            Meet, connect and collaborate — from anywhere.
          </h2>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[15px] text-white/90">
                <span className="flex size-9 items-center justify-center rounded-xl bg-white/12">
                  <Icon className="size-[18px]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[13px] text-white/60">Educational Zoom clone · not affiliated with Zoom</p>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Link href="/login" className="text-[26px] leading-none font-extrabold tracking-[-0.04em] text-brand lg:invisible">
            zoom
          </Link>
          <button
            type="button"
            onClick={() => setJoinOpen(true)}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft"
          >
            Join a meeting
          </button>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-8">
          <div className="w-full max-w-sm animate-pop-in">
            <h1 className="text-[28px] font-semibold tracking-tight text-ink">{title}</h1>
            <p className="mt-1.5 text-[15px] text-ink-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
            <p className="mt-8 text-center text-sm text-ink-muted">{footer}</p>
          </div>
        </main>
      </div>

      {/* Guests don't need an account to join, just like Zoom. */}
      <JoinMeetingDialog open={joinOpen} onClose={() => setJoinOpen(false)} defaultName="" />
    </div>
  );
}
