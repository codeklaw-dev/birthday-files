/**
 * Rehearse the show with every cloud service down: TTS, LLM and STT all fail.
 * The show must keep going on approved, pre-generated narration, subtitles and
 * prepared fallback lines.
 *
 *   npm run build && node tests/e2e/offline.mjs
 *
 * Needs Playwright (Chromium).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const SHOTS = process.env.SHOTS || path.resolve(".cache/e2e");
mkdirSync(SHOTS, { recursive: true });
const KEY = "offline-e2e-key";
const PORT = 3430;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  checks++;
  console.log(`ok  ${msg}`);
};
const tmp = (p) => mkdtempSync(path.join(tmpdir(), p));
const env = {
  ...process.env,
  HOST_KEY: KEY,
  ROOM_PERSIST: "off",
  INVITE_DATA_DIR: tmp("bf-off-inv-"),
  HOST_DATA_DIR: tmp("bf-off-host-"),
  TTS_CACHE_DIR: tmp("bf-off-tts-"),
  HOST_TTS_CHAIN: "mock-fail",
  HOST_LLM_CHAIN: "mock-fail",
  HOST_STT_CHAIN: "mock-fail",
  HOST_NO_MOCK: "1",
  GAME_TIMER_SCALE: "0.3",
};
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${BASE}/hub`)).ok) break;
  } catch {}
  await sleep(500);
}
const host = (p, method = "GET", body) =>
  fetch(BASE + p, { method, headers: { "Content-Type": "application/json", "x-host-key": KEY }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const playback = async () => (await host("/api/host/status")).playback;
async function waitPlayback(pred, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const hit = (await playback()).find(pred);
    if (hit) return hit;
    await sleep(300);
  }
  throw new Error(`FAILED: no playback for ${label}: ${JSON.stringify((await playback()).slice(0, 4))}`);
}

// Seed: an approved guest with a memory, approved narration, an approved announcement.
const g = await (await fetch(`${BASE}/api/invite/submissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Nadia", relationship: "Best friend", rsvp: "remote", answers: { q1: "Biryani", q2: "Song", q3: "Talent" }, memory: "Getting lost in Sylhet", consent: true }) })).json();
await host(`/api/invite/admin/${g.submission.id}`, "PATCH", { status: "approved" });
await host("/api/host/narration/review", "PATCH", { approveAll: true });
const ann = (await host("/api/host/announcements", "POST", { title: "Cake is coming", text: { en: "Everyone, the cake is on its way!", bn: "" } })).announcement;
const approved = (await host("/api/host/announcements", "PATCH", { id: ann.id, status: "approved", wait: true })).announcement;

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
try {
  ok(approved.prepared.en === "failed", "approving an announcement tries to pre-generate its voice; with the cloud down it's marked to fall back");

  // The invitation (page + scripts) never reveals the AI host.
  const html = await (await fetch(`${BASE}/invite`)).text();
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  let bundle = html;
  for (const s of scripts) bundle += await (await fetch(BASE + s)).text();
  ok(scripts.length > 0 && !/Inspector Byte|ইন্সপেক্টর|AI host|AI-hosted/i.test(bundle), `invite page and its ${scripts.length} scripts never mention the AI host`);

  const page = async (opts, url) => {
    const p = await (await browser.newContext(opts)).newPage();
    p.on("dialog", (d) => d.accept());
    await p.goto(BASE + url);
    return p;
  };
  const tv = await page({ viewport: { width: 1600, height: 900 } }, "/display");
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ["microphone"] });
  await adminCtx.addInitScript(() => {
    window.__micOpens = 0;
    const orig = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (orig) navigator.mediaDevices.getUserMedia = (c) => (window.__micOpens++, orig(c));
  });
  const admin = await adminCtx.newPage();
  admin.on("dialog", (d) => d.accept());
  await admin.goto(BASE + "/admin");
  await admin.fill("input[type=password]", KEY);
  await admin.click("text=Unlock");
  await admin.waitForSelector("text=Run of show");
  await admin.click('[aria-label="Host language"] >> text=Both');
  const phones = [];
  for (const name of ["Ana", "Bo", "Cy"]) {
    const p = await page({ ...devices["Pixel 7"] }, "/play");
    await p.fill("input", name);
    await p.click("text=Join the show");
    await p.waitForSelector("text=You're in!");
    phones.push(p);
  }
  await sleep(3000);
  ok((await admin.evaluate(() => window.__micOpens)) === 0, "the microphone isn't opened until the organiser presses push-to-talk");

  // Narrator mode with no cloud: approved clips play.
  await admin.click("text=Start the show");
  const first = await waitPlayback((p) => p.via === "clip", "approved clip");
  ok(true, `scripted line played from approved narration (${first.latencyMs} ms)`);
  await phones[0].click('button:has-text("Biryani")');
  await admin.click('button:has-text("Reveal answer")');
  const fb = await waitPlayback((p) => p.via === "fallback-clip", "fallback clip");
  ok(true, `dynamic reveal line fell back to prepared narration (${fb.latencyMs} ms)`);
  await admin.click('button:text-is("Show leaderboard")');

  // A game intro is pre-recorded too.
  const tGame = Date.now();
  await admin.click('li:has(p:text-is("Mez Imposter")) >> button:has-text("Start")');
  await tv.waitForSelector("text=Check your phone. Secretly.");
  await waitPlayback((p) => p.via === "clip" && p.at > tGame, "game intro clip");
  ok(true, "Mez Imposter intro played from approved narration");
  await admin.click('button:has-text("Stop game")');

  // AI commentary fails gracefully.
  await admin.click('button:has-text("Draft")');
  await admin.waitForSelector("text=all providers failed");
  ok(true, "AI commentary reports the outage instead of saying anything");

  // Surprise mode: announcement and memory.
  await admin.waitForSelector('section:has-text("Surprises") >> text=Cake is coming');
  await admin.click('section:has-text("Surprises") li:has-text("Cake is coming") >> button:has-text("Play")');
  await tv.waitForSelector("text=the cake is on its way");
  const sv = await waitPlayback((p) => p.via === "fallback-clip" || p.via === "captions", "announcement fallback");
  ok(true, `approved announcement shown on the TV; voice fell back to ${sv.via}`);
  await sleep(700);
  await tv.screenshot({ path: `${SHOTS}/tv-surprise-offline.png` });
  await admin.click('button:has-text("End surprise")');
  await admin.click('section:has-text("Surprises") li:has-text("Nadia") >> button:has-text("Reveal")');
  await tv.waitForSelector("text=Getting lost in Sylhet");
  ok((await tv.locator("main").innerText()).match(/NADIA|Nadia/), "memory reveal shows the guest's words and name");
  await admin.click('button:has-text("End surprise")');

  // Push-to-talk with STT and LLM down.
  const ptt = admin.locator("button", { hasText: "Hold to talk" });
  await ptt.scrollIntoViewIfNeeded();
  const box = await ptt.boundingBox();
  await admin.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await admin.mouse.down();
  await sleep(1300);
  await admin.mouse.up();
  await admin.waitForSelector("text=You can type it below");
  ok((await admin.evaluate(() => window.__micOpens)) === 1, "the mic opened exactly once, for the press; transcription outage asks the organiser to type");
  await admin.fill('textarea[aria-label="Transcript"]', "Host, are you still there?");
  await admin.selectOption('select[aria-label="Language override"]', "en");
  await admin.click('button:has-text("Reply on TV")');
  await admin.waitForSelector("text=prepared line played");
  const pf = await waitPlayback((p) => p.via === "clip" && p.provider === "narration" && p.lang === "en", "ptt fallback clip");
  ok(!!pf, "AI reply outage plays the prepared fallback line on the TV");
  await tv.waitForSelector("text=circuits just fainted");
  ok(true, "the fallback line is subtitled on the TV");
  await admin.screenshot({ path: `${SHOTS}/admin-offline.png`, fullPage: true });

  // Subtitles and mute controls reach the TV.
  await admin.click('[role=switch]:has-text("Subtitles on TV")');
  await tv.waitForFunction(() => !document.body.innerText.includes("AI HOST") && !document.body.innerText.includes("AI host"));
  ok(true, "subtitles can be switched off on the TV");
  await admin.click('[role=switch]:has-text("Subtitles on TV")');
  await admin.click('[role=switch]:has-text("Mute all sound")');
  await sleep(800);
  const tMute = Date.now();
  await admin.selectOption('select:has(option:text("Pick a line to play now…"))', "happy_birthday");
  await tv.waitForSelector("text=Happy birthday, Mez!");
  await sleep(2500);
  ok(!(await playback()).some((p) => p.at > tMute), "with Mute all sound on, the TV shows the line but plays nothing");

  // Status shows every provider failing.
  const st = await host("/api/host/status");
  const failing = st.chains.flatMap((c) => c.providers.filter((p) => p.failures > 0).map((p) => `${c.kind}:${p.id}`));
  ok(failing.length >= 3, `dashboard shows the outages (${failing.join(", ")})`);

  console.log(`\nAll ${checks} checks passed.`);
} catch (e) {
  console.error(e.message);
  console.error(log.split("\n").filter((l) => /error/i.test(l)).slice(-5).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
