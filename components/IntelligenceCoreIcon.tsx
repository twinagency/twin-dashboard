"use client";

import { useEffect, useRef } from "react";

// Decorative compact version of the admin core's golden-angle particle globe.
// Deliberately has no assistant, microphone, navigation, or network behaviour.
const POINTS = Array.from({ length: 72 }, (_, i) => {
  const y = 1 - ((i + 0.5) / 72) * 2;
  const r = Math.sqrt(1 - y * y);
  const angle = i * Math.PI * (3 - Math.sqrt(5));
  return { x: Math.cos(angle) * r, y, z: Math.sin(angle) * r };
});

export default function IntelligenceCoreIcon() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const draw = (now: number) => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const size = 30;
      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const turn = motion.matches ? 0.4 : now * 0.0003;
      const points = POINTS.map(p => {
        const x = p.x * Math.cos(turn) - p.z * Math.sin(turn);
        const z = p.x * Math.sin(turn) + p.z * Math.cos(turn);
        return { x: 15 + x * 11, y: 15 + (p.y * 0.98 + z * 0.18) * 11, z };
      });
      const glow = ctx.createRadialGradient(15, 15, 1, 15, 15, 15);
      glow.addColorStop(0, "rgba(56,189,248,0.22)");
      glow.addColorStop(1, "rgba(37,99,235,0)");
      ctx.fillStyle = glow; ctx.fillRect(0, 0, size, size);
      points.forEach((p, i) => {
        points.slice(i + 1).forEach(q => {
          const distance = Math.hypot(p.x - q.x, p.y - q.y);
          if (distance > 4 || Math.abs(p.z - q.z) > 0.55) return;
          ctx.strokeStyle = `rgba(45,190,255,${0.09 + (p.z + q.z + 2) * 0.04})`;
          ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        });
        ctx.fillStyle = `rgba(${p.z > 0.25 ? "238,252,255" : "103,232,249"},${0.45 + (p.z + 1) * 0.25})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 0.4 + (p.z + 1) * 0.22, 0, Math.PI * 2); ctx.fill();
      });
      if (!motion.matches && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const restart = () => { cancelAnimationFrame(frame); if (!document.hidden) draw(performance.now()); };
    motion.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    restart();
    return () => { cancelAnimationFrame(frame); motion.removeEventListener("change", restart); document.removeEventListener("visibilitychange", restart); };
  }, []);
  return <canvas ref={ref} width={60} height={60} aria-hidden="true" className="pointer-events-none h-[30px] w-[30px] shrink-0" />;
}
