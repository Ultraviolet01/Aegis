'use client';

import { useEffect, useRef, useState } from 'react';

/* ==========================================================================
   Motion hooks
   --------------------------------------------------------------------------
   Everything here exists to make animation cheap to do correctly:
     - reduced motion is a first-class state, not an afterthought
     - nothing animates off-screen or in a hidden tab
     - interrupted animations retarget from where they are, they do not
       restart from the beginning
   ========================================================================== */

/**
 * Live `prefers-reduced-motion`.
 *
 * Starts `false` so server and client markup agree on first paint, then
 * corrects in an effect. Subscribed rather than read once, because the OS
 * setting can flip while the page is open.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** Is the tab actually being looked at. Used to park loops in the background. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}

/**
 * Is the element on screen.
 *
 * `once: true` disconnects after the first entry — that is the reveal case,
 * where re-animating on scroll-back is noise. `once: false` keeps reporting,
 * which is what a running loop needs so it can pause when scrolled past.
 */
export function useInView<T extends Element>(
  options: { once?: boolean; threshold?: number } = {},
) {
  const { once = false, threshold = 0.15 } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No observer (old browser, or a test environment): show everything
    // rather than leaving content invisible behind an animation that will
    // never run.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      // Slight bottom inset so a section reveals as it comes up into the
      // viewport rather than exactly at the edge.
      { threshold, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, threshold]);

  return [ref, inView] as const;
}

/**
 * True one painted frame after mount.
 *
 * The point is to let a CSS transition run on first appearance: render the
 * "from" state, let the browser paint it, then flip to the "to" state. Without
 * the extra frame the browser coalesces both into one paint and nothing moves.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setMounted(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, []);

  return mounted;
}

/**
 * Animate a number towards `target`.
 *
 * Used for the risk score, where the arc already sweeps in CSS and a snapping
 * digit next to a sweeping arc reads as a bug. Starts from 0 on mount so the
 * first appearance counts up.
 *
 * The easing approximates `--ease-out` (cubic-bezier(0.23, 1, 0.32, 1)) closely
 * enough that the digits and the arc stay visually locked over the same
 * duration. Interruption is handled by resuming from the current displayed
 * value rather than the previous target.
 */
export function useCountUp(target: number, duration = 620): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  /** Where the next run starts from — the live displayed value. */
  const current = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      current.current = target;
      setValue(target);
      return;
    }

    const origin = current.current;
    if (origin === target) return;

    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const next = origin + (target - origin) * eased;
      current.current = next;
      setValue(next);

      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        current.current = target;
        setValue(target);
        frame.current = null;
      }
    };

    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [target, duration, reduced]);

  return value;
}
