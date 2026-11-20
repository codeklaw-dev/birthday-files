"use client";

import type { MediaItem } from "@/lib/game/media";

export type UploadResult = { ok: true; item: MediaItem } | { ok: false; error: string };

/** Sends one file as the raw request body, reporting progress from 0 to 1. */
export function uploadFile(blob: Blob, onProgress?: (fraction: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/uploads");
    xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: { ok?: boolean; url?: string; kind?: MediaItem["kind"]; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 200 && body.ok && body.url && body.kind) resolve({ ok: true, item: { kind: body.kind, url: body.url } });
      else if (xhr.status === 413) resolve({ ok: false, error: body.error ?? "That file is too big." });
      else resolve({ ok: false, error: body.error ?? "Upload failed. Check your connection and try again." });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Upload failed. Check your connection and try again." });
    xhr.send(blob);
  });
}

const PHOTO_MAX_EDGE = 1600;

/** Shrinks a photo to at most 1600px on its long edge as JPEG, so uploads stay quick. */
export async function preparePhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("unreadable"));
      el.src = url;
    });
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("unreadable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("unreadable");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Where to load an uploaded file from. A seam so the static preview can map uploads to local blobs. */
export function mediaSrc(url: string): string {
  return url;
}
