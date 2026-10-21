const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../evidence-core.js');

test('makeConfig applies numeric overrides only', () => {
  const cfg = C.makeConfig({ approach: '0.1', vfW: 'abc', unknown: 5 });
  assert.equal(cfg.approach, 0.1);
  assert.equal(cfg.vfW, C.DEFAULTS.vfW);
  assert.equal(cfg.unknown, undefined);
});

test('creatureRect grows as it approaches', () => {
  const cfg = C.makeConfig();
  const far = C.creatureRect({ x: 160, dist: 1 }, cfg);
  const near = C.creatureRect({ x: 160, dist: 0 }, cfg);
  assert.equal(far.h, 16);
  assert.equal(near.h, 130);
  assert.equal(far.y + far.h, C.HORIZON_Y);
  assert.equal(near.y + near.h, C.FEET_NEAR_Y);
  assert.ok(Math.abs(near.x + near.w / 2 - 160) < 1e-9);
});

test('isFrozen only when eyes are inside the viewfinder and not blind', () => {
  const cfg = C.makeConfig();
  const c = { x: 160, dist: 0.5 };
  const eye = C.eyePoint(c, cfg);
  const vf = { x: eye.x - 10, y: eye.y - 10, w: 90, h: 110 };
  assert.equal(C.isFrozen(c, vf, 0, cfg), true);
  assert.equal(C.isFrozen(c, { ...vf, x: eye.x + 5 }, 0, cfg), false);
  assert.equal(C.isFrozen(c, vf, 0.5, cfg), false);
});

test('gradePhoto: filled and complete is EVIDENCE', () => {
  const cfg = C.makeConfig();
  const vf = { x: 100, y: 100, w: 90, h: 110 };
  const g = C.gradePhoto(vf, { x: 130, y: 105, w: 30, h: 100 }, cfg);
  assert.equal(g.grade, 'EVIDENCE');
  assert.equal(g.score, 91);
});

test('gradePhoto: small and far is BLURRY', () => {
  const cfg = C.makeConfig();
  const vf = { x: 100, y: 100, w: 90, h: 110 };
  const g = C.gradePhoto(vf, { x: 140, y: 150, w: 6, h: 20 }, cfg);
  assert.equal(g.grade, 'BLURRY');
  assert.equal(g.score, 18);
});

test('gradePhoto: large but half outside the frame is only SUSPICIOUS', () => {
  const cfg = C.makeConfig();
  const vf = { x: 100, y: 100, w: 90, h: 110 };
  const g = C.gradePhoto(vf, { x: 130, y: 155, w: 30, h: 100 }, cfg);
  assert.equal(g.grade, 'SUSPICIOUS');
  assert.ok(Math.abs(g.completeness - 0.55) < 1e-9);
});

test('gradePhoto: zero-area rect does not divide by zero and returns BLURRY', () => {
  const cfg = C.makeConfig();
  const vf = { x: 100, y: 100, w: 90, h: 110 };
  const g = C.gradePhoto(vf, { x: 130, y: 105, w: 0, h: 0 }, cfg);
  assert.equal(g.completeness, 0);
  assert.equal(g.fill, 0);
  assert.equal(g.score, 0);
  assert.equal(g.grade, 'BLURRY');
});

test('night 3 brings two creatures and faster approach', () => {
  const cfg = C.makeConfig();
  const n3 = C.nightSettings(3, cfg);
  assert.equal(n3.count, 2);
  assert.equal(n3.approach, cfg.approach * (1 + 0.25 * 2));
  assert.equal(C.nightSettings(1, cfg).count, 1);
  assert.equal(C.nightSettings(1, cfg).nightTime, 60);
  assert.equal(C.nightSettings(5, cfg).nightTime, 50);
});

function playing(seed, overrides) {
  const s = C.createGame(C.makeConfig(overrides), seed || 1);
  C.step(s, { fire: true }, 0);
  return s;
}

test('fire in attract starts night 1 with the viewfinder on the creature', () => {
  const s = playing();
  assert.equal(s.phase, 'play');
  assert.equal(s.night, 1);
  assert.equal(s.creatures.length, 1);
  assert.equal(s.film, 3);
  assert.equal(C.isFrozen(s.creatures[0], s.vf, 0, s.cfg), true);
});

test('a watched creature does not move; an unwatched one approaches', () => {
  const s = playing();
  const c = s.creatures[0];
  const d0 = c.dist;
  const x0 = c.x;
  C.step(s, {}, 1);
  assert.equal(c.dist, d0);
  assert.equal(c.x, x0);
  s.vf.x = c.x > 160 ? 0 : C.SCREEN - s.vf.w;
  s.vf.y = 0;
  C.step(s, {}, 0.5);
  assert.ok(Math.abs(c.dist - (d0 - s.settings.approach * 0.5)) < 1e-9);
});

test('shutter uses film, pushes the creature back, blinds and drains charge', () => {
  const s = playing();
  C.step(s, { fire: true }, 0.01);
  assert.equal(s.film, 2);
  assert.equal(s.photos.length, 1);
  assert.equal(s.creatures[0].dist, s.cfg.retreat);
  assert.equal(s.blindTimer, s.cfg.blind);
  assert.equal(s.charge, 0);
  C.step(s, { fire: true }, 0.01);
  assert.equal(s.film, 2, 'cannot shoot while blind or uncharged');
});

test('using all film without evidence ends the game', () => {
  const s = playing();
  for (let i = 0; i < 3; i++) {
    s.charge = 1;
    s.blindTimer = 0;
    C.step(s, { fire: true }, 0.01);
  }
  assert.equal(s.phase, 'gameover');
  assert.equal(s.endReason, 'nofilm');
});

test('an EVIDENCE photo clears the night, and fire starts the next night', () => {
  const s = playing();
  const c = s.creatures[0];
  c.dist = 0.25;
  c.x = 160;
  c.targetX = 160;
  const r = C.creatureRect(c, s.cfg);
  s.vf.x = r.x - 20;
  s.vf.y = r.y - 5;
  const ev = C.step(s, { fire: true }, 0.001);
  assert.ok(ev.includes('win'));
  assert.equal(s.phase, 'develop');
  assert.equal(C.bestPhoto(s).grade, 'EVIDENCE');
  C.step(s, {}, 1);
  C.step(s, { fire: true }, 0.01);
  assert.equal(s.phase, 'play');
  assert.equal(s.night, 2);
});

test('a creature reaching the player ends the game, then fire returns to attract', () => {
  const s = playing();
  const c = s.creatures[0];
  c.dist = 0.001;
  c.x = 300;
  c.targetX = 300;
  s.vf.x = 0;
  s.vf.y = 0;
  const ev = C.step(s, {}, 0.1);
  assert.equal(s.phase, 'gameover');
  assert.equal(s.endReason, 'caught');
  assert.ok(ev.includes('caught'));
  C.step(s, {}, 2);
  C.step(s, { fire: true }, 0.01);
  assert.equal(s.phase, 'attract');
});

test('dawn without evidence ends the game', () => {
  const s = playing();
  s.timeLeft = 0.05;
  C.step(s, {}, 0.1);
  assert.equal(s.phase, 'gameover');
  assert.equal(s.endReason, 'dawn');
});

test('the viewfinder moves at vfSpeed and stays on screen', () => {
  const s = playing();
  s.vf.x = 100;
  s.vf.y = 100;
  C.step(s, { dx: 1 }, 0.5);
  assert.equal(s.vf.x, 100 + s.cfg.vfSpeed * 0.5);
  C.step(s, { dx: -1 }, 10);
  assert.equal(s.vf.x, 0);
});

test('step accepts undefined input and clamps timeLeft to zero at dawn', () => {
  const s0 = C.createGame(C.makeConfig(), 1);
  assert.doesNotThrow(() => C.step(s0, undefined, 0.1));
  const s = playing();
  assert.doesNotThrow(() => C.step(s, undefined, 0.1));
  s.timeLeft = 0.05;
  C.step(s, undefined, 0.1);
  assert.equal(s.timeLeft, 0);
  assert.equal(s.phase, 'gameover');
  assert.equal(s.endReason, 'dawn');
  assert.doesNotThrow(() => C.step(s, undefined, 0.1));
});

