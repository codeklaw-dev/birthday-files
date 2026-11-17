import "server-only";
import { guardDataDir } from "@/lib/server/rehearsal";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Bilingual, Lang } from "@/lib/game/types";
import { PERSONA } from "@/lib/host/persona";

/**
 * What the AI host knows, kept apart from game state:
 *  - personality (organiser-editable)
 *  - guest facts, used in prompts only once approved
 *  - surprise announcements, playable only once approved
 *  - narration clip approvals (the TV plays approved clips only)
 *  - a short memory of the push-to-talk conversation
 * Nothing here can change scores or scenes; it's text for prompts and speech.
 * Stored privately (.data/host, never under public/).
 */

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Personality {
  name: Bilingual;
  style: string;
  rules: string[];
  updatedAt: number | null;
}

export interface Fact {
  id: string;
  text: string;
  source: "organiser" | "invite";
  /** For invite-derived facts: submission id + field, to avoid duplicates. */
  ref?: string;
  status: ReviewStatus;
  createdAt: number;
}

export interface Announcement {
  id: string;
  title: string;
  text: Bilingual;
  status: ReviewStatus;
  createdAt: number;
  /** Pre-generated speech per language once approved: cached, failed (will fall back), or not needed. */
  prepared: Partial<Record<Lang, "cached" | "failed" | "pending">>;
}

export interface NarrationApproval {
  status: Exclude<ReviewStatus, "pending">;
  /** The exact text and file size that were reviewed; a re-render needs a new review. */
  text: string;
  bytes: number;
  at: number;
}

export interface Turn {
  at: number;
  heard: string;
  lang: Lang;
  reply: string;
}

interface Data {
  version: 1;
  personality: Personality;
  facts: Fact[];
  announcements: Announcement[];
  narration: Record<string, NarrationApproval>;
  conversation: Turn[];
}

export const DEFAULT_RULES = [
  "Tease ideas, answers and choices, never people's looks, weight, age, religion, family, money, health, relationships or intelligence.",
  "No swearing or innuendo; nothing a grandparent would mind hearing.",
  "Never invent private facts about real people. Only use the approved guest facts you are given.",
  "You can't change scores, reveal secrets or move the game on. If asked, joke that Mez and the organiser are in charge.",
  "Never say or guess who the imposter is, any secret word, or the hidden author of an answer.",
];

export const LIMITS = { style: 400, rule: 200, rules: 10, fact: 200, facts: 200, title: 60, announcement: 300, announcements: 50, turns: 8 };

const dir = () => guardDataDir(process.env.HOST_DATA_DIR || ".data/host", "the host knowledge");
const file = () => `${dir()}/knowledge.json`;

const fresh = (): Data => ({
  version: 1,
  personality: { name: { ...PERSONA.name }, style: PERSONA.style, rules: DEFAULT_RULES, updatedAt: null },
  facts: [],
  announcements: [],
  narration: {},
  conversation: [],
});

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

class Knowledge {
  private data: Data | null = null;

  private load(): Data {
    if (this.data) return this.data;
    try {
      const raw = JSON.parse(readFileSync(file(), "utf8")) as Data;
      if (raw.version === 1) return (this.data = { ...fresh(), ...raw });
    } catch {}
    return (this.data = fresh());
  }

  private save() {
    mkdirSync(dir(), { recursive: true, mode: 0o700 });
    const tmp = `${file()}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    renameSync(tmp, file());
  }

  private mutate<T>(fn: (d: Data) => T): T {
    const r = fn(this.load());
    this.save();
    return r;
  }

  snapshot(): Data {
    return this.load();
  }

  // ---- personality ----
  personality(): Personality {
    return this.load().personality;
  }
  setPersonality(p: { name?: Partial<Bilingual>; style?: string; rules?: string[] }): Personality | string {
    const style = p.style === undefined ? undefined : clean(p.style, LIMITS.style);
    if (style !== undefined && style.length < 20) return "Describe the personality in a sentence or two.";
    const rules = p.rules === undefined ? undefined : p.rules.map((r) => clean(r, LIMITS.rule)).filter(Boolean).slice(0, LIMITS.rules);
    return this.mutate((d) => {
      d.personality = {
        name: { en: clean(p.name?.en, 40) || d.personality.name.en, bn: clean(p.name?.bn, 40) || d.personality.name.bn },
        style: style ?? d.personality.style,
        rules: rules ?? d.personality.rules,
        updatedAt: Date.now(),
      };
      return d.personality;
    });
  }
  resetPersonality() {
    return this.mutate((d) => (d.personality = fresh().personality));
  }

  // ---- facts ----
  approvedFacts(): Fact[] {
    return this.load().facts.filter((f) => f.status === "approved");
  }
  addFact(text: string, source: Fact["source"] = "organiser", ref?: string, status: ReviewStatus = "pending"): Fact | string {
    const t = clean(text, LIMITS.fact);
    if (t.length < 5) return "Write the fact in a few words.";
    const d = this.load();
    if (ref && d.facts.some((f) => f.ref === ref)) return "Already suggested.";
    if (d.facts.length >= LIMITS.facts) return "Too many facts; remove some first.";
    const fact: Fact = { id: randomUUID(), text: t, source, ref, status, createdAt: Date.now() };
    this.mutate((x) => x.facts.push(fact));
    return fact;
  }
  setFact(id: string, patch: { status?: ReviewStatus; text?: string }): Fact | null {
    return this.mutate((d) => {
      const f = d.facts.find((x) => x.id === id);
      if (!f) return null;
      if (patch.text !== undefined) {
        const t = clean(patch.text, LIMITS.fact);
        if (t.length >= 5 && t !== f.text) {
          f.text = t;
          f.status = "pending"; // edited text needs a fresh approval
        }
      }
      if (patch.status) f.status = patch.status;
      return f;
    });
  }
  deleteFact(id: string) {
    return this.mutate((d) => {
      const n = d.facts.length;
      d.facts = d.facts.filter((f) => f.id !== id);
      return d.facts.length < n;
    });
  }

  // ---- announcements ----
  announcement(id: string) {
    return this.load().announcements.find((a) => a.id === id) ?? null;
  }
  saveAnnouncement(input: { id?: string; title: string; text: Partial<Bilingual> }): Announcement | string {
    const title = clean(input.title, LIMITS.title);
    const text = { en: clean(input.text?.en, LIMITS.announcement), bn: clean(input.text?.bn, LIMITS.announcement) };
    if (!title) return "Give it a short title.";
    if (!text.en && !text.bn) return "Write the announcement in English, Bangla or both.";
    return this.mutate((d) => {
      const existing = input.id ? d.announcements.find((a) => a.id === input.id) : null;
      if (existing) {
        const changed = existing.text.en !== text.en || existing.text.bn !== text.bn;
        existing.title = title;
        existing.text = text;
        if (changed) {
          existing.status = "pending"; // changed words need a fresh approval
          existing.prepared = {};
        }
        return existing;
      }
      if (d.announcements.length >= LIMITS.announcements) return "Too many announcements.";
      const a: Announcement = { id: randomUUID(), title, text, status: "pending", createdAt: Date.now(), prepared: {} };
      d.announcements.push(a);
      return a;
    });
  }
  setAnnouncementStatus(id: string, status: ReviewStatus) {
    return this.mutate((d) => {
      const a = d.announcements.find((x) => x.id === id);
      if (a) a.status = status;
      return a ?? null;
    });
  }
  setPrepared(id: string, lang: Lang, state: "cached" | "failed" | "pending") {
    this.mutate((d) => {
      const a = d.announcements.find((x) => x.id === id);
      if (a) a.prepared = { ...a.prepared, [lang]: state };
    });
  }
  deleteAnnouncement(id: string) {
    return this.mutate((d) => {
      const n = d.announcements.length;
      d.announcements = d.announcements.filter((a) => a.id !== id);
      return d.announcements.length < n;
    });
  }

  // ---- narration approvals ----
  narrationApprovals() {
    return this.load().narration;
  }
  setNarration(key: string, lang: Lang, status: "approved" | "rejected" | "pending", clip: { text: string; bytes: number }) {
    this.mutate((d) => {
      const k = `${key}:${lang}`;
      if (status === "pending") delete d.narration[k];
      else d.narration[k] = { status, text: clip.text, bytes: clip.bytes, at: Date.now() };
    });
  }

  // ---- conversation memory ----
  conversation(): Turn[] {
    return this.load().conversation;
  }
  remember(turn: Turn) {
    this.mutate((d) => (d.conversation = [...d.conversation, turn].slice(-LIMITS.turns)));
  }
  forgetConversation() {
    this.mutate((d) => (d.conversation = []));
  }
}

const g = globalThis as unknown as { __hostKnowledge?: Knowledge };
export const knowledge = () => (g.__hostKnowledge ??= new Knowledge());
export function resetKnowledgeForTests() {
  g.__hostKnowledge = new Knowledge();
}
