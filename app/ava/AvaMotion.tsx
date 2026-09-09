"use client";

import { useEffect } from "react";

/** Progressive, front-end-only motion. All content remains readable without JS. */
export default function AvaMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".ava-site");
    const scroller = root?.querySelector<HTMLElement>('[data-ava-scroll="preview"]');
    const phone = scroller?.closest<HTMLElement>(".ava-phone");
    if (!root || !scroller || !phone || typeof IntersectionObserver === "undefined") return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const hover = matchMedia("(hover: hover) and (pointer: fine)");
    const animations = new Set<Animation>();
    let disposed = false;
    let inView = false;
    let hovering = false;
    let manual = false;
    let complete = false;
    let elapsed = 0;
    let previous: number | null = null;
    let frame = 0;

    // Existing history only. A brief hold, one slow downward scroll, then rest.
    // No new messages, typing simulation, counters, requests or endless loops.
    const holdMs = 850;
    const scrollMs = 3400;
    const cancelFrame = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = null;
    };
    const canScroll = () => !disposed && inView && !document.hidden && !reduced.matches && !hovering && !manual && !complete;
    const tick = (now: number) => {
      frame = 0;
      if (!canScroll()) { previous = null; return; }
      if (previous !== null) elapsed += Math.min(now - previous, 64);
      previous = now;
      const progress = Math.min(1, Math.max(0, (elapsed - holdMs) / scrollMs));
      const eased = (1 - Math.cos(progress * Math.PI)) / 2;
      const distance = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = distance * eased;
      scroller.dataset.avaScrollState = progress > 0 ? "running" : "waiting";
      if (progress >= 1) {
        complete = true;
        previous = null;
        scroller.dataset.avaScrollState = "complete";
      } else {
        frame = requestAnimationFrame(tick);
      }
    };
    const syncScroll = () => {
      if (canScroll()) {
        if (!scroller.hasAttribute("data-ava-scroll-ready")) {
          scroller.dataset.avaScrollReady = "true";
          scroller.tabIndex = 0;
          scroller.setAttribute("aria-label", "Example Telegram conversation. Scroll to read the existing messages.");
          scroller.scrollTop = 0;
        }
        if (!frame) frame = requestAnimationFrame(tick);
      } else {
        cancelFrame();
        if (scroller.hasAttribute("data-ava-scroll-ready") && !complete && !manual) scroller.dataset.avaScrollState = "paused";
      }
    };
    const stopForReader = () => {
      manual = true;
      cancelFrame();
      scroller.dataset.avaScrollState = "stopped";
    };
    const enter = () => { if (hover.matches) { hovering = true; syncScroll(); } };
    const leave = () => { hovering = false; syncScroll(); };
    const phoneObserver = new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.6);
      syncScroll();
    }, { threshold: [0, 0.6] });
    phoneObserver.observe(phone);
    scroller.addEventListener("pointerdown", stopForReader, { passive: true });
    scroller.addEventListener("wheel", stopForReader, { passive: true });
    scroller.addEventListener("keydown", stopForReader);
    scroller.addEventListener("focusin", stopForReader);
    scroller.addEventListener("pointerenter", enter);
    scroller.addEventListener("pointerleave", leave);

    const animate = (element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (reduced.matches || typeof element.animate !== "function") return;
      const animation = element.animate(keyframes, options);
      animations.add(animation);
      animation.onfinish = () => { animations.delete(animation); };
      animation.oncancel = () => { animations.delete(animation); };
      if (document.hidden) animation.pause();
    };
    const revealed = new WeakSet<Element>();
    const revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || revealed.has(entry.target)) continue;
        revealed.add(entry.target);
        revealObserver.unobserve(entry.target);
        const element = entry.target as HTMLElement;
        element.dataset.avaRevealed = "true";
        animate(element, [{ opacity: 0.25, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }], {
          duration: 500, easing: "cubic-bezier(.22,.61,.36,1)", iterations: 1,
        });
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -20px 0px" });
    // Never hide or delay the hero headline. No scroll interception or parallax.
    root.querySelectorAll<HTMLElement>(".ava-product-copy, .ava-dashboard-preview, .ava-features-section, .ava-personality, .ava-faq, .ava-final-cta").forEach(element => revealObserver.observe(element));

    const plot = root.querySelector<HTMLElement>(".ava-chart-plot");
    let chartRevealed = false;
    const chartObserver = new IntersectionObserver(entries => {
      if (chartRevealed || !entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.4)) return;
      chartRevealed = true;
      chartObserver.disconnect();
      if (plot) plot.dataset.avaChartRevealed = "true";
      root.querySelectorAll<HTMLElement>(".ava-dashboard-bars > i").forEach((bar, index) => {
        animate(bar, [{ transform: "scaleY(.06)" }, { transform: "scaleY(1)" }], {
          duration: 700, delay: Math.min(index * 4, 100), easing: "cubic-bezier(.22,.61,.36,1)", iterations: 1,
        });
      });
    }, { threshold: [0, 0.4] });
    if (plot) chartObserver.observe(plot);

    const onVisibility = () => {
      for (const animation of animations) {
        if (document.hidden) animation.pause();
        else if (!reduced.matches) animation.play();
      }
      syncScroll();
    };
    const onPreference = () => {
      if (reduced.matches) {
        cancelFrame();
        for (const animation of animations) animation.cancel();
        animations.clear();
        delete scroller.dataset.avaScrollReady;
        scroller.dataset.avaScrollState = "static";
        scroller.removeAttribute("tabindex");
        scroller.removeAttribute("aria-label");
        scroller.scrollTop = 0;
        elapsed = 0;
        complete = false;
      }
      syncScroll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onPreference);
    root.dataset.avaMotionReady = "true";
    onPreference();

    return () => {
      disposed = true;
      cancelFrame();
      phoneObserver.disconnect();
      revealObserver.disconnect();
      chartObserver.disconnect();
      for (const animation of animations) animation.cancel();
      animations.clear();
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onPreference);
      scroller.removeEventListener("pointerdown", stopForReader);
      scroller.removeEventListener("wheel", stopForReader);
      scroller.removeEventListener("keydown", stopForReader);
      scroller.removeEventListener("focusin", stopForReader);
      scroller.removeEventListener("pointerenter", enter);
      scroller.removeEventListener("pointerleave", leave);
      delete root.dataset.avaMotionReady;
      delete scroller.dataset.avaScrollReady;
      delete scroller.dataset.avaScrollState;
      scroller.removeAttribute("tabindex");
      scroller.removeAttribute("aria-label");
      scroller.scrollTop = 0;
    };
  }, []);
  return null;
}
