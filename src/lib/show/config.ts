import { EVENT } from "@/lib/event";
import type { Segment, SegmentKind } from "./types";

/** What each kind of segment does when the organiser presses Start. */
export const SEGMENT_INFO: Record<SegmentKind, { label: string; icon: string; does: string }> = {
  welcome: { label: "Welcome / join", icon: "👋", does: "TV shows the join QR code and who has arrived." },
  quiz: { label: "Quiz question", icon: "❓", does: "Opens the next quiz question (each Start = one question)." },
  "game:imposter": { label: "Mez Imposter", icon: "🕵️", does: "Starts the game; run it from the Games panel." },
  "game:wkmb": { label: "Who Knows Mez Best", icon: "🧠", does: "Starts the game; run it from the Games panel." },
  "game:survey": { label: "Mez Survey", icon: "📊", does: "Starts the game with the boards you approved." },
  "game:trial": { label: "Mez on Trial", icon: "⚖️", does: "Starts the trial; Mez judges from the judge phone." },
  "game:mystery": { label: "Mystery Files", icon: "🗂️", does: "Starts the exhibits game; guests guess who sent each." },
  spotlight: { label: "Guest spotlight", icon: "🔦", does: "Approved memories, photos and videos — anonymous first, then reveal who sent it." },
  history: { label: "21 November through the years", icon: "📅", does: "Verified events from 21 November, 2002–2026, each with its source." },
  honours: { label: "Honourable mentions", icon: "🎖️", does: "Guests you marked honourable (including those who couldn't come)." },
  montage: { label: "Video-message montage", icon: "🎬", does: "Plays every approved video message back to back." },
  prizes: { label: "Prize announcements", icon: "🎁", does: "Top three on each board and the prizes won on the wheel." },
  ceremony: { label: "Final leaderboard ceremony", icon: "🏆", does: "Counts down both boards, one reveal per press." },
  messages: { label: "Message wall", icon: "💌", does: "Shows the approved messages from the phones." },
  boards: { label: "Leaderboards", icon: "📋", does: "Shows both leaderboards." },
  wheel: { label: "Prize wheel", icon: "🎡", does: "Shows the wheel; spin it from the Games panel." },
  cake: { label: "Virtual cake", icon: "🎂", does: "24 candles: phones blow, Mez blows the last one, cut, then the real cake." },
  break: { label: "Break / mingle", icon: "☕", does: "Back to the lobby screen. Nothing interactive." },
  finale: { label: "Case closed", icon: "🎉", does: "Final podium and goodbye." },
};

export const SEGMENT_KINDS = Object.keys(SEGMENT_INFO) as SegmentKind[];

const START = (() => {
  const m = /T(\d{2}):(\d{2})/.exec(EVENT.startsAt);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 19 * 60;
})();

export const clock = (minutes: number) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Offsets in minutes from the start: an optional segment roughly every 30 minutes, then the finale run. */
const DEFAULT: [number, SegmentKind, number, string?, boolean?][] = [
  [0, "welcome", 30, "Doors open — scan the QR code"],
  [30, "game:wkmb", 20],
  [60, "spotlight", 15, "Guest spotlight: who sent this?"],
  [90, "game:imposter", 20],
  [120, "history", 10],
  [150, "game:survey", 20],
  [165, "quiz", 5, "Bonus quiz question", false],
  [180, "game:trial", 20],
  [210, "game:mystery", 20],
  [240, "break", 15, "Food and mingling"],
  [255, "cake", 15],
  [270, "ceremony", 10],
  [280, "prizes", 5],
  [285, "wheel", 10],
  [295, "honours", 5],
  [300, "montage", 10],
  [310, "finale", 5],
];

export function defaultPlan(): Segment[] {
  return DEFAULT.map(([offset, kind, minutes, title, enabled], i) => ({
    id: `s${String(i + 1).padStart(2, "0")}`,
    kind,
    title: title ?? SEGMENT_INFO[kind].label,
    at: clock(START + offset),
    minutes,
    enabled: enabled ?? true,
    status: "pending",
    note: "",
    ...(kind === "history" ? { includeSerious: false } : {}),
  }));
}

export const PLAN_LIMITS = { segments: 40, title: 60, note: 200, minutes: 120 } as const;
export const isClock = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
