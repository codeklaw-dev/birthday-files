import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";

// Fresh, private data for this file (set before the stores load).
process.env.INVITE_DATA_DIR = mkdtempSync(path.join(tmpdir(), "bf-games-api-"));
process.env.ROOM_PERSIST = "off";
process.env.HOST_KEY = "host-key-for-tests";
process.env.HOST_TTS_CHAIN = "mock";

const { POST: action } = await import("@/app/api/room/action/route");
const { GET: stream } = await import("@/app/api/room/stream/route");
const { POST: rotate } = await import("@/app/api/room/judge/route");
const { inviteStore } = await import("@/lib/invite/server/store");
const { roomStore } = await import("@/lib/server/room-store");
const { EMPTY_FORM } = await import("@/lib/invite/schema");

const HOST = { "x-host-key": "host-key-for-tests" };
let ipN = 0;
const send = (body: unknown, headers: Record<string, string> = {}) =>
  action(new Request("http://x/api/room/action", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++ipN % 250}`, ...headers }, body: JSON.stringify(body) }));
const judge = () => ({ "x-judge-key": roomStore.judgeKey() });

async function firstView(query: string) {
  const res = await stream(new NextRequest(`http://x/api/room/stream?${query}`));
  if (res.status !== 200) return { status: res.status, view: null };
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  const text = new TextDecoder().decode(value);
  return { status: 200, view: JSON.parse(text.replace(/^data: /, "").trim()) };
}

function submit(name: string, opts: { rsvp?: "yes" | "remote" | "no"; consent?: boolean; approve?: boolean; q1?: string; accusation?: string; memory?: string }) {
  const store = inviteStore();
  const { submission } = store.create({
    ...EMPTY_FORM,
    name,
    rsvp: opts.rsvp ?? "yes",
    consent: opts.consent ?? true,
    answers: { q1: opts.q1 ?? "Biryani", q2: "Song", q3: "Talent" },
    accusation: opts.accusation ?? "",
    memory: opts.memory ?? "",
  });
  if (opts.approve !== false) store.moderate(submission.id, { status: "approved" });
  return submission.id;
}

beforeAll(() => {
  submit("Nadia", { rsvp: "remote", q1: "Kacchi biryani", accusation: "stealing fuchka", memory: "Sylhet trip" });
  submit("Rafi", { q1: "biryani!", accusation: "always being late" });
  submit("Private", { consent: false, q1: "SECRET-NO-CONSENT" });
  submit("Unreviewed", { approve: false, q1: "SECRET-PENDING" });
  submit("Absent", { rsvp: "no", q1: "SECRET-NOT-COMING" });
});

describe("who may send what", () => {
  it("requires Mez's judge key for judge actions", async () => {
    expect((await send({ type: "judge/lock" })).status).toBe(401);
    expect((await send({ type: "judge/lock" }, { "x-judge-key": "guess" })).status).toBe(401);
    expect((await send({ type: "judge/allowContact", allowed: true }, HOST)).status).toBe(401); // host key isn't a judge key
    const ok = await send({ type: "judge/lock" }, judge());
    expect(ok.status).toBe(422); // allowed through; refused only because no game is running
  });

  it("keeps host actions and timers away from phones", async () => {
    expect((await send({ type: "host/game/start", game: "imposter" })).status).toBe(401);
    expect((await send({ type: "host/correct", board: "live", subject: { kind: "player", id: "x" }, delta: 500, reason: "lol" }, judge())).status).toBe(401);
    expect((await send({ type: "system/gameTimeUp", roundId: "x", step: "vote" }, HOST)).status).toBe(403);
  });

  it("signs the old judge phone out when the key is rotated", async () => {
    const old = roomStore.judgeKey();
    await rotate(new Request("http://x/api/room/judge", { method: "POST", headers: HOST }));
    expect((await send({ type: "judge/lock" }, { "x-judge-key": old })).status).toBe(401);
    expect((await firstView(`role=judge&key=${old}`)).status).toBe(401);
    expect((await firstView(`role=judge&key=${roomStore.judgeKey()}`)).status).toBe(200);
  });
});

describe("game content comes only from approved, consented submissions", () => {
  it("ignores content sent by a client and excludes private, unreviewed and absent guests", async () => {
    const fake = { game: "wkmb", content: { questions: [{ id: "q1", prompt: "Fake", answers: [{ contributor: { id: "x", name: "Hacker", remote: false }, text: "INJECTED" }] }] } };
    expect((await send({ type: "host/game/start", game: "wkmb", content: fake }, HOST)).status).toBe(200);
    const json = JSON.stringify(roomStore.getState().game);
    expect(json).not.toContain("INJECTED");
    expect(json).toContain("Kacchi biryani");
    expect(json).not.toMatch(/SECRET-/);
    // Authors are hidden from the TV until reveal.
    const tv = (await firstView("role=display")).view;
    expect(JSON.stringify(tv.games)).not.toMatch(/Nadia|Rafi/);
    expect((await send({ type: "host/game/abort" }, HOST)).status).toBe(200);
  });

  it("recomputes survey counts on the server so they can't be inflated", async () => {
    const ids = inviteStore().list().filter((s) => s.data.name === "Nadia" || s.data.name === "Rafi").map((s) => s.id);
    const res = await send({ type: "host/setup/survey", questionId: "q1", groups: [{ label: "Biryani", members: [...ids, ...ids, "made-up-id", "made-up-2"] }] }, HOST);
    expect(res.status).toBe(200);
    expect(roomStore.getState().setup.survey.q1.answers).toEqual([{ label: "Biryani", count: 2, aliases: ["Kacchi biryani", "biryani!"] }]);
    expect(roomStore.getState().setup.survey.q1.respondents).toBe(2);
  });

  it("gives the TV a signed link to exhibit media but never the phones", async () => {
    const store = inviteStore();
    const nadia = store.list().find((s) => s.data.name === "Nadia")!;
    const token = "A".repeat(32);
    void token;
    // attach a photo record directly (upload path is covered by the invite tests)
    nadia.photo = { id: "11111111-1111-1111-1111-111111111111", kind: "photo", mime: "image/png", ext: "png", bytes: 1, uploadedAt: 0 };
    nadia.data.memory = "";
    const rafi = store.list().find((s) => s.data.name === "Rafi")!;
    rafi.data.memory = "";
    expect((await send({ type: "host/game/start", game: "mystery" }, HOST)).status).toBe(200);
    const tv = (await firstView("role=display")).view;
    expect(tv.games.game.exhibit.mediaUrl).toMatch(/^\/api\/invite\/media\/file\/11111111-1111-1111-1111-111111111111\?exp=\d+&sig=/);
    await send({ type: "join", token: "token-phone-1", name: "Phone", avatar: "🎈" });
    const phone = (await firstView("role=player&token=token-phone-1")).view;
    expect(phone.games.game.exhibit.mediaUrl).toBeNull();
    expect((await send({ type: "host/game/abort" }, HOST)).status).toBe(200);
  });

  it("names contributors in corrections from the guest list, not from the request", async () => {
    const nadia = inviteStore().list().find((s) => s.data.name === "Nadia")!;
    const res = await send({ type: "host/correct", board: "expert", subject: { kind: "contributor", id: nadia.id, name: "Someone Else" }, delta: 20, reason: "Late answer counted" }, HOST);
    expect(res.status).toBe(200);
    expect(roomStore.getState().ledger.at(-1)!.subject).toEqual({ kind: "contributor", id: nadia.id, name: "Nadia", remote: true });
    expect((await send({ type: "host/correct", board: "expert", subject: { kind: "contributor", id: "ghost" }, delta: 20, reason: "x y z" }, HOST)).status).toBe(422);
  });
});

describe("server randomness", () => {
  it("is uniform in [0, 1)", async () => {
    const { secureRandom } = await import("@/lib/server/room-store");
    const xs = Array.from({ length: 20000 }, secureRandom);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.01);
  });
});
