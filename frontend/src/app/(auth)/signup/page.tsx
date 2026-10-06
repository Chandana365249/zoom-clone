import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/AuthForms";
import { safeNextPath } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  return <SignupForm next={safeNextPath(typeof next === "string" ? next : null)} />;
}
