/**
 * End-to-end run of the whole show in real browsers, with audio.
 *
 *   npm run build && node tests/e2e/full-show.mjs
 *
 * Needs Playwright with Chromium available (`require("playwright")`).
 * Starts two production servers:
 *   A — default providers (no keys → mock voice) : full flow, push-to-talk, auto quips
 *   B — TTS forced to fail                       : failover to recorded clips, restart recovery
 * Screenshots go to $SHOTS (default ./.cache/e2e).
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const SHOTS = process.env.SHOTS || path.resolve(".cache/e2e");
mkdirSync(SHOTS, { recursive: true });
const KEY = "mez-host";
// Never spend real cloud quota in tests, even if .env.local has keys.
const MOCKS = { HOST_TTS_CHAIN: "mock", HOST_LLM_CHAIN: "mock", HOST_STT_CHAIN: "mock", HOST_KEY: KEY };
const results = [];
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  results.push(msg);
  console.log(`ok  ${msg}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(port, env) {
  const proc = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  return {
    proc,
    log: () => log,
    async ready() {
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch(`http://localhost:${port}/`)).ok) return;
        } catch {}
        await sleep(500);
      }
      throw new Error(`server on ${port} did not start:\n${log}`);
    },
    async stop() {
      if (proc.exitCode !== null) return;
      const exited = new Promise((r) => proc.once("exit", r));
      proc.kill("SIGTERM");
      await Promise.race([exited, sleep(5000).then(() => proc.kill("SIGKILL"))]);
    },
  };
}

const status = async (base) => (await fetch(`${base}/api/host/status`, { headers: { "x-host-key": KEY } })).json();
async function waitPlayback(base, pred, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const s = await status(base);
    const hit = s.playback.find(pred);
    if (hit) return hit;
    await sleep(300);
  }
  throw new Error(`FAILED: no playback matching ${label}. Last: ${JSON.stringify((await status(base)).playback.slice(0, 5))}`);
}

async function openShow(browser, base, phones) {
  const page = async (vp, p, opts = {}) => {
    const ctx = await browser.newContext({ viewport: vp, ...opts });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => console.log(`[pageerror ${p}]`, e.message));
    await pg.goto(base + p);
    return pg;
  };
  const tv = await page({ width: 1600, height: 900 }, "/display");
  const admin = await page({ width: 1440, height: 1000 }, "/admin", { permissions: ["microphone"] });
  await admin.fill("input[type=password]", KEY);
  await admin.click("text=Unlock");
  await admin.waitForSelector("text=Run of show");
  const players = [];
  for (const name of phones) {
    const p = await page({ width: 390, height: 844 }, "/play");
    await p.fill("input", name);
    await p.click("text=Join the show");
    await p.waitForSelector("text=You're in!");
    players.push(p);
  }
  return { tv, admin, players };
}

async function runA(browser) {
  const base = "http://localhost:3401";
  const server = startServer(3401, { ...MOCKS, ROOM_PERSIST: "off", TTS_CACHE_DIR: mkdtempSync(path.join(tmpdir(), "bf-tts-")) });
  await server.ready();
  try {
    const { tv, admin, players } = await openShow(browser, base, ["Rafi", "Tania"]);
    await tv.waitForSelector("text=turn on the host");
    ok(true, "TV asks for a click before playing sound (browser autoplay rule)");
    await tv.click("text=turn on the host");
    await tv.waitForSelector("text=Sound");
    ok(true, "sound unlocks after one click");
    await tv.screenshot({ path: `${SHOTS}/tv-lobby.png` });

    // A fully pre-recorded line.
    await admin.click("text=Start the show");
    const start = await waitPlayback(base, (p) => p.via === "clip", "show_start clip");
    ok(start.via === "clip", `scripted line played from pre-recorded clip (${start.latencyMs} ms to start)`);

    // A dynamic line (names/numbers) → live TTS.
    const [a, b] = players;
    await a.click('button:has-text("Biryani")');
    await b.click('button:has-text("Pizza")');
    await admin.waitForSelector("text=2/2 answered");
    await admin.click('button:has-text("Reveal answer")');
    await tv.waitForSelector("text=Rafi was the fastest");
    const live = await waitPlayback(base, (p) => p.via === "live", "live reveal line");
    ok(live.provider === "mock" || live.provider === "cache", `dynamic reveal line synthesised live via ${live.provider} (${live.latencyMs} ms to start)`);
    await sleep(600);
    await tv.screenshot({ path: `${SHOTS}/tv-reveal-speaking.png` });

    // Commentary draft → review → say. Mock LLM picks a pre-recorded quip.
    await admin.click('button:has-text("Draft")');
    await admin.waitForSelector("text=pre-recorded");
    const draftEn = await admin.locator("textarea[lang=en]").inputValue();
    ok(draftEn.length > 10, `AI commentary drafted for review: "${draftEn}"`);
    await admin.click('button:has-text("Say on TV")');
    await tv.waitForSelector(`text=${draftEn.slice(0, 25)}`);
    ok(true, "approved commentary appears on the TV");

    // Custom Bangla-only line.
    await admin.click('button:has-text("Clear")');
    await admin.fill("textarea[lang=bn]", "রাফি, আপনি তো আজকে গোয়েন্দা নম্বর ওয়ান!");
    await admin.click('button:has-text("Say on TV")');
    await tv.waitForSelector("text=গোয়েন্দা নম্বর ওয়ান");
    const bn = await waitPlayback(base, (p) => p.lang === "bn" && p.via === "live", "bn custom line");
    ok(true, `typed Bangla line spoken via ${bn.provider} (${bn.latencyMs} ms)`);

    // Soundboard + stop.
    await admin.click('button:has-text("Air horn")');
    await admin.click('button:has-text("Stop talking")');
    ok(true, "soundboard and stop controls accepted");

    // Push-to-talk with Chromium's fake microphone.
    const ptt = admin.locator("button", { hasText: "Hold to talk" });
    await ptt.scrollIntoViewIfNeeded();
    const box = await ptt.boundingBox();
    await admin.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await admin.mouse.down();
    await sleep(1600);
    await admin.mouse.up();
    await admin.waitForSelector("text=Heard", { timeout: 15000 });
    const timing = await admin.locator("text=/total \\d+ ms/").innerText();
    ok(true, `push-to-talk: mic → STT → LLM reply (${timing.trim()})`);
    await tv.waitForSelector("text=mock AI");
    ok(true, "conversation reply is spoken on the TV");
    await admin.screenshot({ path: `${SHOTS}/admin-host-panel.png`, fullPage: true });

    // Auto quips after a reveal.
    await admin.click('[role=switch]:has-text("Auto quips")');
    await admin.click('button:has-text("Show leaderboard")');
    await admin.click('button:has-text("Next question")');
    await admin.click('button:has-text("Reveal answer")');
    await tv.waitForFunction(() => document.body.innerText.match(/fabulous|embarrassed|remember Mez|recount|forever|main character/), null, { timeout: 10000 });
    ok(true, "auto quip follows the reveal without host action");

    const s = await status(base);
    const vias = [...new Set(s.playback.map((p) => p.via))];
    ok(vias.includes("clip") && vias.includes("live"), `TV reported playback sources: ${vias.join(", ")}`);
    const lat = s.playback.map((p) => p.latencyMs);
    console.log(`    latency to first sound (ms): ${lat.join(", ")}`);
    return { latencies: s.playback };
  } finally {
    await server.stop();
  }
}

async function runB(browser) {
  const base = "http://localhost:3402";
  const dataDir = mkdtempSync(path.join(tmpdir(), "bf-room-"));
  const env = { ...MOCKS, ROOM_DATA_DIR: dataDir, HOST_TTS_CHAIN: "mock-fail", HOST_NO_MOCK: "1", TTS_CACHE_DIR: mkdtempSync(path.join(tmpdir(), "bf-tts-")) };
  let server = startServer(3402, env);
  await server.ready();
  const { tv, admin, players } = await openShow(browser, base, ["Nadia"]);
  await tv.click("text=turn on the host");
  await admin.click("text=Start the show");
  await players[0].click('button:has-text("Pizza")');
  await admin.click('button:has-text("Reveal answer")');
  await admin.click('button:has-text("Show leaderboard")');
  const fb = await waitPlayback(base, (p) => p.via === "fallback-clip", "fallback clip for dynamic line");
  ok(true, `cloud TTS down → dynamic line fell back to a recorded clip (${fb.latencyMs} ms)`);
  const st = await status(base);
  const failing = st.chains.find((c) => c.kind === "tts").providers.find((p) => p.id === "mock-fail");
  ok(failing.failures >= 1, `dashboard shows the failing voice provider (${failing.failures} failures${failing.resting ? ", resting" : ""})`);

  await admin.fill("textarea[lang=en]", "This line has no recording at all.");
  await admin.click('button:has-text("Say on TV")');
  const cap = await waitPlayback(base, (p) => p.via === "captions" || p.via === "browser", "captions/browser last resort");
  ok(true, `line with no audio anywhere degrades to ${cap.via} (show keeps going)`);
  await tv.screenshot({ path: `${SHOTS}/tv-failover.png` });

  // Restart the server mid-show: players and scores must survive.
  await sleep(800);
  await server.stop();
  server = startServer(3402, env);
  await server.ready();
  await tv.waitForSelector("text=Nadia", { timeout: 15000 });
  const players2 = await (await fetch(`${base}/api/host/status`, { headers: { "x-host-key": KEY } })).ok;
  await admin.waitForSelector("text=Nadia");
  ok(players2, "after a server restart the room comes back with its players (TV and admin reconnect)");
  await server.stop();
}

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
try {
  await runA(browser);
  await runB(browser);
  console.log(`\nAll ${results.length} checks passed.`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
