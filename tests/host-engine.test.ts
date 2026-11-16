import { describe, expect, it } from "vitest";
import { applyAction, createRoom, viewFor } from "@/lib/game/engine";
import type { Action, RoomState } from "@/lib/game/types";
import { resolveLang } from "@/lib/host/host-state";

let n = 0;
const ctx = (now = 1000) => ({ now, newId: () => `id${++n}` });
const run = (s: RoomState, a: Action, now = 1000) => {
  const r = applyAction(s, a, ctx(now));
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const err = (s: RoomState, a: Action) => {
  const r = applyAction(s, a, ctx());
  return r.ok ? null : r.error;
};
const withPlayers = () => {
  let s = createRoom();
  s = run(s, { type: "join", token: "token-alice", name: "Alice", avatar: "🎈" });
  s = run(s, { type: "join", token: "token-bobby", name: "Bob", avatar: "🎈" });
  return s;
};

describe("host utterances", () => {
  it("emits a new line with a fresh id on every scripted transition", () => {
    let s = withPlayers();
    const ids = new Set([s.host.utterance.id]);
    s = run(s, { type: "host/start" });
    expect(s.host.utterance.cue).toBe("question");
    expect(s.host.utterance.clip).toBe("show_start");
    ids.add(s.host.utterance.id);
    s = run(s, { type: "host/reveal" });
    expect(s.host.utterance.cue).toBe("reveal");
    ids.add(s.host.utterance.id);
    expect(ids.size).toBe(3);
    expect(s.host.recent.map((u) => u.id)).toEqual(expect.arrayContaining([...ids].slice(1)));
  });

  it("names the fastest correct player in the reveal line", () => {
    let s = run(withPlayers(), { type: "host/start" }, 0);
    const q = s.questions[0];
    s = run(s, { type: "answer", token: "token-bobby", optionIndex: q.correctIndex }, 100);
    s = run(s, { type: "answer", token: "token-alice", optionIndex: q.correctIndex }, 300);
    s = run(s, { type: "join", token: "token-carol", name: "Carol", avatar: "🎈" }, 400);
    s = run(s, { type: "answer", token: "token-carol", optionIndex: (q.correctIndex + 1) % 4 }, 500);
    s = run(s, { type: "host/reveal" }, 1000);
    expect(s.host.utterance.text.en).toContain("2 of 3");
    expect(s.host.utterance.text.en).toContain("Bob was the fastest");
    expect(s.host.utterance.text.bn).toContain("Bob");
    expect(s.host.utterance.fallbackClip).toBe("reveal_generic");
  });

  it("uses fully pre-recordable lines when nobody or everybody is right", () => {
    let s = run(withPlayers(), { type: "host/start" });
    expect(run(s, { type: "host/reveal" }).host.utterance.clip).toBe("reveal_nobody");
    const q = s.questions[0];
    s = run(s, { type: "answer", token: "token-alice", optionIndex: q.correctIndex });
    s = run(s, { type: "answer", token: "token-bobby", optionIndex: q.correctIndex });
    expect(run(s, { type: "host/reveal" }).host.utterance.clip).toBe("reveal_everyone");
  });

  it("alternates languages in auto mode and uses both for big moments", () => {
    expect([0, 1, 2, 3].map((c) => resolveLang("auto", c))).toEqual(["en", "bn", "en", "bn"]);
    expect(resolveLang("auto", 1, true)).toBe("both");
    expect(resolveLang("bn", 0, true)).toBe("bn");
    let s = run(withPlayers(), { type: "host/setLang", lang: "auto" });
    s = run(s, { type: "host/start" });
    const first = s.host.utterance.lang;
    s = run(s, { type: "host/reveal" });
    expect(s.host.utterance.lang).not.toBe(first);
    s = run(s, { type: "host/finish" });
    expect(s.host.utterance.lang).toBe("both");
  });

  it("speaks custom lines only in the languages actually written", () => {
    const s = withPlayers();
    expect(run(s, { type: "host/say", text: { bn: "শুভ জন্মদিন" } }).host.utterance.lang).toBe("bn");
    const both = run(s, { type: "host/say", text: { en: "Hi", bn: "হাই" }, lang: "both" });
    expect(both.host.utterance.lang).toBe("both");
    expect(both.host.utterance.source).toBe("host");
    expect(err(s, { type: "host/say", text: { en: "   " } })).toMatch(/Write something/);
    const long = run(s, { type: "host/say", text: { en: "x".repeat(900) }, lang: "en" });
    expect(long.host.utterance.text.en.length).toBe(400);
  });

  it("plays known clips, rejects unknown ones, rotates quips and replays with a new id", () => {
    const s = withPlayers();
    expect(run(s, { type: "host/clip", clip: "happy_birthday" }).host.utterance.clip).toBe("happy_birthday");
    expect(err(s, { type: "host/clip", clip: "../../etc/passwd" })).toMatch(/Unknown clip/);
    const q1 = run(s, { type: "host/quip" });
    const q2 = run(q1, { type: "host/quip" });
    expect(q1.host.utterance.clip).not.toBe(q2.host.utterance.clip);
    const again = run(q2, { type: "host/replay" });
    expect(again.host.utterance.id).not.toBe(q2.host.utterance.id);
    expect(again.host.utterance.text).toEqual(q2.host.utterance.text);
  });

  it("signals sound effects and stop, and validates them", () => {
    const s = withPlayers();
    expect(run(s, { type: "host/sfx", kind: "airhorn" }).host.sfx?.kind).toBe("airhorn");
    expect(err(s, { type: "host/sfx", kind: "explosion" as never })).toMatch(/Unknown sound/);
    expect(run(s, { type: "host/stopSpeech" }).host.stopId).toBeTruthy();
  });

  it("keeps voice settings across a reset and does not leak recent lines to clients", () => {
    let s = run(withPlayers(), { type: "host/setLang", lang: "bn" });
    s = run(s, { type: "host/setVoice", enabled: false });
    s = run(s, { type: "host/reset" });
    expect(s.host.mode).toBe("bn");
    expect(s.host.voice).toBe(false);
    expect(s.host.utterance.cue).toBe("lobby");
    const v = viewFor(s, "player", "token-alice", 0);
    expect(v.host).not.toHaveProperty("recent");
    expect(v.host.utterance.text.en).toContain("Welcome");
  });
});
