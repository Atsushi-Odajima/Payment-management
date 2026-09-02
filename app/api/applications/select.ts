export const APPLICATION_SELECT = {
  id: true,
  applicationCode: true,
  type: true,
  method: true,
  note: true,
  status: true,
  appliedAt: true,
  reviewedAt: true,
  reviewerNote: true,
  merchant: { select: { id: true, merchantCode: true, siteName: true } },
} as const;
