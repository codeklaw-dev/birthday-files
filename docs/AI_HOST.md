# The AI host

A witty, cheeky, sarcastic-but-affectionate game-show detective, voiced in English and Bangla. **Everything runs in the cloud or is pre-recorded; nothing runs on the laptop**, which only shows the browser pages. The show must work fully with the cloud down. The guest invitation never reveals the host (tested by scanning the invite page and all its scripts).

## Three modes

| Mode | What happens | Needs the cloud at the party? |
| --- | --- | --- |
| **Narrator** | Game intros, reveals, jokes, leaderboards and the finale play from **pre-generated clips that the organiser approved** in `/admin/host`. Lines with names or numbers are spoken live and fall back to a recorded line with the same meaning. | No (approved clips are local files) |
| **Push-to-talk** | The organiser holds a button on the laptop while Mez talks (max 20 s). Speech → text (editable) → a contextual reply in the host's voice, **played on the TV only**. | Yes; falls back to a prepared line |
| **Surprise** | The organiser triggers an **approved announcement** or a **guest's memory** (from approved invite submissions the guest allowed to be shown). Approved announcements are voiced and cached in advance. | No if pre-generated; otherwise subtitles + fanfare |

Languages: English, Bangla, both, or **Auto** (alternates line by line, uses both for big moments). Push-to-talk replies in the language Mez spoke, unless the organiser overrides it.

## Controls (host dashboard)

- **Language:** English / বাংলা / Both / Auto.
- **Voice on TV**, **Mute all sound** (voice and effects) and a **TV volume** slider.
- **Subtitles on TV** on or off, plus **Say it again** and **Stop talking**.
- **Push-to-talk:**
  - hold to talk, with a 20 s countdown;
  - an editable transcript and a language override;
  - "Reply automatically" or "Draft reply only";
  - an optional "thinking line while waiting".
- **Surprises:** Play / Reveal / End surprise.
- **AI drafts:** commentary is drafted for you to review before it's spoken. Auto quips are off by default.

## Where things live

| What | Where | Notes |
| --- | --- | --- |
| Personality, house rules | `.data/host/knowledge.json` (edit in `/admin/host`) | Separate from game state |
| Guest facts | same file | Only **approved** facts reach the AI. Suggestions come from approved, consented invite answers. Edited facts need re-approval. |
| Announcements | same file | Approve → voice pre-generated and cached. Edited words need re-approval. |
| Narration approvals | same file | Tied to the exact text and file size reviewed; a re-render needs a new review |
| Conversation memory | same file | Last 8 push-to-talk exchanges; "Forget" clears it |
| Scene context | computed on demand | Built **only from the public TV view**, never from raw game state |
| Narration audio | `public/narration/` + `manifest.json` | Rendered with `npm run narration:render` |
| Live speech cache | `.cache/tts/` | Identical lines are synthesised once |

## Guardrails

- **The AI can only speak.** Every AI output goes through `aiDispatch`, which accepts only `host/say` (marked as AI-written), `host/clip` and `host/quip`. Scoring, voting, revealing and advancing are refused whatever the model returns (tested).
- **No secrets in prompts.** Scene context comes from the same data the TV receives, so secret words, imposter identities, hidden authors and unrevealed survey answers can't reach the model (tested against live games).
- **Prompt injection.** Guest facts, the scene and the conversation are passed as information, with an instruction to ignore any instructions inside them. Only organiser-approved facts are included.
- **House rules.** Kind teasing only, no sensitive topics, no invented facts about real people, and a refusal to pretend it controls the game. Lines are stripped of markdown, emoji and links, and capped in length.
- **Microphone.** It is opened only by a deliberate press-and-hold and closed on release or after 20 s. There is no voice activation and no background listening, so noise can't trigger a recording (tested: zero microphone opens until the button is pressed). Push-to-talk needs a secure page (`localhost` on the laptop, or HTTPS).
- **TV-only audio.** Only `/display` plays the host. Phones never do, and the dashboard plays audio only when you press "Preview here".
- **Keys.** Provider keys live only in server environment variables (`.env.local`, git-ignored). Every host-AI endpoint needs the host key. The TV's speech endpoint only speaks lines already in the room state.
- **Accepted risk.** Narration files are static (`/narration/…`). Someone who knows the party server's address could fetch them, but nothing in the invite links to them.

## Providers (free-first, never automatic paid use)

Calls use the providers' documented REST APIs from the server, not their SDKs. Official SDKs exist (`@google/genai`, `groq-sdk`, `microsoft-cognitiveservices-speech-sdk`). Plain `fetch` keeps the code server-only and dependency-free, and was verified live.

| Job | Default order | Free allowance (measured or documented) |
| --- | --- | --- |
| Speech (TTS) | Gemini → Azure (if configured) | Gemini: **10 requests/day per model**; 3 usable models, so ~30 lines/day (measured). Azure F0: 0.5M chars/month, **20 requests/minute**. |
| Replies (LLM) | Gemini 3.5 Flash-Lite → Groq `qwen/qwen3.8-27b` → Cloudflare | Gemini free tier (occasional "high demand" 503s, measured). Groq free plan, no card. |
| Listening (STT) | Groq Whisper turbo → Gemini → Cloudflare | Groq: 2,000 requests/day, 28,800 audio-seconds/day |

**No automatic paid usage.** The Gemini key is used without a billing account, so Google can't charge it. Groq's free plan has no card. Azure is only used if you add a Free (F0) resource, and F0 stops at its limit instead of billing. When a free quota runs out the router fails over, and the show falls back to prepared narration and subtitles; it never retries onto a paid tier. Google labels `generateContent` as "legacy" in favour of a newer Interactions API. It still works (verified 17 Nov 2026); switching is a one-file change in `providers/gemini.ts` if needed.

**Expected cost: $0.** Full provider comparison: [AI_PROVIDERS.md](AI_PROVIDERS.md).

## Latency (measured from the build container, free tiers)

| Step | Typical |
| --- | --- |
| Approved narration clip | instant (local file); first sound ≈ 0.1 s |
| Live TTS line (Gemini) | 2–4.5 s per line (pre-warmed the moment the line is triggered) |
| Push-to-talk: STT (Groq) | 0.3–0.6 s |
| Push-to-talk: reply (Groq / Gemini LLM) | 0.4–1.4 s |
| Push-to-talk: speak the reply | 2–4.5 s |
| **Push-to-talk total** | **≈ 3–6 s**, covered by the optional "thinking" line |

Timeouts: TTS 9 s, LLM reply 9 s, STT 10 s on the server; TV waits up to 7 s for live speech before falling back; the dashboard gives up after 15 s.

## Configuration

`.env.local` (all optional; with nothing set the show runs on approved clips and subtitles):

```
GEMINI_API_KEY=...           # free AI Studio key, no billing account
GROQ_API_KEY=...             # free plan
AZURE_SPEECH_KEY=...         # optional, Free F0 resource only
AZURE_SPEECH_REGION=southeastasia
# HOST_REPLY_TIMEOUT_MS=9000
# HOST_DATA_DIR=.data/host
```

To rehearse an outage: `HOST_TTS_CHAIN=mock-fail HOST_LLM_CHAIN=mock-fail HOST_STT_CHAIN=mock-fail HOST_NO_MOCK=1 npm run party`.

## Demo steps

1. `npm run narration:render` (once a day until no placeholders remain), then in **`/admin/host` → Narration clips** listen and approve (or "Approve all recorded clips").
2. In `/admin/host`: check the personality, add a few facts (or "Suggest from invite answers" and approve), write and approve a surprise announcement.
3. Open `/display` on the TV and click "turn on the host's voice". Open `/admin` on the laptop **as `http://localhost:3000/admin`** (needed for the microphone).
4. Start the show: approved clips play instantly.
5. **Push-to-talk:**
   - hold the button while Mez asks the host something, then release;
   - fix the transcript if needed;
   - the reply plays on the TV.
6. **Surprise:** press Play on the announcement or Reveal on a memory, then **End surprise & go back**.
7. **Try the outage path:** restart with the outage variables above and repeat. Clips still play, push-to-talk asks you to type and then plays the prepared fallback line, and announcements show with subtitles.

## Tests

- `tests/host-ai.test.ts` (14 tests):
  - knowledge store, and that only approved facts reach prompts;
  - scene context privacy, and that the AI can only speak;
  - narration approval and invalidation, announcements, surprises and audio settings;
  - push-to-talk working and with providers down;
  - host-key protection on every endpoint.
- `tests/e2e/offline.mjs` (15 checks):
  - every cloud service failing, start to finish;
  - the invite bundle never mentions the AI host;
  - the microphone isn't opened before the press;
  - mute and subtitles reach the TV.
