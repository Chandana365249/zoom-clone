// End-to-end check of the core flows against a running frontend + backend, using separate
// browser contexts (host, signed-up guest, anonymous guest) with Chrome's fake camera/mic.
//
//   cd e2e && npm install && node flow.mjs
//   BASE_URL=http://localhost:3000 API_URL=http://localhost:8000 node flow.mjs
//
// Uses your installed Google Chrome (no browser download). Screenshots go to e2e/screenshots/.
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:8000";
const OUT = fileURLToPath(new URL("./screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const errors = [];
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -- " + extra : ""}`);
const pad = (n) => String(n).padStart(2, "0");

async function newPage(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && errors.push(`[console] ${m.text()}`));
  p.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  p.on("response", (r) => r.status() >= 400 && errors.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`));
  return p;
}

// Direct API access for assertions (signed in as the demo account).
const demoToken = (
  await (
    await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alex.morgan@example.com", password: "zoomdemo123" }),
    })
  ).json()
).token;
const api = async (path, init = {}) =>
  (await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${demoToken}`, ...init.headers } })).json();

async function signInAsDemo(page) {
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continue with demo account" }).click();
  await page.waitForURL(BASE + "/");
  await page.getByRole("button", { name: "New meeting" }).waitFor();
}

try {
  // ---- Auth: protected route, wrong password, demo sign-in
  const host = await newPage();
  await host.goto(BASE + "/meetings", { waitUntil: "networkidle" });
  await host.waitForURL(/\/login\?next=%2Fmeetings/);
  check("Signed-out visitor is redirected to sign-in", true, host.url());
  await host.screenshot({ path: `${OUT}/login.png` });
  await host.locator("#login-email").fill("alex.morgan@example.com");
  await host.locator("#login-password").fill("wrong-password");
  await host.getByRole("button", { name: "Sign in", exact: true }).click();
  await host.getByText("Incorrect email or password.").waitFor();
  check("Wrong password shows an error", true);
  await host.locator("#login-password").fill("zoomdemo123");
  await host.getByRole("button", { name: "Sign in", exact: true }).click();
  await host.waitForURL(BASE + "/meetings");
  check("Sign in returns to the page you asked for", true);
  await host.goto(BASE + "/", { waitUntil: "networkidle" });

  // ---- Dashboard requirements
  await host.getByText("Weekly Product Sync").first().waitFor();
  const dash = {
    navbarProfile: await host.getByRole("button", { name: "Account menu" }).isVisible(),
    navbarSettings: await host.getByRole("link", { name: "Settings" }).first().isVisible(),
    newMeeting: await host.getByRole("button", { name: "New meeting" }).isVisible(),
    join: await host.getByRole("button", { name: "Join", exact: true }).isVisible(),
    schedule: await host.getByRole("button", { name: "Schedule", exact: true }).isVisible(),
    upcoming: await host.getByRole("heading", { name: /Upcoming meetings/ }).isVisible(),
    recent: await host.getByRole("heading", { name: "Recent meetings" }).isVisible(),
  };
  check("Dashboard: navbar profile + settings, 3 action buttons, upcoming + recent", Object.values(dash).every(Boolean), JSON.stringify(dash));
  await host.screenshot({ path: `${OUT}/home-desktop.png` });

  // ---- Instant meeting
  await host.getByRole("button", { name: "New meeting" }).click();
  await host.waitForURL(/\/meeting\/\d{11}\?host=1/);
  const code = host.url().match(/meeting\/(\d{11})/)[1];
  check("New meeting redirects to pre-join", true, host.url());
  const saved = await api(`/api/meetings/${code}`);
  check("Instant meeting saved with unique ID + invite link", saved.meeting_code === code && saved.join_url.endsWith(`/j/${code}`), saved.join_url);
  await host.getByRole("button", { name: "Start meeting" }).waitFor();
  check("Host name prefilled", (await host.locator("#prejoin-name").inputValue()) === "Alex Morgan");
  await host.getByRole("button", { name: "Start meeting" }).click();
  await host.getByRole("button", { name: "End", exact: true }).waitFor();
  check("Host entered meeting room", (await api(`/api/meetings/${code}`)).status === "live");
  await host.getByRole("button", { name: "Invite" }).click();
  const clip = await host.evaluate(() => navigator.clipboard.readText());
  check("Invite link copied", clip === saved.join_url, clip);

  // ---- Guest signs up, then joins via the Join dialog
  const guest = await newPage();
  await guest.goto(BASE + "/signup", { waitUntil: "networkidle" });
  await guest.getByRole("button", { name: "Create account" }).click();
  const signupErrors = await guest.locator("[id^=signup-][id$=-error]").count();
  check("Sign-up validates empty fields", signupErrors === 3, `${signupErrors} field errors`);
  await guest.locator("#signup-name").fill("Sam Lee");
  await guest.locator("#signup-email").fill(`sam.${Date.now()}@example.com`);
  await guest.locator("#signup-password").fill("password123");
  await guest.getByRole("button", { name: "Create account" }).click();
  await guest.waitForURL(BASE + "/");
  await guest.getByText("No upcoming meetings").waitFor();
  check("Sign up creates account and lands on an empty dashboard", true);
  await guest.getByRole("button", { name: "Join", exact: true }).first().click();
  await guest.locator("#join-meeting-id").fill("123");
  await guest.locator("#join-name").fill("");
  await guest.locator("dialog").getByRole("button", { name: "Join", exact: true }).click();
  const idErr = await guest.locator("#join-meeting-id-error").textContent();
  const nameErr = await guest.locator("#join-name-error").textContent();
  check("Join validates ID format", /9.11 digits/.test(idErr), idErr);
  check("Join validates empty display name", /name/.test(nameErr), nameErr);
  await guest.locator("#join-meeting-id").fill("999 9999 9999");
  await guest.locator("#join-name").fill("Sam Lee");
  await guest.locator("dialog").getByRole("button", { name: "Join", exact: true }).click();
  await guest.getByText("This meeting ID is not valid").waitFor();
  check("Join validates meeting existence", true);
  await guest.locator("#join-meeting-id").fill(saved.join_url);
  await guest.locator("dialog").getByRole("button", { name: "Join", exact: true }).click();
  await guest.waitForURL(new RegExp(`/meeting/${code}\\?name=Sam`));
  check("Join by invite link reaches pre-join with display name", (await guest.locator("#prejoin-name").inputValue()) === "Sam Lee");
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await guest.getByRole("button", { name: "Leave", exact: true }).waitFor();

  // ---- Anonymous guest joins with just the invite link (no account)
  const walkIn = await newPage();
  await walkIn.goto(`${BASE}/j/${code}`, { waitUntil: "networkidle" });
  await walkIn.locator("#prejoin-name").fill("Walk-in Guest");
  await walkIn.getByRole("button", { name: "Join", exact: true }).click();
  await walkIn.getByRole("button", { name: "Leave", exact: true }).waitFor();
  check("Guest without an account joins from the invite link", true);

  // ---- Host controls
  await host.waitForTimeout(2600);
  await host.getByRole("button", { name: /Participants/ }).click();
  await host.locator("aside").getByText("Walk-in Guest").waitFor();
  check("Host sees both guests in participants", (await host.locator("aside li").count()) === 3);
  await host.screenshot({ path: `${OUT}/room-host.png` });
  await host.getByRole("button", { name: "Mute all" }).click();
  await guest.getByRole("button", { name: "Unmute" }).waitFor({ timeout: 8000 });
  await walkIn.getByRole("button", { name: "Unmute" }).waitFor({ timeout: 8000 });
  check("Mute all mutes every guest's browser", true);
  await guest.getByRole("button", { name: "Unmute" }).click();
  await guest.waitForTimeout(5000);
  check("Guest can unmute after host mute", await guest.getByRole("button", { name: "Mute", exact: true }).isVisible());
  await host.getByRole("button", { name: "Actions for Walk-in Guest" }).click();
  await host.getByRole("menuitem", { name: "Remove" }).click();
  await host.locator("dialog").getByRole("button", { name: "Remove", exact: true }).click();
  await walkIn.getByText("You were removed from the meeting").waitFor({ timeout: 8000 });
  check("Remove participant kicks them out", true);
  await host.getByRole("button", { name: "End", exact: true }).click();
  await host.getByRole("menuitem", { name: "End meeting for all" }).click();
  await host.getByText("Meeting ended for everyone").waitFor();
  await guest.getByText("This meeting has ended").waitFor({ timeout: 8000 });
  check("End meeting for all", (await api(`/api/meetings/${code}`)).status === "ended");
  const recent = await api(`/api/meetings?scope=recent`);
  check("Ended meeting appears in Recent meetings", recent[0].meeting_code === code, `participants=${recent[0].participant_count}`);
  await walkIn.goto(`${BASE}/meeting/12312312312`, { waitUntil: "networkidle" });
  await walkIn.getByText("This meeting ID is not valid").waitFor();
  check("Invalid meeting URL shows not-valid screen", true);

  // ---- Schedule
  await host.goto(BASE + "/", { waitUntil: "networkidle" });
  await host.getByRole("button", { name: "Schedule", exact: true }).click();
  await host.locator("#meeting-title").fill("E2E Planning Session");
  await host.locator("#meeting-description").fill("Created by the automated test");
  const past = new Date(Date.now() - 2 * 3600e3);
  await host.locator("#meeting-date").fill(`${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`);
  await host.locator("#meeting-time").fill(`${pad(past.getHours())}:${pad(past.getMinutes())}`);
  await host.locator("dialog").getByRole("button", { name: "Schedule", exact: true }).click();
  const timeErr = await host.locator("#meeting-time-error").textContent({ timeout: 3000 }).catch(() => null);
  check("Schedule rejects past time", /future/.test(timeErr ?? ""), timeErr);
  const future = new Date(Date.now() + 26 * 3600e3);
  await host.locator("#meeting-date").fill(`${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`);
  await host.locator("#meeting-time").fill("10:30");
  await host.locator("#meeting-duration").selectOption("60");
  await host.locator("dialog").getByRole("button", { name: "Schedule", exact: true }).click();
  await host.getByText("Meeting scheduled").waitFor();
  const shownLink = await host.locator("dialog").getByText(/\/j\/\d{11}/).textContent();
  check("Schedule success shows auto-generated link", Boolean(shownLink), shownLink);
  await host.getByRole("button", { name: "Done" }).click();
  await host.getByText("E2E Planning Session").waitFor();
  check("Scheduled meeting appears in Upcoming", true);
  const created = (await api(`/api/meetings?scope=upcoming`)).find((m) => m.title === "E2E Planning Session");
  check("Scheduled meeting stored (title, description, duration)", created?.duration_minutes === 60 && created?.description === "Created by the automated test", created?.scheduled_start);
  await host.goto(BASE + "/meetings", { waitUntil: "networkidle" });
  await host.getByRole("button", { name: "More actions for E2E Planning Session" }).click();
  await host.getByRole("menuitem", { name: "Edit" }).click();
  await host.locator("#meeting-title").fill("E2E Planning Session (edited)");
  await host.getByRole("button", { name: "Save changes" }).click();
  await host.getByText("E2E Planning Session (edited)").waitFor();
  check("Edit meeting", true);
  await host.getByRole("button", { name: "More actions for E2E Planning Session (edited)" }).click();
  await host.getByRole("menuitem", { name: "Delete" }).click();
  await host.locator("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await host.locator("main").getByText("E2E Planning Session (edited)").waitFor({ state: "detached" });
  check("Delete meeting", true);

  // ---- Sign out
  await host.getByRole("button", { name: "Account menu" }).click();
  await host.getByRole("menuitem", { name: "Sign out" }).click();
  await host.waitForURL(/\/login/);
  await host.goto(BASE + "/", { waitUntil: "networkidle" });
  await host.waitForURL(/\/login/);
  check("Sign out ends the session", true);

  // ---- Responsive
  for (const [label, viewport] of [["mobile", { width: 390, height: 844 }], ["tablet", { width: 820, height: 1180 }]]) {
    const page = await newPage(viewport);
    await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    const loginOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await signInAsDemo(page);
    await page.waitForTimeout(600);
    const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: `${OUT}/home-${label}.png` });
    await page.getByRole("button", { name: "New meeting" }).click();
    await page.getByRole("button", { name: "Start meeting" }).click();
    await page.getByRole("button", { name: "End", exact: true }).waitFor();
    await page.waitForTimeout(800);
    const roomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const controlsVisible = await page.getByRole("button", { name: "Mute", exact: true }).isVisible();
    await page.screenshot({ path: `${OUT}/room-${label}.png` });
    check(`Responsive ${label}: no horizontal overflow, controls usable`, loginOverflow <= 0 && homeOverflow <= 0 && roomOverflow <= 0 && controlsVisible, `login ${loginOverflow}px, home ${homeOverflow}px, room ${roomOverflow}px`);
    await page.getByRole("button", { name: "End", exact: true }).click();
    await page.getByRole("menuitem", { name: "Leave meeting" }).click();
    await page.getByText("You left the meeting").waitFor();
  }
} catch (error) {
  results.push(`ABORTED: ${error.message.split("\n").slice(0, 6).join(" | ")}`);
}

console.log(results.join("\n"));
// Expected here: 401 from the deliberate wrong-password check and 404s from invalid-ID checks.
console.log(errors.length ? "Browser errors / HTTP failures:\n" + errors.join("\n") : "No browser errors");
await browser.close();
process.exitCode = results.every((line) => line.startsWith("PASS")) ? 0 : 1;
