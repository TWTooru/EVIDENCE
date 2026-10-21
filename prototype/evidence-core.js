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
    const area = rect.w * rect.h;
    const completeness = area > 0 ? overlapArea(vf, rect) / area : 0;
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
    input = input || {};
    const cfg = s.cfg;
    const st = s.settings;

    let dx = input.dx || 0;
    let dy = input.dy || 0;
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    s.vf.x = clamp(s.vf.x + dx * cfg.vfSpeed * dt, 0, SCREEN - s.vf.w);
    s.vf.y = clamp(s.vf.y + dy * cfg.vfSpeed * dt, 0, SCREEN - s.vf.h);

    s.timeLeft = Math.max(0, s.timeLeft - dt);
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
    input = input || {};
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

  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.EvidenceCore = API;
})(typeof self !== 'undefined' ? self : this);
