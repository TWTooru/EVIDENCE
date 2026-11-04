const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../evidence-16bit-core.js');
const R = require('../evidence-16bit-render.js');

function createMockCtx() {
  const calls = [];
  const noop = () => {};
  return {
    calls,
    save: noop,
    restore: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    rect: noop,
    clip: noop,
    fillRect(x, y, w, h) { calls.push({ op: 'fillRect', x, y, w, h }); },
    strokeRect(x, y, w, h) { calls.push({ op: 'strokeRect', x, y, w, h }); },
    fillText(str, x, y) { calls.push({ op: 'fillText', str: String(str), x, y }); },
    setLineDash: noop,
    lineWidth: 1,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
  };
}

test('PAL defines a rich 16-bit era color palette and draw renders all game phases cleanly', () => {
  assert.ok(Object.keys(R.PAL).length >= 12);
  const ctx = createMockCtx();
  const s = C.createGame(C.makeConfig({ debug: 1 }), 99);

  // 1. TITLE phase
  R.draw(ctx, s);
  assert.ok(ctx.calls.some((c) => c.op === 'fillText' && c.str.includes('EVIDENCE 1989')));

  // 2. NIGHT_INTRO phase
  C.step(s, { action: true }, 0.01);
  R.draw(ctx, s);
  assert.ok(ctx.calls.some((c) => c.op === 'fillText' && c.str.includes('NIGHT 1')));

  // 3. PLAYING phase (panning, wipers, headlights, viewfinder, roof lookUp, photo popup)
  C.step(s, { action: true }, 0.01);
  s.cockpit.wipersOn = true;
  s.cockpit.headlightsOn = true;
  s.cockpit.vfActive = true;
  R.draw(ctx, s);

  // Trigger shutter flash and draw blind glare + polaroid popup
  s.creatures[0].dir = 'FRONT';
  s.creatures[0].dist = 0.25;
  C.step(s, { aim: true, shoot: true }, 0.01);
  R.draw(ctx, s);

  // Roof lookUp rendering
  s.cockpit.lookUp = true;
  s.creatures[0].dir = 'ROOF';
  R.draw(ctx, s);

  // 4. NIGHT_SUMMARY phase
  s.phase = 'NIGHT_SUMMARY';
  R.draw(ctx, s);

  // 5. GAME_OVER and VICTORY phases
  s.phase = 'GAME_OVER';
  s.endReason = 'BREACH';
  R.draw(ctx, s);

  s.phase = 'VICTORY';
  R.draw(ctx, s);
});

test('HiDPI integer scaling: draw applies crisp 4x transform and disables smoothing on 1280x960 canvas', () => {
  const ctx = createMockCtx();
  ctx.canvas = { width: 1280, height: 960 };
  let transformArgs = null;
  ctx.setTransform = (...args) => { transformArgs = args; };
  ctx.imageSmoothingEnabled = true;

  const s = C.createGame(C.makeConfig(), 12);
  C.startNight(s, 1);
  s.cockpit.rainBlur = 0.75; // Triggers WIPER NEEDED warning & crisp raindrop pattern
  R.draw(ctx, s);

  assert.deepEqual(transformArgs, [4, 0, 0, 4, 0, 0]);
  assert.equal(ctx.imageSmoothingEnabled, false);
  assert.ok(ctx.calls.some((c) => c.op === 'fillText' && c.str.includes('WIPER')));
});

