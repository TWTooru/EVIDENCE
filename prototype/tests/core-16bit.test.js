const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../evidence-16bit-core.js');

test('makeConfig applies numeric overrides and preserves defaults', () => {
  const cfg = C.makeConfig({ panSpeed: '280', film: 'invalid', unknownKey: 99 });
  assert.equal(cfg.panSpeed, 280);
  assert.equal(cfg.film, C.DEFAULTS.film);
  assert.equal(cfg.unknownKey, undefined);
});

test('panoramic camera pans between 0 and 320 and clamps cleanly', () => {
  const s = C.createGame(C.makeConfig(), 42);
  C.step(s, { action: true }, 0.01); // TITLE -> NIGHT_INTRO
  C.step(s, { action: true }, 0.01); // NIGHT_INTRO -> PLAYING
  assert.equal(s.phase, 'PLAYING');
  assert.equal(s.cockpit.panX, 160);

  C.step(s, { left: true }, 2.0);
  assert.equal(s.cockpit.panX, 0);

  C.step(s, { right: true }, 5.0);
  assert.equal(s.cockpit.panX, 320);
});

test('gaze detection freezes creature in visible window and lets blindspot creatures advance', () => {
  const s = C.createGame(C.makeConfig({ rainRate: 0 }), 7);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'LEFT';
  c.dist = 0.7;

  // Pan to left window (panX = 0) -> LEFT creature is gazed and frozen
  s.cockpit.panX = 0;
  assert.equal(C.isCreatureGazed(c, s), true);
  C.step(s, {}, 1.0);
  assert.equal(c.dist, 0.7);
  assert.equal(c.state, 'FROZEN');

  // Pan to right window (panX = 320) -> LEFT creature is in blindspot and advances
  s.cockpit.panX = 320;
  assert.equal(C.isCreatureGazed(c, s), false);
  C.step(s, {}, 1.0);
  assert.ok(c.dist < 0.7);
  assert.equal(c.state, 'STALKING');
});

test('front windshield rainBlur > 0.65 blocks gaze until wipers clear it', () => {
  const s = C.createGame(C.makeConfig({ rainRate: 0.2 }), 11);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.6;
  s.cockpit.panX = 160;
  s.cockpit.wipersOn = false;

  // Initially clear -> gazed
  s.cockpit.rainBlur = 0.1;
  assert.equal(C.isCreatureGazed(c, s), true);

  // Heavy rain blur -> gaze blocked even when looking dead center
  s.cockpit.rainBlur = 0.8;
  assert.equal(C.isCreatureGazed(c, s), false);
  const dBefore = c.dist;
  C.step(s, {}, 0.5);
  assert.ok(c.dist < dBefore);

  // Turn wipers on -> clears rainBlur below threshold
  C.step(s, { toggleWipers: true }, 0.01);
  assert.equal(s.cockpit.wipersOn, true);
  C.step(s, {}, 1.5);
  assert.ok(s.cockpit.rainBlur < 0.4);
  assert.equal(C.isCreatureGazed(c, s), true);
});

test('battery drains when wipers or headlights are active and disables electrics at 0%', () => {
  const s = C.createGame(C.makeConfig(), 19);
  C.startNight(s, 1);
  s.cockpit.wipersOn = true;
  s.cockpit.headlightsOn = true;
  const b0 = s.cockpit.battery;

  C.step(s, {}, 2.0);
  assert.ok(s.cockpit.battery < b0);

  // Force battery depletion
  s.cockpit.battery = 0.2;
  C.step(s, {}, 1.0);
  assert.equal(s.cockpit.battery, 0);
  assert.equal(s.cockpit.wipersOn, false);
  assert.equal(s.cockpit.headlightsOn, false);
  assert.equal(s.cockpit.blackout, true);
});

test('camera flash grades EVIDENCE at close range, retreats creature, and causes 1s glare blindness', () => {
  const s = C.createGame(C.makeConfig({ rainRate: 0 }), 23);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.22; // Close range (<= 0.32)
  s.cockpit.panX = 160;
  s.cockpit.vfActive = true;

  C.step(s, { aim: true, shoot: true }, 0.01);
  assert.equal(s.camera.filmLeft, 3);
  assert.ok(s.camera.blindTimer > 0.9);
  assert.ok(s.camera.chargeTimer > 2.0);
  assert.equal(s.camera.lastPhoto.grade, 'EVIDENCE');
  assert.equal(s.night.evidenceCount, 1);
  assert.ok(c.dist >= 0.85);
});

test('night progression: surviving until dawn with EVIDENCE clears night; without EVIDENCE fails', () => {
  const s1 = C.createGame(C.makeConfig(), 31);
  C.startNight(s1, 1);
  s1.night.evidenceCount = 1;
  s1.creatures[0].dist = 0.9;
  s1.cockpit.panX = 160;
  s1.creatures[0].dir = 'FRONT';
  C.step(s1, {}, s1.night.duration + 0.1);
  assert.equal(s1.phase, 'NIGHT_SUMMARY');

  // Advance to Night 2
  C.step(s1, { action: true }, 0.01);
  assert.equal(s1.phase, 'NIGHT_INTRO');
  assert.equal(s1.night.number, 2);

  // Without evidence at dawn -> GAME_OVER
  const s2 = C.createGame(C.makeConfig(), 31);
  C.startNight(s2, 1);
  s2.night.evidenceCount = 0;
  s2.creatures[0].dist = 0.9;
  s2.cockpit.panX = 160;
  s2.creatures[0].dir = 'FRONT';
  C.step(s2, {}, s2.night.duration + 0.1);
  assert.equal(s2.phase, 'GAME_OVER');
  assert.equal(s2.endReason, 'NO_EVIDENCE');
});

test('night 2 introduces ROOF direction and night 3 spawns 2 threats with reduced battery', () => {
  const cfg = C.makeConfig();
  const n2 = C.nightSettings(2, cfg);
  const n3 = C.nightSettings(3, cfg);
  assert.ok(n2.dirs.includes('ROOF'));
  assert.equal(n3.creatureCount, 2);
  assert.equal(n3.startBattery, 75);

  const s = C.createGame(cfg, 55);
  C.startNight(s, 3);
  assert.equal(s.cockpit.battery, 75);
  assert.equal(s.creatures.length, 2);
});

test('Bug A1: pressing shoot without holding aim still raises camera and fires flash', () => {
  const s = C.createGame(C.makeConfig({ rainRate: 0 }), 77);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.24;
  s.cockpit.panX = 160;
  s.cockpit.vfActive = false;

  C.step(s, { aim: false, shoot: true }, 0.01);
  assert.equal(s.cockpit.vfActive, true);
  assert.equal(s.camera.filmLeft, 3);
  assert.equal(s.camera.lastPhoto.grade, 'EVIDENCE');
});

test('Bug A2: looking up at ROOF puts ground windows (FRONT/LEFT/RIGHT) into blindspot', () => {
  const s = C.createGame(C.makeConfig({ rainRate: 0 }), 88);
  C.startNight(s, 2);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.6;
  s.cockpit.panX = 160;

  s.cockpit.lookUp = false;
  assert.equal(C.isCreatureGazed(c, s), true);

  s.cockpit.lookUp = true;
  assert.equal(C.isCreatureGazed(c, s), false);
});

test('Bug A3: no single panX position can simultaneously gaze-freeze two ground windows', () => {
  const s = C.createGame(C.makeConfig({ rainRate: 0 }), 99);
  C.startNight(s, 1);
  const leftC = { id: 1, dir: 'LEFT', dist: 0.5, offsetX: 0 };
  const frontC = { id: 2, dir: 'FRONT', dist: 0.5, offsetX: 0 };
  const rightC = { id: 3, dir: 'RIGHT', dist: 0.5, offsetX: 0 };

  for (let pan = 0; pan <= C.MAX_PAN_X; pan += 1) {
    s.cockpit.panX = pan;
    const gazedCount = [leftC, frontC, rightC].filter((c) => C.isCreatureGazed(c, s)).length;
    assert.ok(gazedCount <= 1, `panX=${pan} froze ${gazedCount} windows simultaneously`);
  }
});

test('Bug A4: heavy rainBlur (> threshold) blocks FRONT gaze even when headlights are ON', () => {
  const s = C.createGame(C.makeConfig(), 105);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.5;
  s.cockpit.panX = 160;
  s.cockpit.headlightsOn = true;
  s.cockpit.rainBlur = 0.8; // Exceeds 0.65 blurThreshold

  assert.equal(C.isCreatureGazed(c, s), false);
});

test('B1: unwatched creature moves laterally between trees and shifts window when shiftTimer expires', () => {
  const s = C.createGame(C.makeConfig({ rainRate: 0 }), 201);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'LEFT';
  c.dist = 0.75;
  c.offsetX = 0;
  c.shiftTimer = 1.0;
  s.cockpit.panX = 320; // Looking far right, so LEFT is unwatched

  C.step(s, {}, 0.4);
  assert.notEqual(c.offsetX, 0, 'unwatched creature should move laterally');

  // Step past shiftTimer (0.7s more) while still unwatched at medium-far range
  C.step(s, {}, 0.7);
  assert.notEqual(c.dir, 'LEFT', 'creature should shift to a new window direction');
  assert.ok(s.events.some((e) => e.type === 'BRANCH_SNAP'));
});

test('B2: Night 3 spawns a feint decoy that vanishes instead of breaching at close range', () => {
  const s = C.createGame(C.makeConfig({ rainRate: 0 }), 202);
  C.startNight(s, 3);
  const realC = s.creatures.find((c) => !c.feint);
  const feintC = s.creatures.find((c) => c.feint);
  assert.ok(realC, 'Night 3 must have a real creature');
  assert.ok(feintC, 'Night 3 must have a feint decoy creature');

  // Keep real creature far away, put feint creature right at the window in a blindspot
  realC.dist = 0.9;
  feintC.dir = 'LEFT';
  feintC.dist = 0.16;
  s.cockpit.panX = 320;

  C.step(s, {}, 0.2);
  assert.equal(s.phase, 'PLAYING', 'feint decoy must not trigger BREACH game over');
  assert.ok(feintC.dist > 0.7, 'feint decoy should vanish and relocate to far distance');
  assert.ok(s.events.some((e) => e.type === 'FEINT_VANISH'));
});

test('B3: PLAYING phase emits accelerating HEARTBEAT and periodic RAIN_AMBIENCE events', () => {
  const s = C.createGame(C.makeConfig({ rainRate: 0 }), 203);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.25; // Close range -> fast heartbeat
  s.cockpit.panX = 160;

  let heartbeats = 0;
  let rainTicks = 0;
  for (let i = 0; i < 20; i++) {
    C.step(s, {}, 0.1);
    for (const ev of s.events) {
      if (ev.type === 'HEARTBEAT') heartbeats++;
      if (ev.type === 'RAIN_AMBIENCE') rainTicks++;
    }
  }
  assert.ok(heartbeats >= 2, `expected at least 2 heartbeats in 2.0s at close range, got ${heartbeats}`);
  assert.ok(rainTicks >= 2, `expected at least 2 rain ambience events in 2.0s, got ${rainTicks}`);
});


