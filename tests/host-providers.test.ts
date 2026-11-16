import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audioDurationMs, detectLang, extractJson, pcmRate, pcmToWav, speakable } from "@/lib/host/server/audio-utils";
import { azureSsml, azureTts } from "@/lib/host/server/providers/azure";
import { cloudflareStt } from "@/lib/host/server/providers/cloudflare";
import { exhaustedUntil, geminiLlm, geminiTts, retryAfterMs } from "@/lib/host/server/providers/gemini";
import { groqLlm, groqStt } from "@/lib/host/server/providers/openai-compatible";

const signal = () => AbortSignal.timeout(5000);
let calls: { url: string; init: RequestInit }[] = [];
const respond = (body: unknown, init: ResponseInit = {}) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, i) => {
    calls.push({ url: String(url), init: i ?? {} });
    return body instanceof Uint8Array ? new Response(new Blob([body as Uint8Array<ArrayBuffer>]), init) : Response.json(body, init);
  });

beforeEach(() => {
  calls = [];
  process.env.GEMINI_API_KEY = "test-gemini";
  process.env.GROQ_API_KEY = "test-groq";
  process.env.AZURE_SPEECH_KEY = "test-azure";
  process.env.AZURE_SPEECH_REGION = "westeurope";
  process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
  process.env.CLOUDFLARE_API_TOKEN = "cf";
});
afterEach(() => vi.restoreAllMocks());

describe("audio utils", () => {
  it("wraps PCM in a valid WAV header", () => {
    const wav = pcmToWav(new Uint8Array(48000), 24000);
    const head = new TextDecoder().decode(wav.bytes.slice(0, 4));
    expect(head).toBe("RIFF");
    expect(audioDurationMs(wav)).toBe(1000);
    expect(pcmRate("audio/L16;codec=pcm;rate=24000")).toBe(24000);
    expect(pcmRate("audio/L16", 16000)).toBe(16000);
  });

  it("detects Bangla vs English script", () => {
    expect(detectLang("শুভ জন্মদিন Mez")).toBe("bn");
    expect(detectLang("Happy birthday")).toBe("en");
    expect(detectLang("123 !!")).toBeNull();
  });

  it("extracts JSON from chatty LLM output and makes text speakable", () => {
    expect(extractJson<{ en: string }>('Sure!\n```json\n{"en": "Hi"}\n```')).toEqual({ en: "Hi" });
    expect(extractJson("no json here")).toBeNull();
    expect(speakable("**Wow** 🎉 see https://x.y #party", 100)).toBe("Wow see party");
    expect(speakable("a".repeat(500)).length).toBe(280);
  });
});

describe("Gemini", () => {
  it("sends the documented TTS request and wraps the PCM reply as WAV", async () => {
    const pcm = Buffer.alloc(4800).toString("base64");
    respond({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm } }] } }] });
    const audio = await geminiTts.synthesize({ text: "শুভ জন্মদিন", lang: "bn", signal: signal() });
    expect(audio.mime).toBe("audio/wav");
    expect(audioDurationMs(audio)).toBe(100);
    const { url, init } = calls[0];
    expect(url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:generateContent$/);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-gemini");
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBeTruthy();
    expect(body.contents[0].parts[0].text).toContain("শুভ জন্মদিন");
  });

  it("treats a 200 reply without audio as a failure, so the router fails over", async () => {
    respond({ candidates: [{ content: { parts: [] } }], usageMetadata: {} });
    await expect(geminiTts.synthesize({ text: "hi", lang: "en", signal: signal() })).rejects.toThrow(/no audio/);
  });

  it("rotates to the next TTS model when one's daily quota is used up, and remembers it", async () => {
    exhaustedUntil.clear();
    const pcm = Buffer.alloc(480).toString("base64");
    const quota = { error: { code: 429, details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "62574s" }] } };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return String(url).includes("flash-lite-tts")
        ? Response.json(quota, { status: 429 })
        : Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: pcm } }] } }] });
    });
    const a = await geminiTts.synthesize({ text: "hi", lang: "en", signal: signal() });
    expect(a.model).toBe("gemini-3.8-flash-tts");
    expect(exhaustedUntil.get("gemini-3.8-flash-lite-tts")! - Date.now()).toBeGreaterThan(62_000_000);
    calls = [];
    await geminiTts.synthesize({ text: "hi again", lang: "en", signal: signal() });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("gemini-3.8-flash-tts:");
    expect(retryAfterMs('"retryDelay": "1.5s"')).toBe(1500);
    exhaustedUntil.clear();
  });

  it("explains quota errors", async () => {
    exhaustedUntil.clear();
    respond({ error: { message: "Resource exhausted" } }, { status: 429 });
    await expect(geminiTts.synthesize({ text: "hi", lang: "en", signal: signal() })).rejects.toThrow(/quota used up on all 3 TTS models/);
    exhaustedUntil.clear();
  });

  it("asks the LLM for JSON with a system instruction", async () => {
    respond({ candidates: [{ content: { parts: [{ text: '{"en":"a","bn":"b"}' }] } }] });
    expect(await geminiLlm.complete({ system: "sys", prompt: "p", maxTokens: 50, signal: signal() })).toBe('{"en":"a","bn":"b"}');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });
});

describe("Azure", () => {
  it("escapes SSML and picks a Bangladeshi voice for Bangla", () => {
    const ssml = azureSsml('Tom & "Jerry" <3', "bn");
    expect(ssml).toContain("Tom &amp; &quot;Jerry&quot; &lt;3");
    expect(ssml).toContain('xml:lang="bn-BD"');
    expect(ssml).toContain("bn-BD-PradeepNeural");
  });

  it("calls the regional REST endpoint and returns MP3", async () => {
    respond(new Uint8Array([1, 2, 3]));
    const audio = await azureTts.synthesize({ text: "hi", lang: "en", signal: signal() });
    expect(audio.mime).toBe("audio/mpeg");
    expect(calls[0].url).toBe("https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1");
    const h = calls[0].init.headers as Record<string, string>;
    expect(h["Ocp-Apim-Subscription-Key"]).toBe("test-azure");
    expect(h["X-Microsoft-OutputFormat"]).toMatch(/mp3/);
  });
});

describe("Groq (OpenAI-compatible)", () => {
  it("posts multipart audio with model and language hint, and maps Whisper's language name", async () => {
    respond({ text: "শুভ জন্মদিন", language: "bengali" });
    const r = await groqStt.transcribe({ audio: { bytes: new Uint8Array([1, 2]), mime: "audio/webm" }, langHint: "bn", signal: signal() });
    expect(r).toEqual({ text: "শুভ জন্মদিন", lang: "bn" });
    expect(calls[0].url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const form = calls[0].init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("language")).toBe("bn");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("retries as Bangla when auto-detect returns another Indic script", async () => {
    let n = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json(n++ === 0 ? { text: "શુભજણમ દીનમે", language: "gujarati" } : { text: "শুভ জন্মদিন মেজ", language: "bengali" });
    });
    const r = await groqStt.transcribe({ audio: { bytes: new Uint8Array([1]), mime: "audio/wav" }, signal: signal() });
    expect(r).toEqual({ text: "শুভ জন্মদিন মেজ", lang: "bn" });
    expect((calls[0].init.body as FormData).get("language")).toBeNull();
    expect((calls[1].init.body as FormData).get("language")).toBe("bn");
  });

  it("reads chat completions", async () => {
    respond({ choices: [{ message: { content: "hello" } }] });
    expect(await groqLlm.complete({ system: "s", prompt: "p", maxTokens: 10, signal: signal() })).toBe("hello");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer test-groq");
  });
});

describe("Cloudflare", () => {
  it("runs Whisper by model path and detects the language from the script", async () => {
    respond({ result: { text: "Happy birthday" } });
    const r = await cloudflareStt.transcribe({ audio: { bytes: new Uint8Array([1]), mime: "audio/webm" }, signal: signal() });
    expect(r.lang).toBe("en");
    expect(calls[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/openai/whisper-large-v3-turbo");
  });
});
