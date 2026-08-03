"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CircleDollarSign,
  Database,
  FileClock,
  GitBranch,
  LoaderCircle,
  MessageCircle,
  Mic,
  MicOff,
  Search,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { setCloneScope } from "@/app/actions/clone-scope";
import { useCurrency } from "@/components/CurrencyProvider";
import TwinWordmark from "@/components/TwinWordmark";
import type { DashboardData } from "@/lib/dashboard-data";
import { fmtMoney, starsToMoneyRate } from "@/lib/money";

type DomainId = "revenue" | "clones" | "fans" | "messages" | "flows" | "logs" | "settings";
type Phase = "idle" | "searching" | "resolved";

type Domain = {
  id: DomainId;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

type ResultMetric = { label: string; value: string };

type JarvisResult = {
  domain: DomainId;
  eyebrow: string;
  title: string;
  summary: string;
  href: string;
  action: string;
  cloneId?: string;
  imageUrl?: string;
  metrics: ResultMetric[];
};

type CoreParticle = {
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
};

type CoreLink = { a: number; b: number; phase: number };
type FullData = DashboardData & { error?: string };
type JourneyCandidate = {
  id: string;
  label: string;
  detail: string;
  imageUrl?: string;
  icon: ComponentType<{ className?: string }>;
};

type VoiceRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type VoiceRecognitionEvent = Event & {
  results: ArrayLike<VoiceRecognitionResult>;
};

type VoiceRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: VoiceRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type VoiceRecognitionConstructor = new () => VoiceRecognition;

const DOMAINS: Domain[] = [
  { id: "revenue", label: "Revenue", href: "/revenue", icon: CircleDollarSign },
  { id: "clones", label: "Clones", href: "/clones", icon: Database },
  { id: "fans", label: "Fans", href: "/users", icon: Users },
  { id: "messages", label: "Messages", href: "/users", icon: MessageCircle },
  { id: "flows", label: "Flows", href: "/flows", icon: GitBranch },
  { id: "logs", label: "Logs", href: "/logs", icon: FileClock },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings },
];

const DOMAIN_BY_ID = Object.fromEntries(DOMAINS.map((domain) => [domain.id, domain])) as Record<DomainId, Domain>;
const DOMAIN_INDEX = Object.fromEntries(DOMAINS.map((domain, index) => [domain.id, index])) as Record<DomainId, number>;

const SUGGESTIONS = [
  "Show me Cat's revenue this month",
  "Which clone has the most fans?",
  "Where do I edit a clone?",
  "Check the system logs for errors",
];

function makeNeuralSphere(count: number) {
  const particles: CoreParticle[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const y = 1 - ((index + 0.5) / count) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * index;
    particles.push({
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
      size: 0.65 + ((index * 17) % 11) / 10,
      phase: ((index * 29) % 101) / 101,
    });
  }

  const links: CoreLink[] = [];
  const used = new Set<string>();
  particles.forEach((particle, index) => {
    const nearest = particles
      .map((other, otherIndex) => ({
        otherIndex,
        distance: (particle.x - other.x) ** 2 + (particle.y - other.y) ** 2 + (particle.z - other.z) ** 2,
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
const DATA_SHARDS = Array.from({ length: 15 }, (_, index) => ({
  angle: (index / 15) * Math.PI * 2 + ((index * 11) % 5) * 0.12,
  radius: 0.38 + ((index * 17) % 9) * 0.055,
  elevation: Math.sin(index * 1.83) * 0.6,
  phase: ((index * 37) % 101) / 101,
}));

const AURORA_PARTICLE_RGB = [
  "3, 37, 76",
  "6, 54, 109",
  "13, 83, 145",
  "8, 91, 150",
  "14, 165, 233",
  "32, 197, 216",
  "76, 81, 191",
];

const TRAVEL_STARS = Array.from({ length: 340 }, (_, index) => ({
  x: ((((index * 73) % 167) / 167) - 0.5) * 2,
  y: ((((index * 47) % 149) / 149) - 0.5) * 2,
  z: ((index * 31) % 173) / 173,
  size: 0.45 + ((index * 19) % 8) * 0.19,
  speed: 0.000045 + (index % 5) * 0.000008,
  color: index % AURORA_PARTICLE_RGB.length,
}));

const GALAXY_ORBS = Array.from({ length: 42 }, (_, index) => ({
  x: ((((index * 53) % 127) / 127) - 0.5) * 1.9,
  y: ((((index * 71) % 131) / 131) - 0.5) * 1.55,
  z: ((index * 23) % 97) / 97,
  size: 0.035 + (index % 5) * 0.009,
  speed: 0.000026 + (index % 4) * 0.000007,
  phase: ((index * 43) % 89) / 89,
  color: (index * 3 + 1) % AURORA_PARTICLE_RGB.length,
}));

function inferDomain(query: string): DomainId {
  const value = query.toLowerCase();
  if (/revenue|earning|money|income|sale|star|paid|transaction/.test(value)) return "revenue";
  if (/fan|user|buyer|audience|customer/.test(value)) return "fans";
  if (/message|chat|conversation|reply|inbox/.test(value)) return "messages";
  if (/log|error|failure|failed|health|issue/.test(value)) return "logs";
  if (/flow|automation|journey|sequence/.test(value)) return "flows";
  if (/setting|configure|configuration|where|edit|price|pricing/.test(value)) return "settings";
  return "clones";
}

function compact(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOut(value: number) {
  return 1 - (1 - value) ** 3;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

export default function JarvisWorkspace({ cloneId }: { cloneId: string | null }) {
  const router = useRouter();
  const { currency, rate } = useCurrency();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("idle");
  const activeDomainRef = useRef<DomainId | null>(null);
  const searchStartedRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const timersRef = useRef<number[]>([]);
  const voiceRecognitionRef = useRef<VoiceRecognition | null>(null);
  const voiceTranscriptRef = useRef("");

  const [data, setData] = useState<FullData | null>(null);
  const [dataError, setDataError] = useState(false);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [activeDomain, setActiveDomain] = useState<DomainId | null>(null);
  const [searchStep, setSearchStep] = useState("Intelligence core online");
  const [result, setResult] = useState<JarvisResult | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [journeySeed, setJourneySeed] = useState(1);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    activeDomainRef.current = activeDomain;
  }, [activeDomain]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ period: "1M" });
    if (cloneId) params.set("clone", cloneId);
    fetch(`/api/dashboard?${params}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: FullData) => {
        if (cancelled) return;
        if (payload.error) throw new Error(payload.error);
        setData(payload);
        setSearchStep("Intelligence core online");
      })
      .catch(() => {
        if (cancelled) return;
        setDataError(true);
        setSearchStep("Navigation intelligence online");
      });
    return () => {
      cancelled = true;
    };
  }, [cloneId]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    voiceRecognitionRef.current?.abort();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 900;
    let height = 650;
    let dpr = 1;
    let frame = 0;
    let previous = performance.now();
    let rotation = 0;
    let smoothPresentation = 0;

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
      const currentPhase = phaseRef.current;
      const elapsed = currentPhase === "searching" ? now - searchStartedRef.current : 0;
      const expand = currentPhase === "searching" ? easeOut(clamp01(elapsed / 1100)) : 0;
      const dive = currentPhase === "searching" ? easeOut(clamp01((elapsed - 780) / 1700)) : 0;
      const journey = currentPhase === "searching" ? easeOut(clamp01((elapsed - 1800) / 5200)) : 0;
      const locate = currentPhase === "searching" ? easeOut(clamp01((elapsed - 7800) / 1050)) : 0;
      const extract = currentPhase === "searching" ? easeOut(clamp01((elapsed - 9000) / 1450)) : 0;
      const enterCore = currentPhase === "searching" ? easeOut(clamp01((elapsed - 850) / 1350)) : 0;
      const pullBack = currentPhase === "searching" ? easeOut(clamp01((elapsed - 7750) / 1050)) : 0;
      const inside = enterCore * (1 - pullBack);
      smoothPresentation += ((currentPhase === "resolved" ? 1 : 0) - smoothPresentation) * 0.08;
      rotation += delta * (currentPhase === "searching" ? 0.0005 + dive * 0.00072 : 0.0002) * (reducedMotion ? 0.3 : 1);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const cameraDriftX = Math.sin(now * 0.00092) * width * 0.15 * inside;
      const cameraDriftY = Math.cos(now * 0.00067) * height * 0.09 * inside;
      const cx = width * (0.5 - smoothPresentation * 0.17) + cameraDriftX + pointerRef.current.x * (6 + dive * 18);
      const cy = height * 0.43 + cameraDriftY + pointerRef.current.y * (4 + dive * 14);
      const baseRadius = Math.min(width, height) * (width < 640 ? 0.27 : 0.205);
      // The core grows beyond the viewport during the middle of the search.
      // Its outside edge disappears and the same network becomes an interior
      // particle landscape, before the camera pulls back to extract the file.
      const searchScale = 1 + expand * 0.44 + dive * 0.58 + inside * 2.72 - extract * 0.72;
      const radius = baseRadius * searchScale * (1 - smoothPresentation * 0.12);

      if (inside > 0.01) {
        const interiorShade = ctx.createRadialGradient(
          width * 0.5,
          height * 0.44,
          Math.min(width, height) * 0.14,
          width * 0.5,
          height * 0.44,
          Math.max(width, height) * 0.72,
        );
        interiorShade.addColorStop(0, "rgba(3, 37, 76, 0)");
        interiorShade.addColorStop(0.58, `rgba(6, 54, 109, ${inside * 0.025})`);
        interiorShade.addColorStop(1, `rgba(3, 37, 76, ${inside * 0.17})`);
        ctx.fillStyle = interiorShade;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const ambient = ctx.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius * 1.72);
      ambient.addColorStop(0, `rgba(15, 92, 148, ${0.07 + dive * 0.08})`);
      ambient.addColorStop(0.4, `rgba(56, 189, 248, ${0.06 + expand * 0.05})`);
      ambient.addColorStop(0.75, "rgba(8, 91, 150, 0.025)");
      ambient.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = ambient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.72, 0, Math.PI * 2);
      ctx.fill();

      const shellPresence = 1 - inside;
      if (shellPresence > 0.04) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        const outsideScanY = cy - radius + ((now * 0.035) % (radius * 2));
        const outsideScanWidth = Math.sqrt(Math.max(0, radius ** 2 - (outsideScanY - cy) ** 2));
        const outsideScan = ctx.createLinearGradient(cx - outsideScanWidth, outsideScanY, cx + outsideScanWidth, outsideScanY);
        outsideScan.addColorStop(0, "rgba(56, 189, 248, 0)");
        outsideScan.addColorStop(0.5, `rgba(224, 247, 255, ${shellPresence * 0.14})`);
        outsideScan.addColorStop(1, "rgba(56, 189, 248, 0)");
        ctx.strokeStyle = outsideScan;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(cx - outsideScanWidth, outsideScanY);
        ctx.lineTo(cx + outsideScanWidth, outsideScanY);
        ctx.stroke();
        ctx.restore();
      }

      const orbTargets: Array<{ x: number; y: number; radius: number; rgb: string; alpha: number }> = [];

      // Once the sphere opens, the viewer moves through a deep field rather
      // than waiting in front of one static object. Stars and smaller neural
      // systems accelerate toward the camera like records flowing past.
      if (currentPhase === "searching" && elapsed > 1150) {
        const travelTime = elapsed - 1150;
        TRAVEL_STARS.forEach((star) => {
          const depth = (star.z - travelTime * star.speed + 20) % 1;
          const approach = 1 - depth;
          const spread = 0.09 + approach * approach * 1.64;
          const tunnelTwist = travelTime * 0.00022 + depth * 1.15 + star.color * 0.055;
          const tunnelCos = Math.cos(tunnelTwist);
          const tunnelSin = Math.sin(tunnelTwist);
          const tunnelX = star.x * tunnelCos - star.y * tunnelSin;
          const tunnelY = star.x * tunnelSin + star.y * tunnelCos;
          const sx = cx + tunnelX * width * 0.43 * spread;
          const sy = cy + tunnelY * height * 0.43 * spread;
          const alpha = Math.min(0.88, (0.1 + approach * approach * 0.66) * Math.min(1, journey + 0.3));
          const starRgb = AURORA_PARTICLE_RGB[star.color];
          ctx.fillStyle = `rgba(${starRgb}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(sx, sy, star.size * (0.62 + approach * 1.62), 0, Math.PI * 2);
          ctx.fill();
          if (approach > 0.58) {
            ctx.strokeStyle = `rgba(${starRgb}, ${(approach - 0.58) * 0.62})`;
            ctx.lineWidth = 0.58 + approach * 0.32;
            ctx.beginPath();
            const trailStart = 0.7 - approach * 0.4;
            ctx.moveTo(cx + (sx - cx) * trailStart, cy + (sy - cy) * trailStart);
            ctx.lineTo(sx, sy);
            ctx.stroke();
          }
        });

        GALAXY_ORBS.forEach((orb, index) => {
          const depth = (orb.z - travelTime * orb.speed + 12) % 1;
          const approach = 1 - depth;
          const spread = 0.24 + approach * approach * 1.18;
          const ox = cx + orb.x * width * 0.42 * spread + Math.sin(now * 0.0005 + orb.phase * 9) * 12;
          const oy = cy + orb.y * height * 0.4 * spread + Math.cos(now * 0.00045 + orb.phase * 11) * 8;
          const orbRadius = Math.max(3, width * orb.size * (0.18 + approach * 0.58));
          const orbAlpha = Math.min(0.82, (0.07 + approach * 0.58) * Math.min(1, journey + 0.24));
          const orbRgb = AURORA_PARTICLE_RGB[orb.color];
          orbTargets.push({ x: ox, y: oy, radius: orbRadius, rgb: orbRgb, alpha: orbAlpha });
          const orbGlow = ctx.createRadialGradient(ox, oy, 0, ox, oy, orbRadius * 1.6);
          orbGlow.addColorStop(0, `rgba(238, 253, 255, ${orbAlpha * 0.58})`);
          orbGlow.addColorStop(0.16, `rgba(${orbRgb}, ${orbAlpha * 0.38})`);
          orbGlow.addColorStop(1, `rgba(${orbRgb}, 0)`);
          ctx.fillStyle = orbGlow;
          ctx.beginPath();
          ctx.arc(ox, oy, orbRadius * 1.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.translate(ox, oy);
          ctx.rotate(now * (index % 2 === 0 ? 0.00018 : -0.00016) + orb.phase * 5);
          ctx.fillStyle = `rgba(${orbRgb}, ${orbAlpha * 0.055})`;
          ctx.beginPath();
          ctx.arc(0, 0, orbRadius * 1.04, 0, Math.PI * 2);
          ctx.fill();

          const meshPoints = Array.from({ length: 18 }, (_, pointIndex) => {
            const normalized = (pointIndex + 0.7) / 18;
            const angle = pointIndex * 2.399963 + now * 0.0001 + orb.phase * 4;
            const shell = Math.sqrt(normalized) * orbRadius * 0.92;
            return {
              x: Math.cos(angle) * shell,
              y: Math.sin(angle) * shell * (0.78 + Math.sin(now * 0.0003 + orb.phase * 8) * 0.08),
            };
          });
          meshPoints.forEach((point, pointIndex) => {
            if (pointIndex > 1) {
              const linked = meshPoints[(pointIndex + 5 + (index % 3)) % meshPoints.length];
              ctx.strokeStyle = `rgba(${orbRgb}, ${orbAlpha * 0.2})`;
              ctx.lineWidth = 0.38;
              ctx.beginPath();
              ctx.moveTo(point.x, point.y);
              ctx.lineTo(linked.x, linked.y);
              ctx.stroke();
            }
            ctx.fillStyle = pointIndex % 6 === 0
              ? `rgba(242, 253, 255, ${orbAlpha * 0.82})`
              : `rgba(${orbRgb}, ${orbAlpha * 0.72})`;
            ctx.beginPath();
            ctx.arc(point.x, point.y, Math.max(0.48, 0.38 + approach * 0.52), 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.restore();
        });

        if (elapsed > 1350 && elapsed < 8950 && orbTargets.length > 0) {
          const attemptDuration = 1480;
          const attemptElapsed = elapsed - 1350;
          const attemptIndex = Math.floor(attemptElapsed / attemptDuration);
          const attemptProgress = (attemptElapsed % attemptDuration) / attemptDuration;
          const domainOffset = activeDomainRef.current ? DOMAIN_INDEX[activeDomainRef.current] * 3 : 0;
          const target = orbTargets[(attemptIndex * 7 + domainOffset + 5) % orbTargets.length];
          const grab = easeOut(clamp01((attemptProgress - 0.08) / 0.38));
          const reject = easeOut(clamp01((attemptProgress - 0.7) / 0.25));
          const side = attemptIndex % 2 === 0 ? -1 : 1;
          const inspectX = width * (0.5 + side * 0.13) + Math.sin(now * 0.0021) * width * 0.025;
          const inspectY = height * (0.39 + ((attemptIndex % 3) - 1) * 0.055);
          const pulledX = target.x + (inspectX - target.x) * grab + side * width * 0.18 * reject;
          const pulledY = target.y + (inspectY - target.y) * grab - height * 0.055 * reject;
          const pulledRadius = target.radius * (1 + grab * 1.25 + reject * 0.35);
          const selectionAlpha = Math.max(0, (0.38 + grab * 0.62) * (1 - reject));

          if (grab > 0.02 && selectionAlpha > 0.02) {
            const segments = 9;
            const dx = pulledX - target.x;
            const dy = pulledY - target.y;
            const length = Math.max(1, Math.hypot(dx, dy));
            const normalX = -dy / length;
            const normalY = dx / length;
            const drawTether = (lineWidth: number, alpha: number, color: string) => {
              ctx.strokeStyle = `rgba(${color}, ${alpha * selectionAlpha})`;
              ctx.lineWidth = lineWidth;
              ctx.beginPath();
              for (let segment = 0; segment <= segments; segment += 1) {
                const t = segment / segments;
                const jitter = segment === 0 || segment === segments
                  ? 0
                  : Math.sin(now * 0.021 + segment * 8.7 + attemptIndex) * (4 + grab * 5);
                const x = target.x + dx * t + normalX * jitter;
                const y = target.y + dy * t + normalY * jitter;
                if (segment === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }
              ctx.stroke();
            };
            drawTether(3.2, 0.16, "14, 165, 233");
            drawTether(0.9, 0.78, "239, 250, 255");

            const selectedGlow = ctx.createRadialGradient(pulledX, pulledY, 0, pulledX, pulledY, pulledRadius * 2.25);
            selectedGlow.addColorStop(0, `rgba(248, 254, 255, ${selectionAlpha * 0.72})`);
            selectedGlow.addColorStop(0.16, `rgba(56, 189, 248, ${selectionAlpha * 0.44})`);
            selectedGlow.addColorStop(1, "rgba(14, 116, 190, 0)");
            ctx.fillStyle = selectedGlow;
            ctx.beginPath();
            ctx.arc(pulledX, pulledY, pulledRadius * 2.25, 0, Math.PI * 2);
            ctx.fill();

            const selectedPoints = Array.from({ length: 16 }, (_, point) => {
              const normalized = (point + 0.65) / 16;
              const pointAngle = point * 2.399963 + now * 0.0011;
              const pointRadius = Math.sqrt(normalized) * pulledRadius * 0.9;
              return {
                x: pulledX + Math.cos(pointAngle) * pointRadius,
                y: pulledY + Math.sin(pointAngle) * pointRadius * 0.82,
              };
            });
            selectedPoints.forEach((point, pointIndex) => {
              if (pointIndex > 1) {
                const linked = selectedPoints[(pointIndex + 5) % selectedPoints.length];
                ctx.strokeStyle = `rgba(${target.rgb}, ${selectionAlpha * 0.34})`;
                ctx.lineWidth = 0.55;
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
                ctx.lineTo(linked.x, linked.y);
                ctx.stroke();
              }
              ctx.fillStyle = pointIndex % 5 === 0
                ? `rgba(255, 255, 255, ${selectionAlpha * 0.88})`
                : `rgba(${target.rgb}, ${selectionAlpha * 0.76})`;
              ctx.beginPath();
              ctx.arc(point.x, point.y, 0.7 + grab * 0.34, 0, Math.PI * 2);
              ctx.fill();
            });
          }
        }
      }

      [
        { rx: 1.18, ry: 0.38, angle: -0.44, speed: 0.018, alpha: 0.16 },
        { rx: 1.08, ry: 0.56, angle: 0.58, speed: -0.011, alpha: 0.11 },
        { rx: 0.98, ry: 0.72, angle: -1.02, speed: 0.008, alpha: 0.08 },
      ].forEach((ring, index) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ring.angle + pointerRef.current.x * 0.04);
        ctx.setLineDash(index === 1 ? [1.5, 5.5] : [3, 7]);
        ctx.lineDashOffset = now * ring.speed;
        ctx.strokeStyle = `rgba(103, 232, 249, ${ring.alpha * shellPresence})`;
        ctx.lineWidth = index === 0 ? 0.7 : 0.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * ring.rx, radius * ring.ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });

      const yaw = rotation + pointerRef.current.x * 0.22;
      const pitch = -0.15 + pointerRef.current.y * 0.14;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosX = Math.cos(pitch);
      const sinX = Math.sin(pitch);
      const projected = SPHERE.particles.map((particle) => {
        const neuralSpread = currentPhase === "searching"
          ? 1 + expand * (0.08 + particle.phase * 0.34) + Math.sin(now * 0.003 + particle.phase * 18) * expand * 0.035
          : 1 + Math.sin(now * 0.0013 + particle.phase * 12) * 0.018;
        const px = particle.x * neuralSpread;
        const py = particle.y * neuralSpread;
        const pz = particle.z * neuralSpread;
        const x1 = px * cosY - pz * sinY;
        const z1 = px * sinY + pz * cosY;
        const y2 = py * cosX - z1 * sinX;
        const z2 = py * sinX + z1 * cosX;
        const perspective = 1 / (1.16 - z2 * (0.2 + dive * 0.035));
        return {
          x: cx + x1 * radius * perspective,
          y: cy + y2 * radius * perspective,
          z: z2,
          perspective,
          particle,
        };
      });

      SPHERE.links.forEach((link) => {
        const a = projected[link.a];
        const b = projected[link.b];
        const depth = Math.max(0.08, (a.z + b.z + 2) / 4);
        const flash = currentPhase === "searching" && Math.sin(now * 0.008 + link.phase * 20) > 0.76;
        const outsideShell = inside <= 0.1;
        const linkRgb = inside > 0.12
          ? AURORA_PARTICLE_RGB[Math.floor(link.phase * AURORA_PARTICLE_RGB.length) % AURORA_PARTICLE_RGB.length]
          : "13, 83, 145";
        ctx.strokeStyle = outsideShell
          ? flash
            ? `rgba(224, 247, 255, ${0.62 + locate * 0.2})`
            : `rgba(45, 190, 255, ${Math.min(0.78, (0.21 + depth * 0.28) * shellPresence)})`
          : flash
            ? `rgba(239, 246, 255, ${0.52 + locate * 0.2})`
            : `rgba(${linkRgb}, ${(0.19 + depth * 0.28 + dive * 0.08) * (1 - inside * 0.22)})`;
        ctx.lineWidth = outsideShell ? (flash ? 1.15 : 0.78) : (flash ? 1.05 : 0.68);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      projected.forEach(({ x, y, z, perspective, particle }) => {
        const depth = Math.max(0.2, (z + 1.2) / 2.2);
        const thinking = currentPhase === "searching" ? 0.7 + Math.abs(Math.sin(now * 0.006 + particle.phase * 19)) * 0.55 : 1;
        const size = particle.size * perspective * depth * thinking;
        const particleRgb = inside > 0.1
          ? AURORA_PARTICLE_RGB[Math.floor(particle.phase * AURORA_PARTICLE_RGB.length) % AURORA_PARTICLE_RGB.length]
          : z > 0.18 ? "13, 83, 145" : "14, 165, 233";
        const glint = currentPhase === "searching" && Math.sin(now * 0.007 + particle.phase * 21) > 0.9;
        ctx.fillStyle = inside <= 0.1
          ? z > 0.25
            ? `rgba(238, 252, 255, ${Math.min(0.95, 0.38 + depth * 0.56)})`
            : `rgba(103, 232, 249, ${Math.min(0.95, 0.38 + depth * 0.56)})`
          : glint ? "rgba(244, 252, 255, 0.98)" : `rgba(${particleRgb}, ${z > 0.18 ? 0.93 : 0.79})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.65, size), 0, Math.PI * 2);
        ctx.fill();
      });

      if (shellPresence > 0.08) {
        for (let glintIndex = 0; glintIndex < 5; glintIndex += 1) {
          const angle = rotation * (glintIndex % 2 === 0 ? 1.4 : -1.1) + glintIndex * 2.17;
          const glintX = cx + Math.cos(angle) * radius * (0.72 + (glintIndex % 3) * 0.08);
          const glintY = cy + Math.sin(angle) * radius * (0.72 + (glintIndex % 3) * 0.08);
          const pulse = 0.32 + Math.abs(Math.sin(now * 0.0028 + glintIndex * 1.9)) * 0.42;
          const glowRadius = radius * (0.032 + pulse * 0.036);
          const outsideGlint = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, glowRadius);
          outsideGlint.addColorStop(0, `rgba(255, 255, 255, ${pulse * shellPresence * 0.82})`);
          outsideGlint.addColorStop(0.2, `rgba(224, 247, 255, ${pulse * shellPresence * 0.62})`);
          outsideGlint.addColorStop(1, "rgba(56, 189, 248, 0)");
          ctx.fillStyle = outsideGlint;
          ctx.beginPath();
          ctx.arc(glintX, glintY, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        for (let boltIndex = 0; boltIndex < 3; boltIndex += 1) {
          const life = (now * 0.00042 + boltIndex * 0.31) % 1;
          const boltAlpha = Math.sin(life * Math.PI) * shellPresence * (0.28 + (boltIndex % 2) * 0.14);
          if (boltAlpha < 0.05) continue;
          const startAngle = rotation * (boltIndex % 2 === 0 ? 1.6 : -1.25) + boltIndex * 2.11 + life * 0.42;
          const arcSpan = 0.5 + boltIndex * 0.12;
          const segments = 8;
          const drawOutsideBolt = (lineWidth: number, alpha: number, rgb: string) => {
            ctx.strokeStyle = `rgba(${rgb}, ${alpha * boltAlpha})`;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            for (let segment = 0; segment <= segments; segment += 1) {
              const t = segment / segments;
              const angle = startAngle + t * arcSpan;
              const jitter = segment === 0 || segment === segments
                ? 0
                : Math.sin(now * 0.026 + boltIndex * 17 + segment * 9.4) * radius * 0.055;
              const boltRadius = radius * (1.01 + Math.sin(t * Math.PI) * 0.08) + jitter;
              const x = cx + Math.cos(angle) * boltRadius;
              const y = cy + Math.sin(angle) * boltRadius;
              if (segment === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          };
          drawOutsideBolt(3.2, 0.2, "56, 189, 248");
          drawOutsideBolt(0.82, 0.94, "248, 254, 255");
        }
      }

      let activeShardX = cx;
      let activeShardY = cy;
      const targetShardIndex = activeDomainRef.current ? (DOMAIN_INDEX[activeDomainRef.current] * 2 + 3) % DATA_SHARDS.length : 0;
      DATA_SHARDS.forEach((shard, index) => {
        const angle = shard.angle + rotation * (index % 2 === 0 ? 1.8 : -1.25);
        const shardRadius = radius * shard.radius * (1 + expand * 0.72);
        const sx = cx + Math.cos(angle) * shardRadius;
        const sy = cy + Math.sin(angle) * shardRadius * 0.58 + shard.elevation * radius * 0.28;
        const active = index === targetShardIndex;
        if (active) {
          activeShardX = sx;
          activeShardY = sy;
        }
        const opacity = expand * (active ? 0.72 + locate * 0.28 : 0.16 + locate * 0.1);
        if (opacity <= 0.01 || (active && extract > 0)) return;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle * 0.45);
        if (active) {
          ctx.shadowColor = "rgba(14, 165, 233, 0.9)";
          ctx.shadowBlur = 18 + locate * 14;
        }
        ctx.fillStyle = `rgba(236, 250, 255, ${opacity * 0.72})`;
        ctx.strokeStyle = `rgba(14, 116, 190, ${opacity})`;
        ctx.lineWidth = active ? 1.1 : 0.55;
        ctx.beginPath();
        ctx.roundRect(-9, -6, 18, 12, 2.5);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = `rgba(14, 116, 190, ${opacity * 0.7})`;
        ctx.lineWidth = 0.55;
        ctx.beginPath();
        ctx.moveTo(-5, -2);
        ctx.lineTo(5, -2);
        ctx.moveTo(-5, 1.5);
        ctx.lineTo(2, 1.5);
        ctx.stroke();
        ctx.restore();
      });

      if (currentPhase === "searching" && extract > 0) {
        const endX = width * (width < 700 ? 0.5 : 0.72);
        const endY = height * (width < 700 ? 0.26 : 0.32);
        const controlX = (activeShardX + endX) / 2;
        const controlY = Math.min(activeShardY, endY) - radius * 0.7;
        const t = extract;
        const inv = 1 - t;
        const fileX = inv * inv * activeShardX + 2 * inv * t * controlX + t * t * endX;
        const fileY = inv * inv * activeShardY + 2 * inv * t * controlY + t * t * endY;

        ctx.strokeStyle = `rgba(14, 165, 233, ${(1 - t) * 0.34})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(activeShardX, activeShardY);
        ctx.quadraticCurveTo(controlX, controlY, fileX, fileY);
        ctx.stroke();
        for (let index = 0; index < 9; index += 1) {
          const trailT = Math.max(0, t - index * 0.035);
          const trailInv = 1 - trailT;
          const tx = trailInv * trailInv * activeShardX + 2 * trailInv * trailT * controlX + trailT * trailT * endX;
          const ty = trailInv * trailInv * activeShardY + 2 * trailInv * trailT * controlY + trailT * trailT * endY;
          ctx.fillStyle = `rgba(56, 189, 248, ${(1 - index / 9) * 0.72})`;
          ctx.beginPath();
          ctx.arc(tx, ty, 1 + (index % 3) * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.translate(fileX, fileY);
        ctx.rotate((1 - t) * 0.7);
        ctx.shadowColor = "rgba(14, 165, 233, 0.8)";
        ctx.shadowBlur = 24;
        ctx.fillStyle = "rgba(244, 252, 255, 0.96)";
        ctx.strokeStyle = "rgba(14, 116, 190, 0.9)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.roundRect(-15, -11, 30, 22, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (currentPhase === "searching") {
        const scanProgress = ((elapsed - 7200) * 0.00034 + 1) % 1;
        const scanY = cy - radius * 1.12 + scanProgress * radius * 2.24;
        const scanGradient = ctx.createLinearGradient(cx - radius, scanY, cx + radius, scanY);
        scanGradient.addColorStop(0, "rgba(56, 189, 248, 0)");
        scanGradient.addColorStop(0.5, `rgba(14, 116, 190, ${0.12 + locate * 0.22})`);
        scanGradient.addColorStop(1, "rgba(56, 189, 248, 0)");
        ctx.strokeStyle = scanGradient;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx - radius, scanY);
        ctx.lineTo(cx + radius, scanY);
        ctx.stroke();
      }

      for (let index = 0; index < 28; index += 1) {
        const dustX = ((index * 67 + now * 0.004 * ((index % 3) + 1)) % (width + 20)) - 10;
        const dustY = ((index * 43 + Math.sin(now * 0.0007 + index) * 18) % height + height) % height;
        ctx.fillStyle = `rgba(29, 123, 184, ${0.03 + (index % 5) * 0.012})`;
        ctx.fillRect(dustX, dustY, 0.7, 0.7);
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

  const money = useCallback((stars: number) => fmtMoney(starsToMoneyRate(stars, currency, rate), currency), [currency, rate]);
  const activeClone = useMemo(() => (cloneId ? data?.clones.find((clone) => clone.id === cloneId) ?? null : null), [cloneId, data]);
  const journeyCards = useMemo(() => {
    const clones = data?.clones ?? [];
    const media = Array.from(
      new Map(
        (data?.recent ?? [])
          .filter((item) => item.mediaUrl)
          .map((item) => [`${item.mediaUrl}:${item.mediaName ?? "media"}`, item]),
      ).values(),
    ).slice(0, 4);
    const random = seededRandom(journeySeed);
    const featureCards: JourneyCandidate[] = [
      {
        id: "behavior-flirty",
        label: "Behavior · Flirty",
        detail: "Playful · confident · warm",
        icon: Sparkles,
      },
      {
        id: "behavior-boundaries",
        label: "Behavior limits",
        detail: "Boundaries · escalation · safety",
        icon: Settings,
      },
      {
        id: "fans",
        label: `${compact(data?.totals.users ?? 0)} fan profiles`,
        detail: "Activity · buyers · history",
        icon: Users,
      },
      {
        id: "messages",
        label: "Conversations",
        detail: `${compact(data?.totals.messages ?? 0)} messages indexed`,
        icon: MessageCircle,
      },
      {
        id: "memory",
        label: "Clone memory",
        detail: "Preferences · context · history",
        icon: Bot,
      },
      {
        id: "flows",
        label: "Conversation flows",
        detail: "Branches · triggers · offers",
        icon: GitBranch,
      },
      {
        id: "pricing",
        label: "Pricing configuration",
        detail: "PPV · bundles · unlocks",
        icon: CircleDollarSign,
      },
      {
        id: "voice",
        label: "Voice configuration",
        detail: "Tone · pace · personality",
        icon: Mic,
      },
      {
        id: "configuration",
        label: "Clone configuration",
        detail: "Identity · integrations · access",
        icon: Settings,
      },
      {
        id: "logs",
        label: "System records",
        detail: "Logs · errors · performance",
        icon: FileClock,
      },
      {
        id: "identity",
        label: "Identity profile",
        detail: "Name · persona · style",
        icon: Database,
      },
    ];

    const cloneCards: JourneyCandidate[] = clones.slice(0, 4).map((clone) => ({
        id: `clone-${clone.id}`,
        label: clone.name,
        detail: "Clone profile · behavior · voice",
        imageUrl: clone.photoUrl,
        icon: Database,
      }));
    const mediaCards: JourneyCandidate[] = media.map((item, index) => ({
        id: `media-${item.cloneId}-${index}`,
        label: item.mediaName ?? "Locked PPV",
        detail: `${item.stars} Stars · ${item.kind}`,
        imageUrl: item.mediaUrl ?? undefined,
        icon: CircleDollarSign,
      }));
    const liveCards: JourneyCandidate[] = [
      ...shuffled(cloneCards, random).slice(0, 1),
      ...shuffled(mediaCards, random).slice(0, 2),
    ];

    const liveCount = Math.min(2, liveCards.length);
    const selected = [
      ...shuffled(featureCards, random).slice(0, 6 - liveCount),
      ...shuffled(liveCards, random).slice(0, liveCount),
    ];
    const routes = shuffled([
      { x: -34, y: -22 },
      { x: 34, y: -19 },
      { x: -39, y: 9 },
      { x: 39, y: 12 },
      { x: -19, y: 24 },
      { x: 22, y: 25 },
      { x: -9, y: -29 },
      { x: 10, y: -26 },
    ], random);

    return shuffled(selected, random).map((card, index) => {
      const route = routes[index % routes.length];
      return {
        ...card,
        id: `${journeySeed}-${card.id}-${index}`,
        delay: 1350 + index * 1460,
        duration: 2050 + Math.round(random() * 220),
        endX: route.x,
        endY: route.y,
        midX: route.x * 0.38,
        midY: route.y * 0.38,
        farX: route.x * 1.18,
        farY: route.y * 1.18,
        tilt: -4 + random() * 8,
      };
    });
  }, [data, journeySeed]);

  const buildResult = useCallback((rawQuery: string, domain: DomainId): JarvisResult => {
    const lower = rawQuery.toLowerCase();
    const namedClone = data?.clones.find((clone) => lower.includes(clone.name.toLowerCase()));
    const targetClone = namedClone ?? activeClone;
    const stats = targetClone && data ? data.perClone[targetClone.id] : null;
    const scopeName = targetClone?.name ?? "All clones";

    if (domain === "revenue") {
      const stars = stats?.stars ?? data?.totals.stars ?? 0;
      return {
        domain,
        eyebrow: `${scopeName} · last 30 days`,
        title: `${money(stars)} in proceeds`,
        summary: `I found ${scopeName === "All clones" ? "the fleet-wide" : `${scopeName}'s`} current earnings and pulled the result out of the revenue record.`,
        href: "/revenue",
        action: "Open earnings",
        cloneId: targetClone?.id,
        imageUrl: targetClone?.photoUrl,
        metrics: [
          { label: "Telegram Stars", value: compact(stars) },
          { label: "Transactions", value: compact(stats?.sales ?? data?.totals.sales ?? 0) },
          { label: "Buyers", value: compact(stats?.buyers ?? data?.totals.buyers ?? 0) },
        ],
      };
    }

    if (domain === "fans" || domain === "messages") {
      const users = stats?.users ?? data?.totals.users ?? 0;
      const messages = stats?.messages ?? data?.totals.messages ?? 0;
      return {
        domain,
        eyebrow: `${scopeName} · audience record`,
        title: domain === "messages" ? `${compact(messages)} messages found` : `${compact(users)} fans found`,
        summary: `I located ${scopeName === "All clones" ? "the fleet" : scopeName} inside the audience records and extracted the relevant workspace.`,
        href: "/users",
        action: domain === "messages" ? "Open conversations" : "Open fans",
        cloneId: targetClone?.id,
        imageUrl: targetClone?.photoUrl,
        metrics: [
          { label: "Fans", value: compact(users) },
          { label: "Active 24h", value: compact(stats?.active24h ?? data?.totals.active24h ?? 0) },
          { label: "Buyers", value: compact(stats?.buyers ?? data?.totals.buyers ?? 0) },
        ],
      };
    }

    if (domain === "logs") {
      return {
        domain,
        eyebrow: `${scopeName} · system record`,
        title: `${compact(stats?.aiErrors ?? data?.totals.aiErrors ?? 0)} AI errors detected`,
        summary: "I searched the operational event stream and extracted the health record. The complete timeline is available in Logs.",
        href: "/logs",
        action: "Inspect logs",
        cloneId: targetClone?.id,
        imageUrl: targetClone?.photoUrl,
        metrics: [
          { label: "AI calls", value: compact(stats?.aiCalls ?? 0) },
          { label: "AI errors", value: compact(stats?.aiErrors ?? data?.totals.aiErrors ?? 0) },
          { label: "AI cost", value: `$${(stats?.costUsd ?? data?.totals.costUsd ?? 0).toFixed(2)}` },
        ],
      };
    }

    if (domain === "flows") {
      return {
        domain,
        eyebrow: `${scopeName} · automation file`,
        title: "Conversation flows located",
        summary: targetClone ? `I found and extracted ${targetClone.name}'s conversation paths.` : "Flows are clone-specific. Select a clone to open its automation paths.",
        href: "/flows",
        action: "Open flows",
        cloneId: targetClone?.id,
        imageUrl: targetClone?.photoUrl,
        metrics: [],
      };
    }

    if (domain === "settings") {
      const editIntent = /edit|identity|personality|price|pricing/.test(lower);
      return {
        domain,
        eyebrow: editIntent && targetClone ? `${targetClone.name} · editor file` : "Dashboard configuration",
        title: editIntent && targetClone ? `Edit ${targetClone.name}` : "Settings located",
        summary: editIntent && targetClone
          ? `I found ${targetClone.name}'s identity, pricing, media, and behavior controls.`
          : "I located the dashboard configuration. Select a clone first when you want its identity or pricing file.",
        href: editIntent && targetClone ? `/clones/${targetClone.id}?tab=identity` : "/settings",
        action: editIntent && targetClone ? "Open clone editor" : "Open settings",
        cloneId: targetClone?.id,
        imageUrl: targetClone?.photoUrl,
        metrics: [],
      };
    }

    return {
      domain: "clones",
      eyebrow: "Fleet record",
      title: `${data?.clones.length ?? 0} clones indexed`,
      summary: targetClone ? `I found ${targetClone.name} and extracted its fleet record.` : "I searched the fleet index and found every connected clone record.",
      href: targetClone ? `/clones/${targetClone.id}?tab=identity` : "/clones",
      action: targetClone ? `Open ${targetClone.name}` : "Manage clones",
      cloneId: targetClone?.id,
      imageUrl: targetClone?.photoUrl,
      metrics: [
        { label: "Clones", value: String(data?.clones.length ?? 0) },
        { label: "Fleet fans", value: compact(data?.totals.users ?? 0) },
        { label: "30d proceeds", value: money(data?.totals.stars ?? 0) },
      ],
    };
  }, [activeClone, data, money]);

  const runQuery = useCallback((nextQuery: string) => {
    const clean = nextQuery.trim();
    if (!clean) return;
    voiceTranscriptRef.current = "";
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
    setListening(false);
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    const domain = inferDomain(clean);
    const nextResult = buildResult(clean, domain);
    setQuery(clean);
    setResult(null);
    setActiveDomain(domain);
    setPhase("searching");
    setJourneySeed((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0);
    setSearchStep("Opening the neural field");
    searchStartedRef.current = performance.now();
    timersRef.current.push(
      window.setTimeout(() => setSearchStep("Entering the data galaxy"), 1150),
      window.setTimeout(() => setSearchStep("Grabbing a nearby record"), 2500),
      window.setTimeout(() => setSearchStep("Not a match — searching deeper"), 4050),
      window.setTimeout(() => {
        setSearchStep("Crossing to another particle cluster");
      }, 5550),
      window.setTimeout(() => setSearchStep(`Comparing the ${DOMAIN_BY_ID[domain].label.toLowerCase()} signal`), 7050),
      window.setTimeout(() => setSearchStep("Locating the matching data shard"), 8500),
      window.setTimeout(() => setSearchStep("Slowly extracting the result"), 9450),
      window.setTimeout(() => {
        setResult(nextResult);
        setPhase("resolved");
        setSearchStep("Result ready");
      }, 10850),
    );
  }, [buildResult]);

  const toggleVoiceQuestion = useCallback(async () => {
    if (phase === "searching") return;
    if (listening) {
      voiceRecognitionRef.current?.stop();
      return;
    }

    const speechWindow = window as typeof window & {
      SpeechRecognition?: VoiceRecognitionConstructor;
      webkitSpeechRecognition?: VoiceRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceUnavailable(true);
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone unavailable");
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      permissionStream.getTracks().forEach((track) => track.stop());
    } catch {
      setVoiceUnavailable(true);
      setListening(false);
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-AU";
    voiceTranscriptRef.current = "";
    setVoiceUnavailable(false);
    setListening(true);
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript ?? "";
      }
      const spoken = transcript.trim();
      voiceTranscriptRef.current = spoken;
      setQuery(spoken);
    };
    recognition.onerror = () => {
      voiceTranscriptRef.current = "";
      voiceRecognitionRef.current = null;
      setListening(false);
      setVoiceUnavailable(true);
    };
    recognition.onend = () => {
      const spoken = voiceTranscriptRef.current.trim();
      voiceRecognitionRef.current = null;
      setListening(false);
      if (spoken) runQuery(spoken);
    };
    voiceRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      voiceRecognitionRef.current = null;
      setListening(false);
      setVoiceUnavailable(true);
    }
  }, [listening, phase, runQuery]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    runQuery(query);
  };

  const openResult = async () => {
    if (!result) return;
    setNavigating(true);
    if (result.cloneId && result.cloneId !== cloneId) await setCloneScope(result.cloneId);
    router.push(result.href);
    router.refresh();
  };

  const dismissResult = () => {
    voiceTranscriptRef.current = "";
    voiceRecognitionRef.current?.abort();
    voiceRecognitionRef.current = null;
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setResult(null);
    setPhase("idle");
    setActiveDomain(null);
    setSearchStep(dataError ? "Navigation intelligence online" : "Intelligence core online");
    setNavigating(false);
    setListening(false);
    setQuery("");
  };

  const ResultIcon = result ? DOMAIN_BY_ID[result.domain].icon : Bot;

  return (
    <div className="jarvis-page relative min-h-full overflow-hidden p-3 sm:p-5">
      <section className="jarvis-stage relative min-h-[720px] overflow-hidden rounded-[28px] border border-white/55 bg-[#c8dce5]/28 backdrop-blur-xl lg:min-h-[calc(100vh-7.5rem)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,rgba(13,74,126,0.28),transparent_42%),radial-gradient(circle_at_17%_22%,rgba(20,160,184,0.28),transparent_35%),radial-gradient(circle_at_7%_88%,rgba(152,69,29,0.29),transparent_31%),radial-gradient(circle_at_94%_15%,rgba(15,45,108,0.26),transparent_34%),radial-gradient(circle_at_76%_82%,rgba(221,151,48,0.2),transparent_29%),linear-gradient(145deg,rgba(178,211,223,0.62),rgba(204,193,216,0.5)_52%,rgba(231,197,164,0.58))]" />

        <div className="pointer-events-none absolute left-1/2 top-5 z-20 -translate-x-1/2 scale-[0.84] sm:top-6 sm:scale-100">
          <TwinWordmark descriptor="Intelligence Core" />
        </div>
        <div className="absolute right-4 top-14 z-20 rounded-full border border-white/75 bg-white/50 px-3 py-1.5 text-[9px] font-semibold text-ink/45 shadow-sm backdrop-blur-md sm:right-6 sm:top-6">
          {activeClone?.name ?? "All clones"}
        </div>

        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          aria-label={`Twin intelligence core${activeDomain ? ` searching ${DOMAIN_BY_ID[activeDomain].label}` : ""}`}
          role="img"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            pointerRef.current = {
              x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
              y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
            };
          }}
          onPointerLeave={() => {
            pointerRef.current = { x: 0, y: 0 };
          }}
        />

        {phase === "searching" ? (
          <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            {journeyCards.map((card) => {
              const JourneyIcon = card.icon;
              return (
                <div
                  key={card.id}
                  className="jarvis-memory-card absolute flex min-w-[154px] items-center gap-2.5 rounded-2xl border border-white/85 bg-white/72 p-2.5 shadow-[0_18px_48px_rgba(12,46,78,0.18),0_0_28px_rgba(56,189,248,0.12)] backdrop-blur-xl"
                  style={{
                    "--journey-mid-x": `${card.midX}vw`,
                    "--journey-mid-y": `${card.midY}vh`,
                    "--journey-end-x": `${card.endX}vw`,
                    "--journey-end-y": `${card.endY}vh`,
                    "--journey-far-x": `${card.farX}vw`,
                    "--journey-far-y": `${card.farY}vh`,
                    "--journey-mid-tilt": `${card.tilt * 0.45}deg`,
                    "--journey-tilt": `${card.tilt}deg`,
                    animationDelay: `${card.delay}ms`,
                    animationDuration: `${card.duration}ms`,
                  } as CSSProperties}
                >
                  {card.imageUrl ? (
                    <img src={card.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-cyan-200/60" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-200/60 bg-cyan-50/80 text-[#0b6691]">
                      <JourneyIcon className="h-4.5 w-4.5" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block max-w-[145px] truncate text-[11px] font-semibold text-[#0d2540]">{card.label}</span>
                    <span className="mt-0.5 block max-w-[145px] truncate text-[8px] font-medium text-muted/75">{card.detail}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {phase === "searching" ? (
          <div className="pointer-events-none absolute left-1/2 top-[4.5rem] z-30 -translate-x-1/2 text-center sm:top-[4.75rem]">
            <p className="whitespace-nowrap rounded-full border border-white/70 bg-white/58 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.19em] text-[#0b4966]/70 shadow-[0_7px_26px_rgba(12,46,78,0.08)] backdrop-blur-md">{searchStep}</p>
          </div>
        ) : null}

        {result ? (
          <article className="jarvis-result-card absolute left-4 right-4 top-[13%] z-30 rounded-2xl border border-white/85 bg-white/78 p-4 shadow-[0_24px_70px_rgba(12,46,78,0.2),0_0_42px_rgba(56,189,248,0.15)] backdrop-blur-xl sm:left-auto sm:right-[7%] sm:top-[21%] sm:w-[350px] sm:p-5">
            <button
              type="button"
              onClick={dismissResult}
              aria-label="Close answer"
              title="Close answer"
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-slate-200/80 bg-white/75 text-slate-500 shadow-sm transition hover:border-cyan-200 hover:bg-white hover:text-[#0d2540] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 pr-9 text-[9px] font-semibold uppercase tracking-[0.16em] text-cyan-700/65">
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-cyan-200/70 bg-cyan-50/70 text-cyan-700">
                {result.imageUrl ? <img src={result.imageUrl} alt="" className="h-full w-full object-cover" /> : <ResultIcon className="h-4 w-4" />}
              </span>
              {result.eyebrow}
            </div>
            <h2 className="mt-3 font-heading text-2xl font-semibold tracking-[-0.035em] text-[#0d2540]">{result.title}</h2>
            <p className="mt-2 text-xs leading-5 text-muted">{result.summary}</p>

            {result.metrics.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {result.metrics.map((metric) => (
                  <div key={metric.label} className="rounded-xl border border-line/75 bg-white/62 p-2.5">
                    <div className="text-[7px] font-semibold uppercase tracking-[0.1em] text-muted/70">{metric.label}</div>
                    <div className="mt-1 text-sm font-semibold text-[#0d2540]">{metric.value}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={openResult}
              disabled={navigating}
              className="mt-4 flex w-full items-center justify-between rounded-xl bg-[#0d2540] px-4 py-3 text-left text-sm font-semibold text-white shadow-[0_10px_28px_rgba(13,37,64,0.24)] transition hover:bg-[#153d67] disabled:opacity-50"
            >
              <span>{result.action}</span>
              {navigating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          </article>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-[#edf3f7] via-[#edf3f7]/96 to-transparent px-4 pb-5 pt-24 sm:px-7">
          <form onSubmit={submit} className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-white/85 bg-white/68 p-2 shadow-[0_16px_44px_rgb(12_29_56/0.12)] backdrop-blur-xl transition focus-within:border-cyan-300/80 focus-within:bg-white/82">
            <Search className="ml-2 h-4 w-4 shrink-0 text-[#0b4966]/45" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVoiceUnavailable(false);
              }}
              placeholder={listening ? "Listening to your question…" : "Ask Twin about the dashboard…"}
              aria-label="Ask Twin about the dashboard"
              className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm font-medium text-ink outline-none placeholder:text-ink/38"
            />
            <button
              type="button"
              onClick={toggleVoiceQuestion}
              disabled={phase === "searching"}
              aria-label={listening ? "Stop and send voice question" : "Ask with voice"}
              aria-pressed={listening}
              title={listening ? "Stop and send voice question" : "Ask with voice"}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-35 ${
                listening
                  ? "border-cyan-400 bg-cyan-500 text-white shadow-[0_0_18px_rgba(6,182,212,0.45)]"
                  : "border-slate-200/80 bg-white/58 text-[#0b4966]/60 hover:border-cyan-300 hover:bg-cyan-50/80 hover:text-cyan-700"
              }`}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="submit"
              disabled={!query.trim() || phase === "searching"}
              className="flex h-9 items-center gap-2 rounded-xl bg-[#0d2540] px-3 text-xs font-semibold text-white shadow-[0_8px_22px_rgba(13,37,64,0.2)] transition hover:bg-[#153d67] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {phase === "searching" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Ask
            </button>
          </form>
          <div aria-live="polite" className="mx-auto min-h-4 max-w-3xl px-2 pt-1 text-[9px] font-medium text-[#0b4966]/60">
            {listening
              ? "Listening — speak naturally, then tap the microphone to send."
              : voiceUnavailable
                  ? "Voice input needs microphone permission and browser speech support."
                  : ""}
          </div>
          <div className="mx-auto mt-1 flex max-w-3xl gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => runQuery(suggestion)}
                className="shrink-0 rounded-full border border-white/80 bg-white/46 px-3 py-1.5 text-[10px] font-medium text-ink/48 shadow-sm backdrop-blur transition hover:border-cyan-300/65 hover:bg-white/72 hover:text-[#0b4966]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
