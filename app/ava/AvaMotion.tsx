"use client";

import { useEffect } from "react";

/** Front-end-only motion. The existing chat loops independently of page scroll. */
export default function AvaMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".ava-site");
    const scroller = root?.querySelector<HTMLElement>('[data-ava-scroll="preview"]');
    const toggle = root?.querySelector<HTMLButtonElement>("[data-ava-motion-toggle]");
    if (!root || !scroller || !toggle) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    let disposed = false;
    let manuallyPaused = false;
    let elapsed = 0;
    let previous: number | null = null;
    let frame = 0;

    // Reuse exactly the same history: hold, scroll down, hold, ease back, repeat.
    // Viewport entry, hover and page scrolling never gate or reset this timeline.
    const topHoldMs = 600;
    const downMs = 3600;
    const bottomHoldMs = 850;
    const returnMs = 2000;
    const cycleMs = topHoldMs + downMs + bottomHoldMs + returnMs;
    const ease = (progress: number) => (1 - Math.cos(progress * Math.PI)) / 2;
    const cancelFrame = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = null;
    };
    const restoreStatic = () => {
      cancelFrame();
      delete scroller.dataset.avaScrollReady;
      delete scroller.dataset.avaScrollPhase;
      delete scroller.dataset.avaScrollCycle;
      scroller.dataset.avaScrollState = "static";
      scroller.removeAttribute("tabindex");
      scroller.removeAttribute("aria-label");
      scroller.scrollTop = 0;
      toggle.hidden = true;
      toggle.setAttribute("aria-pressed", "false");
      manuallyPaused = false;
      elapsed = 0;
    };
    const canScroll = () => !disposed && !document.hidden && !reduced.matches && !manuallyPaused;
    const tick = (now: number) => {
      frame = 0;
      if (reduced.matches) { restoreStatic(); return; }
      if (!canScroll()) { previous = null; return; }
      if (previous !== null) elapsed += Math.max(0, now - previous);
      previous = now;
      const phaseTime = elapsed % cycleMs;
      let fraction = 0;
      let phase = "top";
      if (phaseTime >= topHoldMs && phaseTime < topHoldMs + downMs) {
        phase = "down";
        fraction = ease((phaseTime - topHoldMs) / downMs);
      } else if (phaseTime >= topHoldMs + downMs && phaseTime < topHoldMs + downMs + bottomHoldMs) {
        phase = "bottom";
        fraction = 1;
      } else if (phaseTime >= topHoldMs + downMs + bottomHoldMs) {
        phase = "return";
        fraction = 1 - ease((phaseTime - topHoldMs - downMs - bottomHoldMs) / returnMs);
      }
      const distance = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = distance * fraction;
      scroller.dataset.avaScrollState = "running";
      scroller.dataset.avaScrollPhase = phase;
      scroller.dataset.avaScrollCycle = String(Math.floor(elapsed / cycleMs));
      frame = requestAnimationFrame(tick);
    };
    const syncScroll = () => {
      if (reduced.matches) { restoreStatic(); return; }
      if (disposed) return;
      if (!scroller.hasAttribute("data-ava-scroll-ready")) {
        scroller.dataset.avaScrollReady = "true";
        scroller.setAttribute("aria-label", "Telegram conversation preview. Pause the animation to scroll through the messages.");
        scroller.scrollTop = 0;
      }
      toggle.hidden = false;
      toggle.setAttribute("aria-pressed", String(manuallyPaused));
      toggle.setAttribute("aria-label", manuallyPaused ? "Resume chat animation" : "Pause chat animation");
      toggle.title = manuallyPaused ? "Resume chat animation" : "Pause chat animation";
      scroller.tabIndex = manuallyPaused ? 0 : -1;
      if (canScroll()) {
        scroller.dataset.avaScrollState = "running";
        if (!frame) frame = requestAnimationFrame(tick);
      } else {
        cancelFrame();
        scroller.dataset.avaScrollState = manuallyPaused ? "paused" : "suspended";
      }
    };
    const onToggle = () => {
      if (reduced.matches) return;
      manuallyPaused = !manuallyPaused;
      if (!manuallyPaused) {
        // Resume smoothly from a reader's current position, not with a jump.
        const distance = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
        const fraction = Math.min(1, Math.max(0, scroller.scrollTop / distance));
        const cycle = Math.floor(elapsed / cycleMs);
        elapsed = cycle * cycleMs + topHoldMs + downMs * Math.acos(1 - 2 * fraction) / Math.PI;
      }
      syncScroll();
    };
    toggle.addEventListener("click", onToggle);

    const animate = (element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (reduced.matches || typeof element.animate !== "function") return;
      const animation = element.animate(keyframes, options);
      animations.add(animation);
      animation.onfinish = () => { animations.delete(animation); };
      animation.oncancel = () => { animations.delete(animation); };
      if (document.hidden) animation.pause();
    };
    const revealed = new WeakSet<Element>();
    const revealObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || revealed.has(entry.target)) continue;
        revealed.add(entry.target);
        revealObserver?.unobserve(entry.target);
        const element = entry.target as HTMLElement;
        element.dataset.avaRevealed = "true";
        animate(element, [{ opacity: 0.25, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }], {
          duration: 500, easing: "cubic-bezier(.22,.61,.36,1)", iterations: 1,
        });
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -20px 0px" });
    // These one-time section reveals do not control the continuously looping chat.
    root.querySelectorAll<HTMLElement>(".ava-product-copy, .ava-dashboard-preview, .ava-features-section, .ava-personality, .ava-faq, .ava-final-cta").forEach(element => revealObserver?.observe(element));

    const plot = root.querySelector<HTMLElement>(".ava-chart-plot");
    let chartRevealed = false;
    const chartObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      if (chartRevealed || !entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.4)) return;
      chartRevealed = true;
      chartObserver?.disconnect();
      if (plot) plot.dataset.avaChartRevealed = "true";
      root.querySelectorAll<HTMLElement>(".ava-dashboard-bars > i").forEach((bar, index) => {
        animate(bar, [{ transform: "scaleY(.06)" }, { transform: "scaleY(1)" }], {
          duration: 700, delay: Math.min(index * 4, 100), easing: "cubic-bezier(.22,.61,.36,1)", iterations: 1,
        });
      });
    }, { threshold: [0, 0.4] });
    if (plot) chartObserver?.observe(plot);

    const onVisibility = () => {
      for (const animation of animations) {
        if (document.hidden) animation.pause();
        else if (!reduced.matches) animation.play();
      }
      // Suspend only hidden browser tabs, never an off-screen phone on this page.
      syncScroll();
    };
    const onPreference = () => {
      if (reduced.matches) {
        for (const animation of animations) animation.cancel();
        animations.clear();
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
      revealObserver?.disconnect();
      chartObserver?.disconnect();
      for (const animation of animations) animation.cancel();
      animations.clear();
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onPreference);
      toggle.removeEventListener("click", onToggle);
      toggle.hidden = true;
      delete root.dataset.avaMotionReady;
      delete scroller.dataset.avaScrollReady;
      delete scroller.dataset.avaScrollState;
      delete scroller.dataset.avaScrollPhase;
      delete scroller.dataset.avaScrollCycle;
      scroller.removeAttribute("tabindex");
      scroller.removeAttribute("aria-label");
      scroller.scrollTop = 0;
    };
  }, []);
  return null;
}
