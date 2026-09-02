import {
  isApplicationMethod,
  isApplicationStatus,
  isApplicationType,
  type ApplicationView,
} from "./types";

interface Row {
  id: string;
  applicationCode: string;
  type: string;
  method: string;
  note: string;
  status: string;
  appliedAt: Date;
  reviewedAt: Date | null;
  reviewerNote: string | null;
  merchant: { id: string; merchantCode: string; siteName: string };
}

/** Narrow raw DB strings to the typed view (unknown values fall back safely). */
export function toApplicationView(r: Row): ApplicationView {
  return {
    ...r,
    type: isApplicationType(r.type) ? r.type : "new_use",
    method: isApplicationMethod(r.method) ? r.method : "credit",
    status: isApplicationStatus(r.status) ? r.status : "pending",
  };
}
