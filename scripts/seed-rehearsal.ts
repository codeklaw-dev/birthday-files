/**
 * Fills the rehearsal data folders with FICTIONAL guests and sample media.
 * Run by scripts/rehearsal.mjs (never on its own against real data: the
 * stores refuse non-rehearsal folders while REHEARSAL=1).
 *
 * Copies only the organiser's host personality and narration approvals from
 * the real host knowledge — never facts, announcements or conversations.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

if (process.env.REHEARSAL !== "1") throw new Error("Run this through `npm run rehearsal`.");

async function main() {
  const { inviteStore } = await import("@/lib/invite/server/store");
  const { inviteDir, mediaFile } = await import("@/lib/invite/server/paths");
  const { EMPTY_FORM } = await import("@/lib/invite/schema");
  const { guardDataDir } = await import("@/lib/server/rehearsal");

  // Check every folder BEFORE deleting anything: only .../rehearsal/... folders are ever wiped.
  const roomDir = guardDataDir(process.env.ROOM_DATA_DIR ?? "", "the room snapshot");
  const hostDir = guardDataDir(process.env.HOST_DATA_DIR ?? "", "the host knowledge");
  const invDir = inviteDir();

  const root = process.cwd();
  const media = (f: string) => path.join(root, "rehearsal", "media", f);

  // Start clean every time: the rehearsal never accumulates anything.
  for (const dir of [invDir, roomDir, hostDir]) rmSync(dir, { recursive: true, force: true });
  mkdirSync(roomDir, { recursive: true });
  mkdirSync(hostDir, { recursive: true, mode: 0o700 });

  // Host personality + narration approvals only.
  const realHost = path.join(root, ".data", "host", "knowledge.json");
  const host = existsSync(realHost) ? JSON.parse(readFileSync(realHost, "utf8")) : null;
  writeFileSync(
    path.join(hostDir, "knowledge.json"),
    JSON.stringify({
      version: 1,
      ...(host?.personality ? { personality: host.personality } : {}),
      narration: host?.narration ?? {},
      facts: [
        { id: "f1", text: "Mez's favourite late-night snack is fuchka (sample fact).", status: "approved", source: "organiser", createdAt: Date.now() },
      ],
      announcements: [],
      conversation: [],
    }),
    { mode: 0o600 },
  );

  type G = { name: string; rel: (typeof EMPTY_FORM)["relationship"]; rsvp: "yes" | "remote"; memory: string; accusation?: string; photo?: string; video?: string; honourable?: boolean; consent?: boolean; approve?: boolean; missingPhoto?: boolean; answers: [string, string, string] };
  const GUESTS: G[] = [
    { name: "Nila (sample)", rel: "Best friend", rsvp: "yes", memory: "The night we got lost looking for the fuchka stall and found a karaoke bar instead.", accusation: "Always takes the last bite", photo: "sample-photo-1.jpg", video: "sample-video-1.mp4", honourable: true, answers: ["Fuchka", "Tum Hi Ho", "Parallel parking"] },
    { name: "Omar (sample)", rel: "Family", rsvp: "yes", memory: "Teaching Mez to ride a bike. Mez taught me to fall off one.", photo: "sample-photo-2.jpg", answers: ["Biryani", "Shape of You", "Mimicry"] },
    { name: "Priya (sample)", rel: "Colleague", rsvp: "remote", memory: "Every Monday stand-up got better the day Mez joined.", video: "sample-video-2.mp4", honourable: true, answers: ["Pizza", "Levitating", "Spreadsheets"] },
    { name: "Kabir (sample)", rel: "Classmate", rsvp: "yes", memory: "Mez once argued a teacher into extending a deadline for the whole class.", accusation: "Never replies to the group chat", answers: ["Kacchi biryani", "Bohemian Rhapsody", "Debating"] },
    { name: "Lena (sample)", rel: "Friend", rsvp: "yes", memory: "Road trip snacks: 40. Road trip kilometres: 12.", photo: "sample-photo-3.jpg", video: "sample-video-3.mp4", answers: ["Fuchka!", "Tum hi ho", "Baking"] },
    { name: "Tomas (sample)", rel: "Neighbour", rsvp: "yes", memory: "This photo file is missing on purpose, to test the TV's fallback.", photo: "sample-photo-1.jpg", missingPhoto: true, honourable: true, answers: ["Momo", "Imagine", "Gardening"] },
    // These two must NEVER appear anywhere in the show:
    { name: "NO-CONSENT (sample)", rel: "Other", rsvp: "yes", memory: "SECRET-NO-CONSENT", consent: false, answers: ["x", "y", "z"] },
    { name: "UNREVIEWED (sample)", rel: "Other", rsvp: "yes", memory: "SECRET-UNREVIEWED", approve: false, answers: ["x", "y", "z"] },
  ];

  const store = inviteStore();
  store.ensureMediaDir();
  const attach = (token: string, kind: "photo" | "video", file: string, missing = false) => {
    const ext = kind === "photo" ? "jpg" : "mp4";
    const id = randomUUID();
    if (!missing) copyFileSync(media(file), mediaFile(id, ext));
    store.setMedia(token, kind, { id, kind, mime: kind === "photo" ? "image/jpeg" : "video/mp4", ext, bytes: statSync(media(file)).size, ...(kind === "video" ? { durationSec: 16, durationVerified: true } : {}), uploadedAt: Date.now() });
  };

  for (const g of GUESTS) {
    const { submission, token } = store.create({
      ...EMPTY_FORM,
      name: g.name,
      relationship: g.rel,
      rsvp: g.rsvp,
      memory: g.memory,
      accusation: g.accusation ?? "",
      consent: g.consent ?? true,
      answers: { q1: g.answers[0], q2: g.answers[1], q3: g.answers[2] },
    });
    if (g.photo) attach(token, "photo", g.photo, g.missingPhoto);
    if (g.video) attach(token, "video", g.video);
    if (g.approve !== false) store.moderate(submission.id, { status: "approved", honourable: !!g.honourable });
  }

  console.log(`Rehearsal data ready: ${GUESTS.length} fictional guests in ${inviteDir()}`);
}

void main();
