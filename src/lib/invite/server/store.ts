import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { DEFAULT_QUESTIONS, type Question } from "../config";
import type { GuestData } from "../schema";
import type { InviteStats, MediaKind, MediaRef, Moderation, Submission } from "../types";
import { dbFile, inviteDir, mediaDir, mediaFile } from "./paths";
import { hashToken, newEditToken } from "./secrets";

/**
 * Invite storage: one JSON file plus a private media folder on the server's
 * disk (the "existing backend" until Supabase arrives). Every method maps to
 * a table operation, so swapping in Supabase means re-implementing this file.
 * Writes are serialised and atomic (write temp file, then rename).
 */

interface Db {
  version: 1;
  submissions: Submission[];
  questions: Question[];
}

const freshModeration = (): Moderation => ({
  status: "pending",
  tags: [],
  honourable: false,
  note: "",
  order: null,
  reviewedAt: null,
  editedAfterReview: false,
});

class InviteStore {
  private db: Db | null = null;

  private load(): Db {
    if (this.db) return this.db;
    try {
      const raw = JSON.parse(readFileSync(dbFile(), "utf8")) as Db;
      if (raw.version === 1 && Array.isArray(raw.submissions)) return (this.db = raw);
    } catch {}
    return (this.db = { version: 1, submissions: [], questions: DEFAULT_QUESTIONS });
  }

  private save() {
    mkdirSync(inviteDir(), { recursive: true, mode: 0o700 });
    const tmp = `${dbFile()}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db), { mode: 0o600 });
    renameSync(tmp, dbFile());
  }

  /** Run a change against the data and persist it. Node runs this synchronously, so writes never interleave. */
  private mutate<T>(fn: (db: Db) => T): T {
    const db = this.load();
    const result = fn(db);
    this.save();
    return result;
  }

  // ---- questions ----
  questions(): Question[] {
    return this.load().questions;
  }
  setQuestions(questions: Question[]) {
    this.mutate((db) => (db.questions = questions));
  }

  // ---- guest operations (by secret edit token) ----
  create(data: GuestData, now = Date.now()): { submission: Submission; token: string } {
    const token = newEditToken();
    const submission: Submission = {
      id: randomUUID(),
      tokenHash: hashToken(token),
      createdAt: now,
      updatedAt: now,
      data,
      photo: null,
      video: null,
      moderation: freshModeration(),
    };
    this.mutate((db) => db.submissions.push(submission));
    return { submission, token };
  }

  byToken(token: string): Submission | null {
    const h = hashToken(token);
    return this.load().submissions.find((s) => s.tokenHash === h) ?? null;
  }

  /** Guest edit. A reviewed submission goes back to pending so the host sees the change. */
  update(token: string, data: GuestData, now = Date.now()): Submission | null {
    return this.mutate(() => {
      const s = this.byToken(token);
      if (!s) return null;
      s.data = data;
      s.updatedAt = now;
      this.markEdited(s);
      return s;
    });
  }

  private markEdited(s: Submission) {
    if (s.moderation.status !== "pending") {
      s.moderation.status = "pending";
      s.moderation.editedAfterReview = true;
      s.moderation.order = null;
    }
  }

  setMedia(token: string, kind: MediaKind, ref: MediaRef, now = Date.now()): Submission | null {
    return this.mutate(() => {
      const s = this.byToken(token);
      if (!s) return null;
      const old = s[kind];
      if (old) rmSync(mediaFile(old.id, old.ext), { force: true });
      s[kind] = ref;
      s.updatedAt = now;
      this.markEdited(s);
      return s;
    });
  }

  removeMedia(token: string, kind: MediaKind, now = Date.now()): Submission | null {
    return this.mutate(() => {
      const s = this.byToken(token);
      if (!s) return null;
      const old = s[kind];
      if (old) rmSync(mediaFile(old.id, old.ext), { force: true });
      s[kind] = null;
      s.updatedAt = now;
      return s;
    });
  }

  /** Guest withdraws: the record and its files are deleted, not hidden. */
  deleteByToken(token: string): boolean {
    const s = this.byToken(token);
    return s ? this.deleteById(s.id) : false;
  }

  // ---- host operations ----
  list(): Submission[] {
    return this.load().submissions;
  }

  byId(id: string): Submission | null {
    return this.load().submissions.find((s) => s.id === id) ?? null;
  }

  moderate(id: string, patch: Partial<Pick<Moderation, "status" | "tags" | "honourable" | "note">>, now = Date.now()): Submission | null {
    return this.mutate((db) => {
      const s = db.submissions.find((x) => x.id === id);
      if (!s) return null;
      const m = s.moderation;
      if (patch.status && patch.status !== m.status) {
        m.status = patch.status;
        m.reviewedAt = now;
        m.editedAfterReview = false;
      }
      if (patch.tags) m.tags = [...new Set(patch.tags)];
      if (patch.honourable !== undefined) m.honourable = patch.honourable;
      if (patch.note !== undefined) m.note = patch.note;
      // Keep the running order to approved submissions the guest allowed us to show.
      const showable = m.status === "approved" && s.data.consent;
      if (!showable) m.order = null;
      else if (m.order === null) m.order = Math.max(0, ...db.submissions.map((x) => x.moderation.order ?? 0)) + 1;
      return s;
    });
  }

  /** Set the running order from a list of ids (others keep no position). */
  reorder(ids: string[]) {
    this.mutate((db) => {
      let n = 1;
      for (const id of ids) {
        const s = db.submissions.find((x) => x.id === id);
        if (s && s.moderation.status === "approved" && s.data.consent) s.moderation.order = n++;
      }
    });
  }

  deleteById(id: string): boolean {
    return this.mutate((db) => {
      const i = db.submissions.findIndex((s) => s.id === id);
      if (i < 0) return false;
      const [s] = db.submissions.splice(i, 1);
      for (const m of [s.photo, s.video]) if (m) rmSync(mediaFile(m.id, m.ext), { force: true });
      return true;
    });
  }

  mediaById(mediaId: string): { ref: MediaRef; submission: Submission } | null {
    for (const s of this.load().submissions) {
      for (const ref of [s.photo, s.video]) if (ref?.id === mediaId) return { ref, submission: s };
    }
    return null;
  }

  stats(): InviteStats {
    const subs = this.load().submissions;
    const count = (f: (s: Submission) => boolean) => subs.filter(f).length;
    return {
      total: subs.length,
      rsvp: { yes: count((s) => s.data.rsvp === "yes"), maybe: count((s) => s.data.rsvp === "maybe"), remote: count((s) => s.data.rsvp === "remote"), no: count((s) => s.data.rsvp === "no") },
      pending: count((s) => s.moderation.status === "pending"),
      approved: count((s) => s.moderation.status === "approved"),
      rejected: count((s) => s.moderation.status === "rejected"),
      withPhoto: count((s) => !!s.photo),
      withVideo: count((s) => !!s.video),
      consented: count((s) => s.data.consent),
    };
  }

  /** Make sure the private media folder exists (mode 700). */
  ensureMediaDir() {
    mkdirSync(mediaDir(), { recursive: true, mode: 0o700 });
  }
}

const g = globalThis as unknown as { __inviteStore?: InviteStore };
export const inviteStore = () => (g.__inviteStore ??= new InviteStore());
export function resetInviteStoreForTests() {
  g.__inviteStore = new InviteStore();
}
