/**
 * Everything guests can choose on the invite, in one place.
 * The three "about Mez" questions can also be changed from /admin/submissions.
 */

export const RSVP_OPTIONS = [
  { id: "yes", label: "I'll be there", hint: "Count me in for the party" },
  { id: "maybe", label: "Maybe", hint: "I'll confirm closer to the day" },
  { id: "remote", label: "Can't come, but I want to take part", hint: "Send your answers, photo or video and be part of the show from afar" },
  { id: "no", label: "Can't make it", hint: "Send your wishes anyway" },
] as const;
export type Rsvp = (typeof RSVP_OPTIONS)[number]["id"];
export const RSVP_IDS = RSVP_OPTIONS.map((o) => o.id) as [Rsvp, ...Rsvp[]];

export const RELATIONSHIPS = ["Family", "Friend", "Best friend", "Partner", "Colleague", "Classmate", "Neighbour", "Other"] as const;

export const GENDER_OPTIONS = [
  { id: "", label: "Prefer not to say" },
  { id: "woman", label: "Woman" },
  { id: "man", label: "Man" },
  { id: "nonbinary", label: "Non-binary" },
  { id: "self", label: "I'll describe it" },
] as const;
export type Gender = (typeof GENDER_OPTIONS)[number]["id"];
export const GENDER_IDS = GENDER_OPTIONS.map((o) => o.id) as [Gender, ...Gender[]];

export const PRIZE_OPTIONS = [
  { id: "", label: "Surprise me" },
  { id: "sweet", label: "Something sweet" },
  { id: "silly", label: "Something silly" },
  { id: "useful", label: "Something useful" },
  { id: "book", label: "A book" },
  { id: "plant", label: "A plant" },
] as const;
export type Prize = (typeof PRIZE_OPTIONS)[number]["id"];
export const PRIZE_IDS = PRIZE_OPTIONS.map((o) => o.id) as [Prize, ...Prize[]];

export interface Question {
  id: "q1" | "q2" | "q3";
  prompt: string;
  placeholder: string;
}

/** Default questions; the host can edit them. Answers feed Mez Survey later. */
export const DEFAULT_QUESTIONS: Question[] = [
  { id: "q1", prompt: "What is Mez's ultimate comfort food?", placeholder: "e.g. kacchi biryani at midnight" },
  { id: "q2", prompt: "Which song would Mez play on repeat without shame?", placeholder: "Song or artist" },
  { id: "q3", prompt: "What is Mez secretly brilliant at?", placeholder: "The hidden talent" },
];

export const LIMITS = {
  name: 40,
  relationshipDetail: 60,
  genderSelf: 30,
  prizeNote: 80,
  answer: 200,
  memory: 600,
  accusation: 280,
  question: 140,
  photoBytes: 12 * 1024 * 1024,
  /** Kept under Cloudflare's 100 MB request limit so uploads through the tunnel never hit an opaque 413. */
  videoBytes: 95 * 1024 * 1024,
  videoMinSec: 15,
  videoMaxSec: 60,
  /** Longest edge for photos after in-browser resizing. */
  photoMaxEdge: 2000,
} as const;

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export const SUGGESTED_TAGS = ["funny", "heartfelt", "embarrassing", "mystery-files", "trial", "survey", "slideshow", "for-mez-only"] as const;
