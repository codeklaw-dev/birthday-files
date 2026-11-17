/**
 * End-to-end test of the guest invite and host moderation, in real browsers.
 *
 *   npm run build && node tests/e2e/invite.mjs
 *
 * Needs Playwright with Chromium, and ffmpeg to generate test videos.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const SHOTS = process.env.SHOTS || path.resolve(".cache/e2e");
mkdirSync(SHOTS, { recursive: true });
const KEY = "e2e-host-key";
const PORT = 3410;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`);
  checks++;
  console.log(`ok  ${msg}`);
};

// Fixtures
const fx = mkdtempSync(path.join(tmpdir(), "bf-fx-"));
const ff = (...args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
ff("-f", "lavfi", "-i", "testsrc=s=2600x1950:d=1", "-frames:v", "1", path.join(fx, "photo.jpg"));
ff("-f", "lavfi", "-i", "color=c=orange:s=320x240:d=16", "-f", "lavfi", "-i", "sine=d=16", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(fx, "ok.mp4"));
ff("-f", "lavfi", "-i", "color=c=blue:s=320x240:d=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(fx, "short.mp4"));

const dataDir = mkdtempSync(path.join(tmpdir(), "bf-invite-e2e-"));
const env = { ...process.env, HOST_KEY: KEY, INVITE_DATA_DIR: dataDir, ROOM_PERSIST: "off", HOST_TTS_CHAIN: "mock", HOST_LLM_CHAIN: "mock", HOST_STT_CHAIN: "mock" };
function start() {
  const proc = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  return {
    async ready() {
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch(`${BASE}/invite`)).ok) return;
        } catch {}
        await sleep(500);
      }
      throw new Error(`server did not start:\n${log}`);
    },
    async stop() {
      if (proc.exitCode !== null) return;
      const exited = new Promise((r) => proc.once("exit", r));
      proc.kill("SIGTERM");
      await Promise.race([exited, sleep(5000).then(() => proc.kill("SIGKILL"))]);
    },
  };
}

const api = (p, init = {}) => fetch(BASE + p, init);
const createViaApi = (body) =>
  api("/api/invite/submissions", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.1` }, body: JSON.stringify(body) }).then((r) => r.json());

let server = start();
await server.ready();
const browser = await chromium.launch();
try {
  const phone = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await phone.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("dialog", (d) => d.accept());

  // ---- Landing ----
  await page.goto(BASE + "/");
  await page.waitForURL("**/invite");
  await page.waitForSelector("text=turns");
  const landing = await page.locator("main").innerText();
  ok(/24/.test(landing) && /21 November 2026/.test(landing), "root address opens the invitation for Mez's 24th on 21 November 2026");
  ok(!/\bAI\b|artificial|robot|Inspector Byte/i.test(landing), "the invitation keeps the AI host a surprise");
  const meta = await page.locator('meta[name="description"]').getAttribute("content");
  ok(!/\bAI\b/i.test(meta), "link-preview description doesn't mention AI either");
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no sideways scrolling on a phone");
  await page.screenshot({ path: `${SHOTS}/invite-landing.png`, fullPage: true });

  const t0 = Date.now();
  await page.click("text=RSVP now");

  // ---- Step 1 ----
  await page.click('button:has-text("Next")');
  await page.waitForSelector("text=Please tell us your name.");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-invalid") === "true", null, { timeout: 2000 });
  ok(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === null && document.activeElement?.id !== ""), "missing name is flagged and the field is focused");
  await page.getByLabel("Your name").fill("Nadia Rahman");
  await page.click("label:has-text('Best friend')");
  await page.click("label:has-text(\"Can't come, but I want to take part\")");
  await page.click("summary:has-text('Prize preferences')");
  await page.getByLabel("Prize you'd enjoy").selectOption("sweet");
  await page.screenshot({ path: `${SHOTS}/invite-step1.png`, fullPage: true });
  await page.click('button:has-text("Next")');

  // ---- Step 2 ----
  await page.click('button:has-text("Next")');
  await page.waitForSelector("text=A quick answer, please");
  ok((await page.locator("text=A quick answer, please").count()) === 3, "the three questions are required for remote participants");
  const inputs = page.locator('input[type="text"]');
  await inputs.nth(0).fill("Kacchi biryani");
  await inputs.nth(1).fill("Anything by Arijit Singh");
  await inputs.nth(2).fill("Winning arguments");
  await page.getByLabel(/favourite memory/).fill("Getting lost in Sylhet and finding the best tea stall in the world.");
  await page.getByLabel(/stands accused of/).fill("Eating the last samosa and blaming the cat");
  await page.click('button:has-text("Next")');

  // ---- Step 3 ----
  await page.setInputFiles('input[aria-label="Choose a photo"]', path.join(fx, "photo.jpg"));
  await page.waitForSelector('img[alt="Your photo"]');
  ok(true, "photo is prepared in the browser and previewed");
  await page.setInputFiles('input[aria-label="Record or choose a video"]', path.join(fx, "short.mp4"));
  await page.waitForSelector("text=This one is 5 seconds");
  ok(true, "a 5-second video is refused before upload");
  await page.setInputFiles('input[aria-label="Record or choose a video"]', path.join(fx, "ok.mp4"));
  await page.waitForSelector("video");
  await page.click("text=You can show my answers, photo and video at the party.");
  await page.screenshot({ path: `${SHOTS}/invite-step3.png`, fullPage: true });
  await page.click('button:has-text("Next")');

  // ---- Review & send ----
  await page.waitForSelector("text=Ready to file?");
  ok((await page.locator("dl").innerText()).includes("Kacchi biryani"), "review shows the answers before sending");
  await page.click('button:has-text("Send my RSVP")');
  await page.waitForSelector("text=You're part of the show", { timeout: 30000 });
  const seconds = Math.round((Date.now() - t0) / 1000);
  ok(true, `remote RSVP with photo and video filed (automated run: ${seconds}s)`);
  const done = await page.locator("main").innerText();
  ok(/Photo ✓/.test(done) && /Video ✓/.test(done) && /OK to show/.test(done), "success screen confirms photo, video and permission");
  const editLink = await page.getByLabel("Private edit link").inputValue();
  ok(/\/invite#edit=[A-Za-z0-9_-]{32}$/.test(editLink), "a private edit link is shown (token in the # fragment)");
  ok((await page.evaluate(() => localStorage.getItem("bf.invite.draft"))) === null, "the local draft is cleared after sending");
  await page.screenshot({ path: `${SHOTS}/invite-done.png`, fullPage: true });

  // ---- Files are private ----
  const files = readdirSync(path.join(dataDir, "media"));
  ok(files.length === 2, "photo and video stored in the private data folder");
  const mediaId = files[0].split(".")[0];
  ok((await api(`/api/invite/media/file/${mediaId}`)).status === 403, "media can't be fetched without a signed link");
  ok((await api("/.data/invite/invite.json")).status === 404 && (await api(`/media/${files[0]}`)).status === 404, "data folder is not served publicly");
  ok((await api("/api/invite/admin")).status === 401, "the guest list needs the host key");
  ok((await api("/api/invite/submissions/me")).status === 401, "own-submission API needs the edit token");

  // ---- Edit from another device with the private link ----
  const other = await browser.newContext({ ...devices["Pixel 7"] });
  const p2 = await other.newPage();
  p2.on("dialog", (d) => d.accept());
  await p2.goto(editLink);
  await p2.waitForSelector("text=Your RSVP");
  ok((await p2.getByLabel("Your name").inputValue()) === "Nadia Rahman", "edit link opens the guest's own answers on another device");
  ok(!p2.url().includes("#edit="), "the token is removed from the address bar after opening");
  await p2.click('button:has-text("Next")');
  await p2.getByLabel(/stands accused of/).fill("Stealing every last fuchka");
  await p2.click('button:has-text("Next")');
  await p2.waitForSelector('img[alt="Your photo"]');
  ok(true, "the guest sees their own uploaded photo when editing");
  await p2.click('button:has-text("Next")');
  await p2.click('button:has-text("Save changes")');
  await p2.waitForSelector("text=You're part of the show");
  ok(true, "the guest saved changes from the edit link");

  // ---- Host moderation ----
  const consented = await createViaApi({ name: "Rafi", relationship: "Family", rsvp: "yes", answers: { q1: "Fuchka", q2: "Coke Studio", q3: "Singing" }, consent: true });
  await createViaApi({ name: "Private Aunt", relationship: "Family", rsvp: "no", consent: false });
  const laptop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const admin = await laptop.newPage();
  admin.on("dialog", (d) => d.accept());
  await admin.goto(BASE + "/admin/submissions");
  await admin.fill("input[type=password]", KEY);
  await admin.click("text=Unlock");
  await admin.waitForSelector("text=Guest submissions >> nth=0").catch(() => {});
  await admin.waitForSelector("text=Nadia Rahman");
  const stats = await admin.locator("dl").first().innerText();
  ok(/Remote\s*1/i.test(stats) && /^Coming\s*1/im.test(stats) && /Not coming\s*1/i.test(stats), "dashboard counts RSVPs including remote contributors");
  await admin.click("button:has-text('Nadia Rahman')");
  await admin.waitForFunction(() => {
    const img = document.querySelector('img[alt^="Photo from"]');
    return img && img.complete && img.naturalWidth > 0;
  });
  ok(true, "host previews the private photo through a signed link");
  const photoW = await admin.locator('img[alt^="Photo from"]').evaluate((i) => i.naturalWidth);
  ok(photoW === 2000, `2600px photo was resized in the browser before upload (${photoW}px wide)`);
  await admin.waitForFunction(() => {
    const v = document.querySelector("#detail video");
    return v && v.readyState >= 1 && Math.round(v.duration) === 16;
  });
  ok(true, "host previews the 16-second video (seekable via range requests)");
  await admin.click("#detail button:has-text('Approve')");
  await admin.waitForSelector("#detail >> text=approved");
  await admin.click("#detail button:has-text('Honourable mention')");
  await admin.waitForSelector("#detail button[aria-pressed=true]:has-text('Honourable mention')");
  await admin.click("#detail button:has-text('+ funny')");
  await admin.waitForSelector("button[aria-label='Remove tag funny']");
  await admin.screenshot({ path: `${SHOTS}/admin-submissions.png`, fullPage: true });

  await admin.click("[role=tab]:has-text('All')");
  await admin.click("button:has-text('Rafi')");
  await admin.click("#detail button:has-text('Approve')");
  await admin.waitForSelector("#detail >> text=approved");
  await admin.click("[role=tab]:has-text('All')");
  await admin.click("button:has-text('Private Aunt')");
  await admin.waitForSelector("text=did not give permission");
  await admin.click("#detail button:has-text('Approve')");
  await admin.waitForSelector("#detail >> text=approved");
  await admin.click("[role=tab]:has-text('Running order')");
  await admin.waitForSelector("text=#2", { timeout: 8000 }).catch(async () => {
    const l = await (await api("/api/invite/admin", { headers: { "x-host-key": KEY } })).json();
    console.log("    state:", JSON.stringify(l.submissions.map((s) => [s.data.name, s.moderation.status, s.moderation.order, s.showable])));
    await admin.screenshot({ path: `${SHOTS}/debug-order.png`, fullPage: true });
    throw new Error("running order did not show two entries");
  });
  const orderText = async () => (await admin.locator("section[aria-label=Submissions]").innerText()).replace(/\s+/g, " ");
  let order = await orderText();
  ok(order.indexOf("Nadia") < order.indexOf("Rafi") && !order.includes("Private Aunt"), "running order holds only approved submissions with permission");
  await admin.click("button[aria-label='Move Nadia Rahman down']");
  await admin.waitForFunction(() => {
    const t = document.querySelector("section[aria-label=Submissions]").innerText;
    return t.indexOf("Rafi") < t.indexOf("Nadia");
  });
  ok(true, "host reorders the running order");
  await admin.click("[role=tab]:has-text('Honourable')");
  ok((await orderText()).includes("Nadia"), "honourable mentions filter works");

  // Editing after approval sends it back for review.
  const t = editLink.split("#edit=")[1];
  const mine = await (await api("/api/invite/submissions/me", { headers: { "x-edit-token": t } })).json();
  await api("/api/invite/submissions/me", { method: "PUT", headers: { "x-edit-token": t, "Content-Type": "application/json" }, body: JSON.stringify({ ...mine.submission.data, memory: "Edited after approval" }) });
  await admin.click("[role=tab]:has-text('To review')");
  await admin.click("button[aria-label='Refresh']");
  await admin.waitForSelector("text=edited since review");
  ok(true, "a guest edit after approval returns the submission for review");

  // ---- Restart: nothing lost ----
  await server.stop();
  server = start();
  await server.ready();
  const list = await (await api("/api/invite/admin", { headers: { "x-host-key": KEY } })).json();
  ok(list.submissions.length === 3 && list.submissions.some((s) => s.photo && s.video), "submissions and files survive a server restart");

  // ---- Withdraw ----
  await p2.goto(BASE + "/invite");
  await p2.click("text=Edit my RSVP");
  await p2.click("text=Withdraw my RSVP and delete everything");
  await p2.waitForSelector("text=Withdrawn");
  ok(readdirSync(path.join(dataDir, "media")).length === 0, "withdrawing deletes the guest's photo and video");
  const after = await (await api("/api/invite/admin", { headers: { "x-host-key": KEY } })).json();
  ok(!after.submissions.some((s) => s.data.name === "Nadia Rahman"), "withdrawn RSVP is gone from the host's list");
  void consented;

  console.log(`\nAll ${checks} checks passed.`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.stop();
}
