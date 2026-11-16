# Milestones

The party is on **21 November 2026**. Re-planned on 16 November around the new rule: all AI runs in the cloud and the laptop only runs the browser show. The Casper integration requirement is dropped.

## Milestone 1 — Multiplayer flow between admin, phones and TV ✅

- [x] Next.js 16, TypeScript, Tailwind 4; routes `/admin`, `/display`, `/play`, `/invite`
- [x] Pure game engine with unit tests; realtime over Server-Sent Events
- [x] Full loop: lobby → questions → reveal → leaderboard → message wall → cake → finale
- [x] Host tools: run of show, answer key, tallies, bonus points, remove player, moderation, reset
- [x] Room state snapshotted to disk: a server restart mid-party keeps players, scores and messages *(new)*
- [x] Per-IP rate limits on joins, messages and cake taps *(new)*

## Milestone 2 — AI host interface, pre-recorded narration, audio triggers ✅

- [x] Provider-independent host persona and bilingual script (23 static lines + dynamic lines with fallbacks)
- [x] Engine emits host lines with ids; English / Bangla / Both / Auto language modes
- [x] TV audio director: recorded clip → live TTS → fallback clip → browser voice → captions
- [x] New lines interrupt stale narration; quips and replies queue
- [x] One-click sound unlock on the TV; speaking indicator in the captions
- [x] Web Audio soundboard (8 effects) plus automatic stings on reveal, leaderboard, cake and finale; 5-second warning and countdown ticks
- [x] Dashboard: voice on/off, language, replay, stop, soundboard, quick lines, "say something", AI drafts for review, auto-quips toggle
- [x] Narration render pipeline (`npm run narration:render`): resumable and quota-aware
- [x] 46 robotic **placeholder** clips (offline espeak-ng) so the audio path works today; to be replaced with real voice

## Milestone 3 — Cloud TTS (English + Bangla) ⏳ needs a free key

- [x] Researched providers: see [AI_PROVIDERS.md](AI_PROVIDERS.md)
- [x] Adapters: Gemini (TTS, LLM, STT), Groq (LLM, STT), Cloudflare (LLM, STT), Azure (TTS, approval needed)
- [x] Failover router with timeouts, circuit breaker and stats; server-side caching and pre-warming
- [x] `npm run host:check`: model discovery, EN/BN samples, speech→text round trip, latency
- [ ] **You:** create a Gemini API key (free, no card) and put it in `.env.local`
- [ ] Run `host:check`, then `narration:render` to replace the placeholders with real voice
- [ ] Native speaker reviews the Bangla lines and clips

## Milestone 4 — Live push-to-talk ✅ (mock) / ⏳ (real)

- [x] Hold-to-talk on the dashboard → cloud STT → LLM reply in the guest's language → spoken on the TV
- [x] Language hint, auto-speak toggle, transcript and timing display
- [ ] Real run with a Groq key; tune prompts for Bangla replies

## Milestone 5 — Failover, playback, latency, full rehearsal

- [x] Unit tests for failover, timeouts, language routing, circuit breaker, adapters (mocked HTTP)
- [x] Browser end-to-end test (`tests/e2e/full-show.mjs`): unlock, clips, live lines, commentary, Bangla, push-to-talk, auto-quips, TTS outage → recorded fallback → captions, restart recovery
- [ ] With real keys: measure live latency on the venue Wi-Fi; pre-render everything possible
- [ ] Full rehearsal on the TV with 10+ phones, including pulling the network cable mid-show

## After the party is safe (not scheduled)

- Supabase (needed only to deploy on Vercel); photo/video uploads; Mez Survey, Mez on Trial, Mez Imposter, Mystery Files; prizes and surprise reveals.

## Suggested order for the next five days

1. Get the Gemini and Groq keys → `host:check` → `narration:render` (spread over two days if the free TTS quota is small).
2. Swap the mock questions for real Mez trivia.
3. Mez Survey and Mez on Trial (they reuse the question/vote loop).
4. Rehearsal on the actual TV and Wi-Fi.
