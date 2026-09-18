'use strict';
/* Frontend-only experiences. No API calls, stored transcripts or live business operations. */
(function () {
  const signal = { level: 0, until: 0, mode: 'idle' };
  const dispose = [];
  let transitionTimer = 0;
  let noteTimer = 0;
  let currentAudio = null;
  const note = node('div', 'Ready', 'orb-note');
  note.id = 'orb-state';
  note.setAttribute('aria-hidden', 'true');
  $('stage').append(note);

  function mode(value, level = 0) {
    signal.mode = value;
    signal.level = Math.max(0, Math.min(1, Number(level) || 0));
    note.dataset.state = value;
    document.body.classList.toggle('listening', value === 'listening');
    note.textContent = value === 'listening' ? 'Listening' : value === 'playback' ? 'Playing your sample' : value === 'opening' ? 'Opening capability' : 'Ready';
    restart();
  }
  function pulse(label = 'Opening capability') {
    clearTimeout(noteTimer);
    signal.until = performance.now() + 650;
    if (!listening && !currentAudio) {
      mode('opening');
      note.textContent = label;
      noteTimer = setTimeout(() => { if (!listening && !currentAudio) mode('idle'); }, 650);
    }
    restart();
  }
  function suspend() {
    currentAudio?.pause();
    currentAudio = null;
    mode('idle');
  }
  function cleanup() {
    clearTimeout(noteTimer);
    clearTimeout(transitionTimer);
    signal.focused=false;
    $('stage').classList.remove('engaged');
    document.body.classList.remove('core-opening', 'revealing');
    for (const fn of dispose.splice(0)) fn();
    suspend();
  }
  function demoShell(title, label = 'Illustrative demo · fictional data') {
    const box = node('section', undefined, 'demo');
    box.append(node('p', label, 'demo-label'), node('h3', title));
    return box;
  }
  function control(text, fn, primary = false) {
    return button(text, fn, 'demo-button' + (primary ? ' primary' : ''));
  }
  function replaceKeepingFocus(parent, children, fallback) {
    const key = parent.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    parent.replaceChildren(...children);
    if (key) (parent.querySelector(`[data-key="${key}"]`) || fallback?.())?.focus({ preventScroll: true });
  }

  // A pure, bounded simulation model. Human approval and takeover are actual gates.
  function workflowStep(s, event) {
    if (event === 'reset') return { step: 0, approved: false, paused: false };
    if (event === 'takeover') return { ...s, paused: true };
    if (event === 'resume') return { ...s, paused: false };
    if (s.paused) return s;
    if (event === 'approve' && s.step === 3) return { ...s, approved: true, step: 4 };
    if (event === 'next' && s.step < 5 && (s.step !== 3 || s.approved)) return { ...s, step: s.step + 1 };
    return s;
  }
  const workflowScenes = [
    ['Customer enquiry', 'A new enquiry arrives', '“I’m looking for a black Ranger. Around $85,000, ideally in the next month. Can you help?”', ['Example customer: Jordan', 'Website enquiry']],
    ['Relevant memory', 'The conversation has context', 'An earlier discussion says Jordan plans to sell a Hilux first. The enquiry adds a budget, colour preference and buying timeframe.', ['Verified example identity', 'Previous conversation']],
    ['Prepared response', 'A response in the configured style', '“Hey Jordan, happy to help. Are you still waiting to sell the Hilux, or is that sorted? I’ve noted black, around $85k and within a month. Any must-have features?”', ['Draft only', 'No stock or finance promises']],
    ['Human approval', 'Review before the workflow proceeds', 'The draft is ready for a person to review. Nothing has been sent and the example CRM has not been updated. Approve it or take over the conversation.', ['Approval required', 'Workflow paused']],
    ['Example CRM record', 'The approved context becomes a record', 'Jordan · black Ranger · budget around $85k · within one month. Outstanding question: trade-in or sale of current vehicle. Owner: sales team.', ['Simulated record', 'No live CRM connection']],
    ['Next step', 'Follow-through, with stopping rules', 'Example task: follow up in two days if Jordan has not replied. Stop the sequence on reply, opt-out or operator takeover. Record the outcome rather than assuming delivery.', ['Illustrative schedule', 'No message was sent']]
  ];
  function workflowDemo(feature) {
    const box = demoShell('From enquiry to follow-through');
    box.dataset.demo = 'workflow';
    const content = node('div');
    box.append(content);
    let model = { step: 0, approved: false, paused: feature.id === 'human-handover' };
    function update(event) {
      model = workflowStep(model, event);
      pulse(model.paused ? 'Human handover' : 'Exploring workflow');
      renderDemo();
    }
    function renderDemo() {
      const guide = node('p', undefined, 'demo-guide');
      ['Understand', 'Communicate', 'Automate'].forEach((text, i) => guide.append(node('span', text, Math.min(2, Math.floor(model.step / 2)) === i ? 'active' : '')));
      const track = node('ol', undefined, 'demo-progress');
      track.setAttribute('aria-label', `Example workflow, step ${model.step + 1} of 6`);
      workflowScenes.forEach((scene, i) => {
        const item = node('li', undefined, i < model.step ? 'done' : i === model.step ? 'active' : '');
        item.setAttribute('aria-label', scene[0] + (i === model.step ? ', current step' : i < model.step ? ', inspected' : ', pending'));
        track.append(item);
      });
      const scene = workflowScenes[model.step];
      const output = node('div', undefined, 'demo-output');
      output.append(node('small', `${String(model.step + 1).padStart(2, '0')} / 06 · ${scene[0]}`), node('h4', model.paused ? 'A person is in control' : scene[1]), node('p', model.paused ? 'Automated responses and the next workflow step are paused. An authorised operator must explicitly resume this example.' : scene[2]));
      const chips = node('div', undefined, 'demo-context');
      scene[3].forEach(text => chips.append(node('span', text)));
      output.append(chips);
      const controls = node('div', undefined, 'demo-controls');
      if (model.paused) {
        const resume = control('Resume example workflow', () => update('resume'), true);
        resume.dataset.key = 'next'; controls.append(resume);
      } else if (model.step < 5) {
        const approval = model.step === 3;
        const next = control(approval ? 'Approve example draft' : 'Continue example →', () => update(approval ? 'approve' : 'next'), true);
        next.dataset.key = 'next'; controls.append(next);
        const takeover = control('Take over', () => update('takeover')); takeover.dataset.key = 'takeover'; controls.append(takeover);
      }
      const reset = button('Restart demo', () => update('reset'), 'demo-reset'); reset.dataset.key = 'reset'; controls.append(reset);
      const status = node('p', model.paused ? 'Simulation paused. No real systems are connected.' : model.step === 5 ? 'Example complete. No message, CRM update or task was sent to a real system.' : 'Step through the example. All customer data and results are fictional.', 'demo-result');
      status.setAttribute('role', 'status');
      replaceKeepingFocus(content, [guide, track, output, controls, status], () => reset);
      box.dataset.step = String(model.step); box.dataset.paused = String(model.paused); box.dataset.approved = String(model.approved);
    }
    renderDemo();
    return box;
  }

  const priorities = [
    { title: 'Review a qualified vehicle enquiry', meta: 'Sales · response requires approval', source: 'CRM record EX-014', evidence: 'Budget $85,000; black Ranger; one-month timeframe. The reply is a draft, not a delivered message.', next: 'Review the prepared reply to Jordan.', freshness: 'Example snapshot · 08:42' },
    { title: 'Verify a delivery update', meta: 'Operations · information needs checking', source: 'Delivery record EX-028', evidence: 'Transport booking is recorded. Final collection time is not confirmed. The assistant must not invent a delivery date.', next: 'Confirm the transport time before updating the customer.', freshness: 'Example snapshot · verification pending' },
    { title: 'Prepare for the next customer call', meta: 'Calendar · outstanding questions', source: 'Calendar and notes EX-006', evidence: 'Customer call at 11:00 in the example calendar. Notes list three requested accessories; availability has not been checked.', next: 'Review the accessories list before the 11:00 call.', freshness: 'Example snapshot · 08:35' }
  ];
  function briefingDemo() {
    const box = demoShell('Your business, brought into focus'); box.dataset.demo = 'briefing';
    box.append(node('p', 'Inspect a priority, see the source behind it, then assemble the example owner’s briefing.'));
    const rows = node('div', undefined, 'briefing-items');
    const source = node('div', undefined, 'demo-source'); source.setAttribute('role', 'status');
    const summary = node('div', undefined, 'briefing-summary'); summary.hidden = true;
    const buttons = [];
    function select(i) {
      buttons.forEach((b, n) => b.setAttribute('aria-pressed', String(n === i)));
      const p = priorities[i];
      source.replaceChildren(node('small', `${p.source} · ${p.freshness}`), node('p', p.evidence));
      pulse('Inspecting example source');
    }
    priorities.forEach((p, i) => {
      const b = control('', () => select(i)); b.className = 'briefing-item';
      const copy = node('span'); copy.append(node('b', p.title), node('small', p.meta));
      b.append(node('span', `0${i + 1}`, 'briefing-number'), copy); b.setAttribute('aria-pressed', String(i === 0)); buttons.push(b); rows.append(b);
    });
    const assemble = control('Assemble example briefing →', () => {
      summary.hidden = false;
      summary.replaceChildren(node('h3', 'Today’s priorities'), ...priorities.map(p => node('p', p.next)), node('small', 'Built from the three fictional source records above. No live business information.'));
      assemble.textContent = 'Example briefing assembled'; assemble.setAttribute('aria-expanded', 'true'); pulse('Example briefing ready');
    }, true);
    assemble.setAttribute('aria-expanded', 'false');
    box.append(rows, source, node('div', undefined, 'demo-controls')); box.lastChild.append(assemble); box.append(summary);
    const p = priorities[0]; source.append(node('small', `${p.source} · ${p.freshness}`), node('p', p.evidence));
    return box;
  }

  function privacyDemo() {
    const box = demoShell('See the data boundaries', 'Illustrative architecture · custom deployment');
    box.dataset.demo = 'privacy';
    box.append(node('p', 'Explore two deployment patterns. The final design depends on the integrations and providers selected.'));
    const controls = node('div', undefined, 'demo-controls');
    const path = node('div', undefined, 'privacy-path'); path.setAttribute('role', 'status');
    const modes = ['Customer-controlled', 'Dedicated managed'];
    let selected = 0;
    const buttons = modes.map((text, i) => control(text, () => { selected = i; renderPath(); pulse('Exploring data boundaries'); }));
    controls.append(...buttons); box.append(controls, path);
    function zone(title, text) { const z = node('div', undefined, 'privacy-zone'); z.append(node('small', title), node('p', text)); return z; }
    function renderPath() {
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === selected)));
      path.replaceChildren(
        zone(selected === 0 ? 'Customer-controlled environment' : 'Dedicated managed environment', selected === 0 ? 'Customer account: application, memory, business records and scoped integration credentials.' : 'An isolated deployment managed under agreed operational and access arrangements.'),
        node('div', 'Approved information only ↓', 'privacy-connector'),
        zone('External processing, when configured', 'An approved model, voice or connected software provider may process the information needed for its task.'),
        node('div', 'Provider response ↓', 'privacy-connector'),
        zone('Governed output', 'Permissions, approval requirements and activity records apply before an output reaches a connected system.')
      );
    }
    renderPath();
    box.append(node('p', 'Owning the cloud account does not automatically mean all processing stays inside it. Provider access, support access and retention must be specified.'));
    return box;
  }

  function voiceDemo() {
    const box = demoShell('Hear the identity, not a generic voice', 'Local sample comparison · no voice generation');
    box.dataset.demo = 'voice';
    box.append(node('p', 'Compare an original recording with an authorised AI-generated sample. Select your own files to try playback; files stay in this browser session and are not uploaded.'));
    const consentLabel = node('label', undefined, 'sample-consent');
    const consent = document.createElement('input'); consent.type = 'checkbox'; consent.id = 'sample-consent';
    consentLabel.append(consent, node('span', 'I own these recordings or have permission to use the voice and both samples.'));
    box.append(consentLabel);
    const grid = node('div', undefined, 'sample-grid');
    const slots = [];
    let audioContext = null, meterFrame = 0, disposed = false;
    const sources = new Map();
    function stopMeter() { cancelAnimationFrame(meterFrame); signal.level = 0; }
    async function attachMeter(player) {
      try {
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return;
        audioContext ||= new A();
        await audioContext.resume();
        if (disposed || player.paused) return;
        let analyser = sources.get(player);
        if (!analyser) {
          analyser = audioContext.createAnalyser(); analyser.fftSize = 256;
          audioContext.createMediaElementSource(player).connect(analyser); analyser.connect(audioContext.destination); sources.set(player, analyser);
        }
        const values = new Float32Array(analyser.fftSize);
        function read() {
          if (disposed || player.paused || document.hidden) return;
          analyser.getFloatTimeDomainData(values);
          const rms = Math.sqrt(values.reduce((sum, n) => sum + n * n, 0) / values.length);
          signal.level = Math.min(1, rms * 5);
          meterFrame = requestAnimationFrame(read);
        }
        stopMeter(); read();
      } catch { /* Playback remains usable without the optional visual analyser. */ }
    }
    ['Original recording', 'Authorised AI-generated sample'].forEach((title, i) => {
      const block = node('div', undefined, 'sample-block'); block.append(node('b', title));
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'audio/*'; input.disabled = true; input.setAttribute('aria-label', `Select ${title.toLowerCase()}`);
      const name = node('p', 'No sample selected', 'sample-name'); name.setAttribute('role', 'status');
      const player = document.createElement('audio'); player.controls = true; player.preload = 'metadata'; player.hidden = true; player.setAttribute('aria-label', title);
      const slot = { input, player, url: null, name };
      input.onchange = () => {
        player.pause();
        if (slot.url) { URL.revokeObjectURL(slot.url); slot.url = null; }
        player.removeAttribute('src'); player.load(); player.hidden = true;
        const file = input.files?.[0];
        if (!file) { name.textContent = 'No sample selected'; return; }
        if (!consent.checked || file.size > 15 * 1024 * 1024 || !file.type.startsWith('audio/')) {
          name.textContent = 'Select a supported audio file under 15 MB, with permission.'; input.value = ''; return;
        }
        slot.url = URL.createObjectURL(file); player.src = slot.url; player.hidden = false;
        name.textContent = file.name; pulse('Sample ready');
      };
      player.onplay = () => { stopVoice(); slots.forEach(s => { if (s.player !== player) s.player.pause(); }); currentAudio = player; mode('playback'); void attachMeter(player); };
      player.onpause = player.onended = () => { if (currentAudio === player) { currentAudio = null; stopMeter(); mode('idle'); } };
      player.onerror = () => { name.textContent = 'This browser could not play the selected file. Try another supported audio format.'; player.hidden = true; if (currentAudio === player) suspend(); };
      block.append(input, name, player); grid.append(block); slots.push(slot);
    });
    function clearSamples() {
      for (const s of slots) { s.player.pause(); s.player.removeAttribute('src'); s.player.load(); s.player.hidden = true; s.input.value = ''; s.name.textContent = 'No sample selected'; if (s.url) URL.revokeObjectURL(s.url); s.url = null; }
      stopMeter();
    }
    consent.onchange = () => { slots.forEach(s => s.input.disabled = !consent.checked); if (!consent.checked) clearSamples(); };
    dispose.push(() => { disposed = true; clearSamples(); if (audioContext) void audioContext.close().catch(() => {}); });
    box.append(grid, node('p', 'The preview does not create or verify a cloned voice. A supplied AI sample is labelled by you. A public before/after demonstration can be connected once approved recordings are supplied.'));
    return box;
  }

  const workflowIds = new Set(['relationship-context','conversational-intelligence','human-handover','workflow-orchestration','email-automation','documents-data','lead-qualification','nurturing-follow-up','customer-lifecycle','retention','crm-workspace','team-collaboration','audit-approvals']);
  const briefingIds = new Set(['business-knowledge','persistent-memory','memory-management','calendar-tasks','automated-briefings','pipeline-intelligence','revenue-performance']);
  function refresh(category, feature, previous) {
    cleanup();
    note.hidden = state.view !== 'core';
    const groupChanged = previous && (previous.view !== state.view || previous.category !== state.category);
    if (groupChanged && !reduced.matches && !paused) {
      document.body.classList.add('core-opening', 'revealing');
      transitionTimer = setTimeout(() => document.body.classList.remove('core-opening', 'revealing'), 800);
      pulse(state.category ? 'Opening category' : 'Opening the Core');
    } else if (previous && previous.feature !== state.feature) pulse(feature ? 'Opening capability' : 'Returning to category');
    if (feature) {
      let demo = null;
      if (feature.id === 'voice-cloning' || feature.id === 'voice-messages') demo = voiceDemo();
      else if (workflowIds.has(feature.id)) demo = workflowDemo(feature);
      else if (briefingIds.has(feature.id)) demo = briefingDemo();
      else if (category.id === 'privacy') demo = privacyDemo();
      if (demo) $('panel').insertBefore(demo, $('panel').querySelector('h3'));
      $('panel').scrollTop = 0;
    }
    const stage = $('stage');
    const labels = [...$('nodes').querySelectorAll('.node')];
    labels.forEach((label, i) => {
      const highlight = () => { stage.classList.add('engaged'); stage.style.setProperty('--bearing', label.style.getPropertyValue('--angle')); signal.targetX=Number(label.style.getPropertyValue('--nx')); signal.targetY=Number(label.style.getPropertyValue('--ny')); signal.focused=true; restart(); };
      label.onpointerenter = label.onfocus = highlight;
      label.onpointerleave = label.onblur = () => {stage.classList.remove('engaged');signal.focused=false;restart();};
      label.onkeydown = e => {
        let index = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') index = (i + 1) % labels.length;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') index = (i + labels.length - 1) % labels.length;
        if (e.key === 'Home') index = 0;
        if (e.key === 'End') index = labels.length - 1;
        if (index !== null) { e.preventDefault(); labels[index].focus({ preventScroll: true }); }
      };
    });
  }
  $('query').addEventListener('input', () => { if (listening || window.TwinSpeech?.isActive()) stopVoice(); if ($('query').value) pulse('Receiving your request'); });
  window.TwinExperience = { signal, mode, pulse, suspend, cleanup, refresh, workflowStep };
  window.TwinCore.workflowStep = workflowStep;
  refresh(getCategory(state.category), getCategory(state.category)?.features.find(f => f.id === state.feature));
})();
