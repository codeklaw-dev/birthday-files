#!/usr/bin/env node
/**
 * Rehearsal mode: the full show on FICTIONAL guests, in separate data folders.
 *
 *   npm run rehearsal              # seed sample data, then serve on port 3100
 *   npm run rehearsal -- --build   # build first (needed after code changes)
 *   npm run rehearsal -- --port 3200
 *   npm run rehearsal -- --resume  # keep the rehearsal's current state (crash-recovery test)
 *
 * Needs HOST_KEY in .env.local (never the development default).
 *
 * The real invite submissions are never read: every store refuses a data
 * folder outside .data/rehearsal/ while REHEARSAL=1.
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { preflight } from "./lib/preflight.mjs";

const args = process.argv.slice(2);
const port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "3100";
// REHEARSAL_DATA_DIR lets tests use a throwaway folder; it must still be a ".../rehearsal" folder.
const base = process.env.REHEARSAL_DATA_DIR || path.join(process.cwd(), ".data", "rehearsal");
const env = {
  ...process.env,
  REHEARSAL: "1",
  ROOM_DATA_DIR: path.join(base, "room"),
  INVITE_DATA_DIR: path.join(base, "invite"),
  HOST_DATA_DIR: path.join(base, "host"),
  // Empty = a separate signing key kept in the rehearsal folder, so rehearsal links never work on the real show.
  INVITE_SIGNING_SECRET: "",
};
const bin = (name) => path.join(process.cwd(), "node_modules", ".bin", name);
const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

await preflight({ port, label: "REHEARSAL (fictional guests only)" });
if (args.includes("--build")) run(bin("next"), ["build"]);
if (!existsSync(path.join(process.cwd(), ".next", "BUILD_ID"))) {
  console.error("\n✖ No production build yet. Run: npm run rehearsal -- --build\n");
  process.exit(1);
}
if (args.includes("--resume") && existsSync(path.join(base, "invite"))) console.log("Resuming the existing rehearsal data (not re-seeded).");
else run(bin("tsx"), ["--conditions=react-server", "--tsconfig", "tsconfig.json", "scripts/seed-rehearsal.ts"]);
const server = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit", env });
server.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
