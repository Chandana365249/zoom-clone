"use client";

import { Briefcase, Mail } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { usePreferences, type MeetingPreferences } from "@/hooks/usePreferences";
import { useCurrentUser } from "@/providers/AuthProvider";

const PREFERENCE_ROWS: { key: keyof MeetingPreferences; title: string; description: string }[] = [
  {
    key: "joinMuted",
    title: "Mute my microphone when joining",
    description: "You can unmute any time from the meeting controls.",
  },
  {
    key: "joinWithVideoOff",
    title: "Turn off my video when joining",
    description: "Your camera stays off until you choose Start Video.",
  },
];

export function SettingsView() {
  const user = useCurrentUser();
  const toast = useToast();
  const [preferences, setPreferences] = usePreferences();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">Settings</h1>
      <p className="mt-1 text-[15px] text-ink-muted">Your profile and meeting defaults.</p>

      <SettingsCard title="Profile">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          {user ? (
            <>
              <Avatar name={user.name} className="size-16 text-xl" />
              <div className="min-w-0">
                <p className="text-lg font-semibold">{user.name}</p>
                <div className="mt-1 flex flex-col gap-1 text-sm text-ink-muted sm:flex-row sm:gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="size-4" />
                    {user.email}
                  </span>
                  {user.job_title && (
                    <span className="inline-flex items-center gap-1.5">
                      <Briefcase className="size-4" />
                      {user.job_title}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <Skeleton className="size-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </>
          )}
        </div>
        <p className="border-t border-line bg-canvas/60 px-5 py-3 text-[13px] text-ink-muted sm:px-6">
          Profile editing isn&apos;t available yet. Your name is used as your default display name in meetings.
        </p>
      </SettingsCard>

      <SettingsCard title="Meetings" description="Applied on the pre-join screen. Saved in this browser.">
        <ul className="divide-y divide-line">
          {PREFERENCE_ROWS.map(({ key, title, description }) => (
            <li key={key} className="flex items-center justify-between gap-6 px-5 py-4 sm:px-6">
              <div>
                <p id={`pref-${key}`} className="text-[15px] font-medium text-ink">
                  {title}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>
              </div>
              <Switch
                aria-labelledby={`pref-${key}`}
                checked={preferences[key]}
                onChange={(checked) => {
                  setPreferences({ ...preferences, [key]: checked });
                  toast.success("Settings saved");
                }}
              />
            </li>
          ))}
        </ul>
      </SettingsCard>
    </div>
  );
}

function SettingsCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="px-1 text-[15px] font-semibold text-ink">{title}</h2>
      {description && <p className="mt-0.5 px-1 text-[13px] text-ink-muted">{description}</p>}
      <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">{children}</div>
    </section>
  );
}
