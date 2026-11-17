import "server-only";
import type { AdminView, GuestView, MediaRef, Submission } from "../types";
import { signedMediaUrl } from "./secrets";

const media = (m: MediaRef | null) =>
  m ? { url: signedMediaUrl(m.id), mime: m.mime, bytes: m.bytes, durationSec: m.durationSec, durationVerified: m.durationVerified } : null;

export function guestView(s: Submission): GuestView {
  return { id: s.id, createdAt: s.createdAt, updatedAt: s.updatedAt, data: s.data, photo: media(s.photo), video: media(s.video) };
}

export function adminView(s: Submission): AdminView {
  return { ...guestView(s), moderation: s.moderation, showable: s.moderation.status === "approved" && s.data.consent };
}
