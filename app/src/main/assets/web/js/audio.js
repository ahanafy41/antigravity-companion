// ==============================================================================
// Accessible Audio & ARIA Screen Reader Announcements
// Web AudioContext Synthesizer & SpeechSynthesis Controller
// ==============================================================================

let audioCtx = null;

function playBeep(freq, dur) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.frequency.value = freq;
    g.gain.value = 0.12;
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch(e) {}
}

function playStartChime() {
  playBeep(440, 0.08);
  setTimeout(() => playBeep(587, 0.1), 80);
}

function playToolChime() {
  playBeep(659, 0.06);
  setTimeout(() => playBeep(784, 0.08), 60);
}

function playSuccessChime() {
  playBeep(523, 0.08);
  setTimeout(() => playBeep(659, 0.08), 80);
  setTimeout(() => playBeep(784, 0.12), 160);
}

function announce(text) {
  const announcer = document.getElementById('sr-announcer');
  if (!announcer) return;
  announcer.textContent = '';
  setTimeout(() => { announcer.textContent = text; }, 60);
  try {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = /[؀-ۿ]/.test(text) ? 'ar-SA' : 'en-US';
      window.speechSynthesis.speak(u);
    }
  } catch(e) {}
}

// Global exports
window.playBeep = playBeep;
window.playStartChime = playStartChime;
window.playToolChime = playToolChime;
window.playSuccessChime = playSuccessChime;
window.announce = announce;
