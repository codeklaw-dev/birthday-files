import { describe, expect, it } from "vitest";
import { applyAction, createRoom, LIMITS, viewFor } from "@/lib/game/engine";
import type { Action, RoomState } from "@/lib/game/types";

let n = 0;
const run = (state: RoomState, action: Action, now = 1000): RoomState => {
  const res = applyAction(state, action, { now, newId: () => `id${++n}` });
  if (!res.ok) throw new Error(res.error);
  return res.state;
};
const err = (state: RoomState, action: Action, now = 1000) => {
  const res = applyAction(state, action, { now, newId: () => `id${++n}` });
  return res.ok ? null : res.error;
};
const join = (s: RoomState, token: string, name: string) => run(s, { type: "join", token, name, avatar: "🎈" });
const idOf = (s: RoomState, token: string) => s.tokens[token];

function twoPlayers() {
  let s = createRoom();
  s = join(s, "token-alice", "Alice");
  s = join(s, "token-bobby", "Bob");
  return s;
}

describe("joining", () => {
  it("adds players, de-duplicates names and lets a phone rejoin", () => {
    let s = twoPlayers();
    s = join(s, "token-carol", "alice");
    expect(s.players.map((p) => p.name)).toEqual(["Alice", "Bob", "alice 2"]);
    s = join(s, "token-alice", "Alicia");
    expect(s.players).toHaveLength(3);
    expect(s.players[0].name).toBe("Alicia");
  });

  it("rejects blank names and short tokens", () => {
    expect(err(createRoom(), { type: "join", token: "token-x1", name: "   ", avatar: "" })).toMatch(/name/);
    expect(err(createRoom(), { type: "join", token: "x", name: "A", avatar: "" })).toMatch(/token/);
  });
});

describe("quiz round", () => {
  it("scores correct answers with a speed bonus, once per player", () => {
    let s = run(twoPlayers(), { type: "host/start" }, 0);
    const q = s.questions[0];
    const wrong = (q.correctIndex + 1) % q.options.length;
    s = run(s, { type: "answer", token: "token-alice", optionIndex: q.correctIndex }, 0);
    expect(err(s, { type: "answer", token: "token-alice", optionIndex: wrong }, 10)).toMatch(/already/);
    s = run(s, { type: "answer", token: "token-bobby", optionIndex: wrong }, 10);
    s = run(s, { type: "host/reveal" }, 5000);

    expect(s.phase).toBe("reveal");
    const alice = s.players.find((p) => p.id === idOf(s, "token-alice"))!;
    const bob = s.players.find((p) => p.id === idOf(s, "token-bobby"))!;
    expect(alice.score).toBe(LIMITS.basePoints + LIMITS.speedBonus);
    expect(bob.score).toBe(0);
    expect(s.scoreLog).toHaveLength(1);
  });

  it("gives a slower correct answer fewer points and refuses late ones", () => {
    let s = run(twoPlayers(), { type: "host/start" }, 0);
    const q = s.questions[0];
    s = run(s, { type: "answer", token: "token-alice", optionIndex: q.correctIndex }, (q.seconds * 1000) / 2);
    expect(err(s, { type: "answer", token: "token-bobby", optionIndex: q.correctIndex }, q.seconds * 1000 + 1)).toMatch(/Time/);
    s = run(s, { type: "system/timeUp", questionId: q.id }, q.seconds * 1000 + 250);
    expect(s.players.find((p) => p.name === "Alice")!.score).toBe(LIMITS.basePoints + LIMITS.speedBonus / 2);
  });

  it("ignores a stale timer and blocks skipping an open question", () => {
    const s = run(twoPlayers(), { type: "host/start" }, 0);
    expect(err(s, { type: "system/timeUp", questionId: "nope" })).toMatch(/Stale/);
    expect(err(s, { type: "host/next" })).toMatch(/Reveal/);
  });

  it("walks through every question then runs out", () => {
    let s = run(twoPlayers(), { type: "host/start" }, 0);
    for (let i = 1; i < s.questions.length; i++) {
      s = run(s, { type: "host/reveal" });
      s = run(s, { type: "host/next" });
      expect(s.questionIndex).toBe(i);
    }
    s = run(s, { type: "host/reveal" });
    expect(err(s, { type: "host/next" })).toMatch(/No more/);
  });
});

describe("views", () => {
  it("hides the answer key from players and the display until reveal", () => {
    let s = run(twoPlayers(), { type: "host/start" }, 0);
    s = run(s, { type: "answer", token: "token-alice", optionIndex: 1 }, 5);
    for (const role of ["player", "display"] as const) {
      const v = viewFor(s, role, "token-alice", 10);
      expect(v.question!.correctIndex).toBeNull();
      expect(v.question!.tally).toBeNull();
      expect(JSON.stringify(v)).not.toContain("token-");
    }
    expect(viewFor(s, "host", null, 10).question!.correctIndex).toBe(s.questions[0].correctIndex);
    expect(viewFor(s, "player", "token-alice", 10).myAnswer).toBe(1);
    s = run(s, { type: "host/reveal" });
    expect(viewFor(s, "display", null, 10).question!.correctIndex).toBe(s.questions[0].correctIndex);
  });

  it("ranks by score, then by who joined first", () => {
    let s = twoPlayers();
    s = run(s, { type: "host/award", playerId: idOf(s, "token-bobby"), delta: 50 });
    expect(viewFor(s, "display", null, 0).players.map((p) => p.name)).toEqual(["Bob", "Alice"]);
    s = run(s, { type: "host/award", playerId: idOf(s, "token-alice"), delta: 50 });
    expect(viewFor(s, "display", null, 0).players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
  });
});

describe("host tools", () => {
  it("never lets a score go below zero and validates awards", () => {
    let s = twoPlayers();
    const id = idOf(s, "token-alice");
    s = run(s, { type: "host/award", playerId: id, delta: -50 });
    expect(s.players[0].score).toBe(0);
    expect(err(s, { type: "host/award", playerId: id, delta: 99999 })).toMatch(/Invalid/);
    expect(err(s, { type: "host/award", playerId: "ghost", delta: 10 })).toMatch(/Unknown/);
  });

  it("only shows approved messages to guests", () => {
    let s = run(createRoom(), { type: "submitMessage", author: "Nana", text: "Happy birthday!" });
    expect(viewFor(s, "display", null, 0).messages).toHaveLength(0);
    expect(viewFor(s, "host", null, 0).messages).toHaveLength(1);
    s = run(s, { type: "host/moderate", messageId: s.messages[0].id, status: "approved" });
    expect(viewFor(s, "display", null, 0).messages).toHaveLength(1);
    expect(err(s, { type: "submitMessage", author: "Nana", text: " " })).toMatch(/message/);
  });

  it("keeps a small inline profile photo and refuses anything else", () => {
    const photo = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const s = run(createRoom(), { type: "submitMessage", author: "Nana", text: "Happy birthday!", photo });
    expect(s.messages[0].photo).toBe(photo);
    const bad = (p: string) => err(createRoom(), { type: "submitMessage", author: "Nana", text: "Hi there", photo: p });
    expect(bad("https://example.com/me.jpg")).toMatch(/profile picture/);
    expect(bad("data:image/svg+xml;base64,PHN2Zz4=")).toMatch(/profile picture/);
    expect(bad(`data:image/png;base64,${"A".repeat(LIMITS.photoChars)}`)).toMatch(/profile picture/);
    expect(run(createRoom(), { type: "submitMessage", author: "Nana", text: "Hi there", photo: null }).messages[0]).not.toHaveProperty("photo");
  });

  it("kicks a player and frees their token", () => {
    let s = twoPlayers();
    s = run(s, { type: "host/kick", playerId: idOf(s, "token-alice") });
    expect(s.players.map((p) => p.name)).toEqual(["Bob"]);
    expect(s.tokens["token-alice"]).toBeUndefined();
  });

  it("resets scores but keeps guests and messages", () => {
    let s = twoPlayers();
    s = run(s, { type: "submitMessage", author: "Nana", text: "Hello" });
    s = run(s, { type: "host/award", playerId: idOf(s, "token-alice"), delta: 100 });
    s = run(s, { type: "host/start" });
    s = run(s, { type: "host/reset" });
    expect(s.phase).toBe("lobby");
    expect(s.players.map((p) => p.score)).toEqual([0, 0]);
    expect(s.messages).toHaveLength(1);
  });
});

describe("cake", () => {
  it("needs the whole room to blow out every candle", () => {
    let s = run(twoPlayers(), { type: "host/startCake" });
    expect(err(createRoom(), { type: "blow", token: "token-alice" })).toMatch(/Join/);
    const needed = s.cake.candles * s.cake.perCandle;
    for (let i = 0; i < needed; i++) {
      expect(viewFor(s, "display", null, 0).cake.lit).toBeGreaterThan(0);
      s = run(s, { type: "blow", token: i % 2 ? "token-alice" : "token-bobby" });
    }
    expect(viewFor(s, "display", null, 0).cake.lit).toBe(0);
    expect(err(s, { type: "blow", token: "token-alice" })).toMatch(/already out/);
  });
});
