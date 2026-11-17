const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadHtmlModules() {
  const htmlPath = path.resolve(__dirname, '../../EVIDENCE 1989.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const sandbox = { window: {}, globalThis: {}, Math, Number, Object, Array, Boolean };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(scripts[0], sandbox);
  return {
    C: sandbox.Evidence16BitCore,
    R: sandbox.Evidence16BitRender,
    A: sandbox.Evidence16BitAudio,
  };
}

test('Phase 1 anti-cheese: holding SHIFT on a far WAIT creature (> 0.62) slows approach (0.28x) and drifts laterally instead of auto-centering', () => {
  const { C } = loadHtmlModules();
  const s = C.createGame(C.makeConfig({ approachSpeed: 0.1 }), 101);
  C.startNight(s, 1);
  assert.equal(s.night.subPhase, 'EVIDENCE');
  assert.equal(s.cockpit.toolMode, 'CAMERA');

  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.80;
  c.pose = 'WAIT';
  c.offsetX = 12;
  c.lateralDir = 1;
  s.cockpit.panX = 160;

  C.step(s, { aim: true }, 1.0);
  // Far WAIT creature under viewfinder should NOT switch to COIL and should move at 0.28x (< 0.032 dist delta in 1s)
  assert.equal(c.pose, 'WAIT');
  assert.ok(0.80 - c.dist < 0.032, `expected slow far lure (< 0.032), got ${0.80 - c.dist}`);
  assert.ok(c.offsetX > 12, `expected lateral drift away from center, got offsetX=${c.offsetX}`);
});

test('Securing required EVIDENCE transitions to SURVIVAL subPhase (Flashlight mode) at >= 03:00 AM instead of ending night early', () => {
  const { C } = loadHtmlModules();
  const s = C.createGame(C.makeConfig({ nightDuration: 75 }), 202);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.28;
  c.offsetX = 0;
  s.cockpit.panX = 160;
  s.night.evidenceCount = 1; // 1 photo already taken, need 2 on Night 1
  s.camera.filmLeft = 1;     // Last exposure!
  s.night.timeElapsed = 14;  // Early in the night (~00:56 AM)

  // Fire final EVIDENCE photo
  C.step(s, { aim: true, shoot: true }, 0.05);
  assert.equal(s.night.evidenceCount, 2);
  assert.equal(s.camera.filmLeft, 0);

  // Step past the 1.0s camera blindTimer
  C.step(s, { aim: false }, 1.1);
  assert.equal(s.phase, 'PLAYING', 'night must NOT end immediately upon securing evidence');
  assert.equal(s.night.subPhase, 'SURVIVAL');
  assert.equal(s.cockpit.toolMode, 'FLASHLIGHT');
  assert.ok(s.night.timeElapsed >= 45, `clock should advance to at least 03:00 AM (45s), got ${s.night.timeElapsed}`);
  assert.ok(s.events.some((e) => e.type === 'SURVIVAL_START'));
});

test('Late evidence completion after 03:00 AM does not rewind night clock on SURVIVAL transition', () => {
  const { C } = loadHtmlModules();
  const s = C.createGame(C.makeConfig({ nightDuration: 75 }), 203);
  C.startNight(s, 1);
  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.28;
  c.offsetX = 0;
  s.cockpit.panX = 160;
  s.night.evidenceCount = 1;
  s.night.timeElapsed = 58; // Already past 03:00 AM (45s)

  C.step(s, { aim: true, shoot: true }, 0.05);
  C.step(s, { aim: false }, 1.1);
  assert.equal(s.night.subPhase, 'SURVIVAL');
  assert.ok(s.night.timeElapsed >= 59, `clock must not rewind to 45s, got ${s.night.timeElapsed}`);
});

test('SURVIVAL flashlight mechanics: works with 0 film, staggers only slightly when far (> 0.42), and blasts/relocates when close (<= 0.42)', () => {
  const { C } = loadHtmlModules();
  const s = C.createGame(C.makeConfig(), 304);
  C.startNight(s, 3); // Night 3: 2 creatures
  s.night.subPhase = 'SURVIVAL';
  s.cockpit.toolMode = 'FLASHLIGHT';
  s.night.evidenceCount = 3;
  s.camera.filmLeft = 0; // 0 film left!

  const cFront = s.creatures[0];
  const cOther = s.creatures[1];
  cFront.dir = 'FRONT';
  cFront.dist = 0.65;
  cFront.offsetX = 0;
  cOther.dir = 'LEFT';
  cOther.dist = 0.70;
  s.cockpit.panX = 160;

  // 1. Premature blast at far range (dist 0.65 > 0.42): wastes charge, slight stagger (+0.08), stays in FRONT window
  C.step(s, { aim: true, shoot: true }, 0.02);
  assert.ok(s.camera.chargeTimer > 2.0, 'flashlight enters recharge cooldown');
  assert.ok(s.camera.blindTimer > 0.5 && s.camera.blindTimer <= 0.66, 'shorter flashlight blind glare');
  assert.equal(cFront.dir, 'FRONT', 'far creature must NOT relocate on premature blast');
  assert.ok(cFront.dist > 0.68 && cFront.dist < 0.78, `expected slight stagger (~0.73), got ${cFront.dist}`);

  // Wait for cooldown to clear
  s.camera.chargeTimer = 0;
  s.camera.blindTimer = 0;

  // 2. Close-range blast (dist 0.36 <= 0.42): relocates cFront to retreatDist without touching cOther
  cFront.dist = 0.36;
  const otherDistBefore = cOther.dist;
  C.step(s, { aim: true, shoot: true }, 0.02);
  assert.equal(cFront.dist, s.cfg.retreatDist, 'close creature blasted back to retreatDist');
  assert.notEqual(cFront.dir, 'FRONT', 'blasted creature switches window');
  assert.ok(Math.abs(cOther.dist - otherDistBefore) < 0.02, 'unaimed second creature is unaffected by blast');
});

test('inspectFlashlightTarget returns closest overlapping target, inBlastRange, and clamped illumination', () => {
  const { C } = loadHtmlModules();
  const s = C.createGame(C.makeConfig(), 405);
  C.startNight(s, 3);
  s.cockpit.panX = 160;
  s.creatures[0].dir = 'LEFT';
  s.creatures[1].dir = 'RIGHT';

  const empty = C.inspectFlashlightTarget(s);
  assert.equal(empty.hasTarget, false);
  assert.equal(empty.inBlastRange, false);
  assert.equal(empty.creature, null);

  s.creatures[0].dir = 'FRONT';
  s.creatures[0].offsetX = 0;
  s.creatures[0].dist = 0.70;
  s.creatures[1].dir = 'FRONT';
  s.creatures[1].offsetX = 0;
  s.creatures[1].dist = 0.38;

  const closeHit = C.inspectFlashlightTarget(s);
  assert.equal(closeHit.hasTarget, true);
  assert.equal(closeHit.creature, s.creatures[1]);
  assert.equal(closeHit.inBlastRange, true);
  assert.equal(closeHit.dist, 0.38);
  assert.equal(closeHit.illumination, 1);

  s.creatures[1].dist = 0.62;
  const farHit = C.inspectFlashlightTarget(s);
  assert.equal(farHit.hasTarget, true);
  assert.equal(farHit.inBlastRange, false);
  assert.ok(farHit.illumination >= 0.12 && farHit.illumination < 1);
});

test('SURVIVAL banner timer initializes to 3.5s, counts down, and surviving until dawn clears night with 0 film', () => {
  const { C } = loadHtmlModules();
  const s = C.createGame(C.makeConfig({ nightDuration: 75 }), 506);
  C.startNight(s, 1);
  s.creatures[0].dir = 'FRONT';
  s.creatures[0].dist = 0.28;
  s.creatures[0].offsetX = 0;
  s.cockpit.panX = 160;
  s.night.evidenceCount = 1;
  s.camera.filmLeft = 1;

  C.step(s, { aim: true, shoot: true }, 0.05);
  C.step(s, { aim: false }, 1.1);
  assert.equal(s.night.subPhase, 'SURVIVAL');
  assert.equal(s.cockpit.survivalBannerTimer, 3.5);
  assert.equal(s.camera.filmLeft, 0);

  // Banner counts down and surviving past nightDuration completes night
  s.creatures[0].dir = 'FRONT';
  s.creatures[0].dist = 0.90;
  C.step(s, { aim: false }, 1.0);
  assert.ok(Math.abs(s.cockpit.survivalBannerTimer - 2.5) < 1e-9);
  assert.equal(s.phase, 'PLAYING');

  C.step(s, { aim: false }, 30.0);
  assert.equal(s.phase, 'NIGHT_SUMMARY');
  assert.ok(s.events.some((e) => e.type === 'DAWN_CHIME'));
});

function makeMockCtx() {
  const calls = [];
  return {
    calls,
    canvas: { width: 320, height: 240 },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    setTransform() {},
    save() { calls.push({ op: 'save' }); },
    restore() { calls.push({ op: 'restore' }); },
    fillRect(x, y, w, h) { calls.push({ op: 'fillRect', x, y, w, h, fillStyle: this.fillStyle, alpha: this.globalAlpha }); },
    strokeRect(x, y, w, h) { calls.push({ op: 'strokeRect', x, y, w, h, strokeStyle: this.strokeStyle }); },
    fillText(str, x, y) { calls.push({ op: 'fillText', str, x, y, fillStyle: this.fillStyle }); },
    beginPath() { calls.push({ op: 'beginPath' }); },
    closePath() { calls.push({ op: 'closePath' }); },
    moveTo(x, y) { calls.push({ op: 'moveTo', x, y }); },
    lineTo(x, y) { calls.push({ op: 'lineTo', x, y }); },
    arc(x, y, r, a0, a1) { calls.push({ op: 'arc', x, y, r, a0, a1 }); },
    fill() { calls.push({ op: 'fill', fillStyle: this.fillStyle, alpha: this.globalAlpha }); },
    stroke() { calls.push({ op: 'stroke', strokeStyle: this.strokeStyle }); },
  };
}

test('SURVIVAL renderer: unlit creature draws only red eyes (no creatureRim body highlight), flashlight beam illuminates body and pale face at <= 0.42 with ZERO red warning border', () => {
  const { C, R } = loadHtmlModules();
  const s = C.createGame(C.makeConfig(), 401);
  C.startNight(s, 1);
  s.night.subPhase = 'SURVIVAL';
  s.cockpit.toolMode = 'FLASHLIGHT';
  s.cockpit.lightningFlash = 0;

  const c = s.creatures[0];
  c.dir = 'FRONT';
  c.dist = 0.36; // Inside flashlight effective range (<= 0.42)
  c.offsetX = 0;
  s.cockpit.panX = 160;

  // 1. Flashlight OFF (vfActive = false): only red eyes in pitch black, no pale sclera/teeth body reveal
  s.cockpit.vfActive = false;
  const ctxOff = makeMockCtx();
  R.draw(ctxOff, s);
  const paleCallsOff = ctxOff.calls.filter((k) => k.op === 'fillRect' && k.fillStyle === R.PAL.corpsePale && k.y >= 24 && k.y <= 165);
  assert.equal(paleCallsOff.length, 0, 'unlit creature in SURVIVAL must not reveal pale face/hands without flashlight');

  // 2. Flashlight ON (vfActive = true) at dist 0.36 (<= 0.42): reveals pale features inside circular beam, NO red strokeRect warning
  s.cockpit.vfActive = true;
  const ctxOn = makeMockCtx();
  R.draw(ctxOn, s);
  const paleCallsOn = ctxOn.calls.filter((k) => k.op === 'fillRect' && k.fillStyle === R.PAL.corpsePale && k.y >= 24 && k.y <= 165);
  assert.ok(paleCallsOn.length > 0, 'flashlight beam at close range (<= 0.42) must illuminate pale sclera/teeth/hands');

  const redBorderCalls = ctxOn.calls.filter(
    (k) => (k.op === 'strokeRect' || k.op === 'stroke') && (k.strokeStyle === R.PAL.dangerRed || k.strokeStyle === R.PAL.eyeRed)
  );
  assert.equal(redBorderCalls.length, 0, 'must NEVER draw a red warning border/frame in SURVIVAL flashlight mode');
});

