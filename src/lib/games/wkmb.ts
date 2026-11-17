import { clip, reveal, contributorSubject, err, letter, line, ok, shuffle, type GameModule, type GCtx, type Env } from "./common";
import type { Award, Step, WkmbContent, WkmbGame } from "./types";

/**
 * Who Knows Mez Best. Guests' pre-submitted answers (attending and remote alike)
 * appear anonymously; Mez scores each from the judge phone (0–3 stars); only
 * after Mez locks the scores are the authors revealed. Mez Expert board.
 */

export function startWkmb(content: WkmbContent, ctx: GCtx): Step<WkmbGame> {
  const questions = content.questions
    .filter((q) => q.answers.length > 0)
    .map((q) => ({ id: q.id, prompt: q.prompt, answers: shuffle(q.answers, ctx.random).map((a, i) => ({ key: letter(i), ...a })) }));
  if (!questions.length) return err("No approved answers to play with yet. Approve some invite submissions first.");
  return ok(
    { id: "wkmb", roundId: ctx.newId(), step: "answers", stepEndsAt: null, startedAt: ctx.now, index: 0, questions, stars: {} },
    {
      line: clip("game_wkmb_intro"),
      audit: `Who Knows Mez Best started: ${questions.length} questions, ${questions.reduce((n, q) => n + q.answers.length, 0)} anonymous answers`,
    },
  );
}

const starKey = (index: number, key: string) => `${index}:${key}`;

export const wkmb: GameModule<WkmbGame, WkmbView> = {
  advance(g, ctx) {
    if (g.step === "answers") return err("Waiting for Mez to lock the scores on the judge phone.");
    if (g.step === "scored") {
      return ok({ ...g, step: "revealed" }, { line: reveal("wkmbReveal", "The moment of truth: who wrote what?", "সত্যের মুহূর্ত: কে কী লিখেছেন?") });
    }
    if (g.index + 1 >= g.questions.length) return ok(g, { end: true });
    const q = g.questions[g.index + 1];
    return ok({ ...g, step: "answers", index: g.index + 1, roundId: ctx.newId() }, { line: line("wkmbNext", `Next question: ${q.prompt}`, `পরের প্রশ্ন: ${q.prompt}`) });
  },
  timeUp() {
    return err("No timer running.");
  },
  act(g, a, actor, _ctx, env: Env) {
    if (actor.role !== "judge") return err("Only Mez can judge this game.");
    if (g.step !== "answers") return err("Scores for this question are locked.");
    const q = g.questions[g.index];
    if (a.type === "judge/score") {
      if (!q.answers.some((x) => x.key === a.key)) return err("Unknown answer.");
      if (!Number.isInteger(a.stars) || a.stars < 0 || a.stars > 3) return err("Stars must be 0 to 3.");
      return ok({ ...g, stars: { ...g.stars, [starKey(g.index, a.key)]: a.stars } });
    }
    if (a.type === "judge/lock") {
      const missing = q.answers.filter((x) => g.stars[starKey(g.index, x.key)] === undefined);
      if (missing.length) return err(`Score every answer first (${missing.map((m) => m.key).join(", ")}).`);
      const awards: Award[] = q.answers
        .map((x) => ({ x, stars: g.stars[starKey(g.index, x.key)] }))
        .filter(({ stars }) => stars > 0)
        .map(({ x, stars }) => ({
          board: "expert" as const,
          subject: contributorSubject(x.contributor),
          delta: stars * env.points.wkmbPerStar,
          rule: "wkmbPerStar" as const,
          note: `${stars}★ for "${x.text.slice(0, 40)}" (${q.prompt.slice(0, 40)})`,
        }));
      const best = Math.max(...q.answers.map((x) => g.stars[starKey(g.index, x.key)]));
      return ok({ ...g, step: "scored" }, { awards, line: line("wkmbScored", best >= 3 ? "Mez has spoken. Some of you really know your stuff." : "Mez has spoken. Tough crowd.", best >= 3 ? "মেজ রায় দিয়েছে। কেউ কেউ সত্যিই ভালো চেনেন।" : "মেজ রায় দিয়েছে। কঠিন বিচারক।") });
    }
    return err("Not part of this game.");
  },
  view(g, viewer) {
    const q = g.questions[g.index];
    const showStars = g.step !== "answers" || viewer.role === "judge";
    return {
      id: "wkmb",
      step: g.step,
      stepEndsAt: null,
      index: g.index,
      total: g.questions.length,
      prompt: q.prompt,
      answers: q.answers.map((x) => ({
        key: x.key,
        text: x.text,
        stars: showStars ? (g.stars[starKey(g.index, x.key)] ?? null) : null,
        // Authors stay hidden from everyone, Mez included, until after scoring.
        author: g.step === "revealed" ? { name: x.contributor.name, remote: x.contributor.remote } : null,
      })),
    };
  },
  advanceLabel(g) {
    return g.step === "answers" ? null : g.step === "scored" ? "Reveal who wrote what" : "Next question";
  },
};

export interface WkmbView {
  id: "wkmb";
  step: WkmbGame["step"];
  stepEndsAt: null;
  index: number;
  total: number;
  prompt: string;
  answers: { key: string; text: string; stars: number | null; author: { name: string; remote: boolean } | null }[];
}
