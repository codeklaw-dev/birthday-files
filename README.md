# The Birthday Files: Mez Edition

An interactive, AI-hosted birthday game show for 21 November 2026. A laptop runs the private host dashboard, a TV shows the show, and guests play from their phones.

**Status:** multiplayer show plus a cloud AI host (voice in English and Bangla, AI commentary, push-to-talk) with offline fallbacks. Real voices need a free Gemini key; see [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md). No deployment yet.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000 — fine for one machine
```

To play with real phones on the same Wi-Fi, use the production server (the dev server blocks requests from other devices by default):

```bash
npm run party        # builds, then serves on 0.0.0.0:3000
```

1. Laptop: open `/admin`, enter the host key (`mez-host` unless `HOST_KEY` is set).
2. TV (second window or screen): open `/display`. It shows a QR code pointing at the laptop's LAN address.
3. Phones: scan the QR code, pick a name, play.

## Screens

| Route | Device | Purpose |
| --- | --- | --- |
| `/admin` | Laptop, private | Run of show, answer key, live tallies, bonus points, message moderation, AI host voice, soundboard, commentary, push-to-talk |
| `/display` | TV | Lobby + QR, questions, reveal, leaderboard, message wall, cake, finale, host voice and captions |
| `/play` | Phones | Join, answer, send messages, blow out candles |
| `/invite` | Shared link | Invitation, countdown, message drop |

## AI host

```bash
cp .env.example .env.local   # add GEMINI_API_KEY (and GROQ_API_KEY for push-to-talk)
npm run host:check           # tests EN + Bangla speech, transcription, commentary, latency
npm run narration:render     # pre-records the host's lines into public/narration/
```

Without keys everything still runs: recorded placeholder clips, a beeping mock voice for live lines, and mock commentary.

## Checks

```bash
npm run check        # lint + typecheck + unit tests + production build
node tests/e2e/full-show.mjs   # browser end-to-end run (needs Playwright + Chromium; build first)
```

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it fits together and and how the AI host works
- [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) — cloud AI provider comparison, costs and set-up
- [docs/MILESTONES.md](docs/MILESTONES.md) — what is done, what is next
