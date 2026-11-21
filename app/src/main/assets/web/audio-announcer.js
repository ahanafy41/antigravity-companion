/**
 * Antigravity Companion App - Audio Chimes & Accessibility Announcer
 * Clean Architecture Modular Engine
 *
 * Provides synthesized earcons (beeps, success, tool, start chimes) and accessible
 * live audio announcements via aria-live elements and SpeechSynthesis for TalkBack & Jieshuo.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AudioAnnouncer = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  function createAudioAnnouncer(options) {
    const opts = options || {};
    let doc = opts.document || (typeof document !== 'undefined' ? document : null);
    let announcerEl = opts.announcer || (doc ? doc.getElementById('sr-announcer') : null);
    let audioCtx = null;

    function getAudioContext() {
      if (typeof window === 'undefined') return null;
      if (!audioCtx) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (AudioCtor) audioCtx = new AudioCtor();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    }

    function areTonesEnabled() {
      if (typeof window === 'undefined') return false;
      const prefs = (window.mainV1 && typeof window.mainV1.preferences === 'function') ? window.mainV1.preferences() : {};
      return (prefs.tones_enabled !== false && prefs.sound !== false);
    }

    function areHapticsEnabled() {
      if (typeof window === 'undefined') return false;
      const prefs = (window.mainV1 && typeof window.mainV1.preferences === 'function') ? window.mainV1.preferences() : {};
      return (prefs.haptics !== false);
    }

    function playBeep(freq, dur) {
      try {
        if (!areTonesEnabled()) return;
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = freq;
        g.gain.value = 0.14;
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur);
      } catch (e) {}
    }

    function playStartChime() {
      playBeep(440, 0.08);
      setTimeout(() => playBeep(587, 0.1), 80);
    }

    function playToolChime() {
      if (typeof navigator !== 'undefined' && areHapticsEnabled()) {
        if (typeof navigator.vibrate === 'function') navigator.vibrate(25);
      }
      playBeep(659, 0.06);
      setTimeout(() => playBeep(784, 0.08), 60);
    }

    function playSuccessChime() {
      playBeep(523, 0.08);
      setTimeout(() => playBeep(659, 0.08), 80);
      setTimeout(() => playBeep(784, 0.12), 160);
    }

    function announce(text) {
      if (!text) return;
      if (!announcerEl && doc) {
        announcerEl = doc.getElementById('sr-announcer');
      }
      if (announcerEl) {
        announcerEl.textContent = '';
        setTimeout(() => { announcerEl.textContent = text; }, 60);
      }
      try {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = /[\u0600-\u06FF]/.test(text) ? 'ar-SA' : 'en-US';
          window.speechSynthesis.speak(u);
        }
      } catch (e) {}
    }

    return {
      playBeep: playBeep,
      playStartChime: playStartChime,
      playToolChime: playToolChime,
      playSuccessChime: playSuccessChime,
      announce: announce
    };
  }

  const defaultInstance = createAudioAnnouncer();

  return {
    createAudioAnnouncer: createAudioAnnouncer,
    playBeep: defaultInstance.playBeep,
    playStartChime: defaultInstance.playStartChime,
    playToolChime: defaultInstance.playToolChime,
    playSuccessChime: defaultInstance.playSuccessChime,
    announce: defaultInstance.announce
  };
});
