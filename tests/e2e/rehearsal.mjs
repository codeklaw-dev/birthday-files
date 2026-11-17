/**
 * End-to-end rehearsal: the whole show director and finale on FICTIONAL guests,
 * started through `scripts/rehearsal.mjs` exactly as the organiser would.
 * TV (1920×1080 and a 4:3 screen for letterboxing), the organiser's show
 * dashboard, Mez's judge phone and three guest phones.
 *
 *   npm run build && node tests/e2e/rehearsal.mjs
 *
 * AI providers are mocked: nothing paid is called.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const SHOTS = process.env.SHOTS || path.resolve(".cache/e2e/rehearsal");
mkdirSync(SHOTS, { recursive: true });
const KEY = "rehearsal-e2e-key";
const PORT = 3430;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  checks++;
  console.log(`ok  ${msg}`);
};

const dataDir = path.join(mkdtempSync(path.join(tmpdir(), "bf-rehearsal-e2e-")), "rehearsal");
const env = { ...process.env, HOST_KEY: KEY, REHEARSAL_DATA_DIR: dataDir, HOST_TTS_CHAIN: "mock", HOST_LLM_CHAIN: "mock", HOST_STT_CHAIN: "mock", GAME_TIMER_SCALE: "0.3" };
const server = spawn(process.execPath, ["scripts/rehearsal.mjs", "--port", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));
for (let i = 0; i < 90; i++) {
  try {
    if ((await fetch(`${BASE}/hub`)).ok) break;
  } catch {}
  await sleep(500);
}
ok(/Rehearsal data ready: 8 fictional guests/.test(log), "rehearsal launcher seeded 8 fictional guests into its own folder");

const api = (body) => fetch(`${BASE}/api/room/action`, { method: "POST", headers: { "Content-Type": "application/json", "x-host-key": KEY }, body: JSON.stringify(body) });
const state = async () => {
  const r = await fetch(`${BASE}/api/room/stream?role=host&key=${KEY}`);
  const reader = r.body.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  return JSON.parse(new TextDecoder().decode(value).replace(/^data: /, ""));
};

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const secretsSeen = [];
const scan = async (page, where) => {
  const text = await page.content();
  if (/SECRET-|NO-CONSENT|UNREVIEWED/.test(text)) secretsSeen.push(where);
};
try {
  const page = (opts) => browser.newContext(opts).then((c) => c.newPage());

  // ---- screens ----
  const tv = await page({ viewport: { width: 1920, height: 1080 } });
  await tv.goto(BASE + "/display");
  await tv.waitForSelector("text=Rehearsal · sample data");
  const frame = await tv.locator(".tv-frame").boundingBox();
  ok(Math.round(frame.width) === 1920 && Math.round(frame.height) === 1080, "TV stage fills a 1920×1080 screen exactly (16:9)");
  const tv43 = await page({ viewport: { width: 1280, height: 1024 } });
  await tv43.goto(BASE + "/display");
  await tv43.waitForSelector("text=Rehearsal · sample data");
  const f43 = await tv43.locator(".tv-frame").boundingBox();
  ok(Math.round(f43.width) === 1280 && Math.round(f43.height) === 720 && Math.round(f43.y) === 152, "on a 4:3 screen the stage letterboxes to 1280×720, centred");
  await tv43.screenshot({ path: `${SHOTS}/tv-letterbox-4x3.png` });

  const admin = await page({ viewport: { width: 1440, height: 900 } });
  await admin.goto(BASE + "/admin/show");
  await admin.fill("input[type=password]", KEY);
  await admin.click("text=Unlock");
  await admin.waitForSelector("text=Running order");
  ok(await admin.isVisible("text=Rehearsal · sample data"), "dashboard is clearly marked as a rehearsal");
  ok((await admin.locator("[data-segment][data-status=pending]").count()) >= 15, "running order lists the planned segments, all waiting");
  ok(await admin.locator('[data-testid="up-next"]').isVisible(), "an Up next card waits for the organiser — nothing starts by itself");
  await sleep(700);
    await admin.screenshot({ path: `${SHOTS}/dashboard.png`, fullPage: true });

  const judgeKey = (await (await fetch(`${BASE}/api/room/judge`, { headers: { "x-host-key": KEY } })).json()).key;
  const mez = await page({ ...devices["iPhone 13"] });
  await mez.goto(`${BASE}/judge#k=${judgeKey}`);
  await mez.waitForSelector("text=Judge Mez");

  const phones = {};
  const models = [["Ana", "Pixel 7"], ["Bo", "iPhone 13"], ["Cy", "iPhone SE"]];
  for (const [name, model] of models) {
    const p = await page({ ...devices[model] });
    await p.goto(BASE + "/play");
    await p.fill("input", name);
    await p.click("text=Join the show");
    await p.waitForSelector("text=You're in!");
    phones[name] = p;
  }
  const all = Object.values(phones);
  ok(true, "three guest phones (Pixel 7, iPhone 13, iPhone SE) and Mez's judge phone joined");
  await tv.waitForSelector("text=Cy");

  const row = (kind) => admin.locator(`[data-kind="${kind}"]`).first();
  const start = async (kind) => {
    await row(kind).locator('button[aria-label^="Start"], button[aria-label^="Replay"]').first().click();
    await admin.waitForFunction((k) => document.querySelector(`[data-kind="${k}"]`)?.getAttribute("data-status") === "live", kind);
  };

  // ---- welcome ----
  await start("welcome");
  ok((await admin.textContent('[data-testid="live-segment"]')).includes("Doors open"), "organiser started the welcome segment by hand");

  // ---- preview before live ----
  await row("spotlight").locator('button[aria-label^="Preview"]').click();
  const pv = admin.frameLocator('iframe[title="Preview of the TV"]');
  await pv.locator(".stamp:has-text('Who sent this?')").or(pv.locator("h1:has-text('Guest spotlight')")).first().waitFor();
  ok(await pv.locator("h1:has-text('Guest spotlight')").isVisible(), "preview shows the spotlight title card exactly as the TV would");
  await admin.click('section:has-text("Preview ·") button:has-text("Next")');
  await pv.locator(".stamp:has-text('Who sent this?')").waitFor();
  ok(true, "preview can step into the first exhibit");
  ok(!(await tv.isVisible(".stamp:has-text('Who sent this?')")) && (await tv.isVisible("text=Scan, or open")), "the real TV is untouched while previewing (still the lobby)");
  await sleep(700);
    await admin.screenshot({ path: `${SHOTS}/dashboard-preview.png` });

  // ---- spotlight live: anonymous, then reveal ----
  await admin.click('section:has-text("Preview ·") button:has-text("Go live")');
  await admin.waitForFunction(() => document.querySelector('[data-kind="spotlight"]')?.getAttribute("data-status") === "live");
  await tv.waitForSelector("h1:has-text('Guest spotlight')");
  ok(await phones.Ana.isVisible("text=Who do you think sent it?"), "phones point guests at the TV during the spotlight");
  const scene = (await state()).scene;
  ok(scene.items.length >= 5 && !JSON.stringify(scene).includes("SECRET"), `spotlight built from ${scene.items.length} approved, consented exhibits only`);
  let sawMissing = false;
  let sawVideo = false;
  for (let i = 0; i < scene.items.length; i++) {
    await admin.click('section[aria-label="Scene controls"] button:has-text("Show first"), section[aria-label="Scene controls"] button:has-text("Next")');
    await tv.waitForSelector(".stamp:has-text('Who sent this?')");
    const item = scene.items[i];
    const tvText = await tv.locator(".tv-frame").innerText();
    if (tvText.includes(item.from)) throw new Error(`FAILED: ${item.from} visible before the reveal`);
    if (item.mediaKind === "photo" && (await tv.isVisible("text=couldn't be loaded"))) sawMissing = true;
    if (item.mediaKind === "video") {
      await tv.waitForFunction(() => {
        const v = document.querySelector(".tv-frame video");
        return v && v.readyState >= 2 && v.currentTime > 0.2;
      }, null, { timeout: 15000 });
      sawVideo = true;
      if (i === 1) await sleep(700).then(() => tv.screenshot({ path: `${SHOTS}/tv-spotlight-video.png` }));
    }
    if (i === 0) await sleep(700).then(() => tv.screenshot({ path: `${SHOTS}/tv-spotlight-anonymous.png` }));
    await admin.click('button:has-text("Reveal who sent it")');
    await tv.waitForSelector(`text=${item.from}`);
    if (i === 0) await sleep(700).then(() => tv.screenshot({ path: `${SHOTS}/tv-spotlight-revealed.png` }));
    await scan(tv, `tv spotlight ${i}`);
  }
  ok(true, "every exhibit stayed anonymous until the organiser revealed it");
  ok(sawVideo, "spotlight videos load and play on the TV");
  ok(sawMissing, "a missing photo file shows a friendly placeholder instead of breaking the TV");

  // ---- pause / emergency / mute ----
  await admin.click('button:has-text("Pause")');
  await tv.waitForSelector("text=Paused");
  await phones.Bo.waitForSelector("text=Paused. Hang tight.");
  ok(await tv.evaluate(() => [...document.querySelectorAll("video")].every((v) => v.paused)), "Pause shows on the TV and phones and freezes video playback");
  await admin.click('button:has-text("Resume")');
  await tv.waitForSelector("text=Paused", { state: "detached" });
  await admin.click('button:has-text("Emergency stop")');
  await tv.waitForSelector("text=Back in a moment");
  ok((await state()).host.muted === true, "Emergency stop covers the TV, cuts the voice and mutes sound");
  await sleep(700);
    await tv.screenshot({ path: `${SHOTS}/tv-emergency.png` });
  ok(!(await tv.locator(".tv-frame").innerText()).includes("sample)"), "nothing from the scene shows behind the emergency card");
  await admin.click('button:has-text("Resume show")');
  await tv.waitForSelector("text=Back in a moment", { state: "detached" });
  ok((await state()).host.muted === false, "Resume restores the previous sound setting");
  await admin.click('button:has-text("Mute TV")');
  await admin.waitForSelector('button:has-text("Unmute TV")');
  ok((await state()).host.muted === true, "Mute toggle works from the control bar");
  await admin.click('button:has-text("Unmute TV")');
  await admin.click('button:has-text("End segment")');
  await admin.waitForFunction(() => document.querySelector('[data-kind="spotlight"]')?.getAttribute("data-status") === "done");
  await tv.waitForSelector("text=Scan, or open");
  ok(true, "End segment returns the TV to the lobby and marks the spotlight done");

  // ---- skip / restore / replay ----
  await row("game:imposter").locator('button[aria-label^="Skip"]').click();
  await admin.waitForFunction(() => document.querySelector('[data-kind="game:imposter"]')?.getAttribute("data-status") === "skipped");
  await row("game:imposter").locator('button[aria-label^="Restore"]').click();
  await admin.waitForFunction(() => document.querySelector('[data-kind="game:imposter"]')?.getAttribute("data-status") === "pending");
  ok(true, "Skip and Restore work on a queued segment");
  await start("spotlight");
  await tv.waitForSelector("h1:has-text('Guest spotlight')");
  ok(true, "Replay restarts a finished segment from its title card");

  // ---- history (manual override: started out of order) ----
  await start("history");
  await tv.waitForSelector("h1:has-text('21 November')");
  await admin.click('section[aria-label="Scene controls"] button:has-text("Show first")');
  await tv.waitForSelector("text=Source:");
  const hist = await tv.locator(".tv-frame").innerText();
  ok(/2002/.test(hist) && /NATO/.test(hist) && /nato\.int/.test(hist), "history opens on 21 Nov 2002 with its source shown");
  await sleep(700);
    await tv.screenshot({ path: `${SHOTS}/tv-history.png` });
  const histItems = (await state()).scene.items;
  ok(histItems.every((h) => h.sourceUrl?.startsWith("https://")) && !histItems.some((h) => /ICC|assassinated|ceasefire/i.test(h.title)), `history has ${histItems.length} sourced items; serious news is off by default`);

  // ---- a quiz question so the boards have scores (override: a disabled segment) ----
  await row("quiz").locator('button[aria-label^="Start"]').click();
  await phones.Ana.waitForSelector('[aria-label="Seconds left"]');
  const q = (await state()).question;
  for (const [i, p] of all.entries()) await p.locator("main button").nth(i === 2 ? (q.correctIndex + 1) % q.options.length : q.correctIndex).click();
  await api({ type: "host/reveal" });
  await phones.Ana.waitForSelector("text=points");
  ok(true, "manual override: a switched-off quiz segment can still be started by hand");

  // ---- the cake ----
  await start("cake");
  await tv.waitForSelector("text=Tap your phones");
  ok((await tv.getAttribute('[role="img"][aria-label^="Birthday cake"]', "aria-label")).includes("24 of 24"), "virtual cake has 24 lit candles");
  await sleep(700);
    await tv.screenshot({ path: `${SHOTS}/tv-cake-24.png` });
  for (let round = 0; round < 400; round++) {
    const done = await phones.Ana.isVisible("text=Over to Mez!");
    if (done) break;
    await Promise.all(all.map((p) => p.click('button[aria-label="Blow"]', { timeout: 2000 }).catch(() => {})));
  }
  await tv.waitForSelector("text=That's Mez's candle");
  ok((await tv.getAttribute('[role="img"][aria-label^="Birthday cake"]', "aria-label")).includes("1 of 24"), "three phones blew out 23 candles; the last one is left for Mez");
  ok(await phones.Cy.locator('button[aria-label="Blow"]').isDisabled(), "guests can't blow out Mez's candle");
  await sleep(700);
    await tv.screenshot({ path: `${SHOTS}/tv-cake-mez.png` });
  await mez.click('button[aria-label="Blow out my candle"]');
  await tv.waitForSelector("text=Make a wish");
  ok(true, "Mez blew out the last candle from the judge phone; confetti on the TV");
  await admin.click('button:has-text("Cut the cake")');
  await tv.waitForSelector(".animate-knife");
  await sleep(1800);
  await sleep(700);
    await tv.screenshot({ path: `${SHOTS}/tv-cake-cut.png` });
  ok(await phones.Bo.isVisible("text=The cake is cut!"), "cutting animation on the TV; phones follow");
  await admin.click('button:has-text("To the real cake")');
  await tv.waitForSelector("text=Now for the real cake!");
  await phones.Ana.waitForSelector("text=Real cake time!");
  ok(true, "hand-over to the real cake on the TV and every phone");
  await admin.click('section[aria-label="Cake controls"] button:has-text("End")');

  // ---- finale: ceremony, prizes, honours, montage ----
  await start("ceremony");
  const cer = (await state()).scene.items;
  for (let i = 0; i < cer.length; i++) {
    await admin.click('section[aria-label="Scene controls"] button:has-text("Show first"), section[aria-label="Scene controls"] button:has-text("Next")');
    await admin.click('button:has-text("Reveal name")');
    await tv.waitForSelector(`.tv-frame >> text=${cer[i].from}`);
  }
  await sleep(700);
    await tv.screenshot({ path: `${SHOTS}/tv-ceremony.png` });
  ok(cer.length >= 3 && cer[cer.length - 1].title.startsWith("1st"), `leaderboard ceremony counted down ${cer.length} places to the winner`);
  await start("prizes");
  await admin.click('section[aria-label="Scene controls"] button:has-text("Show first")');
  await admin.click('button:has-text("Reveal name")');
  await tv.waitForSelector("text=place");
  ok(true, "prize announcements reveal winners one by one");
  await start("honours");
  const hon = (await state()).scene.items.map((i) => i.from);
  ok(hon.includes("Priya (sample)") && hon.includes("Nila (sample)") && !hon.some((n) => /NO-CONSENT|UNREVIEWED/.test(n)), "honourable mentions include a remote guest and nobody unapproved");
  await admin.click('section[aria-label="Scene controls"] button:has-text("Show first")');
  await tv.waitForSelector("text=🎖️");
  await start("montage");
  const mon = (await state()).scene.items;
  ok(mon.length === 3 && mon.every((m) => m.mediaKind === "video"), "montage queues every approved video message (3)");
  await admin.click('section[aria-label="Scene controls"] button:has-text("Show first")');
  await tv.waitForFunction(() => {
    const v = document.querySelector(".tv-frame video:not(.hidden)");
    return v && v.currentTime > 0.5;
  }, null, { timeout: 15000 });
  await sleep(700);
    await tv.screenshot({ path: `${SHOTS}/tv-montage.png` });
  ok(true, "montage plays the video messages on the TV");
  await start("finale");
  await tv.waitForSelector("text=Top detectives");
  ok(true, "finale podium on the TV");
  for (const [name, p] of Object.entries(phones)) await scan(p, `phone ${name}`);
  await scan(tv, "tv finale");
  await scan(mez, "judge");
  ok(secretsSeen.length === 0, `no unapproved or non-consented submission appeared on any screen${secretsSeen.length ? `: ${secretsSeen}` : ""}`);
  await sleep(700);
    await admin.screenshot({ path: `${SHOTS}/dashboard-end.png`, fullPage: true });

  console.log(`\nAll ${checks} checks passed.`);
} catch (e) {
  console.error(e.message);
  console.error(log.split("\n").filter((l) => /error/i.test(l)).slice(-8).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
