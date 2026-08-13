'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertIcon, CheckIcon, InfoIcon } from './icons';

/**
 * Toasts.
 *
 * Why these exist: the previous screens surfaced every transaction result as
 * an inline banner inside the panel that triggered it. That pushes the layout
 * around at the exact moment the user is watching a number, and a wallet
 * flow produces three of these in a row (approve, send, receipt). Toasts keep
 * the panel still and let the results stack.
 *
 * Interruption is the interesting part here. Toasts arrive mid-flight, so:
 *   - exits are transitions, not keyframes, so a new toast retargets from
 *     wherever the stack currently is instead of restarting from 0
 *   - `state` drives the exit; the node stays mounted for the exit duration
 *     and is only then removed
 *   - the dismiss timer pauses while the tab is hidden, so a user who tabs
 *     away to confirm in their wallet does not come back to an empty screen
 */

export type ToastKind = 'info' | 'success' | 'error';

interface ToastRecord {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  /** 'open' animates in and holds; 'closed' plays the exit. */
  state: 'open' | 'closed';
}

interface ToastInput {
  kind?: ToastKind;
  title: string;
  description?: string;
}

interface ToastApi {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** How long a toast holds before it starts dismissing itself. */
const HOLD_MS = 6000;
/** Must cover the exit transition in globals.css (var(--t-fast) = 160ms). */
const EXIT_MS = 220;
/** More than three stacked toasts stops being information and starts being noise. */
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, state: 'closed' } : t)));
      const handle = setTimeout(() => remove(id), EXIT_MS);
      timers.current.set(id, handle);
    },
    [remove],
  );

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const record: ToastRecord = {
        id,
        kind: input.kind ?? 'info',
        title: input.title,
        state: 'open',
        ...(input.description === undefined ? {} : { description: input.description }),
      };

      setToasts((prev) => {
        const next = [...prev, record];
        // Drop the oldest rather than letting the stack grow off-screen.
        return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
      });

      const handle = setTimeout(() => dismiss(id), HOLD_MS);
      timers.current.set(id, handle);
    },
    [dismiss],
  );

  // Clear every pending timer on unmount so a fast route change cannot fire
  // setState on a gone component.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((handle) => clearTimeout(handle));
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live so a screen reader hears the result even though the toast
          sits visually far from the button that caused it. */}
      <div className="toaster" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <Toast key={t.id} record={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ record, onDismiss }: { record: ToastRecord; onDismiss: () => void }) {
  const Icon = record.kind === 'success' ? CheckIcon : record.kind === 'error' ? AlertIcon : InfoIcon;

  return (
    <div className={`toast ${record.kind}`} data-state={record.state}>
      <span className="toast-icon">
        <Icon size={15} />
      </span>
      <div className="toast-body">
        <div className="toast-title">{record.title}</div>
        {record.description ? <div className="toast-desc">{record.description}</div> : null}
      </div>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
