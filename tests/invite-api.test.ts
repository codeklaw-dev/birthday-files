import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import * as adminItem from "@/app/api/invite/admin/[id]/route";
import * as adminOrder from "@/app/api/invite/admin/order/route";
import * as admin from "@/app/api/invite/admin/route";
import * as mediaFileRoute from "@/app/api/invite/media/file/[id]/route";
import * as media from "@/app/api/invite/media/[kind]/route";
import * as settings from "@/app/api/invite/settings/route";
import * as me from "@/app/api/invite/submissions/me/route";
import * as submissions from "@/app/api/invite/submissions/route";
import { mp4DurationSec, sniff, stripJpegMetadata, webmDurationSec } from "@/lib/invite/server/files";
import { resetSigningKeyForTests, signedMediaUrl } from "@/lib/invite/server/secrets";
import { resetInviteStoreForTests } from "@/lib/invite/server/store";

const HOST = "test-host-key";
let ipN = 0;
let ip = "";
let dir = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "bf-invite-"));
  process.env.INVITE_DATA_DIR = dir;
  process.env.HOST_KEY = HOST;
  delete process.env.INVITE_SIGNING_SECRET;
  resetInviteStoreForTests();
  resetSigningKeyForTests();
  ip = `10.0.0.${++ipN}`;
});

const base = "http://localhost:3000";
const req = (method: string, url: string, init: { body?: BodyInit | null; json?: unknown; headers?: Record<string, string> } = {}) =>
  new NextRequest(base + url, {
    method,
    headers: { "x-forwarded-for": ip, ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.json !== undefined ? JSON.stringify(init.json) : (init.body ?? null),
    duplex: "half", // needed by Node for streamed request bodies
  } as ConstructorParameters<typeof NextRequest>[1]);
const params = <T>(p: T) => ({ params: Promise.resolve(p) });
const body = async (r: Response) => r.json();

const VALID = {
  name: "  Nadia   Rahman ",
  relationship: "Friend",
  rsvp: "yes",
  answers: { q1: "Biryani", q2: "Tum Hi Ho", q3: "Parallel parking" },
  memory: "The night we got lost in Sylhet.",
  accusation: "Stealing every last fuchka",
  consent: true,
};

async function create(data: Record<string, unknown> = VALID) {
  const r = await submissions.POST(req("POST", "/api/invite/submissions", { json: data }));
  return { status: r.status, ...(await body(r)) };
}

// --- tiny synthetic media files ---
const box = (type: string, payload: Buffer) => {
  const b = Buffer.alloc(8 + payload.length);
  b.writeUInt32BE(8 + payload.length, 0);
  b.write(type, 4, "latin1");
  payload.copy(b, 8);
  return b;
};
function mp4(seconds: number, brand = "isom") {
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12); // timescale
  mvhd.writeUInt32BE(seconds * 1000, 16); // duration
  return Buffer.concat([box("ftyp", Buffer.from(`${brand}\0\0\0\0isom`, "latin1")), box("mdat", Buffer.alloc(64)), box("moov", box("mvhd", mvhd))]);
}
function webm(durationMs: number | null) {
  const info = [Buffer.from([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40])];
  if (durationMs !== null) {
    const d = Buffer.alloc(8);
    d.writeDoubleBE(durationMs);
    info.push(Buffer.from([0x44, 0x89, 0x88]), d);
  }
  const infoBody = Buffer.concat(info);
  return Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x84]), Buffer.from("webm"),
    Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x80 | infoBody.length]), infoBody,
  ]);
}
function jpegWithGps() {
  const exif = Buffer.from("Exif\0\0GPSLatitude=23.8103;GPSLongitude=90.4125");
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0, exif.length + 2]), exif]);
  const dqt = Buffer.concat([Buffer.from([0xff, 0xdb, 0x00, 0x05]), Buffer.from([1, 2, 3])]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x04, 9, 9, 0x11, 0x22, 0x33, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, dqt, sos]);
}
const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

const upload = (token: string, kind: string, bytes: Buffer, headers: Record<string, string> = {}) =>
  media.PUT(req("PUT", `/api/invite/media/${kind}`, { body: new Uint8Array(bytes), headers: { "x-edit-token": token, ...headers } }), params({ kind }));

describe("guest submissions", () => {
  it("creates a submission, cleans the input and never returns the token hash", async () => {
    const r = await create();
    expect(r.status).toBe(201);
    expect(r.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(r.submission.data.name).toBe("Nadia Rahman");
    expect(JSON.stringify(r)).not.toContain("tokenHash");
    const stored = readFileSync(path.join(dir, "invite.json"), "utf8");
    expect(stored).not.toContain(r.token);
    expect(statSync(path.join(dir, "invite.json")).mode & 0o077).toBe(0);
  });

  it("validates required fields with messages per field", async () => {
    const r = await create({ ...VALID, name: " ", answers: { q1: "", q2: "x", q3: "y" }, rsvp: "perhaps" });
    expect(r.status).toBe(422);
    expect(Object.keys(r.fields)).toEqual(expect.arrayContaining(["name", "rsvp"]));
    const r2 = await create({ ...VALID, answers: { q1: "", q2: "x", q3: "y" } });
    expect(r2.fields["answers.q1"]).toMatch(/quick answer/);
    expect((await create({ ...VALID, memory: "x".repeat(601) })).status).toBe(422);
  });

  it("lets people who can't come skip the questions, and keeps remote contributors", async () => {
    expect((await create({ name: "Aunt Rina", relationship: "Family", rsvp: "no" })).status).toBe(201);
    const remote = await create({ ...VALID, rsvp: "remote" });
    expect(remote.submission.data.rsvp).toBe("remote");
  });

  it("survives a server restart", async () => {
    const { token } = await create();
    resetInviteStoreForTests();
    const r = await me.GET(req("GET", "/api/invite/submissions/me", { headers: { "x-edit-token": token } }));
    expect(r.status).toBe(200);
    expect((await body(r)).submission.data.name).toBe("Nadia Rahman");
  });

  it("only lets the token holder read, edit or withdraw", async () => {
    const { token } = await create();
    const get = (t: string) => me.GET(req("GET", "/api/invite/submissions/me", { headers: { "x-edit-token": t } }));
    expect((await get("nope")).status).toBe(401);
    expect((await get("A".repeat(32))).status).toBe(404);
    expect((await me.GET(req("GET", "/api/invite/submissions/me"))).status).toBe(401);
    const put = await me.PUT(req("PUT", "/api/invite/submissions/me", { json: { ...VALID, memory: "Changed" }, headers: { "x-edit-token": token } }));
    expect((await body(put)).submission.data.memory).toBe("Changed");
    const del = await me.DELETE(req("DELETE", "/api/invite/submissions/me", { headers: { "x-edit-token": token } }));
    expect(del.status).toBe(200);
    expect((await get(token)).status).toBe(404);
  });

  it("rate-limits submission spam per address", async () => {
    for (let i = 0; i < 6; i++) expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(429);
  });
});

describe("uploads", () => {
  it("strips EXIF/GPS from photos and decides the type from the bytes", async () => {
    const { token } = await create();
    const r = await upload(token, "photo", jpegWithGps(), { "content-type": "image/jpeg" });
    expect(r.status).toBe(200);
    const photo = (await body(r)).submission.photo;
    expect(photo.mime).toBe("image/jpeg");
    const files = readdirSync(path.join(dir, "media"));
    expect(files).toHaveLength(1);
    const saved = readFileSync(path.join(dir, "media", files[0]));
    expect(saved.includes(Buffer.from("GPS"))).toBe(false);
    expect(saved.includes(Buffer.from([0xff, 0xdb]))).toBe(true);
    expect(statSync(path.join(dir, "media", files[0])).mode & 0o077).toBe(0);
    expect((await upload(token, "photo", png())).status).toBe(200);
    expect(readdirSync(path.join(dir, "media"))).toHaveLength(1); // replaced, old file removed
  });

  it("rejects disguised, wrong-kind, empty and oversized files", async () => {
    const { token } = await create();
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    expect((await upload(token, "photo", html, { "content-type": "image/jpeg" })).status).toBe(415);
    expect((await upload(token, "video", jpegWithGps())).status).toBe(415);
    expect((await upload(token, "photo", Buffer.alloc(0))).status).toBe(400);
    expect((await upload(token, "photo", png(), { "content-length": String(50 * 1024 * 1024) })).status).toBe(413);
    const huge = Buffer.concat([jpegWithGps(), Buffer.alloc(13 * 1024 * 1024)]);
    expect((await upload(token, "photo", huge)).status).toBe(413);
    expect(readdirSync(path.join(dir, "media"))).toHaveLength(0); // nothing half-written left behind
    expect((await upload("bad-token", "photo", png())).status).toBe(401);
    expect((await media.PUT(req("PUT", "/api/invite/media/script", { body: new Uint8Array(png()), headers: { "x-edit-token": token } }), params({ kind: "script" }))).status).toBe(404);
  });

  it("accepts 15–60 second videos and measures them server-side", async () => {
    const { token } = await create();
    const ok = await upload(token, "video", mp4(20));
    expect(ok.status).toBe(200);
    expect((await body(ok)).submission.video).toMatchObject({ mime: "video/mp4", durationSec: 20, durationVerified: true });
    const short = await upload(token, "video", mp4(5));
    expect(short.status).toBe(422);
    expect((await body(short)).error).toMatch(/15–60 seconds \(this one is 5s\)/);
    expect((await upload(token, "video", mp4(75))).status).toBe(422);
    const mov = await upload(token, "video", mp4(30, "qt  "));
    expect((await body(mov)).submission.video.mime).toBe("video/quicktime");
  });

  it("falls back to the browser's duration for WebM recordings without one, within limits", async () => {
    const { token } = await create();
    const measured = await upload(token, "video", webm(20_000));
    expect((await body(measured)).submission.video).toMatchObject({ durationSec: 20, durationVerified: true });
    const claimed = await upload(token, "video", webm(null), { "x-video-duration": "31" });
    expect((await body(claimed)).submission.video).toMatchObject({ durationSec: 31, durationVerified: false });
    expect((await upload(token, "video", webm(null), { "x-video-duration": "90" })).status).toBe(422);
    expect((await upload(token, "video", webm(null))).status).toBe(422);
  });
});

describe("private media access", () => {
  it("serves files only with a valid, unexpired signature, with Range support", async () => {
    const { token } = await create();
    const photo = (await body(await upload(token, "photo", png()))).submission.photo;
    const id = photo.url.split("/").pop().split("?")[0];
    const get = (url: string, headers: Record<string, string> = {}) => mediaFileRoute.GET(req("GET", url, { headers }), params({ id: url.split("/").pop()!.split("?")[0] }));

    const ok = await get(photo.url);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toMatch(/private/);
    expect(Buffer.from(await ok.arrayBuffer())).toEqual(png());
    expect((await get(`/api/invite/media/file/${id}`)).status).toBe(403);
    expect((await get(photo.url.replace(/sig=[^&]+/, "sig=forged"))).status).toBe(403);
    expect((await get(signedMediaUrl(id, -1000))).status).toBe(403);
    expect((await get("/api/invite/media/file/..%2F..%2Finvite.json?exp=9999999999&sig=x")).status).toBe(403);

    const part = await get(photo.url, { range: "bytes=0-7" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe(`bytes 0-7/${png().length}`);
    expect(Buffer.from(await part.arrayBuffer())).toEqual(png().subarray(0, 8));
  });

  it("stops serving a file once the guest withdraws", async () => {
    const { token } = await create();
    const photo = (await body(await upload(token, "photo", png()))).submission.photo;
    await me.DELETE(req("DELETE", "/api/invite/submissions/me", { headers: { "x-edit-token": token } }));
    const id = photo.url.split("/").pop().split("?")[0];
    expect((await mediaFileRoute.GET(req("GET", photo.url), params({ id }))).status).toBe(404);
    expect(readdirSync(path.join(dir, "media"))).toHaveLength(0);
  });
});

describe("host moderation", () => {
  const host = { "x-host-key": HOST };

  it("requires the host key", async () => {
    expect((await admin.GET(req("GET", "/api/invite/admin"))).status).toBe(401);
    expect((await admin.GET(req("GET", "/api/invite/admin", { headers: { "x-host-key": "guess" } }))).status).toBe(401);
    expect((await adminItem.PATCH(req("PATCH", "/api/invite/admin/x", { json: { status: "approved" } }), params({ id: "x" }))).status).toBe(401);
    expect((await settings.PUT(req("PUT", "/api/invite/settings", { json: {} }))).status).toBe(401);
  });

  it("approves, tags, orders and returns guests to review after they edit", async () => {
    const a = await create();
    const b = await create({ ...VALID, name: "Rafi" });
    const c = await create({ ...VALID, name: "Private Person", consent: false });
    const patch = (id: string, json: unknown) => adminItem.PATCH(req("PATCH", `/api/invite/admin/${id}`, { json, headers: host }), params({ id }));

    const approved = await body(await patch(a.submission.id, { status: "approved", tags: ["Funny", "funny", "trial"], honourable: true }));
    expect(approved.submission.moderation).toMatchObject({ status: "approved", tags: ["funny", "trial"], honourable: true, order: 1 });
    expect(approved.submission.showable).toBe(true);
    await patch(b.submission.id, { status: "approved" });
    const priv = await body(await patch(c.submission.id, { status: "approved" }));
    expect(priv.submission).toMatchObject({ showable: false, moderation: { order: null } });
    expect((await patch(a.submission.id, { status: "published" })).status).toBe(422);
    expect((await patch(a.submission.id, { tags: ["<script>"] })).status).toBe(422);

    await adminOrder.PUT(req("PUT", "/api/invite/admin/order", { json: { ids: [b.submission.id, a.submission.id, c.submission.id] }, headers: host }));
    const list = await body(await admin.GET(req("GET", "/api/invite/admin", { headers: host })));
    const order = Object.fromEntries(list.submissions.map((s: { id: string; moderation: { order: number | null } }) => [s.id, s.moderation.order]));
    expect(order).toEqual({ [b.submission.id]: 1, [a.submission.id]: 2, [c.submission.id]: null });
    expect(list.stats).toMatchObject({ total: 3, approved: 3, consented: 2, rsvp: { yes: 3 } });
    expect(JSON.stringify(list)).not.toContain("tokenHash");

    await me.PUT(req("PUT", "/api/invite/submissions/me", { json: { ...VALID, accusation: "New charge" }, headers: { "x-edit-token": a.token } }));
    const after = (await body(await admin.GET(req("GET", "/api/invite/admin", { headers: host })))).submissions.find((s: { id: string }) => s.id === a.submission.id);
    expect(after.moderation).toMatchObject({ status: "pending", editedAfterReview: true, order: null });
  });

  it("deletes a submission and its files", async () => {
    const a = await create();
    await upload(a.token, "video", mp4(20));
    const del = await adminItem.DELETE(req("DELETE", `/api/invite/admin/${a.submission.id}`, { headers: host }), params({ id: a.submission.id }));
    expect(del.status).toBe(200);
    expect(readdirSync(path.join(dir, "media"))).toHaveLength(0);
    expect(existsSync(path.join(dir, "invite.json"))).toBe(true);
  });

  it("lets the host edit the three questions, which guests then see", async () => {
    const qs = [
      { id: "q1", prompt: "Mez's dream holiday destination?", placeholder: "" },
      { id: "q2", prompt: "Mez's most-used emoji?", placeholder: "" },
      { id: "q3", prompt: "Mez's karaoke song?", placeholder: "" },
    ];
    expect((await settings.PUT(req("PUT", "/api/invite/settings", { json: { questions: qs.slice(0, 2) }, headers: host }))).status).toBe(422);
    expect((await settings.PUT(req("PUT", "/api/invite/settings", { json: { questions: qs }, headers: host }))).status).toBe(200);
    expect((await body(await settings.GET(new Request("http://x/api/invite/settings")))).questions[1].prompt).toBe("Mez's most-used emoji?");
  });
});

describe("file helpers", () => {
  it("recognises formats by their bytes", () => {
    expect(sniff(new Uint8Array(png()))?.mime).toBe("image/png");
    expect(sniff(new Uint8Array(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")))?.mime).toBe("image/webp");
    expect(sniff(new Uint8Array(mp4(1).subarray(0, 64)))?.mime).toBe("video/mp4");
    expect(sniff(new Uint8Array(box("ftyp", Buffer.from("heic\0\0\0\0", "latin1"))))).toBeNull();
    expect(sniff(new Uint8Array(Buffer.from("GIF89a")))).toBeNull();
    expect(sniff(new Uint8Array(Buffer.from("<svg xmlns")))).toBeNull();
  });

  it("strips only metadata from JPEGs", () => {
    const out = Buffer.from(stripJpegMetadata(new Uint8Array(jpegWithGps())));
    expect(out.includes(Buffer.from("Exif"))).toBe(false);
    expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
  });

  it("reads MP4 and WebM durations", async () => {
    const d = mkdtempSync(path.join(tmpdir(), "bf-dur-"));
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(d, "a.mp4"), mp4(42));
    writeFileSync(path.join(d, "a.webm"), webm(12_500));
    writeFileSync(path.join(d, "b.webm"), webm(null));
    expect(await mp4DurationSec(path.join(d, "a.mp4"))).toBe(42);
    expect(await webmDurationSec(path.join(d, "a.webm"))).toBe(12.5);
    expect(await webmDurationSec(path.join(d, "b.webm"))).toBeNull();
  });
});
