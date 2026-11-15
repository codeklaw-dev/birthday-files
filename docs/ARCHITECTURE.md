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
  components/ui.tsx                 shared UI: Button, Logo, Leaderboard, HostLine, MessageForm
  lib/
    game/      types.ts, engine.ts, mock-data.ts     rules and data shapes
    server/    room-store.ts                         MOCK backend (in-memory + SSE fan-out)
    client/    use-room.ts, hooks.ts                 the one client seam to the backend
    casper/    types.ts, mock-adapter.ts, script.ts  Casper adapter contract + silent mock
    event.ts                                         party facts (date, game names)
tests/engine.test.ts                                 engine unit tests
```

## What is mocked, and what replaces it

| Concern | Today (mock) | Target | Seam to change |
| --- | --- | --- | --- |
| State storage | One room in server memory; lost on restart | Supabase Postgres | `room-store.ts` |
| Realtime | SSE from a single Node process | Supabase Realtime (Broadcast for views, Presence for who is online) | `use-room.ts` + `room-store.ts` |
| Media | Not built | Supabase Storage with signed upload URLs | new `lib/server/storage.ts` |
| Host auth | Shared key in `HOST_KEY`, compared server-side | Supabase Auth (single host account) | `isHostKey()` |
| Player identity | Random token in `localStorage` | Same token, stored hashed in `players` | none in the UI |
| Casper | Silent adapter; fixed bilingual script shown as captions | Real STT/TTS pipeline | `lib/casper/index.ts` |
| Questions | `mock-data.ts`, marked `[Mock]` | `questions` table, edited by the host | `createRoom()` |

**Important limit of the mock:** in-memory state only works when one Node process serves everyone (`next dev`, `next start`). It will not work on Vercel, where each request may hit a different instance. Supabase must be in place before deploying.

### Keeping the authority model on Supabase

Phones should not get write access to game tables. Actions keep going through the route handler, which loads the room, runs `applyAction`, writes the result with the service-role key, and broadcasts the per-role views. Row Level Security then only has to allow reads of public data. This keeps the engine and its tests unchanged.

Proposed tables (not created yet): `rooms`, `players`, `questions`, `answers`, `messages`, `media`, `score_events`, plus one table per game mode as they are built. `score_events` already exists in memory as `scoreLog`: every point change is an append-only row with a reason, which is what makes the leaderboard auditable.

## Casper adapter

`lib/casper/types.ts` defines the only contract the app uses:

```ts
interface CasperAdapter {
  say(utterance: { text: { en: string; bn: string }; lang: "en" | "bn" | "both" }): Promise<{ spoken: boolean; durationMs: number }>;
  listen?(opts: { lang: "en" | "bn"; timeoutMs: number }): Promise<{ text: string; lang: "en" | "bn" } | null>;
  stop(): void;
}
```

No Casper endpoint, payload or credential has been assumed anywhere. To connect the real pipeline we need: the base URL and auth method, whether TTS returns audio (URL or stream) or plays on a device, the STT input format, and expected latency. With that, add `lib/casper/http-adapter.ts`, proxy it through a route handler so credentials stay on the server, and return it from `getCasper()`.

The engine emits a bilingual `hostLine` on each phase change. Today those come from `script.ts`; later Casper can write its own lines and the screens will not need to change.

## Fairness rules in the engine

- One answer per player per question; no changes after tapping.
- Timing uses the server clock. Late answers are rejected server-side.
- Correct answer = 100 points + up to 50 for speed. Wrong or missing = 0.
- Ties rank by who joined first.
- Host bonus points are capped at ±500 per action, cannot push a score below zero, and are logged.
- Names are trimmed, capped at 20 characters and de-duplicated.

## Known gaps in the prototype

- Anyone who can reach `/play` can join; there is no room code check yet (single room `MEZ26`).
- No rate limiting on message submission beyond length and a 300-message cap.
- The host key travels in the SSE query string. Acceptable on a home network, replaced by real auth in Milestone 2.
- shadcn/ui, React Hook Form and Framer Motion are not installed yet; the handful of components here did not need them.
