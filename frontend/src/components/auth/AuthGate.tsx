"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/providers/AuthProvider";

/** Renders its children only for signed-in users; everyone else is sent to /login. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas" aria-busy>
        <Spinner className="size-7 text-brand" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  return children;
}
