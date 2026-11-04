const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../evidence-16bit-audio.js');

test('audio module exports all stereo sound methods and handles headless execution safely', () => {
  assert.equal(typeof A.init, 'function');
  assert.equal(typeof A.playEvent, 'function');
  assert.equal(typeof A.footstepStereo, 'function');
  assert.equal(typeof A.metalScratchStereo, 'function');
  assert.equal(typeof A.roofThud, 'function');
  assert.equal(typeof A.shutterBlast, 'function');
  assert.equal(typeof A.updateRadio, 'function');
  assert.equal(typeof A.heartbeat, 'function');
  assert.equal(typeof A.rainAmbience, 'function');
  assert.equal(typeof A.branchSnapStereo, 'function');
  assert.equal(typeof A.feintVanish, 'function');

  // Should not throw when AudioContext is absent in Node
  A.init();
  A.playEvent({ type: 'SWITCH_CLICK' });
  A.playEvent({ type: 'WIPER_SWEEP' });
  A.playEvent({ type: 'FOOTSTEP', pan: -0.8, near: 0.5 });
  A.playEvent({ type: 'METAL_SCRATCH', pan: 0.8, near: 0.7 });
  A.playEvent({ type: 'ROOF_THUD', near: 0.6 });
  A.playEvent({ type: 'SHUTTER_BLAST' });
  A.playEvent({ type: 'MONSTER_SCREAM', dir: 'LEFT' });
  A.playEvent({ type: 'GLASS_SHATTER' });
  A.playEvent({ type: 'DAWN_CHIME' });
  A.playEvent({ type: 'HEARTBEAT', near: 0.8 });
  A.playEvent({ type: 'RAIN_AMBIENCE', intensity: 1.2 });
  A.playEvent({ type: 'BRANCH_SNAP', pan: -0.7, near: 0.4 });
  A.playEvent({ type: 'FEINT_VANISH', pan: 0.7 });
  A.updateRadio(-0.5, 0.7, false);
});

test('individual sound generator functions execute cleanly in headless environment', () => {
  assert.doesNotThrow(() => {
    A.switchClick();
    A.wiperSweep();
    A.footstepStereo(0.5, 0.8);
    A.metalScratchStereo(-0.5, 0.9);
    A.roofThud(0.7);
    A.shutterBlast();
    A.monsterScream(0.4);
    A.glassShatter();
    A.dawnChime();
    A.updateRadio(0.2, 0.9, false);
    A.updateRadio(0.2, 0.1, false); // low intensity, ignored
    A.updateRadio(0.2, 0.9, true);  // blackout, ignored
    A.playEvent(null);
    A.playEvent({ type: 'UNKNOWN_TYPE' });
    A.playEvent({ type: 'MONSTER_SCREAM', dir: 'RIGHT' });
    A.playEvent({ type: 'MONSTER_SCREAM', dir: 'CENTER' });
  });
});

test('Web Audio API synthesis: full oscillator, noise, panner, and gain graph execution', () => {
  const calls = {
    oscillators: [],
    sources: [],
    filters: [],
    gains: [],
    panners: [],
    resumed: 0,
  };

  class MockGainNode {
    constructor() {
      this.gain = {
        value: 1,
        setValueAtTime: (v, t) => {},
        exponentialRampToValueAtTime: (v, t) => {},
      };
      this.connections = [];
      calls.gains.push(this);
    }
    connect(dest) {
      this.connections.push(dest);
    }
  }

  class MockOscillatorNode {
    constructor() {
      this.type = 'sine';
      this.frequency = {
        value: 440,
        setValueAtTime: (v, t) => {},
        exponentialRampToValueAtTime: (v, t) => {},
      };
      this.connections = [];
      this.started = null;
      this.stopped = null;
      calls.oscillators.push(this);
    }
    connect(dest) {
      this.connections.push(dest);
    }
    start(t) {
      this.started = t;
    }
    stop(t) {
      this.stopped = t;
    }
  }

  class MockBufferSourceNode {
    constructor() {
      this.buffer = null;
      this.connections = [];
      this.started = null;
      calls.sources.push(this);
    }
    connect(dest) {
      this.connections.push(dest);
    }
    start(t) {
      this.started = t;
    }
  }

  class MockBiquadFilterNode {
    constructor() {
      this.type = 'lowpass';
      this.frequency = {
        value: 350,
        setValueAtTime: (v, t) => {},
      };
      this.connections = [];
      calls.filters.push(this);
    }
    connect(dest) {
      this.connections.push(dest);
    }
  }

  class MockStereoPannerNode {
    constructor() {
      this.pan = {
        value: 0,
        setValueAtTime: (v, t) => { this.pan.value = v; },
      };
      this.connections = [];
      calls.panners.push(this);
    }
    connect(dest) {
      this.connections.push(dest);
    }
  }

  class MockAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 10.0;
      this.sampleRate = 44100;
      this.destination = { name: 'speaker' };
    }
    resume() {
      calls.resumed++;
      this.state = 'running';
    }
    createGain() {
      return new MockGainNode();
    }
    createOscillator() {
      return new MockOscillatorNode();
    }
    createBufferSource() {
      return new MockBufferSourceNode();
    }
    createBiquadFilter() {
      return new MockBiquadFilterNode();
    }
    createStereoPanner() {
      return new MockStereoPannerNode();
    }
    createBuffer(channels, length, sampleRate) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: () => new Float32Array(length),
      };
    }
  }

  // Reload clean module with mock AudioContext
  globalThis.AudioContext = MockAudioContext;
  delete require.cache[require.resolve('../evidence-16bit-audio.js')];
  const FreshAudio = require('../evidence-16bit-audio.js');

  FreshAudio.init();
  assert.equal(calls.gains.length, 1, 'master gain created');
  assert.equal(calls.gains[0].gain.value, 0.45, 'master volume set to 0.45');

  // Trigger init again when suspended -> calls resume()
  FreshAudio.init();
  assert.equal(calls.resumed, 1, 'resumes suspended audio context');

  // Test all sound events with AudioContext active
  FreshAudio.playEvent({ type: 'SWITCH_CLICK' });
  FreshAudio.playEvent({ type: 'WIPER_SWEEP' });
  FreshAudio.playEvent({ type: 'FOOTSTEP', pan: -0.75, near: 0.8 });
  FreshAudio.playEvent({ type: 'METAL_SCRATCH', pan: 0.75, near: 0.9 });
  FreshAudio.playEvent({ type: 'ROOF_THUD', near: 0.85 });
  FreshAudio.playEvent({ type: 'SHUTTER_BLAST' });
  FreshAudio.playEvent({ type: 'MONSTER_SCREAM', dir: 'LEFT' });
  FreshAudio.playEvent({ type: 'GLASS_SHATTER' });
  FreshAudio.playEvent({ type: 'DAWN_CHIME' });

  assert.ok(calls.oscillators.length > 5, 'oscillators created for synthesized tones');
  assert.ok(calls.sources.length > 3, 'noise buffer sources created');
  assert.ok(calls.panners.length > 5, 'stereo panners created and configured');

  // Verify radio jitter triggers noise
  const prevSources = calls.sources.length;
  // Repeat radio update multiple times with high intensity to trigger random noise
  for (let i = 0; i < 50; i++) {
    FreshAudio.updateRadio(0.3, 0.95, false);
  }
  assert.ok(calls.sources.length > prevSources, 'updateRadio triggered radio static bursts');

  // Cleanup global
  delete globalThis.AudioContext;
});

test('stereo panner fallback when createStereoPanner is unavailable', () => {
  class MockFallbackContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = { name: 'speaker' };
    }
    createGain() {
      return {
        gain: { value: 1, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        start: () => {},
        stop: () => {},
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        connect: () => {},
        start: () => {},
      };
    }
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: { setValueAtTime: () => {} },
        connect: () => {},
      };
    }
    createBuffer(channels, length, sampleRate) {
      return {
        getChannelData: () => new Float32Array(length),
      };
    }
  }

  globalThis.AudioContext = MockFallbackContext;
  delete require.cache[require.resolve('../evidence-16bit-audio.js')];
  const FallbackAudio = require('../evidence-16bit-audio.js');

  FallbackAudio.init();
  // Should connect directly to master without throwing
  assert.doesNotThrow(() => {
    FallbackAudio.switchClick();
    FallbackAudio.footstepStereo(-0.5, 0.5);
  });

  delete globalThis.AudioContext;
});
