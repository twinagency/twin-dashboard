"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AudioLines, Maximize2, Mic, MicOff, Send, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { useRouter } from "next/navigation";

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

type Satellite = {
  angle: number;
  distance: number;
  elevation: number;
  phase: number;
  size: number;
  speed: number;
};

type TranscriptLine = {
  role: "You" | "Twin";
  text: string;
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

const SATELLITES: Satellite[] = Array.from({ length: 14 }, (_, index) => ({
  angle: (index / 14) * Math.PI * 2 + ((index * 7) % 5) * 0.11,
  distance: 1.38 + ((index * 13) % 7) * 0.12,
  elevation: Math.sin(index * 2.17) * 0.72,
  phase: ((index * 37) % 101) / 101,
  size: 0.1 + ((index * 11) % 5) * 0.012,
  speed: (index % 2 === 0 ? 1 : -1) * (0.000035 + (index % 4) * 0.000009),
}));

type TwinAssistantProps = {
  variant?: "sidebar" | "mobile-dock";
};

export default function TwinAssistant({ variant = "sidebar" }: TwinAssistantProps) {
  const router = useRouter();
  const mobileDock = variant === "mobile-dock";
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
  const interactionPulsesRef = useRef<number[]>([]);
  const typingEnergyRef = useRef(0);
  const typingActiveUntilRef = useRef(0);
  const typingStatusTimerRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const [state, setState] = useState<CoreState>("idle");
  const [hovered, setHovered] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [input, setInput] = useState("");
  const [typingActive, setTypingActive] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const expandedRef = useRef(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    hoverRef.current = hovered;
  }, [hovered]);

  useEffect(() => {
    expandedRef.current = expanded;
    if (!expanded) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

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
    let expansion = 0;
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
      expansion += ((expandedRef.current ? 1 : 0) - expansion) * (reducedMotion ? 0.22 : 0.075);

      const speed = mode === "processing" ? 0.00062 : mode === "learning" ? 0.0004 : 0.00018;
      rotation += delta * speed * (reducedMotion ? 0.35 : 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height * (0.47 + expansion * 0.015);
      const compactRadius = Math.min(width * 0.345, height * 0.405);
      const fieldRadius = Math.min(width * 0.205, height * 0.27);
      const baseRadius = compactRadius + (fieldRadius - compactRadius) * expansion;
      const breathe = reducedMotion ? 1 : 1 + Math.sin(now * 0.0018) * 0.018;
      const hoverScale = hoverRef.current ? 1.055 : 1;
      const listeningBreath = mode === "listening"
        ? 0.02 + Math.abs(Math.sin(now * 0.007)) * 0.045 + smoothLevel * 0.105
        : smoothLevel * 0.075;
      const typingBreath = typingEnergy * (0.018 + Math.abs(Math.sin(now * 0.011)) * 0.048);
      const reactiveScale = 1 + listeningBreath + typingBreath;
      const processScale = mode === "processing" ? 1 + Math.sin(now * 0.008) * 0.018 : 1;
      const radius = baseRadius * breathe * hoverScale * reactiveScale * processScale;
      const pointerYaw = pointerRef.current.x * (hoverRef.current ? 0.28 + expansion * 0.16 : 0.06);
      const pointerPitch = pointerRef.current.y * (hoverRef.current ? 0.2 + expansion * 0.1 : 0.04);
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

      // A slow scanning plane makes the core feel volumetric rather than like a flat spinner.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const scanY = cy - radius + ((now * 0.035) % (radius * 2));
      const scanWidth = Math.sqrt(Math.max(0, radius ** 2 - (scanY - cy) ** 2));
      const scanGradient = ctx.createLinearGradient(cx - scanWidth, scanY, cx + scanWidth, scanY);
      scanGradient.addColorStop(0, "rgba(56, 189, 248, 0)");
      scanGradient.addColorStop(0.5, `rgba(224, 247, 255, ${0.14 + expansion * 0.13})`);
      scanGradient.addColorStop(1, "rgba(56, 189, 248, 0)");
      ctx.strokeStyle = scanGradient;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx - scanWidth, scanY);
      ctx.lineTo(cx + scanWidth, scanY);
      ctx.stroke();
      ctx.restore();

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

      // White-hot glints and short electrical arcs keep the compact sidebar
      // core alive even when it is resting. They deliberately hug the shell
      // so the center remains clean and readable as a particle globe.
      if (!expandedRef.current) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let glint = 0; glint < 5; glint += 1) {
          const angle = rotation * (glint % 2 === 0 ? 1.4 : -1.1) + glint * 2.17;
          const glintX = cx + Math.cos(angle) * radius * (0.72 + (glint % 3) * 0.08);
          const glintY = cy + Math.sin(angle) * radius * (0.72 + (glint % 3) * 0.08);
          const glintPulse = 0.32 + Math.abs(Math.sin(now * 0.0028 + glint * 1.9)) * 0.42;
          const glintRadius = 2.4 + glintPulse * 3.4;
          const whiteGlow = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, glintRadius);
          whiteGlow.addColorStop(0, `rgba(255, 255, 255, ${glintPulse * 0.82})`);
          whiteGlow.addColorStop(0.2, `rgba(224, 247, 255, ${glintPulse * 0.62})`);
          whiteGlow.addColorStop(1, "rgba(56, 189, 248, 0)");
          ctx.fillStyle = whiteGlow;
          ctx.beginPath();
          ctx.arc(glintX, glintY, glintRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        for (let bolt = 0; bolt < 3; bolt += 1) {
          const life = (now * 0.00042 + bolt * 0.31) % 1;
          const boltAlpha = Math.sin(life * Math.PI) * (0.28 + (bolt % 2) * 0.14);
          if (boltAlpha < 0.05) continue;
          const startAngle = rotation * (bolt % 2 === 0 ? 1.6 : -1.25) + bolt * 2.11 + life * 0.42;
          const arcSpan = 0.5 + bolt * 0.12;
          const segments = 8;
          const drawBolt = (lineWidth: number, alpha: number, rgb: string) => {
            ctx.strokeStyle = `rgba(${rgb}, ${alpha * boltAlpha})`;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            for (let segment = 0; segment <= segments; segment += 1) {
              const t = segment / segments;
              const angle = startAngle + arcSpan * t;
              const jitter = segment === 0 || segment === segments
                ? 0
                : Math.sin(now * 0.026 + bolt * 17 + segment * 9.4) * radius * 0.055;
              const boltRadius = radius * (1.01 + Math.sin(t * Math.PI) * 0.08) + jitter;
              const x = cx + Math.cos(angle) * boltRadius;
              const y = cy + Math.sin(angle) * boltRadius;
              if (segment === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          };
          drawBolt(3.2, 0.2, "56, 189, 248");
          drawBolt(0.82, 0.94, "248, 254, 255");
        }
        ctx.restore();
      }

      // In field mode the single intelligence core unfolds into a constellation
      // of smaller atomic systems, echoing a physical hologram being pulled apart.
      const satelliteAlpha = Math.min(1, 0.08 + expansion * 0.9 + (hoverRef.current ? 0.08 : 0));
      const spread = 0.28 + expansion * 0.94;
      SATELLITES.forEach((satellite) => {
        const angle = satellite.angle + now * satellite.speed + pointerYaw * 0.18;
        const distance = radius * satellite.distance * spread;
        const depth = (Math.sin(angle * 1.3 + satellite.phase * 8) + 1) / 2;
        const sx = cx + Math.cos(angle) * distance;
        const sy = cy + Math.sin(angle) * distance * 0.58 + satellite.elevation * radius * spread * 0.58;
        const nodeRadius = Math.max(4, radius * satellite.size * (0.72 + depth * 0.38));
        const pulse = 0.55 + Math.abs(Math.sin(now * 0.0032 + satellite.phase * 14)) * 0.45;

        ctx.strokeStyle = `rgba(45, 190, 255, ${satelliteAlpha * (0.09 + depth * 0.16)})`;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * radius * 0.84, cy + Math.sin(angle) * radius * 0.32);
        ctx.quadraticCurveTo((cx + sx) / 2, cy + satellite.elevation * radius * 0.24, sx, sy);
        ctx.stroke();

        const nodeGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, nodeRadius * 2.7);
        nodeGlow.addColorStop(0, `rgba(239, 254, 255, ${satelliteAlpha * 0.9})`);
        nodeGlow.addColorStop(0.18, `rgba(34, 211, 238, ${satelliteAlpha * 0.5})`);
        nodeGlow.addColorStop(1, "rgba(14, 116, 144, 0)");
        ctx.fillStyle = nodeGlow;
        ctx.beginPath();
        ctx.arc(sx, sy, nodeRadius * 2.7, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle * 0.7);
        ctx.strokeStyle = `rgba(165, 243, 252, ${satelliteAlpha * (0.34 + pulse * 0.3)})`;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.ellipse(0, 0, nodeRadius * 1.85, nodeRadius * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.rotate(1.04);
        ctx.beginPath();
        ctx.ellipse(0, 0, nodeRadius * 1.55, nodeRadius * 0.52, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(240, 253, 255, ${satelliteAlpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1, nodeRadius * 0.16 * pulse), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        const transfer = (now * 0.00022 + satellite.phase) % 1;
        const tx = cx + (sx - cx) * transfer;
        const ty = cy + (sy - cy) * transfer;
        ctx.fillStyle = `rgba(224, 247, 255, ${satelliteAlpha * Math.sin(transfer * Math.PI) * 0.85})`;
        ctx.beginPath();
        ctx.arc(tx, ty, 0.8 + depth * 0.8, 0, Math.PI * 2);
        ctx.fill();
      });

      interactionPulsesRef.current = interactionPulsesRef.current.filter((started) => now - started < 1250);
      interactionPulsesRef.current.forEach((started) => {
        const progress = Math.min(1, (now - started) / 1250);
        ctx.strokeStyle = `rgba(103, 232, 249, ${(1 - progress) * 0.58})`;
        ctx.lineWidth = 1.2 - progress * 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (0.52 + progress * (1.9 + expansion)), 0, Math.PI * 2);
        ctx.stroke();
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
  }, [expanded, portalReady]);

  const toggleListening = useCallback(async () => {
    if (stateRef.current === "listening") {
      stopListening();
      setState("idle");
      return;
    }

    clearTimers();
    window.speechSynthesis?.cancel();
    stopListening();

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextClass = window.AudioContext;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      micStreamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      analyserDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      setState("listening");
    } catch {
      setTranscript((lines) => [...lines.slice(-1), { role: "Twin", text: "Microphone access is needed for listening mode." }]);
      setState("idle");
    }
  }, [clearTimers, stopListening]);

  const speakResponse = useCallback((text: string) => {
    setState("speaking");
    if (voiceMode && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.96;
      utterance.pitch = 0.92;
      utterance.volume = 0.82;
      utterance.onend = () => setState("idle");
      utterance.onerror = () => setState("idle");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return;
    }

    const timer = window.setTimeout(() => setState("idle"), 1800);
    timersRef.current.push(timer);
  }, [voiceMode]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message) return;

    clearTimers();
    stopListening();
    window.speechSynthesis?.cancel();
    setTranscript((lines) => [...lines.slice(-2), { role: "You", text: message }]);
    setInput("");
    setTypingActive(false);
    typingActiveUntilRef.current = 0;
    setState("processing");

    const response = "I am here. Your message has reached the Twin intelligence core.";
    const timer = window.setTimeout(() => {
      setTranscript((lines) => [...lines.slice(-2), { role: "Twin", text: response }]);
      speakResponse(response);
    }, 1350);
    timersRef.current.push(timer);
  };

  const displayLabel = state !== "idle" ? STATE_LABELS[state] : typingActive ? "Receiving" : hovered ? "Aware" : STATE_LABELS.idle;

  const assistant = (
    <section
      className={
        mobileDock
          ? "fixed bottom-1 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center lg:hidden"
          : expanded
          ? "fixed inset-0 z-[100] flex items-center justify-center bg-[#020914]/78 p-4 backdrop-blur-md sm:p-8"
          : "w-full px-1 pb-1"
      }
      aria-label={mobileDock ? "Ask TI" : "Twin AI assistant"}
      aria-modal={!mobileDock && expanded ? true : undefined}
      role={!mobileDock && expanded ? "dialog" : undefined}
    >
      {mobileDock ? (
        <div
          className="pointer-events-none mb-[-7px] text-[15px] font-bold tracking-[-0.025em] text-[#0d2540] drop-shadow-[0_1px_8px_rgba(255,255,255,0.9)]"
          style={{ fontFamily: "var(--font-display), var(--font-sans), sans-serif" }}
        >
          Ask TI
        </div>
      ) : null}
      <div
        className={
          mobileDock
            ? "w-[118px]"
            : expanded
            ? "relative w-full max-w-[820px] overflow-hidden rounded-[30px] border border-cyan-300/25 bg-[#031324]/95 p-4 shadow-[0_0_100px_rgba(14,165,233,0.24),inset_0_0_80px_rgba(8,145,178,0.08)] sm:p-6"
            : "w-full"
        }
      >
        {expanded ? (
          <div className="flex items-center justify-between px-1 pb-2 text-cyan-50">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/70">
                <Sparkles className="h-3.5 w-3.5" />
                Twin neural field
              </div>
              <p className="mt-1 text-xs text-cyan-100/45">Move through the field · tap the core to send an impulse</p>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-100/5 text-cyan-50/75 transition hover:border-cyan-200/45 hover:bg-cyan-100/10 hover:text-white"
              aria-label="Close neural field"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="group relative">
        <canvas
          ref={canvasRef}
          className={
            mobileDock
              ? "block h-[86px] w-[118px] touch-none cursor-pointer transition-transform duration-300 active:scale-95"
              : expanded
              ? "block h-[min(62vh,560px)] min-h-[390px] w-full touch-none cursor-crosshair rounded-2xl bg-[radial-gradient(circle_at_center,rgba(8,47,73,0.34),rgba(2,8,23,0.08)_54%,transparent_76%)] drop-shadow-[0_0_28px_rgba(34,211,238,0.38)]"
              : "block h-[176px] w-full touch-none cursor-pointer transition [@media(max-height:850px)]:h-[148px]"
          }
          aria-label={`Twin intelligence core, ${displayLabel.toLowerCase()}`}
          role="button"
          tabIndex={0}
          title={expanded ? "Tap to send an energy impulse" : "Open Twin AI"}
          onClick={() => {
            if (!expanded) {
              router.push("/jarvis");
              return;
            }
            interactionPulsesRef.current.push(performance.now());
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (!expanded) {
              router.push("/jarvis");
              return;
            }
            interactionPulsesRef.current.push(performance.now());
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
        {!mobileDock ? <div
          aria-live="polite"
          className={"pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] " + (expanded ? "text-cyan-100/60" : "text-white/65")}
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
        </div> : null}
        {!mobileDock && !expanded ? (
          <div className="pointer-events-none absolute right-1 top-1 flex items-center gap-1 rounded-full border border-cyan-200/35 bg-white/35 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-[#0b4966]/65 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100">
            <Maximize2 className="h-2.5 w-2.5" /> Open AI
          </div>
        ) : null}
      </div>

      {!mobileDock ? <>
      <form onSubmit={submit} className={expanded ? "mx-auto mt-3 max-w-xl" : "mt-2"}>
        <div className={"flex items-center gap-1 rounded-xl border p-1 shadow-[0_8px_24px_rgb(12_29_56/0.1)] backdrop-blur-md transition focus-within:border-cyan-300/80 " + (expanded ? "border-cyan-200/20 bg-cyan-50/10 focus-within:bg-cyan-50/15" : "border-white/65 bg-white/45 focus-within:bg-white/60")}>
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              const now = performance.now();
              typingActiveUntilRef.current = now + 950;
              typingEnergyRef.current = Math.max(typingEnergyRef.current, 0.42);
              setTypingActive(true);
              if (typingStatusTimerRef.current) window.clearTimeout(typingStatusTimerRef.current);
              typingStatusTimerRef.current = window.setTimeout(() => setTypingActive(false), 1000);
              const last = typingPulsesRef.current.at(-1) ?? 0;
              if (now - last > 90) typingPulsesRef.current.push(now);
            }}
            placeholder="Ask Twin anything"
            aria-label="Ask Twin anything"
            className={"min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[11px] font-medium outline-none " + (expanded ? "text-cyan-50 placeholder:text-cyan-100/35" : "text-ink placeholder:text-ink/45")}
          />
          <button
            type="button"
            onClick={toggleListening}
            aria-label={state === "listening" ? "Stop listening" : "Start listening"}
            aria-pressed={state === "listening"}
            title={state === "listening" ? "Stop listening" : "Use microphone"}
            className={
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition " +
              (state === "listening" ? "bg-cyan-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.5)]" : expanded ? "text-cyan-100/55 hover:bg-cyan-50/10 hover:text-cyan-50" : "text-ink/55 hover:bg-white/70 hover:text-ink")
            }
          >
            {state === "listening" ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>
          <button
            type="submit"
            aria-label="Send to Twin"
            title="Send"
            disabled={!input.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0b2444] text-white shadow-sm transition hover:bg-[#123a66] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>

      <div className="mt-1.5 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            setVoiceMode((enabled) => !enabled);
            if (voiceMode) window.speechSynthesis?.cancel();
          }}
          aria-pressed={voiceMode}
          className={
            "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-semibold transition " +
            (voiceMode
              ? expanded ? "border-cyan-300/30 bg-cyan-100/10 text-cyan-100/75" : "border-cyan-300/60 bg-white/45 text-[#0b4966]"
              : expanded ? "border-cyan-100/15 bg-white/5 text-cyan-100/40" : "border-white/50 bg-white/25 text-ink/45")
          }
        >
          {voiceMode ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
          Voice {voiceMode ? "on" : "off"}
        </button>
        <span className={"inline-flex items-center gap-1 text-[9px] font-medium " + (expanded ? "text-cyan-100/40" : "text-ink/40")}>
          <AudioLines className="h-3 w-3" />
          Neural audio
        </span>
      </div>

      <div aria-live="polite" className={"mt-1.5 min-h-8 space-y-0.5 px-1 text-[9px] leading-relaxed [@media(max-height:850px)]:min-h-5 " + (expanded ? "text-center text-cyan-100/45" : "text-ink/55")}>
        {transcript.length === 0 ? (
          <p className="text-center">The intelligence core is online.</p>
        ) : (
          transcript.slice(-2).map((line, index) => (
            <p key={`${line.role}-${index}`} className="line-clamp-2">
              <span className={"font-semibold " + (expanded ? "text-cyan-50/70" : "text-ink/70")}>{line.role}:</span> {line.text}
            </p>
          ))
        )}
      </div>
      </> : null}
      </div>
    </section>
  );

  if (mobileDock) {
    return portalReady && typeof document !== "undefined" ? createPortal(assistant, document.body) : null;
  }

  return expanded && typeof document !== "undefined" ? createPortal(assistant, document.body) : assistant;
}
