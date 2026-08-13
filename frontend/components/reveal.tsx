'use client';

import type { ReactNode } from 'react';
import { useInView } from './hooks';

/**
 * Reveals its children once, when they scroll into view.
 *
 * Deliberately not applied to the hero: content above the fold uses `.reveal`,
 * which animates on mount, because a visitor should never arrive to a blank
 * screen waiting on an observer. This is for everything below it.
 *
 * `once: true` — the entrance plays a single time. Re-animating on every
 * scroll-back would turn reading the page into watching it.
 */
export function Reveal({
  children,
  className = '',
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ once: true, threshold: 0.12 });

  // Always a div: it is a motion wrapper, not a landmark. The semantic
  // element (`section`, `footer`) stays inside it where it belongs.
  return (
    <div ref={ref} id={id} className={`on-scroll ${className}`.trim()} data-in={inView}>
      {children}
    </div>
  );
}


