# EVIDENCE 1976 數位原型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出一個可在瀏覽器直接開啟的 EVIDENCE 1976 原型，驗證「框住就停、移開就來」的核心手感、框外追蹤，以及照片評級的可讀性。

**Architecture:** 純邏輯（`evidence-core.js`，無 DOM，可用 Node 測試）與呈現（`evidence-render.js` 畫 Canvas、`evidence-audio.js` 用 WebAudio 合成）分離，由 `evidence.html` 負責輸入與主迴圈。所有檔案都是一般 `<script>` 載入，雙擊 HTML 就能玩（`file://`），不需要建置工具。所有數值集中在 `DEFAULTS`，可用 URL 參數覆寫，方便測試時調整平衡。

**Tech Stack:** 原生 JavaScript（ES2020）、Canvas 2D、Web Audio API；測試使用 Node 內建 `node:test`（Node ≥ 18，本機為 v24）。

**Spec:** [2026-10-21-evidence-1976-design.md](../specs/2026-10-21-evidence-1976-design.md)

## Global Constraints

- 邏輯解析度 320 × 320（Canvas 實際 640 × 640，`setTransform(2,0,0,2,0,0)`）。
- 單畫面，不捲動。
- 只能使用 4 種顏色：`#000000`（黑）、`#24307a`（深藍）、`#f2f2f2`（白）、`#ff2a2a`（紅）。不可使用半透明混色。
- 最多 5 種電子合成聲音：心跳、樹枝斷裂聲、閃光充電聲、快門聲、尖叫。不使用外部音檔。
- 同時活動物件 ≤ 10（觀景窗、最多 2 隻「它」、4 棵樹、閃光、照片縮圖）。
- 輸入：方向（方向鍵 / WASD）+ 一顆按鈕（Space / J；滑鼠點擊等同按鈕）。按鈕採邊緣觸發，按住不會連發。
- 狀態流程：`attract → play → develop（過關）/ gameover → attract`。
- 所有檔案放在 `prototype/`，不引入任何第三方套件。

## File Structure

| 檔案 | 職責 |
|---|---|
| `prototype/evidence-core.js` | 數值設定、幾何、凍結判定、照片評分、關卡升級、遊戲狀態與 `step()` |
| `prototype/evidence-render.js` | 依狀態把畫面畫到 Canvas（只用 4 色） |
| `prototype/evidence-audio.js` | 5 種合成聲音，依 `step()` 回傳的事件播放 |
| `prototype/evidence.html` | 輸入處理、主迴圈、URL 參數 |
| `prototype/tests/core.test.js` | 核心邏輯測試 |
| `prototype/tests/render.test.js` | 繪圖煙霧測試與 4 色限制檢查 |

### 座標與幾何模型（所有任務共用）

- 「它」的狀態：`x`（畫面上中心的 x，40–280）、`dist`（1 = 地平線最遠處，0 = 碰到玩家）。
- 高度 `h = minH + (maxH - minH) × (1 - dist)`，寬度 `w = 0.3h`。
- 腳底 y = `HORIZON_Y + (FEET_NEAR_Y - HORIZON_Y) × (1 - dist)`，其中 `HORIZON_Y = 140`、`FEET_NEAR_Y = 300`。
- 眼睛位置：`(x, top + 0.12h)`。**眼睛在觀景窗內，且玩家沒有致盲時，它就凍結。**
- 照片評分：`completeness = 重疊面積 / 身體面積`、`fill = min(h / 觀景窗高, 1)`、`score = round(100 × fill × completeness)`。
  - `EVIDENCE`：`fill ≥ 0.85` 且 `completeness ≥ 0.95`
  - `SUSPICIOUS`：`score ≥ 40`
  - 其他為 `BLURRY`
- 預設觀景窗 90 × 110。「證據級」大約出現在 `dist` 0.18–0.32 之間：太遠拍不滿，太近又塞不進框，而 `dist = 0` 就是被抓到。這個甜蜜點就是貪婪的來源。

---

### Task 1: 核心幾何與評分（含專案初始化）

**Files:**
- Create: `prototype/evidence-core.js`
- Test: `prototype/tests/core.test.js`

**Interfaces:**
- Consumes: 無
- Produces（`EvidenceCore` / `module.exports`）：
  - `SCREEN: 320`、`HORIZON_Y: 140`、`FEET_NEAR_Y: 300`、`DEFAULTS: object`
  - `makeConfig(overrides?: object) → cfg`：只接受 `DEFAULTS` 裡有的鍵，值必須能轉成有限數字
  - `mulberry32(seed: number) → () => number`
  - `creatureRect(c: {x, dist}, cfg) → {x, y, w, h}`
  - `eyePoint(c, cfg) → {x, y}`
  - `isFrozen(c, vf: {x,y,w,h}, blindTimer: number, cfg) → boolean`
  - `gradePhoto(vf, rect, cfg) → {score, grade: 'EVIDENCE'|'SUSPICIOUS'|'BLURRY', fill, completeness}`
  - `nightSettings(night: number, cfg) → {count, approach, lateral, nightTime}`

- [ ] **Step 1: 初始化 git**

Run（在 `C:\Users\user\Desktop\work`）：
```powershell
git init
```
Expected: `Initialized empty Git repository in .../work/.git/`

- [ ] **Step 2: 寫失敗的測試**

建立 `prototype/tests/core.test.js`：

```js
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
```

- [ ] **Step 3: 執行測試，確認失敗**

Run: `node --test prototype/tests/core.test.js`
Expected: FAIL，錯誤為 `Cannot find module '../evidence-core.js'`

- [ ] **Step 4: 寫最小實作**

建立 `prototype/evidence-core.js`：

```js
/* EVIDENCE 1976 — core logic (no DOM). Works as a browser global (EvidenceCore) and a Node module. */
(function (root) {
  'use strict';

  const SCREEN = 320;
  const HORIZON_Y = 140;
  const FEET_NEAR_Y = 300;

  // 所有可調數值。可用 URL 參數覆寫，例如 ?approach=0.08&vfSpeed=150
  const DEFAULTS = {
    vfW: 90,              // 觀景窗寬
    vfH: 110,             // 觀景窗高
    vfSpeed: 120,         // 觀景窗移動速度（px/s）
    approach: 0.06,       // 沒被注視時每秒靠近的距離（dist 單位）
    lateral: 30,          // 沒被注視時的橫移速度（px/s）
    nightTime: 60,        // 每晚秒數
    film: 3,              // 每晚底片數
    charge: 2,            // 閃光充電秒數
    blind: 1,             // 閃光後致盲秒數
    glint: 1.5,           // 框外紅眼閃光間隔（秒）
    glintOn: 0.15,        // 紅眼閃光持續秒數
    retreat: 0.95,        // 閃光後被逼退到的距離
    minH: 16,             // 最遠時的身高（px）
    maxH: 130,            // 碰到玩家時的身高（px）
    evidenceFill: 0.85,
    evidenceComplete: 0.95,
    suspiciousScore: 40,
    debug: 0,
  };

  function makeConfig(overrides) {
    const cfg = Object.assign({}, DEFAULTS);
    if (!overrides) return cfg;
    for (const key of Object.keys(DEFAULTS)) {
      const raw = overrides[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const value = Number(raw);
      if (Number.isFinite(value)) cfg[key] = value;
    }
    return cfg;
  }

  function mulberry32(a) {
    let seed = (a >>> 0) || 1;
    return function () {
      let t = (seed += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function creatureRect(c, cfg) {
    const near = 1 - c.dist;
    const h = cfg.minH + (cfg.maxH - cfg.minH) * near;
    const w = h * 0.3;
    const feetY = HORIZON_Y + (FEET_NEAR_Y - HORIZON_Y) * near;
    return { x: c.x - w / 2, y: feetY - h, w, h };
  }

  function eyePoint(c, cfg) {
    const r = creatureRect(c, cfg);
    return { x: c.x, y: r.y + r.h * 0.12 };
  }

  function pointInRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  function isFrozen(c, vf, blindTimer, cfg) {
    return blindTimer <= 0 && pointInRect(eyePoint(c, cfg), vf);
  }

  function overlapArea(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  function gradePhoto(vf, rect, cfg) {
    const completeness = overlapArea(vf, rect) / (rect.w * rect.h);
    const fill = Math.min(rect.h / vf.h, 1);
    const score = Math.round(100 * fill * completeness);
    let grade = 'BLURRY';
    if (fill >= cfg.evidenceFill && completeness >= cfg.evidenceComplete) grade = 'EVIDENCE';
    else if (score >= cfg.suspiciousScore) grade = 'SUSPICIOUS';
    return { score, grade, fill, completeness };
  }

  function nightSettings(night, cfg) {
    const speedUp = 1 + 0.25 * (night - 1);
    return {
      count: night >= 3 ? 2 : 1,
      approach: cfg.approach * speedUp,
      lateral: cfg.lateral * speedUp,
      nightTime: night >= 4 ? Math.max(40, cfg.nightTime - 5 * (night - 3)) : cfg.nightTime,
    };
  }

  const API = {
    SCREEN, HORIZON_Y, FEET_NEAR_Y, DEFAULTS,
    makeConfig, mulberry32, clamp,
    creatureRect, eyePoint, isFrozen, gradePhoto, nightSettings,
  };

  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.EvidenceCore = API;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 5: 執行測試，確認通過**

Run: `node --test prototype/tests/core.test.js`
Expected: 7 個測試全部 PASS（`# pass 7`、`# fail 0`）

- [ ] **Step 6: Commit**

```powershell
git add prototype/evidence-core.js prototype/tests/core.test.js docs
git commit -m "feat(prototype): core geometry, freeze rule and photo grading"
```

---

### Task 2: 遊戲狀態與 `step()` 迴圈

**Files:**
- Modify: `prototype/evidence-core.js`（把 Task 1 的 `const API = { ... };` 整段替換掉）
- Test: `prototype/tests/core.test.js`（在檔案最後追加）

**Interfaces:**
- Consumes: Task 1 的所有函式
- Produces（加入 `EvidenceCore`）：
  - `createGame(cfg, seed?: number) → state`
  - `startNight(state, night: number) → void`
  - `step(state, input: {dx?: -1|0|1, dy?: -1|0|1, fire?: boolean}, dt: number) → string[]`
    事件名稱：`'start' | 'glint' | 'heartbeat' | 'snap' | 'shot' | 'win' | 'caught' | 'lose'`
  - `bestPhoto(state) → photo | null`
  - `state` 欄位（渲染端會讀）：`phase: 'attract'|'play'|'develop'|'gameover'`、`phaseTime`、`night`、`score`、`vf {x,y,w,h}`、`creatures [{x, dist, targetX, glintTimer, glintVisible, frozen}]`、`film`、`timeLeft`、`charge (0–1)`、`blindTimer`、`flashTimer`、`photos [{vf, rects, grade, score}]`、`lastPhotoTimer`、`endReason: 'caught'|'dawn'|'nofilm'|null`、`settings`、`cfg`

- [ ] **Step 1: 寫失敗的測試**

在 `prototype/tests/core.test.js` 最後追加：

```js
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
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `node --test prototype/tests/core.test.js`
Expected: 前 7 個 PASS，新的 8 個 FAIL，錯誤為 `C.createGame is not a function`

- [ ] **Step 3: 寫實作**

在 `prototype/evidence-core.js` 中，把下面這段：

```js
  const API = {
    SCREEN, HORIZON_Y, FEET_NEAR_Y, DEFAULTS,
    makeConfig, mulberry32, clamp,
    creatureRect, eyePoint, isFrozen, gradePhoto, nightSettings,
  };
```

整段替換成：

```js
  function randomX(rng) {
    return 40 + rng() * 240;
  }

  function spawnCreature(rng, cfg, dist) {
    return { x: randomX(rng), dist, targetX: randomX(rng), glintTimer: cfg.glint, glintVisible: 0, frozen: false };
  }

  function createGame(cfg, seed) {
    return {
      cfg,
      rng: mulberry32(seed || 1976),
      phase: 'attract',
      phaseTime: 0,
      night: 0,
      score: 0,
      vf: { x: (SCREEN - cfg.vfW) / 2, y: (SCREEN - cfg.vfH) / 2, w: cfg.vfW, h: cfg.vfH },
      creatures: [],
      film: 0,
      timeLeft: 0,
      charge: 1,
      blindTimer: 0,
      flashTimer: 0,
      photos: [],
      lastPhotoTimer: 0,
      settings: null,
      heartTimer: 1,
      snapTimer: 3,
      endReason: null,
    };
  }

  function startNight(s, night) {
    const cfg = s.cfg;
    s.night = night;
    s.settings = nightSettings(night, cfg);
    s.phase = 'play';
    s.phaseTime = 0;
    s.film = cfg.film;
    s.timeLeft = s.settings.nightTime;
    s.charge = 1;
    s.blindTimer = 0;
    s.flashTimer = 0;
    s.photos = [];
    s.lastPhotoTimer = 0;
    s.endReason = null;
    s.creatures = [];
    for (let i = 0; i < s.settings.count; i++) s.creatures.push(spawnCreature(s.rng, cfg, 0.9));
    // 開場先把觀景窗對準第一隻，讓玩家第一眼就看到「框住它就不動」
    const eye = eyePoint(s.creatures[0], cfg);
    s.vf.x = clamp(eye.x - s.vf.w / 2, 0, SCREEN - s.vf.w);
    s.vf.y = clamp(eye.y - s.vf.h / 2, 0, SCREEN - s.vf.h);
  }

  function endGame(s, reason, events) {
    s.phase = 'gameover';
    s.phaseTime = 0;
    s.endReason = reason;
    events.push(reason === 'caught' ? 'caught' : 'lose');
  }

  function takePhoto(s, events) {
    const cfg = s.cfg;
    const rects = s.creatures.map((c) => creatureRect(c, cfg));
    let best = null;
    for (const r of rects) {
      const g = gradePhoto(s.vf, r, cfg);
      if (!best || g.score > best.score) best = g;
    }
    const photo = { vf: Object.assign({}, s.vf), rects, grade: best.grade, score: best.score };
    s.photos.push(photo);
    s.score += photo.score;
    s.film -= 1;
    s.charge = 0;
    s.blindTimer = cfg.blind;
    s.flashTimer = 0.15;
    s.lastPhotoTimer = 1.5;
    for (const c of s.creatures) {
      c.dist = cfg.retreat;
      c.x = randomX(s.rng);
      c.targetX = randomX(s.rng);
    }
    events.push('shot');
    if (photo.grade === 'EVIDENCE') {
      s.score += 100;
      s.phase = 'develop';
      s.phaseTime = 0;
      events.push('win');
    } else if (s.film <= 0) {
      endGame(s, 'nofilm', events);
    }
  }

  function playStep(s, input, dt, events) {
    const cfg = s.cfg;
    const st = s.settings;

    let dx = input.dx || 0;
    let dy = input.dy || 0;
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    s.vf.x = clamp(s.vf.x + dx * cfg.vfSpeed * dt, 0, SCREEN - s.vf.w);
    s.vf.y = clamp(s.vf.y + dy * cfg.vfSpeed * dt, 0, SCREEN - s.vf.h);

    s.timeLeft -= dt;
    s.blindTimer = Math.max(0, s.blindTimer - dt);
    s.flashTimer = Math.max(0, s.flashTimer - dt);
    s.lastPhotoTimer = Math.max(0, s.lastPhotoTimer - dt);
    if (s.charge < 1) s.charge = Math.min(1, s.charge + dt / cfg.charge);

    let anyMoving = false;
    for (const c of s.creatures) {
      c.frozen = isFrozen(c, s.vf, s.blindTimer, cfg);
      c.glintVisible = Math.max(0, c.glintVisible - dt);
      if (c.frozen) continue;
      anyMoving = true;
      c.dist = Math.max(0, c.dist - st.approach * dt);
      const toTarget = c.targetX - c.x;
      const stepX = st.lateral * dt;
      if (Math.abs(toTarget) <= stepX) {
        c.x = c.targetX;
        c.targetX = randomX(s.rng);
      } else {
        c.x += Math.sign(toTarget) * stepX;
      }
      c.glintTimer -= dt;
      if (c.glintTimer <= 0) {
        c.glintTimer = cfg.glint;
        c.glintVisible = cfg.glintOn;
        events.push('glint');
      }
    }

    const nearest = Math.min(...s.creatures.map((c) => c.dist));
    s.heartTimer -= dt;
    if (s.heartTimer <= 0) {
      s.heartTimer = 0.3 + 0.7 * nearest;
      events.push('heartbeat');
    }
    if (anyMoving) {
      s.snapTimer -= dt;
      if (s.snapTimer <= 0) {
        s.snapTimer = 2 + s.rng() * 2;
        events.push('snap');
      }
    }

    if (nearest <= 0) { endGame(s, 'caught', events); return; }

    if (input.fire && s.charge >= 1 && s.blindTimer <= 0 && s.film > 0) takePhoto(s, events);
    if (s.phase !== 'play') return;

    if (s.timeLeft <= 0) endGame(s, 'dawn', events);
  }

  function step(s, input, dt) {
    const events = [];
    s.phaseTime += dt;
    if (s.phase === 'attract') {
      if (input.fire) {
        s.score = 0;
        startNight(s, 1);
        events.push('start');
      }
      return events;
    }
    if (s.phase === 'develop') {
      if (input.fire && s.phaseTime > 0.5) {
        startNight(s, s.night + 1);
        events.push('start');
      }
      return events;
    }
    if (s.phase === 'gameover') {
      if (input.fire && s.phaseTime > 1.5) {
        s.phase = 'attract';
        s.phaseTime = 0;
      }
      return events;
    }
    playStep(s, input, dt, events);
    return events;
  }

  function bestPhoto(s) {
    return s.photos.reduce((b, p) => (!b || p.score > b.score ? p : b), null);
  }

  const API = {
    SCREEN, HORIZON_Y, FEET_NEAR_Y, DEFAULTS,
    makeConfig, mulberry32, clamp,
    creatureRect, eyePoint, isFrozen, gradePhoto, nightSettings,
    createGame, startNight, step, bestPhoto,
  };
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `node --test prototype/tests/core.test.js`
Expected: `# pass 15`、`# fail 0`

- [ ] **Step 5: Commit**

```powershell
git add prototype/evidence-core.js prototype/tests/core.test.js
git commit -m "feat(prototype): night loop, shutter, win/lose and escalation"
```

---

### Task 3: 畫面渲染（4 色）

**Files:**
- Create: `prototype/evidence-render.js`
- Test: `prototype/tests/render.test.js`

**Interfaces:**
- Consumes: `EvidenceCore` 的 `SCREEN`、`HORIZON_Y`、`creatureRect`、`eyePoint`、`bestPhoto`，以及 Task 2 的 state 欄位
- Produces（`EvidenceRender` / `module.exports`）：
  - `PAL: {black, blue, white, red}`
  - `draw(ctx, state) → void`：只會用到 `fillRect`、`strokeRect`、`fillText`、`save`、`restore`、`beginPath`、`rect`、`clip`、`setLineDash`，以及 `fillStyle`、`strokeStyle`、`lineWidth`、`font`、`textAlign`、`textBaseline` 這些屬性

- [ ] **Step 1: 寫失敗的測試**

建立 `prototype/tests/render.test.js`：

```js
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

test('every phase draws without errors using only the 4-color palette', () => {
  const allowed = new Set(Object.values(R.PAL));
  assert.equal(allowed.size, 4);
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
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `node --test prototype/tests/render.test.js`
Expected: FAIL，錯誤為 `Cannot find module '../evidence-render.js'`

- [ ] **Step 3: 寫實作**

建立 `prototype/evidence-render.js`：

```js
/* EVIDENCE 1976 — canvas renderer. Strict 4-color palette, logical 320x320. */
(function (root) {
  'use strict';

  const C = root.EvidenceCore || (typeof require === 'function' ? require('./evidence-core.js') : null);
  const PAL = { black: '#000000', blue: '#24307a', white: '#f2f2f2', red: '#ff2a2a' };
  const S = C.SCREEN;
  const TREES = [{ x: 30, w: 14 }, { x: 110, w: 10 }, { x: 215, w: 12 }, { x: 285, w: 16 }];
  const GRADE_TEXT = { EVIDENCE: 'EVIDENCE', SUSPICIOUS: 'SUSPICIOUS', BLURRY: 'BLURRY' };

  function text(ctx, str, x, y, color, size, align) {
    ctx.fillStyle = color;
    ctx.font = 'bold ' + (size || 10) + 'px "Courier New", monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(str, x, y);
  }

  function drawScenery(ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, C.HORIZON_Y, S, 1);
    for (const t of TREES) ctx.fillRect(t.x - t.w / 2, 0, t.w, S);
  }

  // r: 身體外框 {x,y,w,h}；ox, oy, k: 平移與縮放（給照片縮圖用）
  function drawSilhouette(ctx, r, color, ox, oy, k) {
    const X = (v) => ox + v * k;
    const Y = (v) => oy + v * k;
    const headH = r.h * 0.22;
    const torsoH = r.h * 0.45;
    const legH = r.h - headH - torsoH;
    ctx.fillStyle = color;
    ctx.fillRect(X(r.x + r.w * 0.2), Y(r.y), r.w * 0.6 * k, headH * k);
    ctx.fillRect(X(r.x), Y(r.y + headH), r.w * k, torsoH * k);
    ctx.fillRect(X(r.x + r.w * 0.05), Y(r.y + headH + torsoH), r.w * 0.3 * k, legH * k);
    ctx.fillRect(X(r.x + r.w * 0.65), Y(r.y + headH + torsoH), r.w * 0.3 * k, legH * k);
  }

  function drawEyes(ctx, r, color, ox, oy, k) {
    const cx = r.x + r.w / 2;
    const ey = r.y + r.h * 0.12;
    const size = Math.max(1, r.w * 0.12) * k;
    ctx.fillStyle = color;
    ctx.fillRect(ox + (cx - r.w * 0.2) * k - size / 2, oy + ey * k - size / 2, size, size);
    ctx.fillRect(ox + (cx + r.w * 0.2) * k - size / 2, oy + ey * k - size / 2, size, size);
  }

  function byDistance(creatures) {
    return creatures.slice().sort((a, b) => b.dist - a.dist);
  }

  function drawPhoto(ctx, photo, x, y, k) {
    const vf = photo.vf;
    const ox = x - vf.x * k;
    const oy = y - vf.y * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, vf.w * k, vf.h * k);
    ctx.clip();
    ctx.fillStyle = PAL.white;
    ctx.fillRect(x, y, vf.w * k, vf.h * k);
    const sorted = photo.rects.slice().sort((a, b) => a.h - b.h);
    for (const r of sorted) {
      drawSilhouette(ctx, r, PAL.black, ox, oy, k);
      drawEyes(ctx, r, PAL.red, ox, oy, k);
    }
    ctx.restore();
    ctx.strokeStyle = PAL.white;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 2.5, y - 2.5, vf.w * k + 5, vf.h * k + 5);
    const gradeColor = photo.grade === 'EVIDENCE' ? PAL.red : PAL.white;
    text(ctx, GRADE_TEXT[photo.grade] + ' ' + photo.score, x + (vf.w * k) / 2, y + vf.h * k + 6, gradeColor, 8, 'center');
  }

  function drawHud(ctx, s) {
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 0, S, 14);
    text(ctx, 'NIGHT ' + s.night, 6, 3, PAL.white, 9);
    text(ctx, 'DAWN ' + Math.max(0, Math.ceil(s.timeLeft)), S - 6, 3, PAL.white, 9, 'right');
    text(ctx, 'SCORE ' + s.score, S / 2, 3, PAL.blue, 9, 'center');

    for (let i = 0; i < s.cfg.film; i++) {
      ctx.fillStyle = i < s.film ? PAL.white : PAL.blue;
      ctx.fillRect(6 + i * 12, S - 16, 8, 10);
    }
    ctx.strokeStyle = PAL.white;
    ctx.lineWidth = 1;
    ctx.strokeRect(S - 52.5, S - 13.5, 46, 6);
    ctx.fillStyle = s.charge >= 1 ? PAL.red : PAL.white;
    ctx.fillRect(S - 51, S - 12, 43 * s.charge, 3);

    const last = s.photos[s.photos.length - 1];
    if (s.lastPhotoTimer > 0 && last) drawPhoto(ctx, last, S - 52, S - 92, 0.4);
  }

  function drawDebug(ctx, s) {
    s.creatures.forEach((c, i) => {
      text(ctx, 'D' + i + ' ' + c.dist.toFixed(2) + (c.frozen ? ' FROZEN' : ''), 6, 18 + i * 10, PAL.red, 8);
    });
  }

  function drawPlay(ctx, s) {
    const cfg = s.cfg;
    const vf = s.vf;
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 0, S, S);
    drawScenery(ctx, PAL.blue);
    for (const c of s.creatures) {
      if (c.glintVisible > 0) drawEyes(ctx, C.creatureRect(c, cfg), PAL.red, 0, 0, 1);
    }

    const lit = s.blindTimer <= 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(vf.x, vf.y, vf.w, vf.h);
    ctx.clip();
    if (lit) {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(vf.x, vf.y, vf.w, vf.h);
      drawScenery(ctx, PAL.blue);
      for (const c of byDistance(s.creatures)) {
        const r = C.creatureRect(c, cfg);
        drawSilhouette(ctx, r, PAL.black, 0, 0, 1);
        drawEyes(ctx, r, PAL.red, 0, 0, 1);
      }
    } else {
      ctx.fillStyle = PAL.black;
      ctx.fillRect(vf.x, vf.y, vf.w, vf.h);
    }
    ctx.restore();

    ctx.strokeStyle = PAL.white;
    ctx.lineWidth = 1;
    if (!lit) ctx.setLineDash([4, 4]);
    ctx.strokeRect(vf.x + 0.5, vf.y + 0.5, vf.w - 1, vf.h - 1);
    ctx.setLineDash([]);
    ctx.fillStyle = lit ? PAL.blue : PAL.white;
    ctx.fillRect(vf.x + vf.w / 2 - 3, vf.y + vf.h / 2, 7, 1);
    ctx.fillRect(vf.x + vf.w / 2, vf.y + vf.h / 2 - 3, 1, 7);

    if (s.flashTimer > 0) {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(0, 0, S, S);
    }
    drawHud(ctx, s);
    if (cfg.debug) drawDebug(ctx, s);
  }

  function blink(s) {
    return Math.floor(s.phaseTime * 2) % 2 === 0;
  }

  function drawAttract(ctx, s) {
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 0, S, S);
    drawScenery(ctx, PAL.blue);
    text(ctx, 'EVIDENCE 1976', S / 2, 50, PAL.white, 22, 'center');
    if (Math.floor(s.phaseTime * 0.8) % 3 !== 0) {
      drawEyes(ctx, C.creatureRect({ x: 160, dist: 0.6 }, s.cfg), PAL.red, 0, 0, 1);
    }
    text(ctx, 'IT ONLY MOVES', S / 2, 205, PAL.white, 12, 'center');
    text(ctx, 'WHEN YOU LOOK AWAY.', S / 2, 222, PAL.white, 12, 'center');
    if (blink(s)) text(ctx, 'PRESS FIRE', S / 2, 262, PAL.red, 12, 'center');
    text(ctx, 'ARROWS: AIM   SPACE: SHUTTER', S / 2, 298, PAL.blue, 8, 'center');
  }

  function drawDevelop(ctx, s) {
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 0, S, S);
    text(ctx, 'NIGHT ' + s.night + ' — EVIDENCE FOUND', S / 2, 24, PAL.white, 11, 'center');
    const p = C.bestPhoto(s);
    const k = 1.6;
    drawPhoto(ctx, p, (S - p.vf.w * k) / 2, 52, k);
    text(ctx, 'SCORE ' + s.score, S / 2, 260, PAL.white, 10, 'center');
    if (s.phaseTime > 0.5 && blink(s)) text(ctx, 'PRESS FIRE FOR NIGHT ' + (s.night + 1), S / 2, 284, PAL.red, 10, 'center');
  }

  const END_TEXT = { caught: 'IT FOUND YOU.', dawn: 'THE SUN CAME UP.', nofilm: 'OUT OF FILM.' };

  function drawGameOver(ctx, s) {
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 0, S, S);
    if (s.endReason === 'caught' && s.phaseTime < 1.2) {
      ctx.fillStyle = PAL.red;
      ctx.fillRect(60, 120, 70, 34);
      ctx.fillRect(190, 120, 70, 34);
      return;
    }
    text(ctx, 'GAME OVER', S / 2, 24, PAL.red, 20, 'center');
    text(ctx, END_TEXT[s.endReason] || '', S / 2, 52, PAL.white, 11, 'center');
    const p = C.bestPhoto(s);
    if (p) {
      const k = 1.3;
      drawPhoto(ctx, p, (S - p.vf.w * k) / 2, 80, k);
    }
    text(ctx, 'NIGHT ' + s.night + '   SCORE ' + s.score, S / 2, 262, PAL.white, 10, 'center');
    if (s.phaseTime > 1.5 && blink(s)) text(ctx, 'PRESS FIRE', S / 2, 284, PAL.red, 10, 'center');
  }

  function draw(ctx, s) {
    if (s.phase === 'attract') drawAttract(ctx, s);
    else if (s.phase === 'play') drawPlay(ctx, s);
    else if (s.phase === 'develop') drawDevelop(ctx, s);
    else drawGameOver(ctx, s);
  }

  const API = { PAL, draw };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.EvidenceRender = API;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: 執行全部測試，確認通過**

Run: `node --test prototype/tests/`
Expected: `# pass 16`、`# fail 0`

- [ ] **Step 5: Commit**

```powershell
git add prototype/evidence-render.js prototype/tests/render.test.js
git commit -m "feat(prototype): 4-color canvas renderer for all phases"
```

---

### Task 4: 音效、HTML 入口與試玩驗收

**Files:**
- Create: `prototype/evidence-audio.js`
- Create: `prototype/evidence.html`

**Interfaces:**
- Consumes: `EvidenceCore.makeConfig/createGame/step`、`EvidenceRender.draw`、`step()` 回傳的事件名稱
- Produces（`EvidenceAudio`）：`init() → void`（必須在使用者手勢中呼叫）、`play(event: string, cfg) → void`

- [ ] **Step 1: 建立音效模組**

建立 `prototype/evidence-audio.js`：

```js
/* EVIDENCE 1976 — 5 synthesized sounds: heartbeat, twig snap, flash charge, shutter, scream. */
(function (root) {
  'use strict';

  let ac = null;
  let master = null;

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.4;
    master.connect(ac.destination);
  }

  function tone(type, f0, f1, dur, vol, delay) {
    const t = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, highpass, delay) {
    const t = ac.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  // 1. 心跳
  function heartbeat() {
    tone('sine', 70, 45, 0.12, 0.8);
    tone('sine', 70, 45, 0.1, 0.5, 0.18);
  }
  // 2. 樹枝斷裂
  function snap() {
    noise(0.06, 0.5, 2000);
  }
  // 3. 閃光充電（也用在過關的上升音）
  function charge(seconds) {
    tone('sawtooth', 300, 1500, seconds, 0.05, 0.1);
  }
  // 4. 快門
  function shutter() {
    tone('square', 1200, 300, 0.05, 0.3);
    noise(0.08, 0.4, 800);
  }
  // 5. 尖叫（也用在天亮／底片用完的失敗音，音量較小）
  function scream(seconds, vol) {
    tone('sawtooth', 900, 80, seconds, vol);
    noise(seconds * 0.8, vol * 0.6, 500);
  }

  function play(event, cfg) {
    if (!ac) return;
    switch (event) {
      case 'heartbeat': heartbeat(); break;
      case 'snap': snap(); break;
      case 'shot': shutter(); charge(cfg.charge); break;
      case 'win': charge(0.4); break;
      case 'caught': scream(1.2, 0.5); break;
      case 'lose': scream(0.6, 0.25); break;
      default: break;
    }
  }

  root.EvidenceAudio = { init, play };
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 2: 建立 HTML 入口**

建立 `prototype/evidence.html`：

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EVIDENCE 1976 — Prototype</title>
  <style>
    body { margin: 0; background: #000; color: #f2f2f2; font-family: "Courier New", monospace;
           display: flex; flex-direction: column; align-items: center; justify-content: center;
           min-height: 100vh; gap: 10px; user-select: none; }
    canvas { width: min(640px, 94vw, 82vh); aspect-ratio: 1; image-rendering: pixelated;
             border: 4px solid #24307a; display: block; }
    .help { font-size: 11px; color: #9aa; text-align: center; max-width: 94vw; }
  </style>
</head>
<body>
  <canvas id="c" width="640" height="640"></canvas>
  <div class="help">
    方向鍵 / WASD：移動觀景窗　SPACE / J / 點擊：快門<br>
    URL 參數可調整數值，例如 <code>?approach=0.08&amp;vfSpeed=150&amp;debug=1</code>
  </div>

  <script src="evidence-core.js"></script>
  <script src="evidence-render.js"></script>
  <script src="evidence-audio.js"></script>
  <script>
    (() => {
      const C = EvidenceCore;
      const params = Object.fromEntries(new URLSearchParams(location.search));
      if (params.debug === '') params.debug = 1;
      const cfg = C.makeConfig(params);
      const state = C.createGame(cfg, Date.now() >>> 0);

      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(2, 0, 0, 2, 0, 0);

      const FIRE = ['Space', 'KeyJ'];
      const LEFT = ['ArrowLeft', 'KeyA'];
      const RIGHT = ['ArrowRight', 'KeyD'];
      const UP = ['ArrowUp', 'KeyW'];
      const DOWN = ['ArrowDown', 'KeyS'];
      const MOVE = [...LEFT, ...RIGHT, ...UP, ...DOWN];
      const held = new Set();
      let firePending = false;

      addEventListener('keydown', (e) => {
        EvidenceAudio.init();
        if (FIRE.includes(e.code)) {
          if (!e.repeat) firePending = true;
          e.preventDefault();
        } else if (MOVE.includes(e.code)) {
          held.add(e.code);
          e.preventDefault();
        }
      });
      addEventListener('keyup', (e) => held.delete(e.code));
      addEventListener('blur', () => held.clear());
      canvas.addEventListener('pointerdown', () => {
        EvidenceAudio.init();
        firePending = true;
      });

      const axis = (neg, pos) =>
        (pos.some((k) => held.has(k)) ? 1 : 0) - (neg.some((k) => held.has(k)) ? 1 : 0);

      let last = performance.now();
      function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const input = { dx: axis(LEFT, RIGHT), dy: axis(UP, DOWN), fire: firePending };
        firePending = false;
        for (const ev of C.step(state, input, dt)) EvidenceAudio.play(ev, cfg);
        EvidenceRender.draw(ctx, state);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })();
  </script>
</body>
</html>
```

- [ ] **Step 3: 跑一次全部測試，確認沒有被影響**

Run: `node --test prototype/tests/`
Expected: `# pass 16`、`# fail 0`

- [ ] **Step 4: 在瀏覽器試玩驗收**

Run: `Start-Process "prototype/evidence.html"`

逐項確認（任何一項不符合都算失敗，需要回頭修）：
1. 待機畫面顯示標題、閃爍的紅眼，以及 "IT ONLY MOVES / WHEN YOU LOOK AWAY."
2. 按 Space 進入第 1 晚，觀景窗一開始就框住「它」（白底黑剪影加紅眼）。
3. 只要眼睛還在框內，它就完全不動（加上 `?debug=1` 時顯示 `FROZEN`）。
4. 把框移開後，框外看不到它，只有每隔約 1.5 秒閃一下紅眼；心跳逐漸加快，偶爾有樹枝斷裂聲。
5. 按快門：全畫面白閃、快門聲加充電聲；右下角出現照片縮圖和評級約 1.5 秒；框線變成虛線約 1 秒（致盲期間無法凍結它）；它被逼退到遠方。
6. 讓它靠近到接近框高時再拍，可以得到 `EVIDENCE`，並進入洗照片畫面；再按 Space 進入第 2 晚。
7. 放任它靠近 → 紅色巨眼加尖叫 → GAME OVER 畫面顯示 "IT FOUND YOU."。
8. 3 張底片都沒拍到證據 → "OUT OF FILM."；60 秒到 → "THE SUN CAME UP."。
9. 第 3 晚出現兩隻。
10. 畫面上只出現黑、深藍、白、紅四種顏色。

- [ ] **Step 5: Commit**

```powershell
git add prototype/evidence-audio.js prototype/evidence.html
git commit -m "feat(prototype): synth audio, html entry and input loop"
```

---

## 試玩後要記錄的事（對應 spec 第 11 節的 NEXT TEST）

讓 3–5 位沒看過規則的人試玩，每人兩局，記錄：

| 問題 | 觀察方式 | 可調的參數 |
|---|---|---|
| 30 秒內有沒有看懂「框住就停」？ | 計時到他第一次主動把框移開 | — |
| 速度平衡是否「緊張但公平」？ | 死因是被抓、天亮，還是底片用完的比例 | `approach`、`vfSpeed`、`lateral` |
| 框外能不能追蹤？ | 他是否抱怨「不知道它跑去哪」 | `glint`、`glintOn` |
| 評級看不看得懂？ | 拍完問他「為什麼不是證據？」能否答對 | `vfW`、`vfH`、`evidenceFill` |
| 會不會想再玩一局？ | 結束後是否自己按下 PRESS FIRE | — |
