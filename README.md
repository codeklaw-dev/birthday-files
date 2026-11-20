# The Birthday Files: Mez Edition

An interactive, AI-hosted birthday game show for 21 November 2026. A laptop runs the private host dashboard, a TV shows the show, and guests play from their phones.

**Status: Milestone 1 — a working multiplayer prototype on mock data.** No Supabase, no Casper API, no deployment yet.

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
| `/admin` | Laptop, private | Run of show, answer key, live tallies, bonus points, message moderation, Casper language |
| `/display` | TV | Lobby + QR, questions, reveal, leaderboard, message wall, cake, finale, Casper's voice (press "Turn on voice" once) |
| `/play` | Phones | Join, answer, send messages, blow out candles |
| `/invite` | Shared link | Invitation, countdown, message drop |

## Checks

```bash
npm run check        # lint + typecheck + unit tests + production build
```

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it fits together and what gets swapped for Supabase and Casper
- [docs/MILESTONES.md](docs/MILESTONES.md) — what is done, what is next
