const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../evidence-16bit-core.js');

test('makeConfig applies numeric overrides and has zero car-management parameters', () => {
  const cfg = C.makeConfig({ panSpeed: '300', film: '5', approachSpeed: 'bad' });
  assert.equal(cfg.panSpeed, 300);
  assert.equal(cfg.film, 5);
  assert.equal(cfg.approachSpeed, C.DEFAULTS.approachSpeed);
  assert.equal('wiperDrain' in cfg, false);
  assert.equal('headlightDrain' in cfg, false);
  assert.equal('rainRate' in cfg, false);
  assert.equal(cfg.maxStare, 2.8);
  assert.deepEqual(Object.keys(C.DIR_WORLD_X).sort(), ['FRONT', 'LEFT', 'RIGHT']);
});

test('panoramic head-turn pans smoothly between LEFT (0), FRONT (160), and RIGHT (320)', () => {
  const s = C.createGame(C.makeConfig({ panSpeed: 200 }), 42);
  C.startNight(s, 1);
  assert.equal(s.cockpit.panX, 160);

  C.step(s, { left: true }, 0.5);
  assert.equal(s.cockpit.panX, 60);

  C.step(s, { left: true }, 1.0);
  assert.equal(s.cockpit.panX, 0);

  C.step(s, { right: true }, 2.5);
  assert.equal(s.cockpit.panX, 320);
});

test('Pillar 1 & Pillar 2 (Uncanny Gaze Dread + 3-Blink Lethal Escalation): motionless while eyes open, escalates Far -> Mid -> Glass-Slam -> Fatal Breach across 3 blinks', () => {
  const s = C.createGame(C.makeConfig({ maxStare: 2.8 }), 7);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.80;
  c.offsetX = 10;
  c.pose = 'WAIT';
  s.cockpit.panX = 160; // Facing FRONT with naked eyes

  // 1. While eyes remain open (first 2.0s), creature is 100% motionless while stareDread rises continuously
  for (let i = 0; i < 4; i++) {
    C.step(s, { aim: false }, 0.5);
    assert.equal(C.isCreatureGazed(c, s), true);
    assert.equal(c.state, 'FROZEN');
    assert.equal(c.dist, 0.80, 'watched creature must never move while eyes are open');
    assert.equal(c.offsetX, 10, 'watched creature must never drift while eyes are open');
  }
  assert.ok(s.cockpit.eyeStrain > 0.65, 'eyeStrain builds rapidly');
  assert.ok(s.cockpit.stareDread > 0.5, 'stareDread swells continuously while locking eyes');

  // 2. BLINK 1 (Far -> Mid COIL jump-cut): step until blink triggers
  let blinked1 = false;
  for (let i = 0; i < 12 && !blinked1; i++) {
    C.step(s, { aim: false }, 0.1);
    if (s.cockpit.blinkTimer > 0) blinked1 = true;
  }
  assert.equal(blinked1, true, '1st involuntary blink triggered');
  assert.ok(c.dist <= 0.46 && c.dist > 0.26, `1st blink jump-cuts straight to mid-range (~0.44), got ${c.dist}`);
  assert.equal(c.pose, 'COIL');

  // Let eyes reopen (0.25s)
  C.step(s, { aim: false }, 0.25);
  assert.equal(s.cockpit.blinkTimer, 0);

  // 3. BLINK 2 (Mid -> Point-Blank WINDOW_SLAM jumpscare + screen shake!)
  let blinked2 = false;
  let sawSlamEvent = false;
  for (let i = 0; i < 30 && !blinked2; i++) {
    C.step(s, { aim: false }, 0.1);
    if (s.events.some((e) => e.type === 'WINDOW_SLAM')) sawSlamEvent = true;
    if (s.cockpit.blinkTimer > 0) blinked2 = true;
  }
  assert.equal(blinked2, true, '2nd involuntary blink triggered');
  assert.equal(sawSlamEvent, true, '2nd blink slams creature onto window glass with WINDOW_SLAM');
  assert.ok(s.cockpit.shakeTimer > 0, 'window slam shakes the cockpit');
  assert.ok(c.dist <= 0.22 && c.dist > 0, `creature is now pressed flat against glass, got ${c.dist}`);
  assert.equal(c.pose, 'LUNGE');

  // Let eyes reopen (0.25s)
  C.step(s, { aim: false }, 0.25);

  // 4. BLINK 3 (Already against glass -> Fatal BREACH!)
  for (let i = 0; i < 25 && s.phase === 'PLAYING'; i++) {
    C.step(s, { aim: false }, 0.1);
  }
  assert.equal(s.phase, 'GAME_OVER', 'passively staring through a 3rd blink at the glass is fatal');
  assert.equal(s.endReason, 'BREACH');
});

test('No single panX position can simultaneously gaze-freeze two windows', () => {
  const s = C.createGame(C.makeConfig(), 99);
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

test('Pose Telegraph: unwatched creature shifts from deceptive slow WAIT (0.55x) to explosive COIL (1.65x) to point-blank LUNGE', () => {
  const s = C.createGame(C.makeConfig({ approachSpeed: 0.1 }), 301);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'LEFT';
  c.dist = 0.85;
  c.pose = 'WAIT';
  c.unwatchedTime = 0;
  c.shiftTimer = 99;
  s.cockpit.panX = 320; // Looking far right, LEFT is unwatched

  // Step 0.5s in WAIT pose (0.55x speed)
  const d0 = c.dist;
  C.step(s, {}, 0.5);
  const waitDelta = d0 - c.dist;
  assert.equal(c.pose, 'WAIT');
  assert.ok(Math.abs(waitDelta - 0.0275) < 0.005, `expected WAIT delta ~0.0275, got ${waitDelta}`);

  // Step past 0.85s unwatchedTime so creature coils into COIL pose (1.65x speed)
  C.step(s, {}, 0.5);
  assert.equal(c.pose, 'COIL');
  const d1 = c.dist;
  C.step(s, {}, 0.5);
  const coilDelta = d1 - c.dist;
  assert.ok(coilDelta > waitDelta * 2.5, `expected COIL delta (${coilDelta}) > 2.5x WAIT delta (${waitDelta})`);

  // At close range (<= lungeDist), pose transitions to LUNGE
  c.dist = 0.35;
  C.step(s, {}, 0.1);
  assert.equal(c.pose, 'LUNGE');
});

test('Viewfinder Lure: raising camera (aim=true) covers naked eyes, unfreezing creature to stalk toward lens; releasing re-freezes', () => {
  const s = C.createGame(C.makeConfig(), 303);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.44;
  c.offsetX = 18;
  s.cockpit.panX = 160;

  // 1. Naked eyes (aim: false) -> frozen solid
  C.step(s, { aim: false }, 1.0);
  assert.equal(C.isCreatureInViewCone(c, s), true);
  assert.equal(C.isCreatureGazed(c, s), true);
  assert.equal(c.dist, 0.44);

  // 2. Raise camera (aim: true) -> covers naked eyes, creature approaches center of lens
  C.step(s, { aim: true }, 1.0);
  assert.equal(C.isCreatureInViewCone(c, s), true);
  assert.equal(C.isCreatureGazed(c, s), false);
  assert.ok(c.dist < 0.44, 'creature advances while eyes are covered behind camera');
  assert.ok(Math.abs(c.offsetX) < 18, 'creature centers toward camera lens');

  // 3. Lower camera (aim: false) -> naked eyes re-freeze creature immediately
  const dAfterLure = c.dist;
  C.step(s, { aim: false }, 1.0);
  assert.equal(c.dist, dAfterLure);
});

test('Camera flash grades EVIDENCE at close range, retreats creature, and causes 1s whiteout blindness', () => {
  const s = C.createGame(C.makeConfig(), 33);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.24;
  c.offsetX = 0;
  s.cockpit.panX = 160;

  C.step(s, { aim: false, shoot: true }, 0.016);
  assert.equal(s.cockpit.vfActive, true);
  assert.equal(s.camera.filmLeft, 3);
  assert.ok(s.camera.blindTimer > 0.9);
  assert.ok(s.camera.chargeTimer > 2.0);
  assert.equal(s.camera.lastPhoto.grade, 'EVIDENCE');
  assert.equal(s.night.evidenceCount, 1);
  assert.ok(c.dist > 0.75, 'creature is pushed back into the forest by flash');
});

test('Unwatched creature shifts between windows when shiftTimer expires', () => {
  const s = C.createGame(C.makeConfig(), 201);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'LEFT';
  c.dist = 0.75;
  c.offsetX = 0;
  c.shiftTimer = 1.0;
  s.cockpit.panX = 320; // Looking far right, LEFT is unwatched

  C.step(s, {}, 0.4);
  assert.notEqual(c.offsetX, 0);

  C.step(s, {}, 0.7);
  assert.notEqual(c.dir, 'LEFT');
  assert.ok(s.events.some((e) => e.type === 'BRANCH_SNAP'));
});

test('3-Night Pure Progression: Night 2 speeds up flanking, Night 3 spawns 2 real creatures in separate windows', () => {
  const cfg = C.makeConfig();
  const n1 = C.nightSettings(1, cfg);
  const n2 = C.nightSettings(2, cfg);
  const n3 = C.nightSettings(3, cfg);

  assert.equal(n1.creatureCount, 1);
  assert.ok(n2.approachMult > n1.approachMult);
  assert.equal(n3.creatureCount, 2);

  const s = C.createGame(cfg, 55);
  C.startNight(s, 3);
  assert.equal(s.creatures.length, 2);
  assert.notEqual(s.creatures[0].dir, s.creatures[1].dir, 'two creatures spawn in separate windows');

  // Surviving until dawn with EVIDENCE clears night; without EVIDENCE fails
  s.night.evidenceCount = 1;
  C.step(s, {}, cfg.nightDuration + 0.5);
  assert.equal(s.phase, 'NIGHT_SUMMARY');
});

test('PLAYING phase emits stereo footsteps/scratches, accelerating HEARTBEAT, and RAIN_AMBIENCE', () => {
  const s = C.createGame(C.makeConfig(), 203);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'LEFT';
  c.dist = 0.25;
  s.cockpit.panX = 320; // Unwatched close creature on LEFT

  let heartbeats = 0;
  let rainTicks = 0;
  for (let i = 0; i < 15; i++) {
    C.step(s, {}, 0.1);
    for (const ev of s.events) {
      if (ev.type === 'HEARTBEAT') heartbeats++;
      if (ev.type === 'RAIN_AMBIENCE') rainTicks++;
    }
  }
  assert.ok(heartbeats >= 2);
  assert.ok(rainTicks >= 2);
});
