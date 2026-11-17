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

test('PAL defines a rich 16-bit palette and draw renders all phases with car as pure visual frame (zero car HUD / zero QTE prompts)', () => {
  assert.ok(Object.keys(R.PAL).length >= 12);
  const ctx = createMockCtx();
  const s = C.createGame(C.makeConfig(), 99);

  // 1. TITLE phase
  R.draw(ctx, s);
  assert.ok(ctx.calls.some((c) => c.op === 'fillText' && c.str.includes('EVIDENCE 1989')));

  // 2. NIGHT_INTRO phase
  C.step(s, { action: true }, 0.01);
  R.draw(ctx, s);
  assert.ok(ctx.calls.some((c) => c.op === 'fillText' && c.str.includes('NIGHT 1')));

  // 3. PLAYING phase: check zero car-chore UI, zero tension bars, and zero range QTE text
  C.step(s, { action: true }, 0.01);
  s.creatures[0].dir = 'FRONT';
  s.creatures[0].dist = 0.30;
  s.creatures[0].pose = 'LUNGE';
  s.cockpit.panX = 160;
  ctx.calls.length = 0;
  R.draw(ctx, s);

  const renderedTexts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.str).join(' | ');
  assert.equal(renderedTexts.includes('BATT'), false, 'must not render battery HUD');
  assert.equal(renderedTexts.includes('WIPER'), false, 'must not render wiper HUD');
  assert.equal(renderedTexts.includes('LIGHT'), false, 'must not render headlight HUD');
  assert.equal(renderedTexts.includes('RADAR'), false, 'must not render AM radar HUD');
  assert.equal(renderedTexts.includes('EVIDENCE RANGE'), false, 'must not render QTE range prompt');

  // Aiming viewfinder + shooting Polaroid
  ctx.calls.length = 0;
  s.cockpit.vfActive = true;
  R.draw(ctx, s);
  const vfTexts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.str).join(' | ');
  assert.equal(vfTexts.includes('EVIDENCE RANGE'), false, 'viewfinder must not spoil range with text QTE');

  // Heavy eyelids & involuntary blink render purely visually with zero UI text
  s.cockpit.vfActive = false;
  s.cockpit.eyeStrain = 0.85;
  ctx.calls.length = 0;
  R.draw(ctx, s);
  const strainTexts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.str).join(' | ');
  assert.equal(strainTexts.includes('TENSION'), false, 'eye strain must not render any text bar');

  s.cockpit.blinkTimer = 0.15;
  ctx.calls.length = 0;
  R.draw(ctx, s);
  assert.ok(ctx.calls.some((c) => c.op === 'fillRect' && c.w === 320 && c.h === 240), 'blink covers full screen in black');

  s.cockpit.blinkTimer = 0;
  C.step(s, { aim: true, shoot: true }, 0.01);
  R.draw(ctx, s);

  // 4. NIGHT_SUMMARY, GAME_OVER, VICTORY phases
  s.phase = 'NIGHT_SUMMARY';
  R.draw(ctx, s);
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
  R.draw(ctx, s);

  assert.deepEqual(transformArgs, [4, 0, 0, 4, 0, 0]);
  assert.equal(ctx.imageSmoothingEnabled, false);
});
