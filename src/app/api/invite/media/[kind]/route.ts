import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { LIMITS } from "@/lib/invite/config";
import { mp4DurationSec, sniff, streamToFile, stripJpegMetadata, stripPngMetadata, UploadError, videoDurationOk, webmDurationSec } from "@/lib/invite/server/files";
import { fail, guestFromRequest, json, limited } from "@/lib/invite/server/http";
import { mediaFile } from "@/lib/invite/server/paths";
import { inviteStore } from "@/lib/invite/server/store";
import { guestView } from "@/lib/invite/server/views";
import type { MediaKind, MediaRef } from "@/lib/invite/types";

const KINDS: MediaKind[] = ["photo", "video"];

/**
 * Upload or replace the guest's photo or video. Raw body, streamed to disk
 * with a hard size cap; the type is checked from the bytes; videos must be
 * 15–60 seconds; photos lose their EXIF/GPS metadata.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const kind = (await ctx.params).kind as MediaKind;
  if (!KINDS.includes(kind)) return fail("Unknown upload type.", 404);
  const slow = limited(req, "upload", 20, 10 * 60_000);
  if (slow) return slow;
  const g = guestFromRequest(req);
  if (g.error) return g.error;

  const max = kind === "photo" ? LIMITS.photoBytes : LIMITS.videoBytes;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) return fail(`That file is too big (limit ${Math.round(max / 1024 / 1024)} MB).`, 413);

  const store = inviteStore();
  store.ensureMediaDir();
  const id = randomUUID();
  const tmp = mediaFile(id, "upload");
  try {
    const { bytes, head } = await streamToFile(req.body, tmp, max);
    const type = sniff(head);
    if (!type || type.kind !== kind) {
      throw new UploadError(
        kind === "photo" ? "Please choose a JPEG, PNG or WebP photo." : "Please choose an MP4, MOV or WebM video.",
        415,
      );
    }
    const ref: MediaRef = { id, kind, mime: type.mime, ext: type.ext, bytes, uploadedAt: Date.now() };

    if (kind === "photo") {
      const raw = new Uint8Array(await readFile(tmp));
      const clean = type.ext === "jpg" ? stripJpegMetadata(raw) : type.ext === "png" ? stripPngMetadata(raw) : raw;
      await writeFile(tmp, clean, { mode: 0o600 });
      ref.bytes = clean.length;
    } else {
      const measured = type.ext === "webm" ? await webmDurationSec(tmp) : await mp4DurationSec(tmp);
      const claimed = Number(req.headers.get("x-video-duration"));
      const sec = measured ?? (Number.isFinite(claimed) && claimed > 0 ? claimed : null);
      if (sec === null) throw new UploadError("We couldn't read how long that video is. Try another file.", 422);
      if (!videoDurationOk(sec)) throw new UploadError(`Videos need to be ${LIMITS.videoMinSec}–${LIMITS.videoMaxSec} seconds (this one is ${Math.round(sec)}s).`, 422);
      ref.durationSec = Math.round(sec * 10) / 10;
      ref.durationVerified = measured !== null;
    }

    await rename(tmp, mediaFile(id, type.ext));
    const s = store.setMedia(g.token, kind, ref);
    if (!s) {
      await rm(mediaFile(id, type.ext), { force: true });
      return fail("Submission not found.", 404);
    }
    return json({ ok: true, submission: guestView(s) });
  } catch (err) {
    await rm(tmp, { force: true });
    if (err instanceof UploadError) return fail(err.message, err.status);
    console.error("[invite] upload failed", err);
    return fail("The upload didn't finish. Please try again.", 500);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const kind = (await ctx.params).kind as MediaKind;
  if (!KINDS.includes(kind)) return fail("Unknown upload type.", 404);
  const g = guestFromRequest(req);
  if (g.error) return g.error;
  const s = inviteStore().removeMedia(g.token, kind);
  return s ? json({ ok: true, submission: guestView(s) }) : fail("Submission not found.", 404);
}
