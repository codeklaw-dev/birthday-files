# Rehearsal report — first real-device rehearsal

Record of the first rehearsal on real hardware for The Birthday Files: Mez Edition.

**Rule for this report:** a physical-device result is only marked **Pass** or **Fail** when the organiser actually performed it and reported back. Everything else stays **Not run**. Simulated guests are browser windows on the Mac, labelled **(simulated)**; they are not separate physical devices.

## Set-up under test

| Item | Value |
| --- | --- |
| Date | _to fill_ |
| Branch / commit | `feat/ai-host` / _to fill (`git log --oneline -1`)_ |
| Laptop | Mac — _model, macOS version_ |
| Node / npm | _`node -v` / `npm -v`_ |
| Browser(s) | _e.g. Chrome 1xx on Mac; Safari on iPhone_ |
| External monitor | _model, connection (HDMI/USB-C), resolution, speakers?_ |
| Physical phone | _iPhone/Android model, OS version, browser_ |
| Wi-Fi | _home router; guest network? (guest networks often block device-to-device traffic)_ |
| Mode | `npm run rehearsal` (fictional guests in `.data/rehearsal/`) |

### Sessions used

| Role | Where | Physical or simulated |
| --- | --- | --- |
| Organiser control panel `/admin/show` (+ `/admin` tab) | Mac, laptop screen, Chrome window | Physical (laptop) |
| TV `/display` | Mac, external monitor, full-screen Chrome window | Physical (monitor) |
| Guest "Phone" `/play` | The real phone | **Physical** |
| Guest "Sim-Safari" `/play` | Safari window on the Mac | Simulated |
| Guest "Sim-Incognito" `/play` | Chrome Incognito window on the Mac | Simulated |
| Mez's judge phone `/judge` | Safari Private window on the Mac (or the real phone in a later pass) | Simulated |

## Verified automatically before the rehearsal (not physical-device results)

Run in a cloud copy of the repo on 18 Nov 2026, headless Chromium, no real devices:

- 137 unit/route tests pass; production build passes
- Automated rehearsal (`tests/e2e/rehearsal.mjs`): 40/40 checks with one browser "TV", one "dashboard", one "judge phone" and three emulated phone browsers (Pixel 7 / iPhone 13 / iPhone SE **emulation**, not real phones)
- Launcher refuses a missing, default (`mez-host`) or short `HOST_KEY` (tested)
- Phones' QR address prefers Wi-Fi over VPN/VM-bridge addresses (unit test); `LAN_HOST` override (unit test)
- `npm run rehearsal -- --resume` keeps state across a server restart; a normal start re-seeds fresh fictional data (tested)

## Results

Status values: **Not run** · **Pass** · **Fail** · **Partial** · **Skipped**.

### A. Set-up and launch

| # | Check | Expected | Status | Notes |
| --- | --- | --- | --- | --- |
| A1 | `npm install` on the Mac | Completes without errors | Not run | |
| A2 | `HOST_KEY` set; launcher refuses `mez-host` | Refusal message for default; starts with the strong key | Not run | |
| A3 | `npm run rehearsal -- --build` | Build OK; prints panel/TV/phone URLs and a QR code | Not run | |
| A4 | Address printed for phones is the Mac's Wi-Fi address | Matches System Settings → Wi-Fi → Details → IP address | Not run | |
| A5 | macOS firewall prompt for `node` | Allowed (or firewall off) | Not run | |
| A6 | `/admin/show` opens on the laptop with the host key | Dashboard with "Rehearsal · sample data" badge | Not run | |
| A7 | External monitor set to **Extend** (not Mirror) | Laptop and monitor show different things | Not run | |
| A8 | `/display` full-screen on the monitor | 16:9 stage fills the screen (or even black bars) | Not run | |

### B. Joining

| # | Check | Expected | Status | Notes |
| --- | --- | --- | --- | --- |
| B1 | Phone scans the QR code on the TV | `/play` opens on the phone | Not run | |
| B2 | Phone joins as "Phone" | Name appears on the TV lobby | Not run | |
| B3 | Two simulated guests join (Safari, Chrome Incognito) | 3 players on the TV | Not run | |
| B4 | Judge link opened from `/admin` → "Mez's judge phone" | "Judge Mez" screen | Not run | |

### C. Show, games, judging, scoring

| # | Check | Expected | Status | Notes |
| --- | --- | --- | --- | --- |
| C1 | Welcome segment started from `/admin/show` | Live segment shown; nothing starts by itself | Not run | |
| C2 | Quiz question (phone answers) | Countdown on phone and TV; reveal; points | Not run | |
| C3 | Mez Imposter | Secret role on each phone; clues; vote; reveal | Not run | |
| C4 | Who Knows Mez Best + judge stars | Judge scores answers; points on boards | Not run | |
| C5 | Mez Survey | Needs an approved board in `/admin/games` | Not run | |
| C6 | Mez on Trial + judge verdict | Plea, defence, verdict from judge | Not run | |
| C7 | Mystery Files + judge guess | Exhibit on TV; guesses; judge guess | Not run | |
| C8 | Score correction in `/admin` | Change with reason; boards update | Not run | |
| C9 | Both leaderboards | Live + Mez Expert on TV | Not run | |
| C10 | Prize wheel | Spins on TV, lands on drawn prize; phone accept/decline | Not run | |

### D. AI host and surprises

| # | Check | Expected | Status | Notes |
| --- | --- | --- | --- | --- |
| D1 | TV "turn on the host's voice" | Voice/effects audible from the intended speakers | Not run | |
| D2 | Narration line plays (approved clip or live voice) | Heard; subtitles match | Not run | |
| D3 | Typed line "Say on TV" | Heard on TV only | Not run | |
| D4 | Push-to-talk (hold, speak, send) | Transcript → reply spoken on TV | Not run | |
| D5 | Surprise announcement / memory reveal | Shown and spoken on TV | Not run | |
| D6 | Guest spotlight: anonymous → reveal; photo, video with sound | As described | Not run | |
| D7 | 21 November history | Readable from across the room | Not run | |

### E. Virtual cake and finale

| # | Check | Expected | Status | Notes |
| --- | --- | --- | --- | --- |
| E1 | Phone + simulated guests blow candles | 23 go out; guest button stops at Mez's candle | Not run | |
| E2 | Judge blows the last candle | Confetti; "Make a wish" | Not run | |
| E3 | Cut the cake → To the real cake | Animation; phones follow | Not run | |
| E4 | Ceremony, prizes, honours, montage, finale | Reveal one at a time; videos play with sound | Not run | |

### F. Audio routing and privacy

| # | Check | Expected | Status | Notes |
| --- | --- | --- | --- | --- |
| F1 | macOS Sound output set to the intended device | Show audio comes out of the TV/monitor speakers (or the chosen speaker) | Not run | |
| F2 | Admin panel makes no sound during the show | Silence from `/admin/show` and `/admin` (except the "Preview" voice button, see known limits) | Not run | |
| F3 | Phone makes no show audio | Phone stays silent | Not run | |
| F4 | Phone opens `http://<laptop-ip>:3100/admin` | Asks for host key; `mez-host` rejected | Not run | |
| F5 | TV never shows admin controls, answers or secret roles | Confirmed by eye | Not run | |
| F6 | Notifications silenced on the Mac (Do Not Disturb) | No pop-ups on the monitor | Not run | |

### G. Recovery

| # | Check | Expected | Status | Notes |
| --- | --- | --- | --- | --- |
| G1 | Lock the phone 30 s, unlock | Same player, same score; screen catches up | Not run | |
| G2 | Phone Wi-Fi off → on mid-question | Reconnects as the same player | Not run | |
| G3 | Close and reopen `/play` on the phone | Same player (remembered on the device) | Not run | |
| G4 | Refresh `/display` mid-game | Same scene returns; voice needs one click again | Not run | |
| G5 | Pause / Resume during a timed step | Timer freezes and resumes with the time left | Not run | |
| G6 | Emergency stop / Resume show | TV covered and silent; restored | Not run | |
| G7 | Stop the server (Ctrl+C) mid-round, restart with `--resume` | Players, scores and the round come back; phones reconnect | Not run | |

## Known limits (from the code, before testing)

- **Audio routing:** macOS sends all browser audio to one output device (System Settings → Sound → Output). The app cannot send TV audio to the monitor and keep other audio on the laptop. Only `/display` makes show audio. The organiser panel only makes sound if you press **Preview** in "Write a line" or play clips in `/admin/host`, and that sound goes to the same output.
- **Wi-Fi:** guest networks and some routers block phones from reaching the laptop ("client/AP isolation"). Use the main network.
- **Voice unlock:** browsers need one click on the TV page before it can play sound; after any refresh of `/display`, click "turn on the host's voice" again.
- **AI voice:** needs `GEMINI_API_KEY` (and `GROQ_API_KEY` for push-to-talk) in `.env.local` on the Mac. Rehearsal only plays narration clips you approved in `/admin/host`; without approvals it uses live voice (free quota) or the browser voice.

## Failures and fixes

_None recorded yet._

## Follow-up actions

_To fill after the rehearsal._
