// Checks that audio and video really flow between two participants (WebRTC), using Chrome's
// fake camera (a moving test pattern) and fake microphone (a beep).
//
//   BASE_URL=http://localhost:3000 node media.mjs
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = fileURLToPath(new URL("./screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  -- " + extra : ""}`);

// One Chrome process per participant, like real users on separate computers: Chrome's fake
// camera is unreliable when several contexts in the same process open it at once.
const browsers = [];
async function newPage() {
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["camera", "microphone"] });
  return ctx.newPage();
}

/** What a page receives from the remote participant: video frames + live, audible audio. */
async function remoteMedia(page) {
  return page.evaluate(async () => {
    const audio = document.querySelector("audio");
    const stream = audio?.srcObject;
    let level = 0;
    if (stream && stream.getAudioTracks().length) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 100));
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const s of samples) sum += ((s - 128) / 128) ** 2;
        level = Math.max(level, Math.sqrt(sum / samples.length));
      }
      ctx.close();
    }
    // Remote tiles are the video elements that aren't mirrored (your own preview is).
    const videos = [...document.querySelectorAll("video")].filter((v) => !v.className.includes("-scale-x-100"));
    return {
      remoteVideoWidth: videos[0]?.videoWidth ?? 0,
      audioPlaying: Boolean(audio && !audio.paused && stream?.getAudioTracks()[0]?.readyState === "live"),
      audioLevel: Number(level.toFixed(3)),
    };
  });
}

async function waitFor(page, predicate, timeoutMs = 20000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await remoteMedia(page);
    if (predicate(last)) return last;
    await page.waitForTimeout(500);
  }
  return last;
}

try {
  const host = await newPage();
  await host.goto(BASE + "/login", { waitUntil: "networkidle" });
  await host.getByRole("button", { name: "Continue with demo account" }).click();
  await host.getByRole("button", { name: "New meeting" }).click();
  await host.getByRole("button", { name: "Start meeting" }).click();
  await host.getByRole("button", { name: "End", exact: true }).waitFor();
  const code = host.url().match(/meeting\/(\d{11})/)[1];

  const guest = await newPage();
  await guest.goto(`${BASE}/j/${code}`, { waitUntil: "networkidle" });
  await guest.locator("#prejoin-name").fill("Remote Guest");
  await guest.getByRole("button", { name: "Join", exact: true }).click();
  await guest.getByRole("button", { name: "Leave", exact: true }).waitFor();

  const hostSees = await waitFor(host, (m) => m.remoteVideoWidth > 0 && m.audioLevel > 0.01);
  check("Host receives guest's video", hostSees.remoteVideoWidth > 0, `${hostSees.remoteVideoWidth}px wide`);
  check("Host hears guest's audio", hostSees.audioPlaying && hostSees.audioLevel > 0.01, `level ${hostSees.audioLevel}`);
  const guestSees = await waitFor(guest, (m) => m.remoteVideoWidth > 0 && m.audioLevel > 0.01);
  check("Guest receives host's video", guestSees.remoteVideoWidth > 0, `${guestSees.remoteVideoWidth}px wide`);
  check("Guest hears host's audio", guestSees.audioPlaying && guestSees.audioLevel > 0.01, `level ${guestSees.audioLevel}`);
  await host.screenshot({ path: `${OUT}/webrtc-host.png` });

  // Muting really silences the audio on the other side.
  await guest.getByRole("button", { name: "Mute", exact: true }).click();
  const muted = await waitFor(host, (m) => m.audioLevel < 0.005, 10000);
  check("Muting silences audio for others", muted.audioLevel < 0.005, `level ${muted.audioLevel}`);
  await guest.getByRole("button", { name: "Unmute" }).click();
  const unmuted = await waitFor(host, (m) => m.audioLevel > 0.01, 10000);
  check("Unmuting restores audio", unmuted.audioLevel > 0.01, `level ${unmuted.audioLevel}`);

  // Camera off then on again mid-call (replaceTrack, no reconnection).
  await guest.getByRole("button", { name: "Stop Video" }).click();
  const off = await waitFor(host, (m) => m.remoteVideoWidth === 0, 10000);
  check("Stopping video shows the avatar to others", off.remoteVideoWidth === 0);
  await guest.getByRole("button", { name: "Start Video" }).click();
  const on = await waitFor(host, (m) => m.remoteVideoWidth > 0, 15000);
  check("Restarting video resumes the feed for others", on.remoteVideoWidth > 0, `${on.remoteVideoWidth}px wide`);

  // A third person joins: everyone connects to everyone.
  const third = await newPage();
  await third.goto(`${BASE}/j/${code}`, { waitUntil: "networkidle" });
  await third.locator("#prejoin-name").fill("Third Person");
  await third.getByRole("button", { name: "Join", exact: true }).click();
  await third.getByRole("button", { name: "Leave", exact: true }).waitFor();
  let thirdVideos = 0;
  for (let i = 0; i < 40 && thirdVideos < 2; i++) {
    await third.waitForTimeout(500);
    thirdVideos = await third.evaluate(
      () => [...document.querySelectorAll("video")].filter((v) => !v.className.includes("-scale-x-100") && v.videoWidth > 0).length,
    );
  }
  check("Third participant receives both other videos", thirdVideos === 2, `${thirdVideos} remote videos`);

  await host.getByRole("button", { name: "End", exact: true }).click();
  await host.getByRole("menuitem", { name: "End meeting for all" }).click();
  await guest.getByText("This meeting has ended").waitFor({ timeout: 10000 });
  check("Ending the meeting closes everyone's call", true);
} catch (error) {
  results.push(`ABORTED: ${error.message.split("\n").slice(0, 5).join(" | ")}`);
}

console.log(results.join("\n"));
await Promise.all(browsers.map((b) => b.close()));
process.exitCode = results.every((line) => line.startsWith("PASS")) ? 0 : 1;
