// Merchant deadline settings (B-3): transfer deadline days and refund window
// days. Ranges are shared by the API schema and the form.

export const TERMS_LIMITS = { transferDueDays: { min: 1, max: 60 }, refundWindowDays: { min: 0, max: 365 } } as const;
