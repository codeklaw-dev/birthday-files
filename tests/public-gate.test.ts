import { describe, expect, it } from "vitest";
import { publicAllowed, viaCloudflare } from "@/lib/server/public-gate";
import { clientIp } from "@/lib/server/rate-limit";
import { LIMITS } from "@/lib/invite/config";

describe("public gate (requests through the Cloudflare Tunnel)", () => {
  it("lets guests reach the invitation and their own submission", () => {
    expect(publicAllowed("GET", "/")).toBe(true);
    expect(publicAllowed("GET", "/invite")).toBe(true);
    expect(publicAllowed("GET", "/_next/static/chunks/a.js")).toBe(true);
    expect(publicAllowed("GET", "/api/invite/settings")).toBe(true);
    expect(publicAllowed("POST", "/api/invite/submissions")).toBe(true);
    expect(publicAllowed("PUT", "/api/invite/submissions/me")).toBe(true);
    expect(publicAllowed("DELETE", "/api/invite/submissions/me")).toBe(true);
    expect(publicAllowed("PUT", "/api/invite/media/video")).toBe(true);
    expect(publicAllowed("GET", "/api/invite/media/file/0b6c1f1e-8a5e-4a3f-9d2e-1f2a3b4c5d6e")).toBe(true);
  });

  it("blocks everything that runs the show or the admin", () => {
    for (const [m, p] of [
      ["GET", "/admin"],
      ["GET", "/admin/submissions"],
      ["GET", "/admin/show"],
      ["GET", "/display"],
      ["GET", "/play"],
      ["GET", "/judge"],
      ["GET", "/hub"],
      ["GET", "/api/invite/admin"],
      ["PATCH", "/api/invite/admin/abc"],
      ["PUT", "/api/invite/settings"],
      ["GET", "/api/room/stream"],
      ["POST", "/api/room/action"],
      ["POST", "/api/room/host-check"],
      ["GET", "/api/host/speech"],
      ["POST", "/api/host/report"],
      ["GET", "/api/host/narration"],
      ["POST", "/api/show/preview"],
      ["GET", "/narration/manifest.json"],
      ["GET", "/api/invite/media/file/../../room.json"],
      ["GET", "/invite/../admin"],
    ] as const)
      expect(publicAllowed(m, p), `${m} ${p}`).toBe(false);
  });

  it("recognises Cloudflare-forwarded requests and uses Cloudflare's client IP", () => {
    expect(viaCloudflare(new Headers({ "cf-connecting-ip": "203.0.113.9" }))).toBe(true);
    expect(viaCloudflare(new Headers({ "x-forwarded-for": "10.0.0.2" }))).toBe(false);
    const spoof = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "203.0.113.9" } });
    expect(clientIp(spoof)).toBe("203.0.113.9");
  });

  it("keeps videos under Cloudflare's 100 MB request limit", () => {
    expect(LIMITS.videoBytes).toBeLessThan(100 * 1000 * 1000);
  });
});
