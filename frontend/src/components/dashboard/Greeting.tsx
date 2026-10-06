"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { useNow } from "@/hooks/useNow";
import { greeting } from "@/lib/format";
import { useCurrentUser } from "@/providers/AuthProvider";

export function Greeting() {
  const user = useCurrentUser();
  const now = useNow(60_000);

  return (
    <div>
      {user && now ? (
        <h1 className="text-[26px] font-semibold tracking-tight text-ink sm:text-3xl">
          {greeting(now)}, {user.name.split(" ")[0]}
        </h1>
      ) : (
        <Skeleton className="h-9 w-64" />
      )}
      <p className="mt-2 text-[15px] text-ink-muted">Start an instant meeting, join one, or plan ahead.</p>
    </div>
  );
}
