/* EVIDENCE 1989: BLACK RAIN — 16-bit 4-Layer Parallax Canvas Renderer (320x240 logical). */
(function (root) {
  'use strict';

  const C = root.Evidence16BitCore || (typeof require === 'function' ? require('./evidence-16bit-core.js') : null);
  const W = C.SCREEN_W; // 320
  const H = C.SCREEN_H; // 240

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // 16-bit SNES/Genesis inspired dark atmospheric palette
  const PAL = {
    voidBlack: '#07080d',
    nightSky: '#0f1426',
    stormCloud: '#1b2440',
    lightningSky: '#8fa8d6',
    farPine: '#111c24',
    midPine: '#182b33',
    nearPine: '#0c161c',
    mudGround: '#12131a',
    headlightBeam: '#d6cf94',
    creatureShadow: '#050608',
    creatureRim: '#2e3d4f',
    eyeRed: '#ff2233',
    eyeGlow: '#ff7788',
    glassTint: '#1a2c3d',
    rainStreak: '#527394',
    cockpitDark: '#121014',
    cockpitTrim: '#26222b',
    cockpitLeather: '#362b28',
    dashPanel: '#1c1920',
    amberGlow: '#ffb000',
    amberDim: '#704d00',
    radioGreen: '#38d973',
    dangerRed: '#e62e2e',
    polaroidWhite: '#e8e6df',
  };

  const FOREST_TREES = [
    { wx: 35, h: 125, w: 38, layer: 1 },
    { wx: 85, h: 148, w: 46, layer: 2 },
    { wx: 138, h: 118, w: 34, layer: 1 },
    { wx: 185, h: 140, w: 42, layer: 2 },
    { wx: 245, h: 122, w: 36, layer: 1 },
    { wx: 295, h: 135, w: 40, layer: 1 },
    { wx: 355, h: 130, w: 38, layer: 1 },
    { wx: 410, h: 145, w: 44, layer: 2 },
    { wx: 468, h: 128, w: 38, layer: 1 },
    { wx: 520, h: 152, w: 46, layer: 2 },
    { wx: 575, h: 132, w: 40, layer: 1 },
    { wx: 620, h: 142, w: 42, layer: 2 },
  ];

  function text(ctx, str, x, y, color, size, align) {
    ctx.fillStyle = color || PAL.polaroidWhite;
    ctx.font = 'bold ' + (size || 8) + 'px "Courier New", monospace';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(str, Math.round(x), Math.round(y));
  }

  function drawPine16Bit(ctx, screenX, baseY, w, h, bodyColor, rimColor) {
    if (screenX + w < -20 || screenX - w > W + 20) return;
    const trunkW = Math.max(4, Math.round(w * 0.18));
    ctx.fillStyle = PAL.voidBlack;
    ctx.fillRect(Math.round(screenX - trunkW / 2), Math.round(baseY - h * 0.35), trunkW, Math.round(h * 0.35));

    const tiers = 5;
    const canopyH = h * 0.82;
    for (let i = 0; i < tiers; i++) {
      const ratio = (i + 1) / tiers;
      const tierW = Math.round(w * (0.3 + 0.7 * ratio));
      const tierH = Math.round(canopyH / tiers + 4);
      const ty = Math.round(baseY - h + i * (canopyH / tiers));
      ctx.fillStyle = bodyColor;
      ctx.fillRect(Math.round(screenX - tierW / 2), ty, tierW, tierH);
      if (rimColor) {
        ctx.fillStyle = rimColor;
        ctx.fillRect(Math.round(screenX - tierW / 2), ty, Math.max(2, Math.round(tierW * 0.15)), 2);
      }
    }
  }

  function drawCreature16Bit(ctx, c, state) {
    const { cockpit } = state;
    if (c.dir === 'ROOF' && !cockpit.lookUp) return;

    const r = C.creatureScreenRect(c, cockpit.panX, cockpit.lookUp);
    if (r.x + r.w < 0 || r.x > W) return;

    const gazed = C.isCreatureGazed(c, state);
    const litByHeadlights = cockpit.headlightsOn && c.dir === 'FRONT' && !cockpit.blackout;
    const litByLightning = cockpit.lightningFlash > 0.05;

    // In 16-bit horror, creature is a hulking multi-jointed cryptid silhouette, not a stick figure
    const cx = Math.round(r.x + r.w / 2);
    const headR = Math.max(4, Math.round(r.w * 0.32));
    const shoulderW = Math.round(r.w * 1.15);
    const torsoW = Math.round(r.w * 0.72);

    ctx.fillStyle = PAL.creatureShadow;
    // Hunched shoulders & elongated torso
    ctx.fillRect(Math.round(cx - shoulderW / 2), Math.round(r.y + headR * 1.3), shoulderW, Math.round(r.h * 0.32));
    ctx.fillRect(Math.round(cx - torsoW / 2), Math.round(r.y + headR * 1.8), torsoW, Math.round(r.h * 0.45));
    // Head
    ctx.fillRect(Math.round(cx - headR), r.y, headR * 2, Math.round(headR * 1.7));
    // Long clawed arms hanging down
    const armW = Math.max(2, Math.round(r.w * 0.18));
    ctx.fillRect(Math.round(cx - shoulderW / 2 - armW + 1), Math.round(r.y + headR * 1.5), armW, Math.round(r.h * 0.62));
    ctx.fillRect(Math.round(cx + shoulderW / 2 - 1), Math.round(r.y + headR * 1.5), armW, Math.round(r.h * 0.62));

    // Rim highlight when illuminated by headlights or lightning
    if (litByHeadlights || litByLightning || gazed) {
      ctx.fillStyle = PAL.creatureRim;
      ctx.fillRect(Math.round(cx - shoulderW / 2), Math.round(r.y + headR * 1.3), shoulderW, 2);
      ctx.fillRect(Math.round(cx - headR), r.y, headR * 2, 2);
    }

    // Piercing crimson eyes
    const eyeSep = Math.max(3, Math.round(headR * 0.55));
    const eyeSize = c.dist < 0.38 ? 3 : 2;
    ctx.fillStyle = PAL.eyeRed;
    ctx.fillRect(Math.round(cx - eyeSep - 1), r.eyeY, eyeSize, eyeSize);
    ctx.fillRect(Math.round(cx + eyeSep - 1), r.eyeY, eyeSize, eyeSize);

    if (c.dist < 0.45 || gazed) {
      ctx.fillStyle = PAL.eyeGlow;
      ctx.fillRect(Math.round(cx - eyeSep), r.eyeY, 1, 1);
      ctx.fillRect(Math.round(cx + eyeSep), r.eyeY, 1, 1);
    }
  }

  function drawExteriorLayers(ctx, state) {
    const { cockpit } = state;
    const panX = cockpit.panX;
    const lookUpOffset = cockpit.lookUp ? 34 : 0;
    const horizonY = 104 + lookUpOffset;

    // Layer 1: Sky & Lightning
    ctx.fillStyle = cockpit.lightningFlash > 0.1 ? PAL.lightningSky : PAL.nightSky;
    ctx.fillRect(0, 0, W, horizonY);

    // Storm cloud bands (Parallax 0.2)
    ctx.fillStyle = PAL.stormCloud;
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 110 - Math.round(panX * 0.2)) % (W + 120)) - 40;
      ctx.fillRect(cx, 14 + (i % 2) * 12 + lookUpOffset * 0.4, 86, 10);
    }

    // Ground / Mud road
    ctx.fillStyle = PAL.mudGround;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // Headlight cone in FRONT zone when active
    if (cockpit.headlightsOn && !cockpit.blackout) {
      const frontCenterScreenX = 320 - panX;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = PAL.headlightBeam;
      ctx.fillRect(Math.round(frontCenterScreenX - 95), horizonY - 25, 190, 110);
      ctx.restore();
    }

    // Layer 2: Distant treeline (Parallax 0.45)
    for (const t of FOREST_TREES) {
      if (t.layer === 1) {
        const sx = t.wx - panX * 0.55;
        drawPine16Bit(ctx, sx, horizonY + 12, Math.round(t.w * 0.75), Math.round(t.h * 0.75), PAL.farPine, null);
      }
    }

    // Creatures behind midground trees or stepping out
    for (const c of state.creatures) {
      if (c.dir !== 'ROOF') drawCreature16Bit(ctx, c, state);
    }

    // Midground trees (Parallax 0.85)
    for (const t of FOREST_TREES) {
      if (t.layer === 2) {
        const sx = t.wx - panX * 0.85;
        const rim = cockpit.lightningFlash > 0.1 ? PAL.lightningSky : PAL.creatureRim;
        drawPine16Bit(ctx, sx, horizonY + 34, t.w, t.h, PAL.midPine, rim);
      }
    }
  }

  function drawWindowGlassLayer(ctx, state) {
    const { cockpit } = state;
    const panX = cockpit.panX;
    const time = state.night.timeElapsed || 0;

    // Front Windshield rain blur overlay (World X 165..475)
    const frontLeft = Math.round(165 - panX);
    const frontRight = Math.round(475 - panX);
    const clampedLeft = clamp(frontLeft, 0, W);
    const clampedRight = clamp(frontRight, 0, W);

    if (clampedRight > clampedLeft && cockpit.rainBlur > 0.2) {
      // Crisp 16-bit raindrop & condensation stipple lines instead of muddy full-window smear
      const density = Math.floor((cockpit.rainBlur - 0.15) * 28);
      ctx.fillStyle = PAL.glassTint;
      for (let r = 0; r < density; r++) {
        const bandY = 26 + ((r * 19) % 132);
        const bandX = clampedLeft + ((r * 43) % Math.max(1, clampedRight - clampedLeft - 18));
        ctx.fillRect(bandX, bandY, 16, 2);
      }
      if (cockpit.rainBlur > state.cfg.blurThreshold) {
        ctx.fillStyle = 'rgba(26, 44, 61, 0.38)';
        ctx.fillRect(clampedLeft, 22, clampedRight - clampedLeft, 140);
        const warnX = Math.round((clampedLeft + clampedRight) / 2);
        text(ctx, 'WINDSHIELD BLURRED - PRESS [1] WIPERS!', warnX, 34, PAL.dangerRed, 8, 'center');
      }
    }

    // Rain streaks across all visible glass
    ctx.fillStyle = PAL.rainStreak;
    for (let i = 0; i < 38; i++) {
      const rx = ((i * 37 + Math.round(time * 90) - Math.round(panX * 0.9)) % W + W) % W;
      const ry = ((i * 53 + Math.round(time * 210)) % 165);
      ctx.fillRect(rx, ry, 1, 7);
    }

    // Wiper blades in front windshield
    if (clampedRight > clampedLeft) {
      const angle = Math.sin(cockpit.wiperPhase * Math.PI * 2) * 0.65;
      const pivot1X = Math.round(255 - panX);
      const pivot2X = Math.round(375 - panX);
      const pivotY = 166 + (cockpit.lookUp ? 30 : 0);
      const tipOffsetX = Math.round(Math.sin(angle) * 55);
      const tipOffsetY = Math.round(Math.cos(angle) * 68);

      ctx.strokeStyle = PAL.voidBlack;
      ctx.lineWidth = 3;
      for (const px of [pivot1X, pivot2X]) {
        ctx.beginPath();
        ctx.moveTo(px, pivotY);
        ctx.lineTo(px + tipOffsetX, pivotY - tipOffsetY);
        ctx.stroke();
      }
    }
  }

  function drawCockpitInterior(ctx, state) {
    const { cockpit, camera, night } = state;
    const panX = cockpit.panX;
    const lookUpOffset = cockpit.lookUp ? 34 : 0;

    // Roof liner & Skylight hatch (when looking up)
    const roofH = 22 + lookUpOffset;
    ctx.fillStyle = PAL.cockpitDark;
    ctx.fillRect(0, 0, W, roofH);
    ctx.fillStyle = PAL.cockpitTrim;
    ctx.fillRect(0, roofH - 3, W, 3);

    if (cockpit.lookUp) {
      const hatchX = Math.round(240 - panX);
      ctx.fillStyle = PAL.nightSky;
      ctx.fillRect(hatchX, 4, 160, roofH - 8);
      ctx.strokeStyle = PAL.cockpitLeather;
      ctx.strokeRect(hatchX, 4, 160, roofH - 8);
      // Draw roof creature if present
      for (const c of state.creatures) {
        if (c.dir === 'ROOF') drawCreature16Bit(ctx, c, state);
      }
      text(ctx, 'ROOF SKYLIGHT', hatchX + 42, roofH - 13, PAL.amberDim, 8);
    }

    // Left & Right A-Pillars separating side windows from front windshield (World X = 165 and 475)
    const leftPillarX = Math.round(160 - panX);
    const rightPillarX = Math.round(468 - panX);
    ctx.fillStyle = PAL.cockpitDark;
    ctx.fillRect(leftPillarX - 10, 0, 18, H);
    ctx.fillRect(rightPillarX - 8, 0, 18, H);
    ctx.fillStyle = PAL.cockpitTrim;
    ctx.fillRect(leftPillarX + 5, 0, 3, H);
    ctx.fillRect(rightPillarX - 8, 0, 3, H);

    // Far left & far right door frames
    ctx.fillStyle = PAL.cockpitDark;
    ctx.fillRect(0, 0, Math.max(0, 14 - panX), H);
    const rightEdge = Math.round(626 - panX);
    if (rightEdge < W) ctx.fillRect(rightEdge, 0, W - rightEdge, H);

    // Rearview Mirror (Top center at World X = 320)
    const mirrorX = Math.round(282 - panX);
    const mirrorY = roofH + 4;
    if (mirrorX + 76 > 0 && mirrorX < W) {
      ctx.fillStyle = PAL.cockpitTrim;
      ctx.fillRect(mirrorX + 34, roofH - 2, 8, 8);
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(mirrorX, mirrorY, 76, 22);
      ctx.strokeStyle = PAL.cockpitLeather;
      ctx.strokeRect(mirrorX, mirrorY, 76, 22);

      // Rearview mirror hints at closest creature's red eyes if stalking
      const roofOrClose = state.creatures.find((c) => c.dist < 0.55);
      if (roofOrClose && !cockpit.blackout) {
        ctx.fillStyle = PAL.eyeRed;
        ctx.fillRect(mirrorX + 34, mirrorY + 10, 2, 2);
        ctx.fillRect(mirrorX + 40, mirrorY + 10, 2, 2);
      }
    }

    // Lower Dashboard & Door Panels
    const dashY = 164 + Math.round(lookUpOffset * 0.5);
    ctx.fillStyle = PAL.cockpitLeather;
    ctx.fillRect(0, dashY - 4, W, 6);
    ctx.fillStyle = PAL.dashPanel;
    ctx.fillRect(0, dashY, W, H - dashY);

    // Left Window Label (World X = 75)
    text(ctx, '< LEFT WINDOW', 40 - panX, dashY + 8, PAL.amberDim, 8);

    // Right Window & Passenger Film Box (World X = 540)
    const passX = Math.round(500 - panX);
    if (passX + 110 > 0 && passX < W) {
      text(ctx, 'RIGHT WINDOW >', passX + 12, dashY + 8, PAL.amberDim, 8);
      ctx.fillStyle = PAL.cockpitLeather;
      ctx.fillRect(passX + 10, dashY + 22, 86, 36);
      ctx.strokeStyle = PAL.amberDim;
      ctx.strokeRect(passX + 10, dashY + 22, 86, 36);
      text(ctx, 'KODAK 1600 ASA', passX + 16, dashY + 27, PAL.amberGlow, 7);
      text(ctx, 'FILM LEFT: ' + camera.filmLeft, passX + 16, dashY + 40, PAL.polaroidWhite, 8);
    }

    // Center Dashboard Instruments (World X = 190..450)
    const dashCenterX = Math.round(320 - panX);
    const glowColor = cockpit.blackout ? PAL.amberDim : PAL.amberGlow;

    // Steering Wheel (World X = 248)
    const wheelX = Math.round(248 - panX);
    if (wheelX + 50 > 0 && wheelX - 50 < W) {
      ctx.strokeStyle = PAL.cockpitDark;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(wheelX, dashY + 28, 34, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Instrument Cluster: Battery, Wipers, Headlights, AM Radio
    const instX = dashCenterX - 90;
    ctx.fillStyle = PAL.voidBlack;
    ctx.fillRect(instX, dashY + 8, 195, 58);
    ctx.strokeStyle = PAL.cockpitTrim;
    ctx.strokeRect(instX, dashY + 8, 195, 58);

    // 1. Battery Gauge
    const battPct = Math.round(cockpit.battery);
    const battColor = battPct <= 25 ? PAL.dangerRed : glowColor;
    text(ctx, 'BATT:' + battPct + '%', instX + 6, dashY + 13, battColor, 8);
    ctx.fillStyle = PAL.amberDim;
    ctx.fillRect(instX + 6, dashY + 24, 52, 6);
    ctx.fillStyle = battColor;
    ctx.fillRect(instX + 6, dashY + 24, Math.round(52 * (battPct / 100)), 6);

    // 2. Wipers & Headlights indicators
    const wipText = '[1]WIPER:' + (cockpit.wipersOn ? 'ON' : 'OFF');
    const hlText = '[2]LIGHT:' + (cockpit.headlightsOn ? 'ON' : 'OFF');
    text(ctx, wipText, instX + 6, dashY + 36, cockpit.wipersOn ? PAL.radioGreen : PAL.amberDim, 7);
    text(ctx, hlText, instX + 6, dashY + 48, cockpit.headlightsOn ? PAL.radioGreen : PAL.amberDim, 7);

    // 3. Supernatural AM Radio Radar
    const radioX = instX + 82;
    text(ctx, 'AM 1610kHz RADAR', radioX, dashY + 13, glowColor, 7);
    ctx.fillStyle = '#09140d';
    ctx.fillRect(radioX, dashY + 24, 104, 24);
    ctx.strokeStyle = PAL.amberDim;
    ctx.strokeRect(radioX, dashY + 24, 104, 24);

    if (!cockpit.blackout) {
      const panMarkerX = radioX + 52 + Math.round(cockpit.radioPan * 38);
      ctx.fillStyle = cockpit.radioIntensity > 0.55 ? PAL.dangerRed : PAL.radioGreen;
      const barH = Math.max(2, Math.round(cockpit.radioIntensity * 18));
      for (let b = -3; b <= 3; b++) {
        const h = Math.max(2, barH - Math.abs(b) * 3);
        ctx.fillRect(panMarkerX + b * 4, dashY + 36 - Math.round(h / 2), 2, h);
      }
      const dirHint = cockpit.radioPan < -0.3 ? '<< L' : cockpit.radioPan > 0.3 ? 'R >>' : 'CTR';
      text(ctx, dirHint, radioX + 4, dashY + 51, PAL.amberGlow, 7);
    } else {
      text(ctx, 'NO POWER', radioX + 26, dashY + 32, PAL.dangerRed, 8);
    }

    // 4. Clock & Film Top HUD Strip
    const progress = clamp(night.timeElapsed / Math.max(1, night.duration), 0, 1);
    const hour = Math.floor(progress * 5);
    const min = Math.floor((progress * 300) % 60);
    const clockStr = '0' + hour + ':' + (min < 10 ? '0' + min : min) + ' AM';
    ctx.fillStyle = 'rgba(7, 8, 13, 0.78)';
    ctx.fillRect(4, 4, 312, 14);
    text(ctx, 'NIGHT ' + night.number, 8, 7, PAL.amberGlow, 8);
    text(ctx, clockStr, 76, 7, PAL.polaroidWhite, 8);
    text(ctx, 'FILM:' + camera.filmLeft, 146, 7, camera.filmLeft > 0 ? PAL.amberGlow : PAL.dangerRed, 8);
    text(ctx, 'EVIDENCE:' + night.evidenceCount + '/1', 216, 7, night.evidenceCount > 0 ? PAL.radioGreen : PAL.amberGlow, 8);
  }

  function drawViewfinderAndPhoto(ctx, state) {
    const { cockpit, camera } = state;

    // Viewfinder Overlay when aiming
    if (cockpit.vfActive) {
      const vf = C.getViewfinderRect(state);
      const ready = camera.chargeTimer <= 0 && camera.filmLeft > 0;
      const vfColor = ready ? PAL.amberGlow : PAL.dangerRed;

      ctx.strokeStyle = vfColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(vf.x, vf.y, vf.w, vf.h);

      // Corner brackets & center crosshair
      const cx = Math.round(vf.x + vf.w / 2);
      const cy = Math.round(vf.y + vf.h / 2);
      ctx.fillStyle = vfColor;
      ctx.fillRect(cx - 6, cy, 13, 1);
      ctx.fillRect(cx, cy - 6, 1, 13);

      const statusText = camera.chargeTimer > 0
        ? 'CHARGING FLASH...'
        : 'READY [SPACE TO SHOOT]';
      text(ctx, statusText, cx, vf.y + vf.h + 4, vfColor, 8, 'center');
    }

    // Glass Flash Reflection Glare (1s blindness)
    if (camera.blindTimer > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(camera.blindTimer / state.cfg.blindTime, 0, 0.92);
      ctx.fillStyle = PAL.polaroidWhite;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Polaroid Instant Photo Development Popup
    if (camera.lastPhoto && camera.photoPopupTimer > 0) {
      const p = camera.lastPhoto;
      const px = W - 92;
      const py = 24;
      ctx.fillStyle = PAL.polaroidWhite;
      ctx.fillRect(px, py, 84, 68);
      ctx.fillStyle = PAL.nightSky;
      ctx.fillRect(px + 5, py + 5, 74, 44);

      if (p.dir !== 'NONE') {
        ctx.fillStyle = PAL.creatureShadow;
        const silH = Math.round(14 + p.fill * 28);
        ctx.fillRect(px + 34, py + 49 - silH, 16, silH);
        ctx.fillStyle = PAL.eyeRed;
        ctx.fillRect(px + 38, py + 53 - silH, 2, 2);
        ctx.fillRect(px + 44, py + 53 - silH, 2, 2);
      }

      const gColor = p.grade === 'EVIDENCE' ? '#0b7a3e' : p.grade === 'SUSPICIOUS' ? '#9c6200' : PAL.dangerRed;
      text(ctx, p.grade, px + 42, py + 52, gColor, 8, 'center');
      text(ctx, p.score + ' PTS', px + 42, py + 60, PAL.voidBlack, 7, 'center');
    }
  }

  function drawOverlayScreens(ctx, state) {
    if (state.phase === 'TITLE') {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = PAL.amberGlow;
      ctx.strokeRect(12, 12, W - 24, H - 24);

      text(ctx, '16-BIT SURVIVAL HORROR', W / 2, 34, PAL.amberDim, 8, 'center');
      text(ctx, 'EVIDENCE 1989', W / 2, 54, PAL.amberGlow, 18, 'center');
      text(ctx, 'BLACK RAIN', W / 2, 76, PAL.eyeRed, 12, 'center');

      text(ctx, 'YOUR STATION WAGON IS DEAD IN THE STORM.', W / 2, 108, PAL.polaroidWhite, 8, 'center');
      text(ctx, '"IT" ONLY APPROACHES WHEN NOT WATCHED.', W / 2, 122, PAL.polaroidWhite, 8, 'center');
      text(ctx, 'CAPTURE 1 CLOSE EVIDENCE PHOTO BEFORE 05:00 AM.', W / 2, 136, PAL.amberGlow, 8, 'center');

      text(ctx, '[A/D or L/R] TURN HEAD   [W] LOOK ROOF   [1] WIPERS   [2] LIGHTS', W / 2, 168, PAL.rainStreak, 7, 'center');
      text(ctx, '[HOLD SHIFT / J] RAISE CAMERA     [SPACE / K] FLASH SHUTTER', W / 2, 182, PAL.rainStreak, 7, 'center');
      text(ctx, 'PRESS [SPACE] OR CLICK TO ENTER THE CAR', W / 2, 206, PAL.radioGreen, 9, 'center');
      return true;
    }

    if (state.phase === 'NIGHT_INTRO') {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
      text(ctx, state.night.title || ('NIGHT ' + state.night.number), W / 2, 78, PAL.amberGlow, 14, 'center');
      text(ctx, state.night.subtitle || '', W / 2, 104, PAL.polaroidWhite, 8, 'center');
      text(ctx, '4 EXPOSURES. SURVIVE UNTIL 05:00 AM.', W / 2, 132, PAL.rainStreak, 8, 'center');
      text(ctx, 'PRESS [SPACE] TO BEGIN WATCH', W / 2, 174, PAL.radioGreen, 9, 'center');
      return true;
    }

    if (state.phase === 'NIGHT_SUMMARY') {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
      text(ctx, '05:00 AM — DAWN BREAKS', W / 2, 54, PAL.radioGreen, 12, 'center');
      text(ctx, 'EVIDENCE SECURED FOR NIGHT ' + state.night.number, W / 2, 82, PAL.amberGlow, 9, 'center');
      text(ctx, 'EVIDENCE PHOTOS: ' + state.night.evidenceCount, W / 2, 110, PAL.polaroidWhite, 8, 'center');
      text(ctx, 'BATTERY REMAINING: ' + Math.round(state.cockpit.battery) + '%', W / 2, 126, PAL.polaroidWhite, 8, 'center');
      text(ctx, 'PRESS [SPACE] FOR NEXT NIGHT', W / 2, 174, PAL.amberGlow, 9, 'center');
      return true;
    }

    if (state.phase === 'GAME_OVER') {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
      if (state.endReason === 'BREACH') {
        // Terrifying close-up cryptid jump scare
        ctx.fillStyle = PAL.eyeRed;
        ctx.fillRect(108, 72, 28, 18);
        ctx.fillRect(184, 72, 28, 18);
        text(ctx, 'WINDOW BREACHED (' + (state.breachDir || 'CAR') + ')', W / 2, 126, PAL.dangerRed, 12, 'center');
        text(ctx, 'THE GLASS SHATTERED IN THE DARK.', W / 2, 148, PAL.polaroidWhite, 8, 'center');
      } else {
        text(ctx, 'INVESTIGATION FAILED: ' + state.endReason, W / 2, 96, PAL.dangerRed, 11, 'center');
        text(ctx, 'WITHOUT CLEAR PROOF, NOBODY BELIEVED YOU.', W / 2, 124, PAL.polaroidWhite, 8, 'center');
      }
      text(ctx, 'PRESS [SPACE] TO TRY AGAIN', W / 2, 188, PAL.amberGlow, 9, 'center');
      return true;
    }

    if (state.phase === 'VICTORY') {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = PAL.radioGreen;
      ctx.strokeRect(14, 14, W - 28, H - 28);
      text(ctx, 'THE EYE WEEKLY — FRONT PAGE EXCLUSIVE!', W / 2, 46, PAL.amberGlow, 10, 'center');
      text(ctx, 'SURVIVED ALL 3 NIGHTS IN OREGON', W / 2, 74, PAL.radioGreen, 11, 'center');
      text(ctx, 'YOUR PHOTOGRAPHS PROVED ITS EXISTENCE.', W / 2, 106, PAL.polaroidWhite, 8, 'center');
      text(ctx, 'PRESS [SPACE] TO PLAY AGAIN', W / 2, 184, PAL.amberGlow, 9, 'center');
      return true;
    }

    return false;
  }

  function draw(ctx, state) {
    if (!ctx || !state) return;
    if (ctx.canvas && ctx.canvas.width && typeof ctx.setTransform === 'function') {
      const scaleX = ctx.canvas.width / W;
      const scaleY = (ctx.canvas.height || W) / H;
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    }
    if (drawOverlayScreens(ctx, state)) return;

    drawExteriorLayers(ctx, state);
    drawWindowGlassLayer(ctx, state);
    drawCockpitInterior(ctx, state);
    drawViewfinderAndPhoto(ctx, state);
  }

  const API = { PAL, draw };
  root.Evidence16BitRender = API;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
})(typeof window !== 'undefined' ? window : globalThis);
