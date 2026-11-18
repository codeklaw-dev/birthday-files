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

- **Lines.** `src/lib/host/script.ts` holds the script (33 lines, including an intro for each game, a reveal drumroll, surprise and memory intros, and push-to-talk "thinking" and fallback lines). *Static* lines (welcome, cake, quips…) have a `clip` key and are pre-recorded. *Dynamic* lines (names, numbers) are spoken live and carry a `fallbackClip` with the same meaning.
- **Pre-warming.** When the engine emits a line, `service.ts` starts synthesising it on the server straight away, so the TV usually finds it already cached.
- **Interruptions.** Scripted and host-typed lines cut off whatever is still playing (the game has moved on). Quips, AI lines and conversation replies queue behind it.
- **Languages.** `en`, `bn`, `both`, or `auto`: auto alternates line by line and uses both for big moments. Conversation replies use the language the guest spoke.
- **Safety.** LLM output is constrained by the system prompt (kind teasing only, no sensitive topics, short), stripped of markdown, emoji and links, capped in length, and **not spoken until the host approves**, unless auto-quips is switched on.
- **Secrets.** Keys exist only as server environment variables. The public speech endpoint can only speak lines the server already put in the room state, so it cannot be used to spend quota on arbitrary text. Every other AI endpoint needs the host key.
- **Sound effects** are synthesised with Web Audio (no files): ding, buzzer, drumroll, fanfare, applause, air horn, tick, whoosh.
- **Telemetry.** The TV reports how each line was played (clip, live, fallback, browser, captions), with provider and time to first sound. The dashboard's *Voice system* panel shows this alongside provider health.
- **Browser rules.** The TV needs one click to enable sound (autoplay policy). In kiosk mode, launching Chrome with `--autoplay-policy=no-user-gesture-required` skips it. The microphone needs a secure page, so push-to-talk works at `http://localhost` on the laptop or over HTTPS, not from a phone on `http://192.168…`.

Provider research, costs and set-up steps: [AI_PROVIDERS.md](AI_PROVIDERS.md). Modes, guardrails, latency and demo: [AI_HOST.md](AI_HOST.md).

**Since Phase 4:**
- The host's personality, approved guest facts, announcements and narration approvals live in a separate store (`host/server/knowledge.ts`).
- The model's view of the room comes from the public TV view (`host/server/context.ts`).
- AI output can only reach the show through `host/server/ai-actions.ts` (speak-only).
- The TV plays only organiser-approved clips (`/api/host/narration`).
- Push-to-talk is two steps (`/api/host/transcribe` → `/api/host/reply`) so the transcript can be corrected.
- Surprises are a scene (`phase: "surprise"`) built server-side from approved content.

## Invite portal (guest RSVPs and submissions)

`/invite` collects RSVPs (including "can't come, but want to take part"), three host-editable questions, a favourite memory, a funny accusation, an optional photo and an optional 15–60 second video, plus permission to show them at the party. `/admin/submissions` is where the host reviews them.

```
 phone  /invite ──POST /api/invite/submissions──► validate (zod, same schema as the form) ─► store
           │        ◄── edit token (shown once) ──
           ├──PUT /api/invite/media/photo|video (raw body, x-edit-token)──► stream to disk ─► checks ─► attach
           └──GET/PUT/DELETE /api/invite/submissions/me (x-edit-token)
 laptop /admin/submissions ──GET/PATCH/DELETE /api/invite/admin… (x-host-key)
 <img>/<video> ──GET /api/invite/media/file/<id>?exp&sig  (15-minute signed link, Range support)
```

Storage (`src/lib/invite/server/store.ts`) is one JSON file plus a media folder under `.data/invite/` (override with `INVITE_DATA_DIR`), outside `public/`. Folders are created mode 700 and files mode 600, and writes are atomic. The class maps one-to-one onto future Supabase tables (`submissions`, `invite_settings`) and Storage buckets; that file and `paths.ts` are the only ones to replace.

**Security model**

| Who | Can do | How it's enforced |
| --- | --- | --- |
| Anyone | Read the three questions; create one RSVP (rate-limited) | Public routes |
| The guest | Read, edit and withdraw *their own* RSVP; replace or remove their photo/video | 192-bit random edit token in the link fragment (`/invite#edit=…`, never sent in server logs or Referer). The server stores only its SHA-256 hash. |
| The host | Everything: review, tag, order, delete, edit questions | `HOST_KEY` header (constant-time compare) |
| An `<img>` or `<video>` tag | One file, for 15 minutes | HMAC-signed link (`INVITE_SIGNING_SECRET`, or a random key auto-generated into the data folder). Unsigned, expired or tampered links get 403. |

**Upload checks.** File type is decided by the first bytes (JPEG/PNG/WebP; MP4/MOV/WebM), never by the name or the claimed Content-Type. Sizes are capped while streaming (photo 12 MB, video 95 MB — under Cloudflare's 100 MB request limit). Video length is read from the file (MP4/MOV `mvhd`, WebM `Duration`). If a WebM recording has no duration, the browser's measurement is used and marked "length reported by the browser". Photos are resized to ≤ 2000 px in the browser, which drops EXIF, and the server also strips JPEG APP1–15/COM segments and PNG text/EXIF chunks, so GPS location never reaches the disk. **Video location metadata is not stripped** (that needs re-encoding with ffmpeg); videos are only ever visible to the host.

**Moderation.** pending → approved / rejected, plus tags, honourable mention and a private note. The party's *running order* contains only approved submissions whose guest ticked permission. A guest edit after review sends the submission back to pending ("edited since review"). Withdrawing deletes the record and its files.

## Birthday games

Five games share one server-authoritative framework (`src/lib/games/`). Each game is a small, pure state machine (`imposter.ts`, `wkmb.ts`, `survey.ts`, `trial.ts`, `mystery.ts`) with the same shape:

- **Steps and timers** live on the server. `room-store.ts` fires `system/gameTimeUp` with the round id and step, so a stale timer can never move a later round.
- **Actions** are checked for role, step and one-per-person (votes, clues and guesses can't be changed or repeated).
- **Views** are computed per viewer (`view(game, {role, playerId})`), so a phone only receives what that phone may know.
- **Scoring** happens once, on the step that reveals the result, as a list of awards with the rule that produced each.

| Game | Content (server-built) | Who acts | Board |
| --- | --- | --- | --- |
| Mez Imposter | Random word from `config.ts` | Phones: clue, vote, imposter's one word guess | Live |
| Who Knows Mez Best | The 3 invite answers of each approved, consented guest (attending or remote) | Mez's judge phone: 0–3 stars, then lock | Mez Expert |
| Mez Survey | Boards the host approved in `/admin/games` (server groups answers; counts recomputed server-side) | Phones guess; host may accept a near-miss (logged) | Live |
| Mez on Trial | Approved accusations (host picks which) | Mez: plea and "rest my case"; phones: jury | Live (jury majority) + Mez Expert (accuser, if guilty) |
| Mystery Files | Approved photos, videos and memories, anonymised | Mez and phones guess the contributor | Live |

**Who sees what.** Secret words and imposter identities never reach the TV, the host or other phones before the reveal. Who Knows Mez Best authors stay hidden from everyone, Mez included, until Mez locks the scores. Accusers are named only with the verdict. Mez's mystery guess is shown on the TV only as "Mez has made a call". The host sees the full survey board only after guessing closes. Exhibit photos and videos reach the TV and judge as signed links that change once an hour, and never reach phones.

**Content can't be injected.** `host/game/start` and `host/setup/survey` are rebuilt by the action route from the invite store (`games/server/content.ts`); whatever a client sends in those fields is replaced. Only submissions that are approved, consented and not "can't make it" are used.

**Mez's judge phone** (`/judge#k=<key>`) authenticates with a random judge key held in the room state. The host can show it as a QR code or rotate it, which signs the old phone out at once. `judge/*` actions and the judge stream require it.

**Scores: an append-only ledger.** Every point is a `LedgerEntry` (board, person, delta, rule, note, by, time). Totals are always computed from the ledger, and `player.score` is kept in sync for the older quiz UI. Corrections, the judge's bonus (positive and capped) and even "reset" are *new entries* with a reason; nothing is edited or deleted. Changing the points rules is logged and only affects later rounds. Two boards:
- **Mez Expert**: invite contributors, attending and remote on equal terms (Who Knows Mez Best stars, upheld accusations).
- **Live Games Champion**: phone players in live rounds (warm-up quiz, Imposter, Survey, Trial jury, Mystery guesses).

**Prize wheel.** Eligibility comes from the boards (top 3 with points on either board), one spin per person, and a declined prize doesn't use it up. Remote guests only get prizes that work from afar. Hug prizes appear only after Mez switches them on from the judge phone, and anyone can decline anything. The result is drawn on the server with `crypto` randomness (`secureRandom`); the draw value, the segment list and the winning segment are written to the event log. The TV only animates to the server's result, and nobody can choose an outcome.

**TV kit** (`src/components/tv.tsx`): `Scene` transitions (rise and curtain), `TimerRing`, `Counter`, `VoteBars`, `Stamp`, `RevealCard`, `PrizeWheel`, `BoardColumn`, plus `useGameCues` for sound cues on step changes and ticks in the last three seconds.

## Fairness rules in the engine

- One answer per player per question; no changes after tapping.
- Timing uses the server clock. Late answers are rejected server-side.
- Correct answer = `quizCorrect` (100) + up to `quizSpeedMax` (50) for speed. Wrong or missing = 0. All game points are in `src/lib/games/config.ts` and editable in `/admin/games`.
- Ties rank by who joined first.
- Host corrections are capped at ±500 per entry, need a reason, cannot push a total below zero, and are added to the ledger (never edits).
- Names are trimmed, capped at 20 characters and de-duplicated.

## Known gaps in the prototype

- Anyone who can reach `/play` can join; there is no room code check yet (single room `MEZ26`).
- Rate limits are in-memory per IP (messages 6/min, joins 12/min); fine for one party, not for the public internet.
- The host key travels in the SSE query string. Acceptable on a home network, replaced by real auth in Milestone 2.
- shadcn/ui, React Hook Form and Framer Motion are not installed yet; the handful of components here did not need them.

## Show director (Phase 5)

- `src/lib/show/` — running order (`config.ts`), verified 21 November history (`history.ts`), and the pure director engine (`engine-show.ts`): segments, pause/emergency hold, presentational scenes, cake stages. It plugs into `applyAction` like the games module.
- `src/lib/show/server/build.ts` — turns a segment into its starting action; all scene content (spotlight, honours, montage, ceremony, prizes, history) is built here from approved, consented submissions. `/api/room/action` refuses client-built scenes.
- `/api/show/preview` applies a segment to a throwaway copy of the room and returns the TV's view; `/display/preview` renders it in an iframe on the dashboard.
- `src/app/display/show-stage.tsx` — 16:9 `TvFrame`, scenes, cake, overlays, media fallbacks; `display-screen.tsx` exposes a pure `Stage` used live, in the silent mirror (`?mirror=1`) and in previews.
- Rehearsal: `scripts/rehearsal.mjs` sets `REHEARSAL=1` and `.data/rehearsal/*` folders, `scripts/seed-rehearsal.ts` seeds fictional guests; `src/lib/server/rehearsal.ts` makes every store refuse non-rehearsal folders in that mode.
- See [SHOW.md](SHOW.md) for operating the show.
