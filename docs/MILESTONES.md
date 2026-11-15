# Milestones

The party is on **21 November 2026**. This plan was written on 15 November, so it is ordered by what the night cannot run without.

## Milestone 1 — Foundation and multiplayer prototype ✅

- [x] Next.js 16 (App Router), TypeScript, Tailwind 4 project
- [x] Routes: `/admin`, `/display`, `/play`, `/invite`, plus a hub at `/`
- [x] Game-show visual system (stage, case-file cards, marquee, answer tiles), responsive from phone to TV
- [x] Pure game engine with unit tests
- [x] Realtime prototype: in-memory room + Server-Sent Events
- [x] Playable loop: lobby → question → reveal → leaderboard → message wall → cake → finale
- [x] Host tools: run of show, answer key, live tallies, bonus points, remove player, message moderation, reset
- [x] Casper adapter interface with a silent mock; English/Bangla captions
- [x] QR join using the laptop's LAN address

## Milestone 2 — Real backend (needs your Supabase project)

- [ ] Create the Supabase project and share the URL and keys through environment variables
- [ ] Schema + migrations for rooms, players, questions, answers, messages, score events
- [ ] Replace `room-store.ts` with a Supabase-backed store; switch `use-room.ts` to Supabase Realtime
- [ ] Host sign-in through Supabase Auth
- [ ] State survives a server restart and a laptop refresh
- [ ] Rate limiting on joins and messages

## Milestone 3 — Casper

- [ ] Receive the Casper API contract (see questions in ARCHITECTURE.md)
- [ ] `http-adapter.ts` behind a server-side proxy
- [ ] Audio on the TV, with captions kept as the fallback when a call fails or is slow
- [ ] Host controls: stop speaking, repeat line, switch language mid-show

## Milestone 4 — Guest submissions

- [ ] Photo and video upload from `/invite` and `/play` to Supabase Storage (size and type limits, signed URLs)
- [ ] Memories with a moderation queue; reveal on the TV
- [ ] Mez scores submissions from a simple scoring view; points flow into `score_events`

## Milestone 5 — The four games

- [ ] **Mez Survey** — closest to the existing quiz loop, so it goes first
- [ ] **Mez on Trial** — charge card, phones vote guilty or not guilty, verdict reveal
- [ ] **Mez Imposter** — secret role assignment per phone, discussion timer, vote
- [ ] **Mystery Files** — media-based clues; depends on Milestone 4

## Milestone 6 — Show polish and deployment

- [ ] Prizes and surprise reveal screens
- [ ] Cake ceremony upgrade (sound, staged reveal)
- [ ] Real questions and content loaded by the host
- [ ] Private GitHub repository and Vercel deployment
- [ ] Rehearsal with 10+ phones on the venue Wi-Fi; reconnect and low-battery testing

## Suggested order for the six days left

1. Milestone 2, because nothing can be deployed without it.
2. Mez Survey and Mez on Trial, which reuse the question/vote loop.
3. Casper audio, with captions as the safety net.
4. Uploads, then the remaining two games if time allows.

If time runs short, a fallback is to run the show from the laptop with `npm run party` on the venue Wi-Fi. That already works today.
