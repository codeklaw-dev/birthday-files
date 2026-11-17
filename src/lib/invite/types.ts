import type { Question } from "./config";
import type { GuestData, ModerationStatus } from "./schema";

export type MediaKind = "photo" | "video";

export interface MediaRef {
  id: string;
  kind: MediaKind;
  mime: string;
  ext: string;
  bytes: number;
  /** Video only. */
  durationSec?: number;
  /** False when the length came from the browser only (e.g. WebM without a duration header). */
  durationVerified?: boolean;
  uploadedAt: number;
}

export interface Moderation {
  status: ModerationStatus;
  tags: string[];
  honourable: boolean;
  note: string;
  /** Position in the party running order (approved + permission to show only). */
  order: number | null;
  reviewedAt: number | null;
  /** The guest changed their submission after the host reviewed it. */
  editedAfterReview: boolean;
}

/** Stored record. `tokenHash` never leaves the server. */
export interface Submission {
  id: string;
  tokenHash: string;
  createdAt: number;
  updatedAt: number;
  data: GuestData;
  photo: MediaRef | null;
  video: MediaRef | null;
  moderation: Moderation;
}

export interface MediaView {
  url: string;
  mime: string;
  bytes: number;
  durationSec?: number;
  durationVerified?: boolean;
}

/** What a guest sees of their own submission. */
export interface GuestView {
  id: string;
  createdAt: number;
  updatedAt: number;
  data: GuestData;
  photo: MediaView | null;
  video: MediaView | null;
}

/** What the host sees. */
export interface AdminView extends GuestView {
  moderation: Moderation;
  /** Approved and the guest allowed it to be shown at the party. */
  showable: boolean;
}

export interface InviteStats {
  total: number;
  rsvp: Record<"yes" | "maybe" | "remote" | "no", number>;
  pending: number;
  approved: number;
  rejected: number;
  withPhoto: number;
  withVideo: number;
  consented: number;
}

export interface AdminPayload {
  submissions: AdminView[];
  stats: InviteStats;
  questions: Question[];
}
