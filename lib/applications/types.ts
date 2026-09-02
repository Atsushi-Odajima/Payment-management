import { formatCode, parseCode } from "@/lib/ids";

export const APPLICATION_CODE_PREFIX = "APP";

export const APPLICATION_TYPES = ["new_use", "add_method", "limit_change"] as const;
export type ApplicationType = (typeof APPLICATION_TYPES)[number];

/** Payment categories a merchant can apply for (subset of registry CategoryKey). */
export const APPLICATION_METHODS = ["credit", "qr", "convenience", "bank"] as const;
export type ApplicationMethod = (typeof APPLICATION_METHODS)[number];

export const APPLICATION_STATUSES = ["pending", "approved", "rejected", "returned"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Review decisions. Only master may perform them (lib/api/role-guard.ts). */
export const REVIEW_DECISIONS = ["approve", "reject", "return"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const DECISION_TO_STATUS: Record<ReviewDecision, ApplicationStatus> = {
  approve: "approved",
  reject: "rejected",
  return: "returned",
};

/** Decisions that require a written reason. */
export const DECISIONS_REQUIRING_REASON: readonly ReviewDecision[] = ["reject", "return"];

function includes<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}
export const isApplicationType = (v: unknown): v is ApplicationType => includes(APPLICATION_TYPES, v);
export const isApplicationMethod = (v: unknown): v is ApplicationMethod => includes(APPLICATION_METHODS, v);
export const isApplicationStatus = (v: unknown): v is ApplicationStatus => includes(APPLICATION_STATUSES, v);
export const isReviewDecision = (v: unknown): v is ReviewDecision => includes(REVIEW_DECISIONS, v);

/** A pending application is the only reviewable state. */
export function canReview(status: ApplicationStatus): boolean {
  return status === "pending";
}

export interface ApplicationView {
  id: string;
  applicationCode: string;
  merchant: { id: string; merchantCode: string; siteName: string };
  type: ApplicationType;
  method: ApplicationMethod;
  note: string;
  status: ApplicationStatus;
  appliedAt: Date;
  reviewedAt: Date | null;
  reviewerNote: string | null;
}

export const formatApplicationCode = (n: number) => formatCode(APPLICATION_CODE_PREFIX, n);
export const parseApplicationCode = (code: string) => parseCode(APPLICATION_CODE_PREFIX, code);
