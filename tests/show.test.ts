import { describe, expect, it } from "vitest";
import { applyAction, createRoom, LIMITS, viewFor } from "@/lib/game/engine";
import type { Action, RoomState } from "@/lib/game/types";
import { defaultPlan, SEGMENT_INFO } from "@/lib/show/config";
import { validatePlan } from "@/lib/show/engine-show";
import { BIRTH_YEAR, HISTORY, uncoveredYears } from "@/lib/show/history";
import type { SceneContent } from "@/lib/show/types";

let n = 0;
const ctx = (now: number) => ({ now, newId: () => `id${++n}` });
const run = (s: RoomState, a: Action, now = 1000) => {
  const r = applyAction(s, a, ctx(now));
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const err = (s: RoomState, a: Action, now = 1000) => {
  const r = applyAction(s, a, ctx(now));
  return r.ok ? null : r.error;
};
const players = (count: number) => {
  let s = createRoom();
  for (let i = 0; i < count; i++) s = run(s, { type: "join", token: `token-p${i}xx`, name: `P${i}`, avatar: "🎈" });
  return s;
};
const spotlight: SceneContent = {
  kind: "spotlight",
  title: "Spotlight",
  subtitle: "",
  items: [
    { id: "a", kind: "memory", title: "A memory", text: "That trip to Sylhet", from: "Nadia", fromDetail: "Friend", mediaId: null, mediaKind: null },
    { id: "b", kind: "photo", title: "A photo", text: "", from: "Rafi", fromDetail: "Cousin", mediaId: "m1", mediaKind: "photo" },
  ],
};
const goScene = (s: RoomState, scene: SceneContent) => run(s, { type: "host/show/go", segmentId: s.show.plan.find((x) => x.kind === scene.kind)!.id, start: { type: "host/scene/start", scene } });

describe("running order", () => {
  it("defaults to optional segments about every 30 minutes, all waiting for the organiser", () => {
    const plan = defaultPlan();
    expect(plan.every((s) => s.status === "pending")).toBe(true);
    expect(plan[0].at).toBe("19:00");
    const mins = plan.map((s) => Number(s.at.slice(0, 2)) * 60 + Number(s.at.slice(3)));
    const gaps = mins.slice(1).map((m, i) => m - mins[i]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(30);
    for (const k of ["spotlight", "history", "cake", "ceremony", "prizes", "honours", "montage", "finale"]) expect(plan.some((s) => s.kind === k)).toBe(true);
    expect(Object.keys(SEGMENT_INFO)).toContain("game:mystery");
  });

  it("only goes live when started, and never moves on by itself", () => {
    let s = createRoom();
    const [first, second] = s.show.plan;
    s = run(s, { type: "host/show/go", segmentId: first.id, start: { type: "host/show/idle" } }, 1000);
    expect(s.show.currentId).toBe(first.id);
    // Hours later, nothing has advanced.
    expect(viewFor(s, "host", null, 10 * 3600_000).show.currentId).toBe(first.id);
    s = run(s, { type: "host/show/go", segmentId: second.id, start: null as never });
    expect(s.show.plan[0].status).toBe("done");
    expect(s.show.plan[1].status).toBe("live");
    s = run(s, { type: "host/show/skip", segmentId: s.show.plan[2].id });
    expect(s.show.plan[2].status).toBe("skipped");
    s = run(s, { type: "host/show/restore", segmentId: s.show.plan[2].id });
    expect(s.show.plan[2].status).toBe("pending");
  });

  it("refuses starters that aren't allowed and validates edits", () => {
    const s = createRoom();
    expect(err(s, { type: "host/show/go", segmentId: s.show.plan[0].id, start: { type: "host/award", playerId: "x", delta: 500 } })).toMatch(/can't be started/);
    expect(validatePlan([])).toMatch(/at least one/);
    expect(validatePlan([{ ...defaultPlan()[0], at: "7pm" }])).toMatch(/19:30/);
    expect(validatePlan([{ ...defaultPlan()[0], kind: "rm -rf" }])).toMatch(/Unknown segment/);
    const edited = validatePlan([{ ...defaultPlan()[0], title: "  Doors   open ", minutes: 45 }]);
    expect(typeof edited !== "string" && edited[0].title).toBe("Doors open");
  });
});

describe("pause and emergency stop", () => {
  it("freezes a question's timer, blocks answers, then gives back the time left", () => {
    let s = run(players(3), { type: "host/start" }, 0);
    const seconds = s.questions[0].seconds;
    s = run(s, { type: "host/show/pause" }, 4000);
    expect(s.questionEndsAt).toBeNull();
    expect(err(s, { type: "answer", token: "token-p0xx", optionIndex: 0 }, 5000)).toMatch(/Paused/);
    s = run(s, { type: "host/show/resume" }, 60_000);
    expect(s.questionEndsAt).toBe(60_000 + seconds * 1000 - 4000);
    expect(err(s, { type: "answer", token: "token-p0xx", optionIndex: 0 }, 61_000)).toBeNull();
  });

  it("emergency stop cuts speech, mutes the TV and restores sound on resume", () => {
    let s = run(players(1), { type: "host/setMuted", muted: false });
    const before = s.host.stopId;
    s = run(s, { type: "host/show/emergency" });
    expect(s.host.muted).toBe(true);
    expect(s.host.stopId).not.toBe(before);
    expect(viewFor(s, "display", null, 0).show.hold).toBe(true);
    expect(err(s, { type: "host/show/go", segmentId: s.show.plan[0].id })).toMatch(/Emergency/);
    s = run(s, { type: "host/show/resume" });
    expect(s.host.muted).toBe(false);
    expect(viewFor(s, "display", null, 0).show.hold).toBe(false);
  });
});

describe("scenes", () => {
  it("keeps spotlight senders anonymous until the reveal, and gives phones nothing", () => {
    let s = goScene(players(2), spotlight);
    expect(s.phase).toBe("scene");
    s = run(s, { type: "host/scene/next" });
    const tv = viewFor(s, "display", null, 0).scene!;
    expect(tv.index).toBe(0);
    expect(tv.items[0].from).toBeNull();
    expect(tv.items[1].from).toBeNull();
    expect(viewFor(s, "host", null, 0).scene!.items[0].from).toBe("Nadia");
    expect(viewFor(s, "player", "token-p0xx", 0).scene!.items).toEqual([]);
    expect(JSON.stringify(viewFor(s, "player", "token-p0xx", 0))).not.toContain("Sylhet");
    s = run(s, { type: "host/scene/reveal" });
    expect(viewFor(s, "display", null, 0).scene!.items[0].from).toBe("Nadia");
    expect(viewFor(s, "display", null, 0).scene!.items[1].from).toBeNull();
    s = run(s, { type: "host/scene/next" });
    expect(err(s, { type: "host/scene/next" })).toMatch(/last/);
    s = run(s, { type: "host/show/end" });
    expect(s.phase).toBe("lobby");
    expect(s.scene).toBeNull();
    expect(s.show.plan.find((x) => x.kind === "spotlight")!.status).toBe("done");
  });

  it("refuses an empty spotlight instead of showing a blank screen", () => {
    expect(err(createRoom(), { type: "host/show/go", segmentId: createRoom().show.plan.find((x) => x.kind === "spotlight")!.id, start: { type: "host/scene/start", scene: { ...spotlight, items: [] } } })).toMatch(/Nothing approved/);
  });
});

describe("the cake", () => {
  it("has 24 candles; guests blow all but Mez's; then cut and real cake", () => {
    let s = run(players(3), { type: "host/startCake" });
    expect(s.cake.candles).toBe(24);
    expect(LIMITS.candles).toBe(24);
    let taps = 0;
    while (!viewFor(s, "display", null, 0).cake.guestsDone && taps < 2000) {
      s = run(s, { type: "blow", token: `token-p${taps % 3}xx` });
      taps++;
    }
    expect(taps).toBeGreaterThan(20);
    expect(viewFor(s, "display", null, 0).cake.lit).toBe(1);
    expect(err(s, { type: "blow", token: "token-p0xx" })).toMatch(/Mez/);
    expect(err(s, { type: "host/cake/cut" })).toMatch(/Mez blows/);
    s = run(s, { type: "judge/cake/blow" });
    expect(viewFor(s, "display", null, 0).cake.lit).toBe(0);
    expect(s.host.utterance.cue).toBe("cakeDone");
    s = run(s, { type: "host/cake/cut" });
    expect(s.cake.stage).toBe("cut");
    s = run(s, { type: "host/cake/real" });
    expect(viewFor(s, "player", "token-p1xx", 0).cake.stage).toBe("real");
  });

  it("lets the organiser blow for Mez", () => {
    let s = run(players(1), { type: "host/startCake" });
    s = run(s, { type: "host/cake/mez" });
    expect(viewFor(s, "display", null, 0).cake.lit).toBe(0);
  });
});

describe("21 November history", () => {
  it("has only sourced, dated entries between Mez's birth and today", () => {
    expect(HISTORY.length).toBeGreaterThanOrEqual(12);
    for (const h of HISTORY) {
      expect(h.year).toBeGreaterThanOrEqual(BIRTH_YEAR);
      expect(h.year).toBeLessThanOrEqual(2026);
      expect(h.sourceUrl).toMatch(/^https:\/\/[^\s]+$/);
      expect(h.sourceName.length).toBeGreaterThan(1);
      expect(h.headline.length).toBeGreaterThan(5);
    }
    expect(new Set(HISTORY.map((h) => h.id)).size).toBe(HISTORY.length);
    expect(uncoveredYears()).not.toContain(2002);
  });
});
