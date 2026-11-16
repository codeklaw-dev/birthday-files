# Cloud AI providers for the host

Researched 16 November 2026. All AI inference runs in the cloud; the laptop only runs the browser app (and the small Next.js server that serves it).

**How this was checked.** The research container could not open most providers' documentation sites (network policy), so the facts below come from search results restricted to each provider's own domain, plus community reports where marked. Anything not confirmed is labelled. Free tiers change often: confirm in each console before relying on them, and run `npm run host:check` once keys are in place. That script tests real English and Bangla output and latency.

## Recommendation

| Job | Primary | Backup | Why |
| --- | --- | --- | --- |
| Speech (TTS), English + Bangla | **Gemini API** (Google AI Studio key) | Azure Speech *(needs your approval: card at sign-up)* | Only free, no-card option found that lists Bangla. Azure has the best Bangladeshi voices. |
| Pre-recorded narration | Rendered once with Gemini via `npm run narration:render` | Your own recorded voice lines, or Azure | Pre-recorded clips play instantly and don't need the internet, so quota and latency stop being risks. |
| Commentary (LLM) | **Gemini Flash-Lite** | **Groq** (no card), then Cloudflare Workers AI | Gemini writes better Bangla. Groq is fast and free. |
| Listening (STT) | **Groq Whisper large-v3-turbo** | Gemini audio understanding, then Cloudflare Whisper | Groq has the clearest documented free allowance (28,800 audio-seconds a day). |
| Last resort | Robotic offline placeholder clips → browser voice → captions | | The show never stops. |

**Expected cost for the party: $0.** The whole night is a few thousand characters of speech, a few dozen LLM calls and a few minutes of listening, which is far inside every free tier listed. No card is needed for Gemini, Groq or Cloudflare. A cost only appears if you approve Azure or Google Cloud, which need a card on file, and even then this volume stays inside their free allowances.

## What to set up (about 10 minutes)

1. **Gemini (required for real speech):** sign in at aistudio.google.com → *Get API key*. Do not link a billing account: per Google's billing docs, linking billing moves the project off the free tier.
2. **Groq (recommended, for push-to-talk):** console.groq.com → API keys. No card.
3. Put both in `.env.local` (never commit it):
   ```
   GEMINI_API_KEY=...
   GROQ_API_KEY=...
   ```
4. Run `npm run host:check`. It confirms the model names your key can use, speaks English and Bangla samples into `.cache/check/`, transcribes them back, and prints latency.
5. Run `npm run narration:render`. It replaces the robotic placeholder clips with real voice. If the daily TTS quota runs out it stops cleanly; run it again the next day and it continues where it left off. Use `--delay 7000` to stay under per-minute limits.
6. Listen to the Bangla clips with a native speaker, edit `src/lib/host/script.ts` where needed, and re-render only what changed (`--only key1,key2 --force`).

Optional, **only with approval** (both require a credit/debit card on the account):
- Azure Speech for the Bangladeshi voices: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`.
- Google Cloud TTS (bn-IN WaveNet voices): adapter not built yet.

## Comparison

| Provider | Card needed? | Free allowance | Bangla | Notes for this show |
| --- | --- | --- | --- | --- |
| **Gemini API** (TTS, LLM, audio-in) | No (AI Studio key) | Gemini 3.8 Flash-Lite TTS and 3.5 Flash-Lite are listed as free on the pricing page. RPM/RPD limits were not in the search results. Community reports mention very small daily TTS caps (e.g. 10 requests/day on one account, **unconfirmed**). | Yes: the TTS model pages list Bangla (`bn`); language is auto-detected | Model IDs change often (env-configurable; `host:check` lists what your key can see). One forum report of HTTP 200 with no audio; the adapter treats that as a failure and fails over. Free-tier data may be used by Google to improve products. |
| **Groq** (LLM, Whisper STT) | No | whisper-large-v3-turbo: 20 req/min, 2,000 req/day, 7,200 audio-s/hour, 28,800 audio-s/day | STT yes (Whisper, ISO-639-1 `bn`); TTS **no** (English and Saudi Arabic only) | Very low latency; OpenAI-compatible API. |
| **Cloudflare Workers AI** (LLM, Whisper, TTS) | No | 10,000 neurons/day, resets 00:00 UTC | STT via Whisper (multilingual); TTS **no** Bangla found (MeloTTS, Deepgram Aura-2 en/es) | MeloTTS is being retired in favour of Aura-2-en. Its API reference and tutorial disagree on Whisper's audio input format, so verify with `host:check`. |
| **Azure AI Speech** | **Yes**, at Azure sign-up (no charge; ~$1 verification hold). Azure for Students needs no card. | Neural TTS 0.5M characters/month (F0) | **Best:** bn-BD-NabanitaNeural, bn-BD-PradeepNeural (Bangladesh); bn-IN-TanishaaNeural, bn-IN-BashkarNeural | Adapter built, off unless keys are set. |
| **Google Cloud TTS** | **Yes** (billing account required) | Pricing page: 4M chars/month Standard and WaveNet, 1M Chirp 3 HD (other Google pages say 1M for WaveNet) | bn-IN WaveNet A–D; no bn-BD or Chirp 3 HD Bengali found | Adapter not built. |
| **ElevenLabs** | No | 10,000 credits/month (~10 min of speech); free plan is non-commercial with attribution | **Unconfirmed** for current models | Not built; could be added behind the same interface. |
| **Sarvam AI** | Reportedly no | ₹100 credits on sign-up | bn-IN (Indian accent) | Not built. Strong Indic voices, but an Indian rather than Bangladeshi accent. |
| **Hugging Face** | No | Inference Providers: $0.10/month for free accounts. Spaces: CPU Basic documented as free (sleeps after 48 h idle), but 2026 forum threads report staff saying it needs PRO. | MMS-TTS `facebook/mms-tts-ben` exists (CC-BY-NC) | **Not reliable for live use.** Cold starts, sleeping Spaces, disputed free CPU, no free GPU. At most useful for one-off pre-rendering. |

### Latency

Real cloud latency could not be measured from the build environment (no keys, and most provider hosts are blocked there). What we know:
- Pre-recorded clips: first sound in about 0.1–1.1 s in the end-to-end test, with no network needed.
- Live lines are pre-generated on the server the moment they're triggered, cached, and fetched by the TV with a 7 s cap before it falls back to a recorded clip.
- Push-to-talk adds STT and LLM round trips. Expect a few seconds in total; `host:check` and the dashboard's *Voice system* panel show real numbers once keys exist.

## Sources

- Cloudflare: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [MeloTTS](https://developers.cloudflare.com/workers-ai/models/melotts/), [Aura-2 en](https://developers.cloudflare.com/workers-ai/models/aura-2-en/), [Whisper large-v3-turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/), [Run model API](https://developers.cloudflare.com/api/resources/ai/methods/run/)
- Google: [Gemini speech generation](https://ai.google.dev/gemini-api/docs/speech-generation), [Gemini 3.8 Flash-Lite TTS](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-lite-tts), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Gemini billing](https://ai.google.dev/gemini-api/docs/billing), [legacy TTS REST guide](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation), [forum: 200 with no audio](https://discuss.ai.google.dev/t/gemini-tts-preview-returns-http-200-with-usagemetadata-but-no-audio-payload/145337), [forum: free-tier limits](https://discuss.ai.google.dev/t/gemini-3-8-flash-free-tier-20-rpd-is-too-limited-for-practical-evaluation/180609), [Cloud TTS pricing](https://cloud.google.com/text-to-speech/pricing), [Cloud TTS voices](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types)
- Microsoft: [Speech language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support), [TTS REST API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech), [Speech pricing](https://azure.microsoft.com/en-in/pricing/details/speech), [Azure free account](https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account), [Q&A: F0 0.5M chars](https://learn.microsoft.com/en-us/answers/questions/1654938/text-to-speech-s0-standard-tier-0-5-million-charac)
- Groq: [rate limits](https://console.groq.com/docs/rate-limits), [text to speech](https://console.groq.com/docs/text-to-speech), [Whisper large-v3-turbo](https://console.groq.com/docs/model/whisper-large-v3-turbo), [API reference](https://console.groq.com/docs/api-reference)
- Hugging Face: [Inference Providers pricing](https://huggingface.co/docs/inference-providers/pricing), [pricing](https://huggingface.co/pricing), [Spaces GPUs](https://huggingface.co/docs/hub/main/spaces-gpus), [forum: CPU Basic quota](https://discuss.huggingface.co/t/free-cpu-basic-quota-is-0-on-new-account/180764)
- ElevenLabs: [billing / free-plan licence](https://elevenlabs.io/docs/overview/administration/billing)
- Sarvam: [pricing, credits and rate limits](https://docs.sarvam.ai/api/getting-started/pricing), [Bengali TTS](https://www.sarvam.ai/apis/text-to-speech/bengali)
