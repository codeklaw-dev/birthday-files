import { SURVEY, timerMs } from "./config";
import { clip, reveal, clean, err, line, nameOf, ok, playerSubject, type GameModule, type GCtx, type Env } from "./common";
import { matchGuess } from "./text";
import type { Award, Step, SurveyContent, SurveyGame } from "./types";

/**
 * Mez Survey (Family Feud style). Boards come from guests' invite answers,
 * grouped on the server and approved by the host. Players guess the most
 * popular answers; you score per guest who gave the answer you matched.
 */

export function startSurvey(content: SurveyContent, ctx: GCtx): Step<SurveyGame> {
  const boards = content.boards.filter((b) => b.answers.length > 0);
  if (!boards.length) return err("No approved survey boards yet. Approve one in Games setup.");
  return ok(
    { id: "survey", roundId: ctx.newId(), step: "guess", stepEndsAt: ctx.now + timerMs("surveyGuess"), startedAt: ctx.now, index: 0, boards, guesses: {}, matches: {}, revealed: [] },
    {
      line: clip("game_survey_intro"),
      audit: `Mez Survey started with ${boards.length} approved board${boards.length > 1 ? "s" : ""}`,
    },
  );
}

function score(g: SurveyGame, env: Env): Step<SurveyGame> {
  const board = g.boards[g.index];
  const matches: Record<string, number | null> = {};
  const awards: Award[] = [];
  for (const [pid, guess] of Object.entries(g.guesses)) {
    const m = matchGuess(guess, board.answers);
    matches[pid] = m;
    const p = env.players.find((x) => x.id === pid);
    if (m !== null && p) {
      awards.push({ board: "live", subject: playerSubject(p), delta: board.answers[m].count * env.points.surveyPerPerson, rule: "surveyPerPerson", note: `"${guess}" matched "${board.answers[m].label}" (${board.answers[m].count} said it)` });
    }
  }
  return ok({ ...g, step: "reveal", stepEndsAt: null, matches }, { awards, line: reveal("surveyReveal", "Survey says…", "সার্ভে বলছে…") });
}

export const survey: GameModule<SurveyGame, SurveyView> = {
  advance(g, ctx, env) {
    if (g.step === "guess") return score(g, env);
    const board = g.boards[g.index];
    if (g.revealed.length < board.answers.length) {
      return ok({ ...g, revealed: board.answers.map((_, i) => i) }, { line: line("surveyAll", "Here's the whole board.", "এই হলো পুরো বোর্ড।") });
    }
    if (g.index + 1 >= g.boards.length) return ok(g, { end: true });
    const next = g.boards[g.index + 1];
    return ok(
      { ...g, step: "guess", index: g.index + 1, roundId: ctx.newId(), stepEndsAt: ctx.now + timerMs("surveyGuess"), guesses: {}, matches: {}, revealed: [] },
      { line: line("surveyNext", `Next survey: ${next.prompt}`, `পরের সার্ভে: ${next.prompt}`) },
    );
  },
  timeUp(g, _ctx, env) {
    return g.step === "guess" ? score(g, env) : err("No timer running.");
  },
  act(g, a, actor, _ctx, env) {
    if (a.type === "game/guess") {
      if (actor.role !== "player") return err("Only players can guess.");
      if (g.step !== "guess") return err("Guessing is closed.");
      if (g.guesses[actor.playerId] !== undefined) return err("You already answered.");
      const text = clean(a.text, SURVEY.guessMax);
      if (!text) return err("Type an answer.");
      return ok({ ...g, guesses: { ...g.guesses, [actor.playerId]: text } });
    }
    if (a.type === "host/game/reveal") {
      if (g.step !== "reveal") return err("Reveal after the guessing ends.");
      const board = g.boards[g.index];
      const hidden = board.answers.map((_, i) => i).filter((i) => !g.revealed.includes(i));
      const pick = a.index ?? hidden[hidden.length - 1]; // bottom of the board first
      if (pick === undefined || !hidden.includes(pick)) return err("Nothing left to reveal.");
      return ok({ ...g, revealed: [...g.revealed, pick] });
    }
    if (a.type === "host/game/accept") {
      if (actor.role !== "host") return err("Only the host can accept a guess.");
      if (g.step !== "reveal") return err("Accept guesses during the reveal.");
      const board = g.boards[g.index];
      if (g.guesses[a.playerId] === undefined) return err("That player didn't guess.");
      if (g.matches[a.playerId] !== null && g.matches[a.playerId] !== undefined) return err("That guess already scored.");
      if (!board.answers[a.answerIndex]) return err("Unknown answer.");
      const p = env.players.find((x) => x.id === a.playerId);
      if (!p) return err("Player left.");
      const ans = board.answers[a.answerIndex];
      return ok(
        { ...g, matches: { ...g.matches, [a.playerId]: a.answerIndex } },
        { awards: [{ board: "live", subject: playerSubject(p), delta: ans.count * env.points.surveyPerPerson, rule: "surveyPerPerson", note: `Host accepted "${g.guesses[a.playerId]}" as "${ans.label}"` }], audit: `Host accepted ${p.name}'s guess "${g.guesses[a.playerId]}" as "${ans.label}"` },
      );
    }
    return err("Not part of this game.");
  },
  view(g, viewer, env) {
    const board = g.boards[g.index];
    const me = viewer.role === "player" ? viewer.playerId : null;
    const scored = g.step === "reveal";
    return {
      id: "survey",
      step: g.step,
      stepEndsAt: g.stepEndsAt,
      index: g.index,
      total: g.boards.length,
      prompt: board.prompt,
      respondents: board.respondents,
      answers: board.answers.map((a, i) => {
        const shown = g.revealed.includes(i);
        return {
          rank: i + 1,
          label: shown ? a.label : null,
          count: shown ? a.count : null,
          matchedBy: shown ? Object.entries(g.matches).filter(([, m]) => m === i).map(([pid]) => nameOf(env, pid)) : [],
        };
      }),
      guessesIn: Object.keys(g.guesses).length,
      players: env.players.length,
      misses: scored ? Object.values(g.matches).filter((m) => m === null).length : 0,
      me: me ? { guess: g.guesses[me] ?? null, match: scored ? (g.matches[me] ?? null) : null, matchedLabel: scored && g.matches[me] != null && g.revealed.includes(g.matches[me]!) ? board.answers[g.matches[me]!].label : null } : null,
      unmatched:
        viewer.role === "host" && scored
          ? Object.entries(g.guesses)
              .filter(([pid]) => g.matches[pid] === null)
              .map(([pid, guess]) => ({ playerId: pid, name: nameOf(env, pid), guess }))
          : [],
      // The host sees the full board only once guessing has closed, so the operator can't peek.
      fullBoard: viewer.role === "host" && scored ? board.answers.map((a) => ({ label: a.label, count: a.count })) : null,
    };
  },
  advanceLabel(g) {
    if (g.step === "guess") return "Close guesses & score";
    return g.revealed.length < g.boards[g.index].answers.length ? "Reveal whole board" : g.index + 1 < g.boards.length ? "Next survey" : "Finish game";
  },
};

export interface SurveyView {
  id: "survey";
  step: SurveyGame["step"];
  stepEndsAt: number | null;
  index: number;
  total: number;
  prompt: string;
  respondents: number;
  answers: { rank: number; label: string | null; count: number | null; matchedBy: string[] }[];
  guessesIn: number;
  players: number;
  misses: number;
  me: { guess: string | null; match: number | null; matchedLabel: string | null } | null;
  unmatched: { playerId: string; name: string; guess: string }[];
  fullBoard: { label: string; count: number }[] | null;
}
