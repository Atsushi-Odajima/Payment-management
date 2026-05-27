// Adjusts prisma/schema.prisma to match the configured DATABASE_URL.
// - postgres://... or postgresql://...  → provider = "postgresql"
// - mysql://...                          → provider = "mysql"
// - file:...                             → provider = "sqlite"
//
// Run before `prisma generate` so the same repo works locally with SQLite
// and on Vercel / managed hosts with Postgres, without manual schema edits.

import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "";

function detect(value) {
  if (/^postgres(ql)?:\/\//i.test(value)) return "postgresql";
  if (/^mysql:\/\//i.test(value)) return "mysql";
  if (/^file:/i.test(value)) return "sqlite";
  return null;
}

const provider = detect(url);
if (!provider) {
  console.log(
    "[prepare-prisma] DATABASE_URL not set or unrecognized — leaving schema unchanged.",
  );
  process.exit(0);
}

const path = "prisma/schema.prisma";
const content = readFileSync(path, "utf8");
const next = content.replace(
  /(datasource\s+db\s*\{[\s\S]*?provider\s*=\s*")[^"]+(")/,
  `$1${provider}$2`,
);

if (next === content) {
  console.log(`[prepare-prisma] Already targeting ${provider}.`);
} else {
  writeFileSync(path, next);
  console.log(`[prepare-prisma] Set datasource provider to ${provider}.`);
}
