"use client";

import { LIMITS } from "../config";
import { EVENT } from "@/lib/event";

/**
 * Shrink a photo in the browser before upload: smaller and faster to send, and
 * re-encoding drops EXIF data such as GPS location. Falls back to the original
 * file (the server strips JPEG/PNG metadata too).
 */
export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error("That doesn't look like a photo. Choose a JPEG, PNG or WebP image.");
  }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, LIMITS.photoMaxEdge / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    if (blob) return blob;
  } catch {
    if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      throw new Error("This browser can't read iPhone HEIC photos. Try sending it from Safari, or take a screenshot of the photo and send that.");
    }
  }
  if (file.size > LIMITS.photoBytes) throw new Error(`That photo is over ${LIMITS.photoBytes / 1024 / 1024} MB. Try a smaller one.`);
  return file;
}

/** Video length from its metadata, or null if the browser can't tell (some WebM files). */
export function videoDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

export function checkVideo(file: File, duration: number | null): string | null {
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) return "That doesn't look like a video. Choose an MP4, MOV or WebM file.";
  if (file.size > LIMITS.videoBytes) return `That video is ${Math.round(file.size / 1024 / 1024)} MB; the limit is ${LIMITS.videoBytes / 1024 / 1024} MB. Try recording at 1080p instead of 4K.`;
  if (duration !== null && (duration < LIMITS.videoMinSec - 0.5 || duration > LIMITS.videoMaxSec + 0.5)) {
    return `Videos need to be ${LIMITS.videoMinSec}–${LIMITS.videoMaxSec} seconds. This one is ${Math.round(duration)} seconds.`;
  }
  return null;
}

export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** A calendar file for the party (time is a placeholder until confirmed in EVENT). */
export function calendarFile(): Blob {
  const day = EVENT.startsAt.slice(0, 10).replace(/-/g, "");
  const next = new Date(`${EVENT.startsAt.slice(0, 10)}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replace(/-/g, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Birthday Files//EN",
    "BEGIN:VEVENT",
    `UID:birthday-files-${day}@mez`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${EVENT.guestOfHonour}'s ${EVENT.age}th birthday: ${EVENT.title}`,
    `DESCRIPTION:${EVENT.timeLabel}. ${EVENT.venueLabel}. Bring a charged phone.`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return new Blob([ics], { type: "text/calendar" });
}
