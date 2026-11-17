# EVIDENCE 1989 Survival Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 15-second Night 1/2 speedrun by preventing long-range viewfinder cheese in Phase 1 (`EVIDENCE`) and transitioning upon evidence completion into a pitch-black, red-eyes-only Phase 2 (`SURVIVAL`) where the player puts down the camera and uses a flashlight (`SHIFT` beam + `SPACE` close-range strobe) to survive until `05:00 AM`.

**Architecture:** Extend the single-file `EVIDENCE 1989.html` architecture (`Evidence16BitCore`, `Evidence16BitRender`, `Evidence16BitAudio`) with a per-night `subPhase` (`'EVIDENCE' | 'SURVIVAL'`) and `toolMode` (`'CAMERA' | 'FLASHLIGHT'`). Both sub-phases share the 123 Wooden Man gaze-freeze, psychic overload, cross-night window cracks, stereo audio, and `SHIFT`/`SPACE` input pipeline, switching tool behavior and canvas rendering masks seamlessly when the required evidence count is reached.

**Tech Stack:** Vanilla JavaScript (ES6 IIFE modules), HTML5 2D Canvas (`320x240` internal 16-bit buffer), Web Audio API, Node.js built-in test runner (`node:test` + `node:assert/strict` + `node:vm`).

**Spec:** `docs/superpowers/specs/2026-11-18-evidence-1989-survival-polish-design.md`

## Global Constraints

- Maintain the single-file `EVIDENCE 1989.html` architecture containing `Evidence16BitCore`, `Evidence16BitRender`, and `Evidence16BitAudio` with zero external image or audio assets.
- Maintain the `320x240` native 16-bit canvas resolution and cross-night spiderweb crack persistence (`windowCracks`).
- Keep the exact same controls (`A/D` or `ArrowLeft/ArrowRight` to pan, `SHIFT`/`J`/Right-Click to raise active tool, `SPACE`/`K`/Left-Click to fire shutter or flashlight strobe).
- **Zero red warning borders or modern autofocus UI brackets**: distance and timing in both `CAMERA` and `FLASHLIGHT` modes must be communicated purely through the creature's 16-bit visual appearance (blur-to-sharp in viewfinder; dark silhouette to illuminated pale face/teeth/hands at `dist <= 0.42` in flashlight beam) plus the single green/red charge LED dot.

## Review Focus

1. **Flashlight firing when `filmLeft === 0` in `SURVIVAL`**: If the player uses their last film exposure to capture the final required `EVIDENCE` photo (`camera.filmLeft === 0`), pressing `SPACE` in `SURVIVAL` mode must still fire the flashlight strobe without being blocked by `filmLeft <= 0` or consuming film.
2. **Clock transition when entering `SURVIVAL` after `03:00 AM`**: If the player secures the final required `EVIDENCE` photo when `night.timeElapsed` is already past `03:00 AM` (`> night.duration * 0.6`), transitioning to `SURVIVAL` must preserve the later `timeElapsed` and never rewind the clock backward.
3. **Far-range (`dist > 0.42`) premature flashlight strobe in `SURVIVAL`**: Pressing `SPACE` while shining the flashlight on a creature at `dist > 0.42` must consume the flashlight capacitor charge (`chargeTimer = 2.2`, `blindTimer = 0.65`) and only stagger the creature slightly (`dist = Math.min(0.95, dist + 0.08)`), without relocating it to another window or resetting it to `retreatDist`.
4. **Night 3 multi-creature isolation during flashlight blast**: Firing a close-range (`dist <= 0.42`) flashlight strobe in one window on Night 3 must relocate only the creature(s) in the aimed window/beam, leaving creatures in other windows undisturbed.
5. **No red warning border drawn in `SURVIVAL` mode**: Rendering `SURVIVAL` mode with `vfActive = true` and a creature at `dist <= 0.42` must never invoke `strokeRect` with `PAL.dangerRed` or `PAL.eyeRed`.

---

### Task 1: Core State Machine — Phase 1 Anti-Cheese & Phase 2 (`SURVIVAL`) Flashlight Mechanics

**Files:**
- Create: `prototype/tests/survival-polish.test.js`
- Modify: `EVIDENCE 1989.html:128-999` (`Evidence16BitCore`)

**Interfaces:**
- Produces in `Evidence16BitCore`:
  - `DEFAULTS.flashlightDist = 0.42`, `DEFAULTS.flashlightChargeTime = 2.2`, `DEFAULTS.flashlightBlindTime = 0.65`, `DEFAULTS.flashlightBeamR = 52`
  - `state.night.subPhase`: `'EVIDENCE' | 'SURVIVAL'` (initialized to `'EVIDENCE'` in `createGame` and `startNight`)
  - `state.cockpit.toolMode`: `'CAMERA' | 'FLASHLIGHT'` (initialized to `'CAMERA'` in `createGame` and `startNight`)
  - `state.cockpit.survivalBannerTimer`: `number` (set to `3.5` when transitioning from `'EVIDENCE'` to `'SURVIVAL'`)
  - `inspectFlashlightTarget(state) -> { hasTarget: boolean, inBlastRange: boolean, dist: number, illumination: number, creature: object | null }`

- [ ] **Step 1: Write the failing core tests in `prototype/tests/survival-polish.test.js`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/survival-polish.test.js`
Expected: FAIL (`s.night.subPhase` is `undefined`, night ends early to `NIGHT_SUMMARY`, far `WAIT` creature moves too fast).

- [ ] **Step 3: Implement Phase 1 anti-cheese and Phase 2 `SURVIVAL` state machine in `EVIDENCE 1989.html` (`Evidence16BitCore`)**

Update `Evidence16BitCore` in `EVIDENCE 1989.html`:
- Add to `DEFAULTS`: `flashlightDist: 0.42`, `flashlightChargeTime: 2.2`, `flashlightBlindTime: 0.65`, `flashlightBeamR: 52`.
- In `createGame` and `startNight`: set `state.night.subPhase = 'EVIDENCE'`, `state.cockpit.toolMode = 'CAMERA'`, `state.cockpit.survivalBannerTimer = 0`.
- Add `inspectFlashlightTarget(state)`: finds the closest creature overlapping the viewfinder/beam rect (`getViewfinderRect(state)`), returning `{ hasTarget, inBlastRange: c.dist <= state.cfg.flashlightDist, dist: c.dist, illumination: clamp((0.82 - c.dist) / (0.82 - state.cfg.flashlightDist), 0.12, 1), creature: c }`, and export it on `Evidence16BitCore`.
- Update `handleShutter(state)`:
  - When `state.night.subPhase === 'SURVIVAL'` (or `state.cockpit.toolMode === 'FLASHLIGHT'`):
    - Require only `camera.chargeTimer <= 0` (ignore `camera.filmLeft`).
    - Set `camera.chargeTimer = cfg.flashlightChargeTime` (`2.2`), `camera.blindTimer = cfg.flashlightBlindTime` (`0.65`), push `{ type: 'FLASHLIGHT_BLAST' }`.
    - For each creature in the aimed window cone (`(rect.eyeX >= DIRECT_GAZE_MIN_X && rect.eyeX <= DIRECT_GAZE_MAX_X) || overlapArea(vf, rect) > 0`):
      - If `c.dist <= cfg.flashlightDist` (`0.42`): push `{ type: 'MONSTER_SCREAM', dir: c.dir }` and call `relocateCreature(c, state)`.
      - Else (`c.dist > cfg.flashlightDist`): stagger only (`c.dist = Math.min(0.95, Number((c.dist + 0.08).toFixed(3)))`, `c.unwatchedTime = 0`).
    - Return `true`.
- Update `step(state, input, dt)`:
  - Decrement `cockpit.survivalBannerTimer = Math.max(0, (cockpit.survivalBannerTimer || 0) - dt)`.
  - Replace the instant-dawn check (`if (night.evidenceCount >= reqEvidence && camera.blindTimer <= 0)`) with the seamless `SURVIVAL` transition:
    - When `night.subPhase !== 'SURVIVAL' && night.evidenceCount >= reqEvidence && camera.blindTimer <= 0`:
      - Set `night.subPhase = 'SURVIVAL'`, `cockpit.toolMode = 'FLASHLIGHT'`, `cockpit.vfActive = false`, `cockpit.survivalBannerTimer = 3.5`, `camera.photoPopupTimer = 0`.
      - Advance clock if earlier than `03:00 AM`: `if (night.timeElapsed < night.duration * 0.6) night.timeElapsed = night.duration * 0.6;`.
      - Push `{ type: 'SURVIVAL_START' }`.
  - Guard the `OUT_OF_FILM` game-over check so it only runs when `night.subPhase !== 'SURVIVAL'`.
  - In Creature AI (`luredInVf` branch):
    - If `night.subPhase !== 'SURVIVAL' && c.dist > 0.62 && (c.pose || 'WAIT') === 'WAIT'`: do NOT auto-center `c.offsetX` (instead drift laterally `c.offsetX += (c.lateralDir || 1) * 18 * dt` with `[-42, 42]` bounds) and keep `c.pose = 'WAIT'` with a `0.28` approach multiplier so holding `SHIFT` from far away cannot speedrun the photo.
    - In `SURVIVAL` subPhase, multiply approach speed by `1.15` (`const survivalMult = night.subPhase === 'SURVIVAL' ? 1.15 : 1.0`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test prototype/tests/survival-polish.test.js`
Expected: PASS (4/4 tests passing).

- [ ] **Step 5: Commit**

```bash
git add "EVIDENCE 1989.html" "prototype/tests/survival-polish.test.js"
git commit -m "feat(core): add Phase 1 anti-cheese and Phase 2 SURVIVAL flashlight mechanics"
```

---

### Task 2: 16-Bit Renderer — Pitch-Black Red-Eyes-Only Exterior, Left-Sill Camera, & Circular Flashlight Beam

**Files:**
- Modify: `EVIDENCE 1989.html:1011-1798` (`Evidence16BitRender`)
- Modify: `prototype/tests/survival-polish.test.js`

**Interfaces:**
- Consumes from `Evidence16BitCore`: `state.night.subPhase`, `state.cockpit.toolMode`, `state.cockpit.survivalBannerTimer`, `C.inspectFlashlightTarget(state)`
- Produces in `Evidence16BitRender`:
  - Pitch-black `SURVIVAL` exterior where unlit creatures render ONLY their red eyes (and close breath fog), while creatures inside the `FLASHLIGHT` beam (`vfActive`) render their body and—at `dist <= cfg.flashlightDist`—their pale sclera, teeth, ribs, and hands, with **zero red warning borders**.
  - Left window sill rested SLR camera in `SURVIVAL` mode, updated top status bar (`SURVIVE TO 5AM`), and `survivalBannerTimer` transition overlay.

- [ ] **Step 1: Add failing renderer tests to `prototype/tests/survival-polish.test.js`**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test prototype/tests/survival-polish.test.js`
Expected: FAIL (`paleCallsOff.length` is non-zero because `drawCreature16Bit` still renders full body and face in `SURVIVAL` when `vfActive === false`).

- [ ] **Step 3: Implement `SURVIVAL` pitch-black red-eyes rendering, left-sill camera, and circular flashlight beam in `EVIDENCE 1989.html` (`Evidence16BitRender`)**

Update `Evidence16BitRender` in `EVIDENCE 1989.html`:
- In `drawExteriorLayers(ctx, state)`:
  - When `state.night.subPhase === 'SURVIVAL'` and `cockpit.lightningFlash <= 0.1`: darken sky and ground to `PAL.voidBlack` (`#07080d`) and omit tree rim highlights outside lightning flashes so the woods feel pitch-black.
- In `drawCreature16Bit(ctx, c, state)`:
  - Check `const isSurvival = state.night && state.night.subPhase === 'SURVIVAL';`
  - Check `const litByFlashlight = isSurvival && cockpit.vfActive && inCone && state.camera.blindTimer <= 0;`
  - If `isSurvival && !litByFlashlight && cockpit.lightningFlash <= 0.12`:
    - Do **not** call `drawCreatureBodyPass` (hide the body silhouette in pitch darkness!).
    - Draw ONLY the gleaming red eyes (`PAL.eyeRed`, `2x2` or `3x3` when `c.dist <= state.cfg.lungeDist`, with subtle sway if `!inCone`) and, if `c.dist <= 0.34`, cold breath fog (`PAL.breathFog`) on the glass, then `return`.
  - If `litByFlashlight`:
    - Do not apply optical lens blur (`vfBlur = 0`).
    - When `c.dist > state.cfg.flashlightDist` (`> 0.42`), render `drawCreatureBodyPass` with `globalAlpha` scaled by distance (`clamp((0.88 - c.dist) / 0.46, 0.32, 0.85)`) + red eyes only (still too far for pale facial detail).
    - When `c.dist <= state.cfg.flashlightDist` (`<= 0.42`), render full sharp `drawCreatureBodyPass` AND force full illumination of the pale sclera, pupils, rictus grin teeth, ribs, and lunging hands (`PAL.corpsePale` / `PAL.corpseDim`) so the player visually sees the creature is in blast range without any UI border.
- In `drawCockpitInterior(ctx, state)`:
  - When `state.night.subPhase === 'SURVIVAL'`:
    - Draw the put-down SLR camera body + lens barrel resting on the left window sill (`worldX = 210`, `sillY + 10`) with label `'SLR (DONE)'`.
    - Update the top headliner strip to show `'FLASHLIGHT'` instead of `'FILM:...'` and `'SURVIVE->5AM'` in `PAL.quartzGreen`.
    - In the peripheral vision loop (`for (const c of state.creatures)`), when `isSurvival`, omit the peripheral body rectangle (`silW x silH`) and draw only the peripheral red eye glints (`PAL.eyeRed`) and cold breath fog.
- In `drawViewfinderAndPhoto(ctx, state)`:
  - Branch on `state.night.subPhase === 'SURVIVAL'` when `cockpit.vfActive` is true:
    - Instead of the rectangular camera viewfinder, compute beam center `(cx = vf.x + vf.w / 2, cy = vf.y + vf.h / 2)` and radius `r = state.cfg.flashlightBeamR || 52`.
    - Draw dark surrounding mask strips outside the beam box and 16-bit stepped corner masks so the illuminated window forms a circular/octagonal spotlight cone, tinted with warm incandescent beam glow (`rgba(255, 210, 120, 0.11)`).
    - Draw the physical flashlight barrel silhouette at the bottom center of the beam (`cx - 18, vf.y + vf.h, 36, H - (vf.y + vf.h)`) with the single physical charge LED dot (`PAL.quartzGreen` when `camera.chargeTimer <= 0`, else `PAL.dangerRed`)—**never** drawing any red warning border around the beam or creature.
  - When `cockpit.survivalBannerTimer > 0`, render a concise diegetic banner at the top of the screen: `'EVIDENCE SECURED — CAMERA DOWN! USE FLASHLIGHT [SHIFT+SPACE] UNTIL 05:00 AM'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test prototype/tests/survival-polish.test.js`
Expected: PASS (5/5 tests passing).

- [ ] **Step 5: Commit**

```bash
git add "EVIDENCE 1989.html" "prototype/tests/survival-polish.test.js"
git commit -m "feat(render): add pitch-black red-eye survival visuals and circular flashlight beam"
```

---

### Task 3: Audio & UI Integration — Survival Transition Stinger, Flashlight Strobe SFX, and Dynamic Help/Button Labels

**Files:**
- Modify: `EVIDENCE 1989.html:88-101,1800-2628` (`Evidence16BitAudio` and DOM bindings)
- Modify: `prototype/tests/survival-polish.test.js`

**Interfaces:**
- Consumes: `SURVIVAL_START` and `FLASHLIGHT_BLAST` events emitted by `Evidence16BitCore.step`
- Produces in `Evidence16BitAudio`: `playEvent` handlers for `'SURVIVAL_START'` (power-down + thunder + monster enrage roar) and `'FLASHLIGHT_BLAST'` (high-voltage halogen strobe pop + capacitor recharge whine), plus updated DOM button/help text in `EVIDENCE 1989.html`.

- [ ] **Step 1: Add audio event & full-loop verification test to `prototype/tests/survival-polish.test.js`**

```js
test('Audio handles SURVIVAL_START and FLASHLIGHT_BLAST events and existing 16-bit suite remains green', () => {
  const { A } = loadHtmlModules();
  assert.doesNotThrow(() => {
    A.playEvent({ type: 'SURVIVAL_START' });
    A.playEvent({ type: 'FLASHLIGHT_BLAST' });
  });
});
```

- [ ] **Step 2: Run test and check implementation in `EVIDENCE 1989.html`**

Run: `node --test prototype/tests/survival-polish.test.js`
Expected: PASS or verify `SURVIVAL_START` / `FLASHLIGHT_BLAST` synthesis functions exist on `Evidence16BitAudio`.

- [ ] **Step 3: Implement `SURVIVAL_START` and `FLASHLIGHT_BLAST` audio synthesizers and dynamic button labels in `EVIDENCE 1989.html`**

In `Evidence16BitAudio` (`EVIDENCE 1989.html`):
- Add `survivalStartStinger()` (thunder rumble + power-down pitch drop + distant monster roar) and `flashlightBlast()` (halogen strobe discharge + capacitor recharge whine), wiring both into `playEvent(ev)` and exporting them on `Evidence16BitAudio`.
- In the browser `frame(now)` loop and `.help` copy (`EVIDENCE 1989.html`):
  - Dynamically update `#btnAim` text between `'[SHIFT] 舉起相機（遮住肉眼）'` (`EVIDENCE`) and `'[SHIFT] 舉起手電筒（聚光顯影）'` (`SURVIVAL`), and `#btnShoot` text between `'[SPACE] 快門閃光'` and `'[SPACE] 手電筒爆閃'`.
  - Update `.help` description to concisely explain both halves of the night (前半夜舉相機對焦抓拍 → 拍滿後放下相機，後半夜在極暗紅眼中用手電筒照亮五官並強光閃退，死守至 05:00 AM).

- [ ] **Step 4: Run all tests to verify everything passes**

Run: `node --test prototype/tests/survival-polish.test.js`
Expected: PASS (all 6 tests passing).

- [ ] **Step 5: Commit**

```bash
git add "EVIDENCE 1989.html" "prototype/tests/survival-polish.test.js"
git commit -m "feat(audio,ui): add survival transition stinger, flashlight SFX, and dynamic HUD controls"
```
