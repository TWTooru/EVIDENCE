/* EVIDENCE 1989: BLACK RAIN — Pure 16-bit 4-Layer Parallax Renderer (Car as silent visual frame, zero UI clutter). */
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
    creatureShadow: '#050608',
    creatureRim: '#2e3d4f',
    corpsePale: '#cfd6de',
    corpseDim: '#7f8c9a',
    eyeRed: '#ff2233',
    eyeGlow: '#ff7788',
    breathFog: 'rgba(180, 205, 225, 0.16)',
    rainStreak: '#527394',
    cockpitDark: '#100e13',
    cockpitTrim: '#221f28',
    cockpitLeather: '#2e2523',
    dashPanel: '#16141a',
    amberGlow: '#ffb000',
    amberDim: '#694800',
    quartzGreen: '#38d973',
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
    const r = C.creatureScreenRect(c, cockpit.panX);
    if (r.x + r.w < 0 || r.x > W) return;

    const inCone = C.isCreatureInViewCone(c, state);
    const litByLightning = cockpit.lightningFlash > 0.05;

    // Peripheral Darkness: outside direct view cone (and unlit by lightning), hide body and only glint red eyes
    if (!inCone && !litByLightning) {
      if ((c.glintVisible || 0) > 0 || c.dist < 0.35) {
        const cx = Math.round(r.x + r.w / 2);
        const headR = Math.max(4, Math.round(r.w * 0.32));
        const eyeSep = Math.max(3, Math.round(headR * 0.55));
        ctx.fillStyle = PAL.eyeRed;
        ctx.fillRect(Math.round(cx - eyeSep - 1), r.eyeY, 2, 2);
        ctx.fillRect(Math.round(cx + eyeSep - 1), r.eyeY, 2, 2);
      }
      return;
    }

    // Dead-still statue body, with uncanny facial details slowly emerging the longer you lock eyes with it!
    const cx = Math.round(r.x + r.w / 2);
    const headR = Math.max(4, Math.round(r.w * 0.34));
    const shoulderW = Math.round(r.w * 1.18);
    const torsoW = Math.round(r.w * 0.68);
    const armW = Math.max(2, Math.round(r.w * 0.18));
    const pose = c.pose || 'WAIT';
    const strain = cockpit.eyeStrain || 0;
    const time = state.night ? state.night.timeElapsed : 0;

    // Subliminal 1-frame broken-neck snap right as your sanity/eyelids strain (> 0.58)
    const subliminalSnap = (!cockpit.vfActive && strain > 0.58 && Math.sin(time * 33) > 0.89)
      ? Math.max(3, Math.round(headR * 0.55)) * (c.id % 2 === 0 ? -1 : 1)
      : 0;
    const stareReveal = clamp(strain * 1.25 + (1 - c.dist) * 0.65, 0, 1);

    ctx.fillStyle = PAL.creatureShadow;
    let headCenterX = cx + subliminalSnap;
    let headTopY = r.y;

    if (pose === 'WAIT') {
      // Pose 1: WAIT — Tall, crooked-neck gaunt figure standing dead motionless between pines
      const headOffset = Math.max(2, Math.round(headR * 0.42));
      headCenterX = cx + headOffset + subliminalSnap;
      // Thin crooked neck stalk
      ctx.fillRect(Math.round(cx - 2), Math.round(r.y + headR * 1.2), 4, Math.round(headR * 0.8));
      // Gaunt shoulders & narrow ribcage
      ctx.fillRect(Math.round(cx - shoulderW / 2), Math.round(r.y + headR * 1.5), shoulderW, Math.round(r.h * 0.24));
      ctx.fillRect(Math.round(cx - torsoW / 2), Math.round(r.y + headR * 1.9), torsoW, Math.round(r.h * 0.48));
      // Elongated skull
      ctx.fillRect(Math.round(headCenterX - headR), headTopY, headR * 2, Math.round(headR * 1.85));
      // Unnaturally long hanging arms ending in thin 3-pronged claws past the knees
      const armTop = Math.round(r.y + headR * 1.6);
      const armLen = Math.round(r.h * 0.68);
      ctx.fillRect(Math.round(cx - shoulderW / 2 - armW + 1), armTop, armW, armLen);
      ctx.fillRect(Math.round(cx + shoulderW / 2 - 1), armTop, armW, armLen);
      ctx.fillRect(Math.round(cx - shoulderW / 2 - armW - 1), armTop + armLen, 1, 5);
      ctx.fillRect(Math.round(cx + shoulderW / 2 + armW), armTop + armLen, 1, 5);
    } else if (pose === 'COIL') {
      // Pose 2: COIL — Contorted spider-like crouch, jagged dorsal spine, wide bent limbs poised to leap
      const crouchY = Math.round(r.y + r.h * 0.14);
      headTopY = crouchY;
      const wideW = Math.round(shoulderW * 1.38);
      ctx.fillRect(Math.round(cx - 2), Math.round(crouchY - headR * 0.65), 4, Math.round(headR * 0.85));
      ctx.fillRect(Math.round(cx - wideW / 2), Math.round(crouchY + headR * 0.8), wideW, Math.round(r.h * 0.26));
      ctx.fillRect(Math.round(cx - torsoW * 0.62), Math.round(crouchY + headR * 1.3), Math.round(torsoW * 1.24), Math.round(r.h * 0.42));
      ctx.fillRect(Math.round(headCenterX - headR), headTopY, headR * 2, Math.round(headR * 1.75));
      ctx.fillRect(Math.round(cx - wideW / 2 - armW * 2), Math.round(crouchY + headR * 0.35), armW * 2, Math.round(r.h * 0.48));
      ctx.fillRect(Math.round(cx + wideW / 2), Math.round(crouchY + headR * 0.35), armW * 2, Math.round(r.h * 0.48));
    } else {
      // Pose 3: LUNGE / WINDOW SLAM — Towering nightmare pressed right up against your window glass!
      const lungeW = Math.round(shoulderW * 1.28);
      ctx.fillRect(Math.round(cx - lungeW / 2), Math.round(r.y + headR * 1.15), lungeW, Math.round(r.h * 0.38));
      ctx.fillRect(Math.round(cx - torsoW / 2), Math.round(r.y + headR * 1.65), torsoW, Math.round(r.h * 0.52));
      ctx.fillRect(Math.round(headCenterX - headR * 1.08), headTopY, Math.round(headR * 2.16), Math.round(headR * 2.05));
      const clawH = Math.round(r.h * 0.58);
      ctx.fillRect(Math.round(cx - lungeW / 2 - armW - 1), Math.max(2, Math.round(r.y - headR * 0.7)), armW + 2, clawH);
      ctx.fillRect(Math.round(cx + lungeW / 2 - 1), Math.max(2, Math.round(r.y - headR * 0.7)), armW + 2, clawH);

      // Cold breath condensation fogging the glass pane at close range
      if (c.dist <= state.cfg.evidenceDist) {
        ctx.fillStyle = PAL.breathFog;
        ctx.fillRect(Math.round(headCenterX - headR * 1.35), Math.round(r.eyeY + headR * 0.15), Math.round(headR * 2.7), Math.round(headR * 1.6));
      }

      // When slammed flat against the glass (dist <= 0.24), corpse-pale 4-fingered hands press flat on the window!
      if (c.dist <= 0.24) {
        const palmY = Math.round(headTopY + headR * 0.85);
        const leftPalmX = Math.round(cx - lungeW * 0.68);
        const rightPalmX = Math.round(cx + lungeW * 0.52);
        ctx.fillStyle = PAL.corpseDim;
        ctx.fillRect(leftPalmX, palmY, 10, 12);
        ctx.fillRect(rightPalmX, palmY, 10, 12);
        ctx.fillStyle = PAL.corpsePale;
        for (let f = 0; f < 4; f++) {
          ctx.fillRect(leftPalmX - 1 + f * 3, palmY - 9, 2, 10);
          ctx.fillRect(rightPalmX - 1 + f * 3, palmY - 9, 2, 10);
        }
      }
    }

    // Subtle moonlight/storm rim highlight & gaunt pale rib slits when close or stared at
    ctx.fillStyle = PAL.creatureRim;
    const rimW = pose === 'COIL' ? Math.round(shoulderW * 1.38) : shoulderW;
    const rimY = pose === 'COIL' ? Math.round(r.y + r.h * 0.14 + headR * 0.8) : Math.round(r.y + headR * 1.5);
    ctx.fillRect(Math.round(cx - rimW / 2), rimY, rimW, 2);
    ctx.fillRect(Math.round(headCenterX - headR), headTopY, headR * 2, 2);

    if (stareReveal > 0.48 && headR >= 7) {
      // Faint corpse-pale gaunt cheekbones & ribcage lines emerging in the dark
      ctx.fillStyle = PAL.corpseDim;
      for (let rib = 0; rib < 3; rib++) {
        ctx.fillRect(Math.round(cx - torsoW * 0.32), rimY + 8 + rib * 5, Math.round(torsoW * 0.64), 1);
      }
    }

    // Uncanny Eyes & Rictus Grin: bleed out of the shadow the longer you stare!
    const eyeY = pose === 'COIL' ? Math.round(r.eyeY + r.h * 0.12) : r.eyeY;
    const eyeSep = Math.max(3, Math.round(headR * 0.52));

    if (stareReveal > 0.36) {
      // Wide, hollow corpse-pale sclera staring unblinking straight into your soul!
      const scleraW = c.dist <= 0.28 ? 6 : (headR >= 8 ? 4 : 3);
      const scleraH = c.dist <= 0.28 ? 5 : 3;
      ctx.fillStyle = PAL.corpsePale;
      ctx.fillRect(Math.round(headCenterX - eyeSep - scleraW / 2), eyeY - 1, scleraW, scleraH);
      ctx.fillRect(Math.round(headCenterX + eyeSep - scleraW / 2), eyeY - 1, scleraW, scleraH);
      // Pinpoint blood-red / void pupils dead center
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(Math.round(headCenterX - eyeSep), eyeY, 2, 2);
      ctx.fillRect(Math.round(headCenterX + eyeSep), eyeY, 2, 2);
      ctx.fillStyle = PAL.eyeRed;
      ctx.fillRect(Math.round(headCenterX - eyeSep), eyeY, 1, 1);
      ctx.fillRect(Math.round(headCenterX + eyeSep), eyeY, 1, 1);
    } else {
      const eyeSize = c.dist <= state.cfg.lungeDist ? 3 : 2;
      ctx.fillStyle = PAL.eyeRed;
      ctx.fillRect(Math.round(headCenterX - eyeSep - 1), eyeY, eyeSize, eyeSize);
      ctx.fillRect(Math.round(headCenterX + eyeSep - 1), eyeY, eyeSize, eyeSize);
    }

    // Uncanny stretched vertical rictus grin with vertical teeth slits!
    if (stareReveal > 0.52 || pose === 'LUNGE') {
      const mouthW = Math.max(4, Math.round(headR * 0.95));
      const mouthH = c.dist <= 0.26 ? Math.max(7, Math.round(headR * 0.85)) : Math.max(3, Math.round(headR * 0.45));
      const mouthX = Math.round(headCenterX - mouthW / 2);
      const mouthY = Math.round(eyeY + Math.max(4, headR * 0.48));
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(mouthX - 1, mouthY - 1, mouthW + 2, mouthH + 2);
      ctx.fillStyle = c.dist <= 0.26 ? PAL.corpsePale : PAL.corpseDim;
      for (let tx = 0; tx < mouthW; tx += 2) {
        ctx.fillRect(mouthX + tx, mouthY, 1, mouthH);
      }
    }
  }

  function drawExteriorLayers(ctx, state) {
    const { cockpit } = state;
    const panX = cockpit.panX;
    const horizonY = 104;

    // Layer 1: Storm Sky & Lightning
    ctx.fillStyle = cockpit.lightningFlash > 0.1 ? PAL.lightningSky : PAL.nightSky;
    ctx.fillRect(0, 0, W, horizonY);

    ctx.fillStyle = PAL.stormCloud;
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 110 - Math.round(panX * 0.2)) % (W + 120)) - 40;
      ctx.fillRect(cx, 14 + (i % 2) * 12, 86, 10);
    }

    // Mud ground
    ctx.fillStyle = PAL.mudGround;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // Layer 2: Far pine treeline (Parallax 0.55)
    for (const t of FOREST_TREES) {
      if (t.layer === 1) {
        const sx = t.wx - panX * 0.55;
        drawPine16Bit(ctx, sx, horizonY + 12, Math.round(t.w * 0.75), Math.round(t.h * 0.75), PAL.farPine, null);
      }
    }

    // Creatures lurking in the treeline
    for (const c of state.creatures) {
      drawCreature16Bit(ctx, c, state);
    }

    // Near/midground pine trees (Parallax 0.85)
    for (const t of FOREST_TREES) {
      if (t.layer === 2) {
        const sx = t.wx - panX * 0.85;
        const rim = cockpit.lightningFlash > 0.1 ? PAL.lightningSky : PAL.creatureRim;
        drawPine16Bit(ctx, sx, horizonY + 34, t.w, t.h, PAL.midPine, rim);
      }
    }
  }

  function drawWindowGlassLayer(ctx, state) {
    const panX = state.cockpit.panX;
    const time = state.night.timeElapsed || 0;

    // Purely atmospheric 16-bit rain streaks across all glass panes (never blocks gaze)
    ctx.fillStyle = PAL.rainStreak;
    for (let i = 0; i < 36; i++) {
      const rx = ((i * 37 + Math.round(time * 88) - Math.round(panX * 0.9)) % W + W) % W;
      const ry = ((i * 53 + Math.round(time * 205)) % 166);
      ctx.fillRect(rx, ry, 1, 7);
    }
  }

  function drawCockpitInterior(ctx, state) {
    const { cockpit, camera, night } = state;
    const panX = cockpit.panX;

    // Roof headliner
    const roofH = 22;
    ctx.fillStyle = PAL.cockpitDark;
    ctx.fillRect(0, 0, W, roofH);
    ctx.fillStyle = PAL.cockpitTrim;
    ctx.fillRect(0, roofH - 3, W, 3);

    // Left & Right A-Pillars physically dividing the 3 windows (World X = 160 and 468)
    const leftPillarX = Math.round(160 - panX);
    const rightPillarX = Math.round(468 - panX);
    ctx.fillStyle = PAL.cockpitDark;
    ctx.fillRect(leftPillarX - 10, 0, 18, H);
    ctx.fillRect(rightPillarX - 8, 0, 18, H);
    ctx.fillStyle = PAL.cockpitTrim;
    ctx.fillRect(leftPillarX + 5, 0, 3, H);
    ctx.fillRect(rightPillarX - 8, 0, 3, H);

    // Outer door frames
    ctx.fillStyle = PAL.cockpitDark;
    ctx.fillRect(0, 0, Math.max(0, 14 - panX), H);
    const rightEdge = Math.round(626 - panX);
    if (rightEdge < W) ctx.fillRect(rightEdge, 0, W - rightEdge, H);

    // Rearview Mirror (atmospheric diegetic reflection when an unwatched figure creeps close)
    const mirrorX = Math.round(282 - panX);
    const mirrorY = roofH + 4;
    if (mirrorX + 76 > 0 && mirrorX < W) {
      ctx.fillStyle = PAL.cockpitTrim;
      ctx.fillRect(mirrorX + 34, roofH - 2, 8, 8);
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(mirrorX, mirrorY, 76, 20);
      ctx.strokeStyle = PAL.cockpitLeather;
      ctx.strokeRect(mirrorX, mirrorY, 76, 20);

      const closeUnwatched = state.creatures.find((c) => c.dist < 0.52 && !C.isCreatureInViewCone(c, state));
      if (closeUnwatched) {
        ctx.fillStyle = PAL.eyeRed;
        ctx.fillRect(mirrorX + 35, mirrorY + 9, 2, 2);
        ctx.fillRect(mirrorX + 41, mirrorY + 9, 2, 2);
      }
    }

    // Silent Dead Dashboard & Door Sills (pure visual framing — zero switches, zero gauges)
    const dashY = 172;
    ctx.fillStyle = PAL.cockpitLeather;
    ctx.fillRect(0, dashY - 4, W, 5);
    ctx.fillStyle = PAL.dashPanel;
    ctx.fillRect(0, dashY, W, H - dashY);

    // Dead Steering Wheel silhouette (World X = 248)
    const wheelX = Math.round(248 - panX);
    if (wheelX + 50 > 0 && wheelX - 50 < W) {
      ctx.strokeStyle = PAL.cockpitDark;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(wheelX, dashY + 26, 34, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Diegetic dashboard quartz clock (00:00 -> 05:00 AM)
    const progress = clamp(night.timeElapsed / Math.max(1, night.duration), 0, 1);
    const hour = Math.floor(progress * 5);
    const min = Math.floor((progress * 300) % 60);
    const clockStr = '0' + hour + ':' + (min < 10 ? '0' + min : min) + ' AM';

    const clockBoxX = Math.round(320 - panX) - 32;
    if (clockBoxX + 64 > 0 && clockBoxX < W) {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(clockBoxX, dashY + 14, 64, 18);
      ctx.strokeStyle = PAL.cockpitTrim;
      ctx.strokeRect(clockBoxX, dashY + 14, 64, 18);
      text(ctx, clockStr, clockBoxX + 32, dashY + 19, PAL.quartzGreen, 8, 'center');
    }

    // Passenger-seat Kodak film box (World X = 510)
    const passX = Math.round(502 - panX);
    if (passX + 100 > 0 && passX < W) {
      ctx.fillStyle = PAL.cockpitLeather;
      ctx.fillRect(passX + 10, dashY + 12, 82, 32);
      ctx.strokeStyle = PAL.amberDim;
      ctx.strokeRect(passX + 10, dashY + 12, 82, 32);
      text(ctx, 'KODAK 1600', passX + 16, dashY + 17, PAL.amberGlow, 7);
      text(ctx, 'EXP: ' + camera.filmLeft, passX + 16, dashY + 29, PAL.polaroidWhite, 8);
    }

    // Subtle top headliner strip (Night, Time, Film left, Photo count — zero car clutter)
    ctx.fillStyle = 'rgba(7, 8, 13, 0.72)';
    ctx.fillRect(6, 4, 308, 13);
    text(ctx, 'NIGHT ' + night.number, 10, 6, PAL.amberDim, 8);
    text(ctx, clockStr, 86, 6, PAL.polaroidWhite, 8);
    text(ctx, 'FILM:' + camera.filmLeft, 166, 6, camera.filmLeft > 0 ? PAL.amberGlow : PAL.dangerRed, 8);
    text(ctx, 'PROOF:' + night.evidenceCount + '/1', 238, 6, night.evidenceCount > 0 ? PAL.quartzGreen : PAL.amberDim, 8);
  }

  function drawViewfinderAndPhoto(ctx, state) {
    const { cockpit, camera } = state;

    // Optical SLR Viewfinder when camera is held up to your face (covering naked eyes!)
    if (cockpit.vfActive) {
      const vf = C.getViewfinderRect(state);
      const ready = camera.chargeTimer <= 0 && camera.filmLeft > 0;

      // Heavy dark mask outside the 120x96 optical viewfinder — your naked eyes are blocked by the camera body
      ctx.fillStyle = 'rgba(5, 6, 9, 0.88)';
      ctx.fillRect(0, 18, W, vf.y - 18);
      ctx.fillRect(0, vf.y + vf.h, W, H - (vf.y + vf.h));
      ctx.fillRect(0, vf.y, vf.x, vf.h);
      ctx.fillRect(vf.x + vf.w, vf.y, W - (vf.x + vf.w), vf.h);

      // Etched optical frame & center split-prism crosshair (no text prompts!)
      ctx.strokeStyle = PAL.amberDim;
      ctx.lineWidth = 1;
      ctx.strokeRect(vf.x, vf.y, vf.w, vf.h);

      const cx = Math.round(vf.x + vf.w / 2);
      const cy = Math.round(vf.y + vf.h / 2);
      ctx.fillStyle = PAL.amberGlow;
      ctx.fillRect(cx - 7, cy, 5, 1);
      ctx.fillRect(cx + 3, cy, 5, 1);
      ctx.fillRect(cx, cy - 7, 1, 5);
      ctx.fillRect(cx, cy + 3, 1, 5);

      // Physical flash capacitor LED dot in top-right corner of optical viewfinder
      ctx.fillStyle = ready ? PAL.amberGlow : PAL.dangerRed;
      ctx.fillRect(vf.x + vf.w - 8, vf.y + 5, 3, 3);
    }

    // Glass Flash Reflection Glare (1s whiteout blindness)
    if (camera.blindTimer > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(camera.blindTimer / state.cfg.blindTime, 0, 0.94);
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
        const silW = p.pose === 'COIL' ? 22 : (p.pose === 'LUNGE' ? 20 : 16);
        const silX = px + 42 - Math.round(silW / 2);
        ctx.fillRect(silX, py + 49 - silH, silW, silH);
        if (p.pose === 'LUNGE') {
          ctx.fillRect(silX - 3, py + 45 - silH, 3, Math.round(silH * 0.6));
          ctx.fillRect(silX + silW, py + 45 - silH, 3, Math.round(silH * 0.6));
        }
        ctx.fillStyle = PAL.eyeRed;
        ctx.fillRect(px + 38, py + 53 - silH, 2, 2);
        ctx.fillRect(px + 44, py + 53 - silH, 2, 2);
      }

      const gColor = p.grade === 'EVIDENCE' ? '#0b7a3e' : p.grade === 'SUSPICIOUS' ? '#9c6200' : PAL.dangerRed;
      text(ctx, p.grade, px + 42, py + 52, gColor, 8, 'center');
      text(ctx, p.score + ' PTS', px + 42, py + 60, PAL.voidBlack, 7, 'center');
    }

    // Pillar 2: Claustrophobic Gaze Tunnel, Static Horror Grain & Involuntary Blink!
    if ((cockpit.blinkTimer || 0) > 0) {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
    } else {
      const dread = cockpit.stareDread || 0;
      const strain = cockpit.eyeStrain || 0;
      const time = state.night ? state.night.timeElapsed : 0;

      // 1. Claustrophobic Gaze Tunnel closing in around the creature while locking eyes!
      if (dread > 0.12 && !cockpit.vfActive) {
        const gazedCreature = state.creatures.find((c) => C.isCreatureGazed(c, state));
        const focusX = gazedCreature
          ? clamp(C.creatureScreenRect(gazedCreature, cockpit.panX).eyeX, 60, W - 60)
          : W / 2;
        const sideCurtain = Math.round(dread * 88);
        const leftWall = Math.max(0, Math.round(focusX - (W / 2 - sideCurtain)));
        const rightWall = Math.max(0, Math.round(W - (focusX + (W / 2 - sideCurtain))));

        ctx.fillStyle = 'rgba(4, 5, 8, 0.76)';
        if (leftWall > 0) ctx.fillRect(0, 17, leftWall, H - 17);
        if (rightWall > 0) ctx.fillRect(W - rightWall, 17, rightWall, H - 17);

        // Flickering analog static scanlines as gaze dread mounts
        if (dread > 0.42) {
          const lines = Math.floor((dread - 0.35) * 18);
          ctx.fillStyle = dread > 0.72 ? 'rgba(230, 46, 46, 0.14)' : 'rgba(207, 214, 222, 0.08)';
          for (let i = 0; i < lines; i++) {
            const sy = 20 + ((Math.round(time * 370) + i * 29) % (H - 36));
            ctx.fillRect(0, sy, W, 1);
          }
        }
      }

      // 2. Heavy spasming eyelids closing down right before involuntary blink
      if (strain > 0.25) {
        const ratio = clamp((strain - 0.25) / 0.75, 0, 1);
        const flutter = ratio > 0.5 ? Math.max(0, Math.round(Math.sin(time * 34) * 7)) : 0;
        const lidH = Math.round(ratio * ratio * 74) + flutter;
        const softBandH = Math.round(16 + ratio * 28);

        ctx.fillStyle = 'rgba(5, 6, 9, 0.65)';
        ctx.fillRect(0, lidH, W, softBandH);
        ctx.fillRect(0, H - lidH - softBandH, W, softBandH);

        if (lidH > 0) {
          ctx.fillStyle = PAL.voidBlack;
          ctx.fillRect(0, 0, W, lidH);
          ctx.fillRect(0, H - lidH, W, lidH);
        }
      }
    }
  }

  function drawOverlayScreens(ctx, state) {
    if (state.phase === 'TITLE') {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = PAL.amberDim;
      ctx.strokeRect(12, 12, W - 24, H - 24);

      text(ctx, '16-BIT SURVIVAL HORROR', W / 2, 32, PAL.amberDim, 8, 'center');
      text(ctx, 'EVIDENCE 1989', W / 2, 52, PAL.amberGlow, 18, 'center');
      text(ctx, 'BLACK RAIN', W / 2, 74, PAL.eyeRed, 12, 'center');

      text(ctx, 'WHILE YOUR NAKED EYES ARE ON IT, IT NEVER MOVES.', W / 2, 108, PAL.polaroidWhite, 7, 'center');
      text(ctx, 'RAISING YOUR CAMERA COVERS YOUR EYES — LETTING IT APPROACH.', W / 2, 122, PAL.amberGlow, 7, 'center');
      text(ctx, 'SNAP 1 CLOSE-UP EVIDENCE PHOTO BEFORE 05:00 AM.', W / 2, 136, PAL.polaroidWhite, 7, 'center');

      text(ctx, '[A / D or L / R] TURN HEAD          [HOLD SHIFT] RAISE CAMERA', W / 2, 168, PAL.rainStreak, 7, 'center');
      text(ctx, '[SPACE / CLICK] FIRE FLASH SHUTTER (4 EXPOSURES)', W / 2, 182, PAL.rainStreak, 7, 'center');
      text(ctx, 'PRESS [SPACE] OR CLICK TO BEGIN', W / 2, 206, PAL.quartzGreen, 9, 'center');
      return true;
    }

    if (state.phase === 'NIGHT_INTRO') {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
      text(ctx, state.night.title || ('NIGHT ' + state.night.number), W / 2, 78, PAL.amberGlow, 13, 'center');
      text(ctx, state.night.subtitle || '', W / 2, 104, PAL.polaroidWhite, 8, 'center');
      text(ctx, '4 EXPOSURES. SURVIVE UNTIL 05:00 AM.', W / 2, 132, PAL.rainStreak, 8, 'center');
      text(ctx, 'PRESS [SPACE] TO OPEN YOUR EYES', W / 2, 174, PAL.quartzGreen, 9, 'center');
      return true;
    }

    if (state.phase === 'NIGHT_SUMMARY') {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
      text(ctx, '05:00 AM — DAWN BREAKS', W / 2, 58, PAL.quartzGreen, 12, 'center');
      text(ctx, 'EVIDENCE SECURED FOR NIGHT ' + state.night.number, W / 2, 88, PAL.amberGlow, 9, 'center');
      text(ctx, 'CLOSE-UP PHOTOS: ' + state.night.evidenceCount, W / 2, 118, PAL.polaroidWhite, 8, 'center');
      text(ctx, 'PRESS [SPACE] FOR NEXT NIGHT', W / 2, 172, PAL.amberGlow, 9, 'center');
      return true;
    }

    if (state.phase === 'GAME_OVER') {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
      if (state.endReason === 'BREACH') {
        ctx.fillStyle = PAL.eyeRed;
        ctx.fillRect(108, 72, 28, 18);
        ctx.fillRect(184, 72, 28, 18);
        text(ctx, 'WINDOW SHATTERED (' + (state.breachDir || 'CAR') + ')', W / 2, 126, PAL.dangerRed, 12, 'center');
        text(ctx, 'YOU TOOK YOUR EYES OFF IT FOR TOO LONG.', W / 2, 148, PAL.polaroidWhite, 8, 'center');
      } else {
        text(ctx, 'INVESTIGATION FAILED: ' + state.endReason, W / 2, 96, PAL.dangerRed, 11, 'center');
        text(ctx, 'WITHOUT CLEAR CLOSE-UP PROOF, NOBODY BELIEVED YOU.', W / 2, 124, PAL.polaroidWhite, 8, 'center');
      }
      text(ctx, 'PRESS [SPACE] TO TRY AGAIN', W / 2, 188, PAL.amberGlow, 9, 'center');
      return true;
    }

    if (state.phase === 'VICTORY') {
      ctx.fillStyle = PAL.voidBlack;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = PAL.quartzGreen;
      ctx.strokeRect(14, 14, W - 28, H - 28);
      text(ctx, 'THE EYE WEEKLY — FRONT PAGE EXCLUSIVE!', W / 2, 46, PAL.amberGlow, 10, 'center');
      text(ctx, 'SURVIVED ALL 3 NIGHTS IN OREGON', W / 2, 74, PAL.quartzGreen, 11, 'center');
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
      const shake = (state.phase === 'PLAYING' && state.cockpit && state.cockpit.shakeTimer > 0)
        ? state.cockpit.shakeTimer
        : 0;
      if (shake > 0) {
        const t = state.night ? state.night.timeElapsed : 0;
        const sx = Math.round(Math.sin(t * 95) * shake * 14 * scaleX);
        const sy = Math.round(Math.cos(t * 73) * shake * 10 * scaleY);
        ctx.setTransform(scaleX, 0, 0, scaleY, sx, sy);
      } else {
        ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      }
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
