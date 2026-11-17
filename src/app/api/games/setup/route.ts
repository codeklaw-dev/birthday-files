import { buildContent, eligibleSubmissions, proposeSurvey, surveyRaw } from "@/lib/games/server/content";
import { inviteStore } from "@/lib/invite/server/store";
import { isHostKey, roomStore } from "@/lib/server/room-store";

/** Host: everything needed to prepare the games (readiness, survey grouping, trial picks). */
export async function GET(req: Request) {
  if (!isHostKey(req.headers.get("x-host-key"))) return Response.json({ error: "Wrong host key." }, { status: 401 });
  const state = roomStore.getState();
  const eligible = eligibleSubmissions();
  const wkmb = buildContent("wkmb", state);
  const mystery = buildContent("mystery", state);
  const trial = buildContent("trial", state);
  return Response.json(
    {
      ok: true,
      eligibleCount: eligible.length,
      readiness: {
        imposter: { players: state.players.length },
        wkmb: { answers: wkmb.game === "wkmb" ? wkmb.content.questions.reduce((n, q) => n + q.answers.length, 0) : 0 },
        survey: { boards: Object.keys(state.setup.survey).length },
        contributors: eligible.map((s) => ({ id: s.id, name: s.data.name, remote: s.data.rsvp === "remote" })),
      trial: { cases: trial.game === "trial" ? trial.content.cases.length : 0 },
        mystery: { items: mystery.game === "mystery" ? mystery.content.items.length : 0 },
      },
      survey: inviteStore()
        .questions()
        .map((q) => ({ question: q, respondents: surveyRaw(q.id).length, proposed: proposeSurvey(q.id), approved: state.setup.survey[q.id] ?? null })),
      contributors: eligible.map((s) => ({ id: s.id, name: s.data.name, remote: s.data.rsvp === "remote" })),
      trial: {
        selected: state.setup.trialCaseIds,
        candidates: eligible.filter((s) => s.data.accusation).map((s) => ({ id: s.id, name: s.data.name, remote: s.data.rsvp === "remote", charge: s.data.accusation })),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
