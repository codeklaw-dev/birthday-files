import { describe, expect, it } from "vitest";
import type { NetworkInterfaceInfo } from "node:os";
import { rankLanAddresses } from "@/lib/server/lan";

const v4 = (address: string, internal = false) => ({ address, family: "IPv4", internal, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: null }) as NetworkInterfaceInfo;

describe("LAN address for the phones' QR code", () => {
  it("prefers the Mac's Wi-Fi over VPN, VM bridges, loopback and link-local", () => {
    const ifaces = {
      lo0: [v4("127.0.0.1", true)],
      utun4: [v4("100.101.5.6")],
      bridge100: [v4("192.168.64.1")],
      en7: [v4("169.254.10.2")],
      en0: [v4("192.168.1.23")],
    };
    expect(rankLanAddresses(ifaces)[0]).toBe("192.168.1.23");
    expect(rankLanAddresses(ifaces)).not.toContain("127.0.0.1");
    expect(rankLanAddresses(ifaces)).not.toContain("169.254.10.2");
  });

  it("lets LAN_HOST override the choice", () => {
    expect(rankLanAddresses({ en0: [v4("192.168.1.23")] }, "10.0.0.5")[0]).toBe("10.0.0.5");
  });
});

describe("launcher and server agree on the address", () => {
  it("scripts/lib/preflight.mjs ranks like src/lib/server/lan.ts", async () => {
    const { rankLanAddresses: launcher } = await import("../scripts/lib/preflight.mjs");
    const ifaces = { utun4: [v4("100.101.5.6")], bridge100: [v4("192.168.64.1")], en0: [v4("192.168.1.23")], en5: [v4("10.0.0.9")] };
    expect(launcher(ifaces)).toEqual(rankLanAddresses(ifaces));
    expect(launcher(ifaces, "10.0.0.5")).toEqual(rankLanAddresses(ifaces, "10.0.0.5"));
  });
});
