'use strict';
/* Mobile layout only. Drawing is provided by twin-orb.js and orb-runtime.js. */
(() => {
  const media = matchMedia('(max-width:720px)');
  const savedBrand = $('home').innerHTML;
  const savedPlaceholder = $('query').placeholder;
  const baseRender = render;
  const miniWrap = node('span', undefined, 'mini-orb-wrap');
  const mini = node('canvas'); mini.id = 'mini-orb'; mini.setAttribute('aria-hidden', 'true');
  miniWrap.setAttribute('aria-hidden', 'true'); miniWrap.append(mini);
  const markerOrder = ['identity', 'communication', 'automation', 'sales', 'crm', 'privacy'];
  const captions = {
    identity: ['Identity & Memory'], communication: ['Voice Cloning', '& Communication'],
    automation: ['Business', 'Automation'], sales: ['Sales & Customer', 'Automation'],
    crm: ['CRM &', 'Integrations'], privacy: ['Private', 'Intelligence']
  };
  const motionControl = button('Pause animation', () => { $('motion').click(); syncMotion(); }, 'mobile-motion-button');
  motionControl.id = 'mobile-motion';
  function syncMotion() {
    motionControl.textContent = paused ? 'Resume animation' : 'Pause animation';
    motionControl.setAttribute('aria-pressed', String(paused));
  }
  function layout() {
    if (!media.matches || state.category || state.view !== 'core') return;
    const stage = $('stage'), w = stage.getBoundingClientRect().width;
    const radius = Math.min(164, w * .365), radiusY = Math.max(178, radius * 1.09), h = radiusY * 2 + 156;
    stage.style.setProperty('--mobile-radius', radius + 'px');
    stage.style.setProperty('--mobile-radius-y', radiusY + 'px');
    stage.style.setProperty('--mobile-stage-height', h + 'px');
    stage.style.setProperty('--mobile-orb-size', Math.min(290, w * .70) + 'px');
    for (const b of $('nodes').children) {
      const i = markerOrder.indexOf(b.dataset.id);
      if (i < 0) continue;
      const angle = -Math.PI / 2 + i * Math.PI / 3;
      const x = w / 2 + Math.cos(angle) * radius;
      b.style.setProperty('--mx', x + 'px');
      const labelWidth = w <= 350 ? 108 : 124;
      b.style.setProperty('--label-width', (i === 0 || i === 3 ? Math.min(220, w - 36) : labelWidth) + 'px');
      const side = b.dataset.side === 'left' ? -12 : b.dataset.side === 'right' ? 12 : 0;
      const centre = Math.max(labelWidth / 2 + 6, Math.min(w - labelWidth / 2 - 6, x + side));
      b.style.setProperty('--label-shift', (i === 0 || i === 3 ? 0 : centre - x) + 'px');
      b.style.setProperty('--my', (h / 2 + Math.sin(angle) * radiusY) + 'px');
    }
  }
  function refresh() {
    const active = media.matches;
    document.body.classList.toggle('mobile-design', active);
    document.body.classList.toggle('mobile-root', active && !state.category);
    if (!active) {
      $('home').innerHTML = savedBrand; $('query').placeholder = savedPlaceholder;
      miniWrap.remove(); motionControl.remove(); return;
    }
    $('home').innerHTML = '<span class="mobile-brand">Twin<b>.</b></span><span class="mobile-technologies">TECHNOLOGIES</span>';
    $('query').placeholder = 'Ask Twin…';
    if (!miniWrap.isConnected) $('command').prepend(miniWrap);
    if (!motionControl.isConnected) $('browse-dialog').insertBefore(motionControl, $('browse-close').parentElement);
    syncMotion();
    if (!state.category) {
      $('title').innerHTML = 'Twin <span>Intelligence Core</span>';
      $('subtitle').textContent = 'Twin Technologies builds its own autonomous AI, digital identity, commercial infrastructure and connected systems within one unified technology platform.';
      if (state.view === 'core') for (const b of $('nodes').children) {
        const mark = node('span', undefined, 'mobile-marker'); mark.setAttribute('aria-hidden', 'true');
        const label = node('span', undefined, 'node-title');
        (captions[b.dataset.id] || [b.getAttribute('aria-label')]).forEach((s, i) => { if (i) label.append(document.createElement('br')); label.append(document.createTextNode(s)); });
        const caption = node('span', undefined, 'mobile-label');
        const item = CATALOGUE.find(c => c.id === b.dataset.id);
        const meta = node('span', `${item.features.length} capabilities`, 'mobile-meta');
        meta.setAttribute('aria-hidden', 'true'); caption.append(label, meta); b.replaceChildren(mark, caption);
      }
    }
    layout();
  }
  render = function(previous) { baseRender(previous); refresh(); };
  const miniObserver = new IntersectionObserver(() => restart()); miniObserver.observe(mini);
  const stageObserver = new ResizeObserver(() => { layout(); restart(); }); stageObserver.observe($('stage'));
  media.addEventListener('change', () => { render(); resize(); });
  reduced.addEventListener('change', () => { syncMotion(); restart(); });
  window.TwinMobile = { sourceBlob: window.TwinOrbRenderer.sourceBlob, logicalDock: { width: 118, height: 86 }, orbRevision: window.TwinOrbRenderer.revision, layout };
  document.fonts?.ready.then(() => { layout(); resize(); });
  refresh(); resize();
})();
