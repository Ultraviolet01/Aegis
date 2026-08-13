'use client';

import { useEffect, useRef } from 'react';

/**
 * Continuous ambient background layer (fluid skill / PLR Studio reference).
 *
 * Sits as a single fixed layer behind the whole scrolling page.
 * Restrained mint/teal brand hues at low opacity. Slow, smooth GPU animation.
 * Respects prefers-reduced-motion (freezes on frame 0).
 */
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let t = 0;
    const render = () => {
      if (!reduced) t += 0.003;
      ctx.clearRect(0, 0, width, height);

      // Blob 1: Mint accent orb drifting top-right to center
      const x1 = width * 0.65 + Math.sin(t * 0.8) * 120;
      const y1 = height * 0.25 + Math.cos(t * 0.6) * 90;
      const r1 = Math.max(width, height) * 0.45;
      const g1 = ctx.createRadialGradient(x1, y1, 0, x1, y1, r1);
      g1.addColorStop(0, 'rgba(70, 224, 160, 0.12)');
      g1.addColorStop(0.5, 'rgba(30, 140, 100, 0.05)');
      g1.addColorStop(1, 'rgba(7, 9, 13, 0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, width, height);

      // Blob 2: Deep cyan/teal orb drifting bottom-left to center
      const x2 = width * 0.25 + Math.cos(t * 0.7) * 100;
      const y2 = height * 0.65 + Math.sin(t * 0.9) * 110;
      const r2 = Math.max(width, height) * 0.5;
      const g2 = ctx.createRadialGradient(x2, y2, 0, x2, y2, r2);
      g2.addColorStop(0, 'rgba(26, 120, 110, 0.09)');
      g2.addColorStop(0.6, 'rgba(15, 60, 55, 0.03)');
      g2.addColorStop(1, 'rgba(7, 9, 13, 0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, width, height);

      if (!reduced) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div className="ambient-bg-layer" aria-hidden="true">
      <canvas ref={canvasRef} className="ambient-canvas" />
    </div>
  );
}
