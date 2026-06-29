// ============================================================
// Tardigradia 2.0 — Biome Engine
// Main canvas render loop, camera, creature management.
// ============================================================

const BiomeEngine = (() => {

  // ── STATE ────────────────────────────────────────────────────
  let biomeCanvas   = null;
  let trailCanvas   = null;
  let ctx           = null;
  let trailCtx      = null;
  let creatures     = [];
  let params        = {};
  let _running      = false;
  let _raf          = null;
  let _lastTime     = 0;
  let _time         = 0;       // cumulative ms for physics
  let _demonOrigin  = null;    // {x,y,timer} Dictyostelium aggregation event

  // Image cache: species key → HTMLImageElement
  const imgCache = new Map();

  // ── CAMERA ───────────────────────────────────────────────────
  const camera = {
    x: Physics.WORLD_W / 2,
    y: Physics.WORLD_H / 2,
    zoom: 1,
    rotation: 0,
    targetZoom: 1,
    targetX: Physics.WORLD_W / 2,
    targetY: Physics.WORLD_H / 2,
    targetRotation: 0,
  };

  function _lerpCamera(dt) {
    const k = 1 - Math.pow(0.01, dt);
    camera.x        += (camera.targetX        - camera.x)        * k;
    camera.y        += (camera.targetY        - camera.y)        * k;
    camera.zoom     += (camera.targetZoom     - camera.zoom)     * k;
    camera.rotation += (camera.targetRotation - camera.rotation) * k;
  }

  function _applyCameraTransform() {
    const vw = biomeCanvas.width  / 2;
    const vh = biomeCanvas.height / 2;
    ctx.translate(vw, vh);
    ctx.rotate(camera.rotation);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
  }

  // ── IMAGE PRELOADING ─────────────────────────────────────────
  function _preloadImages() {
    const catalog = window.SpeciesData.SPECIES_CATALOG;
    // Derive an icon URL from the imageDir by using first image pattern
    // We construct: imageDir + '/' + speciesDir + 'Gemini_' + hash + '_icon.png'
    // Since we don't have exact filenames, we'll use a generated fallback pattern
    // and let creatures draw coloured circles until images load.
    // Icon PNGs are same path as JPGs but with _icon suffix before extension.
    for (const sp of catalog) {
      const dir = sp.imageDir;
      // The original movingIcons.js converts: url.replace(/\.(jpg|jpeg)$/i, '_icon.png')
      // We mirror that pattern. Since we need actual filenames, we rely on
      // the data_creatures.js picture array. We attach the first icon url here.
      sp._iconSrc = null;  // Will be set when data_creatures.js data is available
    }
    _resolveIconsFromData();
  }

  function _resolveIconsFromData() {
    // data_creatures.js exposes window.data — read first picture URL per creature
    // and build the _icon.png variant
    if (!window.data || !window.data.phyla) return;
    const catalog = window.SpeciesData.SPECIES_CATALOG;
    for (const phylum of window.data.phyla) {
      for (const c of phylum.creatures) {
        const cname = c.name.trim().toLowerCase().replace(/\s+/g, '_');
        // Find matching species by imageDir substring
        const sp = catalog.find(s =>
          s.imageDir && c.pictures && c.pictures[0] &&
          c.pictures[0].url.toLowerCase().includes(
            s.imageDir.split('/').pop().toLowerCase()
          )
        );
        if (sp && c.pictures && c.pictures.length > 0) {
          const firstUrl = c.pictures[0].url;
          sp._iconSrc = firstUrl.replace(/\.(jpg|jpeg)$/i, '_icon.png');
          // Preload
          if (!imgCache.has(sp.key)) {
            const img = new Image();
            img.src = sp._iconSrc;
            img.onload = () => imgCache.set(sp.key, img);
            img.onerror = () => {
              // Try .png without _icon as fallback
              const fallback = new Image();
              fallback.src = firstUrl.replace(/\.(jpg|jpeg)$/i, '.png');
              fallback.onload = () => imgCache.set(sp.key, fallback);
            };
            imgCache.set(sp.key, img);
          }
        }
      }
    }
  }

  // ── INIT ─────────────────────────────────────────────────────
  function init(initParams) {
    params = { ...initParams };

    biomeCanvas = document.getElementById('biome-canvas');
    trailCanvas = document.getElementById('trail-canvas');
    ctx         = biomeCanvas.getContext('2d');
    trailCtx    = trailCanvas.getContext('2d');

    _resize();
    window.addEventListener('resize', _resize);

    // Make imgCache available to Creature
    BiomeEngine.imgCache = imgCache;
    _preloadImages();

    Ecosystem.initGrid();
    _spawnInitialPopulation();

    // Click-to-select creature
    biomeCanvas.addEventListener('click', _handleClick);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') PovCamera.exit();
    });

    _running = true;
    _lastTime = performance.now();
    _raf = requestAnimationFrame(_loop);

    _logEvent('[BIOME] Universe initialized — Tardigradia 2.0');
    _logEvent('[BIOME] ' + creatures.length + ' organisms spawned');
  }

  function _resize() {
    biomeCanvas.width  = window.innerWidth;
    biomeCanvas.height = window.innerHeight;
    trailCanvas.width  = window.innerWidth;
    trailCanvas.height = window.innerHeight;
    // Set world-to-viewport scale so world fits screen
    const scaleX = window.innerWidth  / Physics.WORLD_W;
    const scaleY = window.innerHeight / Physics.WORLD_H;
    const baseZoom = Math.min(scaleX, scaleY) * 0.95;
    camera.zoom = camera.targetZoom = baseZoom;
    camera.x = camera.targetX = Physics.WORLD_W / 2;
    camera.y = camera.targetY = Physics.WORLD_H / 2;
  }

  // ── SPAWN ─────────────────────────────────────────────────────
  function _spawnInitialPopulation() {
    const catalog = window.SpeciesData.SPECIES_CATALOG;
    const groups  = window.SpeciesData.SPECIES_GROUPS;
    const CAP     = window.SpeciesData.RESOLUTION_CAPS[params.resolution];
    const maxPop  = CAP ? CAP.maxCreatures : 380;

    for (const sp of catalog) {
      const groupDef  = groups[sp.group];
      const requested = params[sp.group] || (groupDef ? groupDef.defaultCount : 10);
      // Distribute evenly among species in the group
      const groupSize = catalog.filter(s => s.group === sp.group).length;
      const count     = Math.max(1, Math.round((requested / groupSize) * sp.targetRatio * 6));
      const cap       = Math.round(maxPop * sp.targetRatio * 2);
      const n         = Math.min(count, cap);

      for (let i = 0; i < n; i++) {
        const x = Math.random() * Physics.WORLD_W;
        const y = Math.random() * Physics.WORLD_H;
        creatures.push(new Creature(sp, x, y));
      }
    }
  }

  function spawnCreature(speciesKey, count) {
    const sp = window.SpeciesData.SPECIES_CATALOG.find(s => s.key === speciesKey);
    if (!sp) return;
    for (let i = 0; i < (count || 1); i++) {
      const x = Math.random() * Physics.WORLD_W;
      const y = Math.random() * Physics.WORLD_H;
      creatures.push(new Creature(sp, x, y));
    }
  }

  function removeCreatures(speciesKey, count) {
    let removed = 0;
    for (let i = creatures.length - 1; i >= 0 && removed < count; i--) {
      if (creatures[i].alive && creatures[i].key === speciesKey) {
        creatures[i].die();
        removed++;
      }
    }
  }

  // ── MAIN LOOP ─────────────────────────────────────────────────
  function _loop(timestamp) {
    if (!_running) return;
    _raf = requestAnimationFrame(_loop);

    let dt = Math.min((timestamp - _lastTime) / 1000, 0.05);
    _lastTime = timestamp;
    _time     += dt * 1000;

    // ─ apply random manipulation if toggled ─
    _applyRandomManipulation(dt);

    // ─ update demon event timer ─
    if (_demonOrigin) {
      _demonOrigin.timer -= dt;
      if (_demonOrigin.timer <= 0) _demonOrigin = null;
    }

    // ─ grid regeneration ─
    Ecosystem.regenerateGrid(dt, params.resourceRegen || 1);

    // ─ build spatial partition (simple grid for neighbor lookup) ─
    const partGrid = _buildPartition();

    // ─ update all creatures ─
    const newBorn = [];
    const resources = { harvest: Ecosystem.harvestNutrient };

    for (const c of creatures) {
      if (!c.alive && !c._decomposing) continue;
      if (!c.alive) {
        // tick corpse
        c._decomposeTimer -= dt;
        if (c._decomposeTimer <= 0) c._decomposing = false;
        continue;
      }

      const neighbors = _getNeighbors(partGrid, c);
      c.update(dt, neighbors, params, resources, { time: _time, demonOrigin: _demonOrigin });

      // Try eating nearby creatures
      for (const n of neighbors) {
        if (Ecosystem.tryEat(c, n, params)) {
          _sparkAt(c.x, c.y, c.species.color);
          break;
        }
      }

      // Reproduction
      if (c.energy >= c.species.reproduceEnergy && c._reproduceCooldown <= 0) {
        const child = c.reproduce();
        if (child) {
          newBorn.push(child);
          _sparkAt(c.x, c.y, '#a855f7');
        }
      }
    }

    // ─ add newborn, auto-balance, prune dead ─
    creatures.push(...newBorn);
    const balanced = Ecosystem.tickBalance(dt, creatures, params);
    creatures.push(...balanced);
    creatures = creatures.filter(c => c.alive || c._decomposing);

    // ─ render ─
    _render(dt);

    // ─ update HUD ─
    if (window.HUD && window.HUD.tick) {
      const metrics = Ecosystem.computeMetrics(creatures, params);
      HUD.tick({ creatures, metrics, time: _time, params });
    }

    // ─ update POV camera target ─
    if (window.PovCamera && PovCamera.isActive()) {
      PovCamera.update(camera, creatures);
    }
  }

  // ── SPATIAL PARTITION ─────────────────────────────────────────
  const PART_CELL = 120;
  function _buildPartition() {
    const map = new Map();
    for (const c of creatures) {
      if (!c.alive) continue;
      const key = `${Math.floor(c.x / PART_CELL)},${Math.floor(c.y / PART_CELL)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return map;
  }

  function _getNeighbors(map, c) {
    const cx = Math.floor(c.x / PART_CELL);
    const cy = Math.floor(c.y / PART_CELL);
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = map.get(`${cx + dx},${cy + dy}`);
        if (cell) {
          for (const n of cell) {
            if (n !== c && n.alive) out.push(n);
          }
        }
      }
    }
    return out;
  }

  // ── RENDER ─────────────────────────────────────────────────────
  function _render(dt) {
    // ─ trail canvas: fade previous frame ─
    const CAP = window.SpeciesData.RESOLUTION_CAPS[params.resolution] || {};
    if (params.trailsOn && CAP.trailLength > 0) {
      trailCtx.fillStyle = 'rgba(0,0,2,0.08)';
      trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
    } else {
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    }

    // ─ main canvas: clear ─
    ctx.clearRect(0, 0, biomeCanvas.width, biomeCanvas.height);

    // ─ camera lerp ─
    _lerpCamera(dt);

    ctx.save();
    _applyCameraTransform();

    // ─ draw nutrient field (faint fertility overlay) ─
    _drawNutrientField();

    // ─ draw fluid flow arrows (low density hints) ─
    _drawFlowHints();

    // ─ draw trails (paint living creature positions on trail canvas) ─
    if (params.trailsOn && CAP.trailLength > 0) {
      _drawTrails();
    }

    // ─ draw creatures ─
    const highlighted = window.PovCamera ? PovCamera.getTrackedCreature() : null;
    for (const c of creatures) {
      c.draw(ctx, { ...params, glowEffects: CAP.glowEffects }, c === highlighted);
    }

    ctx.restore();

    // ─ draw POV frame overlay ─
    if (window.PovCamera && PovCamera.isActive()) {
      _drawPovOverlay();
    }
  }

  function _drawNutrientField() {
    const grid = Ecosystem.getGrid();
    if (!grid) return;
    const GRID_W = 50, GRID_H = 33;
    const tw = Physics.WORLD_W / GRID_W, th = Physics.WORLD_H / GRID_H;
    ctx.save();
    ctx.globalAlpha = 0.055;
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const v = grid[ty * GRID_W + tx] / 100;
        const g = Math.floor(30 + v * 55);
        ctx.fillStyle = `rgb(0,${g},${Math.floor(15 + v * 30)})`;
        ctx.fillRect(tx * tw, ty * th, tw, th);
      }
    }
    ctx.restore();
  }

  function _drawFlowHints() {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 6]);
    const step = 120;
    const t    = _time;
    for (let x = 0; x < Physics.WORLD_W; x += step) {
      for (let y = 0; y < Physics.WORLD_H; y += step) {
        const { vx, vy } = Physics.curlNoise(x, y, t);
        const len = 18;
        const ang = Math.atan2(vy, vx);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function _drawTrails() {
    trailCtx.save();
    trailCtx.setTransform(
      camera.zoom,  0,
      0, camera.zoom,
      biomeCanvas.width  / 2 - camera.x * camera.zoom,
      biomeCanvas.height / 2 - camera.y * camera.zoom
    );
    for (const c of creatures) {
      if (!c.alive) continue;
      trailCtx.beginPath();
      trailCtx.arc(c.x, c.y, c.species.size * 0.35, 0, Math.PI * 2);
      trailCtx.fillStyle = c.species.color;
      trailCtx.globalAlpha = 0.45;
      trailCtx.fill();
    }
    trailCtx.restore();
  }

  function _drawPovOverlay() {
    // Vignette ring around screen for immersion
    const w = biomeCanvas.width, h = biomeCanvas.height;
    const grad = ctx.createRadialGradient(w/2, h/2, h * 0.25, w/2, h/2, h * 0.75);
    grad.addColorStop(0,   'rgba(0,0,0,0)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0)');
    grad.addColorStop(1,   'rgba(0,0,8,0.75)');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // ── CLICK HANDLER ─────────────────────────────────────────────
  function _handleClick(e) {
    const rect = biomeCanvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    // Convert screen → world coordinates
    const cos = Math.cos(-camera.rotation), sin = Math.sin(-camera.rotation);
    const cx  = (mx - biomeCanvas.width  / 2) / camera.zoom;
    const cy  = (my - biomeCanvas.height / 2) / camera.zoom;
    const wx  = camera.x + cx * cos - cy * sin;
    const wy  = camera.y + cx * sin + cy * cos;

    // Find closest living creature within clickable radius
    let best = null, bestDist = 40 / camera.zoom;
    for (const c of creatures) {
      if (!c.alive) continue;
      const d = Math.hypot(c.x - wx, c.y - wy);
      if (d < bestDist) { bestDist = d; best = c; }
    }

    if (window.PovCamera) {
      if (best && best !== PovCamera.getTrackedCreature()) {
        PovCamera.trackCreature(best, camera);
      } else {
        PovCamera.exit();
      }
    }
  }

  // ── SPARK VISUAL ──────────────────────────────────────────────
  function _sparkAt(wx, wy, color) {
    // Convert world → screen
    const cx = (wx - camera.x) * camera.zoom + biomeCanvas.width  / 2;
    const cy = (wy - camera.y) * camera.zoom + biomeCanvas.height / 2;
    const spark = document.createElement('div');
    spark.className = 'biome-spark';
    spark.style.cssText = `
      left:${cx - 6}px; top:${cy - 6}px;
      width:12px; height:12px;
      background:${color};
    `;
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 600);
  }

  // ── EVENT LOG ─────────────────────────────────────────────────
  const _eventLog = [];
  function _logEvent(msg) {
    const t = new Date().toTimeString().slice(0, 8);
    _eventLog.unshift(`[${t}] ${msg}`);
    if (_eventLog.length > 30) _eventLog.pop();
    if (window.HUD && HUD.appendLog) HUD.appendLog(msg);
  }

  // ── TGPU-STYLE EVENT ACTIONS ───────────────────────────────────
  function perturb() {
    Ecosystem.triggerPerturb(creatures);
    _logEvent('[PERTURB] Field entropy spike — all worldlines randomized');
    window.BiomeBenevolenceChart && window.BiomeBenevolenceChart.flashBloom();
  }

  function triggerFusion() {
    const newOnes = Ecosystem.triggerFusion(creatures);
    creatures.push(...newOnes);
    _logEvent('[FUSION] Mass reproduction event — ' + newOnes.length + ' offspring spawned');
  }

  function triggerDemon() {
    _demonOrigin = Ecosystem.triggerDemon(creatures);
    if (_demonOrigin) {
      _logEvent('[DEMON] Pheromone wave active — Dictyostelium aggregating (8s)');
    }
  }

  function toggleTrails() {
    params.trailsOn = !params.trailsOn;
    if (!params.trailsOn) trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    _logEvent('[TRAILS] ' + (params.trailsOn ? 'Bioluminescent trails ON' : 'Trails OFF'));
  }

  function setResolution(res) {
    params.resolution = res;
    const CAP = window.SpeciesData.RESOLUTION_CAPS[res];
    if (CAP) {
      if (!CAP.trailLength) { trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height); }
      _logEvent('[RES] Resolution set to ' + res.toUpperCase() + ' (' + CAP.maxCreatures + ' max creatures)');
    }
  }

  function setParam(key, value) {
    params[key] = value;
  }

  // ── RANDOM MANIPULATION ───────────────────────────────────────
  const _randStartTime = performance.now();
  const _randState = {};

  function _applyRandomManipulation(dt) {
    const t = (performance.now() - _randStartTime) * 0.001;
    const randParams = ['larmorFreq', 'fluidViscosity', 'resourceRegen', 'coherence'];
    for (const key of randParams) {
      if (!params['randomToggle_' + key]) continue;
      if (!_randState[key]) {
        _randState[key] = { freq: 0.05 + Math.random() * 0.25, phase: Math.random() * Math.PI * 2, base: params[key] };
      }
      const rs = _randState[key];
      const raw = rs.base + Math.sin(t * rs.freq * Math.PI * 2 + rs.phase) * rs.base * 0.5;
      const sp  = window.SpeciesData.SPECIES_GROUPS;
      // Clamp to valid parameter range
      if (key === 'larmorFreq')      params[key] = Math.max(0.1, Math.min(4.0, raw));
      else if (key === 'coherence')  params[key] = Math.max(0.0, Math.min(1.0, raw));
      else                           params[key] = Math.max(0.1, Math.min(5.0, raw));
    }
  }

  // ── SERIALISE STATE ──────────────────────────────────────────
  function getState() {
    return {
      version: '2.0',
      timestamp: Date.now(),
      params: { ...params },
      camera: { ...camera },
      creatures: creatures.filter(c => c.alive).map(c => c.toJSON()),
    };
  }

  function loadState(state) {
    if (!state || state.version !== '2.0') return false;
    params = { ...state.params };
    Object.assign(camera, state.camera);
    creatures = [];
    for (const d of state.creatures) {
      const c = Creature.fromJSON(d);
      if (c) {
        const cached = imgCache.get(c.key);
        if (cached) c.imgEl = cached;
        creatures.push(c);
      }
    }
    _logEvent('[LOAD] Saved biome restored — ' + creatures.length + ' organisms');
    return true;
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return {
    init,
    imgCache,
    creatures: () => creatures,
    camera,
    params: () => params,
    setParam,
    spawnCreature,
    removeCreatures,
    perturb,
    triggerFusion,
    triggerDemon,
    toggleTrails,
    setResolution,
    getState,
    loadState,
    logEvent: _logEvent,
    getEventLog: () => _eventLog,
  };

})();

window.BiomeEngine = BiomeEngine;
