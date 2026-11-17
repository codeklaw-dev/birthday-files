import { IMPOSTER, timerMs } from "./config";
import { clean, err, line, nameOf, ok, playerSubject, shuffle, type Actor, type Env, type GameModule, type GCtx, type GameAction } from "./common";
import { similar } from "./text";
import type { Award, ImposterGame, Step } from "./types";

/**
 * Mez Imposter. Everyone gets the secret word except the imposter(s), who only
 * know the category. Everyone gives a one-word clue, then votes.
 */

export function startImposter(env: Env, ctx: GCtx): Step<ImposterGame> {
  const playing = env.players;
  if (playing.length < IMPOSTER.minPlayers) return err(`Imposter needs at least ${IMPOSTER.minPlayers} players on phones.`);
  const cat = IMPOSTER.words[Math.floor(ctx.random() * IMPOSTER.words.length)];
  const word = cat.words[Math.floor(ctx.random() * cat.words.length)];
  const count = playing.length >= IMPOSTER.twoImpostersFrom ? 2 : 1;
  const imposterIds = shuffle(playing.map((p) => p.id), ctx.random).slice(0, count);
  return ok(
    {
      id: "imposter",
      roundId: ctx.newId(),
      step: "deal",
      stepEndsAt: null,
      startedAt: ctx.now,
      category: cat.category,
      word,
      playerIds: playing.map((p) => p.id),
      imposterIds,
      clues: {},
      votes: {},
      wordGuesses: {},
      result: null,
    },
    {
      line: line(
        "imposter",
        `Mez Imposter! Check your phone, secretly. Everyone has the same word, except ${count === 1 ? "one imposter" : "two imposters"}. Category: ${cat.category}.`,
        `মেজ ইম্পোস্টার! গোপনে ফোন দেখুন। সবার একই শব্দ, শুধু ${count === 1 ? "একজন" : "দুজন"} ইম্পোস্টার ছাড়া। বিষয়: ${cat.category}।`,
        true,
      ),
      audit: `Imposter round dealt to ${playing.length} players (${count} imposter${count > 1 ? "s" : ""}), drawn at random`,
    },
  );
}

function reveal(g: ImposterGame, env: Env): Step<ImposterGame> & { end?: boolean } {
  const tally: Record<string, number> = {};
  for (const target of Object.values(g.votes)) tally[target] = (tally[target] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(tally));
  const topIds = max > 0 ? Object.keys(tally).filter((id) => tally[id] === max) : [];
  const caughtId = topIds.length === 1 && g.imposterIds.includes(topIds[0]) ? topIds[0] : null;
  const guessedBy = g.imposterIds.filter((id) => g.wordGuesses[id] && similar(g.wordGuesses[id], g.word));
  const p = env.points;
  const awards: Award[] = [];
  const subject = (id: string) => {
    const pl = env.players.find((x) => x.id === id);
    return pl ? playerSubject(pl) : null;
  };
  for (const id of g.playerIds) {
    const s = subject(id);
    if (!s) continue; // left the game
    if (g.imposterIds.includes(id)) {
      if (id !== caughtId) awards.push({ board: "live", subject: s, delta: p.imposterEscape, rule: "imposterEscape", note: "Imposter escaped" });
      if (guessedBy.includes(id)) awards.push({ board: "live", subject: s, delta: p.imposterWordGuess, rule: "imposterWordGuess", note: `Guessed the word "${g.word}"` });
    } else {
      if (g.imposterIds.includes(g.votes[id])) awards.push({ board: "live", subject: s, delta: p.imposterVotedRight, rule: "imposterVotedRight", note: "Voted for the imposter" });
      if (caughtId) awards.push({ board: "live", subject: s, delta: p.imposterCrewWin, rule: "imposterCrewWin", note: "Crew caught the imposter" });
    }
  }
  const names = g.imposterIds.map((id) => nameOf(env, id)).join(" and ");
  return ok(
    { ...g, step: "reveal", stepEndsAt: null, result: { tally, topIds, caught: !!caughtId, guessedBy } },
    {
      awards: awards.filter((a) => a.delta !== 0),
      line: caughtId
        ? line("imposterReveal", `Caught! The imposter was ${names}. The word was ${g.word}.`, `ধরা পড়েছে! ইম্পোস্টার ছিলেন ${names}। শব্দটা ছিল ${g.word}।`, true)
        : line("imposterReveal", `The imposter escapes! It was ${names} all along. The word was ${g.word}.`, `ইম্পোস্টার পালিয়ে গেল! এতক্ষণ ছিলেন ${names}। শব্দটা ছিল ${g.word}।`, true),
    },
  );
}

export const imposter: GameModule<ImposterGame, ImposterView> = {
  advance(g, ctx, env) {
    switch (g.step) {
      case "deal":
        return ok({ ...g, step: "clues", stepEndsAt: ctx.now + timerMs("imposterClues") }, { line: line("imposterClues", "One-word clues, please. Not too obvious, imposter.", "এক শব্দের সূত্র দিন। খুব সহজ নয়, ইম্পোস্টার।") });
      case "clues":
        return ok({ ...g, step: "cluesShown", stepEndsAt: null }, { line: line("imposterCluesShown", "Here are the clues. Somebody is bluffing.", "এই হলো সূত্রগুলো। কেউ একজন ভান করছেন।") });
      case "cluesShown":
        return ok({ ...g, step: "vote", stepEndsAt: ctx.now + timerMs("imposterVote") }, { line: line("imposterVote", "Vote! Who is the imposter?", "ভোট দিন! ইম্পোস্টার কে?") });
      case "vote":
        return reveal(g, env);
      case "reveal":
        return ok(g, { end: true });
    }
  },
  timeUp(g, ctx, env) {
    return g.step === "clues" || g.step === "vote" ? this.advance(g, ctx, env) : err("No timer running.");
  },
  act(g: ImposterGame, a: GameAction, actor: Actor) {
    if (actor.role !== "player") return err("Only players can do that.");
    const me = actor.playerId;
    if (!g.playerIds.includes(me)) return err("You joined after this round was dealt. Next round!");
    if (a.type === "game/clue") {
      if (g.step !== "clues") return err("Clues are closed.");
      if (g.clues[me]) return err("You already gave a clue.");
      const text = clean(a.text, IMPOSTER.clueMax);
      if (!text) return err("Type a clue.");
      if (!g.imposterIds.includes(me) && similar(text, g.word)) return err("No saying the word itself!");
      return ok({ ...g, clues: { ...g.clues, [me]: text } });
    }
    if (a.type === "game/vote") {
      if (g.step !== "vote") return err("Voting is closed.");
      if (g.votes[me]) return err("You already voted.");
      if (a.choice === me) return err("You can't vote for yourself.");
      if (!g.playerIds.includes(a.choice)) return err("Pick someone in this round.");
      return ok({ ...g, votes: { ...g.votes, [me]: a.choice } });
    }
    if (a.type === "game/guess") {
      if (!g.imposterIds.includes(me)) return err("Only the imposter can guess the word.");
      if (g.step !== "cluesShown" && g.step !== "vote") return err("Guess once the clues are shown.");
      if (g.wordGuesses[me]) return err("You already guessed.");
      const text = clean(a.text, 40);
      if (!text) return err("Type your guess.");
      return ok({ ...g, wordGuesses: { ...g.wordGuesses, [me]: text } });
    }
    return err("Not part of this game.");
  },
  view(g, viewer, env) {
    const players = g.playerIds.map((id) => ({ id, name: nameOf(env, id) }));
    const me = viewer.role === "player" && viewer.playerId ? viewer.playerId : null;
    const inRound = me ? g.playerIds.includes(me) : false;
    const shown = g.step === "cluesShown" || g.step === "vote" || g.step === "reveal";
    return {
      id: "imposter",
      step: g.step,
      stepEndsAt: g.stepEndsAt,
      category: g.category,
      players,
      cluesIn: Object.keys(g.clues).length,
      votesIn: Object.keys(g.votes).length,
      total: g.playerIds.length,
      me: me
        ? {
            role: !inRound ? "spectator" : g.imposterIds.includes(me) ? "imposter" : "crew",
            word: inRound && !g.imposterIds.includes(me) ? g.word : null,
            clue: g.clues[me] ?? null,
            vote: g.votes[me] ?? null,
            guess: g.wordGuesses[me] ?? null,
          }
        : null,
      clues: shown ? players.filter((p) => g.clues[p.id]).map((p) => ({ ...p, clue: g.clues[p.id] })) : [],
      reveal:
        g.step === "reveal" && g.result
          ? {
              word: g.word,
              imposters: g.imposterIds.map((id) => ({ id, name: nameOf(env, id) })),
              caught: g.result.caught,
              tally: players.map((p) => ({ ...p, votes: g.result!.tally[p.id] ?? 0 })).sort((a, b) => b.votes - a.votes),
              guessedWord: g.result.guessedBy.map((id) => nameOf(env, id)),
            }
          : null,
    };
  },
  advanceLabel(g) {
    return { deal: "Start clues", clues: "Show clues now", cluesShown: "Start the vote", vote: "Reveal the imposter", reveal: "Finish game" }[g.step];
  },
};

export interface ImposterView {
  id: "imposter";
  step: ImposterGame["step"];
  stepEndsAt: number | null;
  category: string;
  players: { id: string; name: string }[];
  cluesIn: number;
  votesIn: number;
  total: number;
  me: { role: "crew" | "imposter" | "spectator"; word: string | null; clue: string | null; vote: string | null; guess: string | null } | null;
  clues: { id: string; name: string; clue: string }[];
  reveal: { word: string; imposters: { id: string; name: string }[]; caught: boolean; tally: { id: string; name: string; votes: number }[]; guessedWord: string[] } | null;
}
