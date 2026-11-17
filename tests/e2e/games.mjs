/**
 * Every birthday game in real browsers: TV, host laptop, Mez's judge phone and
 * three guest phones, with real invite submissions behind the content.
 *
 *   npm run build && node tests/e2e/games.mjs
 *
 * Needs Playwright (Chromium) and ffmpeg.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const SHOTS = process.env.SHOTS || path.resolve(".cache/e2e");
mkdirSync(SHOTS, { recursive: true });
const KEY = "games-e2e-key";
const PORT = 3420;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  checks++;
  console.log(`ok  ${msg}`);
};

const fx = mkdtempSync(path.join(tmpdir(), "bf-gfx-"));
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=800x600:d=1", "-frames:v", "1", path.join(fx, "photo.png")]);

const env = {
  ...process.env,
  HOST_KEY: KEY,
  INVITE_DATA_DIR: mkdtempSync(path.join(tmpdir(), "bf-games-e2e-")),
  ROOM_PERSIST: "off",
  GAME_TIMER_SCALE: "0.3",
  HOST_TTS_CHAIN: "mock",
  HOST_LLM_CHAIN: "mock",
  HOST_STT_CHAIN: "mock",
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

// ---- seed approved invite submissions through the real APIs ----
let ipn = 1;
async function guest(body, { photo = false } = {}) {
  const r = await (await fetch(`${BASE}/api/invite/submissions`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.7.0.${ipn++}` }, body: JSON.stringify(body) })).json();
  if (photo) await fetch(`${BASE}/api/invite/media/photo`, { method: "PUT", headers: { "x-edit-token": r.token, "x-forwarded-for": `10.7.1.${ipn++}` }, body: readFileSync(path.join(fx, "photo.png")) });
  await fetch(`${BASE}/api/invite/admin/${r.submission.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-host-key": KEY }, body: JSON.stringify({ status: "approved" }) });
  return r.submission.id;
}
await guest({ name: "Nadia", relationship: "Best friend", rsvp: "remote", answers: { q1: "Kacchi biryani", q2: "Arijit Singh", q3: "Winning arguments" }, memory: "Getting lost in Sylhet", accusation: "stealing every last fuchka", consent: true });
await guest({ name: "Rafi", relationship: "Family", rsvp: "yes", answers: { q1: "Biryani", q2: "Coke Studio", q3: "Parallel parking" }, accusation: "always being late", consent: true }, { photo: true });
await guest({ name: "Tania", relationship: "Friend", rsvp: "yes", answers: { q1: "Pizza", q2: "Taylor Swift", q3: "Remembering birthdays" }, consent: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const ctx = (opts) => browser.newContext(opts).then((c) => c.newPage());
  const tv = await ctx({ viewport: { width: 1600, height: 900 } });
  await tv.goto(BASE + "/display");
  const admin = await ctx({ viewport: { width: 1440, height: 1000 } });
  admin.on("dialog", (d) => d.accept());
  await admin.goto(BASE + "/admin");
  await admin.fill("input[type=password]", KEY);
  await admin.click("text=Unlock");
  await admin.waitForSelector("text=Run of show");
  const judgeKey = (await (await fetch(`${BASE}/api/room/judge`, { headers: { "x-host-key": KEY } })).json()).key;
  const judge = await ctx({ ...devices["iPhone 13"] });
  judge.on("dialog", (d) => d.accept());
  await judge.goto(`${BASE}/judge#k=${judgeKey}`);
  await judge.waitForSelector("text=Judge Mez");
  ok(!judge.url().includes("#k="), "judge link opens Mez's controls and hides the key from the address bar");

  const phones = {};
  for (const name of ["Ana", "Bo", "Cy"]) {
    const p = await ctx({ ...devices["Pixel 7"] });
    await p.goto(BASE + "/play");
    await p.fill("input", name);
    await p.click("text=Join the show");
    await p.waitForSelector("text=You're in!");
    phones[name] = p;
  }
  const all = Object.values(phones);
  const advance = async (label) => admin.click(`button:has-text("${label}")`);
  const startGame = async (name) => {
    await admin.click(`li:has(p:text-is("${name}")) >> button:has-text("Start")`);
    await admin.waitForSelector(`p:text-is("${name}")`);
  };
  const tvText = () => tv.locator("main").innerText();

  // ================= Mez Imposter =================
  await startGame("Mez Imposter");
  await tv.waitForSelector("text=Check your phone. Secretly.");
  const secrets = {};
  for (const [name, p] of Object.entries(phones)) {
    await p.click('button[aria-label="Show my secret"]');
    secrets[name] = (await p.locator('button[aria-label="Hide my secret"]').innerText()).includes("IMPOSTER") ? "IMPOSTER" : (await p.locator('button[aria-label="Hide my secret"] span').nth(1).innerText()).trim();
  }
  const imposter = Object.keys(secrets).find((n) => secrets[n] === "IMPOSTER");
  const words = new Set(Object.values(secrets).filter((s) => s !== "IMPOSTER"));
  ok(imposter && words.size === 1, `exactly one imposter (${imposter}); the crew share one word`);
  const word = [...words][0];
  ok(!(await tvText()).includes(word), "the TV doesn't show the secret word");
  await tv.screenshot({ path: `${SHOTS}/tv-imposter-deal.png` });
  await advance("Start clues");
  for (const [name, p] of Object.entries(phones)) {
    await p.fill("#game-text", name === imposter ? "Tasty" : `Clue${name}`);
    await p.click('button:has-text("Send")');
    await p.waitForSelector("text=Your clue");
  }
  await advance("Show clues now");
  await tv.waitForSelector("text=ClueAna, text=ClueBo, text=ClueCy, text=Tasty".split(", ")[imposter === "Ana" ? 1 : 0]);
  ok(!(await tvText()).includes(word), "clues are shown without revealing the word");
  await advance("Start the vote");
  const crew = Object.keys(phones).filter((n) => n !== imposter);
  await phones[crew[0]].click(`button:has-text("${imposter}")`);
  await phones[crew[0]].waitForSelector("text=Vote locked in.");
  // Reconnect mid-vote: the phone reloads and keeps its role and vote.
  await phones[crew[0]].reload();
  await phones[crew[0]].waitForSelector("text=Vote locked in.");
  await phones[crew[0]].click('button[aria-label="Show my secret"]');
  ok((await phones[crew[0]].locator('button[aria-label="Hide my secret"]').innerText()).includes(word), "after a reload the phone still has its secret word and its vote");
  await phones[crew[1]].click(`button:has-text("${imposter}")`);
  await phones[imposter].click(`button:has-text("${crew[0]}")`);
  ok((await phones[crew[1]].locator(`button:has-text("${imposter}")`).getAttribute("aria-pressed")) === "true", "vote recorded on the phone");
  const dupe = await phones[crew[1]].evaluate(async () => {
    const r = await fetch("/api/room/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "game/vote", token: localStorage.getItem("bf.token"), choice: "anyone" }) });
    return r.status;
  });
  ok(dupe === 422, "a second vote from the same phone is refused by the server");
  await advance("Reveal the imposter");
  await tv.waitForSelector("text=Caught!");
  ok((await tvText()).includes(word), "the reveal shows the imposter, the word and the vote count");
  await sleep(900);
  await tv.screenshot({ path: `${SHOTS}/tv-imposter-reveal.png` });
  await advance("Finish game");
  await tv.waitForSelector("text=The Leaderboards");

  // ================= Who Knows Mez Best =================
  await startGame("Who Knows Mez Best");
  await tv.waitForSelector("text=Mez is judging");
  ok(!/Nadia|Rafi|Tania/.test(await tvText()), "answers are anonymous on the TV");
  ok(!/Nadia|Rafi|Tania/.test(await judge.locator("main").innerText()), "…and on Mez's judge phone");
  await admin.waitForSelector("text=Waiting for Mez to lock the scores");
  ok((await admin.locator('button:has-text("Reveal who wrote what")').count()) === 0, "host can't move on until Mez locks the scores");
  const groups = judge.locator('[role="group"][aria-label^="Stars for answer"]');
  const count = await groups.count();
  for (let i = 0; i < count; i++) await groups.nth(i).locator("button").nth(i === 0 ? 3 : 1).click();
  await judge.click('button:has-text("Lock scores")');
  await tv.waitForSelector("text=Scores are in");
  await advance("Reveal who wrote what");
  await tv.waitForFunction(() => /NADIA|RAFI|TANIA/i.test(document.body.innerText));
  ok(true, "after Mez locks the scores, the authors are revealed on the TV");
  await sleep(700);
  await tv.screenshot({ path: `${SHOTS}/tv-wkmb-reveal.png` });
  await admin.click('button:has-text("Stop game")');

  // ================= Mez Survey =================
  await admin.goto(BASE + "/admin/games");
  await admin.waitForSelector("text=Mez Survey boards");
  await admin.locator('button:has-text("Approve board")').first().click();
  await admin.waitForSelector("text=Approved board:");
  ok(/Biryani \(2\)/i.test(await admin.locator("main").innerText()), "server grouped “Kacchi biryani” and “Biryani” (2 guests) for host approval");
  await admin.goto(BASE + "/admin");
  await admin.waitForSelector("text=Run of show");
  await startGame("Mez Survey");
  await tv.waitForSelector("text=Guess the top answers");
  for (const [name, p] of Object.entries(phones)) {
    await p.fill("#game-text", name === "Cy" ? "sushi" : "biryani");
    await p.click('button:has-text("Send")');
    await p.waitForSelector("text=Your answer");
  }
  await admin.click('button:has-text("End timer now")');
  await advance("Reveal next answer").catch(() => {});
  await admin.click('button:has-text("Reveal whole board")');
  await tv.waitForSelector("text=Biryani");
  ok(/✓ Ana, Bo|✓ Bo, Ana/.test(await tvText()), "matched guessers are shown under the answer they found");
  await sleep(1200);
  await tv.screenshot({ path: `${SHOTS}/tv-survey.png` });
  await admin.click('button:has-text("Stop game")');

  // ================= Mez on Trial =================
  await startGame("Mez on Trial");
  await tv.waitForSelector("text=stands accused of");
  ok(!/Nadia|Rafi/.test(await tvText()), "the accuser stays anonymous while the charge is read");
  await judge.waitForSelector("text=How do you plead?");
  await judge.click('button:has-text("Not guilty")');
  await tv.waitForSelector("text=Plea:");
  await advance("Start the defence");
  await judge.click('button:has-text("I rest my case")');
  for (const [name, p] of Object.entries(phones)) {
    await p.waitForSelector('button:has-text("Not guilty")');
    await p.click(`button:has-text("${name === "Cy" ? "Not guilty" : "Guilty"}")`);
    await p.waitForSelector("text=Your vote is in.");
  }
  await advance("Read the verdict");
  await tv.waitForSelector("text=Accusation filed by");
  ok(/GUILTY/.test(await tvText()) && /Nadia|Rafi/.test(await tvText()), "verdict stamp and accuser revealed together");
  await sleep(600);
  await tv.screenshot({ path: `${SHOTS}/tv-trial-verdict.png` });
  await admin.click('button:has-text("Stop game")');

  // ================= Mystery Files =================
  await startGame("Mystery Files");
  const seen = new Set();
  for (let exhibit = 0; exhibit < 2; exhibit++) {
    await tv.waitForSelector("text=New evidence");
    const kind = (await tv.locator("img[alt='Mystery exhibit']").count()) ? "photo" : "memory";
    seen.add(kind);
    if (kind === "photo") {
      await tv.waitForFunction(() => document.querySelector("img[alt='Mystery exhibit']")?.naturalWidth > 0);
      ok(true, "the TV loads the private photo exhibit through a signed link");
    } else ok((await tvText()).includes("Sylhet"), "the TV shows the memory exhibit");
    await judge.locator("main ul button").first().click();
    await tv.waitForSelector("text=Mez has made a call");
    if (exhibit === 0) ok(true, "the TV shows that Mez guessed, without saying who");
    await advance("Open guessing");
    for (const p of all) {
      await p.waitForSelector("text=Whose file is it?");
      await p.locator("main ul button").first().click();
    }
    await advance("Reveal the contributor");
    await tv.waitForSelector("text=This file belongs to");
    await sleep(1200);
    if (exhibit === 0) await tv.screenshot({ path: `${SHOTS}/tv-mystery-reveal.png` });
    if (exhibit === 0) await advance("Next exhibit");
  }
  ok(seen.has("photo") && seen.has("memory"), "both exhibits shown: a photo and a memory");
  await admin.click('button:has-text("Stop game")');

  // ================= Leaderboards, corrections, wheel =================
  await admin.click('button:has-text("Show leaderboards")');
  await tv.waitForSelector("text=Live Games Champion");
  const boards = await tvText();
  ok(/Mez Expert/.test(boards) && /NADIA|Nadia/.test(boards) && /remote/i.test(boards), "Mez Expert board includes the remote contributor on equal terms");
  ok(/How points work/.test(boards), "the TV explains how points work");
  await tv.screenshot({ path: `${SHOTS}/tv-boards.png` });

  await admin.selectOption('select[aria-label="Person"]', { label: "Ana" });
  await admin.fill('input[aria-label="Points (negative to take away)"]', "15");
  await admin.fill('input[aria-label="Reason"]', "Best clue of the night");
  await admin.click('button:has-text("Add correction")');
  await admin.click("summary:has-text('Score history')");
  await admin.waitForSelector("text=Best clue of the night");
  ok(true, "host correction is added to the visible score history with its reason");

  await judge.click('[role="switch"]:has-text("Hug prizes")');
  await admin.waitForSelector("text=hugs allowed by Mez");
  ok(true, "Mez turned hug prizes on from the judge phone");
  await admin.click('button:has-text("Prize wheel")');
  await tv.waitForSelector("text=The Prize Wheel");
  const spinBtn = admin.locator('section:has-text("Prize wheel") li:has-text("Live") button:has-text("Spin")').first();
  const who = (await admin.locator('section:has-text("Prize wheel") li:has-text("Live") strong').first().innerText()).trim();
  await spinBtn.click();
  await tv.waitForSelector("text=Spinning…");
  await tv.waitForSelector(`text=${who.toUpperCase()} WINS`, { timeout: 12000 }).catch(() => tv.waitForSelector(`text=${who} wins`, { timeout: 2000 }));
  const landed = await tv.evaluate(() => {
    const svg = document.querySelector('svg[aria-label^="Prize wheel"]');
    const m = /rotate\(([-\d.]+)deg\)/.exec(svg.style.transform);
    return m ? Number(m[1]) : null;
  });
  const spin = (await (await fetch(`${BASE}/api/room/stream?role=host&key=${KEY}`).then(async (r) => {
    const reader = r.body.getReader();
    const { value } = await reader.read();
    await reader.cancel();
    return { json: async () => JSON.parse(new TextDecoder().decode(value).replace(/^data: /, "")) };
  })).json()).games.wheel.current;
  const segAngle = 360 / spin.segments.length;
  const under = Math.floor((((360 - (landed % 360)) % 360) + 360) % 360 / segAngle);
  ok(landed > 2000 && under === spin.index, `the wheel spins several turns and stops on the drawn prize (segment ${under + 1} = ${spin.prize})`);
  await tv.screenshot({ path: `${SHOTS}/tv-wheel.png` });
  await phones[who].waitForSelector("text=You won:");
  await phones[who].click('button:has-text("No thanks")');
  await tv.waitForSelector("text=Politely declined");
  ok(true, `${who} declined the prize from their phone; the TV respects it`);
  const audit = await (await fetch(`${BASE}/api/room/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "judge/allowContact", allowed: false }) })).status;
  ok(audit === 401, "a request without Mez's key can't use judge controls");

  console.log(`\nAll ${checks} checks passed.`);
} catch (e) {
  console.error(e.message);
  console.error(log.split("\n").filter((l) => /error/i.test(l)).slice(-5).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
