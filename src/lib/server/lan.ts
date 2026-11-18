import type { NetworkInterfaceInfo } from "node:os";

/**
 * Which of the laptop's addresses phones should use. A Mac often has extra
 * interfaces (VPN `utun*`, Internet Sharing / VM `bridge*`, `vmnet*`, Docker);
 * the Wi-Fi or Ethernet address on a private range comes first.
 * `LAN_HOST` overrides the choice (e.g. LAN_HOST=192.168.1.23).
 */
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const PHYSICAL = /^(en|eth|wlan|wl|wifi)/i;
const VIRTUAL = /^(utun|bridge|vmnet|vboxnet|docker|veth|br-|tun|tap|llw|awdl|anpi|ap\d)/i;

export function rankLanAddresses(ifaces: Record<string, NetworkInterfaceInfo[] | undefined>, override?: string): string[] {
  const all = Object.entries(ifaces).flatMap(([name, list]) =>
    (list ?? []).filter((n) => n.family === "IPv4" && !n.internal && !n.address.startsWith("169.254.")).map((n) => ({ name, address: n.address })),
  );
  const score = (x: { name: string; address: string }) => (PRIVATE.test(x.address) ? 4 : 0) + (PHYSICAL.test(x.name) ? 2 : 0) - (VIRTUAL.test(x.name) ? 4 : 0);
  const ranked = all.sort((a, b) => score(b) - score(a)).map((x) => x.address);
  const o = override?.trim();
  return o ? [o, ...ranked.filter((a) => a !== o)] : ranked;
}
