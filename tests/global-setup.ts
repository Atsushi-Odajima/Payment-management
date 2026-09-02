// Creates a fresh SQLite test database with all migrations applied before the
// test run. Env values must be passed explicitly — vitest's `test.env` only
// applies inside worker processes, not to this setup hook's child processes.

import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

export default function setup() {
  const dbFile = "prisma/test.db";
  rmSync(dbFile, { force: true });
  rmSync(`${dbFile}-journal`, { force: true });
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
  });
}
