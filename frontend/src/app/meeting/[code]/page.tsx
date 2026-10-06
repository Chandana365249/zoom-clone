import type { Metadata } from "next";
import { MeetingExperience } from "@/components/meeting/MeetingExperience";

export const metadata: Metadata = { title: "Meeting" };

export default async function MeetingPage({ params, searchParams }: PageProps<"/meeting/[code]">) {
  const { code } = await params;
  const { host, name } = await searchParams;
  return (
    <MeetingExperience
      code={code}
      asHost={host === "1"}
      initialName={typeof name === "string" ? name.slice(0, 50) : ""}
    />
  );
}
