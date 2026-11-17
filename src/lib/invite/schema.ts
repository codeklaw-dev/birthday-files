import { z } from "zod";
import { GENDER_IDS, LIMITS, PRIZE_IDS, RELATIONSHIPS, RSVP_IDS, type Question } from "./config";

/**
 * Shared validation: the form uses it for instant feedback and the server
 * applies exactly the same rules before anything is stored.
 */

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters.`)
    .transform((s) => s.replace(/\s+/g, " "));

const longText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters.`)
    .transform((s) => s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n"));

export const guestFormSchema = z
  .object({
    name: text(LIMITS.name, "Your name").pipe(z.string().min(1, "Please tell us your name.")),
    relationship: z.enum(RELATIONSHIPS, { message: "Pick how you know Mez." }),
    relationshipDetail: text(LIMITS.relationshipDetail, "This").default(""),
    rsvp: z.enum(RSVP_IDS, { message: "Let us know if you can come." }),
    gender: z.enum(GENDER_IDS).default(""),
    genderSelf: text(LIMITS.genderSelf, "This").default(""),
    prize: z.enum(PRIZE_IDS).default(""),
    prizeNote: text(LIMITS.prizeNote, "Prize note").default(""),
    answers: z
      .object({
        q1: text(LIMITS.answer, "Answer").default(""),
        q2: text(LIMITS.answer, "Answer").default(""),
        q3: text(LIMITS.answer, "Answer").default(""),
      })
      .default({ q1: "", q2: "", q3: "" }),
    memory: longText(LIMITS.memory, "Your memory").default(""),
    accusation: text(LIMITS.accusation, "The accusation").default(""),
    consent: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    // Guests taking part (in person or remotely) answer the three quick questions.
    if (v.rsvp !== "no") {
      for (const id of ["q1", "q2", "q3"] as const) {
        if (!v.answers[id]) ctx.addIssue({ code: "custom", path: ["answers", id], message: "A quick answer, please. Guesses are welcome." });
      }
    }
  })
  .transform((v) => ({ ...v, genderSelf: v.gender === "self" ? v.genderSelf : "" }));

export type GuestForm = z.input<typeof guestFormSchema>;
export type GuestData = z.output<typeof guestFormSchema>;

export const EMPTY_FORM: GuestData = {
  name: "",
  relationship: "Friend",
  relationshipDetail: "",
  rsvp: "yes",
  gender: "",
  genderSelf: "",
  prize: "",
  prizeNote: "",
  answers: { q1: "", q2: "", q3: "" },
  memory: "",
  accusation: "",
  consent: false,
};

export const questionsSchema = z
  .array(
    z.object({
      id: z.enum(["q1", "q2", "q3"]),
      prompt: text(LIMITS.question, "Question").pipe(z.string().min(5, "Write a question.")),
      placeholder: text(80, "Hint").default(""),
    }),
  )
  .length(3)
  .refine((qs) => new Set(qs.map((q) => q.id)).size === 3, "Questions must be q1, q2 and q3.") satisfies z.ZodType<Question[], unknown>;

export const MODERATION_STATUS = ["pending", "approved", "rejected"] as const;
export type ModerationStatus = (typeof MODERATION_STATUS)[number];

export const moderationPatchSchema = z
  .object({
    status: z.enum(MODERATION_STATUS),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(24).regex(/^[\p{L}\p{N} _-]+$/u, "Tags use letters, numbers, spaces, - or _.")).max(12),
    honourable: z.boolean(),
    note: z.string().trim().max(500),
  })
  .partial()
  .strict();

/** Field errors as { "answers.q1": "message" } for the form. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}
