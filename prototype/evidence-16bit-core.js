/* EVIDENCE 1989: BLACK RAIN — 16-bit Core Simulation Engine (zero DOM dependencies). */
(function (root) {
  'use strict';

  const SCREEN_W = 320;
  const SCREEN_H = 240;
  const WORLD_W = 640;
  const MAX_PAN_X = WORLD_W - SCREEN_W; // 320

  // World X centers for each directional zone
  const DIR_WORLD_X = {
    LEFT: 95,
    FRONT: 320,
    RIGHT: 545,
    ROOF: 320,
  };

  const DEFAULTS = {
    panSpeed: 260,          // Horizontal head-turn speed (px/s)
    nightDuration: 90,      // Seconds per night (00:00 -> 05:00 AM)
    film: 4,                // Film exposures per night
    chargeTime: 2.5,        // Flash capacitor recharge time (s)
    blindTime: 1.0,         // Glass reflection whiteout blindness (s)
    approachSpeed: 0.055,   // Base creature approach rate (dist/s)
    retreatDist: 0.92,      // Creature distance after flash hit
    rainRate: 0.11,         // Front windshield rain buildup per second
    blurThreshold: 0.65,    // Rain blur above which front gaze is blocked
    wiperDrain: 0.5,        // Battery %/s when wipers are ON
    headlightDrain: 1.8,    // Battery %/s when headlights are ON
    radioDrain: 0.1,        // Passive radio battery %/s
    evidenceDist: 0.34,     // Max distance for EVIDENCE grade
    suspiciousDist: 0.65,   // Max distance for SUSPICIOUS grade
    vfW: 120,               // Camera viewfinder width (px)
    vfH: 96,                // Camera viewfinder height (px)
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
        title: 'NIGHT 1: THE STALKER',
        subtitle: '1989.11.03 - OREGON TIMBER ROAD',
        dirs: ['LEFT', 'FRONT', 'RIGHT'],
        creatureCount: 1,
        approachMult: 1.0,
        rainMult: 1.0,
        drainMult: 1.0,
        startBattery: 100,
        duration: cfg.nightDuration,
      };
    }
    if (n === 2) {
      return {
        number: 2,
        title: 'NIGHT 2: THE DOWNPOUR',
        subtitle: 'TORRENTIAL RAIN - WATCH THE ROOF',
        dirs: ['LEFT', 'FRONT', 'RIGHT', 'ROOF'],
        creatureCount: 1,
        approachMult: 1.28,
        rainMult: 1.8,
        drainMult: 1.1,
        startBattery: 100,
        duration: cfg.nightDuration,
      };
    }
    return {
      number: 3,
      title: 'NIGHT 3: BLACKOUT',
      subtitle: 'FAILING BATTERY - DOUBLE SHADOWS',
      dirs: ['LEFT', 'FRONT', 'RIGHT', 'ROOF'],
      creatureCount: 2,
      approachMult: 1.45,
      rainMult: 2.0,
      drainMult: 1.3,
      startBattery: 75,
      duration: cfg.nightDuration,
    };
  }

  function creatureWorldPos(c) {
    const base = DIR_WORLD_X[c.dir] || 320;
    return base + (c.offsetX || 0);
  }

  function creatureScreenRect(c, panX, lookUp) {
    const near = clamp(1 - c.dist, 0, 1);
    const worldX = creatureWorldPos(c);
    const screenX = worldX - panX;

    if (c.dir === 'ROOF') {
      const h = Math.round(24 + 76 * near);
      const w = Math.round(h * 0.85);
      const baseY = lookUp ? 84 : 26;
      return {
        x: Math.round(screenX - w / 2),
        y: Math.round(baseY - h * 0.4),
        w,
        h,
        eyeX: screenX,
        eyeY: Math.round(baseY),
      };
    }

    const minH = 22;
    const maxH = 142;
    const h = Math.round(minH + (maxH - minH) * near);
    const w = Math.round(h * 0.42);
    const horizonY = 102;
    const feetNearY = 186;
    const feetY = Math.round(horizonY + (feetNearY - horizonY) * near + (lookUp ? 28 : 0));
    const x = Math.round(screenX - w / 2);
    const y = feetY - h;
    return {
      x,
      y,
      w,
      h,
      eyeX: screenX,
      eyeY: Math.round(y + h * 0.16),
    };
  }

  function isCreatureGazed(c, state) {
    if (!c || !state) return false;
    const { cockpit, camera, cfg } = state;
    if (camera.blindTimer > 0) return false;

    if (c.dir === 'ROOF') {
      // Must be near center and looking up at the roof / rearview area
      const centered = cockpit.panX >= 90 && cockpit.panX <= 230;
      return Boolean(centered && cockpit.lookUp);
    }

    if (c.dir === 'FRONT') {
      // Blocked if rain blur exceeds threshold and headlights are not cutting through
      if (cockpit.rainBlur > cfg.blurThreshold && !cockpit.headlightsOn) {
        return false;
      }
    }

    const rect = creatureScreenRect(c, cockpit.panX, cockpit.lookUp);
    // Eye point must fall comfortably inside the 320px viewport margins
    const inHorizView = rect.eyeX >= 28 && rect.eyeX <= SCREEN_W - 28;
    if (!inHorizView) return false;

    // If headlights are on and creature is in FRONT, it can be frozen even at long range
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
    const y = state.cockpit.lookUp ? 28 : 54;
    return { x, y, w, h };
  }

  function gradePhoto(c, state) {
    if (!c) {
      return { grade: 'BLURRY', score: 0, fill: 0, completeness: 0, dir: 'NONE', dist: 1 };
    }
    const vf = getViewfinderRect(state);
    const rect = creatureScreenRect(c, state.cockpit.panX, state.cockpit.lookUp);
    const area = rect.w * rect.h;
    const completeness = area > 0 ? overlapArea(vf, rect) / area : 0;
    const fill = clamp(1 - c.dist, 0, 1);

    // If front window is blurred, photo quality degrades severely
    const blurPenalty = (c.dir === 'FRONT' && state.cockpit.rainBlur > state.cfg.blurThreshold) ? 0.35 : 1.0;
    const rawScore = (fill * 0.65 + completeness * 0.35) * blurPenalty;
    const score = Math.round(clamp(rawScore * 100, 0, 100));

    let grade = 'BLURRY';
    if (c.dist <= state.cfg.evidenceDist && completeness >= 0.55 && blurPenalty === 1.0) {
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
    };
  }

  function spawnCreature(id, ns, rng, forceDir) {
    const dirs = ns.dirs;
    const dir = forceDir || dirs[Math.floor(rng() * dirs.length)];
    const offsetX = dir === 'ROOF' ? 0 : Math.round((rng() - 0.5) * 36);
    return {
      id,
      dir,
      dist: Number((0.78 + rng() * 0.18).toFixed(3)),
      offsetX,
      state: 'STALKING',
      glintTimer: 0.8 + rng() * 0.8,
      soundCooldown: 1.2 + rng() * 1.5,
      feint: false,
    };
  }

  function createGame(config, seed) {
    const cfg = config || makeConfig();
    const rng = mulberry32(seed || 1989);
    const state = {
      cfg,
      rng,
      phase: 'TITLE', // TITLE | NIGHT_INTRO | PLAYING | NIGHT_SUMMARY | GAME_OVER | VICTORY
      endReason: null,
      events: [],
      cockpit: {
        panX: 160,
        lookUp: false,
        vfActive: false,
        battery: 100,
        wipersOn: false,
        wiperPhase: 0,
        rainBlur: 0.1,
        headlightsOn: false,
        headlightAgitation: 0,
        radioPan: 0,
        radioIntensity: 0.1,
        blackout: false,
        lightningTimer: 4.5,
        lightningFlash: 0,
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
      night: {
        number: 1,
        title: '',
        subtitle: '',
        timeElapsed: 0,
        duration: cfg.nightDuration,
        evidenceCount: 0,
      },
    };
    return state;
  }

  function startNight(state, nightNum) {
    const ns = nightSettings(nightNum, state.cfg);
    state.phase = 'PLAYING';
    state.endReason = null;
    state.events = [];

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
    state.cockpit.lookUp = false;
    state.cockpit.vfActive = false;
    state.cockpit.battery = ns.startBattery;
    state.cockpit.wipersOn = false;
    state.cockpit.wiperPhase = 0;
    state.cockpit.rainBlur = 0.08;
    state.cockpit.headlightsOn = false;
    state.cockpit.headlightAgitation = 0;
    state.cockpit.radioPan = 0;
    state.cockpit.radioIntensity = 0.1;
    state.cockpit.blackout = false;
    state.cockpit.lightningTimer = 3.0 + state.rng() * 4.0;
    state.cockpit.lightningFlash = 0;

    state.camera.filmLeft = state.cfg.film;
    state.camera.chargeTimer = 0;
    state.camera.blindTimer = 0;
    state.camera.lastPhoto = null;
    state.camera.photoPopupTimer = 0;

    state.creatures = [];
    const firstDirs = ['FRONT', 'LEFT', 'RIGHT'];
    const d0 = firstDirs[Math.floor(state.rng() * firstDirs.length)];
    state.creatures.push(spawnCreature(1, ns, state.rng, d0));

    if (ns.creatureCount >= 2) {
      const otherDirs = ns.dirs.filter((d) => d !== d0);
      const d1 = otherDirs[Math.floor(state.rng() * otherDirs.length)] || 'LEFT';
      const second = spawnCreature(2, ns, state.rng, d1);
      second.dist = 0.92;
      state.creatures.push(second);
    }

    return state;
  }

  function relocateCreature(c, state) {
    const ns = state.night.settings || nightSettings(state.night.number, state.cfg);
    const dirs = ns.dirs;
    // Pick a new direction, avoiding current direction if possible
    const candidates = dirs.filter((d) => d !== c.dir);
    const nextDir = candidates.length > 0
      ? candidates[Math.floor(state.rng() * candidates.length)]
      : dirs[0];
    c.dir = nextDir;
    c.dist = state.cfg.retreatDist;
    c.offsetX = nextDir === 'ROOF' ? 0 : Math.round((state.rng() - 0.5) * 36);
    c.state = 'STALKING';
  }

  function handleShutter(state) {
    const { camera, cockpit, cfg } = state;
    if (camera.filmLeft <= 0 || camera.chargeTimer > 0) return false;

    camera.filmLeft -= 1;
    camera.chargeTimer = cfg.chargeTime;
    camera.blindTimer = cfg.blindTime;
    camera.photoPopupTimer = 3.2;
    state.events.push({ type: 'SHUTTER_BLAST' });

    // Evaluate photo against the most prominent creature in view
    const vf = getViewfinderRect(state);
    let bestCreature = null;
    let bestGradeObj = { grade: 'BLURRY', score: 0, fill: 0, completeness: 0, dir: 'NONE', dist: 1 };

    for (const c of state.creatures) {
      const rect = creatureScreenRect(c, cockpit.panX, cockpit.lookUp);
      const ov = overlapArea(vf, rect);
      if (ov > 0) {
        const g = gradePhoto(c, state);
        if (!bestCreature || g.score >= bestGradeObj.score) {
          bestCreature = c;
          bestGradeObj = g;
        }
      }
    }

    // Any creature visible in the current window gets pushed back by the flash!
    for (const c of state.creatures) {
      const rect = creatureScreenRect(c, cockpit.panX, cockpit.lookUp);
      const onScreen = rect.eyeX >= 0 && rect.eyeX <= SCREEN_W;
      const roofMatch = (c.dir === 'ROOF') === Boolean(cockpit.lookUp);
      if (onScreen && roofMatch) {
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

    // 1. Head panning and lookUp
    if (inp.left && !inp.right) {
      cockpit.panX = clamp(cockpit.panX - cfg.panSpeed * dt, 0, MAX_PAN_X);
    } else if (inp.right && !inp.left) {
      cockpit.panX = clamp(cockpit.panX + cfg.panSpeed * dt, 0, MAX_PAN_X);
    }

    if (inp.lookUp !== undefined) {
      cockpit.lookUp = Boolean(inp.lookUp);
    }
    if (inp.aim !== undefined) {
      cockpit.vfActive = Boolean(inp.aim);
    }

    // 2. Toggle switches (if battery > 0)
    if (!cockpit.blackout) {
      if (inp.toggleWipers) {
        cockpit.wipersOn = !cockpit.wipersOn;
        state.events.push({ type: 'SWITCH_CLICK' });
      }
      if (inp.toggleHeadlights) {
        cockpit.headlightsOn = !cockpit.headlightsOn;
        state.events.push({ type: 'SWITCH_CLICK' });
      }
    }

    // 3. Battery consumption
    if (cockpit.battery > 0) {
      let drain = cfg.radioDrain;
      if (cockpit.wipersOn) drain += cfg.wiperDrain;
      if (cockpit.headlightsOn) drain += cfg.headlightDrain;
      cockpit.battery = Math.max(0, cockpit.battery - drain * ns.drainMult * dt);
      if (cockpit.battery === 0) {
        cockpit.wipersOn = false;
        cockpit.headlightsOn = false;
        cockpit.blackout = true;
        state.events.push({ type: 'BLACKOUT' });
      }
    }

    // 4. Windshield rain & wipers
    if (cockpit.wipersOn && !cockpit.blackout) {
      const prevCycle = Math.floor(cockpit.wiperPhase);
      cockpit.wiperPhase += dt / 1.2;
      if (Math.floor(cockpit.wiperPhase) > prevCycle) {
        state.events.push({ type: 'WIPER_SWEEP' });
      }
      cockpit.rainBlur = Math.max(0.05, cockpit.rainBlur - 0.65 * dt);
    } else {
      cockpit.rainBlur = clamp(cockpit.rainBlur + cfg.rainRate * ns.rainMult * dt, 0, 1);
    }

    // 5. Lightning ambience
    cockpit.lightningTimer -= dt;
    if (cockpit.lightningTimer <= 0) {
      cockpit.lightningFlash = 0.35;
      cockpit.lightningTimer = 5.0 + state.rng() * 7.0;
    } else if (cockpit.lightningFlash > 0) {
      cockpit.lightningFlash = Math.max(0, cockpit.lightningFlash - dt);
    }

    // 6. Camera timers & Shutter trigger
    if (camera.chargeTimer > 0) {
      camera.chargeTimer = Math.max(0, camera.chargeTimer - dt);
    }
    if (camera.blindTimer > 0) {
      camera.blindTimer = Math.max(0, camera.blindTimer - dt);
    }
    if (camera.photoPopupTimer > 0) {
      camera.photoPopupTimer = Math.max(0, camera.photoPopupTimer - dt);
    }

    if (inp.shoot && cockpit.vfActive) {
      handleShutter(state);
    }

    // Check if out of film with 0 evidence after taking the last shot
    if (camera.filmLeft === 0 && night.evidenceCount === 0 && camera.blindTimer === 0) {
      state.phase = 'GAME_OVER';
      state.endReason = 'OUT_OF_FILM';
      return state;
    }

    // 7. Creature AI & Radio Radar calculation
    let closestCreature = null;
    for (const c of state.creatures) {
      const gazed = isCreatureGazed(c, state);

      // Headlights agitation: if headlights are left on, FRONT creature may flank to LEFT or RIGHT
      if (cockpit.headlightsOn && c.dir === 'FRONT' && c.dist > 0.35) {
        cockpit.headlightAgitation += dt;
        if (cockpit.headlightAgitation > 3.5) {
          cockpit.headlightAgitation = 0;
          c.dir = state.rng() < 0.5 ? 'LEFT' : 'RIGHT';
          c.dist = Math.max(0.45, c.dist - 0.1);
        }
      }

      if (gazed) {
        c.state = 'FROZEN';
      } else {
        c.state = 'STALKING';
        const flankBoost = (cockpit.headlightsOn && (c.dir === 'LEFT' || c.dir === 'RIGHT')) ? 1.25 : 1.0;
        const stepDist = cfg.approachSpeed * ns.approachMult * flankBoost * dt;
        c.dist = Math.max(0, c.dist - stepDist);

        c.soundCooldown -= dt;
        if (c.soundCooldown <= 0) {
          c.soundCooldown = 1.4 + c.dist * 1.8;
          const pan = c.dir === 'LEFT' ? -0.85 : c.dir === 'RIGHT' ? 0.85 : 0;
          if (c.dir === 'ROOF') {
            state.events.push({ type: 'ROOF_THUD', near: 1 - c.dist });
          } else if (c.dist < 0.45) {
            state.events.push({ type: 'METAL_SCRATCH', pan, near: 1 - c.dist });
          } else {
            state.events.push({ type: 'FOOTSTEP', pan, near: 1 - c.dist });
          }
        }
      }

      if (!closestCreature || c.dist < closestCreature.dist) {
        closestCreature = c;
      }

      // Check window breach
      if (c.dist <= 0) {
        state.phase = 'GAME_OVER';
        state.endReason = 'BREACH';
        state.breachDir = c.dir;
        state.events.push({ type: 'GLASS_SHATTER', dir: c.dir });
        return state;
      }
    }

    // Update paranormal AM radio radar
    if (closestCreature && !cockpit.blackout) {
      const targetPan = closestCreature.dir === 'LEFT' ? -0.9 : closestCreature.dir === 'RIGHT' ? 0.9 : 0;
      cockpit.radioPan = targetPan;
      cockpit.radioIntensity = clamp(1 - closestCreature.dist, 0.12, 1.0);
    } else {
      cockpit.radioPan = 0;
      cockpit.radioIntensity = 0;
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
