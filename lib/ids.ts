// Sequential, zero-padded public codes: MER-00001, AGT-00001, APP-00001 …
//
// Padding makes lexical order equal numeric order, so "max" is one ordered
// query. The unique constraint on the code column is the real guard against
// a concurrent duplicate; creators retry once on Prisma P2002.

export const CODE_DIGITS = 5;

export function formatCode(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(CODE_DIGITS, "0")}`;
}

export function parseCode(prefix: string, code: string): number | null {
  const m = new RegExp(`^${prefix}-(\\d{${CODE_DIGITS},})$`).exec(code);
  return m ? Number(m[1]) : null;
}

/**
 * Compute the next code given a function that returns the current maximum
 * code (or null when the table is empty).
 */
export async function nextCode(prefix: string, findMax: () => Promise<string | null>): Promise<string> {
  const last = await findMax();
  const n = last ? (parseCode(prefix, last) ?? 0) : 0;
  return formatCode(prefix, n + 1);
}

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}
