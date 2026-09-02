// Columns safe to send to the client. passwordEnc is deliberately absent.
export const MERCHANT_SELECT = {
  id: true,
  merchantCode: true,
  siteName: true,
  siteNameKana: true,
  companyName: true,
  contactName: true,
  email: true,
  statementEmail: true,
  notifyUrl: true,
  notifyFormat: true,
  notifyParamSet: true,
  notifyIdFormat: true,
  emailNotification: true,
  createdAt: true,
  updatedAt: true,
} as const;
