import { AuthGate } from "@/components/auth/AuthGate";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { TopNav } from "@/components/layout/TopNav";
import { MeetingActionsProvider } from "@/providers/MeetingActionsProvider";

/**
 * Shell for the signed-in pages (Home, Meetings, Settings). The meeting room has its own
 * full-screen UI and stays public so guests can join from an invite link without an account.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <MeetingActionsProvider>
        <div className="flex min-h-dvh flex-col">
          <TopNav />
          <main className="flex-1 pb-24 md:pb-0">{children}</main>
          <MobileTabBar />
        </div>
      </MeetingActionsProvider>
    </AuthGate>
  );
}
