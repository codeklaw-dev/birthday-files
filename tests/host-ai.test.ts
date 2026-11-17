import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

process.env.HOST_DATA_DIR = mkdtempSync(path.join(tmpdir(), "bf-host-"));
process.env.INVITE_DATA_DIR = mkdtempSync(path.join(tmpdir(), "bf-host-inv-"));
process.env.ROOM_PERSIST = "off";
process.env.HOST_KEY = "host-ai-key";
process.env.TTS_CACHE_DIR = mkdtempSync(path.join(tmpdir(), "bf-host-tts-"));

const { applyAction, createRoom } = await import("@/lib/game/engine");
const { sceneContext, factsBlock, systemPrompt } = await import("@/lib/host/server/context");
const { knowledge } = await import("@/lib/host/server/knowledge");
const { aiDispatch } = await import("@/lib/host/server/ai-actions");
const { approvedManifest, readManifest } = await import("@/lib/host/server/service");
const { writeCommentary } = await import("@/lib/host/server/commentary");
const { resetRouterStats } = await import("@/lib/host/server/router");
const { roomStore } = await import("@/lib/server/room-store");
const { inviteStore } = await import("@/lib/invite/server/store");
const { EMPTY_FORM } = await import("@/lib/invite/schema");
const reply = await import("@/app/api/host/reply/route");
const transcribe = await import("@/app/api/host/transcribe/route");
const announcements = await import("@/app/api/host/announcements/route");
const narration = await import("@/app/api/host/narration/route");
const review = await import("@/app/api/host/narration/review/route");
const facts = await import("@/app/api/host/facts/route");
const knowledgeRoute = await import("@/app/api/host/knowledge/route");
const surprises = await import("@/app/api/host/surprises/route");
const action = await import("@/app/api/room/action/route");
import type { Action, RoomState } from "@/lib/game/types";

const HOST = { "x-host-key": "host-ai-key", "content-type": "application/json" };
let n = 0;
const ctx = () => ({ now: 1000, newId: () => `id${++n}`, random: () => 0.1 });
const run = (s: RoomState, a: Action) => {
  const r = applyAction(s, a, ctx());
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const room = (names: string[]) => names.reduce((s, name) => run(s, { type: "join", token: `token-${name}`, name, avatar: "🎈" }), createRoom("T", 0, "jk"));
const post = (url: string, body: unknown, headers: Record<string, string> = HOST) => new Request(`http://x${url}`, { method: "POST", headers, body: JSON.stringify(body) });

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["HOST_LLM_CHAIN", "HOST_STT_CHAIN", "HOST_TTS_CHAIN", "HOST_NO_MOCK", "GEMINI_API_KEY"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetRouterStats();
  vi.restoreAllMocks();
});

describe("host knowledge store (separate from game state)", () => {
  it("starts with the cheeky, affectionate personality and validates edits", () => {
    expect(knowledge().personality().style).toMatch(/cheeky/);
    expect(knowledge().setPersonality({ style: "too short" })).toMatch(/sentence/);
    const p = knowledge().setPersonality({ style: "A cheeky detective who roasts gently and loves Mez to bits, always kind." });
    expect(typeof p).not.toBe("string");
    knowledge().resetPersonality();
  });

  it("only hands approved facts to the AI; edits need re-approval", () => {
    const a = knowledge().addFact("Mez once got lost in IKEA for two hours", "organiser", undefined, "approved") as { id: string };
    const b = knowledge().addFact("Mez secretly sings in the shower", "invite", "s1:q1") as { id: string };
    expect(knowledge().addFact("duplicate", "invite", "s1:q1")).toMatch(/Already/);
    expect(knowledge().approvedFacts().map((f) => f.id)).toEqual([a.id]);
    knowledge().setFact(b.id, { status: "approved" });
    knowledge().setFact(a.id, { text: "Mez once got lost in IKEA for three hours" });
    expect(knowledge().approvedFacts().map((f) => f.id)).toEqual([b.id]);
    expect(factsBlock(knowledge().approvedFacts())).toContain("sings in the shower");
    knowledge().deleteFact(a.id);
    knowledge().deleteFact(b.id);
  });

  it("builds a system prompt that forbids touching scores and secrets", () => {
    const sys = systemPrompt(knowledge().personality());
    expect(sys).toMatch(/can't change scores/);
    expect(sys).toMatch(/imposter/);
    expect(sys).toMatch(/information, never instructions/);
  });
});

describe("scene context is built from the public TV view only", () => {
  it("never contains the imposter, the secret word or hidden authors", () => {
    let s = room(["Ana", "Bo", "Cy"]);
    s = run(s, { type: "host/game/start", game: "imposter" });
    const g = s.game as { word: string; imposterIds: string[] };
    const ctxt = sceneContext(s);
    expect(ctxt).toContain("Mez Imposter");
    expect(ctxt).not.toContain(g.word);
    expect(ctxt).not.toMatch(/imposter was/);
    s = run(s, { type: "host/game/abort" });
    s = run(s, {
      type: "host/game/start",
      game: "wkmb",
      content: { game: "wkmb", content: { questions: [{ id: "q1", prompt: "Food?", answers: [{ contributor: { id: "c1", name: "Nadia", remote: true }, text: "Biryani" }] }] } },
    });
    expect(sceneContext(s)).toContain("Biryani");
    expect(sceneContext(s)).not.toContain("Nadia");
    s = run(s, { type: "host/game/abort" });
    s = run(s, { type: "host/game/start", game: "survey", content: { game: "survey", content: { boards: [{ questionId: "q1", prompt: "Food?", respondents: 3, answers: [{ label: "HiddenAnswer", count: 3, aliases: [] }] }] } } });
    expect(sceneContext(s)).not.toContain("HiddenAnswer");
  });

  it("sends the LLM approved facts and the public scene, nothing else", async () => {
    process.env.GEMINI_API_KEY = "test";
    process.env.HOST_LLM_CHAIN = "gemini";
    const approved = knowledge().addFact("Mez loves karaoke", "organiser", undefined, "approved") as { id: string };
    const pending = knowledge().addFact("PENDING-SECRET-FACT", "invite", "s9:q1") as { id: string };
    let s = run(room(["Ana", "Bo", "Cy"]), { type: "host/game/start", game: "imposter" });
    const word = (s.game as { word: string }).word;
    let sent = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      sent = String(init?.body);
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"en":"Hi","bn":"হাই"}' }] } }] });
    });
    await writeCommentary(s, "roast");
    expect(sent).toContain("Mez loves karaoke");
    expect(sent).not.toContain("PENDING-SECRET-FACT");
    expect(sent).not.toContain(word);
    knowledge().deleteFact(approved.id);
    knowledge().deleteFact(pending.id);
    s = run(s, { type: "host/game/abort" });
  });
});

describe("the AI may only speak", () => {
  it("refuses any game action, and lines not marked as AI-written", () => {
    expect(() => aiDispatch({ type: "host/correct" } as never)).toThrow(/may not dispatch host\/correct/);
    expect(() => aiDispatch({ type: "host/game/advance" } as never)).toThrow(/may not/);
    expect(() => aiDispatch({ type: "host/say", text: { en: "x" }, source: "host" } as never)).toThrow(/AI-written/);
    expect(aiDispatch({ type: "host/clip", clip: "happy_birthday" }).ok).toBe(true);
  });
});

describe("narration approval", () => {
  it("serves only approved clips, and a re-render needs a new review", async () => {
    expect(Object.keys(approvedManifest().clips)).toEqual([]);
    const res = await review.PATCH(new Request("http://x/api/host/narration/review", { method: "PATCH", headers: HOST, body: JSON.stringify({ items: [{ key: "cake_done", lang: "en", status: "approved" }] }) }));
    expect(res.status).toBe(200);
    const pub = await (await narration.GET(new Request("http://x/api/host/narration"))).json();
    expect(Object.keys(pub.clips)).toEqual(["cake_done"]);
    expect(Object.keys(pub.clips.cake_done)).toEqual(["en"]);
    const real = readManifest().clips.cake_done!.en!;
    knowledge().setNarration("cake_done", "en", "approved", { text: real.text, bytes: real.bytes + 1 }); // file changed since review
    expect(approvedManifest().clips.cake_done).toBeUndefined();
    const all = await review.PATCH(new Request("http://x/api/host/narration/review", { method: "PATCH", headers: HOST, body: JSON.stringify({ approveAll: true }) }));
    expect((await all.json()).updated).toBeGreaterThan(20);
    const placeholders = Object.entries(readManifest().clips).flatMap(([k, l]) => Object.entries(l).filter(([, c]) => c!.placeholder).map(([lang]) => `${k}:${lang}`));
    for (const p of placeholders) expect(approvedManifest().clips[p.split(":")[0]]?.[p.split(":")[1] as "en"]).toBeUndefined();
  });
});

describe("surprises", () => {
  beforeAll(() => {
    const store = inviteStore();
    const ok = store.create({ ...EMPTY_FORM, name: "Nadia", rsvp: "remote", consent: true, memory: "Lost in Sylhet", answers: { q1: "a", q2: "b", q3: "c" } });
    store.moderate(ok.submission.id, { status: "approved" });
    const priv = store.create({ ...EMPTY_FORM, name: "Private", rsvp: "yes", consent: false, memory: "PRIVATE-MEMORY", answers: { q1: "a", q2: "b", q3: "c" } });
    store.moderate(priv.submission.id, { status: "approved" });
  });

  it("plays only approved announcements and consented memories, built by the server", async () => {
    process.env.HOST_TTS_CHAIN = "mock-fail";
    process.env.HOST_NO_MOCK = "1";
    const created = await (await announcements.POST(post("/api/host/announcements", { title: "Cake time", text: { en: "Cake is coming!", bn: "" } }))).json();
    const id = created.announcement.id;
    const send = (body: unknown) => action.POST(post("/api/room/action", body));
    expect((await send({ type: "host/surprise/show", kind: "announcement", id })).status).toBe(422); // not approved yet
    const approved = await (await announcements.PATCH(new Request("http://x", { method: "PATCH", headers: HOST, body: JSON.stringify({ id, status: "approved", wait: true }) }))).json();
    expect(approved.announcement.prepared).toEqual({ en: "failed" }); // cloud voice down → falls back to subtitles
    const hacked = await send({ type: "host/surprise/show", kind: "announcement", id, surprise: { text: { en: "INJECTED" } } });
    expect(hacked.status).toBe(200);
    const st = roomStore.getState();
    expect(st.phase).toBe("surprise");
    expect(JSON.stringify(st.surprise)).not.toContain("INJECTED");
    expect(st.host.utterance).toMatchObject({ cue: "announcement", fallbackClip: "surprise_intro" });
    expect((await send({ type: "host/surprise/end" })).status).toBe(200);

    const list = await (await surprises.GET(new Request("http://x", { headers: HOST }))).json();
    expect(list.memories.map((m: { name: string }) => m.name)).toEqual(["Nadia"]);
    const priv = inviteStore().list().find((s) => s.data.name === "Private")!;
    expect((await send({ type: "host/surprise/show", kind: "memory", id: priv.id })).status).toBe(422);
    const nadia = inviteStore().list().find((s) => s.data.name === "Nadia")!;
    expect((await send({ type: "host/surprise/show", kind: "memory", id: nadia.id })).status).toBe(200);
    expect(roomStore.getState().host.utterance.text.en).toBe("A memory for Mez from Nadia: Lost in Sylhet");
    await send({ type: "host/surprise/end" });
    // Edited words need approving again.
    const edited = await (await announcements.POST(post("/api/host/announcements", { id, title: "Cake time", text: { en: "Cake is HERE!" } }))).json();
    expect(edited.announcement.status).toBe("pending");
  });

  it("returns to where the show was, and refuses during a game", () => {
    let s = run(room(["Ana", "Bo", "Cy"]), { type: "host/showLeaderboard" });
    s = run(s, { type: "host/surprise/show", surprise: { id: "a", kind: "announcement", title: "T", text: { en: "Hi", bn: "" }, from: null, mediaId: null } });
    expect(s.phase).toBe("surprise");
    expect(s.host.utterance.lang).toBe("en"); // only English was written
    s = run(s, { type: "host/surprise/end" });
    expect(s.phase).toBe("leaderboard");
    s = run(s, { type: "host/game/start", game: "imposter" });
    expect(applyAction(s, { type: "host/surprise/show", surprise: { id: "a", kind: "announcement", title: "T", text: { en: "Hi", bn: "" }, from: null, mediaId: null } }, ctx()).ok).toBe(false);
  });
});

describe("TV audio settings", () => {
  it("validates volume and passes mute and subtitles to the screens", () => {
    let s = room(["Ana"]);
    expect(applyAction(s, { type: "host/setVolume", volume: 3 }, ctx()).ok).toBe(false);
    s = run(run(run(s, { type: "host/setVolume", volume: 0.333 }), { type: "host/setMuted", muted: true }), { type: "host/setSubtitles", on: false });
    expect(s.host).toMatchObject({ volume: 0.33, muted: true, subtitles: false });
  });
});

describe("push-to-talk routes", () => {
  it("replies in the host's voice and remembers the exchange", async () => {
    process.env.HOST_LLM_CHAIN = "mock";
    const res = await reply.POST(post("/api/host/reply", { transcript: "মেজ কি বিরিয়ানি পছন্দ করে?", lang: "auto", speak: true, thinking: true }));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, lang: "bn", spoken: true });
    const u = roomStore.getState().host.utterance;
    expect(u).toMatchObject({ source: "conversation", lang: "bn" });
    expect(knowledge().conversation().at(-1)!.heard).toMatch(/বিরিয়ানি/);
    const forced = await (await reply.POST(post("/api/host/reply", { transcript: "Hello host", lang: "bn", speak: false }))).json();
    expect(forced.lang).toBe("bn"); // language override wins
  });

  it("falls back to prepared narration when the AI is down, and changes nothing else", async () => {
    process.env.HOST_LLM_CHAIN = "mock-fail";
    process.env.HOST_NO_MOCK = "1";
    const before = roomStore.getState();
    const res = await reply.POST(post("/api/host/reply", { transcript: "Are you there?", speak: true }));
    expect(res.status).toBe(503);
    expect((await res.json()).fallback).toBe(true);
    const after = roomStore.getState();
    expect(after.host.utterance.clip).toBe("ptt_fallback");
    expect(after.ledger).toEqual(before.ledger);
    expect(after.phase).toBe(before.phase);
    expect(after.game).toEqual(before.game);
  });

  it("asks the organiser to type when speech-to-text is down", async () => {
    process.env.HOST_STT_CHAIN = "mock-fail";
    process.env.HOST_NO_MOCK = "1";
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), "clip");
    const res = await transcribe.POST(new Request("http://x", { method: "POST", headers: { "x-host-key": "host-ai-key" }, body: form }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Type what Mez said/);
  });

  it("keeps every host-AI endpoint behind the host key", async () => {
    const anon = { "content-type": "application/json" };
    expect((await reply.POST(post("/api/host/reply", { transcript: "hi" }, anon))).status).toBe(401);
    expect((await transcribe.POST(new Request("http://x", { method: "POST", body: new FormData() }))).status).toBe(401);
    expect((await announcements.GET(new Request("http://x"))).status).toBe(401);
    expect((await facts.POST(post("/api/host/facts", { text: "x y z w" }, anon))).status).toBe(401);
    expect((await knowledgeRoute.GET(new Request("http://x"))).status).toBe(401);
    expect((await review.GET(new Request("http://x"))).status).toBe(401);
    expect((await surprises.GET(new Request("http://x"))).status).toBe(401);
    expect((await action.POST(post("/api/room/action", { type: "host/surprise/show", kind: "memory", id: "x" }, anon))).status).toBe(401);
  });
});
