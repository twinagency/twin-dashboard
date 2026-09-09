"use client";

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

export function useInView<T extends HTMLElement = HTMLDivElement>(options: IntersectionObserverInit = { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { setInView(true); io.disconnect(); break; }
    }, options);
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref, inView };
}

export function useCountUp(target: number, active: boolean, duration = 1800) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      setValue(target * ease(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, active, duration]);
  return value;
}

export function CountUp({ to, format, duration, className }: { to: number; format: (n:number)=>string; duration?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const v = useCountUp(to, inView, duration);
  return <span ref={ref} className={`tabular-nums ${className ?? ""}`}>{format(v)}</span>;
}

export function Reveal({ children, delay = 0, y = 24, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const style: CSSProperties = {
    transform: inView ? "translate3d(0,0,0)" : `translate3d(0,${y}px,0)`, opacity: inView ? 1 : 0,
    transition: `opacity 900ms cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 900ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`, willChange: "transform, opacity",
  };
  return <div ref={ref} className={className} style={style}>{children}</div>;
}

export function Float({ children, amplitude = 8, duration = 6, delay = 0, className = "" }: { children: ReactNode; amplitude?: number; duration?: number; delay?: number; className?: string }) {
  const name = `float-${amplitude}-${duration}`.replace(/\./g,"_");
  return <div className={className} style={{animation:`${name} ${duration}s ease-in-out ${delay}s infinite`,willChange:"transform"}}><style>{`@keyframes ${name}{0%,100%{transform:translateY(0)}50%{transform:translateY(-${amplitude}px)}}`}</style>{children}</div>;
}

export function Parallax({ children, speed = 0.12, className = "" }: { children: ReactNode; speed?: number; className?: string }) {
  const [y,setY]=useState(0); const ref=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{const onScroll=()=>{if(!ref.current)return;const rect=ref.current.getBoundingClientRect();const center=rect.top+rect.height/2-window.innerHeight/2;setY(-center*speed)};onScroll();window.addEventListener("scroll",onScroll,{passive:true});return()=>window.removeEventListener("scroll",onScroll)},[speed]);
  return <div ref={ref} className={className} style={{transform:`translate3d(0, ${y}px, 0)`,willChange:"transform"}}>{children}</div>;
}

export function AmbientOrbs({ colors=["#A9E6FF","#0291EF","#01509D","#FD8FD8"], className="" }: { colors?: string[]; className?: string }) {
  return <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden><style>{`@keyframes orb-drift-a{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(6vw,-4vh,0) scale(1.15)}}@keyframes orb-drift-b{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-5vw,5vh,0) scale(1.1)}}@keyframes orb-drift-c{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(4vw,6vh,0) scale(.9)}}@keyframes orb-drift-d{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(-6vw,-3vh,0) scale(1.2)}}`}</style>{colors.map((c,i)=>{const p=[{top:"-10%",left:"-8%",size:520,anim:"orb-drift-a",dur:18},{top:"20%",right:"-10%",size:460,anim:"orb-drift-b",dur:22},{bottom:"-12%",left:"20%",size:500,anim:"orb-drift-c",dur:26},{top:"40%",left:"35%",size:380,anim:"orb-drift-d",dur:20}][i%4];return <div key={i} style={{position:"absolute",width:p.size,height:p.size,top:p.top,left:p.left,right:p.right,bottom:p.bottom,background:`radial-gradient(circle, ${c}55 0%, ${c}22 40%, transparent 70%)`,filter:"blur(40px)",animation:`${p.anim} ${p.dur}s ease-in-out infinite`,willChange:"transform",mixBlendMode:"screen"}}/>})}</div>;
}

export function FilmGrain({ opacity=0.06 }:{opacity?:number}) { return <div aria-hidden className="pointer-events-none absolute inset-0" style={{opacity,mixBlendMode:"overlay",backgroundImage:"url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")"}}/>; }
