import { MYSTERY, timerMs } from "./config";
import { err, line, nameOf, ok, playerSubject, shuffle, type GameModule, type GCtx } from "./common";
import type { Award, MysteryContent, MysteryGame, Step } from "./types";

/**
 * Mystery Files. A photo, video or memory from the invite appears with no
 * name. Mez guesses on the judge phone and the room guesses on their phones;
 * then the contributor is revealed.
 */

export function startMystery(content: MysteryContent, ctx: GCtx): Step<MysteryGame> {
  const items = shuffle(content.items, ctx.random).slice(0, MYSTERY.maxItems);
  if (!items.length) return err("No approved photos, videos or memories yet.");
  const suspects = [...new Map(items.map((i) => [i.contributor.id, { id: i.contributor.id, name: i.contributor.name }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  return ok(
    { id: "mystery", roundId: ctx.newId(), step: "exhibit", stepEndsAt: null, startedAt: ctx.now, index: 0, items, suspects, guesses: {}, mezGuess: null, mezRecord: { right: 0, total: 0 } },
    {
      line: line("mystery", "Mystery Files. Exhibit one. Who sent this? Mez, you have the case.", "মিস্ট্রি ফাইলস। প্রথম প্রমাণ। এটা কে পাঠিয়েছে? মেজ, তদন্ত তোমার।", true),
      audit: `Mystery Files started with ${items.length} exhibit${items.length > 1 ? "s" : ""}`,
    },
  );
}

export const mystery: GameModule<MysteryGame, MysteryView> = {
  advance(g, ctx, env) {
    switch (g.step) {
      case "exhibit":
        return ok({ ...g, step: "guess", stepEndsAt: ctx.now + timerMs("mysteryGuess") }, { line: line("mysteryGuess", "Make your guesses! Whose file is this?", "অনুমান করুন! এটা কার ফাইল?") });
      case "guess": {
        const item = g.items[g.index];
        const awards: Award[] = [];
        for (const [pid, sid] of Object.entries(g.guesses)) {
          const p = env.players.find((x) => x.id === pid);
          if (p && sid === item.contributor.id) awards.push({ board: "live", subject: playerSubject(p), delta: env.points.mysteryCorrectGuess, rule: "mysteryCorrectGuess", note: `Recognised ${item.contributor.name}'s ${item.kind}` });
        }
        const mezRight = g.mezGuess === item.contributor.id;
        const record = g.mezGuess ? { right: g.mezRecord.right + (mezRight ? 1 : 0), total: g.mezRecord.total + 1 } : g.mezRecord;
        return ok(
          { ...g, step: "reveal", stepEndsAt: null, mezRecord: record },
          {
            awards,
            line: mezRight
              ? line("mysteryReveal", `Mez cracked it! This file belongs to ${item.contributor.name}.`, `মেজ ধরে ফেলেছে! এটা ${item.contributor.name}-এর ফাইল।`, true)
              : line("mysteryReveal", `This file belongs to ${item.contributor.name}!`, `এটা ${item.contributor.name}-এর ফাইল!`, true),
          },
        );
      }
      case "reveal": {
        if (g.index + 1 >= g.items.length) return ok(g, { end: true });
        return ok(
          { ...g, step: "exhibit", index: g.index + 1, roundId: ctx.newId(), guesses: {}, mezGuess: null },
          { line: line("mysteryNext", `Exhibit ${g.index + 2}.`, `প্রমাণ নম্বর ${g.index + 2}।`) },
        );
      }
    }
  },
  timeUp(g, ctx, env) {
    return g.step === "guess" ? this.advance(g, ctx, env) : err("No timer running.");
  },
  act(g, a, actor) {
    const valid = (id: string) => g.suspects.some((s) => s.id === id);
    if (a.type === "judge/guess") {
      if (actor.role !== "judge") return err("Only Mez makes this call.");
      if (g.step === "reveal") return err("Already revealed.");
      if (!valid(a.suspectId)) return err("Pick someone from the list.");
      return ok({ ...g, mezGuess: a.suspectId });
    }
    if (a.type === "game/vote") {
      if (actor.role !== "player") return err("Only players can guess.");
      if (g.step !== "guess") return err("Guessing isn't open.");
      if (g.guesses[actor.playerId]) return err("You already guessed.");
      if (!valid(a.choice)) return err("Pick someone from the list.");
      return ok({ ...g, guesses: { ...g.guesses, [actor.playerId]: a.choice } });
    }
    return err("Not part of this game.");
  },
  view(g, viewer, env) {
    const item = g.items[g.index];
    const me = viewer.role === "player" ? viewer.playerId : null;
    const revealed = g.step === "reveal";
    const suspect = (id: string | null) => g.suspects.find((s) => s.id === id)?.name ?? null;
    return {
      id: "mystery",
      step: g.step,
      stepEndsAt: g.stepEndsAt,
      index: g.index,
      total: g.items.length,
      exhibit: { kind: item.kind, text: item.text ?? null, mediaId: item.mediaId ?? null, mediaUrl: null },
      suspects: g.suspects,
      guessesIn: Object.keys(g.guesses).length,
      players: env.players.length,
      mezHasGuessed: g.mezGuess !== null,
      mezGuess: viewer.role === "judge" || revealed ? suspect(g.mezGuess) : null,
      myGuess: me ? suspect(g.guesses[me] ?? null) : null,
      mezRecord: g.mezRecord,
      reveal: revealed
        ? {
            name: item.contributor.name,
            remote: item.contributor.remote,
            mezRight: g.mezGuess === item.contributor.id,
            correct: Object.entries(g.guesses)
              .filter(([, sid]) => sid === item.contributor.id)
              .map(([pid]) => nameOf(env, pid)),
          }
        : null,
    };
  },
  advanceLabel(g) {
    return { exhibit: "Open guessing", guess: "Reveal the contributor", reveal: "Next exhibit" }[g.step];
  },
};

export interface MysteryView {
  id: "mystery";
  step: MysteryGame["step"];
  stepEndsAt: number | null;
  index: number;
  total: number;
  /** mediaUrl is filled in by the server (signed link) for screens allowed to show it. */
  exhibit: { kind: "photo" | "video" | "memory"; text: string | null; mediaId: string | null; mediaUrl: string | null };
  suspects: { id: string; name: string }[];
  guessesIn: number;
  players: number;
  mezHasGuessed: boolean;
  mezGuess: string | null;
  myGuess: string | null;
  mezRecord: { right: number; total: number };
  reveal: { name: string; remote: boolean; mezRight: boolean; correct: string[] } | null;
}
