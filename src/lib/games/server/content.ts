import "server-only";
import type { RoomState } from "@/lib/game/types";
import { inviteStore } from "@/lib/invite/server/store";
import type { Submission } from "@/lib/invite/types";
import { SURVEY } from "../config";
import { clean } from "../common";
import { groupAnswers, type ProposedGroup } from "../text";
import type { ContributorRef, GameContent, GameId, SurveyBoard } from "../types";

/**
 * Game content is always built here, on the server, from invite submissions
 * the host approved AND the guest allowed to be shown. Clients never send it.
 * Attending and remote contributors are treated the same.
 */

export function eligibleSubmissions(): Submission[] {
  return inviteStore()
    .list()
    .filter((s) => s.moderation.status === "approved" && s.data.consent && s.data.rsvp !== "no");
}

export const contributorRef = (s: Submission): ContributorRef => ({ id: s.id, name: s.data.name, remote: s.data.rsvp === "remote" });

export function buildContent(game: GameId, state: RoomState): GameContent {
  const subs = eligibleSubmissions();
  const questions = inviteStore().questions();
  switch (game) {
    case "imposter":
      return { game };
    case "wkmb":
      return {
        game,
        content: {
          questions: questions.map((q) => ({
            id: q.id,
            prompt: q.prompt,
            answers: subs.filter((s) => s.data.answers[q.id]).map((s) => ({ contributor: contributorRef(s), text: s.data.answers[q.id] })),
          })),
        },
      };
    case "survey":
      return { game, content: { boards: questions.map((q) => state.setup.survey[q.id]).filter((b): b is SurveyBoard & { approvedAt: number } => !!b) } };
    case "trial": {
      const chosen = state.setup.trialCaseIds;
      return {
        game,
        content: {
          cases: subs
            .filter((s) => s.data.accusation && (chosen === null || chosen.includes(s.id)))
            .map((s) => ({ id: s.id, charge: s.data.accusation, accuser: contributorRef(s) })),
        },
      };
    }
    case "mystery":
      return {
        game,
        content: {
          items: subs.flatMap((s) => {
            const c = contributorRef(s);
            const items: { id: string; contributor: ContributorRef; kind: "photo" | "video" | "memory"; mediaId?: string; text?: string }[] = [];
            if (s.photo) items.push({ id: `${s.id}:photo`, contributor: c, kind: "photo", mediaId: s.photo.id });
            if (s.video) items.push({ id: `${s.id}:video`, contributor: c, kind: "video", mediaId: s.video.id });
            if (s.data.memory) items.push({ id: `${s.id}:memory`, contributor: c, kind: "memory", text: s.data.memory });
            return items;
          }),
        },
      };
  }
}

/** Raw answers to one invite question, for survey grouping. */
export function surveyRaw(questionId: string) {
  return eligibleSubmissions()
    .map((s) => ({ by: s.id, text: s.data.answers[questionId as "q1" | "q2" | "q3"] ?? "" }))
    .filter((r) => r.text.trim());
}

export function proposeSurvey(questionId: string): ProposedGroup[] {
  return groupAnswers(surveyRaw(questionId));
}

/**
 * Turn the host's grouping (labels + which respondents belong together) into
 * a board. Counts are recomputed here from the real answers, so the host can
 * merge, rename or drop groups but can never inflate a count.
 */
export function buildSurveyBoard(questionId: string, groups: { label: string; members: string[] }[]): SurveyBoard | string {
  const q = inviteStore()
    .questions()
    .find((x) => x.id === questionId);
  if (!q) return "Unknown question.";
  const raw = surveyRaw(questionId);
  const byId = new Map(raw.map((r) => [r.by, r.text]));
  const used = new Set<string>();
  const answers: SurveyBoard["answers"] = [];
  for (const g of groups.slice(0, 50)) {
    const members = [...new Set((g.members ?? []).filter((m) => byId.has(m) && !used.has(m)))];
    if (!members.length) continue;
    members.forEach((m) => used.add(m));
    const label = clean(g.label, 60) || byId.get(members[0])!;
    answers.push({ label, count: members.length, aliases: [...new Set(members.map((m) => byId.get(m)!))].slice(0, 30) });
  }
  answers.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  if (!answers.length) return "Pick at least one group.";
  return { questionId, prompt: q.prompt, respondents: raw.length, answers: answers.slice(0, SURVEY.maxAnswersOnBoard) };
}

/** Name and remote flag for a contributor correction, from the invite store. */
export function contributorById(id: string): ContributorRef | null {
  const s = inviteStore().byId(id);
  return s ? contributorRef(s) : null;
}
