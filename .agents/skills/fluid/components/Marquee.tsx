import type { ReactNode } from "react";
import "./marquee.css";

/** Infinite marquee, the one correct use of `linear` easing. Duplicates its
 *  children once and translates the track from 0 to -50%, so the loop is
 *  seamless. Pauses on hover and freezes under prefers-reduced-motion (CSS).
 *  Good for logo walls and tickers; do not use for content the user must read. */
export function Marquee({
  children,
  durationSec = 30,
  className = "",
}: {
  children: ReactNode;
  durationSec?: number;
  className?: string;
}) {
  return (
    <div
      className={`fluid-marquee ${className}`}
      style={{ ["--fluid-marquee-duration" as string]: `${durationSec}s` }}
    >
      <div className="fluid-marquee__track">
        <div className="fluid-marquee__group">{children}</div>
        <div className="fluid-marquee__group" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
