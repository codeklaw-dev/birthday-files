"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CirclePause, CirclePlay, ExternalLink, Eye, Octagon, Play, Plus, RotateCcw, SkipForward, Square, Trash2, Volume2, VolumeX } from "lucide-react";
import { Button, cx, Logo, StatusDot } from "@/components/ui";
import { useStored } from "@/lib/client/hooks";
import { useRoom } from "@/lib/client/use-room";
import type { Action, RoomView } from "@/lib/game/types";
import { clock, defaultPlan, SEGMENT_INFO, SEGMENT_KINDS } from "@/lib/show/config";
import { HISTORY, uncoveredYears } from "@/lib/show/history";
import type { Segment, SegmentKind } from "@/lib/show/types";
import { KeyGate } from "../admin-screen";

type Act = (a: Action) => Promise<boolean>;

export function ShowScreen() {
  const [hostKey, setHostKey] = useStored("session", "bf.hostKey");
  if (hostKey === undefined) return <main className="stage flex-1" />;
  if (hostKey === null) return <KeyGate onUnlock={setHostKey} />;
  return <Director hostKey={hostKey} onLock={() => setHostKey(null)} />;
}

/** Local wall-clock minutes, for "due" hints only. Nothing starts by itself. */
function useClockMinutes() {
  const [m, setM] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setM(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, []);
  return m;
}
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function Director({ hostKey, onLock }: { hostKey: string; onLock: () => void }) {
  const room = useRoom("host", { hostKey });
  const { view, status } = room;
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const act: Act = async (a) => {
    const r = await room.send(a);
    setError(r.ok ? null : (r.error ?? "That didn't work."));
    return r.ok;
  };

  return (
    <main className="stage flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 py-3">
        <div className="flex items-center gap-4">
          <Logo size="sm" />
          <span className="rounded-md border border-stamp/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.25em] text-stamp">Show director · private</span>
          {view?.show.rehearsal && <span className="rounded-md border-2 border-dashed border-tile-b px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-tile-b">Rehearsal · sample data</span>}
        </div>
        <div className="flex items-center gap-3">
          <StatusDot status={status} />
          <a href="/admin" className="inline-flex min-h-11 items-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold hover:bg-white/10">
            Games &amp; host controls
          </a>
          <a href="/display" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold hover:bg-white/10">
            Open TV <ExternalLink className="size-4" aria-hidden />
          </a>
          <Button onClick={onLock}>Lock</Button>
        </div>
      </header>
      {!view ? (
        <p className="m-auto text-haze">Connecting to the room…</p>
      ) : (
        <>
          <ControlBar view={view} act={act} error={error} />
          <div className="grid flex-1 gap-5 p-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <RunningOrder view={view} act={act} previewId={previewId} onPreview={setPreviewId} />
            <div className="flex min-w-0 flex-col gap-5">
              {view.phase === "scene" && view.scene && <SceneControls view={view} act={act} />}
              {view.phase === "cake" && <CakeControls view={view} act={act} />}
              <Monitor title="Live on the TV" live>
                <ScaledFrame src="/display?mirror=1" title="Live TV (silent copy)" />
              </Monitor>
              <Preview view={view} hostKey={hostKey} segmentId={previewId} onClose={() => setPreviewId(null)} act={act} />
              <HistorySources />
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/** Start / pause / emergency / mute / end — always visible. */
function ControlBar({ view, act, error }: { view: RoomView; act: Act; error: string | null }) {
  const live = view.show.plan.find((s) => s.id === view.show.currentId) ?? null;
  return (
    <div className="sticky top-0 z-30 border-b border-white/10 bg-ink-950/95 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-haze">Live segment</div>
          <div className="truncate font-display text-xl font-extrabold" data-testid="live-segment">
            {live ? `${SEGMENT_INFO[live.kind].icon} ${live.title}` : "Nothing live — the TV shows the current screen"}
          </div>
        </div>
        {view.show.hold ? (
          <Button variant="primary" onClick={() => void act({ type: "host/show/resume" })}>
            <CirclePlay className="size-4" aria-hidden /> Resume show
          </Button>
        ) : view.show.paused ? (
          <Button variant="primary" onClick={() => void act({ type: "host/show/resume" })}>
            <CirclePlay className="size-4" aria-hidden /> Resume
          </Button>
        ) : (
          <Button onClick={() => void act({ type: "host/show/pause" })}>
            <CirclePause className="size-4" aria-hidden /> Pause
          </Button>
        )}
        <Button onClick={() => void act({ type: "host/setMuted", muted: !view.host.muted })} aria-pressed={view.host.muted}>
          {view.host.muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />} {view.host.muted ? "Unmute TV" : "Mute TV"}
        </Button>
        <Button onClick={() => void act({ type: "host/stopSpeech" })}>
          <Square className="size-4" aria-hidden /> Stop talking
        </Button>
        <Button onClick={() => void act({ type: "host/replay" })}>
          <RotateCcw className="size-4" aria-hidden /> Replay line
        </Button>
        <Button onClick={() => void act({ type: "host/show/idle" })} title="Leave the current scene (not a running game) and show the lobby">
          Back to lobby
        </Button>
        <Button disabled={!live} onClick={() => void act({ type: "host/show/end" })}>
          End segment
        </Button>
        <Button
          variant="danger"
          disabled={!!view.show.hold}
          onClick={() => void act({ type: "host/show/emergency" })}
          className="border-2 font-extrabold uppercase tracking-wider"
          title="Cuts the voice, mutes the TV, freezes timers and covers the screen"
        >
          <Octagon className="size-4" aria-hidden /> Emergency stop
        </Button>
      </div>
      {(view.show.hold || view.show.paused) && (
        <p role="status" className="mt-2 text-sm text-gold">
          {view.show.hold ? "Emergency stop: the TV shows “Back in a moment”, sound is muted and timers are frozen. Resume restores the previous sound setting." : "Paused: timers are frozen and phones wait. Resume gives back the time that was left."}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-stamp">
          {error}
        </p>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<Segment["status"], string> = {
  pending: "border-white/15 text-haze",
  live: "border-go bg-go/15 text-go",
  done: "border-white/10 text-haze/70",
  skipped: "border-stamp/30 text-stamp/80",
};

function RunningOrder({ view, act, previewId, onPreview }: { view: RoomView; act: Act; previewId: string | null; onPreview: (id: string) => void }) {
  const [draft, setDraft] = useState<Segment[] | null>(null);
  const now = useClockMinutes();
  const plan = draft ?? view.show.plan;
  const nextUp = view.show.plan.find((s) => s.enabled && s.status === "pending") ?? null;
  const edit = (id: string, patch: Partial<Segment>) => setDraft(plan.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...plan];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setDraft(next);
  };

  return (
    <section className="panel flex min-w-0 flex-col gap-4 p-5" aria-label="Running order">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-gold">Running order</h2>
          <p className="mt-1 text-sm text-haze">Times are a guide. Nothing starts by itself: preview, then press Start when the room is ready.</p>
        </div>
        {draft ? (
          <div className="flex gap-2">
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (await act({ type: "host/show/plan", plan: draft })) setDraft(null);
              }}
            >
              Save running order
            </Button>
          </div>
        ) : (
          <Button onClick={() => setDraft(view.show.plan)}>Edit</Button>
        )}
      </div>

      {!draft && nextUp && (
        <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4" data-testid="up-next">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold">
            Up next {now !== null && now >= toMin(nextUp.at) ? "· due now — start when the room is ready" : `· planned ${nextUp.at}`}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <span className="mr-auto text-lg font-bold">
              {SEGMENT_INFO[nextUp.kind].icon} {nextUp.title}
            </span>
            <Button onClick={() => onPreview(nextUp.id)}>
              <Eye className="size-4" aria-hidden /> Preview
            </Button>
            <Button variant="primary" onClick={() => void act({ type: "host/show/go", segmentId: nextUp.id })}>
              <Play className="size-4" aria-hidden /> Start
            </Button>
          </div>
        </div>
      )}

      <ol className="flex flex-col gap-2">
        {plan.map((s, i) => {
          const info = SEGMENT_INFO[s.kind];
          const due = !draft && s.status === "pending" && s.enabled && now !== null && now >= toMin(s.at);
          return (
            <li
              key={s.id}
              data-segment={s.id}
              data-kind={s.kind}
              data-status={s.status}
              className={cx("rounded-xl border p-3", s.status === "live" ? "border-go/60 bg-go/5" : "border-white/10 bg-white/[0.03]", !s.enabled && "opacity-50", previewId === s.id && "ring-2 ring-tile-b")}
            >
              {draft ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input aria-label="Time" type="time" value={s.at} onChange={(e) => edit(s.id, { at: e.target.value })} className="input w-28" />
                  <input aria-label="Title" value={s.title} onChange={(e) => edit(s.id, { title: e.target.value })} className="input min-w-40 flex-1" />
                  <input aria-label="Minutes" type="number" min={1} max={120} value={s.minutes} onChange={(e) => edit(s.id, { minutes: Number(e.target.value) })} className="input w-20" />
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={s.enabled} onChange={(e) => edit(s.id, { enabled: e.target.checked })} /> On
                  </label>
                  {s.kind === "history" && (
                    <label className="flex items-center gap-1 text-sm" title="Include serious news (violence, war, courts)">
                      <input type="checkbox" checked={!!s.includeSerious} onChange={(e) => edit(s.id, { includeSerious: e.target.checked })} /> Serious news
                    </label>
                  )}
                  <Button aria-label="Move up" onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden /></Button>
                  <Button aria-label="Move down" onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden /></Button>
                  <Button aria-label="Remove" variant="danger" disabled={s.status === "live"} onClick={() => setDraft(plan.filter((x) => x.id !== s.id))}><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-12 font-mono text-sm tabular-nums text-haze">{s.at}</span>
                  <span className="text-xl" aria-hidden>{info.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{s.title}</div>
                    <div className="truncate text-xs text-haze">
                      {s.minutes} min · {info.does}
                      {s.kind === "history" && (s.includeSerious ? " · incl. serious news" : " · light items only")}
                    </div>
                  </div>
                  {due && <span className="rounded-full bg-gold px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-ink-950">Due</span>}
                  {!s.enabled && <span className="font-mono text-[10px] uppercase text-haze">off</span>}
                  <span className={cx("rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest", STATUS_STYLE[s.status])}>{s.status}</span>
                  <Button aria-label={`Preview ${s.title}`} onClick={() => onPreview(s.id)}>
                    <Eye className="size-4" aria-hidden />
                  </Button>
                  {s.status === "live" ? (
                    <Button aria-label={`Replay ${s.title}`} onClick={() => void act({ type: "host/show/go", segmentId: s.id })} title="Start this segment again from the top">
                      <RotateCcw className="size-4" aria-hidden />
                    </Button>
                  ) : (
                    <Button aria-label={`${s.status === "pending" ? "Start" : "Replay"} ${s.title}`} variant={s.status === "pending" ? "primary" : "ghost"} onClick={() => void act({ type: "host/show/go", segmentId: s.id })}>
                      {s.status === "pending" ? <Play className="size-4" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
                      {s.status === "pending" ? "Start" : "Replay"}
                    </Button>
                  )}
                  {s.status === "skipped" || s.status === "done" ? (
                    <Button aria-label={`Restore ${s.title}`} onClick={() => void act({ type: "host/show/restore", segmentId: s.id })} title="Put back in the queue">
                      Restore
                    </Button>
                  ) : (
                    <Button aria-label={`Skip ${s.title}`} onClick={() => void act({ type: "host/show/skip", segmentId: s.id })}>
                      <SkipForward className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {draft && <AddSegment plan={plan} onAdd={setDraft} />}
    </section>
  );
}

function AddSegment({ plan, onAdd }: { plan: Segment[]; onAdd: (p: Segment[]) => void }) {
  const [kind, setKind] = useState<SegmentKind>("break");
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
      <select aria-label="Segment type" value={kind} onChange={(e) => setKind(e.target.value as SegmentKind)} className="input w-auto">
        {SEGMENT_KINDS.map((k) => (
          <option key={k} value={k}>
            {SEGMENT_INFO[k].icon} {SEGMENT_INFO[k].label}
          </option>
        ))}
      </select>
      <Button
        onClick={() => {
          const last = plan[plan.length - 1];
          const at = last ? clock(toMin(last.at) + last.minutes) : "19:00";
          const id = `c${Date.now().toString(36).slice(-6)}`;
          onAdd([...plan, { id, kind, title: SEGMENT_INFO[kind].label, at, minutes: 10, enabled: true, status: "pending", note: "", ...(kind === "history" ? { includeSerious: false } : {}) }]);
        }}
      >
        <Plus className="size-4" aria-hidden /> Add
      </Button>
      <Button className="ml-auto" onClick={() => onAdd(defaultPlan())} title="Replace with the suggested running order (statuses reset)">
        Reset to suggested
      </Button>
    </div>
  );
}

function SceneControls({ view, act }: { view: RoomView; act: Act }) {
  const sc = view.scene!;
  const revealable = sc.kind === "spotlight" || sc.kind === "ceremony" || sc.kind === "prizes";
  return (
    <section className="panel p-5" aria-label="Scene controls">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.25em] text-gold">On the TV · {sc.title}</h2>
        <span className="font-mono text-xs text-haze">{sc.index < 0 ? "Title card" : `${sc.index + 1} / ${sc.items.length}`}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void act({ type: "host/scene/prev" })} disabled={sc.index < 0}>Previous</Button>
        <Button variant="primary" onClick={() => void act({ type: "host/scene/next" })} disabled={sc.index >= sc.items.length - 1}>
          {sc.index < 0 ? "Show first" : "Next"}
        </Button>
        {revealable && (
          <Button variant="primary" onClick={() => void act({ type: "host/scene/reveal" })} disabled={sc.index < 0 || sc.revealed}>
            {sc.kind === "spotlight" ? "Reveal who sent it" : "Reveal name"}
          </Button>
        )}
        <Button onClick={() => void act({ type: "host/show/end" })}>End scene</Button>
      </div>
      {sc.kind === "montage" && <p className="mt-2 text-xs text-haze">The TV plays the videos back to back from the one you choose. Pause freezes playback.</p>}
      <ol className="mt-3 max-h-64 overflow-auto text-sm">
        {sc.items.map((it, i) => (
          <li key={it.id}>
            <button onClick={() => void act({ type: "host/scene/goto", index: i })} className={cx("flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5", i === sc.index && "bg-white/10")}>
              <span className="w-6 font-mono text-xs text-haze">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{it.year ? `${it.year} · ` : ""}{it.title}</span>
              {it.from && <span className="truncate text-xs text-gold">{it.from}</span>}
              {it.mediaKind && <span className="text-xs text-haze">{it.mediaKind}</span>}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CakeControls({ view, act }: { view: RoomView; act: Act }) {
  const c = view.cake;
  return (
    <section className="panel p-5" aria-label="Cake controls">
      <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-gold">Cake ceremony</h2>
      <p className="mb-3 text-sm text-haze">
        {c.stage === "real" ? "Over to the real cake." : c.stage === "cut" ? "Cut animation on the TV." : c.mezOut ? "All 24 out. Cut when ready." : c.guestsDone ? "Guests are done: waiting for Mez's phone." : `${Math.max(0, c.lit - 1)} of ${c.candles - 1} guest candles lit.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={c.mezOut} onClick={() => void act({ type: "host/cake/mez" })} title="If Mez's phone isn't to hand">Blow for Mez</Button>
        <Button variant="primary" disabled={!c.mezOut || c.stage !== "candles"} onClick={() => void act({ type: "host/cake/cut" })}>Cut the cake</Button>
        <Button variant="primary" disabled={c.stage === "real"} onClick={() => void act({ type: "host/cake/real" })}>To the real cake</Button>
        <Button onClick={() => void act({ type: "host/show/end" })}>End</Button>
      </div>
    </section>
  );
}

function Monitor({ title, live, children, aside }: { title: string; live?: boolean; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.25em] text-gold">
          {live && <span className="size-2 animate-pulse rounded-full bg-stamp" aria-hidden />}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A 1920×1080 page shown scaled to the panel width, so it looks exactly like the TV. */
function ScaledFrame({ src, title, frameRef }: { src: string; title: string; frameRef?: React.Ref<HTMLIFrameElement> }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="relative w-full overflow-hidden rounded-xl bg-black" style={{ height: (w * 9) / 16 }}>
      <iframe ref={frameRef} src={src} title={title} className="absolute left-0 top-0 origin-top-left border-0" style={{ width: 1920, height: 1080, transform: `scale(${w / 1920})` }} />
    </div>
  );
}

function Preview({ view, hostKey, segmentId, onClose, act }: { view: RoomView; hostKey: string; segmentId: string | null; onClose: () => void; act: Act }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<{ view: RoomView | null; error: string | null; items: number; kind: string | null }>({ view: null, error: null, items: 0, kind: null });
  const [step, setStep] = useState({ index: -1, revealed: false });
  const seg = view.show.plan.find((s) => s.id === segmentId) ?? null;

  // A new segment starts the preview from its title card.
  const [lastSeg, setLastSeg] = useState(segmentId);
  if (lastSeg !== segmentId) {
    setLastSeg(segmentId);
    setStep({ index: -1, revealed: false });
  }

  useEffect(() => {
    if (!segmentId) return;
    let live = true;
    void fetch("/api/show/preview", { method: "POST", headers: { "x-host-key": hostKey, "content-type": "application/json" }, body: JSON.stringify({ segmentId, ...step }) })
      .then((r) => r.json())
      .then((b) => {
        if (!live) return;
        setState(b.ok ? { view: b.view, error: null, items: b.view.scene?.items.length ?? 0, kind: b.view.scene?.kind ?? null } : { view: null, error: b.error ?? "Preview failed.", items: 0, kind: null });
      })
      .catch(() => live && setState({ view: null, error: "Can't reach the server.", items: 0, kind: null }));
    return () => {
      live = false;
    };
  }, [segmentId, step, hostKey]);

  // Hand the view to the iframe (it renders exactly what the TV would).
  useEffect(() => {
    const post = () => frame.current?.contentWindow?.postMessage({ type: "bf-preview", view: state.view }, window.location.origin);
    post();
    const onReady = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "bf-preview-ready") post();
    };
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [state.view]);

  if (!seg)
    return (
      <Monitor title="Preview">
        <p className="text-sm text-haze">Press the eye next to any segment to see exactly what the TV will show — before anyone else does.</p>
      </Monitor>
    );
  return (
    <Monitor
      title={`Preview · ${seg.title}`}
      aside={
        <div className="flex gap-2">
          <Button variant="primary" onClick={async () => { if (await act({ type: "host/show/go", segmentId: seg.id })) onClose(); }}>
            <Play className="size-4" aria-hidden /> Go live
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      }
    >
      {state.error ? <p role="alert" className="mb-3 rounded-xl border border-stamp/40 bg-stamp/10 p-3 text-sm text-stamp">{state.error}</p> : null}
      <ScaledFrame src="/display/preview" title="Preview of the TV" frameRef={frame} />
      {state.items > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Button onClick={() => setStep((s) => ({ index: Math.max(-1, s.index - 1), revealed: false }))} disabled={step.index < 0}>Previous</Button>
          <span className="font-mono text-xs text-haze">{step.index < 0 ? "Title card" : `${step.index + 1} / ${state.items}`}</span>
          <Button onClick={() => setStep((s) => ({ index: Math.min(state.items - 1, s.index + 1), revealed: false }))} disabled={step.index >= state.items - 1}>Next</Button>
          {(state.kind === "spotlight" || state.kind === "ceremony" || state.kind === "prizes") && (
            <label className="ml-2 flex items-center gap-1">
              <input type="checkbox" checked={step.revealed} disabled={step.index < 0} onChange={(e) => setStep((s) => ({ ...s, revealed: e.target.checked }))} /> Show revealed
            </label>
          )}
        </div>
      )}
    </Monitor>
  );
}

function HistorySources() {
  const missing = uncoveredYears();
  return (
    <details className="panel p-5">
      <summary className="cursor-pointer font-mono text-xs font-semibold uppercase tracking-[0.25em] text-gold">21 November history · sources ({HISTORY.length})</summary>
      <p className="mt-3 text-sm text-haze">Every item was checked against the linked source. Serious items are off unless you tick “Serious news” on the history segment. No verified item yet for: {missing.join(", ")}.</p>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm">
        {HISTORY.map((h) => (
          <li key={h.id} className="flex gap-2">
            <span className="w-10 font-mono text-haze">{h.year}</span>
            <a href={h.sourceUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline decoration-white/20 hover:text-gold">
              {h.headline}
            </a>
            <span className="text-xs text-haze">{h.sourceName}</span>
            {h.serious && <span className="font-mono text-[10px] uppercase text-stamp">serious</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

