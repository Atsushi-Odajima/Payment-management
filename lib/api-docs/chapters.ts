// Hand-written chapters of the public API docs (Phase L-3), in reading
// order. Each maps to content/api-docs/<lang>/<slug>.md and to
// apiDocs.chapters.<slug>. The endpoint reference is generated from the
// OpenAPI document (lib/public-api/openapi.ts) and appended after them.

export const API_DOC_CHAPTERS = ["intro", "auth", "errors", "test-cards", "webhooks", "sandbox"] as const;
export type ApiDocChapter = (typeof API_DOC_CHAPTERS)[number];

export function isApiDocChapter(v: unknown): v is ApiDocChapter {
  return typeof v === "string" && (API_DOC_CHAPTERS as readonly string[]).includes(v);
}
