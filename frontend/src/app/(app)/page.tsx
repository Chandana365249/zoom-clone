import { ActionTiles } from "@/components/dashboard/ActionTiles";
import { Greeting } from "@/components/dashboard/Greeting";
import { RecentMeetingsCard, UpcomingMeetingsCard } from "@/components/dashboard/MeetingSections";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Mobile order: greeting → actions → upcoming → recent. Desktop: actions + recent left, upcoming right. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-8">
        <section aria-label="Quick actions" className="flex flex-col gap-7 lg:pt-2">
          <Greeting />
          <ActionTiles />
        </section>
        <div className="lg:row-span-2">
          <UpcomingMeetingsCard />
        </div>
        <div>
          <RecentMeetingsCard />
        </div>
      </div>
    </div>
  );
}
