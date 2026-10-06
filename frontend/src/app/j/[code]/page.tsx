import { redirect } from "next/navigation";

/** Short invite links (/j/85212345678) open the meeting's pre-join screen, like Zoom's. */
export default async function InviteLinkPage({ params }: PageProps<"/j/[code]">) {
  const { code } = await params;
  redirect(`/meeting/${encodeURIComponent(code)}`);
}
