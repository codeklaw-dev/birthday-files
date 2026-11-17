"use client";

import type { Question } from "../config";
import type { GuestData } from "../schema";
import type { GuestView, MediaKind } from "../types";

/** Browser-side calls to the invite API. Errors come back as readable messages. */

export interface ApiError {
  ok: false;
  error: string;
  fields?: Record<string, string>;
  status: number;
}
export type ApiResult<T> = ({ ok: true } & T) | ApiError;

async function call<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok) return body;
    return { ok: false, error: body.error ?? "Something went wrong. Please try again.", fields: body.fields, status: res.status };
  } catch {
    return { ok: false, error: "We couldn't reach the party server. Check your connection and try again.", status: 0 };
  }
}

const tokenHeaders = (token: string, extra: Record<string, string> = {}) => ({ "x-edit-token": token, ...extra });

export const inviteApi = {
  questions: () => call<{ questions: Question[] }>("/api/invite/settings"),
  create: (data: GuestData) =>
    call<{ token: string; submission: GuestView }>("/api/invite/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  mine: (token: string) => call<{ submission: GuestView }>("/api/invite/submissions/me", { headers: tokenHeaders(token) }),
  update: (token: string, data: GuestData) =>
    call<{ submission: GuestView }>("/api/invite/submissions/me", {
      method: "PUT",
      headers: tokenHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify(data),
    }),
  withdraw: (token: string) => call<object>("/api/invite/submissions/me", { method: "DELETE", headers: tokenHeaders(token) }),
  removeMedia: (token: string, kind: MediaKind) => call<{ submission: GuestView }>(`/api/invite/media/${kind}`, { method: "DELETE", headers: tokenHeaders(token) }),
};

/** Upload with progress (fetch can't report upload progress yet). */
export function uploadMedia(
  token: string,
  kind: MediaKind,
  blob: Blob,
  opts: { durationSec?: number; onProgress?: (fraction: number) => void },
): Promise<ApiResult<{ submission: GuestView }>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/invite/media/${kind}`);
    xhr.setRequestHeader("x-edit-token", token);
    xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
    if (opts.durationSec) xhr.setRequestHeader("x-video-duration", String(Math.round(opts.durationSec * 10) / 10));
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: { ok?: boolean; error?: string; submission?: GuestView } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.ok && body.submission) resolve({ ok: true, submission: body.submission });
      else resolve({ ok: false, error: body.error ?? `Upload failed (${xhr.status}).`, status: xhr.status });
    };
    xhr.onerror = () => resolve({ ok: false, error: "The upload was interrupted. Check your connection and try again.", status: 0 });
    xhr.send(blob);
  });
}
