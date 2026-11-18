/**
 * Checks before serving the show on the local Wi-Fi (used by `npm run party`
 * and `npm run rehearsal`): Node version, a strong HOST_KEY (never the
 * development default), and the laptop's Wi-Fi address with a QR code for
 * phones. Never prints the key.
 */
import { networkInterfaces } from "node:os";
import nextEnv from "@next/env";
import QRCode from "qrcode";

// Keep in step with src/lib/server/lan.ts (tests/lan.test.ts checks both).
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const PHYSICAL = /^(en|eth|wlan|wl|wifi)/i;
const VIRTUAL = /^(utun|bridge|vmnet|vboxnet|docker|veth|br-|tun|tap|llw|awdl|anpi|ap\d)/i;
export function rankLanAddresses(ifaces, override) {
  const all = Object.entries(ifaces).flatMap(([name, list]) =>
    (list ?? []).filter((n) => n.family === "IPv4" && !n.internal && !n.address.startsWith("169.254.")).map((n) => ({ name, address: n.address })),
  );
  const score = (x) => (PRIVATE.test(x.address) ? 4 : 0) + (PHYSICAL.test(x.name) ? 2 : 0) - (VIRTUAL.test(x.name) ? 4 : 0);
  const ranked = all.sort((a, b) => score(b) - score(a)).map((x) => x.address);
  const o = override?.trim();
  return o ? [o, ...ranked.filter((a) => a !== o)] : ranked;
}

const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

export async function preflight({ port, label }) {
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 20 || (maj === 20 && min < 9)) fail(`Node ${process.versions.node} is too old. Install Node 22 LTS (https://nodejs.org) and try again.`);

  nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
  const key = process.env.HOST_KEY ?? "";
  if (!key) fail("HOST_KEY is not set. Add a long random value to .env.local, e.g. run:\n    echo \"HOST_KEY=$(openssl rand -base64 24 | tr -d '/+=')\" >> .env.local");
  if (key === "mez-host") fail("HOST_KEY is still the public development default (mez-host). Choose a long random value in .env.local.");
  if (key.length < 16) fail("HOST_KEY is too short. Use at least 16 characters (e.g. openssl rand -base64 24).");

  const hosts = rankLanAddresses(networkInterfaces(), process.env.LAN_HOST);
  console.log(`\n=== ${label} ===`);
  console.log(`Host key: set (${key.length} characters, not shown)`);
  console.log(`Laptop control panel:  http://localhost:${port}/admin/show`);
  console.log(`TV / external monitor: http://localhost:${port}/display`);
  if (!hosts.length) {
    console.log("\n⚠ No Wi-Fi/LAN address found. Is the Mac connected to Wi-Fi? Phones can't join until it is.\n");
    return { hosts };
  }
  const play = `http://${hosts[0]}:${port}/play`;
  console.log(`Phones (same Wi-Fi):   ${play}`);
  if (hosts.length > 1) console.log(`Other addresses (if that one fails): ${hosts.slice(1).join(", ")}  — or set LAN_HOST=<address>`);
  console.log(await QRCode.toString(play, { type: "terminal", small: true }));
  return { hosts };
}

// `node scripts/lib/preflight.mjs [port]`: checks only (used by `npm run party`).
if (import.meta.url === `file://${process.argv[1]}`) await preflight({ port: process.argv[2] || "3000", label: "PARTY (real guest data)" });
