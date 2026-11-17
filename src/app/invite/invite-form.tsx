"use client";

import { ArrowLeft, ArrowRight, Camera, Film, ImagePlus, Loader2, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button, cx } from "@/components/ui";
import { EVENT } from "@/lib/event";
import { DEFAULT_QUESTIONS, GENDER_OPTIONS, LIMITS, PRIZE_OPTIONS, RELATIONSHIPS, RSVP_OPTIONS, type Question } from "@/lib/invite/config";
import { inviteApi, uploadMedia } from "@/lib/invite/client/api";
import { checkVideo, formatBytes, preparePhoto, videoDuration } from "@/lib/invite/client/media";
import { EMPTY_FORM, fieldErrors, guestFormSchema, type GuestData } from "@/lib/invite/schema";
import type { GuestView, MediaView } from "@/lib/invite/types";

const DRAFT_KEY = "bf.invite.draft";
const STEPS = ["You", `About ${EVENT.guestOfHonour}`, "Photo & video", "Check & send"] as const;
const STEP_FIELDS: ((key: string) => boolean)[] = [
  (k) => ["name", "relationship", "relationshipDetail", "rsvp", "gender", "genderSelf", "prize", "prizeNote"].includes(k),
  (k) => k.startsWith("answers") || k === "memory" || k === "accusation",
  (k) => k === "consent",
  () => true,
];

interface PhotoState {
  existing: MediaView | null;
  blob: Blob | null;
  preview: string | null;
  remove: boolean;
  busy: boolean;
  error: string | null;
}
interface VideoState {
  existing: MediaView | null;
  file: File | null;
  duration: number | null;
  preview: string | null;
  remove: boolean;
  error: string | null;
}

export function InviteForm({
  existing,
  token,
  onCancel,
  onDone,
  onWithdrawn,
}: {
  existing: GuestView | null;
  token: string | null;
  onCancel: () => void;
  onDone: (s: GuestView, token: string, warnings: string[]) => void;
  onWithdrawn: () => void;
}) {
  const editing = !!(existing && token);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<GuestData>(() => {
    if (existing) return existing.data;
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (draft) return { ...EMPTY_FORM, ...draft, answers: { ...EMPTY_FORM.answers, ...draft.answers } };
    } catch {}
    return EMPTY_FORM;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [photo, setPhoto] = useState<PhotoState>({ existing: existing?.photo ?? null, blob: null, preview: null, remove: false, busy: false, error: null });
  const [video, setVideo] = useState<VideoState>({ existing: existing?.video ?? null, file: null, duration: null, preview: null, remove: false, error: null });
  const [sending, setSending] = useState<{ label: string; progress: number | null } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let live = true;
    inviteApi.questions().then((r) => live && setQuestions(r.ok ? r.questions : DEFAULT_QUESTIONS));
    return () => {
      live = false;
    };
  }, []);

  // Keep a draft on this device while filling in a new RSVP.
  useEffect(() => {
    if (editing) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch {}
  }, [data, editing]);

  useEffect(() => headingRef.current?.focus(), [step]);

  const set = <K extends keyof GuestData>(key: K, value: GuestData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };
  const setAnswer = (id: "q1" | "q2" | "q3", value: string) => {
    setData((d) => ({ ...d, answers: { ...d.answers, [id]: value } }));
    setErrors((e) => {
      const next = { ...e };
      delete next[`answers.${id}`];
      return next;
    });
  };

  const validate = (upTo: number) => {
    const r = guestFormSchema.safeParse(data);
    const all = r.success ? {} : fieldErrors(r.error);
    const relevant = Object.fromEntries(Object.entries(all).filter(([k]) => STEP_FIELDS.slice(0, upTo + 1).some((f, i) => i <= upTo && f(k))));
    setErrors(relevant);
    if (Object.keys(relevant).length) {
      const firstStep = STEP_FIELDS.findIndex((f) => Object.keys(relevant).some((k) => f(k)));
      setStep(Math.min(firstStep, upTo));
      setTimeout(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(), 50);
      return false;
    }
    return true;
  };

  const next = () => {
    if (step === 2 && (photo.busy || photo.error || video.error)) return;
    if (validate(step)) setStep((s) => Math.min(3, s + 1));
  };

  const send = async () => {
    if (!validate(3)) return;
    setSubmitError(null);
    setSending({ label: editing ? "Saving your changes…" : "Filing your RSVP…", progress: null });
    const parsed = guestFormSchema.parse(data);
    const saved = editing ? await inviteApi.update(token!, parsed) : await inviteApi.create(parsed);
    if (!saved.ok) {
      setSending(null);
      if (saved.fields) {
        setErrors(saved.fields);
        validate(3);
      }
      setSubmitError(saved.error);
      return;
    }
    const t = editing ? token! : (saved as unknown as { token: string }).token;
    let latest = saved.submission;
    const warnings: string[] = [];

    for (const kind of ["photo", "video"] as const) {
      const state = kind === "photo" ? photo : video;
      if (state.remove && state.existing) {
        const r = await inviteApi.removeMedia(t, kind);
        if (r.ok) latest = r.submission;
      }
    }
    if (photo.blob) {
      setSending({ label: "Uploading your photo…", progress: 0 });
      const r = await uploadMedia(t, "photo", photo.blob, { onProgress: (p) => setSending({ label: "Uploading your photo…", progress: p }) });
      if (r.ok) latest = r.submission;
      else warnings.push(`Photo: ${r.error}`);
    }
    if (video.file) {
      setSending({ label: "Uploading your video…", progress: 0 });
      const r = await uploadMedia(t, "video", video.file, {
        durationSec: video.duration ?? undefined,
        onProgress: (p) => setSending({ label: "Uploading your video…", progress: p }),
      });
      if (r.ok) latest = r.submission;
      else warnings.push(`Video: ${r.error}`);
    }
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setSending(null);
    onDone(latest, t, warnings);
  };

  const withdraw = async () => {
    if (!token || !window.confirm("Withdraw your RSVP? Your answers, photo and video will be deleted for good.")) return;
    setSending({ label: "Deleting…", progress: null });
    const r = await inviteApi.withdraw(token);
    setSending(null);
    if (r.ok) onWithdrawn();
    else setSubmitError(r.error);
  };

  const attending = data.rsvp !== "no";

  return (
    <section className="panel flex flex-col gap-6 p-5 sm:p-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center gap-1 text-sm text-haze hover:text-cream">
            <X className="size-4" aria-hidden /> Close
          </button>
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-haze" aria-live="polite">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === step ? "step" : undefined}>
              <div className={cx("h-1.5 rounded-full", i <= step ? "bg-gold" : "bg-white/10")} />
              <span className={cx("mt-1.5 hidden text-[11px] sm:block", i === step ? "text-cream" : "text-haze")}>{label}</span>
            </li>
          ))}
        </ol>
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-extrabold outline-none sm:text-3xl">
          {[editing ? "Your RSVP" : "First, who's this?", `The evidence on ${EVENT.guestOfHonour}`, "Exhibits (optional)", editing ? "Check your changes" : "Ready to file?"][step]}
        </h1>
      </header>

      {step === 0 && (
        <div className="flex flex-col gap-5">
          <TextField label="Your name" value={data.name} max={LIMITS.name} error={errors.name} autoComplete="name" onChange={(v) => set("name", v)} required />
          <ChoiceGroup
            legend={`How do you know ${EVENT.guestOfHonour}?`}
            options={RELATIONSHIPS.map((r) => ({ id: r, label: r }))}
            value={data.relationship}
            error={errors.relationship}
            onChange={(v) => set("relationship", v as GuestData["relationship"])}
            chips
          />
          <TextField
            label="Anything more specific? (optional)"
            placeholder="e.g. cousin, uni flatmate, chess rival"
            value={data.relationshipDetail}
            max={LIMITS.relationshipDetail}
            error={errors.relationshipDetail}
            onChange={(v) => set("relationshipDetail", v)}
          />
          <ChoiceGroup
            legend="Can you come?"
            options={RSVP_OPTIONS.map((o) => ({ id: o.id, label: o.label, hint: o.hint }))}
            value={data.rsvp}
            error={errors.rsvp}
            onChange={(v) => set("rsvp", v as GuestData["rsvp"])}
          />
          <details className="group rounded-xl border border-white/10 bg-white/5 p-4" open={!!(data.gender || data.prize || data.prizeNote)}>
            <summary className="cursor-pointer text-sm font-semibold marker:text-gold">Prize preferences (optional)</summary>
            <p className="mt-2 text-xs text-haze">There may be prizes. This just helps us pick one you&apos;d like. Skip it if you prefer.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SelectField label="Gender (optional)" value={data.gender} options={GENDER_OPTIONS} onChange={(v) => set("gender", v as GuestData["gender"])} />
              <SelectField label="Prize you'd enjoy" value={data.prize} options={PRIZE_OPTIONS} onChange={(v) => set("prize", v as GuestData["prize"])} />
              {data.gender === "self" && (
                <TextField label="Describe in your own words" value={data.genderSelf} max={LIMITS.genderSelf} error={errors.genderSelf} onChange={(v) => set("genderSelf", v)} />
              )}
              <TextField label="Anything else? (optional)" placeholder="Allergies, no chocolate, etc." value={data.prizeNote} max={LIMITS.prizeNote} error={errors.prizeNote} onChange={(v) => set("prizeNote", v)} />
            </div>
          </details>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-5">
          <p className="-mt-3 text-sm text-haze">
            {attending ? "Quick answers are perfect. Guesses count. These may turn up in the games." : "Optional, since you can't come, but we'd love to have them."}
          </p>
          {(questions ?? DEFAULT_QUESTIONS).map((q, i) => (
            <TextField
              key={q.id}
              label={`${i + 1}. ${q.prompt}`}
              placeholder={q.placeholder}
              value={data.answers[q.id]}
              max={LIMITS.answer}
              error={errors[`answers.${q.id}`]}
              onChange={(v) => setAnswer(q.id, v)}
              required={attending}
              disabled={questions === null}
            />
          ))}
          <TextField
            label={`A favourite memory with ${EVENT.guestOfHonour} (optional)`}
            placeholder="The time that…"
            value={data.memory}
            max={LIMITS.memory}
            error={errors.memory}
            onChange={(v) => set("memory", v)}
            multiline
          />
          <TextField
            label={`${EVENT.guestOfHonour} stands accused of… (optional)`}
            hint="A funny, harmless charge for the trial. Keep it kind."
            placeholder="e.g. Eating the last samosa and blaming the cat"
            value={data.accusation}
            max={LIMITS.accusation}
            error={errors.accusation}
            onChange={(v) => set("accusation", v)}
          />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-5">
          <PhotoPicker state={photo} setState={setPhoto} />
          <VideoPicker state={video} setState={setVideo} />
          <label className={cx("flex cursor-pointer gap-3 rounded-xl border p-4", data.consent ? "border-go/50 bg-go/10" : "border-white/10 bg-white/5")}>
            <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--color-gold)]" checked={data.consent} onChange={(e) => set("consent", e.target.checked)} />
            <span className="text-sm">
              <span className="font-semibold">You can show my answers, photo and video at the party.</span>
              <span className="mt-1 block text-haze">
                Leave this unticked and only the organiser and {EVENT.guestOfHonour} will see them. Nothing is ever posted publicly.
              </span>
            </span>
          </label>
          <p className="flex items-start gap-2 text-xs text-haze">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-go" aria-hidden /> Photos are resized and stripped of location data before upload. Files are stored privately and only the organiser can open them.
          </p>
        </div>
      )}

      {step === 3 && <Review data={data} questions={questions ?? DEFAULT_QUESTIONS} photo={photo} video={video} onJump={setStep} />}

      {submitError && (
        <p role="alert" className="rounded-xl border border-stamp/40 bg-stamp/10 p-3 text-sm text-stamp">
          {submitError}
        </p>
      )}

      {sending ? (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4">
          <span className="flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {sending.label}
          </span>
          {sending.progress !== null && (
            <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
              <div className="h-full bg-gold transition-[width]" style={{ width: `${Math.round(sending.progress * 100)}%` }} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}>
            <ArrowLeft className="size-4" aria-hidden /> {step === 0 ? "Back" : "Previous"}
          </Button>
          {step < 3 ? (
            <Button variant="primary" onClick={next} disabled={step === 2 && photo.busy}>
              {step === 2 && !photo.blob && !video.file && !photo.existing && !video.existing ? "Skip" : "Next"} <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button variant="primary" className="min-h-12 px-6 text-base" onClick={send}>
              {editing ? "Save changes" : "Send my RSVP"}
            </Button>
          )}
        </div>
      )}

      {editing && step === 0 && !sending && (
        <button type="button" onClick={withdraw} className="inline-flex items-center gap-1.5 self-start text-sm text-stamp hover:underline">
          <Trash2 className="size-4" aria-hidden /> Withdraw my RSVP and delete everything
        </button>
      )}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  max,
  error,
  hint,
  placeholder,
  multiline,
  required,
  disabled,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  error?: string;
  hint?: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const props = {
    id,
    value,
    maxLength: max,
    placeholder,
    disabled,
    autoComplete,
    "aria-invalid": !!error,
    "aria-describedby": describedBy,
    "aria-required": required,
    className: cx("input", multiline && "resize-y", error && "!border-stamp"),
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-end justify-between gap-3 text-sm font-medium">
        <span>
          {label}
          {required && <span className="text-stamp" aria-hidden> *</span>}
        </span>
        {value.length > max * 0.7 && <span className="shrink-0 font-mono text-xs tabular-nums text-haze">{value.length}/{max}</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="-mt-1 text-xs text-haze">
          {hint}
        </p>
      )}
      {multiline ? <textarea rows={4} {...props} onChange={(e) => onChange(e.target.value)} /> : <input type="text" {...props} onChange={(e) => onChange(e.target.value)} />}
      {error && (
        <p id={`${id}-error`} className="text-sm text-stamp">
          {error}
        </p>
      )}
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly { id: string; label: string }[]; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ChoiceGroup({
  legend,
  options,
  value,
  onChange,
  error,
  chips,
}: {
  legend: string;
  options: { id: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
  chips?: boolean;
}) {
  const name = useId();
  return (
    <fieldset aria-invalid={!!error} aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className={chips ? "flex flex-wrap gap-2" : "grid gap-2"}>
        {options.map((o) => (
          <label
            key={o.id}
            className={cx(
              "cursor-pointer border transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold",
              chips ? "rounded-full px-4 py-2 text-sm" : "flex flex-col rounded-xl px-4 py-3",
              value === o.id ? "border-gold bg-gold/15 text-cream" : "border-white/15 bg-white/5 text-haze hover:text-cream",
            )}
          >
            <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} className="sr-only" />
            <span className={chips ? "" : "font-semibold text-cream"}>{o.label}</span>
            {o.hint && !chips && <span className="text-xs text-haze">{o.hint}</span>}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-stamp">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function PhotoPicker({ state, setState }: { state: PhotoState; setState: React.Dispatch<React.SetStateAction<PhotoState>> }) {
  const input = useRef<HTMLInputElement>(null);
  const shown = state.preview ?? (!state.remove ? state.existing?.url : null);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 font-semibold">
        <Camera className="size-4 text-gold" aria-hidden /> A photo with {EVENT.guestOfHonour} (optional)
      </div>
      <p className="mt-1 text-xs text-haze">JPEG, PNG or WebP. Big photos are resized automatically.</p>
      {shown ? (
        <div className="mt-3 flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, signed or local blob URL */}
          <img src={shown} alt="Your photo" className="size-28 rounded-lg object-cover" />
          <div className="flex flex-col gap-2">
            <Button onClick={() => input.current?.click()}>Replace</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (state.preview) URL.revokeObjectURL(state.preview);
                setState((s) => ({ ...s, blob: null, preview: null, remove: !!s.existing, error: null }));
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3 w-full" onClick={() => input.current?.click()} disabled={state.busy}>
          {state.busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />} {state.busy ? "Preparing…" : "Choose a photo"}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        aria-label="Choose a photo"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setState((s) => ({ ...s, busy: true, error: null }));
          try {
            const blob = await preparePhoto(file);
            setState((s) => {
              if (s.preview) URL.revokeObjectURL(s.preview);
              return { ...s, blob, preview: URL.createObjectURL(blob), remove: false, busy: false, error: null };
            });
          } catch (err) {
            setState((s) => ({ ...s, busy: false, error: (err as Error).message }));
          }
        }}
      />
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-stamp">
          {state.error}
        </p>
      )}
    </div>
  );
}

function VideoPicker({ state, setState }: { state: VideoState; setState: React.Dispatch<React.SetStateAction<VideoState>> }) {
  const input = useRef<HTMLInputElement>(null);
  const shown = state.preview ?? (!state.remove ? state.existing?.url : null);
  const seconds = state.duration ?? (!state.file ? state.existing?.durationSec : null);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 font-semibold">
        <Film className="size-4 text-gold" aria-hidden /> A video message for {EVENT.guestOfHonour} (optional)
      </div>
      <p className="mt-1 text-xs text-haze">
        {LIMITS.videoMinSec}–{LIMITS.videoMaxSec} seconds. Record one now or pick from your phone (MP4, MOV or WebM, up to {LIMITS.videoBytes / 1024 / 1024} MB).
      </p>
      {shown ? (
        <div className="mt-3 flex flex-col gap-2">
          <video src={shown} controls playsInline preload="metadata" className="max-h-64 w-full rounded-lg bg-black" />
          <div className="flex flex-wrap items-center gap-2">
            {seconds ? <span className="font-mono text-xs text-haze">{Math.round(seconds)} s{state.file ? ` · ${formatBytes(state.file.size)}` : ""}</span> : null}
            <Button onClick={() => input.current?.click()}>Replace</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (state.preview) URL.revokeObjectURL(state.preview);
                setState((s) => ({ ...s, file: null, duration: null, preview: null, remove: !!s.existing, error: null }));
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-3 w-full" onClick={() => input.current?.click()}>
          <Film className="size-4" aria-hidden /> Record or choose a video
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/*"
        className="sr-only"
        aria-label="Record or choose a video"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const duration = await videoDuration(file);
          const problem = checkVideo(file, duration);
          if (problem) return setState((s) => ({ ...s, error: problem }));
          setState((s) => {
            if (s.preview) URL.revokeObjectURL(s.preview);
            return { ...s, file, duration, preview: URL.createObjectURL(file), remove: false, error: null };
          });
        }}
      />
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-stamp">
          {state.error}
        </p>
      )}
    </div>
  );
}

function Review({ data, questions, photo, video, onJump }: { data: GuestData; questions: Question[]; photo: PhotoState; video: VideoState; onJump: (step: number) => void }) {
  const rsvp = RSVP_OPTIONS.find((o) => o.id === data.rsvp)?.label;
  const hasPhoto = !!photo.blob || (!!photo.existing && !photo.remove);
  const hasVideo = !!video.file || (!!video.existing && !video.remove);
  return (
    <dl className="rounded-xl border border-white/10 bg-white/5 px-4">
      <ReviewRow onJump={onJump} label="Name" value={`${data.name} · ${data.relationship}${data.relationshipDetail ? ` (${data.relationshipDetail})` : ""}`} step={0} />
      <ReviewRow onJump={onJump} label="RSVP" value={rsvp ?? ""} step={0} />
      {questions.map((q) => (
        <ReviewRow onJump={onJump} key={q.id} label={q.prompt} value={data.answers[q.id]} step={1} />
      ))}
      <ReviewRow onJump={onJump} label="Favourite memory" value={data.memory} step={1} />
      <ReviewRow onJump={onJump} label="The accusation" value={data.accusation} step={1} />
      <ReviewRow onJump={onJump} label="Photo & video" value={[hasPhoto && "Photo", hasVideo && "Video"].filter(Boolean).join(" + ")} step={2} />
      <ReviewRow onJump={onJump} label="Show at the party?" value={data.consent ? "Yes" : "No, organiser and Mez only"} step={2} />
    </dl>
  );
}

function ReviewRow({ label, value, step, onJump }: { label: string; value: string; step: number; onJump: (step: number) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 py-2.5 last:border-0">
      <div className="min-w-0">
        <dt className="text-xs text-haze">{label}</dt>
        <dd className="mt-0.5 whitespace-pre-line break-words text-sm">{value || <span className="text-haze">Not given</span>}</dd>
      </div>
      <button type="button" className="shrink-0 text-xs text-gold hover:underline" onClick={() => onJump(step)} aria-label={`Change ${label}`}>
        Change
      </button>
    </div>
  );
}
