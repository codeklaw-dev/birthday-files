#!/usr/bin/env node
/**
 * Rehearsal mode: the full show on FICTIONAL guests, in separate data folders.
 *
 *   npm run rehearsal              # seed sample data, then serve on port 3100
 *   npm run rehearsal -- --build   # build first (needed after code changes)
 *   npm run rehearsal -- --port 3200
 *
 * The real invite submissions are never read: every store refuses a data
 * folder outside .data/rehearsal/ while REHEARSAL=1.
 */
import { spawnSync, spawn } from "node:child_process";
import path from "node:path";

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

if (args.includes("--build")) run(bin("next"), ["build"]);
run(bin("tsx"), ["--conditions=react-server", "--tsconfig", "tsconfig.json", "scripts/seed-rehearsal.ts"]);
console.log(`\nREHEARSAL on http://localhost:${port}  —  /admin/show (key: your HOST_KEY or mez-host), /display, /play, /judge\n`);
const server = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-H", "0.0.0.0", "-p", port], { stdio: "inherit", env });
server.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.kill(sig));
