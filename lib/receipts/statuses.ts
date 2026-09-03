// Client-safe: which transaction statuses can carry a receipt (Phase K-2).
// The server-side service re-exports this list.

export const RECEIPT_STATUSES: readonly string[] = ["captured", "partially_refunded"];
