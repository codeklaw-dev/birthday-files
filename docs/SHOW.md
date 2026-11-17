# Show director and birthday finale

How the night runs from the laptop: the running order, scenes, the cake, the finale, rehearsal mode, and what works without internet.

## The screens

| Screen | Device | Notes |
| --- | --- | --- |
| `/admin/show` | Laptop (desktop layout) | **Show director**: running order, preview, start/pause/skip/replay, mute, emergency stop, live TV monitor |
| `/admin` | Laptop | Games, scores, prize wheel, AI host voice, push-to-talk, messages (all still available as manual override) |
| `/display` | TV | Fixed 16:9 stage, letterboxed on other screens. `/display?mirror=1` is a silent copy (used by the dashboard monitor) |
| `/play` | Guest phones | Follows every scene; blows candles; shows pause and break notices |
| `/judge` | Mez's phone | Judge controls, plus **Mez's candle** during the cake |

## Running order (timeline)

`/admin/show` lists optional segments roughly every 30 minutes from the start time in `src/lib/event.ts` (19:00 for now). The suggested order is in `src/lib/show/config.ts`; edit it on the dashboard (**Edit**: times, titles, lengths, on/off, order, add or remove; **Reset to suggested**).

**Nothing starts by itself.** Planned times only light up a "Due" badge and the **Up next** card. The organiser starts every segment by pressing **Start** (or **Go live** from the preview).

| Control | What it does |
| --- | --- |
| Preview (eye) | Shows exactly what the TV would show for that segment, built from the current approved content, in a scaled 16:9 frame. Step through items and toggle "Show revealed". **The real TV, phones and scores are not touched.** |
| Start / Go live | Starts the segment and marks the previous live one done |
| Replay | Starts a done (or the live) segment again from its title card |
| Skip / Restore | Takes a segment out of the queue / puts it back |
| End segment | Marks it done; scenes and the cake return the TV to the lobby |
| Back to lobby | Leaves whatever scene is up (not a running game: stop games from `/admin`) |
| Pause / Resume | Freezes quiz and game timers (remaining time is given back), pauses videos, holds phone input, shows "Paused" |
| Mute TV, Stop talking, Replay line | TV sound and the AI host's voice |
| **Emergency stop** | Cuts the voice, mutes all sound, freezes timers, removes the scene and shows "Back in a moment" on the TV and a break notice on phones. **Resume show** restores the previous sound setting |
| Manual override | Any segment can be started out of order, including switched-off ones; every game/score/host control on `/admin` still works |

Segment types: welcome, quiz question, each of the five games, guest spotlight, 21 November history, honourable mentions, video-message montage, prize announcements, final leaderboard ceremony, message wall, leaderboards, prize wheel, virtual cake, break, finale.

## Scenes

All scene content is built **on the server** from invite submissions that are **approved and allowed to be shown** (consent ticked, not "can't come"). The browser only names the segment; anything else is refused.

- **Guest spotlight** — guests at the party: photo or memory, then video. **Anonymous** on the TV until **Reveal who sent it**; phones never receive scene content. Order follows the running order set in `/admin/submissions`.
- **Honourable mentions** — submissions marked *honourable*, including remote guests.
- **Video-message montage** — every approved video, back to back on the TV (Next/Previous jump; Pause freezes playback).
- **21 November history** — see below.
- **Final leaderboard ceremony** — counts down the Mez Expert board (top 3) then the Live board (top 5); one reveal per press, confetti on the winner.
- **Prize announcements** — top three on each board and prizes accepted on the wheel. The text says "A prize from the organiser"; change it in `src/lib/show/server/build.ts` once the real prizes are known.

## 21 November history

`src/lib/show/history.ts` holds 18 events from 2002 to 2024, **each checked against the linked source** on 17 Nov 2026 (NATO, Box Office Mojo, D23, The Numbers, Britannica, Al Jazeera, Formula 1, UN Press, …). Rules:

- No event without a source URL that states the date. Nothing invented.
- Years with nothing verified are **left out**: 2009, 2011, 2015, 2016, 2019, 2023, 2025 (listed on the dashboard).
- Three serious items (an assassination, a ceasefire, ICC warrants) are **off by default**; tick "Serious news" on the history segment to include them.
- The dashboard's "History sources" panel links every source so the organiser can re-check before the party.

## Virtual cake

1. **Start** the cake segment: 24 candles (one per year). The tall centre candle is **Mez's**.
2. Guests tap **Blow** on their phones. Together they put out 23 candles (about 12 taps each); the last one can't be blown by guests.
3. Mez taps **Blow out my candle** on the judge phone (Mez may also do it early: it puts out everything). If Mez's phone isn't to hand, **Blow for Mez** on the dashboard.
4. Confetti and "Make a wish". **Cut the cake** plays the knife-and-split animation.
5. **To the real cake** hands over on the TV and every phone ("Now for the real cake!").

## Rehearsal mode

```bash
npm run build          # once after code changes
npm run rehearsal      # seeds fictional guests, serves on http://localhost:3100
```

- Everything runs on **fictional guests** ("Nila (sample)", …) with sample photos and videos from `rehearsal/media/`, including one deliberately missing photo and two submissions that must never appear (no consent, unreviewed).
- Data lives in `.data/rehearsal/` and is wiped and re-seeded on each start. With `REHEARSAL=1` every store **refuses** a folder outside `…/rehearsal/`, so real submissions can't be read or deleted by mistake.
- Copies only the host personality and narration approvals from the real host settings, never guest facts, announcements or conversations.
- Every screen shows a dashed **"Rehearsal · sample data"** badge.
- AI voice/commentary use whatever keys are in `.env.local`, exactly as on the night (free tiers only). Add `HOST_TTS_CHAIN=mock HOST_LLM_CHAIN=mock` to rehearse without using quota.

The automated version (`node tests/e2e/rehearsal.mjs`) drives the TV, the dashboard, Mez's phone and three phones through the whole finale.

## TV, laptop and phones

- **TV**: a fixed 16:9 stage. The page's root font is sized from the stage height, so 720p, 1080p and 4K look the same; other aspect ratios are letterboxed (black bars). Use the browser's full screen (F11).
- **Laptop**: `/admin/show` is designed for a ≥1280 px desktop window (running order left, monitors right); the control bar stays at the top.
- **Phones**: one column, large tap targets, works from iPhone SE size up.

### Media

- Photos for the current scene are preloaded when the scene starts; the next montage video loads while the current one plays. Videos use `preload="auto"`.
- A missing or unreadable photo or video shows a friendly "couldn't be loaded" card; a broken video in the montage skips to the next.
- Use **Preview** before each media segment: it shows every item, so a broken file is spotted before guests see it.

## Offline limitations

The laptop serves everything over the local Wi-Fi; the show itself needs **no internet**. Without internet:

| Works | Doesn't |
| --- | --- |
| All screens, games, scores, scenes, history, cake, finale | Live AI voice for new lines (pre-recorded approved clips still play; otherwise browser voice or captions) |
| Approved pre-recorded narration and cached announcements | AI commentary and push-to-talk replies (prepared fallback lines are used) |
| Photos and videos already uploaded to the laptop | Uploads from guests outside the venue (the invite runs on the laptop) |
| History (stored in the app; source links only open with internet) | Fonts are bundled at build time, so they still work |

Other limits: one Node process holds the room (don't run two servers on the same data); the router/Wi-Fi must allow phones to reach the laptop (no "client isolation"); a phone that loses Wi-Fi reconnects automatically and keeps its player.

## Rehearsal checklist

Do this on the **actual TV, laptop, Wi-Fi and at least three real phones**, ideally on 19 or 20 November.

**Set-up**
- [ ] `npm run build && npm run rehearsal` on the party laptop; note its LAN address
- [ ] Laptop power plugged in; sleep/screen-saver off; notifications muted
- [ ] TV: `/display` in full screen (F11); the stage fills the screen or shows even black bars
- [ ] Click "turn on the host's voice" on the TV; check the speaker volume; then test **Mute TV**
- [ ] Router: phones on the guest Wi-Fi can open the QR address (no client isolation)

**Join**
- [ ] 3+ phones scan the QR code and join; names appear on the TV
- [ ] Mez's phone opens the judge link from `/admin` ("Mez's judge phone")
- [ ] Turn one phone's Wi-Fi off and on: it reconnects as the same player

**Director**
- [ ] `/admin/show`: Up next shows the first segment; nothing starts by itself
- [ ] Preview the spotlight, history and montage; step through the items; the real TV doesn't change
- [ ] Start, End segment, Skip, Restore, Replay, Back to lobby
- [ ] Start a segment out of order (manual override)
- [ ] Pause during a quiz question: timer freezes, phones show "Paused"; Resume gives the time back
- [ ] **Emergency stop**: TV shows "Back in a moment", sound off; Resume show restores it

**Content**
- [ ] Spotlight: anonymous until Reveal; photos, memories and videos play with sound
- [ ] The missing sample photo shows the "couldn't be loaded" card (that's expected)
- [ ] History: years, headlines and sources readable from the back of the room
- [ ] Ceremony and prizes reveal one name at a time; honourable mentions; montage plays all videos

**Cake**
- [ ] Phones blow out 23 candles; the guest button stops at Mez's candle
- [ ] Mez's phone blows the last one → confetti; **Cut the cake**; **To the real cake**
- [ ] **Blow for Mez** works from the dashboard

**Games and host** (from `/admin`)
- [ ] One round of each game you plan to play; both leaderboards; prize wheel
- [ ] AI host: approved narration plays; push-to-talk answers; subtitles readable
- [ ] Unplug the internet: the show carries on (see offline limitations)

**Afterwards**
- [ ] Stop the rehearsal server. On the night use `npm run party` (real data), never `npm run rehearsal`
- [ ] Note anything slow, too small to read, or too loud
