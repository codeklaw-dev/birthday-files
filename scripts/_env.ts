import * as nextEnv from "@next/env";

/** Load .env / .env.local the same way Next does, so scripts see the same keys. */
const load = (nextEnv as unknown as { loadEnvConfig?: typeof import("@next/env").loadEnvConfig; default?: typeof import("@next/env") }).loadEnvConfig
  ?? (nextEnv as unknown as { default: typeof import("@next/env") }).default.loadEnvConfig;
load(process.cwd(), false, { info: () => {}, error: console.error });
