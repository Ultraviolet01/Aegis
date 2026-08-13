import { motion, useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";

/** Per-digit rolling odometer (fuel-pump / exchange-board feel). Each digit is
 *  a 0-9 column that springs to its final value on scroll into view. Locale-aware
 *  grouping, tabular figures, reduced-motion safe (snaps to final, no roll).
 *  Pass `locale` (e.g. "fr-FR", "en-US") for thousands grouping, or `plain` to
 *  render the raw number with no grouping. */
function Digit({ d, active, delay, reduce }: { d: number; active: boolean; delay: number; reduce: boolean }) {
  return (
    <span className="relative inline-block overflow-hidden" style={{ height: "1em", width: "0.62em", verticalAlign: "baseline" }}>
      <motion.span
        className="absolute left-0 top-0 flex flex-col"
        initial={{ y: 0 }}
        animate={{ y: active ? `-${d}em` : 0 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 20, delay }}
      >
        {Array.from({ length: 10 }).map((_, n) => (
          <span key={n} className="block text-center" style={{ height: "1em", lineHeight: "1em" }}>
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export function Odometer({
  to,
  locale = "en-US",
  plain = false,
  className,
}: {
  to: number;
  locale?: string;
  plain?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15%" });
  const reduce = useReducedMotion() ?? false;
  const str = plain ? String(to) : new Intl.NumberFormat(locale).format(to);

  let di = 0;
  return (
    <span ref={ref} className={`inline-flex items-baseline tabular-nums ${className ?? ""}`}>
      {[...str].map((ch, i) => {
        if (/\d/.test(ch)) {
          const delay = di++ * 0.06;
          return <Digit key={i} d={Number(ch)} active={inView} delay={delay} reduce={reduce} />;
        }
        return (
          <span key={i} className="inline-block">
            {ch}
          </span>
        );
      })}
    </span>
  );
}
