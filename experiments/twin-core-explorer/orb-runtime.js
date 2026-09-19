'use strict';
/* One persistent renderer and clock for every view. The approved blue geometry is unchanged. */
(() => {
  let miniCanvas = null, miniContext = null;
  const mouse = { x: 0, y: 0, active: false };
  const smoothed = { x: 0, y: 0 };
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const orbMetrics = { frames: 0, mainFrames: 0, miniFrames: 0, pixelRatio: 1, rotation: phase };
  const nativeRatio = () => Math.max(1, Number(window.devicePixelRatio) || 1);
  function visibleMini() {
    const found = $('mini-orb');
    if (found !== miniCanvas) { miniCanvas = found; miniContext = found?.getContext('2d', { alpha: true }) || null; }
    if (!miniCanvas || !miniContext || !miniCanvas.isConnected) return null;
    const rect = miniCanvas.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight ? rect : null;
  }
  resize = function() {
    width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight); dpr = nativeRatio();
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    orbMetrics.pixelRatio = dpr; restart();
  };
  ro.disconnect();
  const sizeObserver = new ResizeObserver(() => resize());
  sizeObserver.observe(canvas);
  window.addEventListener('resize', resize, { passive: true });
  function clearPointer() { mouse.active = false; mouse.x = mouse.y = 0; }
  $('stage').addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !finePointer.matches) { clearPointer(); return; }
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1;
    const y = (event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1;
    mouse.active = Math.abs(x) < .75 && Math.abs(y) < .75;
    mouse.x = mouse.active ? x : 0; mouse.y = mouse.active ? y : 0;
  }, { passive: true });
  $('stage').addEventListener('pointerleave', clearPointer, { passive: true });
  document.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse') clearPointer(); }, { passive: true });
  window.addEventListener('blur', clearPointer);
  draw = function(now) {
    raf = 0;
    if (!ctx || document.hidden) return;
    const miniRect = visibleMini();
    if (!visible && !miniRect) return;
    const frozen = paused || reduced.matches;
    const delta = Math.min(32, Math.max(0, now - frameTime)); frameTime = now;
    const signal = window.TwinExperience?.signal || {};
    const mode = reduced.matches ? 'idle' : signal.mode === 'opening' ? 'processing' : signal.mode === 'playback' ? 'speaking' : signal.mode || 'idle';
    if (!frozen) { clock += delta; phase += delta * (mode === 'processing' ? .00062 : .00018); }
    const active = mouse.active && finePointer.matches && !reduced.matches;
    if (!frozen) {
      const blend = 1 - Math.exp(-delta / 100);
      smoothed.x += ((active ? mouse.x : 0) - smoothed.x) * blend;
      smoothed.y += ((active ? mouse.y : 0) - smoothed.y) * blend;
      scale += ((active ? 1.055 : 1) - scale) * blend;
    }
    hover = active; pointer.x = reduced.matches ? 0 : smoothed.x; pointer.y = reduced.matches ? 0 : smoothed.y;
    const energy = reduced.matches ? 0 : Math.max(0, Math.min(1, Number(signal.level) || 0));
    const impulse = frozen ? 0 : Math.max(0, Math.min(1, ((Number(signal.until) || 0) - now) / 650));
    const settings = { mode, scale: reduced.matches ? 1 : scale, fit: innerWidth > 720 ? .852 : 1, hover: active, pointer: { ...pointer } };
    if (visible) {
      window.TwinOrbRenderer.paint(ctx, width, height, dpr, clock, phase, reduced.matches, energy, impulse, false, settings);
      orbMetrics.mainFrames++;
    }
    if (miniRect) {
      const ratio = nativeRatio(), miniW = miniCanvas.clientWidth, miniH = miniCanvas.clientHeight;
      const w = Math.round(miniW * ratio), h = Math.round(miniH * ratio);
      if (miniCanvas.width !== w) miniCanvas.width = w;
      if (miniCanvas.height !== h) miniCanvas.height = h;
      window.TwinOrbRenderer.paint(miniContext, miniW, miniH, ratio, clock, phase, reduced.matches, energy, impulse, true, settings);
      orbMetrics.miniFrames++;
    }
    orbMetrics.frames++; orbMetrics.rotation = phase; orbMetrics.pointer = { ...pointer }; orbMetrics.hover = active;
    if (!frozen) raf = requestAnimationFrame(draw);
  };
  restart = function() {
    cancelAnimationFrame(raf); frameTime = performance.now();
    if (!document.hidden && (visible || visibleMini())) raf = requestAnimationFrame(draw);
  };
  window.TwinCore.orbRevision = window.TwinOrbRenderer.revision;
  window.TwinCore.orbRuntimeRevision = 'native-resolution-continuous-6';
  window.TwinCore.orbMetrics = orbMetrics;
  resize();
})();
