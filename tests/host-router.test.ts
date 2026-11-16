import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoom, applyAction } from "@/lib/game/engine";
import type { RoomState } from "@/lib/game/types";
import { writeCommentary, writeReply } from "@/lib/host/server/commentary";
import { AllProvidersFailed, providerStatus, resetRouterStats, routeLlm, routeTts } from "@/lib/host/server/router";
import { CLIPS } from "@/lib/host/script";

const saved = { ...process.env };
beforeEach(() => {
  resetRouterStats();
  for (const k of ["GEMINI_API_KEY", "GROQ_API_KEY", "AZURE_SPEECH_KEY", "CLOUDFLARE_API_TOKEN", "HOST_NO_MOCK", "HOST_TTS_CHAIN", "HOST_LLM_CHAIN"]) delete process.env[k];
});
afterEach(() => {
  process.env = { ...saved };
});

describe("TTS failover", () => {
  it("skips unconfigured providers and lands on the mock", async () => {
    const r = await routeTts("hello", "en");
    expect(r.provider).toBe("mock");
    expect(r.value.mime).toBe("audio/wav");
    expect(r.attempts.filter((a) => a.skipped === "not configured").map((a) => a.provider)).toEqual(["gemini", "azure"]);
  });

  it("fails over from a broken provider", async () => {
    process.env.HOST_TTS_CHAIN = "mock-fail,mock";
    const r = await routeTts("hello", "en");
    expect(r.provider).toBe("mock");
    expect(r.attempts[0]).toMatchObject({ provider: "mock-fail", ok: false, error: expect.stringContaining("simulated outage") });
  });

  it("times out a slow provider and moves on", async () => {
    process.env.HOST_TTS_CHAIN = "mock-slow,mock";
    const t0 = Date.now();
    const r = await routeTts("hello", "en", 300);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.provider).toBe("mock");
    expect(r.attempts[0].error).toMatch(/timed out after 300 ms/);
  });

  it("routes by language: an English-only voice is skipped for Bangla", async () => {
    process.env.HOST_TTS_CHAIN = "mock-en,mock";
    expect((await routeTts("hi", "en")).provider).toBe("mock-en");
    const bn = await routeTts("হাই", "bn");
    expect(bn.provider).toBe("mock");
    expect(bn.attempts[0]).toMatchObject({ provider: "mock-en", skipped: "no bn voice" });
  });

  it("rests a provider after three failures in a row (circuit breaker)", async () => {
    process.env.HOST_TTS_CHAIN = "mock-fail,mock";
    for (let i = 0; i < 3; i++) await routeTts("x", "en");
    const r = await routeTts("x", "en");
    expect(r.attempts[0]).toMatchObject({ provider: "mock-fail", skipped: "resting after repeated failures" });
    const fail = providerStatus().find((c) => c.kind === "tts")!.providers.find((p) => p.id === "mock-fail")!;
    expect(fail).toMatchObject({ resting: true, failures: 3 });
  });

  it("reports every attempt when nothing works", async () => {
    process.env.HOST_TTS_CHAIN = "mock-fail";
    process.env.HOST_NO_MOCK = "1";
    await expect(routeTts("x", "en")).rejects.toBeInstanceOf(AllProvidersFailed);
  });
});

describe("commentary on the mock LLM", () => {
  const state = (): RoomState => {
    let s = createRoom();
    const r = applyAction(s, { type: "join", token: "token-alice", name: "Alice", avatar: "🎈" }, { now: 0, newId: () => "p1" });
    if (r.ok) s = r.state;
    return s;
  };

  it("returns a bilingual line that maps to a pre-recorded quip", async () => {
    const w = await writeCommentary(state(), "roast");
    expect(w.provider).toBe("mock");
    expect(w.clip).toMatch(/^quip_/);
    expect(w.text).toEqual(CLIPS[w.clip!]);
  });

  it("replies in the language the guest spoke", async () => {
    const bn = await writeReply(state(), "মেজ কি বিরিয়ানি পছন্দ করে?", "bn");
    expect(bn.lang).toBe("bn");
    expect(bn.text.bn).toMatch(/[ঀ-৿]/);
    const en = await writeReply(state(), "Does Mez like biryani?", "en");
    expect(en.lang).toBe("en");
    expect(en.text.en).toMatch(/mock AI/);
  });

  it("falls through a dead LLM", async () => {
    process.env.HOST_LLM_CHAIN = "gemini,mock";
    process.env.GEMINI_API_KEY = "bad";
    const fetchMock = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    try {
      const r = await routeLlm("s", "p");
      expect(r.provider).toBe("mock");
      expect(r.attempts[0]).toMatchObject({ provider: "gemini", ok: false });
    } finally {
      globalThis.fetch = fetchMock;
    }
  });
});
