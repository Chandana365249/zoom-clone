import type { Metadata } from "next";
import { MeetingsView } from "@/components/dashboard/MeetingsView";

export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage({ searchParams }: PageProps<"/meetings">) {
  const { tab } = await searchParams;
  return <MeetingsView tab={tab === "previous" ? "previous" : "upcoming"} />;
}
