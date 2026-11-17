import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";

process.env.INVITE_DATA_DIR = mkdtempSync(path.join(tmpdir(), "bf-show-api-"));
process.env.HOST_DATA_DIR = mkdtempSync(path.join(tmpdir(), "bf-show-host-"));
process.env.ROOM_PERSIST = "off";
process.env.HOST_KEY = "host-key-for-tests";
process.env.HOST_TTS_CHAIN = "mock";

const { POST: action } = await import("@/app/api/room/action/route");
const { GET: stream } = await import("@/app/api/room/stream/route");
const { POST: preview } = await import("@/app/api/show/preview/route");
const { inviteStore } = await import("@/lib/invite/server/store");
const { roomStore } = await import("@/lib/server/room-store");
const { EMPTY_FORM } = await import("@/lib/invite/schema");

const HOST = { "x-host-key": "host-key-for-tests" };
const send = (body: unknown, headers: Record<string, string> = {}) =>
  action(new Request("http://x/api/room/action", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const seg = (kind: string) => roomStore.getState().show.plan.find((s) => s.kind === kind)!.id;

async function firstView(query: string) {
  const res = await stream(new NextRequest(`http://x/api/room/stream?${query}`));
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  return JSON.parse(new TextDecoder().decode(value).replace(/^data: /, "").trim());
}

function submit(name: string, memory: string, opts: { consent?: boolean; approve?: boolean; honourable?: boolean; rsvp?: "yes" | "remote" } = {}) {
  const store = inviteStore();
  const { submission } = store.create({ ...EMPTY_FORM, name, memory, rsvp: opts.rsvp ?? "yes", consent: opts.consent ?? true, answers: { q1: "a", q2: "b", q3: "c" } });
  if (opts.approve !== false) store.moderate(submission.id, { status: "approved", honourable: opts.honourable ?? false });
  return submission.id;
}

beforeAll(() => {
  submit("Tahsin", "The rooftop karaoke night", { honourable: true });
  submit("Remote Rumana", "Miss you from Toronto", { rsvp: "remote", honourable: true });
  submit("Shy", "SECRET-NO-CONSENT", { consent: false });
  submit("Pending", "SECRET-PENDING", { approve: false });
});

describe("show director routes", () => {
  it("never accepts scene content from a client", async () => {
    const res = await send({ type: "host/scene/start", scene: { kind: "spotlight", title: "x", subtitle: "", items: [{ id: "1", kind: "memory", title: "fake", text: "INJECTED", from: "x" }] } }, HOST);
    expect(res.status).toBe(403);
  });

  it("previews a segment without changing the room", async () => {
    const rev = roomStore.getState().rev;
    const res = await preview(new Request("http://x/api/show/preview", { method: "POST", headers: HOST, body: JSON.stringify({ segmentId: seg("spotlight"), index: 0 }) }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.view.phase).toBe("scene");
    expect(body.view.scene.items[0].text).toBe("The rooftop karaoke night");
    expect(body.view.scene.items[0].from).toBeNull();
    expect(roomStore.getState().rev).toBe(rev);
    expect(roomStore.getState().phase).toBe("lobby");
    expect((await preview(new Request("http://x/api/show/preview", { method: "POST", body: JSON.stringify({ segmentId: seg("spotlight") }) }))).status).toBe(401);
  });

  it("builds the spotlight from approved, consented guests only and hides the sender", async () => {
    expect((await send({ type: "host/show/go", segmentId: seg("spotlight"), start: { type: "host/award", playerId: "x", delta: 500 } }, HOST)).status).toBe(200);
    const st = roomStore.getState();
    expect(st.phase).toBe("scene");
    const all = JSON.stringify(st.scene);
    expect(all).toContain("rooftop karaoke");
    expect(all).not.toContain("SECRET");
    expect(all).not.toContain("Toronto"); // remote friends go to honours / montage, not the in-room spotlight
    expect((await send({ type: "host/scene/next" }, HOST)).status).toBe(200);
    const tv = await firstView("role=display");
    expect(tv.scene.items[0].from).toBeNull();
    expect(JSON.stringify(tv)).not.toContain("Tahsin");
    const phone = await firstView("role=player&token=nobody-token");
    expect(phone.scene.items).toEqual([]);
    expect((await send({ type: "host/scene/reveal" }, HOST)).status).toBe(200);
    expect((await firstView("role=display")).scene.items[0].from).toBe("Tahsin");
    expect((await send({ type: "host/show/end" }, HOST)).status).toBe(200);
  });

  it("honours include remote guests; history carries its sources", async () => {
    expect((await send({ type: "host/show/go", segmentId: seg("honours") }, HOST)).status).toBe(200);
    expect(roomStore.getState().scene!.items.map((i) => i.from)).toEqual(["Tahsin", "Remote Rumana"]);
    expect((await send({ type: "host/show/go", segmentId: seg("history") }, HOST)).status).toBe(200);
    const items = roomStore.getState().scene!.items;
    expect(items.every((i) => i.sourceUrl?.startsWith("https://"))).toBe(true);
    expect(items.some((i) => /ICC|assassinated/.test(i.title))).toBe(false); // serious items off by default
  });

  it("only Mez's judge phone (or the organiser) blows the last candle", async () => {
    await send({ type: "host/show/idle" }, HOST);
    expect((await send({ type: "host/show/go", segmentId: seg("cake") }, HOST)).status).toBe(200);
    expect((await send({ type: "judge/cake/blow" })).status).toBe(401);
    expect((await send({ type: "judge/cake/blow" }, { "x-judge-key": roomStore.judgeKey() })).status).toBe(200);
    expect(roomStore.getState().cake.mezOut).toBe(true);
  });

  it("pause and emergency stop need the host key", async () => {
    expect((await send({ type: "host/show/emergency" })).status).toBe(401);
    expect((await send({ type: "host/show/emergency" }, HOST)).status).toBe(200);
    expect((await firstView("role=display")).show.hold).toBe(true);
    expect((await send({ type: "host/show/resume" }, HOST)).status).toBe(200);
  });
});
