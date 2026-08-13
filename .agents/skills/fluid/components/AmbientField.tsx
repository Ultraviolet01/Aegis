import { useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

/** Ambient light field: a few large, soft brand-tinted blobs drifting slowly on
 *  additive blend behind a hero. Pure canvas, no deps. IntersectionObserver-paused
 *  offscreen, frozen on its first frame under reduced motion. Each blob's radial
 *  gradient is cached and rebuilt only on resize; the draw loop just translates it,
 *  so there is no per-frame gradient allocation.
 *
 *  Customise by passing `blobs`: each `c` is an "r,g,b" string (brand tint), x/y are
 *  0..1 anchor positions, ax/ay the drift amplitude, sx/sy the drift speed, r the
 *  radius as a fraction of the smaller canvas side. Defaults are a warm house set. */
type Blob = { c: string; x: number; y: number; ax: number; ay: number; sx: number; sy: number; r: number };

const DEFAULT_BLOBS: Blob[] = [
  { c: "125,26,134", x: 0.26, y: 0.34, ax: 0.1, ay: 0.08, sx: 0.00013, sy: 0.00017, r: 0.62 },
  { c: "225,29,42", x: 0.6, y: 0.3, ax: 0.12, ay: 0.1, sx: 0.00017, sy: 0.00011, r: 0.6 },
  { c: "255,77,28", x: 0.72, y: 0.6, ax: 0.09, ay: 0.11, sx: 0.00011, sy: 0.00019, r: 0.56 },
  { c: "31,170,117", x: 0.4, y: 0.72, ax: 0.08, ay: 0.07, sx: 0.00015, sy: 0.00013, r: 0.46 },
];

export function AmbientField({ blobs = DEFAULT_BLOBS, opacity = 0.55 }: { blobs?: Blob[]; opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = blobs.map((b) => ({ ...b, rad: 0, grad: null as CanvasGradient | null }));

    let raf = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const min = Math.min(canvas.clientWidth, canvas.clientHeight);
      for (const b of state) {
        b.rad = b.r * min;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, b.rad);
        g.addColorStop(0, `rgba(${b.c},0.16)`);
        g.addColorStop(1, `rgba(${b.c},0)`);
        b.grad = g;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const io = new IntersectionObserver((es) => (running = es[0].isIntersecting), { threshold: 0 });
    io.observe(canvas);

    const draw = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const b of state) {
        const cx = (b.x + Math.sin(t * b.sx) * b.ax) * w;
        const cy = (b.y + Math.cos(t * b.sy) * b.ay) * h;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = b.grad!;
        ctx.beginPath();
        ctx.arc(0, 0, b.rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    if (reduce) {
      draw(0);
      return () => {
        window.removeEventListener("resize", resize);
        io.disconnect();
      };
    }

    const loop = (now: number) => {
      if (running) draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      io.disconnect();
    };
  }, [reduce, blobs]);

  return <canvas ref={ref} aria-hidden="true" className="absolute inset-0 h-full w-full" style={{ opacity }} />;
}
