import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/** The default way to bring a section in: fade up on scroll into view, once.
 *  Expo-out curve (strong but smooth), 24px rise. Under reduced motion,
 *  framer-motion's whileInView still resolves to the visible state, and the
 *  curve is short enough that this stays comfortable; for full stillness wrap
 *  in a reduced-motion check at the call site if needed. */
const variants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
