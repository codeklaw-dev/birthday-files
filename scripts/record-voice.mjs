// Records Casper's lines with ElevenLabs into voice-cache/, so the live site can
// speak them without its own key. Usage:
//   ELEVENLABS_API_KEY=... node scripts/record-voice.mjs "Name One" "Name Two" ...
// (player names are used for the leaderboard and finale lines)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { SCRIPT } from "../src/lib/casper/script.ts";
import { FLASHBACK } from "../src/lib/game/flashback.ts";

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "cgSgspJ2msm6clMCkdW9";
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_v3";
const TOTAL = Number(process.env.TOTAL_QUESTIONS || 10);
const names = process.argv.slice(2);

const lines = [
  SCRIPT.lobby, SCRIPT.intro, SCRIPT.premiereOutro, SCRIPT.messages, SCRIPT.cake, SCRIPT.cakeDone, SCRIPT.reveal(),
  ...Array.from({ length: TOTAL }, (_, i) => SCRIPT.question(i + 1, TOTAL)),
  ...[null, ...names].flatMap((n) => [SCRIPT.leaderboard(n), SCRIPT.finished(n)]),
  ...FLASHBACK.map((f) => f.line),
];
const texts = [...new Set(lines.flatMap((l) => [l.en, l.bn]))];
mkdirSync("voice-cache", { recursive: true });

let done = 0, made = 0;
const queue = [...texts];
async function worker() {
  for (let text; (text = queue.shift()); ) {
    const file = `voice-cache/${createHash("sha256").update(`${VOICE_ID}|${MODEL}|${text}`).digest("hex")}.mp3`;
    if (!existsSync(file)) {
      for (let attempt = 1; ; attempt++) {
        const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "", "content-type": "application/json", accept: "audio/mpeg" },
          body: JSON.stringify({ text, model_id: MODEL }),
        });
        if (res.ok) { writeFileSync(file, Buffer.from(await res.arrayBuffer())); made++; break; }
        if (attempt >= 3) { console.error("FAILED", res.status, text.slice(0, 60), (await res.text()).slice(0, 150)); break; }
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    done++;
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log(`${texts.length} lines, ${made} newly recorded, ${done} checked`);
