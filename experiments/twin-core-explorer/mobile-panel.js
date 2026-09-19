'use strict';
/* Option B mobile panel + shared rotating Twin question prompts for every viewport. */
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
  const questionTrack = node('span', undefined, 'question-track');
  questionPlaceholder.append(questionTrack);
  const description = '<strong>Twin Technologies</strong> builds its own autonomous AI models, digital identity, commercial infrastructure and connected systems within <strong>one unified platform.</strong>';
  const examples = [
    { hint: 'How can Twin automate my construction company…', compact: 'Can Twin automate construction…', question: 'How can Twin automate my construction company?', category: 'automation' },
    { hint: 'Can Twin build a Shopify store for me…', compact: 'Can Twin build my Shopify store…', question: 'Can Twin build a Shopify store for me?', category: 'crm', feature: 'system-integrations' },
    { hint: 'Can Twin help me write and debug code…', compact: 'Can Twin help me write code…', question: 'Can Twin help me write and debug code?' },
    { hint: 'Can Twin answer my customer enquiries…', compact: 'Can Twin answer customers…', question: 'Can Twin answer my customer enquiries?', category: 'sales', feature: 'lead-qualification' },
    { hint: 'Can Twin connect the apps I use…', compact: 'Can Twin connect my apps…', question: 'Can Twin connect the apps I use?', category: 'crm', feature: 'system-integrations' },
    { hint: 'Can Twin follow up my leads automatically…', compact: 'Can Twin follow up leads…', question: 'Can Twin follow up my leads automatically?', category: 'sales', feature: 'nurturing-follow-up' },
    { hint: 'Can Twin manage my emails and calendar…', compact: 'Can Twin manage my emails…', question: 'Can Twin manage my emails and calendar?', category: 'automation', feature: 'email-automation' },
    { hint: 'Can Twin create reports from my business data…', compact: 'Can Twin create business reports…', question: 'Can Twin create reports from my business data?', category: 'automation', feature: 'briefings-reporting' },
    { hint: 'Can Twin personalise replies to my customers…', compact: 'Can Twin personalise replies…', question: 'Can Twin personalise replies to my customers?', category: 'identity' },
    { hint: 'Can Twin reduce admin in my business…', compact: 'Can Twin reduce my admin…', question: 'Can Twin reduce admin in my business?', category: 'automation' }
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
  // Every example gets the same complete 2.5-second reading window.
  const QUESTION_DURATION = 2500;
  const START_HOLD = 350;
  const END_HOLD = 350;
  let rotationTimer = 0;
  let promptFrame = 0;
  let questionMotion = null;
  let pageSuspended = false;
  const questionHeading = node('div', 'See what Twin can do for you', 'question-heading');
  const questionHelp = node('span', 'Type any question. The rotating examples show the kinds of things you can ask Twin Intelligence.', 'visually-hidden');
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

  function ensureQuestionPrompt() {
    if (!questionInput.isConnected) {
      query.before(questionInput);
      questionInput.append(query, questionPlaceholder);
    }
    if (!questionHeading.isConnected) $('command-area').prepend(questionHeading);
    if (!questionHelp.isConnected) $('command-area').append(questionHelp);
    query.setAttribute('aria-label', 'Ask Twin Intelligence a question');
    query.setAttribute('aria-describedby', 'question-help');
    $('command').lastElementChild.setAttribute('aria-label', 'Ask Twin Intelligence');
    document.querySelectorAll('.question-example, .question-header').forEach(element => element.remove());
    const browse = $('browse');
    browse.hidden = true;
    browse.textContent = '';
    browse.tabIndex = -1;
    browse.setAttribute('aria-hidden', 'true');
  }

  function stopPromptCycle() {
    clearTimeout(rotationTimer);
    cancelAnimationFrame(promptFrame);
    rotationTimer = 0;
    promptFrame = 0;
    questionMotion?.cancel();
    questionMotion = null;
    questionTrack.style.transform = 'translateX(0px)';
  }
  function motionBlocked() {
    return pageSuspended || document.hidden || paused || reduced.matches ||
      Boolean(query.value) || document.activeElement === query ||
      Boolean(document.querySelector('dialog[open]'));
  }
  function updatePrompt() {
    stopPromptCycle();
    ensureQuestionPrompt();
    const editing = Boolean(query.value) || document.activeElement === query;
    questionPlaceholder.hidden = editing;
    query.placeholder = '';
    // Always display the complete example, including on the narrowest phones.
    questionTrack.textContent = examples[exampleIndex].hint;
    if (editing || motionBlocked()) return;
    promptFrame = requestAnimationFrame(() => {
      promptFrame = 0;
      if (motionBlocked() || questionInput.getBoundingClientRect().width <= 0) return;
      const availableWidth = questionPlaceholder.getBoundingClientRect().width;
      if (availableWidth <= 0) return;
      const overflow = Math.max(0, Math.ceil(
        questionTrack.getBoundingClientRect().width - availableWidth
      ));
      // Move only the clipped distance. A longer question travels faster, but
      // every question reaches its end before the same 2.5-second deadline.
      if (media.matches && overflow > 0 && questionTrack.animate) {
        const end = `translateX(-${overflow}px)`;
        questionMotion = questionTrack.animate([
          { transform: 'translateX(0px)', offset: 0 },
          { transform: 'translateX(0px)', offset: START_HOLD / QUESTION_DURATION },
          { transform: end, offset: 1 - END_HOLD / QUESTION_DURATION },
          { transform: end, offset: 1 }
        ], { duration: QUESTION_DURATION, easing: 'linear', fill: 'forwards' });
      }
      rotationTimer = setTimeout(() => {
        if (motionBlocked()) {
          updatePrompt();
          return;
        }
        exampleIndex = (exampleIndex + 1) % examples.length;
        updatePrompt();
      }, QUESTION_DURATION);
    });
  }
  function apply(previous) {
    ensureQuestionPrompt();
    updatePrompt();
    const active = media.matches;
    document.body.classList.toggle('mobile-panel-ui', active);
    if (!active) {
      panelParent.append(detailPanel);
      section.remove();
      $('back').hidden = false;
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
    const example = examples.find(item => normalise(item.question) === q);
    if (example?.category) {
      navigate({ view: 'core', category: example.category, ...(example.feature ? { feature: example.feature } : {}) });
      $('status').textContent = 'Relevant capabilities for your question are open below.';
    } else {
      baseSubmit(text);
      if (resolveIntent(text, state.category).kind === 'unknown') {
        $('status').textContent = 'Twin Intelligence will answer broader questions here once the conversational AI layer is connected.';
      }
    }
  };
  $('command').onsubmit = event => {
    if (!media.matches) {
      const result = baseFormSubmit(event);
      updatePrompt();
      return result;
    }
    event.preventDefault();
    const text = query.value.trim();
    if (!text) {
      $('status').textContent = 'Type a question for Twin Intelligence.';
      query.focus({ preventScroll: true });
      return;
    }
    submitQuery(text);
    query.value = '';
    updatePrompt();
  };
  query.addEventListener('input', updatePrompt);
  query.addEventListener('focus', updatePrompt);
  query.addEventListener('blur', updatePrompt);
  media.addEventListener('change', () => apply());
  reduced.addEventListener('change', updatePrompt);
  document.addEventListener('visibilitychange', updatePrompt);
  $('motion').addEventListener('click', updatePrompt);
  const promptSizeObserver = new ResizeObserver(updatePrompt);
  promptSizeObserver.observe(questionInput);
  const dialogObserver = new MutationObserver(updatePrompt);
  document.querySelectorAll('dialog').forEach(dialog => {
    dialogObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  });
  window.addEventListener('pagehide', () => {
    pageSuspended = true;
    stopPromptCycle();
  });
  window.addEventListener('pageshow', () => {
    pageSuspended = false;
    updatePrompt();
  });
  document.fonts?.ready.then(updatePrompt);
  window.TwinUI = Object.freeze({
    revision: 'option-b-prompts-5',
    questionDuration: QUESTION_DURATION,
    promptMotion: 'mobile-overflow-scroll',
    examples: examples.map(({ question }) => question)
  });
  apply();
})();
