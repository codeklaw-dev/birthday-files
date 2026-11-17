# The Birthday Files: Mez Edition

An interactive, AI-hosted birthday game show for 21 November 2026. A laptop runs the private host dashboard, a TV shows the show, and guests play from their phones.

**Status:** five birthday games with two leaderboards and a prize wheel, a judge phone for Mez, a multiplayer show and a cloud AI host (voice in English and Bangla, AI commentary, push-to-talk) with offline fallbacks. Real voices need a free Gemini key; see [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md). No deployment yet.

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
| `/invite` | Shared link | Invitation for Mez's 24th: RSVP, questions, memory, accusation, photo and video, private edit link |
| `/admin/submissions` | Laptop, private | Review RSVPs and uploads: approve, tag, order, honourable mentions |
| `/judge` | Mez's phone, private | Judge controls: stars, verdicts, mystery guesses, bonus, hug-prize switch (open via the link/QR on `/admin`) |
| `/admin/host` | Laptop, private | AI host: personality, guest facts, surprise announcements, narration review |
| `/admin/games` | Laptop, private | Approve survey boards, choose trial charges, edit the points rules |
| `/hub` | Organiser | Links to every screen (the bare address `/` sends guests to `/invite`) |

## Preview the games

1. Have a few guests submit the invite and approve them in `/admin/submissions` (games only use approved submissions whose guest allowed showing them).
2. Open `/display` on the TV, `/admin` on the laptop, and the **judge link** from the "Mez's judge phone" card on Mez's phone. Guests join on `/play`.
3. For Mez Survey, approve a board in `/admin/games` first.
4. Start a game from the Games card. The big button always shows the next step. Use **+15 s / End timer now / Stop game** as needed, then **Show leaderboards** or **Prize wheel**.

To rehearse quickly, run with shorter timers:

```bash
GAME_TIMER_SCALE=0.3 npm run party
```

## Preview the invite

```bash
npm run dev
```

- Guest view: http://localhost:3000/invite (use your browser's phone emulation, or a phone on the same Wi-Fi via the laptop's address)
- Host view: http://localhost:3000/admin/submissions (host key: `HOST_KEY`, or `mez-host` in development)
- Data lands in `.data/invite/` (git-ignored, private). Delete that folder to start fresh.

### Sharing the invite with guests

The invite runs on the laptop, so guests can only reach it on the same network. To collect RSVPs from home before the party it needs a public address. That's a deployment decision, not yet made:
- **Quick, temporary:** a tunnel from the laptop (e.g. Cloudflare Tunnel) while it's switched on. Free, but the laptop must stay on.
- **Proper:** Vercel + Supabase (database + private storage bucket + signed upload URLs for videos, since Vercel functions accept only ~4.5 MB uploads). Free tiers suffice; `src/lib/invite/server/store.ts` is the file to swap.

## AI host

```bash
cp .env.example .env.local   # add GEMINI_API_KEY (and GROQ_API_KEY for push-to-talk)
npm run host:check           # tests EN + Bangla speech, transcription, commentary, latency
npm run narration:render     # pre-records the host's lines into public/narration/
```

Then approve the clips in `/admin/host`: the TV only plays approved narration.

Without keys everything still runs: recorded placeholder clips, a beeping mock voice for live lines, and mock commentary.

## Checks

```bash
npm run check        # lint + typecheck + unit tests + production build
node tests/e2e/full-show.mjs   # game show in real browsers (needs Playwright + Chromium; build first)
node tests/e2e/invite.mjs      # invite + moderation in real browsers (also needs ffmpeg)
node tests/e2e/games.mjs       # all five games, judge phone, boards and prize wheel (needs ffmpeg)
node tests/e2e/offline.mjs     # the whole show with every cloud service down
```

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it fits together and and how the AI host works
- [docs/AI_HOST.md](docs/AI_HOST.md) — the AI host's three modes, guardrails, latency, costs, configuration and demo steps
- [docs/AI_PROVIDERS.md](docs/AI_PROVIDERS.md) — cloud AI provider comparison, costs and set-up
- [docs/MILESTONES.md](docs/MILESTONES.md) — what is done, what is next
