'use strict';
/* Option B: one mobile capability panel. Suggestions navigate; no model is connected. */
(() => {
  const media = matchMedia('(max-width:720px)');
  const baseRender = render;
  const baseSubmit = submitQuery;
  const baseFormSubmit = $('command').onsubmit;
  const detailPanel = $('panel');
  const panelParent = detailPanel.parentElement;
  const query = $('query');
  const questionInput = node('span', undefined, 'question-input');
  const questionPlaceholder = node('span', undefined, 'question-placeholder');
  questionPlaceholder.setAttribute('aria-hidden', 'true');
  const initialLabel = query.getAttribute('aria-label');
  const initialDescription = query.getAttribute('aria-describedby');
  const originalSubmitLabel = $('command').lastElementChild.getAttribute('aria-label');
  const description = '<strong>Twin Technologies</strong> builds its own autonomous AI models, digital identity, commercial infrastructure and connected systems within <strong>one unified platform.</strong>';
  const examples = [
    { hint: 'How can I automate my construction company…', compact: 'Can you automate my business…', question: 'How can I automate my construction company?', category: 'automation' },
    { hint: 'Can you connect the apps I use…', compact: 'Can you connect my apps…', question: 'Can you connect the apps I already use?', category: 'crm', feature: 'system-integrations' },
    { hint: 'Can you follow up my leads…', compact: 'Can you follow up leads…', question: 'How can I follow up leads automatically?', category: 'sales', feature: 'nurturing-follow-up' },
    { hint: 'Can you handle customer enquiries…', compact: 'Can you handle enquiries…', question: 'Can you help handle customer enquiries?', category: 'sales', feature: 'lead-qualification' },
    { hint: 'How can I cut down on paperwork…', compact: 'Can you cut my paperwork…', question: 'How can I spend less time on paperwork?', category: 'automation', feature: 'documents-data' }
  ];
  const benefits = {
    identity: 'Remember your customers and the details that matter.',
    communication: 'Communicate naturally, in your style and authorised voice.',
    automation: 'Spend less time on paperwork, emails and routine work.',
    sales: 'Keep enquiries, follow-ups and customer updates moving.',
    crm: 'Connect the software you use and keep customer records together.',
    privacy: 'Set who can access your data and how it is processed.'
  };
  let exampleIndex = 0;
  let rotationTimer = 0;
  const questionHeader = node('div', undefined, 'question-header');
  const questionLabel = node('label', 'What would you like to do?');
  questionLabel.htmlFor = 'query';
  const exampleButton = button('Try example', () => {
    const example = examples[exampleIndex];
    query.value = example.question;
    query.focus({ preventScroll: true });
    query.dispatchEvent(new Event('input', { bubbles: true }));
  }, 'question-example');
  questionHeader.append(questionLabel, exampleButton);
  const questionHelp = node('span', 'Try an example or write your question. This preview opens relevant capabilities; conversational AI answers are not connected yet.', 'visually-hidden');
  questionHelp.id = 'question-help';
  const section = node('section', undefined, 'capability-panel');
  section.id = 'capability-panel';
  section.setAttribute('aria-labelledby', 'capabilities-heading');
  const headingRow = node('div', undefined, 'capability-heading');
  const heading = node('h2', 'Explore capabilities');
  heading.id = 'capabilities-heading';
  headingRow.append(heading, node('span', `${CATALOGUE.length} systems`));
  const grid = node('div', undefined, 'capability-grid');
  const featureSection = node('section', undefined, 'system-features');
  featureSection.id = 'system-features';
  featureSection.hidden = true;
  const gridButtons = CATALOGUE.map(category => {
    const b = button('', () => {
      const current = window.TwinCore.getState();
      navigate(current.category === category.id && !current.feature ? { view: 'core' } : { view: 'core', category: category.id });
    }, 'system-button');
    b.dataset.system = category.id;
    b.setAttribute('aria-controls', featureSection.id);
    b.append(node('span', category.name, 'system-name'), node('span', `${category.features.length} capabilities`, 'system-count'));
    grid.append(b);
    return b;
  });
  grid.addEventListener('keydown', event => {
    const i = gridButtons.indexOf(document.activeElement);
    if (i < 0) return;
    const offsets = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 2, ArrowUp: -2 };
    let next = event.key === 'Home' ? 0 : event.key === 'End' ? gridButtons.length - 1 : null;
    if (event.key in offsets) next = (i + offsets[event.key] + gridButtons.length) % gridButtons.length;
    if (next !== null) { event.preventDefault(); gridButtons[next].focus(); }
  });
  section.append(headingRow, grid, featureSection);
  function updatePrompt() {
    if (!media.matches) return;
    const example = examples[exampleIndex];
    exampleButton.title = example.question;
    exampleButton.setAttribute('aria-label', `Use example: ${example.question}`);
    const editing = Boolean(query.value) || document.activeElement === query;
    questionPlaceholder.hidden = editing;
    query.placeholder = editing && !query.value ? 'Your question…' : '';
    questionPlaceholder.textContent = innerWidth < 370 ? example.compact : example.hint;
  }
  function scheduleExamples() {
    clearInterval(rotationTimer);
    if (!media.matches || document.hidden || reduced.matches) return;
    rotationTimer = setInterval(() => {
      if (paused || reduced.matches || document.hidden || query.value || document.activeElement === query || document.querySelector('dialog[open]')) return;
      exampleIndex = (exampleIndex + 1) % examples.length;
      updatePrompt();
    }, 6500);
  }
  function apply(previous) {
    const active = media.matches;
    document.body.classList.toggle('mobile-panel-ui', active);
    if (!active) {
      panelParent.append(detailPanel);
      section.remove(); questionHeader.remove(); questionHelp.remove();
      if (questionInput.isConnected) questionInput.replaceWith(query);
      questionPlaceholder.remove();
      $('back').hidden = false;
      query.setAttribute('aria-label', initialLabel);
      if (initialDescription) query.setAttribute('aria-describedby', initialDescription);
      else query.removeAttribute('aria-describedby');
      $('command').lastElementChild.setAttribute('aria-label', originalSubmitLabel);
      clearInterval(rotationTimer);
      return;
    }
    const current = window.TwinCore.getState();
    $('title').innerHTML = 'Twin <span>Intelligence</span>';
    $('subtitle').innerHTML = description;
    $('command-area').hidden = false;
    $('hero-hit').hidden = true;
    $('explore').hidden = true;
    $('nodes').hidden = true;
    $('preview-note').hidden = true;
    $('back').hidden = !current.category;
    query.setAttribute('aria-label', 'Your question for Twin');
    query.setAttribute('aria-describedby', 'question-help');
    $('command').lastElementChild.setAttribute('aria-label', 'Explore your question');
    if (!questionInput.isConnected) {
      query.before(questionInput);
      questionInput.append(query, questionPlaceholder);
    }
    $('command-area').prepend(questionHeader);
    questionHeader.after(questionHelp);
    document.querySelector('.core-side').append(section);
    section.append(detailPanel);
    gridButtons.forEach(b => {
      const selected = current.category === b.dataset.system;
      b.setAttribute('aria-expanded', String(selected));
      b.dataset.selected = String(selected);
    });
    featureSection.replaceChildren();
    featureSection.hidden = !current.category;
    if (current.category) {
      const category = getCategory(current.category);
      const title = node('h3', category.name);
      title.id = 'selected-system-title'; title.tabIndex = -1;
      featureSection.setAttribute('aria-labelledby', title.id);
      const links = node('div', undefined, 'system-feature-links');
      for (const feature of category.features) {
        const b = button(feature.name, () => navigate({ view: 'core', category: category.id, feature: feature.id }), 'system-feature');
        b.dataset.feature = feature.id;
        b.setAttribute('aria-current', String(current.feature === feature.id));
        links.append(b);
      }
      featureSection.append(title, node('p', benefits[category.id]), links);
    }
    updatePrompt();
    if (previous) {
      const target = current.feature ? $('feature-title') : current.category ? $('selected-system-title') : gridButtons.find(b => b.dataset.system === previous.category);
      if (target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'nearest', behavior: reduced.matches || paused ? 'instant' : 'smooth' });
      }
    }
    requestAnimationFrame(resize);
  }
  render = function(previous) {
    if (media.matches) focusHint = null;
    baseRender(previous);
    apply(previous);
  };
  submitQuery = function(text) {
    if (!media.matches) return baseSubmit(text);
    const q = normalise(text);
    const example = examples.find(item => normalise(item.question) === q || normalise(item.hint) === q || normalise(item.compact) === q);
    if (example) {
      navigate({ view: 'core', category: example.category, ...(example.feature ? { feature: example.feature } : {}) });
      $('status').textContent = 'Relevant capabilities for your question are open below.';
    } else {
      baseSubmit(text);
      if (resolveIntent(text, state.category).kind === 'unknown') {
        $('status').textContent = 'This preview opens relevant capabilities, rather than answering every question. Try automation, app connections, leads or privacy.';
      }
    }
  };
  $('command').onsubmit = event => {
    if (!media.matches) return baseFormSubmit(event);
    event.preventDefault();
    const text = query.value.trim();
    if (!text) {
      $('status').textContent = 'Write your question, or tap Try example.';
      query.focus({ preventScroll: true });
      return;
    }
    submitQuery(text);
    query.value = '';
    updatePrompt();
  };
  query.addEventListener('focus', updatePrompt);
  query.addEventListener('blur', updatePrompt);
  query.addEventListener('input', updatePrompt);
  media.addEventListener('change', () => { apply(); scheduleExamples(); });
  reduced.addEventListener('change', scheduleExamples);
  document.addEventListener('visibilitychange', scheduleExamples);
  window.addEventListener('resize', updatePrompt);
  window.addEventListener('pagehide', () => clearInterval(rotationTimer));
  window.addEventListener('pageshow', scheduleExamples);
  document.fonts?.ready.then(updatePrompt);
  window.TwinUI = Object.freeze({ revision: 'option-b-1', examples: examples.map(({ question }) => question) });
  apply();
  scheduleExamples();
})();
