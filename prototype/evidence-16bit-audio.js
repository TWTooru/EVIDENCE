/* EVIDENCE 1989: BLACK RAIN — Pure 16-bit Stereo Spatial Audio Synthesizer (Web Audio API). */
(function (root) {
  'use strict';

  let ac = null;
  let master = null;
  let dreadNodes = null;

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.48;
    master.connect(ac.destination);
  }

  function ensureDreadNodes() {
    if (!ac || !master || dreadNodes) return;
    const subOsc = ac.createOscillator();
    const tritoneOsc = ac.createOscillator();
    const ringOsc = ac.createOscillator();
    const lowFilter = ac.createBiquadFilter();
    const subGain = ac.createGain();
    const ringGain = ac.createGain();

    subOsc.type = 'triangle';
    subOsc.frequency.value = 46;

    tritoneOsc.type = 'sawtooth';
    tritoneOsc.frequency.value = 131;

    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = 220;

    ringOsc.type = 'sine';
    ringOsc.frequency.value = 3180;

    subGain.gain.value = 0;
    ringGain.gain.value = 0;

    subOsc.connect(subGain);
    tritoneOsc.connect(lowFilter);
    lowFilter.connect(subGain);
    ringOsc.connect(ringGain);

    subGain.connect(master);
    ringGain.connect(master);

    subOsc.start();
    tritoneOsc.start();
    ringOsc.start();

    dreadNodes = { subOsc, tritoneOsc, ringOsc, lowFilter, subGain, ringGain };
  }

  // Continuous psychological dread drone + rising tinnitus ear-ringing while locking eyes with IT!
  function updateStareDread(dreadLevel, eyeStrain) {
    if (!ac) return;
    ensureDreadNodes();
    if (!dreadNodes) return;

    const d = Math.max(0, Math.min(1, dreadLevel || 0));
    const s = Math.max(0, Math.min(1, eyeStrain || 0));
    const now = ac.currentTime;

    const targetSub = d > 0.05 ? (d * d * 0.34) : 0;
    const targetRing = d > 0.15 ? ((d - 0.15) * 0.13 + s * 0.08) : 0;

    dreadNodes.subGain.gain.setTargetAtTime(targetSub, now, 0.06);
    dreadNodes.ringGain.gain.setTargetAtTime(targetRing, now, 0.06);
    dreadNodes.subOsc.frequency.setTargetAtTime(45 + d * 22, now, 0.08);
    // Unsettling downward pitch sag paired with rising tinnitus creates visceral dread
    dreadNodes.tritoneOsc.frequency.setTargetAtTime(134 - s * 19, now, 0.08);
    dreadNodes.lowFilter.frequency.setTargetAtTime(180 + d * 360, now, 0.08);
    dreadNodes.ringOsc.frequency.setTargetAtTime(3120 + s * 460, now, 0.08);
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
    toneStereo('square', 780, 290, 0.028, 0.18, 0, 0);
  }

  function footstepStereo(pan, near) {
    const v = 0.20 + 0.38 * (near || 0.3);
    noiseStereo(0.11, v, 'lowpass', 340, pan, 0);
    toneStereo('sine', 85, 42, 0.09, v * 0.8, pan, 0.02);
  }

  function metalScratchStereo(pan, near) {
    const v = 0.24 + 0.38 * (near || 0.5);
    toneStereo('sawtooth', 1400, 2600, 0.18, v * 0.5, pan, 0);
    noiseStereo(0.2, v * 0.6, 'highpass', 1800, pan, 0.02);
  }

  function shutterBlast() {
    noiseStereo(0.06, 0.75, 'highpass', 900, 0, 0);
    toneStereo('sawtooth', 320, 65, 0.18, 0.45, 0, 0.02);
    // Iconic 1980s camera flash capacitor whine
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
    const v = 0.22 + 0.38 * (near || 0.4);
    noiseStereo(0.05, v, 'highpass', 1400, pan, 0);
    toneStereo('triangle', 290, 95, 0.06, v * 0.7, pan, 0.01);
  }

  function blinkLurch(pan, near) {
    const v = 0.36 + 0.44 * (near || 0.5);
    toneStereo('sine', 95, 34, 0.16, v * 0.9, 0, 0);
    noiseStereo(0.16, v * 0.8, 'lowpass', 520, pan || 0, 0.02);
    noiseStereo(0.08, v * 0.65, 'highpass', 1550, pan || 0, 0.06);
  }

  function windowSlamStereo(pan) {
    // Visceral point-blank impact against the car window glass!
    toneStereo('sine', 135, 26, 0.34, 0.95, pan || 0, 0);
    toneStereo('sawtooth', 880, 140, 0.24, 0.52, pan || 0, 0.01);
    noiseStereo(0.28, 0.88, 'bandpass', 950, pan || 0, 0);
    noiseStereo(0.18, 0.62, 'highpass', 2200, pan || 0, 0.04);
  }

  function playEvent(ev) {
    if (!ev) return;
    switch (ev.type) {
      case 'SWITCH_CLICK': switchClick(); break;
      case 'FOOTSTEP': footstepStereo(ev.pan, ev.near); break;
      case 'METAL_SCRATCH': metalScratchStereo(ev.pan, ev.near); break;
      case 'SHUTTER_BLAST': shutterBlast(); break;
      case 'MONSTER_SCREAM':
        monsterScream(ev.dir === 'LEFT' ? -0.8 : ev.dir === 'RIGHT' ? 0.8 : 0);
        break;
      case 'GLASS_SHATTER': glassShatter(); break;
      case 'DAWN_CHIME': dawnChime(); break;
      case 'HEARTBEAT': heartbeat(ev.near); break;
      case 'RAIN_AMBIENCE': rainAmbience(ev.intensity); break;
      case 'BRANCH_SNAP': branchSnapStereo(ev.pan, ev.near); break;
      case 'BLINK_LURCH': blinkLurch(ev.pan, ev.near); break;
      case 'WINDOW_SLAM': windowSlamStereo(ev.pan); break;
      default: break;
    }
  }

  const API = {
    init,
    playEvent,
    updateStareDread,
    switchClick,
    footstepStereo,
    metalScratchStereo,
    shutterBlast,
    monsterScream,
    glassShatter,
    dawnChime,
    heartbeat,
    rainAmbience,
    branchSnapStereo,
    blinkLurch,
    windowSlamStereo,
  };

  root.Evidence16BitAudio = API;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
})(typeof window !== 'undefined' ? window : globalThis);
