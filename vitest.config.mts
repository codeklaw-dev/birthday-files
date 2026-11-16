import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside Next's server bundle; tests run server code directly.
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
    },
  },
  test: { include: ["tests/**/*.test.ts"], env: { ROOM_PERSIST: "off", TTS_CACHE_DIR: "/tmp/bf-test-tts" } },
});
