'use client';

import { useEffect, useState } from 'react';
import { bpsToPercent, detectedFields, parsePolicy, segmentPolicy } from '@/lib/policy';
import { ArrowRightIcon, PenIcon, ShieldCheckIcon } from './icons';
import { useDocumentVisible, useInView, usePrefersReducedMotion } from './hooks';

/**
 * The landing page's one moving picture.
 *
 * A cold visitor should see the core mechanic happen, not read a description
 * of it. So this types a real policy sentence a character at a time and runs
 * the REAL parser on every keystroke — the same `parsePolicy` and
 * `segmentPolicy` the composer uses. The highlights light up as the phrases
 * complete, and the on-chain numbers resolve underneath. Nothing here is a
 * mockup or a hardcoded frame; if the parser changes, this changes with it.
 *
 * Rules it obeys:
 *   - never runs off-screen (IntersectionObserver) or in a hidden tab
 *   - under `prefers-reduced-motion` it renders the finished state of the
 *     first example and stops — the content is still there, the motion is not
 *   - typing is cancellable at any point; every timer is cleared on unmount
 */

const SCRIPT = [
  'If SPYX drops more than 8%, move 50% to USDC.',
  'Cautious: exit 30% on a 5% drawdown or 1% oracle deviation.',
  'If GLDX falls 12%, move 75% to USDC immediately.',
];

/** Per-character typing speed. Fast enough to feel deliberate, not frantic. */
const TYPE_MS = 42;
/** Hold on the completed sentence so the parsed values can be read. */
const HOLD_MS = 2600;
/** Deleting is faster than typing — nobody needs to watch an erase. */
const ERASE_MS = 16;
/** Beat between clearing and starting the next sentence. */
const GAP_MS = 420;

type Phase = 'typing' | 'holding' | 'erasing';

export function PolicyDemo() {
  const reduced = usePrefersReducedMotion();
  const visible = useDocumentVisible();
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25 });

  const [line, setLine] = useState(0);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<Phase>('typing');

  const full = SCRIPT[line] ?? SCRIPT[0]!;

  // Reduced motion: skip straight to a finished sentence, once.
  useEffect(() => {
    if (!reduced) return;
    setCount(SCRIPT[0]!.length);
    setPhase('holding');
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    // Park the loop entirely when nobody can see it. No timers, no parsing,
    // no wasted battery on a backgrounded tab.
    if (!inView || !visible) return;

    let handle: ReturnType<typeof setTimeout>;

    if (phase === 'typing') {
      if (count < full.length) {
        handle = setTimeout(() => setCount((c) => c + 1), TYPE_MS);
      } else {
        handle = setTimeout(() => setPhase('holding'), HOLD_MS);
      }
    } else if (phase === 'holding') {
      handle = setTimeout(() => setPhase('erasing'), 60);
    } else {
      if (count > 0) {
        handle = setTimeout(() => setCount((c) => Math.max(0, c - 2)), ERASE_MS);
      } else {
        handle = setTimeout(() => {
          setLine((l) => (l + 1) % SCRIPT.length);
          setPhase('typing');
        }, GAP_MS);
      }
    }

    return () => clearTimeout(handle);
  }, [phase, count, full, inView, visible, reduced]);

  const text = full.slice(0, count);
  const segments = segmentPolicy(text);
  const parsed = parsePolicy(text);
  const detected = detectedFields(text);

  // Only claim a value is "read" once the sentence is complete enough to have
  // produced it — before that the preview would be showing defaults as if the
  // user had asked for them.
  const settled = count === full.length;

  return (
    <div className="demo" ref={ref}>
      <div className="demo-head">
        <span className="demo-label">
          <PenIcon size={12} /> You write
        </span>
        <span className="demo-label">
          <ArrowRightIcon size={12} /> Aegis signs on-chain
        </span>
      </div>

      <div className="demo-body">
        <p className="demo-text">
          {segments.map((segment, index) =>
            segment.field ? (
              <mark key={index} data-field={segment.field}>
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
          {/* The caret is the only thing that blinks, and only while typing. */}
          {!reduced ? <span className="demo-caret" data-idle={phase !== 'typing'} /> : null}
        </p>

        <div className="demo-out" data-settled={settled}>
          <DemoValue
            field="drawdown"
            label="Drawdown"
            value={bpsToPercent(parsed.drawdownThresholdBps)}
            detected={detected.drawdown}
          />
          <DemoValue
            field="deviation"
            label="Deviation"
            value={bpsToPercent(parsed.oracleDeviationThresholdBps)}
            detected={detected.deviation}
          />
          <DemoValue
            field="exit"
            label="Exit"
            value={bpsToPercent(parsed.exitPercentBps)}
            detected={detected.exit}
          />
          <DemoValue
            field="mode"
            label="Mode"
            value={parsed.mode}
            detected={detected.mode}
          />
        </div>
      </div>

      <div className="demo-foot">
        <ShieldCheckIcon size={13} />
        <span>
          Parsed in your browser, signed by you. The agent can never write this policy —{' '}
          <code>setPolicy</code> is owner-only.
        </span>
      </div>
    </div>
  );
}

function DemoValue({
  field,
  label,
  value,
  detected,
}: {
  field: string;
  label: string;
  value: string;
  detected: boolean;
}) {
  return (
    <div className="demo-value" data-field={field} data-detected={detected}>
      <span className="demo-value-label">
        {label} {!detected ? <span className="demo-default-tag">(default)</span> : null}
      </span>
      {/* Keyed by value so React remounts the span on change and the settle
          animation replays — a transition alone would not restart. */}
      <span key={value} className="demo-value-num num">
        {value}
      </span>
    </div>
  );
}
