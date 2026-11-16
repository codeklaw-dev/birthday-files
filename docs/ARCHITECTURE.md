# Architecture

## Shape of the system

```
 Phones (/play)        TV (/display)        Laptop (/admin)
      │                     │                     │
      └────── useRoom() ────┴────── useRoom() ────┘      src/lib/client/use-room.ts
                 │  actions (POST)      ▲  role-filtered views (push)
                 ▼                      │
        /api/room/action        /api/room/stream          src/app/api/room/*
                 │                      ▲
                 ▼                      │
              RoomStore  ── applyAction / viewFor ──      src/lib/server/room-store.ts
                              (pure engine)               src/lib/game/engine.ts
```

Three ideas carry the design:

1. **The server is the only authority.** Clients send small *actions* (`join`, `answer`, `host/reveal`…). They never write state directly.
2. **The engine is pure.** `applyAction(state, action, ctx)` returns a new state or an error. No I/O, no timers. It is covered by unit tests and does not care where state is stored.
3. **Every client gets a filtered view.** `viewFor(state, role, token)` decides what a host, the TV or one phone may see. The answer key and per-option tallies are withheld from phones and the TV until reveal; pending messages only go to the host; player tokens are never broadcast.

## Folder map

```
src/
  app/
    admin/ display/ play/ invite/   one folder per screen (page.tsx + a client component)
    api/room/action                 POST an action
    api/room/stream                 Server-Sent Events: pushes views
    api/room/host-check             validates the host key for the /admin gate
    api/host/*                      speech, tts preview, commentary, listen, report, status
  components/ui.tsx                 shared UI: Button, Logo, Leaderboard, HostLine, MessageForm
  lib/
    game/      types.ts, engine.ts, mock-data.ts     rules and data shapes
    server/    room-store.ts, rate-limit.ts          MOCK backend (in-memory + SSE fan-out + disk snapshot)
    client/    use-room.ts, hooks.ts                 the one client seam to the backend
    host/      persona.ts, script.ts, host-state.ts   host lines and pure helpers used by the engine
      client/  audio-director.ts, sfx.ts, use-host-audio.ts   TV playback and sound effects
      server/  router.ts, speech-cache.ts, commentary.ts, service.ts, providers/*   cloud AI behind one interface
    event.ts                                         party facts (date, game names)
scripts/                                             narration:render, host:check
public/narration/                                    pre-recorded host clips + manifest.json
tests/                                               unit tests; tests/e2e/full-show.mjs browser test
```

## What is mocked, and what replaces it

| Concern | Today (mock) | Target | Seam to change |
| --- | --- | --- | --- |
| State storage | One room in server memory, snapshotted to `.data/room.json` | Supabase Postgres | `room-store.ts` |
| Realtime | SSE from a single Node process | Supabase Realtime (Broadcast for views, Presence for who is online) | `use-room.ts` + `room-store.ts` |
| Media | Not built | Supabase Storage with signed upload URLs | new `lib/server/storage.ts` |
| Host auth | Shared key in `HOST_KEY`, compared server-side | Supabase Auth (single host account) | `isHostKey()` |
| Player identity | Random token in `localStorage` | Same token, stored hashed in `players` | none in the UI |
| AI host | Cloud providers when keys exist; offline mocks and robotic placeholder clips otherwise | Gemini + Groq (see AI_PROVIDERS.md) | `.env.local` only |
| Questions | `mock-data.ts`, marked `[Mock]` | `questions` table, edited by the host | `createRoom()` |

**Important limit of the mock:** in-memory state only works when one Node process serves everyone (`next dev`, `next start`). It will not work on Vercel, where each request may hit a different instance. Supabase must be in place before deploying.

### Keeping the authority model on Supabase

Phones should not get write access to game tables. Actions keep going through the route handler, which loads the room, runs `applyAction`, writes the result with the service-role key, and broadcasts the per-role views. Row Level Security then only has to allow reads of public data. This keeps the engine and its tests unchanged.

Proposed tables (not created yet): `rooms`, `players`, `questions`, `answers`, `messages`, `media`, `score_events`, plus one table per game mode as they are built. `score_events` already exists in memory as `scoreLog`: every point change is an append-only row with a reason, which is what makes the leaderboard auditable.

## AI host (voice, commentary, conversation)

The earlier Casper integration requirement has been removed. The host is now provider-independent and cloud-only, with the persona defined in `src/lib/host/persona.ts` ("Inspector Byte", a placeholder name).

```
 game engine ──► host.utterance {id, text{en,bn}, lang, clip?, fallbackClip?, source}
                     │  (room state, pushed over SSE)
                     ▼
 TV  AudioDirector: exact recorded clip → live cloud TTS → generic recorded clip → browser voice → captions
                     │ GET /api/host/speech?u=<id>&lang=bn   (only lines already in room state)
                     ▼
 server  speech-cache (memory + disk, de-duplicated) ──► router: TTS chain with timeouts + circuit breaker
                                                          gemini → azure → mock
 admin   /api/host/commentary  (LLM draft, host approves)   LLM chain: gemini → groq → cloudflare → mock
         /api/host/listen      (push-to-talk)               STT chain: groq → gemini → cloudflare → mock
```

- **Lines.** `src/lib/host/script.ts` holds the script. *Static* lines (welcome, cake, quips…) have a `clip` key and are pre-recorded. *Dynamic* lines (names, numbers) are spoken live and carry a `fallbackClip` with the same meaning.
- **Pre-warming.** When the engine emits a line, `service.ts` starts synthesising it on the server straight away, so the TV usually finds it already cached.
- **Interruptions.** Scripted and host-typed lines cut off whatever is still playing (the game has moved on). Quips, AI lines and conversation replies queue behind it.
- **Languages.** `en`, `bn`, `both`, or `auto`: auto alternates line by line and uses both for big moments. Conversation replies use the language the guest spoke.
- **Safety.** LLM output is constrained by the system prompt (kind teasing only, no sensitive topics, short), stripped of markdown, emoji and links, capped in length, and **not spoken until the host approves**, unless auto-quips is switched on.
- **Secrets.** Keys exist only as server environment variables. The public speech endpoint can only speak lines the server already put in the room state, so it cannot be used to spend quota on arbitrary text. Every other AI endpoint needs the host key.
- **Sound effects** are synthesised with Web Audio (no files): ding, buzzer, drumroll, fanfare, applause, air horn, tick, whoosh.
- **Telemetry.** The TV reports how each line was played (clip, live, fallback, browser, captions), with provider and time to first sound. The dashboard's *Voice system* panel shows this alongside provider health.
- **Browser rules.** The TV needs one click to enable sound (autoplay policy). In kiosk mode, launching Chrome with `--autoplay-policy=no-user-gesture-required` skips it. The microphone needs a secure page, so push-to-talk works at `http://localhost` on the laptop or over HTTPS, not from a phone on `http://192.168…`.

Provider research, costs and set-up steps: [AI_PROVIDERS.md](AI_PROVIDERS.md).

## Fairness rules in the engine

- One answer per player per question; no changes after tapping.
- Timing uses the server clock. Late answers are rejected server-side.
- Correct answer = 100 points + up to 50 for speed. Wrong or missing = 0.
- Ties rank by who joined first.
- Host bonus points are capped at ±500 per action, cannot push a score below zero, and are logged.
- Names are trimmed, capped at 20 characters and de-duplicated.

## Known gaps in the prototype

- Anyone who can reach `/play` can join; there is no room code check yet (single room `MEZ26`).
- Rate limits are in-memory per IP (messages 6/min, joins 12/min); fine for one party, not for the public internet.
- The host key travels in the SSE query string. Acceptable on a home network, replaced by real auth in Milestone 2.
- shadcn/ui, React Hook Form and Framer Motion are not installed yet; the handful of components here did not need them.
