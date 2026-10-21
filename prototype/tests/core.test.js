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

test('night 3 brings two creatures and faster approach', () => {
  const cfg = C.makeConfig();
  const n3 = C.nightSettings(3, cfg);
  assert.equal(n3.count, 2);
  assert.equal(n3.approach, cfg.approach * (1 + 0.25 * 2));
  assert.equal(C.nightSettings(1, cfg).count, 1);
  assert.equal(C.nightSettings(1, cfg).nightTime, 60);
  assert.equal(C.nightSettings(5, cfg).nightTime, 50);
});
