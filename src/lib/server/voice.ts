import "server-only";
import { createHash } from "node:crypto";

/**
 * Casper's natural voice via ElevenLabs text-to-speech.
 *
 * Needs ELEVENLABS_API_KEY on the server. Optional ELEVENLABS_VOICE_ID and
 * ELEVENLABS_MODEL pick the voice and model. Without a key the route answers
 * 503 and the TV falls back to the browser's built-in voice.
 */
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "cgSgspJ2msm6clMCkdW9"; // "Jessica: playful, bright, warm"
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_v3"; // expressive; supports Bengali

export const voiceConfigured = () => Boolean(process.env.ELEVENLABS_API_KEY);

/** Finished audio, keyed by voice + model + text, so each line costs credits only once. */
const cache = new Map<string, Promise<Buffer>>();
const MAX_CACHED = 300;

export function speak(text: string): Promise<Buffer> {
  const key = createHash("sha256").update(`${VOICE_ID}|${MODEL}|${text}`).digest("hex");
  const hit = cache.get(key);
  if (hit) return hit;
  const job = synthesise(text).catch((err) => {
    cache.delete(key); // don't keep failures
    throw err;
  });
  cache.set(key, job);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
  return job;
}

async function synthesise(text: string): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODEL }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}
