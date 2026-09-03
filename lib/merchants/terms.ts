// Merchant deadline settings (B-3, K-1): transfer deadline days, konbini
// payment deadline days and refund window days. Ranges are shared by the API
// schema and the form.

import { CVS_DUE_LIMITS } from "@/lib/payments/konbini";

export const TERMS_LIMITS = { transferDueDays: { min: 1, max: 60 }, cvsDueDays: CVS_DUE_LIMITS, refundWindowDays: { min: 0, max: 365 } } as const;
