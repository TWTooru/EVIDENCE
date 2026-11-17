/* EVIDENCE 1989: BLACK RAIN — Pure 16-bit "123 Wooden Man" Core Engine (zero car-chore systems, zero DOM dependencies). */
(function (root) {
  'use strict';

  const SCREEN_W = 320;
  const SCREEN_H = 240;
  const WORLD_W = 640;
  const MAX_PAN_X = WORLD_W - SCREEN_W; // 320

  // World X centers for the three car windows (car is purely a spatial visual frame)
  const DIR_WORLD_X = {
    LEFT: 95,
    FRONT: 320,
    RIGHT: 545,
  };

  const DEFAULTS = {
    panSpeed: 280,          // Horizontal head-turn speed (px/s)
    nightDuration: 75,      // Seconds per night (00:00 -> 05:00 AM)
    film: 4,                // Film exposures per night
    chargeTime: 2.5,        // Flash capacitor recharge time (s)
    blindTime: 1.0,         // Glass reflection whiteout blindness (s)
    approachSpeed: 0.055,   // Base creature approach rate when unwatched (dist/s)
    retreatDist: 0.92,      // Creature distance after flash hit
    evidenceDist: 0.34,     // Max distance for EVIDENCE grade
    suspiciousDist: 0.65,   // Max distance for SUSPICIOUS grade
    vfW: 120,               // Camera optical viewfinder width (px)
    vfH: 96,                // Camera optical viewfinder height (px)
    maxStare: 2.8,          // Base unblinking stare duration (s) before involuntary blink
    blinkDuration: 0.22,    // Pitch-black involuntary blink duration (s)
    waitMult: 0.55,         // Deceptive slow stalk multiplier in WAIT pose
    coilMult: 1.65,         // Explosive lunge multiplier in COIL pose
    lungeMult: 1.50,        // Point-blank lunge multiplier in LUNGE pose
    lungeDist: 0.36,        // Distance threshold where creature enters LUNGE pose
    debug: 0,
  };

  function makeConfig(overrides) {
    const cfg = Object.assign({}, DEFAULTS);
    if (!overrides) return cfg;
    for (const key of Object.keys(DEFAULTS)) {
      const raw = overrides[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const val = Number(raw);
      if (Number.isFinite(val)) cfg[key] = val;
    }
    return cfg;
  }

  function mulberry32(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function nightSettings(night, cfg) {
    const n = clamp(night || 1, 1, 3);
    if (n === 1) {
      return {
        number: 1,
        title: 'NIGHT 1: FIRST SIGHTING',
        subtitle: 'IT NEVER MOVES WHILE YOUR EYES ARE ON IT.',
        dirs: ['LEFT', 'FRONT', 'RIGHT'],
        creatureCount: 1,
        approachMult: 1.0,
        rainMult: 1.0,
        shiftMin: 4.5,
        shiftSpan: 3.5,
        duration: cfg.nightDuration,
      };
    }
    if (n === 2) {
      return {
        number: 2,
        title: 'NIGHT 2: CIRCLING IN THE RAIN',
        subtitle: 'IT FLANKS FASTER WHENEVER YOU LOOK AWAY.',
        dirs: ['LEFT', 'FRONT', 'RIGHT'],
        creatureCount: 1,
        approachMult: 1.25,
        rainMult: 1.45,
        shiftMin: 3.2,
        shiftSpan: 2.4,
        duration: cfg.nightDuration,
      };
    }
    return {
      number: 3,
      title: 'NIGHT 3: TWO IN THE DARK',
      subtitle: 'TWO FIGURES. YOU ONLY HAVE ONE PAIR OF EYES.',
      dirs: ['LEFT', 'FRONT', 'RIGHT'],
      creatureCount: 2,
      approachMult: 1.18,
      rainMult: 1.85,
      shiftMin: 3.8,
      shiftSpan: 2.8,
      duration: cfg.nightDuration,
    };
  }

  function creatureWorldPos(c) {
    const base = DIR_WORLD_X[c.dir] || 320;
    return base + (c.offsetX || 0);
  }

  function creatureScreenRect(c, panX) {
    const near = clamp(1 - c.dist, 0, 1);
    const worldX = creatureWorldPos(c);
    const screenX = worldX - panX;

    const minH = 22;
    const maxH = 142;
    const h = Math.round(minH + (maxH - minH) * near);
    const w = Math.round(h * 0.42);
    const horizonY = 102;
    const feetNearY = 186;
    const feetY = Math.round(horizonY + (feetNearY - horizonY) * near);
    const x = Math.round(screenX - w / 2);
    const y = feetY - h;
    return {
      x,
      y,
      w,
      h,
      eyeX: screenX,
      eyeY: Math.round(y + h * 0.16),
      pose: c.pose || 'WAIT',
    };
  }

  // Checks if creature is within the current window's visual cone (ignoring whether camera is raised)
  function isCreatureInViewCone(c, state) {
    if (!c || !state) return false;
    const { cockpit, camera } = state;
    if (camera.blindTimer > 0 || cockpit.blinkTimer > 0) return false;

    const rect = creatureScreenRect(c, cockpit.panX);
    return rect.eyeX >= 72 && rect.eyeX <= SCREEN_W - 72;
  }

  // Sacred 123 Wooden Man Rule:
  // Direct naked-eye contact (!vfActive) locks the creature into 100% absolute statue stillness.
  // Raising the camera viewfinder (vfActive) covers your naked eyes behind the camera body, breaking eye contact!
  function isCreatureGazed(c, state) {
    if (!isCreatureInViewCone(c, state)) return false;
    if (state.cockpit.vfActive) return false;
    return true;
  }

  function overlapArea(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  function getViewfinderRect(state) {
    const w = state.cfg.vfW;
    const h = state.cfg.vfH;
    const x = Math.round((SCREEN_W - w) / 2);
    const y = 54;
    return { x, y, w, h };
  }

  function gradePhoto(c, state) {
    if (!c) {
      return { grade: 'BLURRY', score: 0, fill: 0, completeness: 0, dir: 'NONE', dist: 1, pose: 'WAIT' };
    }
    const vf = getViewfinderRect(state);
    const rect = creatureScreenRect(c, state.cockpit.panX);
    const area = rect.w * rect.h;
    const completeness = area > 0 ? overlapArea(vf, rect) / area : 0;
    const fill = clamp(1 - c.dist, 0, 1);

    const rawScore = fill * 0.65 + completeness * 0.35;
    const score = Math.round(clamp(rawScore * 100, 0, 100));

    let grade = 'BLURRY';
    if (c.dist <= state.cfg.evidenceDist && completeness >= 0.55) {
      grade = 'EVIDENCE';
    } else if (c.dist <= state.cfg.suspiciousDist && completeness >= 0.3 && score >= 35) {
      grade = 'SUSPICIOUS';
    }

    return {
      grade,
      score,
      fill: Number(fill.toFixed(2)),
      completeness: Number(completeness.toFixed(2)),
      dir: c.dir,
      dist: Number(c.dist.toFixed(2)),
      pose: c.pose || (c.dist <= state.cfg.lungeDist ? 'LUNGE' : 'WAIT'),
    };
  }

  function spawnCreature(id, ns, rng, forceDir, speedScale) {
    const dirs = ns.dirs;
    const dir = forceDir || dirs[Math.floor(rng() * dirs.length)];
    const offsetX = Math.round((rng() - 0.5) * 36);
    return {
      id,
      dir,
      dist: Number((0.78 + rng() * 0.16).toFixed(3)),
      offsetX,
      lateralDir: rng() < 0.5 ? -1 : 1,
      shiftTimer: ns.shiftMin + rng() * ns.shiftSpan,
      speedScale: speedScale || 1.0,
      state: 'STALKING',
      pose: 'WAIT',          // 'WAIT' | 'COIL' | 'LUNGE'
      unwatchedTime: 0,      // Time spent unwatched since last eye contact
      lookAwayCount: 0,      // Number of times player broke eye contact
      glintTimer: 0.8 + rng() * 0.8,
      glintVisible: 0,
      soundCooldown: 1.1 + rng() * 0.9,
    };
  }

  function createGame(config, seed) {
    const cfg = config || makeConfig();
    const rng = mulberry32(seed === undefined ? 19891103 : seed);
    return {
      cfg,
      rng,
      phase: 'TITLE', // TITLE | NIGHT_INTRO | PLAYING | NIGHT_SUMMARY | GAME_OVER | VICTORY
      endReason: null,
      breachDir: null,
      night: {
        number: 1,
        title: '',
        subtitle: '',
        timeElapsed: 0,
        duration: cfg.nightDuration,
        evidenceCount: 0,
      },
      cockpit: {
        panX: 160,            // 160 centers on FRONT windshield (320 - 160)
        vfActive: false,      // True while camera viewfinder is held up over naked eyes
        eyeStrain: 0,         // 0..1 physiological eye dryness when staring unblinking
        blinkTarget: 0.94,    // Organic threshold (0.88..1.0) so blink timing cannot be stopwatch-gamed
        blinkTimer: 0,        // >0 when eyelids snap shut in involuntary blink
        stareDread: 0,        // 0..1 continuous psychological/tinnitus dread while locking eyes
        shakeTimer: 0,        // >0 violent cockpit shake when creature slams onto window glass
        lightningTimer: 4.5,
        lightningFlash: 0,
        heartbeatTimer: 0.5,
        rainAmbienceTimer: 0.25,
      },
      camera: {
        filmLeft: cfg.film,
        chargeTimer: 0,
        blindTimer: 0,
        lastPhoto: null,
        photoPopupTimer: 0,
        allPhotos: [],
      },
      creatures: [],
      events: [],
    };
  }

  function startNight(state, nightNum) {
    const ns = nightSettings(nightNum, state.cfg);
    state.phase = 'PLAYING';
    state.endReason = null;
    state.breachDir = null;
    state.night = {
      number: ns.number,
      title: ns.title,
      subtitle: ns.subtitle,
      timeElapsed: 0,
      duration: ns.duration,
      evidenceCount: 0,
      settings: ns,
    };

    state.cockpit.panX = 160;
    state.cockpit.vfActive = false;
    state.cockpit.eyeStrain = 0;
    state.cockpit.blinkTarget = 0.88 + state.rng() * 0.12;
    state.cockpit.blinkTimer = 0;
    state.cockpit.stareDread = 0;
    state.cockpit.shakeTimer = 0;
    state.cockpit.lightningTimer = 3.5 + state.rng() * 4.5;
    state.cockpit.lightningFlash = 0;
    state.cockpit.heartbeatTimer = 0.45;
    state.cockpit.rainAmbienceTimer = 0.25;

    state.camera.filmLeft = state.cfg.film;
    state.camera.chargeTimer = 0;
    state.camera.blindTimer = 0;
    state.camera.lastPhoto = null;
    state.camera.photoPopupTimer = 0;

    state.creatures = [];
    const dirs = ns.dirs;
    const d0 = dirs[Math.floor(state.rng() * dirs.length)];
    state.creatures.push(spawnCreature(1, ns, state.rng, d0, 1.0));

    if (ns.creatureCount >= 2) {
      const otherDirs = dirs.filter((d) => d !== d0);
      const d1 = otherDirs[Math.floor(state.rng() * otherDirs.length)] || 'LEFT';
      const second = spawnCreature(2, ns, state.rng, d1, 0.62);
      second.dist = 0.94;
      state.creatures.push(second);
    }

    return state;
  }

  function pickUnoccupiedWindow(c, state, ns) {
    const occupied = state.creatures.filter((o) => o !== c).map((o) => o.dir);
    const diffDirs = ns.dirs.filter((d) => d !== c.dir);
    const freeDirs = diffDirs.filter((d) => !occupied.includes(d));
    const pool = freeDirs.length > 0 ? freeDirs : diffDirs;
    return pool.length > 0 ? pool[Math.floor(state.rng() * pool.length)] : ns.dirs[0];
  }

  function relocateCreature(c, state) {
    const ns = state.night.settings || nightSettings(state.night.number, state.cfg);
    c.dir = pickUnoccupiedWindow(c, state, ns);
    c.dist = state.cfg.retreatDist;
    c.offsetX = Math.round((state.rng() - 0.5) * 36);
    c.state = 'STALKING';
    c.pose = 'WAIT';
    c.unwatchedTime = 0;
    c.lookAwayCount = 0;
    c.shiftTimer = ns.shiftMin + state.rng() * ns.shiftSpan;
  }

  function handleShutter(state) {
    const { camera, cockpit, cfg } = state;
    if (camera.filmLeft <= 0 || camera.chargeTimer > 0) return false;

    camera.filmLeft -= 1;
    camera.chargeTimer = cfg.chargeTime;
    camera.blindTimer = cfg.blindTime;
    camera.photoPopupTimer = 3.2;
    state.events.push({ type: 'SHUTTER_BLAST' });

    // Evaluate photo against the most prominent creature inside the viewfinder
    const vf = getViewfinderRect(state);
    let bestCreature = null;
    let bestGradeObj = { grade: 'BLURRY', score: 0, fill: 0, completeness: 0, dir: 'NONE', dist: 1, pose: 'WAIT' };

    for (const c of state.creatures) {
      const rect = creatureScreenRect(c, cockpit.panX);
      const ov = overlapArea(vf, rect);
      if (ov > 0) {
        const g = gradePhoto(c, state);
        if (!bestCreature || g.score >= bestGradeObj.score) {
          bestCreature = c;
          bestGradeObj = g;
        }
      }
    }

    // Any creature visible in the current window gets blasted back into the forest by the high-voltage flash!
    for (const c of state.creatures) {
      const rect = creatureScreenRect(c, cockpit.panX);
      const onScreen = rect.eyeX >= 0 && rect.eyeX <= SCREEN_W;
      if (onScreen) {
        state.events.push({ type: 'MONSTER_SCREAM', dir: c.dir });
        relocateCreature(c, state);
      }
    }

    if (bestGradeObj.grade === 'EVIDENCE') {
      state.night.evidenceCount += 1;
    }

    camera.lastPhoto = bestGradeObj;
    camera.allPhotos.push(bestGradeObj);
    return true;
  }

  function step(state, input, dt) {
    const inp = input || {};
    state.events = [];

    if (state.phase === 'TITLE') {
      if (inp.action || inp.shoot) {
        const ns = nightSettings(1, state.cfg);
        state.night.number = 1;
        state.night.title = ns.title;
        state.night.subtitle = ns.subtitle;
        state.phase = 'NIGHT_INTRO';
        state.events.push({ type: 'SWITCH_CLICK' });
      }
      return state;
    }

    if (state.phase === 'NIGHT_INTRO') {
      if (inp.action || inp.shoot) {
        startNight(state, state.night.number);
        state.events.push({ type: 'SWITCH_CLICK' });
      }
      return state;
    }

    if (state.phase === 'NIGHT_SUMMARY') {
      if (inp.action || inp.shoot) {
        if (state.night.number >= 3) {
          state.phase = 'VICTORY';
        } else {
          const nextN = state.night.number + 1;
          const ns = nightSettings(nextN, state.cfg);
          state.night.number = nextN;
          state.night.title = ns.title;
          state.night.subtitle = ns.subtitle;
          state.phase = 'NIGHT_INTRO';
        }
        state.events.push({ type: 'SWITCH_CLICK' });
      }
      return state;
    }

    if (state.phase === 'GAME_OVER' || state.phase === 'VICTORY') {
      if (inp.action || inp.restart) {
        const fresh = createGame(state.cfg, Math.floor(state.rng() * 100000));
        Object.assign(state, fresh);
        startNight(state, 1);
      }
      return state;
    }

    // PLAYING PHASE
    const { cockpit, camera, cfg, night } = state;
    const ns = night.settings || nightSettings(night.number, cfg);

    // 0. Night clock & Dawn check
    night.timeElapsed += dt;
    if (night.timeElapsed >= night.duration) {
      if (night.evidenceCount >= 1) {
        state.phase = 'NIGHT_SUMMARY';
        state.events.push({ type: 'DAWN_CHIME' });
      } else {
        state.phase = 'GAME_OVER';
        state.endReason = 'NO_EVIDENCE';
      }
      return state;
    }

    // 1. Head panning and camera viewfinder raise/lower
    if (inp.left && !inp.right) {
      cockpit.panX = clamp(cockpit.panX - cfg.panSpeed * dt, 0, MAX_PAN_X);
    } else if (inp.right && !inp.left) {
      cockpit.panX = clamp(cockpit.panX + cfg.panSpeed * dt, 0, MAX_PAN_X);
    }

    const prevVf = cockpit.vfActive;
    if (inp.aim !== undefined) {
      cockpit.vfActive = Boolean(inp.aim);
    }
    if (cockpit.vfActive !== prevVf) {
      state.events.push({ type: 'SWITCH_CLICK' });
    }

    // 2. Exterior storm lightning ambience
    cockpit.lightningTimer -= dt;
    if (cockpit.lightningTimer <= 0) {
      cockpit.lightningFlash = 0.28;
      cockpit.lightningTimer = 6.0 + state.rng() * 8.0;
    } else if (cockpit.lightningFlash > 0) {
      cockpit.lightningFlash = Math.max(0, cockpit.lightningFlash - dt);
    }

    // 3. Camera timers & Shutter trigger
    if (camera.chargeTimer > 0) {
      camera.chargeTimer = Math.max(0, camera.chargeTimer - dt);
    }
    if (camera.blindTimer > 0) {
      camera.blindTimer = Math.max(0, camera.blindTimer - dt);
    }
    if (camera.photoPopupTimer > 0) {
      camera.photoPopupTimer = Math.max(0, camera.photoPopupTimer - dt);
    }

    if (inp.shoot) {
      cockpit.vfActive = true;
      handleShutter(state);
    }

    // Out of film with 0 evidence after glare clears -> investigation failed
    if (camera.filmLeft === 0 && night.evidenceCount === 0 && camera.blindTimer === 0) {
      state.phase = 'GAME_OVER';
      state.endReason = 'OUT_OF_FILM';
      return state;
    }

    // 4. Pillar 2: Uncanny Gaze Dread & 3-Blink Lethal Jump-Cut Escalation
    if (cockpit.blinkTimer > 0) {
      cockpit.blinkTimer = Math.max(0, cockpit.blinkTimer - dt);
    }
    if (cockpit.shakeTimer > 0) {
      cockpit.shakeTimer = Math.max(0, cockpit.shakeTimer - dt);
    }

    let justBlinked = false;
    if (cockpit.blinkTimer <= 0 && !cockpit.vfActive && camera.blindTimer <= 0) {
      const staredCreatures = state.creatures.filter((c) => isCreatureInViewCone(c, state));
      if (staredCreatures.length > 0) {
        const nearestStared = staredCreatures.reduce((a, b) => (a.dist < b.dist ? a : b));
        // Closer proximity strains your eyes/sanity even faster!
        const distWindowMult = nearestStared.dist <= 0.26 ? 0.62 : (nearestStared.dist <= 0.52 ? 0.80 : 1.0);
        const effectiveMaxStare = Math.max(0.8, cfg.maxStare * distWindowMult);
        cockpit.eyeStrain = clamp((cockpit.eyeStrain || 0) + dt / effectiveMaxStare, 0, 1);

        const nearFactor = clamp(1 - nearestStared.dist, 0, 1);
        cockpit.stareDread = clamp(cockpit.eyeStrain * 0.78 + nearFactor * 0.48, 0, 1);

        const target = cockpit.blinkTarget || 0.94;
        if (cockpit.eyeStrain >= target) {
          // Eyelids snap shut! 3-Blink Escalation: Far -> Mid COIL -> Glass-Slam LUNGE -> Fatal BREACH!
          cockpit.eyeStrain = 0;
          cockpit.blinkTarget = 0.88 + state.rng() * 0.12;
          cockpit.blinkTimer = cfg.blinkDuration;
          cockpit.stareDread = Math.max(0.35, cockpit.stareDread);
          justBlinked = true;

          for (const c of staredCreatures) {
            const pan = c.dir === 'LEFT' ? -0.85 : c.dir === 'RIGHT' ? 0.85 : 0;
            c.lookAwayCount = (c.lookAwayCount || 0) + 1;
            c.state = 'STALKING';

            if (c.dist > 0.52) {
              // Blink 1: Crosses half the forest in a split-second blink!
              c.dist = Number((0.40 + state.rng() * 0.05).toFixed(4));
              c.pose = 'COIL';
              c.offsetX = clamp((c.offsetX || 0) + (state.rng() < 0.5 ? -20 : 20), -36, 36);
              state.events.push({ type: 'BLINK_LURCH', pan, near: 1 - c.dist });
            } else if (c.dist > 0.26) {
              // Blink 2: SLAMS FACE & HANDS FLAT AGAINST YOUR WINDOW GLASS!
              c.dist = Number((0.15 + state.rng() * 0.04).toFixed(4));
              c.pose = 'LUNGE';
              c.offsetX = 0;
              cockpit.shakeTimer = 0.38;
              state.events.push({ type: 'WINDOW_SLAM', pan, near: 1.0 });
            } else {
              // Blink 3: Already pressed on the glass — blinking again shatters the window!
              c.dist = 0;
            }
          }
        }
      } else {
        cockpit.eyeStrain = Math.max(0, (cockpit.eyeStrain || 0) - dt * 0.95);
        cockpit.stareDread = Math.max(0, (cockpit.stareDread || 0) - dt * 2.4);
      }
    } else if (cockpit.vfActive || camera.blindTimer > 0) {
      cockpit.eyeStrain = Math.max(0, (cockpit.eyeStrain || 0) - dt * 0.95);
      cockpit.stareDread = Math.max(0, (cockpit.stareDread || 0) - dt * 2.0);
    }

    // 5. Pure "123 Wooden Man" Creature AI
    let closestCreature = null;

    for (const c of state.creatures) {
      if (justBlinked) {
        if (!closestCreature || c.dist < closestCreature.dist) closestCreature = c;
        if (c.dist <= 0) {
          state.phase = 'GAME_OVER';
          state.endReason = 'BREACH';
          state.breachDir = c.dir;
          state.events.push({ type: 'GLASS_SHATTER', dir: c.dir });
          return state;
        }
        continue;
      }

      const wasFrozen = c.state === 'FROZEN';
      const inCone = isCreatureInViewCone(c, state);
      const gazed = isCreatureGazed(c, state);
      const luredInVf = inCone && cockpit.vfActive && camera.blindTimer <= 0;

      c.glintVisible = Math.max(0, (c.glintVisible || 0) - dt);

      if (gazed) {
        // SACRED RULE: While your naked eyes are on it, it is 100% DEAD STILL.
        // Zero movement, zero lateral drift, zero cheat-timers, dead silence.
        c.state = 'FROZEN';
        if (!wasFrozen && (c.unwatchedTime || 0) > 0.15 && c.dist > cfg.lungeDist) {
          c.pose = 'COIL';
        }
        if (c.dist <= cfg.lungeDist) {
          c.pose = 'LUNGE';
        }
        c.unwatchedTime = 0;
      } else {
        // Sight is interrupted (turned head away, covered eyes with camera viewfinder, or flash-blinded)
        c.state = 'STALKING';
        if (wasFrozen) {
          c.lookAwayCount = (c.lookAwayCount || 0) + 1;
          c.unwatchedTime = 0;
        }
        c.unwatchedTime = (c.unwatchedTime || 0) + dt;

        if (luredInVf) {
          // Camera body covers your naked eyes -> creature unfreezes and stalks straight toward the lens!
          if (c.offsetX) {
            const pull = Math.min(Math.abs(c.offsetX), 28 * dt);
            c.offsetX -= Math.sign(c.offsetX) * pull;
          }
        } else {
          // Lateral movement between pine trees when unwatched in a blindspot
          const latDir = c.lateralDir || 1;
          c.offsetX = (c.offsetX || 0) + latDir * 22 * dt;
          if (c.offsetX > 42) {
            c.offsetX = 42;
            c.lateralDir = -1;
          } else if (c.offsetX < -42) {
            c.offsetX = -42;
            c.lateralDir = 1;
          }

          // Window shifting when left unwatched at medium-to-far range
          c.shiftTimer = (c.shiftTimer !== undefined ? c.shiftTimer : 5.0) - dt;
          if (c.shiftTimer <= 0 && c.dist > 0.38) {
            c.dir = pickUnoccupiedWindow(c, state, ns);
            c.offsetX = Math.round((state.rng() - 0.5) * 32);
            const pan = c.dir === 'LEFT' ? -0.85 : c.dir === 'RIGHT' ? 0.85 : 0;
            state.events.push({ type: 'BRANCH_SNAP', pan, near: 1 - c.dist });
            c.shiftTimer = ns.shiftMin + state.rng() * ns.shiftSpan;
          }
        }

        // Pose-driven approach rhythm: deceptive slow WAIT -> explosive COIL -> point-blank LUNGE
        let poseMult = 1.0;
        if (c.dist <= cfg.lungeDist) {
          c.pose = 'LUNGE';
          poseMult = cfg.lungeMult;
        } else if ((c.pose || 'WAIT') === 'WAIT') {
          if ((c.lookAwayCount || 0) >= 2 || c.unwatchedTime >= 0.85 || c.dist < 0.62) {
            c.pose = 'COIL';
            poseMult = cfg.coilMult;
          } else {
            poseMult = cfg.waitMult;
          }
        } else {
          c.pose = 'COIL';
          poseMult = cfg.coilMult;
        }

        const stepDist = cfg.approachSpeed * ns.approachMult * (c.speedScale || 1.0) * poseMult * dt;
        c.dist = Math.max(0, c.dist - stepDist);
        if (c.dist <= cfg.lungeDist) c.pose = 'LUNGE';

        // Periodic crimson eye glint when lurking in darkness
        c.glintTimer = (c.glintTimer !== undefined ? c.glintTimer : 1.0) - dt;
        if (c.glintTimer <= 0) {
          c.glintTimer = 0.9 + c.dist * 0.9;
          c.glintVisible = 0.26;
        }

        // Stereo spatial audio cues (only emitted while moving — dead silent when frozen!)
        c.soundCooldown -= dt;
        if (c.soundCooldown <= 0) {
          c.soundCooldown = (luredInVf ? 0.65 : 1.25) + c.dist * 1.4;
          const pan = c.dir === 'LEFT' ? -0.85 : c.dir === 'RIGHT' ? 0.85 : 0;
          if (c.dist <= cfg.lungeDist) {
            state.events.push({ type: 'METAL_SCRATCH', pan, near: 1 - c.dist });
          } else {
            state.events.push({ type: 'FOOTSTEP', pan, near: 1 - c.dist });
          }
        }
      }

      if (!closestCreature || c.dist < closestCreature.dist) {
        closestCreature = c;
      }

      // Window breach -> instant game over
      if (c.dist <= 0) {
        state.phase = 'GAME_OVER';
        state.endReason = 'BREACH';
        state.breachDir = c.dir;
        state.events.push({ type: 'GLASS_SHATTER', dir: c.dir });
        return state;
      }
    }

    // 5. Continuous rain ambience & proximity-driven heartbeat
    cockpit.rainAmbienceTimer = (cockpit.rainAmbienceTimer !== undefined ? cockpit.rainAmbienceTimer : 0.25) - dt;
    if (cockpit.rainAmbienceTimer <= 0) {
      cockpit.rainAmbienceTimer = 0.45;
      state.events.push({ type: 'RAIN_AMBIENCE', intensity: ns.rainMult });
    }

    if (closestCreature && (closestCreature.dist < 0.82 || (cockpit.eyeStrain || 0) > 0.45)) {
      const effectiveDist = Math.max(0, closestCreature.dist - (cockpit.eyeStrain || 0) * 0.38);
      cockpit.heartbeatTimer = (cockpit.heartbeatTimer !== undefined ? cockpit.heartbeatTimer : 0.45) - dt;
      if (cockpit.heartbeatTimer <= 0) {
        cockpit.heartbeatTimer = Math.max(0.24, 0.19 + effectiveDist * 0.82);
        state.events.push({ type: 'HEARTBEAT', near: Number(clamp(1 - effectiveDist, 0.1, 1).toFixed(2)) });
      }
    }

    return state;
  }

  const API = {
    SCREEN_W,
    SCREEN_H,
    WORLD_W,
    MAX_PAN_X,
    DIR_WORLD_X,
    DEFAULTS,
    makeConfig,
    nightSettings,
    creatureWorldPos,
    creatureScreenRect,
    getViewfinderRect,
    isCreatureInViewCone,
    isCreatureGazed,
    gradePhoto,
    createGame,
    startNight,
    step,
  };

  root.Evidence16BitCore = API;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  }
})(typeof window !== 'undefined' ? window : globalThis);
