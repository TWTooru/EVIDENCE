/* EVIDENCE 1989: BLACK RAIN — 16-bit Stereo Audio Synthesizer (Web Audio API). */
(function (root) {
  'use strict';

  let ac = null;
  let master = null;

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.45;
    master.connect(ac.destination);
  }

  function connectWithPan(node, panVal) {
    if (!ac || !master) return;
    if (typeof ac.createStereoPanner === 'function') {
      const panner = ac.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panVal || 0)), ac.currentTime);
      node.connect(panner);
      panner.connect(master);
    } else {
      node.connect(master);
    }
  }

  function toneStereo(type, f0, f1, dur, vol, pan, delay) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    connectWithPan(gain, pan);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseStereo(dur, vol, filterType, freq, pan, delay) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;

    const filter = ac.createBiquadFilter();
    filter.type = filterType || 'bandpass';
    filter.frequency.setValueAtTime(freq || 800, t);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(gain);
    connectWithPan(gain, pan);
    src.start(t);
  }

  function switchClick() {
    toneStereo('square', 900, 320, 0.035, 0.25, 0, 0);
  }

  function wiperSweep() {
    noiseStereo(0.22, 0.14, 'bandpass', 420, 0, 0);
    toneStereo('triangle', 110, 75, 0.18, 0.12, 0, 0);
  }

  function footstepStereo(pan, near) {
    const v = 0.18 + 0.35 * (near || 0.3);
    noiseStereo(0.11, v, 'lowpass', 340, pan, 0);
    toneStereo('sine', 85, 42, 0.09, v * 0.8, pan, 0.02);
  }

  function metalScratchStereo(pan, near) {
    const v = 0.22 + 0.35 * (near || 0.5);
    toneStereo('sawtooth', 1400, 2600, 0.18, v * 0.5, pan, 0);
    noiseStereo(0.2, v * 0.6, 'highpass', 1800, pan, 0.02);
  }

  function roofThud(near) {
    const v = 0.4 + 0.4 * (near || 0.5);
    toneStereo('sine', 95, 32, 0.24, v, 0, 0);
    noiseStereo(0.14, v * 0.5, 'lowpass', 240, 0, 0.01);
  }

  function shutterBlast() {
    noiseStereo(0.06, 0.75, 'highpass', 900, 0, 0);
    toneStereo('sawtooth', 320, 65, 0.18, 0.45, 0, 0.02);
    // Capacitor recharge whine
    toneStereo('sine', 1200, 4200, 1.4, 0.12, 0.25, 0.25);
  }

  function monsterScream(pan) {
    toneStereo('sawtooth', 780, 190, 0.55, 0.55, pan, 0);
    noiseStereo(0.5, 0.45, 'bandpass', 1100, pan, 0.02);
  }

  function glassShatter() {
    noiseStereo(0.45, 0.85, 'highpass', 1500, 0, 0);
    toneStereo('sawtooth', 620, 95, 0.6, 0.7, 0, 0.05);
  }

  function dawnChime() {
    toneStereo('triangle', 523.25, 523.25, 0.35, 0.3, -0.3, 0);
    toneStereo('triangle', 659.25, 659.25, 0.35, 0.3, 0.3, 0.18);
    toneStereo('triangle', 783.99, 783.99, 0.6, 0.35, 0, 0.36);
  }

  function heartbeat(near) {
    const v = 0.22 + 0.5 * Math.max(0, Math.min(1, near || 0.4));
    toneStereo('sine', 68, 42, 0.11, v, 0, 0);
    toneStereo('sine', 64, 38, 0.09, v * 0.65, 0, 0.16);
  }

  function rainAmbience(intensity) {
    const mult = Math.max(0.5, Math.min(2.2, intensity || 1.0));
    noiseStereo(0.42, 0.055 * mult, 'bandpass', 680, 0, 0);
  }

  function branchSnapStereo(pan, near) {
    const v = 0.2 + 0.35 * (near || 0.4);
    noiseStereo(0.05, v, 'highpass', 1400, pan, 0);
    toneStereo('triangle', 290, 95, 0.06, v * 0.7, pan, 0.01);
  }

  function feintVanish(pan) {
    toneStereo('sine', 620, 140, 0.28, 0.25, pan, 0);
    noiseStereo(0.24, 0.22, 'bandpass', 1600, pan, 0);
  }

  function updateRadio(pan, intensity, blackout) {
    if (!ac || blackout || intensity <= 0.35) return;
    if (Math.random() < intensity * 0.18) {
      noiseStereo(0.04, intensity * 0.16, 'bandpass', 1200 + Math.random() * 1400, pan, 0);
    }
  }

  function playEvent(ev) {
    if (!ev) return;
    switch (ev.type) {
      case 'SWITCH_CLICK': switchClick(); break;
      case 'WIPER_SWEEP': wiperSweep(); break;
      case 'FOOTSTEP': footstepStereo(ev.pan, ev.near); break;
      case 'METAL_SCRATCH': metalScratchStereo(ev.pan, ev.near); break;
      case 'ROOF_THUD': roofThud(ev.near); break;
      case 'SHUTTER_BLAST': shutterBlast(); break;
      case 'MONSTER_SCREAM':
        monsterScream(ev.dir === 'LEFT' ? -0.8 : ev.dir === 'RIGHT' ? 0.8 : 0);
        break;
      case 'GLASS_SHATTER': glassShatter(); break;
      case 'DAWN_CHIME': dawnChime(); break;
      case 'HEARTBEAT': heartbeat(ev.near); break;
      case 'RAIN_AMBIENCE': rainAmbience(ev.intensity); break;
      case 'BRANCH_SNAP': branchSnapStereo(ev.pan, ev.near); break;
      case 'FEINT_VANISH': feintVanish(ev.pan); break;
      default: break;
    }
  }

  const API = {
    init,
    playEvent,
    switchClick,
    wiperSweep,
    footstepStereo,
    metalScratchStereo,
    roofThud,
    shutterBlast,
    monsterScream,
    glassShatter,
    dawnChime,
    heartbeat,
    rainAmbience,
    branchSnapStereo,
    feintVanish,
    updateRadio,
  };

  root.Evidence16BitAudio = API;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
})(typeof window !== 'undefined' ? window : globalThis);
