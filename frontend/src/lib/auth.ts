// Credentials of the seeded demo account (backend/app/seed.py), used by the sign-in page's
// "Continue with demo account" button so reviewers don't need to create an account.
export const DEMO_ACCOUNT = { email: "alex.morgan@example.com", password: "zoomdemo123" };

/** Only allow same-site relative paths after login, so `?next=` can't redirect off-site. */
export function safeNextPath(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
