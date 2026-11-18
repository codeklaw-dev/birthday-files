# Party readiness — The Birthday Files: Mez Edition

Audit of branch `feat/ai-host` on **18 Nov 2026** for the party on **Sat 21 Nov 2026**.
Every claim is marked **[verified]** (read in code and/or run in a test during this audit) or **[assumption]** (not tested here; needs checking on the real laptop, network or devices).

> Important context: this audit ran in a cloud copy of the repository, **not on the party laptop**. The laptop's own `.data/` folder, `.env.local`, Wi-Fi and TV were not inspected.

---

## 1. Architecture facts

| Question | Answer | Evidence |
| --- | --- | --- |
| Where is the database? | Three JSON files on the laptop's disk: `.data/room.json` (players, scores, show state), `.data/invite/invite.json` (submissions), `.data/host/knowledge.json` (AI host settings). No external database. **[verified]** | `src/lib/server/room-store.ts` (`SNAPSHOT`), `src/lib/invite/server/paths.ts`, `src/lib/host/server/knowledge.ts` |
| Does it survive restarts? | Yes. Invite writes are synchronous and atomic (temp file + rename). The room is saved 0.5 s after each change, so a crash can lose at most the last half-second. A real stop/restart test kept a player and a submission. **[verified]** | `store.ts` `save()`, `room-store.ts` `scheduleSave()`; restart test in this audit |
| Where are photos and videos? | `.data/invite/media/<uuid>.<ext>` on the laptop (folder mode 700, files 600). Outside `public/`, so only reachable through signed links. **[verified]** | `paths.ts`, `store.ts` `ensureMediaDir`, `media/[kind]/route.ts` |
| Guest "login" | No accounts. Creating an RSVP returns a 192-bit random **edit token** once; only its SHA-256 hash is stored. The private edit link is `/invite#edit=<token>`: the token is in the `#` fragment (never sent to the server or logged), copied to the browser's localStorage, then removed from the address bar. API calls send it in an `x-edit-token` header. **[verified]** | `secrets.ts` `newEditToken/hashToken`, `invite-screen.tsx` L42–48, `http.ts` `guestFromRequest` |
| Private media links | HMAC-SHA256 signed URLs, valid 15 min (TV: up to 2 h). The key comes from `INVITE_SIGNING_SECRET` or is generated once into `.data/invite/signing.key`. **[verified]** | `secrets.ts` |
| Real-time multiplayer | One Node process holds the room in memory and pushes a role-filtered view to every screen with **Server-Sent Events** (`/api/room/stream`), with a 15 s heartbeat. Phones and the TV send actions with `POST /api/room/action`. EventSource reconnects automatically. **Single process only**: two servers on the same data would overwrite each other. **[verified]** | `stream/route.ts`, `room-store.ts`, `use-room.ts`; invite store caches the file in memory (`store.ts` `load()`) |
| Works without internet? | The show is served from the laptop over the venue Wi-Fi; fonts are bundled at build time (`next/font`). Tested with **every AI provider failing**: narration falls back to approved recordings, the browser's voice, then captions. **[verified with simulated AI outage]**. A real "cable unplugged" test has **not** been done **[assumption]**. The first `npm run build` needs internet (packages, fonts). | `tests/e2e/offline.mjs` uses `HOST_*_CHAIN=mock-fail`; `src/app/layout.tsx` uses `next/font/google` |
| What needs the cloud? | Live AI voice for new lines (Gemini TTS, optional Azure), AI commentary/replies (Gemini, Groq, optional Cloudflare Workers AI), push-to-talk transcription (Groq Whisper, Gemini). Everything else is local. **[verified]** | `src/lib/host/server/router.ts`, `providers/*` |
| Admin protected? | Every admin/host route checks the host key in constant time (`isHostKey`); judge routes check Mez's judge key; `system/*` actions are refused. **But `HOST_KEY` is not set** in this copy's `.env.local`, so the key is the public default **`mez-host`**, which the login page itself mentions. **[verified]** | `room-store.ts` L131–137, `admin-screen.tsx` L43, all routes under `src/app/api` |
| Can remote guests reach `/invite`? | **Not yet.** The app only listens on the laptop (`npm run party` → `0.0.0.0:3000`, LAN only). Nothing is deployed and no tunnel exists. **[verified]** | `package.json`, no deployment config in the repo |

### Fixed during this audit (small hardening, no architecture change)

1. **Public gate** (`src/proxy.ts`, `src/lib/server/public-gate.ts`). Requests that come through Cloudflare (they carry `cf-connecting-ip` / `cf-ray`) can only reach `/invite`, its API, static assets and signed media. Everything else (admin, TV, play, judge, AI host, room stream) returns 404, **even with the correct host key**. LAN requests are unaffected. Photo and video uploads bypass the proxy, because Next.js buffers bodies that pass through a proxy (10 MB by default) and would cut videos short. **[verified]**: 4 unit tests, a simulated-tunnel run (14 paths), a 40.9 MB video uploaded byte-for-byte, and all 131 browser checks still pass.
2. **Rate limits keyed on Cloudflare's client IP.** Before, a visitor could dodge the limits by sending a fake `X-Forwarded-For`. **[verified]**: spoofed headers are now limited (6th request → 429).
3. **Video limit 150 MB → 95 MB.** Cloudflare's Free plan rejects request bodies over 100 MB with its own error page, so guests would have seen an unexplained failure. The app now tells them before uploading. **[verified]**: unit test; limit from Cloudflare's [Workers limits](https://developers.cloudflare.com/workers/platform/limits) and [error 413](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413) docs.

---

## 2. Getting the invitation online (recommendation)

| | A. Cloudflare Tunnel → laptop | B. Hosted portal (Vercel + Supabase) | C. Other free tunnels |
| --- | --- | --- | --- |
| Code changes | None more (gate added above) | Large: replace the JSON store and media folder with a database + storage bucket, direct-to-storage video uploads (Vercel functions accept ~4.5 MB bodies), then copy everything back to the laptop | Tailscale Funnel: the gate only recognises Cloudflare headers, so it would need adapting and testing. ngrok free: shows browser warning page to guests |
| Data sync | **None**: submissions land on the laptop the show reads | Must export/import before the party; two copies can drift | None |
| Security | Only invite paths reachable (app gate; optionally also tunnel path rules). HTTPS by Cloudflare. Laptop not port-forwarded | Good, but new code and new secrets to get right in 3 days | Similar to A once gated |
| Upload limit | 100 MB per request (app caps videos at 95 MB) | Bucket limits (fine) | Varies |
| Reliability | Laptop and cloudflared must stay on and online until the party | Always on | Laptop must stay on |
| Cost | Free. A **stable** URL needs a domain on Cloudflare (owning one: free; buying one: about US$10/yr → needs your approval) | Free tiers | Free |
| Set-up time | 15–30 min | 1–2 days of work + testing | 30–60 min + code change |

**Recommendation for the next three days: A, a Cloudflare Tunnel to the laptop**, with the app's public gate.

- **If you already have a domain on Cloudflare:** use a **named tunnel** with a stable address such as `invite.<your-domain>`, plus tunnel path rules as a second lock (config below). This is the most reliable choice.
- **If you don't:** a **Quick Tunnel** works with no account and no cost, but Cloudflare says it is for testing only, with **no uptime guarantee and at most 200 in-flight requests**, and **the address changes every time cloudflared restarts** ([Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)). A new address would break the edit links you've already sent, and the "this device remembers you" convenience (it's stored per address). Fine for a small guest list if the laptop stays on; otherwise approve buying a domain.
- Moderation stays on the laptop (`/admin/submissions` on the LAN); it is deliberately **not** reachable through the tunnel.

### Commands (for you to run when you approve; nothing has been run)

On the party laptop, with `HOST_KEY` set first:

```bash
npm run build
npm run party
```

Quick Tunnel (no account; random `*.trycloudflare.com` address):

```bash
cloudflared tunnel --url http://localhost:3000
```

Named tunnel (needs a free Cloudflare account and a domain on Cloudflare): create it in the Cloudflare dashboard (Zero Trust → Networks → Tunnels) or with `cloudflared tunnel create birthday-invite`, then use these ingress rules so only invitation paths are forwarded ([ingress rule docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/configuration/ingress)):

```yaml
tunnel: birthday-invite
credentials-file: /path/to/<tunnel-id>.json
ingress:
  - hostname: invite.example.com
    path: ^/(invite/?|favicon\.ico|_next/(static|image)/.*|api/invite/(settings|submissions(/me)?|media/(photo|video)|media/file/[0-9a-f-]{36}))?$
    service: http://localhost:3000
  - service: http_status:404
```

Check it with `cloudflared tunnel ingress validate` and `cloudflared tunnel ingress rule https://invite.example.com/admin` (should match the 404 rule).

Do **not** set `NEXT_PUBLIC_BASE_URL` to the tunnel address: the TV uses it for the phones' QR code, and `/play` is blocked through the tunnel by design.

---

## 3. Verified working features

All on this branch, by automated tests in this audit: **134 unit/route tests** and **131 browser checks** (`rehearsal` 40, `full-show` 16, `invite` 33, `games` 27, `offline` 15), plus a production build.

- Invite: RSVP, three questions, memory, accusation, photo (resized, EXIF/GPS stripped), video (type sniffed, 15–60 s, ≤95 MB), private edit link, withdraw (deletes files)
- Moderation: approve/reject, tags, honourable mentions, running order; only approved + consented content is ever shown
- Show: phones join by QR, quiz, five games, two leaderboards, prize wheel, judge phone, message wall
- Show director: running order with manual starts, preview, pause/resume, skip/restore/replay, mute, emergency stop, manual override
- Finale: guest spotlight (anonymous → reveal), 21 November history (sourced), 24-candle cake with Mez's candle, ceremony, prizes, honours, montage, podium
- AI host fallbacks when every cloud service fails
- Rehearsal mode on fictional guests in guarded folders
- Data survives a server restart; public gate blocks everything but the invitation

## 4. Needs real-device testing

- [ ] The actual TV: full screen, readability from the back of the room, audio volume, HDMI audio routing
- [ ] Real phones (iPhone + Android, older models) on the **venue** Wi-Fi: QR scan, join, reconnect after sleep
- [ ] Venue router: phones can reach the laptop (no client/AP isolation); behaviour with 20+ phones
- [ ] Phone video uploads over **mobile data through the tunnel**: a 60–95 MB file, a slow connection, iPhone HEVC/MOV and Android files
- [ ] Laptop: stays awake with the lid open, on mains power, with the firewall allowing port 3000 on the LAN
- [ ] A real internet-off run of the show (cable/Wi-Fi uplink unplugged)
- [ ] Bangla narration heard by a native speaker

## 5. Missing configuration

| Item | Status | Why it matters |
| --- | --- | --- |
| `HOST_KEY` | **Not set** (default `mez-host`) | Anyone on the party Wi-Fi could open `/admin` and run the show. **Set a long random value.** |
| Real start time and venue | `src/lib/event.ts` says "exact time to follow" / "Venue to follow" | Shown on the invitation and drives the running-order times |
| Tunnel / public address | None | Remote guests can't reach the invitation |
| Prize wording | Placeholder "A prize from the organiser" | Prize announcements |
| Quiz questions | Sample questions | Quiz segment |
| 13 narration clips | Placeholders (Gemini free voice quota) | Some host lines use browser voice/captions |
| `INVITE_SIGNING_SECRET` | Not set (auto-generated key file, fine) | Only matters if `.data/invite/signing.key` is lost (old media links stop working; no data loss) |

## 6. External service dependencies

| Service | Used for | Needed on the night? | If it's down |
| --- | --- | --- | --- |
| Cloudflare (tunnel) | Remote guests reaching `/invite` | No (invites close before the party) | Remote submissions pause; the show is unaffected |
| Google Gemini (free tier) | Host voice (TTS), commentary, transcription fallback | Optional | Approved recordings → browser voice → captions |
| Groq (free tier) | Commentary, push-to-talk transcription | Optional | Prepared fallback lines |
| Azure Speech F0, Cloudflare Workers AI | Optional fallbacks | No | Next in chain |
| npm registry / Google Fonts | First `npm install` / `npm run build` only | No | Build in advance |

## 7. Security and privacy risks

| Risk | Level | Mitigation |
| --- | --- | --- |
| Default host key `mez-host` | **High** until fixed | Set `HOST_KEY`; restart the server |
| Invitation is open to anyone with the URL (no invite code) | Medium | Everything is moderated before showing; per-IP rate limits (6 new RSVPs / 10 min, 20 uploads / 10 min); share the link privately |
| Disk filled by abusive uploads from many IPs | Low–medium | ≤ 1 photo + 1 video per RSVP (replacing deletes the old one); check free disk daily; stop the tunnel when not needed |
| Video files keep their location metadata (not re-encoded) | Medium (privacy) | Videos are only ever shown to the host and on the TV; mention it in the invitation or strip with ffmpeg before the party |
| Edit link = full access to that guest's RSVP | Low | 192-bit token in the URL fragment, hashed at rest; guests are told not to share it |
| Host key in the SSE URL query string (`?key=`) for the host dashboard | Low | LAN only, blocked through the tunnel; could appear in local server logs |
| Static JavaScript bundles are downloadable through the tunnel | Low | They contain no data or secrets, only UI code |
| Laptop compromise or loss = all guest data | Medium | Disk encryption (FileVault/BitLocker), backups below, delete media after the party |
| Quick Tunnel address change | Medium (reliability) | Keep cloudflared running; prefer a named tunnel |

## 8. Backup and recovery

**What to back up:** the whole `.data/` folder (submissions, media, signing key, room, host settings) and `.env.local`. The code is in GitHub.

**Backup (nightly until the party, and right before doors open):**

```bash
# with the server stopped, or accept a sub-second-old room snapshot
tar -czf ~/birthday-backup-$(date +%Y%m%d-%H%M).tgz .data .env.local
```

Copy the archive to a USB stick or a second computer. Archives contain guests' personal data: don't upload them to shared drives.

**Restore on the same or a spare laptop:**

```bash
git clone https://github.com/codeklaw-dev/birthday-files.git && cd birthday-files
git checkout feat/ai-host
npm install
tar -xzf /path/to/birthday-backup-YYYYMMDD-HHMM.tgz
npm run build && npm run party
```

**During the party:**

| Problem | Do this |
| --- | --- |
| Server crashed | `npm run party` again (or `npm start` to skip the rebuild). Players and scores reload; phones reconnect by themselves |
| Show goes wrong on screen | **Emergency stop** on `/admin/show`, fix, **Resume show** |
| TV browser froze | Reload `/display`, click "turn on the host's voice" |
| A phone lost its player | Rejoin with the same phone (it remembers); otherwise join again and add points with a correction |
| Internet dropped | Nothing to do; AI lines fall back automatically |
| Laptop died | Spare laptop + latest backup (restore above); phones rescan the new QR code |

Never run two servers on the same `.data` folder at once.

## 9. Complete rehearsal checklist

Run on the **real laptop, TV, Wi-Fi and phones** (19 or 20 Nov). The full show walkthrough is also in [SHOW.md](SHOW.md#rehearsal-checklist).

**Before**
- [ ] `HOST_KEY` set in `.env.local` (long and random); old `mez-host` rejected on `/admin`
- [ ] Real time and venue in `src/lib/event.ts`; `npm run build` succeeds
- [ ] Backup taken (section 8)
- [ ] Laptop: mains power, sleep off, notifications off, firewall allows port 3000 on the LAN

**Invitation through the tunnel**
- [ ] Tunnel running; the public URL opens `/invite` on a phone using **mobile data**
- [ ] `<public URL>/admin`, `/display`, `/play` and `/api/room/stream` all show "Not found."
- [ ] Submit an RSVP with a photo and a 60 s phone video over mobile data; it appears in `/admin/submissions` on the laptop
- [ ] Open the private edit link on another device, change an answer, withdraw a test RSVP
- [ ] An over-limit video (>95 MB) gets the friendly "too big" message

**Show** (`npm run rehearsal`, fictional data)
- [ ] TV full screen; voice unlocked; volume and Mute TV
- [ ] 3+ phones join by QR on the venue Wi-Fi; one reconnects after Wi-Fi off/on
- [ ] Mez's phone opens the judge link
- [ ] Director: Up next, Preview, Start, Pause/Resume during a question, Skip/Restore, Replay, Emergency stop / Resume show
- [ ] Spotlight anonymous → reveal; history readable; ceremony, prizes, honours, montage play with sound
- [ ] Cake: phones blow 23 candles, Mez's phone the last, Cut, Real cake
- [ ] One round of each game you'll play; both leaderboards; prize wheel
- [ ] Unplug the internet: show continues

**After the rehearsal**
- [ ] Stop the rehearsal server; on the night run `npm run party` with real data
- [ ] Note anything slow, too small or too loud

## 10. Tasks ranked by urgency

| # | Task | Why now | Owner |
| --- | --- | --- | --- |
| 1 | **Set `HOST_KEY`** in `.env.local` on the laptop, restart | Default key is public | You |
| 2 | Put the real date/time/venue in `src/lib/event.ts`, rebuild | Guests see it on the invite | You (or me, with the details) |
| 3 | **Decide: Quick Tunnel or named tunnel** (do you own a domain on Cloudflare? buying one needs your approval) | Remote guests need ~3 days to submit | You |
| 4 | Install cloudflared, start the tunnel, run the "Invitation through the tunnel" checks | Before sending links | You (I can't reach your laptop) |
| 5 | Send the invitation link; take the first backup | Guests' time to submit | You |
| 6 | Moderate submissions daily; back up `.data` nightly; check free disk space | Content for the show | You |
| 7 | Real quiz questions, prize wording | Content | You + me |
| 8 | Record the 13 remaining clips after the voice quota resets (08:00 UTC); approve narration; Bangla check | Narration | Me + a Bangla speaker |
| 9 | Full rehearsal on real devices (section 9) | 19–20 Nov | You |
| 10 | Close the tunnel when submissions end (e.g. 20 Nov evening); final backup before doors | Reduce exposure | You |
| 11 | After the party: delete or archive media, rotate keys | Privacy | You |
