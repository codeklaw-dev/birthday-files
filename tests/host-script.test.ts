import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NarrationManifest } from "@/lib/host/narration";
import { CLIP_KEYS, CLIPS, LINES } from "@/lib/host/script";

describe("host script", () => {
  it("has English and Bangla for every static line, short enough to speak", () => {
    for (const key of CLIP_KEYS) {
      expect(CLIPS[key].en.length, key).toBeGreaterThan(3);
      expect(CLIPS[key].bn, key).toMatch(/[ঀ-৿]/);
      expect(CLIPS[key].en.length, key).toBeLessThan(170);
    }
  });

  it("gives every dynamic line a pre-recorded fallback", () => {
    const dynamic = [LINES.question(2, 4), LINES.question(4, 4), LINES.reveal(1, 3, "Bob"), LINES.leaderboard("Alice"), LINES.finished("Alice")];
    for (const line of dynamic) {
      expect(line.clip).toBeUndefined();
      expect(CLIP_KEYS).toContain(line.fallbackClip);
    }
  });

  it("ships a narration manifest whose files exist and match the current script", () => {
    const manifest: NarrationManifest = JSON.parse(readFileSync("public/narration/manifest.json", "utf8"));
    for (const key of CLIP_KEYS) {
      for (const lang of ["en", "bn"] as const) {
        const clip = manifest.clips[key]?.[lang];
        expect(clip, `${key}/${lang}`).toBeDefined();
        expect(clip!.text, `${key}/${lang} is out of date: re-run npm run narration:render`).toBe(CLIPS[key][lang]);
        expect(readFileSync(`public/narration/${clip!.file}`).length).toBe(clip!.bytes);
      }
    }
  });
});
