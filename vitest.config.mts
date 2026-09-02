import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Fixed 32-byte key so encrypted fixtures are reproducible across runs.
const TEST_ENCRYPTION_KEY = "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=";

export default defineConfig({
  resolve: {
    // Mirror tsconfig "paths": { "@/*": ["./*"] }
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      NODE_ENV: "test",
    },
    // Integration tests share one SQLite file; run files sequentially.
    fileParallelism: false,
    restoreMocks: true,
    unstubEnvs: true,
  },
});
