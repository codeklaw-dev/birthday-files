# Project handover — The Birthday Files: Mez Edition

The single place to see where the project stands. **Read this first; update it in every commit that changes status.**

- **Party:** Saturday 21 November 2026 (Mez's 24th)
- **Source of truth:** GitHub `codeklaw-dev/birthday-files`, branch **`feat/ai-host`**. Anything not pushed there does not exist for the rest of the team.
- **Repository visibility:** **public**. Never commit `.env.local`, `.data/`, real guest content, keys or personal details beyond what is already in the code.

## Roles and workflow

| Role | Who | Works where | Does |
| --- | --- | --- | --- |
| Organiser | You | Mac, phone, Codespace browser | Decisions, real-device testing, guest content, approving anything public or paid |
| Developer | Claude Code in your Codespace (`/workspaces/birthday-files`) | The Codespace | Runs the app, makes code changes, runs tests, commits and pushes |
| Project director | Claude in a separate cloud session | Its own copy of the repo; **cannot see or control the Codespace** | Plans, reviews pushed commits, keeps this document and the checklists current |

### Rules for every change

1. `git pull --rebase origin feat/ai-host` before starting.
2. Small, focused commits. Run `npm run check` (lint, typecheck, unit tests, build) before pushing; add the e2e suite that covers the change.
3. Update the **Status board** and **Log** below in the same commit.
4. Push to `feat/ai-host`. No force-push, no history rewrites, no new long-lived branches unless agreed here.
5. Results from real devices go in [REHEARSAL_REPORT.md](REHEARSAL_REPORT.md), marked Pass/Fail only when actually performed.
6. Never deploy, make a port public, buy anything or use real guest data without the organiser's explicit approval, recorded in **Decisions**.

## What is built (verified on `feat/ai-host`, commit `df34b59`)

Details: [README](../README.md), [SHOW.md](SHOW.md), [AI_HOST.md](AI_HOST.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PARTY_READINESS.md](PARTY_READINESS.md).

- **Invite portal** `/invite`: RSVP, 3 questions, memory, accusation, photo (resized, EXIF stripped), video (15–60 s, ≤95 MB), private edit link; moderation at `/admin/submissions`
- **Show:** phones join by QR; quiz; 5 games (Mez Imposter, Who Knows Mez Best, Mez Survey, Mez on Trial, Mystery Files); 2 leaderboards; prize wheel; Mez's judge phone
- **AI host "Inspector Byte":** English/Bangla narration (53 recorded clips, 13 placeholders), push-to-talk, surprises; works without the cloud (recordings → browser voice → captions)
- **Show director** `/admin/show`: manual running order, preview-before-live, pause, skip, replay, emergency stop; spotlights, 21 November history (sourced), 24-candle cake, ceremony, prizes, honours, montage
- **Rehearsal mode** `npm run rehearsal`: fictional guests in guarded `.data/rehearsal/`
- **Safety:** strong `HOST_KEY` required to start; public gate (`src/proxy.ts`) limits Cloudflare-tunnel traffic to the invite only
- **Tests (last run 18 Nov, cloud):** 137 unit/route tests; e2e rehearsal 40, full-show 16, invite 33, games 27, offline 15 checks — all headless, **none on real devices yet**

## Status board

| Area | Status | Next action | Owner |
| --- | --- | --- | --- |
| Codespace workflow | **Set up — not yet verified** | Developer: first handover commit (see "First task") | Developer |
| Real-device rehearsal | **Not started** — every device item is "Not run" in REHEARSAL_REPORT.md | Run after hosting decision | Organiser + Developer |
| Where the show runs on the night | **Undecided** (see Decision D1) | Organiser decides | Organiser |
| Invite online for remote guests | **Not online** (decision D2) | Organiser decides | Organiser |
| Event details (time, venue) | Placeholders in `src/lib/event.ts` | Organiser supplies; Developer edits | Organiser → Developer |
| Quiz questions | Sample questions in `src/lib/game/mock-data.ts` | Organiser supplies real Mez trivia | Organiser → Developer |
| Prize wording | "A prize from the organiser" (`src/lib/show/server/build.ts`) | Organiser supplies prizes | Organiser → Developer |
| Narration | 13 placeholder clips; approvals live in `.data/host/` on the machine that runs the show | Record (`npm run narration:render`, free Gemini quota resets 08:00 UTC), approve in `/admin/host`, Bangla check | Developer + native speaker |
| Guest content | None collected yet (no real submissions exist anywhere we know of) | Depends on D2 | Organiser |

## Decisions needed (organiser)

| # | Decision | Options | Director's recommendation |
| --- | --- | --- | --- |
| D1 | Where the app runs on the night | **(a) Mac on venue Wi-Fi** — works offline, guests join freely, data on the laptop. **(b) Codespace** — needs venue internet; a **private** port only works for browsers signed in to *your* GitHub (guests can't join); a **public** port exposes the whole app; Codespaces stop after idle timeout (default 30 min) | **(a) Mac.** Use the Codespace for development and rehearsals only |
| D2 | How remote guests reach `/invite` before the party | Cloudflare Quick Tunnel from the machine that will hold the data (free, address changes on restart) · named tunnel (stable; needs a domain on Cloudflare — buying one costs money) · don't collect remotely | Tunnel from the **Mac** (the data must end up where the show runs). See PARTY_READINESS.md §2 |
| D3 | Close date for submissions | e.g. Thu 19 or Fri 20 Nov evening | Fri 20 Nov 18:00, so there's time to moderate |
| D4 | Real start time, venue, prizes | — | Needed by Thu 19 Nov |

Record answers here with the date: _none yet_.

## Blockers

1. **D1/D2 undecided** — blocks the real rehearsal and collecting guest content.
2. **Guest data location:** if submissions are collected in a Codespace, they must be moved to the show machine (copy `.data/invite/`), and never committed.
3. **Gemini free voice quota** (10 requests/day/model) — limits recording the 13 remaining clips per day.

## Timeline to the party

| Day | Goal |
| --- | --- |
| Wed 18 Nov | Workflow verified (developer's first commit). D1, D2, D4 decided. Invite online if approved |
| Thu 19 Nov | Real questions, prizes, event details committed. Real-device rehearsal #1 on the show machine (REHEARSAL_REPORT.md). Narration recorded |
| Fri 20 Nov | Fixes from rehearsal. Submissions close; moderate; set running order. Rehearsal #2 with the real TV/monitor. Backup `.data/` |
| Sat 21 Nov | Morning: final backup, `npm run party`, quick check. Party |

## First task for the developer (Claude Code in the Codespace)

1. `git pull --rebase origin feat/ai-host`; confirm the commit matches the one above or newer.
2. Report the environment **without secrets**: `node -v`, `npm -v`, `git status -sb`, whether `.env.local` exists and which variable **names** it has.
3. `npm ci` and `npm run check`; record pass/fail.
4. Start `npm run rehearsal -- --build` (needs `HOST_KEY` in `.env.local`), check the Ports tab shows 3100 as **Private**, and confirm `/admin/show`, `/display`, `/play` load through the forwarded address.
5. Add a dated entry to the **Log** below with those results (facts only, mark anything not performed as "not run"), update the Status board row "Codespace workflow", commit and push.

## Log

Newest first. One entry per working session: date, who, what changed (commit), results, open questions.

- **2026-11-18 — Director (cloud session).** Created this handover. Checked GitHub: `feat/ai-host` at `df34b59`, nothing pushed from the Codespace yet; repository is public; scanned full history — no keys, `.env*` or `.data/` committed. No code changes.
