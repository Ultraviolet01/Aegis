import { ReactLenis } from "lenis/react";
import { useEffect, useState, type ReactNode } from "react";
import { ScrollProvider } from "./ScrollContext";

/** Weighted inertial smooth-scroll. The single biggest lever for the premium
 *  "award-site" feel. Exposes one shared velocity/progress to the whole page
 *  (via ScrollProvider). Honours prefers-reduced-motion: the inertial physics
 *  is disabled and the page falls back to native scroll for users who opted out. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  // SSR-safe: start "not reduced" (matches server render), resolve on mount.
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const options = reduce
    ? { lerp: 1, duration: 0, smoothWheel: false, wheelMultiplier: 1 }
    : { lerp: 0.09, duration: 1.1, wheelMultiplier: 0.9 };

  return (
    // key forces a clean re-init of the Lenis instance if the preference flips.
    <ReactLenis root key={reduce ? "reduced" : "smooth"} options={options}>
      <ScrollProvider>{children}</ScrollProvider>
    </ReactLenis>
  );
}
