'use strict';
/* UI copy and palette integration only. Orb renderer is deliberately untouched. */
(() => {
  const originalRender = render;
  const description = '<strong>Twin Technologies</strong> builds its own autonomous AI models, digital identity, commercial infrastructure and connected systems within <strong>one unified platform.</strong>';
  function applyBrand() {
    document.title = 'Twin Intelligence';
    const current = window.TwinCore.getState();
    if (!current.category) {
      $('title').innerHTML = 'Twin <span>Intelligence</span>';
      $('subtitle').innerHTML = description;
    }
    document.querySelector('.title').setAttribute('aria-label', 'Twin Intelligence');
    if (!$('home').querySelector('.mobile-brand')) {
      $('home').innerHTML = 'Twin<span class="brand-dot">.</span>';
    }
    $('hero-hit').setAttribute('aria-label', 'Explore Twin Intelligence');
    $('explore').innerHTML = 'Explore Twin Intelligence <span aria-hidden="true">↗</span>';
    $('voice-title').textContent = 'Speak to Twin';
    $('browse-title').textContent = 'Explore Twin Intelligence';
    for (const crumb of $('crumbs').querySelectorAll('button')) {
      if (crumb.textContent.trim() === 'Core') crumb.textContent = 'Intelligence';
    }
  }
  render = function(previous) {
    originalRender(previous);
    applyBrand();
  };
  window.TwinBrand = { accent: '#167CB4', revision: 'azure-copy-1' };
  applyBrand();
})();
