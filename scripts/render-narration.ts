/**
 * Pre-record the host's static lines into public/narration/.
 *
 *   npm run narration:render                    # use the configured cloud TTS chain
 *   npm run narration:render -- --provider gemini --delay 7000
 *   npm run narration:render -- --only cake_done,happy_birthday --force
 *   npm run narration:render -- --provider espeak   # robotic offline placeholders
 *
 * Resumable: progress is saved after every clip, so if a free daily quota
 * runs out, run it again tomorrow and it continues where it stopped.
 */
import "./_env";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Lang } from "../src/lib/game/types";
import { CLIP_KEYS, CLIPS } from "../src/lib/host/script";
import { EMPTY_MANIFEST, type NarrationManifest } from "../src/lib/host/narration";
import { configuredProviders, routeTts } from "../src/lib/host/server/router";
import type { Audio, TtsProvider } from "../src/lib/host/server/types";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : undefined;
};
const provider = opt("provider") ?? "chain";
const langs = (opt("langs") ?? "en,bn").split(",") as Lang[];
const only = opt("only")?.split(",");
const force = args.includes("--force");
const delayMs = Number(opt("delay") ?? 1500);

const OUT = path.join(process.cwd(), "public", "narration");
const MANIFEST = path.join(OUT, "manifest.json");
const manifest: NarrationManifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : structuredClone(EMPTY_MANIFEST);
const save = () => {
  manifest.generatedAt = new Date().toISOString();
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
};

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

function espeak(text: string, lang: Lang): Audio {
  const tmp = path.join(OUT, `.tmp-${process.pid}.wav`);
  const r = spawnSync("espeak-ng", ["-v", lang === "bn" ? "bn" : "en-gb", "-s", lang === "bn" ? "150" : "165", "-p", "45", "-w", tmp, text]);
  if (r.status !== 0) throw new Error("espeak-ng is not installed (apt-get install espeak-ng)");
  const buf = readFileSync(tmp);
  rmSync(tmp);
  return { bytes: new Uint8Array(buf), mime: "audio/wav" };
}

/** WAV → small mono MP3 when ffmpeg exists; otherwise keep WAV. */
function compress(audio: Audio): { bytes: Uint8Array; ext: string } {
  if (audio.mime !== "audio/wav" || !hasFfmpeg) return { bytes: audio.bytes, ext: audio.mime === "audio/mpeg" ? "mp3" : "wav" };
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-ac", "1", "-b:a", "64k", "-f", "mp3", "pipe:1"], {
    input: audio.bytes,
    maxBuffer: 50 * 1024 * 1024,
  });
  return r.status === 0 ? { bytes: new Uint8Array(r.stdout), ext: "mp3" } : { bytes: audio.bytes, ext: "wav" };
}

async function synth(text: string, lang: Lang): Promise<{ audio: Audio; provider: string }> {
  if (provider === "espeak") return { audio: espeak(text, lang), provider: "espeak" };
  if (provider === "chain") {
    process.env.HOST_NO_MOCK = "1";
    const r = await routeTts(text, lang, 60_000);
    return { audio: r.value, provider: r.provider };
  }
  const p = configuredProviders("tts").find((x) => x.id === provider) as TtsProvider | undefined;
  if (!p) throw new Error(`provider "${provider}" is unknown or has no key configured`);
  return { audio: await p.synthesize({ text, lang, signal: AbortSignal.timeout(60_000) }), provider: p.id };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const keys = only ?? CLIP_KEYS;
  let made = 0;
  let skipped = 0;
  for (const key of keys) {
    const line = CLIPS[key as keyof typeof CLIPS];
    if (!line) {
      console.warn(`- unknown clip "${key}"`);
      continue;
    }
    for (const lang of langs) {
      const existing = manifest.clips[key]?.[lang];
      const upToDate = existing && existing.text === line[lang] && (!existing.placeholder || provider === "espeak");
      if (upToDate && !force) {
        skipped++;
        continue;
      }
      process.stdout.write(`• ${key} [${lang}] … `);
      try {
        const t0 = Date.now();
        const { audio, provider: used } = await synth(line[lang], lang);
        const { bytes, ext } = compress(audio);
        const file = `${lang}/${key}.${ext}`;
        mkdirSync(path.join(OUT, lang), { recursive: true });
        for (const old of ["mp3", "wav"]) if (old !== ext) rmSync(path.join(OUT, lang, `${key}.${old}`), { force: true });
        writeFileSync(path.join(OUT, file), bytes);
        manifest.clips[key] = { ...manifest.clips[key], [lang]: { file, text: line[lang], provider: used, bytes: bytes.length, ...(used === "espeak" ? { placeholder: true } : {}) } };
        save();
        made++;
        console.log(`${used}, ${(bytes.length / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`);
        if (provider !== "espeak") await sleep(delayMs);
      } catch (err) {
        const msg = (err as Error).message;
        console.log(`FAILED: ${msg.slice(0, 300)}`);
        if (/429|quota|rate limit/i.test(msg)) {
          console.log("\nQuota reached. Progress is saved — run the same command again later to continue.");
          process.exitCode = 2;
          return;
        }
      }
    }
  }
  console.log(`\nDone: ${made} rendered, ${skipped} already up to date. Manifest: public/narration/manifest.json`);
}

void main();
