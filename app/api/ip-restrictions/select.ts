export const IP_RESTRICTION_SELECT = {
  id: true,
  target: true,
  merchantId: true,
  cidr: true,
  label: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
  merchant: { select: { id: true, merchantCode: true, siteName: true } },
} as const;
