const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../evidence-core.js');
const R = require('../evidence-render.js');

function fakeCtx() {
  const colors = new Set();
  const noop = () => {};
  const ctx = {
    colors,
    save: noop, restore: noop, beginPath: noop, rect: noop, clip: noop,
    fillRect: noop, strokeRect: noop, fillText: noop, setLineDash: noop,
    lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'top',
  };
  for (const key of ['fillStyle', 'strokeStyle']) {
    Object.defineProperty(ctx, key, {
      set(v) { colors.add(String(v).toLowerCase()); },
      get() { return '#000000'; },
    });
  }
  return ctx;
}

test('every phase draws without errors using only the defined palette', () => {
  const allowed = new Set(Object.values(R.PAL));
  assert.equal(allowed.size, 5);
  const ctx = fakeCtx();
  const s = C.createGame(C.makeConfig({ debug: 1 }), 7);

  R.draw(ctx, s);                                  // attract
  C.step(s, { fire: true }, 0);
  R.draw(ctx, s);                                  // play, watched
  s.vf.x = 0; s.vf.y = 0;
  for (let i = 0; i < 40; i++) { C.step(s, {}, 0.05); R.draw(ctx, s); }  // unwatched, glints
  C.step(s, { fire: true }, 0.01);
  R.draw(ctx, s);                                  // flash + blind + thumbnail
  C.step(s, {}, 0.5);
  R.draw(ctx, s);

  const c = s.creatures[0];
  c.dist = 0.25; c.x = 160; c.targetX = 160;
  const r = C.creatureRect(c, s.cfg);
  s.vf.x = r.x - 20; s.vf.y = r.y - 5; s.charge = 1; s.blindTimer = 0;
  C.step(s, { fire: true }, 0.001);
  assert.equal(s.phase, 'develop');
  R.draw(ctx, s);                                  // develop

  C.step(s, {}, 1);
  C.step(s, { fire: true }, 0.01);                 // night 2
  s.creatures[0].dist = 0.001; s.creatures[0].x = 300; s.vf.x = 0;
  C.step(s, {}, 0.1);
  assert.equal(s.endReason, 'caught');
  R.draw(ctx, s);                                  // gameover jump scare
  C.step(s, {}, 2);
  R.draw(ctx, s);                                  // gameover summary

  for (const color of ctx.colors) assert.ok(allowed.has(color), `unexpected color ${color}`);
});
