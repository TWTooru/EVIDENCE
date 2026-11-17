/* EVIDENCE 1976 — canvas renderer. Strict 5-color palette, logical 320x320. */
(function (root) {
  'use strict';

  const C = root.EvidenceCore || (typeof require === 'function' ? require('./evidence-core.js') : null);
  const PAL = { black: '#000000', blue: '#24307a', white: '#f2f2f2', red: '#ff2a2a', yellow: '#ffb000' };
  const S = C.SCREEN;
  const TREES = [
    { x: 34, baseY: 236, h: 170, w: 46, dist: 0.40 },
    { x: 108, baseY: 184, h: 112, w: 32, dist: 0.72 },
    { x: 216, baseY: 194, h: 122, w: 34, dist: 0.66 },
    { x: 286, baseY: 246, h: 180, w: 48, dist: 0.34 },
  ];
  const TREELINE = [14, 22, 16, 28, 18, 12, 24, 15, 20, 26, 14, 19, 25, 16, 22, 13, 27, 18, 14, 21];
  const GRADE_TEXT = { EVIDENCE: 'EVIDENCE', SUSPICIOUS: 'SUSPICIOUS', BLURRY: 'BLURRY' };

  function text(ctx, str, x, y, color, size, align) {
    ctx.fillStyle = color;
    ctx.font = 'bold ' + (size || 10) + 'px "Courier New", monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(str, x, y);
  }

  function drawPine(ctx, t, color) {
    ctx.fillStyle = color;
    const topY = t.baseY - t.h;
    const trunkW = Math.max(4, Math.round(t.w * 0.16));
    const trunkTop = topY + Math.round(t.h * 0.22);
    ctx.fillRect(Math.round(t.x - trunkW / 2), trunkTop, trunkW, t.baseY - trunkTop);
    ctx.fillRect(Math.round(t.x - trunkW), t.baseY - 3, trunkW * 2, 3);

    const canopyH = Math.round(t.h * 0.76);
    const tiers = 5;
    const tierStep = canopyH / tiers;
    for (let i = 0; i < tiers; i++) {
      const ty = Math.round(topY + i * tierStep);
      const maxW = Math.round(t.w * (0.34 + 0.66 * ((i + 1) / tiers)));
      const slices = 3;
      const sh = Math.max(3, Math.ceil((tierStep * 1.18) / slices));
      for (let s = 0; s < slices; s++) {
        const sw = Math.round(maxW * (0.45 + 0.55 * ((s + 1) / slices)));
        ctx.fillRect(Math.round(t.x - sw / 2), ty + s * (sh - 1), sw, sh);
      }
    }
  }

  function drawHorizon(ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, C.HORIZON_Y, S, 2);
    const segW = S / TREELINE.length;
    for (let i = 0; i < TREELINE.length; i++) {
      const h = TREELINE[i];
      const cx = i * segW + segW / 2;
      ctx.fillRect(Math.round(cx - segW * 0.3), C.HORIZON_Y - h, Math.ceil(segW * 0.6), h);
      ctx.fillRect(Math.round(cx - segW * 0.55), C.HORIZON_Y - Math.round(h * 0.65), Math.ceil(segW * 1.1), Math.round(h * 0.65));
    }
  }

  function drawScenery(ctx, color) {
    drawHorizon(ctx, color);
    const sortedTrees = TREES.slice().sort((a, b) => b.dist - a.dist);
    for (const t of sortedTrees) drawPine(ctx, t, color);
  }

  // 依三階段姿態（WAIT 觀望 / COIL 前傾蓄力 / LUNGE 雙爪撲擊）繪製剪影
  function drawSilhouette(ctx, r, color, ox = 0, oy = 0, k = 1, jitterX = 0) {
    const X = (v) => ox + (v + jitterX) * k;
    const Y = (v) => oy + v * k;
    const pose = r.pose || 'WAIT';
    const headH = r.h * 0.22;
    const torsoH = r.h * 0.43;
    const legH = r.h - headH - torsoH;
    ctx.fillStyle = color;

    if (pose === 'LUNGE') {
      // 撲擊態：雙臂高舉張爪撲向鏡頭、長顱裂嘴
      ctx.fillRect(X(r.x + r.w * 0.22), Y(r.y), r.w * 0.56 * k, headH * 1.05 * k);
      ctx.fillRect(X(r.x + r.w * 0.12), Y(r.y + headH * 0.9), r.w * 0.76 * k, torsoH * k);
      // 高舉張開的雙臂與利爪
      ctx.fillRect(X(r.x - r.w * 0.24), Y(r.y + r.h * 0.04), r.w * 0.22 * k, r.h * 0.42 * k);
      ctx.fillRect(X(r.x + r.w * 1.02), Y(r.y + r.h * 0.02), r.w * 0.22 * k, r.h * 0.42 * k);
      ctx.fillRect(X(r.x - r.w * 0.30), Y(r.y - r.h * 0.04), r.w * 0.12 * k, r.h * 0.14 * k);
      ctx.fillRect(X(r.x + r.w * 1.18), Y(r.y - r.h * 0.04), r.w * 0.12 * k, r.h * 0.14 * k);
    } else if (pose === 'COIL') {
      // 蓄力態：壓低前傾、背部拱起、雙肘外張如螳螂蓄勢
      ctx.fillRect(X(r.x + r.w * 0.28), Y(r.y + r.h * 0.05), r.w * 0.52 * k, headH * k);
      ctx.fillRect(X(r.x + r.w * 0.08), Y(r.y + headH * 0.85), r.w * 0.84 * k, torsoH * k);
      // 外張雙臂
      ctx.fillRect(X(r.x - r.w * 0.18), Y(r.y + headH), r.w * 0.20 * k, r.h * 0.46 * k);
      ctx.fillRect(X(r.x + r.w * 0.98), Y(r.y + headH), r.w * 0.20 * k, r.h * 0.46 * k);
    } else {
      // 觀望態：高瘦歪頭、長臂垂膝
      ctx.fillRect(X(r.x + r.w * 0.28), Y(r.y), r.w * 0.52 * k, headH * k);
      ctx.fillRect(X(r.x + r.w * 0.15), Y(r.y + headH), r.w * 0.70 * k, torsoH * k);
      ctx.fillRect(X(r.x), Y(r.y + headH * 1.1), r.w * 0.14 * k, r.h * 0.52 * k);
      ctx.fillRect(X(r.x + r.w * 0.86), Y(r.y + headH * 1.1), r.w * 0.14 * k, r.h * 0.52 * k);
    }

    // 雙腿
    ctx.fillRect(X(r.x + r.w * 0.16), Y(r.y + headH + torsoH), r.w * 0.24 * k, legH * k);
    ctx.fillRect(X(r.x + r.w * 0.60), Y(r.y + headH + torsoH), r.w * 0.24 * k, legH * k);
  }

  function drawEyes(ctx, r, color, ox = 0, oy = 0, k = 1, jitterX = 0) {
    const cx = r.x + r.w / 2 + jitterX;
    const ey = r.y + r.h * 0.12;
    const size = Math.max(1.5, r.w * 0.12) * k;
    ctx.fillStyle = color;
    ctx.fillRect(ox + (cx - r.w * 0.16) * k - size / 2, oy + (ey + r.h * 0.01) * k - size / 2, size, size);
    ctx.fillRect(ox + (cx + r.w * 0.18) * k - size / 2, oy + (ey - r.h * 0.01) * k - size / 2, size * 1.15, size * 1.15);
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
      drawSilhouette(ctx, r, PAL.black, ox, oy, k, 0);
      drawEyes(ctx, r, PAL.red, ox, oy, k, 0);
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
      text(ctx, 'D' + i + ' ' + c.dist.toFixed(2) + ' ' + (c.pose || 'WAIT') + (c.frozen ? ' FROZEN' : ''), 6, 18 + i * 10, PAL.red, 8);
    });
  }

  // 移除微波爐讀秒百分比（TOO FAR XX%），改為三支柱心理狀態提示
  function bestAimHint(s) {
    const cfg = s.cfg;
    const vf = s.vf;
    let best = null;
    let bestCreature = null;
    for (const c of s.creatures) {
      const r = C.creatureRect(c, cfg);
      const g = C.gradePhoto(vf, r, cfg);
      if (g.completeness <= 0 && !c.frozen) continue;
      if (!best || g.score > best.score) {
        best = g;
        bestCreature = c;
      }
    }
    if (!best || !bestCreature) return null;
    if (best.grade === 'EVIDENCE') {
      return { label: 'SHOOT NOW!', color: PAL.red, ready: true };
    }
    if (best.fill >= cfg.evidenceFill && bestCreature.frozen) {
      return { label: 'PULL DOWN: FULL BODY', color: PAL.red, ready: false };
    }
    if (bestCreature.frozen && (bestCreature.tension || 0) >= 0.65) {
      return { label: 'IT IS TREMBLING...', color: PAL.red, ready: false };
    }
    if (bestCreature.frozen && bestCreature.pose === 'COIL') {
      return { label: 'COILED — CAREFUL', color: PAL.red, ready: false };
    }
    if (bestCreature.frozen) {
      return { label: 'FROZEN — LOOK AWAY', color: PAL.blue, ready: false };
    }
    return { label: 'LOCK ITS EYES!', color: PAL.red, ready: false };
  }

  function drawPlay(ctx, s) {
    const cfg = s.cfg;
    const vf = s.vf;
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 0, S, S);
    drawScenery(ctx, PAL.blue);
    for (const c of s.creatures) {
      if (c.glintVisible > 0) drawEyes(ctx, C.creatureRect(c, cfg), PAL.red, 0, 0, 1, 0);
    }

    const lit = s.blindTimer <= 0;
    const hint = lit ? bestAimHint(s) : null;
    ctx.save();
    ctx.beginPath();
    ctx.rect(vf.x, vf.y, vf.w, vf.h);
    ctx.clip();
    if (lit) {
      ctx.fillStyle = PAL.white;
      ctx.fillRect(vf.x, vf.y, vf.w, vf.h);
      drawHorizon(ctx, PAL.blue);
      const items = [];
      for (const t of TREES) items.push({ kind: 'tree', dist: t.dist, t });
      for (const c of s.creatures) items.push({ kind: 'creature', dist: c.dist, c });
      items.sort((a, b) => b.dist - a.dist);
      for (const it of items) {
        if (it.kind === 'tree') {
          drawPine(ctx, it.t, PAL.blue);
        } else {
          const r = C.creatureRect(it.c, cfg);
          const jitter = it.c.frozen && (it.c.tension || 0) > 0.2
            ? Math.round(Math.sin((s.phaseTime || 0) * 55) * it.c.tension * 3)
            : 0;
          drawSilhouette(ctx, r, PAL.black, 0, 0, 1, jitter);
          drawEyes(ctx, r, PAL.red, 0, 0, 1, jitter);
        }
      }
    } else {
      ctx.fillStyle = PAL.black;
      ctx.fillRect(vf.x, vf.y, vf.w, vf.h);
    }
    ctx.restore();

    ctx.strokeStyle = hint && hint.ready ? PAL.red : PAL.white;
    ctx.lineWidth = hint && hint.ready ? 2 : 1;
    if (!lit) ctx.setLineDash([4, 4]);
    ctx.strokeRect(vf.x + 0.5, vf.y + 0.5, vf.w - 1, vf.h - 1);
    ctx.setLineDash([]);

    // 繪製凝視壓制線刻度（gazeBox 頂邊）：紅眼低於此刻度線時才會被凍結
    const gBox = C.gazeBox ? C.gazeBox(vf, cfg) : { y: vf.y + vf.h * 0.26 };
    const gy = Math.round(gBox.y);
    const anyFrozen = s.creatures.some((c) => c.frozen);
    ctx.fillStyle = anyFrozen ? PAL.red : PAL.yellow;
    ctx.fillRect(vf.x + 2, gy, 6, 1);
    ctx.fillRect(vf.x + vf.w - 8, gy, 6, 1);

    ctx.fillStyle = PAL.yellow;
    ctx.fillRect(vf.x + vf.w / 2 - 3, vf.y + vf.h / 2, 7, 1);
    ctx.fillRect(vf.x + vf.w / 2, vf.y + vf.h / 2 - 3, 1, 7);

    if (hint) {
      const bannerY = vf.y + vf.h + 12 <= S - 18 ? vf.y + vf.h + 2 : vf.y - 11;
      ctx.fillStyle = PAL.black;
      ctx.fillRect(vf.x, bannerY, vf.w, 10);
      text(ctx, hint.label, vf.x + vf.w / 2, bannerY + 1, hint.color === PAL.blue ? PAL.white : PAL.red, 8, 'center');
    }

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
      drawEyes(ctx, C.creatureRect({ x: 160, dist: 0.6 }, s.cfg), PAL.red, 0, 0, 1, 0);
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
