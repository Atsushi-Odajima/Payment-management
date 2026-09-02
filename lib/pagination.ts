// Pagination constants and helpers shared by Server Components (page.tsx)
// and the client <Pagination> component. Kept free of "use client" so that
// Server Components can call parsePage() directly — exporting a function
// from a client module turns it into a client reference that is not callable
// on the server.

export const DEFAULT_PAGE_SIZE = 20;

/** Parses a `?page=` query value; anything that is not a positive integer becomes page 1. */
export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
