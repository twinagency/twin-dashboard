'use strict';
/* Replace the active controller once. No breakpoint renderer fallback. */
(() => {
  let orbFrame = null;
  let miniCanvas = null, miniContext = null;
  const orbMetrics = { frames: 0, mainFrames: 0, miniFrames: 0 };
  function visibleMini() {
    const found = $('mini-orb');
    if (found !== miniCanvas) { miniCanvas = found; miniContext = found?.getContext('2d', { alpha: true }) || null; }
    if (!miniCanvas || !miniContext || !miniCanvas.isConnected) return null;
    const rect = miniCanvas.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight ? rect : null;
  }
  draw = function(now) {
    raf = 0;
    if (!ctx || document.hidden) return;
    const miniRect = visibleMini();
    if (!visible && !miniRect) return;
    const frozen = paused || reduced.matches;
    const delta = Math.min(32, Math.max(0, now - frameTime)); frameTime = now;
    if (!frozen || !orbFrame || orbFrame.reduced !== reduced.matches) {
      const signal = window.TwinExperience?.signal || {};
      const mode = reduced.matches ? 'idle' : signal.mode === 'opening' ? 'processing' : signal.mode === 'playback' ? 'speaking' : signal.mode || 'idle';
      if (!frozen) { clock += delta; phase += delta * (mode === 'processing' ? .00062 : .00018); }
      const energy = reduced.matches ? 0 : Math.max(0, Math.min(1, Number(signal.level) || 0));
      const impulse = reduced.matches ? 0 : Math.max(0, Math.min(1, ((Number(signal.until) || 0) - now) / 650));
      scale += ((hover && !reduced.matches ? 1.055 : 1) - scale) * .1;
      orbFrame = { time: clock, rotation: phase, reduced: reduced.matches, energy, impulse,
        settings: { mode, scale, fit: innerWidth > 720 ? .852 : 1, hover: hover && !reduced.matches, pointer: { ...pointer } } };
    }
    const { time, rotation, energy, impulse, settings } = orbFrame;
    if (visible) {
      window.TwinOrbRenderer.paint(ctx, width, height, dpr, time, rotation, orbFrame.reduced, energy, impulse, false, settings);
      orbMetrics.mainFrames++;
    }
    if (miniRect) {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(miniRect.width * ratio), h = Math.round(miniRect.height * ratio);
      if (miniCanvas.width !== w || miniCanvas.height !== h) { miniCanvas.width = w; miniCanvas.height = h; }
      window.TwinOrbRenderer.paint(miniContext, miniRect.width, miniRect.height, ratio, time, rotation, orbFrame.reduced, energy, impulse, true, settings);
      orbMetrics.miniFrames++;
    }
    orbMetrics.frames++;
    if (!frozen) raf = requestAnimationFrame(draw);
  };
  restart = function() {
    cancelAnimationFrame(raf); frameTime = performance.now();
    if (!document.hidden && (visible || visibleMini())) raf = requestAnimationFrame(draw);
  };
  window.TwinCore.orbRevision = window.TwinOrbRenderer.revision;
  window.TwinCore.orbMetrics = orbMetrics;
  restart();
})();
