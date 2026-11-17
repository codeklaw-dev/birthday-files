import { describe, expect, it } from "vitest";
import { applyAction, createRoom, viewFor } from "@/lib/game/engine";
import type { Action, RoomState, RoomView } from "@/lib/game/types";
import { PRIZES, WHEEL_RULES } from "@/lib/games/config";
import { prizeSegments, wheelEligible } from "@/lib/games/engine-games";
import { boardTotals } from "@/lib/games/ledger";
import { groupAnswers, matchGuess } from "@/lib/games/text";
import type { GameContent, ImposterGame } from "@/lib/games/types";
import type { ImposterView, MysteryView, SurveyView, TrialView, WkmbView } from "@/lib/games/views";

// ---------- harness ----------
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let n = 0;
let random = seeded(42);
const ctx = (now = 1_000) => ({ now, newId: () => `id${++n}`, random });
const run = (s: RoomState, a: Action, now = 1_000) => {
  const r = applyAction(s, a, ctx(now));
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const err = (s: RoomState, a: Action, now = 1_000) => {
  const r = applyAction(s, a, ctx(now));
  return r.ok ? null : r.error;
};
const room = (players: string[]) => {
  let s = createRoom("T", 0, "judge-key-xyz");
  for (const name of players) s = run(s, { type: "join", token: `token-${name.toLowerCase()}`, name, avatar: "🎈" });
  return s;
};
const tok = (name: string) => `token-${name.toLowerCase()}`;
const pid = (s: RoomState, name: string) => s.tokens[tok(name)];
const view = (s: RoomState, role: RoomView["role"], name?: string) => viewFor(s, role, name ? tok(name) : null, 1_000);
const gv = <T>(s: RoomState, role: RoomView["role"], name?: string) => view(s, role, name).games.game as T;

/** Ledger and player scores must always agree, and every total must be explainable by its entries. */
function assertIntegrity(s: RoomState) {
  const live = boardTotals(s.ledger, "live");
  for (const p of s.players) expect(p.score).toBe(live.get(`player:${p.id}`)?.total ?? 0);
  for (const e of s.ledger) expect(Number.isInteger(e.delta)).toBe(true);
}

const c = (id: string, name: string, remote = false) => ({ id, name, remote });

// ---------- Mez Imposter ----------
describe("Mez Imposter", () => {
  const four = () => room(["Ana", "Bo", "Cy", "Di"]);
  const start = (s: RoomState) => run(s, { type: "host/game/start", game: "imposter" });
  const imp = (s: RoomState) => s.game as ImposterGame;

  it("needs three players", () => {
    expect(err(room(["Ana", "Bo"]), { type: "host/game/start", game: "imposter" })).toMatch(/at least 3/);
  });

  it("deals one secret imposter and keeps the word away from every other screen", () => {
    const s = start(four());
    const g = imp(s);
    expect(g.imposterIds).toHaveLength(1);
    const impName = s.players.find((p) => p.id === g.imposterIds[0])!.name;
    for (const p of s.players) {
      const v = gv<ImposterView>(s, "player", p.name);
      if (p.name === impName) {
        expect(v.me).toMatchObject({ role: "imposter", word: null });
        expect(JSON.stringify(view(s, "player", p.name))).not.toContain(g.word);
      } else expect(v.me).toMatchObject({ role: "crew", word: g.word });
      // Nobody's view says who the imposter is.
      expect(JSON.stringify(v)).not.toMatch(/imposterIds/);
    }
    for (const role of ["display", "host", "judge"] as const) {
      const json = JSON.stringify(view(s, role));
      expect(json).not.toContain(`"${g.word}"`);
      expect(gv<ImposterView>(s, role).me).toBeNull();
    }
  });

  it("collects one clue each, hidden until shown, and refuses the secret word", () => {
    let s = run(start(four()), { type: "host/game/advance" });
    const g = imp(s);
    const crew = s.players.find((p) => !g.imposterIds.includes(p.id))!;
    expect(err(s, { type: "game/clue", token: tok(crew.name), text: g.word.toUpperCase() })).toMatch(/No saying the word/);
    s = run(s, { type: "game/clue", token: tok(crew.name), text: "Spicy" });
    expect(err(s, { type: "game/clue", token: tok(crew.name), text: "Again" })).toMatch(/already/);
    const other = s.players.find((p) => p.id !== crew.id)!;
    expect(gv<ImposterView>(s, "player", other.name).clues).toEqual([]);
    expect(gv<ImposterView>(s, "display").clues).toEqual([]);
    s = run(s, { type: "host/game/advance" });
    expect(gv<ImposterView>(s, "display").clues.map((x) => x.clue)).toEqual(["Spicy"]);
  });

  it("enforces one vote per player, no self-votes, no late joiners", () => {
    let s = start(four());
    s = run(s, { type: "join", token: "token-late", name: "Late", avatar: "🎈" });
    s = run(run(run(s, { type: "host/game/advance" }), { type: "host/game/advance" }), { type: "host/game/advance" });
    expect(imp(s).step).toBe("vote");
    const [a, b] = ["Ana", "Bo"];
    expect(err(s, { type: "game/vote", token: tok(a), choice: pid(s, a) })).toMatch(/yourself/);
    s = run(s, { type: "game/vote", token: tok(a), choice: pid(s, b) });
    expect(err(s, { type: "game/vote", token: tok(a), choice: pid(s, "Cy") })).toMatch(/already voted/);
    expect(err(s, { type: "game/vote", token: "token-late", choice: pid(s, b) })).toMatch(/joined after/);
    expect(err(s, { type: "game/vote", token: "token-nobody", choice: pid(s, b) })).toMatch(/Join/);
    expect(gv<ImposterView>(s, "display").votesIn).toBe(1);
    expect(JSON.stringify(gv<ImposterView>(s, "display"))).not.toContain(`"tally"`.slice(0, 0) + pid(s, b) + '":1');
  });

  it("scores the reveal exactly once and keeps the ledger consistent", () => {
    let s = start(four());
    const g = imp(s);
    const impId = g.imposterIds[0];
    s = run(run(run(s, { type: "host/game/advance" }), { type: "host/game/advance" }), { type: "host/game/advance" });
    for (const p of s.players) if (p.id !== impId) s = run(s, { type: "game/vote", token: tok(p.name), choice: impId });
    const impName = s.players.find((p) => p.id === impId)!.name;
    const crewTarget = s.players.find((p) => p.id !== impId)!.id;
    s = run(s, { type: "game/vote", token: tok(impName), choice: crewTarget });
    s = run(s, { type: "host/game/advance" });
    expect(imp(s).result?.caught).toBe(true);
    const pts = s.points;
    for (const p of s.players) expect(p.score).toBe(p.id === impId ? 0 : pts.imposterVotedRight + pts.imposterCrewWin);
    const ledgerLen = s.ledger.length;
    expect(err(s, { type: "system/gameTimeUp", roundId: imp(s).roundId, step: "vote" })).toMatch(/Stale/);
    s = run(s, { type: "host/game/advance" }); // finish
    expect(s.game).toBeNull();
    expect(s.phase).toBe("boards");
    expect(s.ledger).toHaveLength(ledgerLen);
    assertIntegrity(s);
  });

  it("lets the imposter escape on a tie, and rewards guessing the word", () => {
    let s = start(four());
    const g = imp(s);
    const impId = g.imposterIds[0];
    const impName = s.players.find((p) => p.id === impId)!.name;
    s = run(run(s, { type: "host/game/advance" }), { type: "host/game/advance" });
    s = run(s, { type: "game/guess", token: tok(impName), text: g.word.toLowerCase() });
    const crew = s.players.filter((p) => p.id !== impId);
    expect(err(s, { type: "game/guess", token: tok(crew[0].name), text: "x" })).toMatch(/Only the imposter/);
    s = run(s, { type: "host/game/advance" });
    s = run(s, { type: "game/vote", token: tok(crew[0].name), choice: crew[1].id });
    s = run(s, { type: "game/vote", token: tok(crew[1].name), choice: crew[0].id });
    s = run(s, { type: "host/game/advance" });
    expect(imp(s).result?.caught).toBe(false);
    expect(s.players.find((p) => p.id === impId)!.score).toBe(s.points.imposterEscape + s.points.imposterWordGuess);
    const reveal = gv<ImposterView>(s, "display").reveal!;
    expect(reveal.word).toBe(g.word);
    expect(reveal.imposters.map((x) => x.id)).toEqual([impId]);
    assertIntegrity(s);
  });

  it("keeps a player's secret and vote across a reconnect", () => {
    let s = start(four());
    s = run(run(run(s, { type: "host/game/advance" }), { type: "host/game/advance" }), { type: "host/game/advance" });
    const before = gv<ImposterView>(s, "player", "Ana").me;
    s = run(s, { type: "game/vote", token: tok("Ana"), choice: pid(s, "Bo") });
    s = run(s, { type: "join", token: tok("Ana"), name: "Ana", avatar: "🦊" }); // phone reloads and rejoins
    const after = gv<ImposterView>(s, "player", "Ana").me!;
    expect(after.role).toBe(before!.role);
    expect(after.word).toBe(before!.word);
    expect(after.vote).toBe(pid(s, "Bo"));
    expect(err(s, { type: "game/vote", token: tok("Ana"), choice: pid(s, "Cy") })).toMatch(/already voted/);
  });

  it("auto-advances only on the current step's timer", () => {
    let s = run(start(four()), { type: "host/game/advance" });
    const g = imp(s);
    expect(err(s, { type: "system/gameTimeUp", roundId: "old", step: "clues" })).toMatch(/Stale/);
    s = run(s, { type: "system/gameTimeUp", roundId: g.roundId, step: "clues" });
    expect(imp(s).step).toBe("cluesShown");
  });
});

// ---------- Who Knows Mez Best ----------
const wkmbContent: GameContent = {
  game: "wkmb",
  content: {
    questions: [
      {
        id: "q1",
        prompt: "Comfort food?",
        answers: [
          { contributor: c("s1", "Nadia", true), text: "Biryani" },
          { contributor: c("s2", "Rafi"), text: "Pizza" },
        ],
      },
      { id: "q2", prompt: "Song?", answers: [] },
    ],
  },
};

describe("Who Knows Mez Best", () => {
  it("hides authors from every screen, Mez included, until scoring is locked and revealed", () => {
    let s = run(room(["Ana"]), { type: "host/game/start", game: "wkmb", content: wkmbContent });
    expect((s.game as { questions: unknown[] }).questions).toHaveLength(1); // empty question dropped
    for (const role of ["display", "judge", "host", "player"] as const) {
      const json = JSON.stringify(view(s, role, role === "player" ? "Ana" : undefined));
      expect(json).not.toContain("Nadia");
      expect(json).not.toContain("Rafi");
    }
    expect(err(s, { type: "host/game/advance" })).toMatch(/Waiting for Mez/);
    expect(err(s, { type: "judge/lock" })).toMatch(/Score every answer/);
    s = run(s, { type: "judge/score", key: "A", stars: 3 });
    expect(err(s, { type: "judge/score", key: "B", stars: 4 })).toMatch(/0 to 3/);
    expect(gv<WkmbView>(s, "display").answers.every((a) => a.stars === null)).toBe(true); // stars stay off the TV until locked
    s = run(s, { type: "judge/score", key: "B", stars: 0 });
    s = run(s, { type: "judge/lock" });
    expect(err(s, { type: "judge/score", key: "A", stars: 1 })).toMatch(/locked/);
    expect(JSON.stringify(view(s, "display"))).not.toContain("Nadia");
    s = run(s, { type: "host/game/advance" });
    const v = gv<WkmbView>(s, "display");
    expect(v.answers.map((a) => a.author?.name).sort()).toEqual(["Nadia", "Rafi"]);
  });

  it("scores attending and remote contributors identically on the Mez Expert board", () => {
    let s = run(room([]), { type: "host/game/start", game: "wkmb", content: wkmbContent });
    s = run(run(run(s, { type: "judge/score", key: "A", stars: 2 }), { type: "judge/score", key: "B", stars: 2 }), { type: "judge/lock" });
    const board = view(s, "display").games.boards.expert;
    expect(board.map((r) => r.total)).toEqual([100, 100]);
    expect(board.find((r) => r.subject.name === "Nadia")!.remote).toBe(true);
    expect(board.every((r) => r.rank === 1)).toBe(true);
    expect(s.ledger.every((e) => e.board === "expert")).toBe(true);
  });
});

// ---------- Mez Survey ----------
describe("Mez Survey", () => {
  it("groups similar answers on the server and counts each guest once", () => {
    const groups = groupAnswers([
      { by: "a", text: "Biryani" },
      { by: "b", text: "biryani!!" },
      { by: "c", text: "Kacchi biryani" },
      { by: "c", text: "Biriyani" },
      { by: "d", text: "Pizza" },
      { by: "e", text: "  " },
    ]);
    expect(groups.map((g) => [g.label, g.count])).toEqual([
      ["Biryani", 3],
      ["Pizza", 1],
    ]);
    const board = [
      { label: "Biryani", aliases: ["Kacchi biryani"] },
      { label: "Pizza", aliases: [] },
    ];
    expect(matchGuess("biriyani", board)).toBe(0);
    expect(matchGuess("PIZZAS", board)).toBe(1);
    expect(matchGuess("sushi", board)).toBeNull();
  });

  const surveyContent: GameContent = {
    game: "survey",
    content: { boards: [{ questionId: "q1", prompt: "Comfort food?", respondents: 5, answers: [{ label: "Biryani", count: 3, aliases: ["kacchi"] }, { label: "Pizza", count: 2, aliases: [] }] }] },
  };

  it("scores matched guesses once, hides the board from the host until guessing ends, and audits overrides", () => {
    let s = run(room(["Ana", "Bo", "Cy"]), { type: "host/game/start", game: "survey", content: surveyContent });
    expect(gv<SurveyView>(s, "host").fullBoard).toBeNull();
    expect(JSON.stringify(view(s, "host"))).not.toContain("Biryani");
    s = run(s, { type: "game/guess", token: tok("Ana"), text: "biryani" });
    expect(err(s, { type: "game/guess", token: tok("Ana"), text: "pizza" })).toMatch(/already/);
    s = run(s, { type: "game/guess", token: tok("Bo"), text: "Spaghetti" });
    s = run(s, { type: "system/gameTimeUp", roundId: s.game!.roundId, step: "guess" });
    expect(s.players.find((p) => p.name === "Ana")!.score).toBe(3 * s.points.surveyPerPerson);
    expect(gv<SurveyView>(s, "host").unmatched.map((u) => u.name)).toEqual(["Bo"]);
    s = run(s, { type: "host/game/accept", playerId: pid(s, "Bo"), answerIndex: 1 });
    expect(err(s, { type: "host/game/accept", playerId: pid(s, "Bo"), answerIndex: 1 })).toMatch(/already scored/);
    expect(s.players.find((p) => p.name === "Bo")!.score).toBe(2 * s.points.surveyPerPerson);
    expect(s.audit.at(-1)!.text).toMatch(/accepted Bo's guess/);
    s = run(s, { type: "host/game/reveal" });
    expect(gv<SurveyView>(s, "display").answers.map((a) => a.label)).toEqual([null, "Pizza"]);
    assertIntegrity(s);
  });
});

// ---------- Mez on Trial ----------
describe("Mez on Trial", () => {
  const content: GameContent = { game: "trial", content: { cases: [{ id: "s1", charge: "eating the last samosa", accuser: c("s1", "Nadia", true) }] } };

  it("only Mez pleads, jurors vote once, the majority wins and the accuser is named only at the verdict", () => {
    let s = run(room(["Ana", "Bo", "Cy"]), { type: "host/game/start", game: "trial", content });
    expect(JSON.stringify(view(s, "display"))).not.toContain("Nadia");
    expect(err(s, { type: "game/vote", token: tok("Ana"), choice: "guilty" })).toMatch(/isn't voting/);
    s = run(s, { type: "judge/plea", plea: "not_guilty" });
    s = run(s, { type: "host/game/advance" });
    s = run(s, { type: "judge/rest" });
    expect(gv<TrialView>(s, "display").step).toBe("vote");
    s = run(s, { type: "game/vote", token: tok("Ana"), choice: "guilty" });
    expect(err(s, { type: "game/vote", token: tok("Ana"), choice: "not_guilty" })).toMatch(/already/);
    expect(err(s, { type: "game/vote", token: tok("Bo"), choice: "maybe" })).toMatch(/guilty or not/);
    s = run(s, { type: "game/vote", token: tok("Bo"), choice: "guilty" });
    s = run(s, { type: "game/vote", token: tok("Cy"), choice: "not_guilty" });
    expect(gv<TrialView>(s, "display").verdict).toBeNull();
    s = run(s, { type: "host/game/advance" });
    const v = gv<TrialView>(s, "display");
    expect(v.verdict).toMatchObject({ guilty: 2, notGuilty: 1, outcome: "guilty", accuser: { name: "Nadia", remote: true } });
    const score = (name: string) => s.players.find((p) => p.name === name)!.score;
    expect([score("Ana"), score("Bo"), score("Cy")]).toEqual([25, 25, 0]);
    expect(view(s, "display").games.boards.expert[0]).toMatchObject({ total: 50, remote: true });
    assertIntegrity(s);
  });

  it("awards nothing on a hung jury", () => {
    let s = run(room(["Ana", "Bo"]), { type: "host/game/start", game: "trial", content });
    s = run(run(s, { type: "host/game/advance" }), { type: "host/game/advance" });
    s = run(run(s, { type: "game/vote", token: tok("Ana"), choice: "guilty" }), { type: "game/vote", token: tok("Bo"), choice: "not_guilty" });
    s = run(s, { type: "host/game/advance" });
    expect(gv<TrialView>(s, "display").verdict?.outcome).toBe("hung");
    expect(s.ledger).toHaveLength(0);
  });
});

// ---------- Mystery Files ----------
describe("Mystery Files", () => {
  const content: GameContent = { game: "mystery", content: { items: [{ id: "s1:memory", contributor: c("s1", "Nadia"), kind: "memory", text: "Lost in Sylhet" }] } };

  it("hides Mez's guess and the contributor until the reveal, then scores correct guessers", () => {
    let s = run(room(["Ana", "Bo"]), { type: "host/game/start", game: "mystery", content });
    expect(JSON.stringify(gv(s, "display"))).not.toMatch(/"name":"Nadia","remote"|mezGuess":"Nadia/);
    s = run(s, { type: "judge/guess", suspectId: "s1" });
    expect(gv<MysteryView>(s, "display")).toMatchObject({ mezHasGuessed: true, mezGuess: null, reveal: null });
    expect(gv<MysteryView>(s, "judge").mezGuess).toBe("Nadia");
    expect(err(s, { type: "game/vote", token: tok("Ana"), choice: "s1" })).toMatch(/isn't open/);
    s = run(s, { type: "host/game/advance" });
    s = run(s, { type: "game/vote", token: tok("Ana"), choice: "s1" });
    expect(err(s, { type: "game/vote", token: tok("Ana"), choice: "s1" })).toMatch(/already/);
    expect(err(s, { type: "game/vote", token: tok("Bo"), choice: "nobody" })).toMatch(/from the list/);
    s = run(s, { type: "host/game/advance" });
    expect(gv<MysteryView>(s, "display").reveal).toMatchObject({ name: "Nadia", mezRight: true, correct: ["Ana"] });
    expect(s.players.find((p) => p.name === "Ana")!.score).toBe(s.points.mysteryCorrectGuess);
    assertIntegrity(s);
  });
});

// ---------- scores, corrections, judge ----------
describe("score integrity and corrections", () => {
  it("never edits history: corrections are new entries with a reason, and totals can't go negative", () => {
    let s = room(["Ana"]);
    const ana = { kind: "player" as const, id: pid(s, "Ana"), name: "Ana" };
    expect(err(s, { type: "host/correct", board: "live", subject: ana, delta: 50, reason: "" })).toMatch(/reason/);
    expect(err(s, { type: "host/correct", board: "live", subject: ana, delta: 10_000, reason: "typo" })).toMatch(/between/);
    s = run(s, { type: "host/correct", board: "live", subject: ana, delta: 50, reason: "Missed point in round 1" });
    const first = structuredClone(s.ledger[0]);
    s = run(s, { type: "host/correct", board: "live", subject: ana, delta: -80, reason: "Over-awarded", correctsId: first.id });
    expect(s.ledger[0]).toEqual(first);
    expect(s.ledger[1]).toMatchObject({ delta: -50, correctsId: first.id, by: "host" });
    expect(s.players[0].score).toBe(0);
    expect(err(s, { type: "host/correct", board: "live", subject: ana, delta: 5, reason: "x x", correctsId: "nope" })).toMatch(/doesn't exist/);
    assertIntegrity(s);
  });

  it("caps the judge's bonus and records it as the judge's", () => {
    let s = room(["Ana"]);
    const ana = { kind: "player" as const, id: pid(s, "Ana") };
    expect(err(s, { type: "judge/bonus", board: "live", subject: ana, delta: -10, reason: "boo" })).toMatch(/positive/);
    expect(err(s, { type: "judge/bonus", board: "live", subject: ana, delta: 101, reason: "great" })).toMatch(/between/);
    s = run(s, { type: "judge/bonus", board: "live", subject: ana, delta: 40, reason: "Best costume" });
    expect(s.ledger[0]).toMatchObject({ by: "judge", rule: "judge-bonus", delta: 40, note: "Judge's bonus: Best costume" });
  });

  it("changes points only for future rounds, and audits the change", () => {
    let s = room(["Ana"]);
    s = run(s, { type: "host/points", points: { quizCorrect: 200 } });
    expect(s.points.quizCorrect).toBe(200);
    expect(s.audit.at(-1)!.text).toMatch(/quizCorrect 100→200/);
    expect(err(s, { type: "host/points", points: { quizCorrect: -5 } })).toMatch(/0 to 1000/);
    expect(err(s, { type: "host/points", points: { cheat: 1 } as never })).toMatch(/Unknown rule/);
  });

  it("zeroes totals on reset by adding entries, keeping the history", () => {
    let s = room(["Ana"]);
    s = run(s, { type: "host/correct", board: "live", subject: { kind: "player", id: pid(s, "Ana"), name: "Ana" }, delta: 70, reason: "warm-up" });
    s = run(s, { type: "host/reset" });
    expect(s.ledger).toHaveLength(2);
    expect(s.players[0].score).toBe(0);
    assertIntegrity(s);
  });
});

// ---------- prize wheel ----------
describe("prize wheel", () => {
  function withScores() {
    let s = room(["Ana", "Bo", "Cy", "Di", "Eve"]);
    [90, 80, 70, 60, 0].forEach((pts, i) => {
      if (pts) s = run(s, { type: "host/correct", board: "live", subject: { kind: "player", id: s.players[i].id, name: s.players[i].name }, delta: pts, reason: "setup" });
    });
    return s;
  }

  it("lets only the top N with points spin, once each, and records the draw", () => {
    random = seeded(7);
    let s = withScores();
    expect(wheelEligible(s).map((r) => r.subject.name)).toEqual(["Ana", "Bo", "Cy"].slice(0, WHEEL_RULES.topN));
    expect(err(s, { type: "host/wheel/spin", subject: { kind: "player", id: pid(s, "Di") } })).toMatch(/top 3/);
    s = run(s, { type: "host/wheel/spin", subject: { kind: "player", id: pid(s, "Ana") } });
    const spin = s.wheel.current!;
    expect(spin.segments[spin.index]).toBe(spin.prize);
    expect(spin.draw).toBeGreaterThanOrEqual(0);
    expect(s.audit.at(-1)!.text).toMatch(/draw 0\.\d{4}/);
    expect(err(s, { type: "host/wheel/spin", subject: { kind: "player", id: pid(s, "Bo") } })).toMatch(/Wait for the last prize/);
    expect(err(s, { type: "wheel/respond", token: tok("Bo"), accept: true })).toMatch(/isn't yours/);
    expect(view(s, "player", "Ana").games.wheel.mine).toBe(true);
    expect(view(s, "player", "Bo").games.wheel.mine).toBe(false);
    s = run(s, { type: "wheel/respond", token: tok("Ana"), accept: true });
    expect(wheelEligible(s).map((r) => r.subject.name)).not.toContain("Ana");
  });

  it("lets anyone decline without using up their spin", () => {
    let s = withScores();
    s = run(s, { type: "host/wheel/spin", subject: { kind: "player", id: pid(s, "Bo") } });
    s = run(s, { type: "wheel/respond", token: tok("Bo"), accept: false });
    expect(s.wheel.current?.status).toBe("declined");
    expect(s.audit.at(-1)!.text).toMatch(/Bo declined/);
    expect(wheelEligible(s).map((r) => r.subject.name)).toContain("Bo");
  });

  it("offers hugs only when Mez allows them, and only in-person prizes to people in the room", () => {
    expect(prizeSegments({ kind: "player" }, false)).not.toContain("hug");
    expect(prizeSegments({ kind: "player" }, true)).toContain("hug");
    const remote = prizeSegments({ kind: "contributor", remote: true }, true);
    expect(remote).not.toContain("hug");
    expect(remote.every((id) => PRIZES.find((p) => p.id === id)!.remoteOk)).toBe(true);
    let s = room(["Ana"]);
    s = run(s, { type: "judge/allowContact", allowed: true });
    expect(s.wheel.allowContact).toBe(true);
    expect(s.audit.at(-1)).toMatchObject({ by: "judge" });
  });

  it("draws every prize with equal chance (no rigging)", () => {
    random = seeded(2024);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 6000; i++) {
      let s = withScores();
      s = run(s, { type: "host/wheel/spin", subject: { kind: "player", id: pid(s, "Ana") } });
      counts[s.wheel.current!.prize] = (counts[s.wheel.current!.prize] ?? 0) + 1;
    }
    const segs = prizeSegments({ kind: "player" }, false);
    expect(Object.keys(counts).sort()).toEqual([...segs].sort());
    for (const k of segs) expect(Math.abs(counts[k] / 6000 - 1 / segs.length)).toBeLessThan(0.02);
  });
});

describe("cross-game rules", () => {
  it("runs one game at a time and keeps the quiz out of the way", () => {
    let s = run(room(["Ana", "Bo", "Cy"]), { type: "host/game/start", game: "imposter" });
    expect(err(s, { type: "host/game/start", game: "imposter" })).toMatch(/Finish Mez Imposter/);
    expect(err(s, { type: "host/start" })).toMatch(/Finish the current game/);
    expect(err(s, { type: "host/startCake" })).toMatch(/Finish or stop/);
    s = run(s, { type: "host/game/abort" });
    expect(s.game).toBeNull();
    expect(s.audit.at(-1)!.text).toMatch(/stopped by the host/);
  });

  it("refuses games without content", () => {
    expect(err(room(["Ana"]), { type: "host/game/start", game: "wkmb" })).toMatch(/content missing/);
    expect(err(room(["Ana"]), { type: "host/game/start", game: "trial", content: { game: "trial", content: { cases: [] } } })).toMatch(/No approved accusations/);
  });
});
