import { motion, useReducedMotion } from "framer-motion";
import { useScrollMotion } from "./ScrollContext";

/** Thin reading-progress hairline fixed at the very top. Reuses the single
 *  shared Lenis progress value, so it costs no extra scroll work. Decorative,
 *  aria-hidden. Ration the brand: a 2px gradient hairline, not a thick bar.
 *  Pass any CSS gradient via `gradient`. */
export function ScrollProgress({ gradient = "linear-gradient(90deg, #7d1a86, #ff4d1c)" }: { gradient?: string }) {
  const sm = useScrollMotion();
  const reduce = useReducedMotion();
  if (!sm) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[55] h-[2px] origin-left"
      style={{ scaleX: sm.progress, opacity: reduce ? 0.55 : 0.85, backgroundImage: gradient }}
    />
  );
}
