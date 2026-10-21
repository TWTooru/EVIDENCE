/* EVIDENCE 1976 — 5 synthesized sounds: heartbeat, twig snap, flash charge, shutter, scream. */
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
    master.gain.value = 0.4;
    master.connect(ac.destination);
  }

  function tone(type, f0, f1, dur, vol, delay) {
    const t = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, highpass, delay) {
    const t = ac.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  // 1. 心跳
  function heartbeat() {
    tone('sine', 70, 45, 0.12, 0.8);
    tone('sine', 70, 45, 0.1, 0.5, 0.18);
  }
  // 2. 樹枝斷裂
  function snap() {
    noise(0.06, 0.5, 2000);
  }
  // 3. 閃光充電（也用在過關的上升音）
  function charge(seconds) {
    tone('sawtooth', 300, 1500, seconds, 0.05, 0.1);
  }
  // 4. 快門
  function shutter() {
    tone('square', 1200, 300, 0.05, 0.3);
    noise(0.08, 0.4, 800);
  }
  // 5. 尖叫（也用在天亮／底片用完的失敗音，音量較小）
  function scream(seconds, vol) {
    tone('sawtooth', 900, 80, seconds, vol);
    noise(seconds * 0.8, vol * 0.6, 500);
  }

  function play(event, cfg) {
    if (!ac) return;
    switch (event) {
      case 'heartbeat': heartbeat(); break;
      case 'snap': snap(); break;
      case 'shot': shutter(); charge((cfg && cfg.charge) || 2); break;
      case 'win': charge(0.4); break;
      case 'caught': scream(1.2, 0.5); break;
      case 'lose': scream(0.6, 0.25); break;
      default: break;
    }
  }

  const API = { init, play };
  if (typeof module === 'object' && module.exports) module.exports = API;
  if (root) root.EvidenceAudio = API;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
