import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatYen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "未払い",
  authorized: "オーソリ済",
  captured: "売上確定",
  cancelled: "取消",
  refunded: "返金済",
  failed: "失敗",
};

export const PAYMENT_STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  authorized: "bg-blue-100 text-blue-800 ring-blue-200",
  captured: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  cancelled: "bg-slate-200 text-slate-700 ring-slate-300",
  refunded: "bg-purple-100 text-purple-800 ring-purple-200",
  failed: "bg-rose-100 text-rose-800 ring-rose-200",
};
