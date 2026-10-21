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
