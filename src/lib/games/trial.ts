import { timerMs } from "./config";
import { contributorSubject, err, line, ok, playerSubject, type Env, type GameModule, type GCtx } from "./common";
import type { Award, Step, TrialContent, TrialGame } from "./types";

/**
 * Mez on Trial. Approved accusations from the invite are read as charges
 * (accuser anonymous), Mez pleads and defends against the clock, the phones
 * are the jury. The accuser is named with the verdict.
 */

export function startTrial(content: TrialContent, ctx: GCtx): Step<TrialGame> {
  if (!content.cases.length) return err("No approved accusations yet.");
  return ok(
    { id: "trial", roundId: ctx.newId(), step: "charge", stepEndsAt: null, startedAt: ctx.now, index: 0, cases: content.cases, plea: null, votes: {}, verdict: null },
    {
      line: line("trial", `All rise! Mez on Trial is now in session. First charge: Mez stands accused of ${content.cases[0].charge}`, `সবাই দাঁড়ান! মেজের বিচার শুরু। প্রথম অভিযোগ: মেজের বিরুদ্ধে অভিযোগ, ${content.cases[0].charge}`, true),
      audit: `Mez on Trial started with ${content.cases.length} charge${content.cases.length > 1 ? "s" : ""}`,
    },
  );
}

function verdict(g: TrialGame, env: Env): Step<TrialGame> {
  const votes = Object.values(g.votes);
  const guilty = votes.filter((v) => v === "guilty").length;
  const notGuilty = votes.length - guilty;
  const outcome = guilty > notGuilty ? "guilty" : notGuilty > guilty ? "not_guilty" : "hung";
  const c = g.cases[g.index];
  const awards: Award[] = [];
  if (outcome !== "hung") {
    for (const [pid, v] of Object.entries(g.votes)) {
      const p = env.players.find((x) => x.id === pid);
      if (p && v === outcome) awards.push({ board: "live", subject: playerSubject(p), delta: env.points.trialJurorMajority, rule: "trialJurorMajority", note: `Voted with the jury on "${c.charge.slice(0, 40)}"` });
    }
  }
  if (outcome === "guilty") awards.push({ board: "expert", subject: contributorSubject(c.accuser), delta: env.points.trialAccuserGuilty, rule: "trialAccuserGuilty", note: `Accusation upheld: "${c.charge.slice(0, 40)}"` });
  const said = {
    guilty: [`Guilty! The accusation came from ${c.accuser.name}.`, `দোষী! অভিযোগটা করেছিলেন ${c.accuser.name}।`],
    not_guilty: [`Not guilty! Mez walks free. The accusation came from ${c.accuser.name}.`, `নির্দোষ! মেজ মুক্ত। অভিযোগটা করেছিলেন ${c.accuser.name}।`],
    hung: [`A hung jury! The accuser was ${c.accuser.name}.`, `জুরিরা একমত হতে পারেননি! অভিযোগকারী ছিলেন ${c.accuser.name}।`],
  }[outcome];
  const next: TrialGame = { ...g, step: "verdict", stepEndsAt: null, verdict: { guilty, notGuilty, outcome } };
  return ok(next, { awards: awards.filter((a) => a.delta !== 0), line: line("trialVerdict", said[0], said[1], true) });
}

export const trial: GameModule<TrialGame, TrialView> = {
  advance(g, ctx, env) {
    switch (g.step) {
      case "charge":
        return ok({ ...g, step: "defence", stepEndsAt: ctx.now + timerMs("trialDefence") }, { line: line("trialDefence", "Mez, how do you plead? The floor is yours.", "মেজ, তুমি কী বলবে? সময় শুরু।") });
      case "defence":
        return ok({ ...g, step: "vote", stepEndsAt: ctx.now + timerMs("trialVote") }, { line: line("trialVote", "Jury, to your phones. Guilty or not guilty?", "জুরি, ফোন হাতে নিন। দোষী, না নির্দোষ?") });
      case "vote":
        return verdict(g, env);
      case "verdict": {
        if (g.index + 1 >= g.cases.length) return ok(g, { end: true });
        const c = g.cases[g.index + 1];
        return ok(
          { ...g, step: "charge", index: g.index + 1, roundId: ctx.newId(), plea: null, votes: {}, verdict: null },
          { line: line("trialCharge", `Next charge: Mez stands accused of ${c.charge}`, `পরের অভিযোগ: মেজের বিরুদ্ধে অভিযোগ, ${c.charge}`) },
        );
      }
    }
  },
  timeUp(g, ctx, env) {
    return g.step === "defence" || g.step === "vote" ? this.advance(g, ctx, env) : err("No timer running.");
  },
  act(g, a, actor, ctx, env) {
    if (a.type === "judge/plea") {
      if (actor.role !== "judge") return err("Only Mez can plead.");
      if (g.step !== "charge" && g.step !== "defence") return err("Too late to change your plea.");
      if (a.plea !== "guilty" && a.plea !== "not_guilty") return err("Plead guilty or not guilty.");
      return ok({ ...g, plea: a.plea }, { line: a.plea === "guilty" ? line("plea", "Mez pleads guilty! Bold move.", "মেজ দোষ স্বীকার করেছে! সাহসী সিদ্ধান্ত।") : line("plea", "Mez pleads not guilty.", "মেজ নিজেকে নির্দোষ দাবি করছে।") });
    }
    if (a.type === "judge/rest") {
      if (actor.role !== "judge") return err("Only Mez can rest the defence.");
      if (g.step !== "defence") return err("The defence isn't running.");
      return this.advance(g, ctx, env);
    }
    if (a.type === "game/vote") {
      if (actor.role !== "player") return err("Only the jury can vote.");
      if (g.step !== "vote") return err("The jury isn't voting right now.");
      if (g.votes[actor.playerId]) return err("You already voted.");
      if (a.choice !== "guilty" && a.choice !== "not_guilty") return err("Vote guilty or not guilty.");
      return ok({ ...g, votes: { ...g.votes, [actor.playerId]: a.choice } });
    }
    return err("Not part of this game.");
  },
  view(g, viewer, env) {
    const c = g.cases[g.index];
    const me = viewer.role === "player" ? viewer.playerId : null;
    return {
      id: "trial",
      step: g.step,
      stepEndsAt: g.stepEndsAt,
      index: g.index,
      total: g.cases.length,
      charge: c.charge,
      plea: g.plea,
      votesIn: Object.keys(g.votes).length,
      jurors: env.players.length,
      myVote: me ? (g.votes[me] ?? null) : null,
      verdict: g.step === "verdict" && g.verdict ? { ...g.verdict, accuser: { name: c.accuser.name, remote: c.accuser.remote } } : null,
    };
  },
  advanceLabel(g) {
    return { charge: "Start the defence", defence: "Jury, vote now", vote: "Read the verdict", verdict: "Next charge" }[g.step];
  },
};

export interface TrialView {
  id: "trial";
  step: TrialGame["step"];
  stepEndsAt: number | null;
  index: number;
  total: number;
  charge: string;
  plea: TrialGame["plea"];
  votesIn: number;
  jurors: number;
  myVote: "guilty" | "not_guilty" | null;
  verdict: { guilty: number; notGuilty: number; outcome: "guilty" | "not_guilty" | "hung"; accuser: { name: string; remote: boolean } } | null;
}
