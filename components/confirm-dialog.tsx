"use client";

// Accessible replacement for window.confirm(): a native <dialog> opened with
// showModal(), role="alertdialog", Escape to dismiss, focus returned to the
// triggering element. useConfirm() returns a Promise<boolean> (or the entered
// value for prompt-style dialogs) so call sites read like confirm() did.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useT } from "./language-provider";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual weight of the confirm button. */
  tone?: "primary" | "danger";
  /** Optional form fields rendered inside the dialog; their values are returned. */
  fields?: React.ReactNode;
  /** Disable the confirm button (e.g. invalid field values). */
  confirmDisabled?: boolean;
}

type Resolver = (ok: boolean) => void;

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Update options of the currently open dialog (for live field validation). */
  update: (patch: Partial<ConfirmOptions>) => void;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resolverRef = useRef<Resolver | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    dialogRef.current?.close();
    setOpts(null);
    openerRef.current?.focus?.();
    openerRef.current = null;
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    openerRef.current = document.activeElement as HTMLElement | null;
    setOpts(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const update = useCallback((patch: Partial<ConfirmOptions>) => {
    setOpts((cur) => (cur ? { ...cur, ...patch } : cur));
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (opts && !el.open) el.showModal();
  }, [opts]);

  return (
    <ConfirmContext.Provider value={{ confirm, update }}>
      {children}
      <dialog
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={opts?.body ? bodyId : undefined}
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
        onClick={(e) => {
          // click on backdrop closes
          if (e.target === dialogRef.current) close(false);
        }}
        className="w-[min(92vw,26rem)] rounded-xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/40"
      >
        {opts && (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              if (!opts.confirmDisabled) close(true);
            }}
            className="p-5"
          >
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {opts.title}
            </h2>
            {opts.body && (
              <div id={bodyId} className="mt-2 text-sm text-slate-600">
                {opts.body}
              </div>
            )}
            {opts.fields && <div className="mt-4 space-y-3">{opts.fields}</div>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => close(false)}>
                {opts.cancelLabel ?? t("common.cancel")}
              </button>
              <button
                type="submit"
                autoFocus
                disabled={opts.confirmDisabled}
                className={cn(opts.tone === "danger" ? "btn-danger" : "btn-primary")}
              >
                {opts.confirmLabel ?? t("common.confirm")}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
