"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TwinPanel from "./TwinPanel";

type CoreState = "idle" | "listening" | "processing" | "speaking" | "learning";

type Particle = {
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
  cluster: number;
};

type NeuralLink = {
  a: number;
  b: number;
  phase: number;
};

const STATE_LABELS: Record<CoreState, string> = {
  idle: "Ready",
  listening: "Listening",
  processing: "Processing",
  speaking: "Speaking",
  learning: "Learning",
};

function makeNeuralSphere(count: number) {
  const particles: Particle[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i += 1) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    particles.push({
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
      size: 0.6 + ((i * 17) % 11) / 10,
      phase: ((i * 29) % 101) / 101,
      cluster: i % 7,
    });
  }

  const links: NeuralLink[] = [];
  const used = new Set<string>();
  particles.forEach((particle, index) => {
    const nearest = particles
      .map((other, otherIndex) => ({
        otherIndex,
        distance:
          (particle.x - other.x) ** 2 +
          (particle.y - other.y) ** 2 +
          (particle.z - other.z) ** 2,
      }))
      .filter(({ otherIndex }) => otherIndex !== index)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, index % 5 === 0 ? 5 : 4);

    nearest.forEach(({ otherIndex }) => {
      const a = Math.min(index, otherIndex);
      const b = Math.max(index, otherIndex);
      const key = `${a}:${b}`;
      if (used.has(key)) return;
      used.add(key);
      links.push({ a, b, phase: ((a * 13 + b * 31) % 97) / 97 });
    });
  });

  return { particles, links };
}

const SPHERE = makeNeuralSphere(216);

export default function TwinAssistant() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<CoreState>("idle");
  const hoverRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0 });
  const audioLevelRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const typingPulsesRef = useRef<number[]>([]);
  const typingEnergyRef = useRef(0);
  const typingActiveUntilRef = useRef(0);
  const typingStatusTimerRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const [state, setState] = useState<CoreState>("idle");
  const [hovered, setHovered] = useState(false);
  // 2026-07-31: the orb used to carry its own input box, mic button, voice
  // toggle and two-line transcript right here in the sidebar. None of it was
  // connected to anything - `submit` replied with a hardcoded "I am here. Your
  // message has reached the Twin intelligence core." and the mic only fed the
  // particle animation. The real assistant now lives in TwinPanel, which the
  // orb opens, so all of that came out rather than sitting next to a working
  // one looking equally real.
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    hoverRef.current = hovered;
  }, [hovered]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const stopListening = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    analyserRef.current = null;
    analyserDataRef.current = null;
    audioLevelRef.current = 0;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      stopListening();
      if (typingStatusTimerRef.current) window.clearTimeout(typingStatusTimerRef.current);
      window.speechSynthesis?.cancel();
    };
  }, [clearTimers, stopListening]);

  useEffect(() => {
    let learningTimer = 0;
    let resetTimer = 0;

    const schedule = () => {
      learningTimer = window.setTimeout(() => {
        if (stateRef.current === "idle" && !hoverRef.current) {
          setState("learning");
          resetTimer = window.setTimeout(() => {
            if (stateRef.current === "learning") setState("idle");
            schedule();
          }, 2600);
        } else {
          schedule();
        }
      }, 12000 + Math.random() * 8000);
    };

    schedule();
    return () => {
      window.clearTimeout(learningTimer);
      window.clearTimeout(resetTimer);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let previous = performance.now();
    let rotation = 0;
    let smoothLevel = 0;
    let width = 220;
    let height = 176;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const render = (now: number) => {
      const delta = Math.min(32, now - previous);
      previous = now;
      const mode = stateRef.current;

      if (mode === "listening" && analyserRef.current && analyserDataRef.current) {
        analyserRef.current.getByteFrequencyData(analyserDataRef.current);
        const data = analyserDataRef.current;
        let total = 0;
        const usable = Math.min(data.length, 72);
        for (let i = 3; i < usable; i += 1) total += data[i];
        const raw = total / Math.max(1, usable - 3) / 255;
        audioLevelRef.current = raw;
      }

      const speakingLevel = mode === "speaking"
        ? 0.28 + Math.abs(Math.sin(now * 0.011)) * 0.42 + Math.abs(Math.sin(now * 0.027)) * 0.16
        : 0;
      const targetLevel = mode === "listening" ? audioLevelRef.current : speakingLevel;
      smoothLevel += (targetLevel - smoothLevel) * (mode === "listening" ? 0.16 : 0.1);
      const typingTarget = now < typingActiveUntilRef.current ? 1 : 0;
      typingEnergyRef.current += (typingTarget - typingEnergyRef.current) * (typingTarget ? 0.2 : 0.07);
      const typingEnergy = typingEnergyRef.current;

      const speed = mode === "processing" ? 0.00062 : mode === "learning" ? 0.0004 : 0.00018;
      rotation += delta * speed * (reducedMotion ? 0.35 : 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height * 0.47;
      const baseRadius = Math.min(width * 0.355, height * 0.42);
      const breathe = reducedMotion ? 1 : 1 + Math.sin(now * 0.0018) * 0.018;
      const hoverScale = hoverRef.current ? 1.045 : 1;
      const listeningBreath = mode === "listening"
        ? 0.02 + Math.abs(Math.sin(now * 0.007)) * 0.045 + smoothLevel * 0.105
        : smoothLevel * 0.075;
      const typingBreath = typingEnergy * (0.018 + Math.abs(Math.sin(now * 0.011)) * 0.048);
      const reactiveScale = 1 + listeningBreath + typingBreath;
      const processScale = mode === "processing" ? 1 + Math.sin(now * 0.008) * 0.018 : 1;
      const radius = baseRadius * breathe * hoverScale * reactiveScale * processScale;
      const pointerYaw = pointerRef.current.x * (hoverRef.current ? 0.25 : 0.06);
      const pointerPitch = pointerRef.current.y * (hoverRef.current ? 0.19 : 0.04);
      const tilt = -0.16 + pointerPitch;

      const glow = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius * 1.28);
      glow.addColorStop(0, `rgba(224, 247, 255, ${0.08 + smoothLevel * 0.13})`);
      glow.addColorStop(0.33, `rgba(56, 189, 248, ${0.065 + smoothLevel * 0.08})`);
      glow.addColorStop(0.66, "rgba(37, 99, 235, 0.03)");
      glow.addColorStop(1, "rgba(2, 12, 34, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
      ctx.fill();

      const core = ctx.createRadialGradient(
        cx - radius * 0.24,
        cy - radius * 0.3,
        radius * 0.04,
        cx,
        cy,
        radius * 1.04,
      );
      core.addColorStop(0, "rgba(18, 71, 116, 0.16)");
      core.addColorStop(0.42, "rgba(7, 39, 82, 0.1)");
      core.addColorStop(0.78, "rgba(3, 23, 55, 0.05)");
      core.addColorStop(0.96, "rgba(2, 14, 38, 0.015)");
      core.addColorStop(1, "rgba(2, 12, 34, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.04, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.01, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const ringEnergy = mode === "processing" ? 1.7 : mode === "listening" || mode === "speaking" ? 1.35 : 1;
      [
        { rx: 1.18, ry: 0.38, angle: -0.44, speed: 0.018, alpha: 0.16 },
        { rx: 1.08, ry: 0.56, angle: 0.58, speed: -0.011, alpha: 0.11 },
        { rx: 0.98, ry: 0.72, angle: -1.02, speed: 0.008, alpha: 0.08 },
      ].forEach((ring, index) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ring.angle + pointerYaw * 0.2);
        ctx.setLineDash(index === 1 ? [1.5, 5.5] : [3, 7]);
        ctx.lineDashOffset = now * ring.speed;
        ctx.strokeStyle = `rgba(103, 232, 249, ${ring.alpha * ringEnergy})`;
        ctx.lineWidth = index === 0 ? 0.7 : 0.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * ring.rx, radius * ring.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      const cosY = Math.cos(rotation + pointerYaw);
      const sinY = Math.sin(rotation + pointerYaw);
      const cosX = Math.cos(tilt);
      const sinX = Math.sin(tilt);
      const projected = SPHERE.particles.map((particle) => {
        const drift = reducedMotion ? 1 : 1 + Math.sin(now * 0.0014 + particle.phase * 12) * 0.022;
        const px = particle.x * drift;
        const py = particle.y * drift;
        const pz = particle.z * drift;
        const x1 = px * cosY - pz * sinY;
        const z1 = px * sinY + pz * cosY;
        const y2 = py * cosX - z1 * sinX;
        const z2 = py * sinX + z1 * cosX;
        const perspective = 1 / (1.14 - z2 * 0.22);
        return {
          x: cx + x1 * radius * perspective,
          y: cy + y2 * radius * perspective,
          z: z2,
          perspective,
          particle,
        };
      });

      const baseModeEnergy = mode === "processing" ? 1.9 : mode === "learning" ? 1.65 : mode === "listening" || mode === "speaking" ? 1.3 + smoothLevel : hoverRef.current ? 1.18 : 1;
      const modeEnergy = baseModeEnergy + typingEnergy * 0.65;
      const activeCluster = Math.floor((now / 900) % 7);

      SPHERE.links.forEach((link) => {
        const a = projected[link.a];
        const b = projected[link.b];
        const depth = Math.max(0.12, (a.z + b.z + 2) / 4);
        const activity = (Math.sin(now * (mode === "processing" ? 0.007 : 0.0024) + link.phase * 20) + 1) / 2;
        const clusterOn = mode === "learning" && (a.particle.cluster === activeCluster || b.particle.cluster === activeCluster);
        const neuralFlash = mode === "processing" && activity > 0.82;
        const alpha = Math.min(0.86, (0.15 + depth * 0.2) * modeEnergy + (clusterOn ? 0.3 : 0) + (neuralFlash ? 0.24 : 0));
        ctx.strokeStyle = neuralFlash || clusterOn
          ? `rgba(224, 247, 255, ${alpha})`
          : `rgba(45, 190, 255, ${alpha})`;
        ctx.lineWidth = neuralFlash || clusterOn ? 0.95 : 0.62;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      projected.forEach(({ x, y, z, perspective, particle }) => {
        const depth = Math.max(0.25, (z + 1.2) / 2.2);
        const clusterOn = mode === "learning" && particle.cluster === activeCluster;
        const pulse = mode === "processing" ? 0.55 + Math.abs(Math.sin(now * 0.006 + particle.phase * 18)) * 0.75 : 1;
        const size = particle.size * perspective * depth * pulse * (clusterOn ? 1.8 : 1);
        ctx.fillStyle = clusterOn
          ? "rgba(236, 254, 255, 0.98)"
          : `rgba(${z > 0.25 ? "238, 252, 255" : "103, 232, 249"}, ${Math.min(0.95, 0.38 + depth * 0.56)})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.62, size * 1.08), 0, Math.PI * 2);
        ctx.fill();
      });

      typingPulsesRef.current = typingPulsesRef.current.filter((started) => now - started < 1000);
      typingPulsesRef.current.forEach((started, index) => {
        const progress = Math.min(1, (now - started) / 1000);
        const eased = 1 - (1 - progress) ** 3;
        const startY = height + 5;
        const x = cx + Math.sin(progress * Math.PI * 2 + index) * (1 - progress) * 18;
        const y = startY + (cy - startY) * eased;
        ctx.fillStyle = `rgba(224, 247, 255, ${1 - progress})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.8 - progress * 0.7, 0, Math.PI * 2);
        ctx.fill();
      });

      for (let i = 0; i < 22; i += 1) {
        const dustX = ((i * 47 + now * 0.004 * ((i % 3) + 1)) % (width + 20)) - 10;
        const dustY = ((i * 31 + Math.sin(now * 0.0008 + i) * 12) % height + height) % height;
        ctx.fillStyle = `rgba(186, 230, 253, ${0.05 + (i % 4) * 0.018})`;
        ctx.fillRect(dustX, dustY, 0.65, 0.65);
      }

      ctx.restore();
      frame = window.requestAnimationFrame(render);
    };

    frame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const displayLabel = state !== "idle" ? STATE_LABELS[state] : panelOpen ? "Open" : hovered ? "Aware" : STATE_LABELS.idle;

  return (
    <section className="w-full px-1 pb-1" aria-label="Twin AI assistant">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="block h-[176px] w-full touch-none cursor-pointer drop-shadow-[0_0_18px_rgba(56,189,248,0.34)] transition-transform duration-300 hover:scale-[1.03] [@media(max-height:850px)]:h-[148px]"
          aria-label={`Open Twin assistant. Intelligence core, ${displayLabel.toLowerCase()}`}
          role="button"
          tabIndex={0}
          onClick={() => setPanelOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setPanelOpen(true);
            }
          }}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => {
            setHovered(false);
            pointerRef.current = { x: 0, y: 0 };
          }}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            pointerRef.current = {
              x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
              y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
            };
          }}
        />
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink/60"
        >
          <span
            className={
              "h-1.5 w-1.5 rounded-full shadow-[0_0_8px_currentColor] " +
              (state === "listening"
                ? "animate-pulse bg-cyan-500 text-cyan-500"
                : state === "processing"
                  ? "animate-pulse bg-blue-600 text-blue-600"
                  : state === "speaking"
                    ? "animate-pulse bg-sky-400 text-sky-400"
                    : state === "learning"
                      ? "animate-pulse bg-violet-500 text-violet-500"
                      : "bg-good text-good")
            }
          />
          {displayLabel}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="mt-1 w-full rounded-lg py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink/45 transition hover:text-ink/70"
      >
        {panelOpen ? "Twin is open" : "Tap to talk"}
      </button>

      <TwinPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </section>
  );
}
