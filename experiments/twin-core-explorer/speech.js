'use strict';
/* Tap-to-talk, optional Web Speech navigation. No recording or transcript storage. */
(function () {
  let session = null;
  let sequence = 0;
  const speech = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  const active = s => session === s && s.id === sequence;
  function stop() {
    sequence++;
    const old = session;
    session = null;
    if (old) {
      clearTimeout(old.timeout); cancelAnimationFrame(old.frame);
      for (const track of old.stream?.getTracks() || []) track.stop();
      if (old.context) void old.context.close().catch(() => {});
      if (old.recognition) {
        for (const event of ['onstart','onaudiostart','onaudioend','onresult','onerror','onend','onnomatch']) old.recognition[event] = null;
        try { old.recognition.abort(); } catch { /* Already stopped. */ }
      }
    }
    listening = false;
    $('mic').setAttribute('aria-pressed', 'false');
    $('mic').setAttribute('aria-label', 'Use voice navigation');
    window.TwinExperience?.mode('idle');
    restart();
  }
  function fail(s, message) { if (!active(s)) return; stop(); $('status').textContent = message; }
  function markListening(s) {
    if (!active(s)) return;
    s.capturing = true;
    listening = true;
    $('mic').setAttribute('aria-pressed', 'true');
    $('status').textContent = 'Listening. Say a capability, or “go back”.';
    window.TwinExperience?.mode('listening');
  }
  async function meter(s) {
    // Optional second, local-only audio view. Recognition still works if it is unavailable.
    if (!navigator.mediaDevices?.getUserMedia || !active(s) || s.meterRequested) return;
    s.meterRequested = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active(s) || !s.capturing) { stream.getTracks().forEach(track => track.stop()); return; }
      s.stream = stream;
      const A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      const context = new A(); s.context = context;
      await context.resume();
      if (!active(s)) return;
      const analyser = context.createAnalyser(); analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const values = new Float32Array(analyser.fftSize);
      function read() {
        if (!active(s) || document.hidden || !listening) return;
        analyser.getFloatTimeDomainData(values);
        let total = 0; for (const value of values) total += value * value;
        const rms = Math.sqrt(total / values.length);
        window.TwinExperience.signal.level = Math.min(1, rms * 6);
        s.frame = requestAnimationFrame(read);
      }
      read();
    } catch {
      // No synthetic amplitude. Speech recognition and click/text navigation remain available.
      if (active(s)) window.TwinExperience.signal.level = 0;
    }
  }
  function begin() {
    $('voice-dialog').close(); stop(); window.TwinExperience?.suspend();
    const C = speech();
    if (!window.isSecureContext || !C) {
      $('status').textContent = 'Voice navigation is unavailable in this browser or context. Type a request or select a capability instead.';
      return;
    }
    const s = { id: sequence, recognition: null, timeout: 0, frame: 0, stream: null, context: null, meterRequested: false, capturing: false };
    session = s;
    $('mic').setAttribute('aria-label', 'Cancel voice navigation');
    $('status').textContent = 'Waiting for microphone permission. Press the microphone to cancel.';
    try {
      const r = new C(); s.recognition = r;
      r.lang = 'en-AU'; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1;
      r.onstart = () => { if (!active(s)) return; $('status').textContent = 'Speech service ready. Waiting for audio capture.'; };
      r.onaudiostart = () => { markListening(s); void meter(s); };
      r.onaudioend = () => {
        if (!active(s)) return;
        s.capturing = false; listening = false; cancelAnimationFrame(s.frame);
        for (const track of s.stream?.getTracks() || []) track.stop();
        $('mic').setAttribute('aria-pressed', 'false');
        window.TwinExperience?.mode('idle');
        $('status').textContent = 'Audio capture ended. Waiting for the recognised request.';
      };
      r.onresult = event => {
        if (!active(s)) return;
        let transcript = ''; let final = false;
        for (let i = 0; i < event.results.length; i++) { transcript += event.results[i][0].transcript + ' '; final ||= event.results[i].isFinal; }
        transcript = transcript.trim().slice(0, 240);
        $('query').value = transcript;
        if (final && transcript) { stop(); submitQuery(transcript); $('query').value = ''; }
      };
      r.onnomatch = () => fail(s, 'The request was not recognised clearly. Try again, type, or browse the capabilities.');
      r.onerror = event => {
        const messages = {
          'not-allowed': 'Microphone permission was denied. You can still type or browse.',
          'service-not-allowed': 'The browser speech service is blocked. You can still type or browse.',
          'audio-capture': 'No microphone is available. Type your request instead.',
          'no-speech': 'No speech was detected. Try again or type your request.',
          'network': 'The browser speech service could not connect. Type your request instead.',
          'language-not-supported': 'This speech service does not support the selected language. You can still type or browse.',
          'aborted': 'Voice navigation stopped.'
        };
        fail(s, messages[event.error] || 'Voice navigation could not finish. You can still type or browse.');
      };
      r.onend = () => fail(s, 'Voice session ended. Tap the microphone to try again, or type your request.');
      // Call synchronously from the explicit Start click, preserving browser gesture handling.
      s.timeout = setTimeout(() => fail(s, 'Voice session ended after 15 seconds. You can still type or browse.'), 15000);
      r.start();
    } catch { fail(s, 'Voice navigation could not start. You can still type or browse.'); }
  }
  $('mic').onclick = () => {
    if (session) { stop(); $('status').textContent = 'Voice navigation stopped.'; return; }
    if (!window.isSecureContext || !speech()) { $('status').textContent = 'Voice navigation is unavailable in this browser or context. Type a request or select a capability instead.'; return; }
    window.TwinExperience?.suspend(); $('voice-dialog').showModal();
  };
  $('voice-start').onclick = begin;
  $('voice-cancel').onclick = () => $('voice-dialog').close();
  window.TwinSpeech = { stop, isActive: () => !!session };
})();
