import { type MotionValue, useMotionValue } from "framer-motion";
import { useLenis } from "lenis/react";
import { createContext, useContext, type ReactNode } from "react";

type ScrollMotion = { velocity: MotionValue<number>; progress: MotionValue<number> };

const ScrollCtx = createContext<ScrollMotion | null>(null);

/** Shared scroll physics: one velocity + one progress value, fed by the single
 *  Lenis instance, that every ambient system subscribes to. The page breathes
 *  with one physics personality. Returns null if used outside the provider. */
export function useScrollMotion() {
  return useContext(ScrollCtx);
}

export function ScrollProvider({ children }: { children: ReactNode }) {
  const velocity = useMotionValue(0);
  const progress = useMotionValue(0);

  useLenis((lenis) => {
    velocity.set(lenis.velocity || 0);
    progress.set(lenis.progress || 0);
  });

  return <ScrollCtx.Provider value={{ velocity, progress }}>{children}</ScrollCtx.Provider>;
}
