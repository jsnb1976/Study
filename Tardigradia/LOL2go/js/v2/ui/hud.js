// ============================================================
// Tardigradia 2.0 — HUD Controller
// Features: A (slide-away menus), D (population controls),
// G (random manipulation toggles), H (resolution mid-sim).
// Also hosts the Benevolence monitor chart (TGPU-style).
// ============================================================

const HUD = (() => {

  let _chartCtx    = null;
  let _chart       = null;
  let _chartData   = { action: [], benevolence: [], coherence: [] };
  const CHART_LEN  = 40;

  let _allHidden   = false;
  let _params      = {};

  // ── INIT ────────────────────────────────────────────────────
  function init(startParams) {
    _params = startParams ? { ...startParams } : (BiomeEngine.params ? BiomeEngine.params() : {});
    _buildPanels();
    _buildMasterToggle();
    _buildPullTabs();
    _initChart();
  }

  // ── BUILD PANELS ────────────────────────────────────────────
  function _buildPanels() {
    _buildTopPanel();
    _buildLeftPanel();
    _buildRightPanel();
  }

  // TOP: status bar (live metrics, cycle, species count)
  function _buildTopPanel() {
    const p = document.createElement('div');
    p.id        = 'hud-top';
    p.className = 'hud-panel';
    p.innerHTML = `
      <div class="hud-header" style="color:#38bdf8">
        TARDIGRADIA 2.0
        <button class="panel-collapse-btn" onclick="HUD.togglePanel('hud-top')">▲</button>
      </div>
      <div class="hud-body" style="display:flex; gap:28px; padding:5px 12px">
        <div class="hud-row"><span class="hud-label">Organisms</span>
          <span class="hud-value" id="hud-total-pop">—</span></div>
        <div class="hud-row"><span class="hud-label">Action</span>
          <span class="hud-value" id="hud-action">—</span></div>
        <div class="hud-row"><span class="hud-label">Benevolence</span>
          <span class="hud-value" id="hud-benevolence">—</span></div>
        <div class="hud-row"><span class="hud-label">Coherence</span>
          <span class="hud-value" id="hud-coherence">—</span></div>
        <div class="hud-row"><span class="hud-label">Ecosystem</span>
          <span class="hud-value" id="hud-eco">STABLE</span></div>
      </div>`;
    document.body.appendChild(p);
  }

  // LEFT: event log + population breakdown
  function _buildLeftPanel() {
    const p = document.createElement('div');
    p.id        = 'hud-left';
    p.className = 'hud-panel';
    p.style.cssText = 'bottom:12px; left:12px; width:240px;';
    p.innerHTML = `
      <div class="hud-header" style="color:#a855f7">
        ECOSYSTEM LOG
        <button class="panel-collapse-btn" onclick="HUD.togglePanel('hud-left')">◀</button>
      </div>
      <div class="hud-body">
        <ul class="hud-log" id="event-log"></ul>
        <div style="border-top:1px solid rgba(56,189,248,0.1); margin-top:6px; padding-top:6px">
          ${_buildPopSummaryRows()}
        </div>
      </div>`;
    document.body.appendChild(p);
  }

  function _buildPopSummaryRows() {
    const groups = window.SpeciesData.SPECIES_GROUPS;
    return Object.entries(groups).map(([key, g]) =>
      `<div class="hud-row">
        <span class="hud-label">${g.label}</span>
        <span class="hud-value" id="hud-pop-${key}">—</span>
      </div>`
    ).join('');
  }

  // RIGHT: controls (speed, density, population adjust, event buttons, chart)
  function _buildRightPanel() {
    const p = document.createElement('div');
    p.id        = 'hud-right';
    p.className = 'hud-panel';
    p.style.cssText = 'bottom:12px; right:12px; width:268px;';
    p.innerHTML = `
      <div class="hud-header" style="color:#10b981">
        SIMULATION CONTROLS
        <button class="panel-collapse-btn" onclick="HUD.togglePanel('hud-right')">▶</button>
      </div>
      <div class="hud-body">
        <!-- TGPU-mapped sliders -->
        ${_buildControlSlider('larmorFreq',     'Larmor Freq',     0.1, 4.0, 0.1, '×')}
        ${_buildControlSlider('fluidViscosity', 'Viscosity',       0.1, 2.0, 0.05,'')}
        ${_buildControlSlider('resourceRegen',  'Resource Regen',  0.1, 5.0, 0.1, '×')}
        ${_buildControlSlider('coherence',      'Flock Cohesion',  0.0, 1.0, 0.05,'')}

        <!-- Event buttons (TGPU-style) -->
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin:8px 0">
          <button class="hud-btn hud-btn-red"    onclick="BiomeEngine.perturb()">Perturb</button>
          <button class="hud-btn hud-btn-purple" onclick="BiomeEngine.toggleTrails()">Trails</button>
          <button class="hud-btn hud-btn-yellow" onclick="BiomeEngine.triggerDemon()">Pheromone!</button>
          <button class="hud-btn hud-btn-green"  onclick="BiomeEngine.triggerFusion()">Fusion</button>
        </div>

        <!-- Resolution -->
        <div class="hud-row" style="margin-bottom:4px">
          <span class="hud-label">Resolution</span>
          <select id="hud-res-select" style="background:#0f172a;color:#38bdf8;border:1px solid #1e3a5f;border-radius:4px;font-size:11px;padding:2px 4px">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <!-- Population per group -->
        <div style="border-top:1px solid rgba(56,189,248,0.1); margin-top:6px; padding-top:6px">
          <div style="font-family:Orbitron,sans-serif; font-size:0.62rem; color:#38bdf8; 
               letter-spacing:0.1em; margin-bottom:6px">POPULATION ADJUST</div>
          ${_buildPopRows()}
        </div>

        <!-- Save / Load -->
        <div style="display:flex; gap:6px; margin-top:8px">
          <button class="hud-btn hud-btn-cyan" style="flex:1" onclick="SaveLoad.save()">💾 Save</button>
          <button class="hud-btn hud-btn-cyan" style="flex:1" onclick="SaveLoad.load()">📂 Load</button>
        </div>

        <!-- Anti-screensaver toggle -->
        <div style="margin-top:6px">
          <button class="hud-btn hud-btn-green" id="btn-wake" onclick="WakeLock.toggle()" style="width:100%">
            <span id="wake-indicator"></span>☀ Screen Awake: OFF
          </button>
        </div>

        <!-- Randomize All toggle -->
        <div style="margin-top:6px">
          <button class="hud-btn hud-btn-purple" id="btn-rand-all" onclick="HUD.toggleRandomAll()" style="width:100%">
            🎲 Randomize All: OFF
          </button>
        </div>

        <!-- Benevolence Monitor chart -->
        <div style="border-top:1px solid rgba(56,189,248,0.1); margin-top:8px; padding-top:6px">
          <div style="font-family:Orbitron,sans-serif; font-size:0.62rem; color:#fef08a;
               letter-spacing:0.1em; margin-bottom:4px">BENEVOLENCE MONITOR</div>
          <div id="benevolence-chart-wrap">
            <canvas id="benevolence-chart" width="248" height="90"></canvas>
          </div>
          <div style="font-size:0.62rem; color:#475569; text-align:center; margin-top:2px">
            Action (S) · Benevolence (B) · Coherence (C)
          </div>
        </div>
      </div>`;
    document.body.appendChild(p);

    // Bind resolution select
    document.getElementById('hud-res-select').addEventListener('change', e => {
      BiomeEngine.setResolution(e.target.value);
    });
  }

  function _buildControlSlider(key, label, min, max, step, unit) {
    const initVal = (_params[key] !== undefined) ? _params[key]
      : (window.SpeciesData.DEFAULT_PARAMS[key] || min);
    const disp = Number(initVal).toFixed(step < 0.1 ? 2 : 1);
    return `
      <div class="hud-row">
        <span class="hud-label" style="width:90px">${label}</span>
        <input class="pop-slider" id="ctrl-${key}" type="range"
               min="${min}" max="${max}" step="${step}" value="${initVal}"
               data-key="${key}" data-unit="${unit}">
        <span class="hud-value" id="ctrlv-${key}" style="width:36px">${disp}${unit}</span>
        <button class="param-rand-btn" id="rand-ctrl-${key}"
                data-key="${key}" title="Random Mode" onclick="HUD.toggleRandom('${key}', this)">🎲</button>
      </div>`;
  }

  function _buildPopRows() {
    const groups = window.SpeciesData.SPECIES_GROUPS;
    return Object.entries(groups).map(([gkey, g]) => `
      <div class="pop-row">
        <span class="pop-label">${g.label}</span>
        <input class="pop-slider" type="range"
               min="0" max="200" step="1" value="100"
               id="pop-slider-${gkey}" data-group="${gkey}"
               oninput="HUD.setPopMultiplier('${gkey}', this.value)">
        <span class="pop-count" id="pop-count-${gkey}">—</span>
        <button class="pop-adj" onclick="HUD.adjustPop('${gkey}', 5)">+</button>
        <button class="pop-adj" onclick="HUD.adjustPop('${gkey}', -5)">−</button>
      </div>`).join('');
  }

  // ── MASTER TOGGLE (Hide All) ─────────────────────────────────
  function _buildMasterToggle() {
    const btn = document.createElement('button');
    btn.id = 'hud-master-toggle';
    btn.textContent = '☰ Hide All';
    btn.addEventListener('click', toggleAll);
    document.body.appendChild(btn);
  }

  function _buildPullTabs() {
    const tabL = document.createElement('button');
    tabL.id = 'tab-left'; tabL.className = 'panel-tab';
    tabL.textContent = 'LOG'; tabL.addEventListener('click', () => togglePanel('hud-left'));
    document.body.appendChild(tabL);

    const tabR = document.createElement('button');
    tabR.id = 'tab-right'; tabR.className = 'panel-tab';
    tabR.textContent = 'CTRL'; tabR.addEventListener('click', () => togglePanel('hud-right'));
    document.body.appendChild(tabR);
  }

  // ── PANEL TOGGLE (Feature A) ─────────────────────────────────
  function togglePanel(id) {
    const panel = document.getElementById(id);
    if (!panel) return;
    const collapsed = panel.classList.toggle('collapsed');
    // Show/hide corresponding pull-tab
    if (id === 'hud-left')  document.getElementById('tab-left')?.classList.toggle('visible', collapsed);
    if (id === 'hud-right') document.getElementById('tab-right')?.classList.toggle('visible', collapsed);
  }

  function toggleAll() {
    _allHidden = !_allHidden;
    ['hud-top', 'hud-left', 'hud-right', 'hud-pov'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('collapsed', _allHidden);
    });
    document.getElementById('hud-master-toggle').textContent =
      _allHidden ? '☰ Show All' : '☰ Hide All';
    document.getElementById('tab-left')?.classList.toggle('visible', _allHidden);
    document.getElementById('tab-right')?.classList.toggle('visible', _allHidden);
  }

  // ── CHART (Benevolence Monitor) ──────────────────────────────
  function _initChart() {
    const canvas = document.getElementById('benevolence-chart');
    if (!canvas) return;
    _chartCtx = canvas.getContext('2d');
    for (let i = 0; i < CHART_LEN; i++) {
      _chartData.action.push(0);
      _chartData.benevolence.push(0);
      _chartData.coherence.push(0);
    }

    // Bind slider input events
    document.querySelectorAll('input[data-key]').forEach(slider => {
      slider.addEventListener('input', () => {
        const key  = slider.dataset.key;
        const unit = slider.dataset.unit || '';
        const val  = parseFloat(slider.value);
        BiomeEngine.setParam(key, val);
        const disp = document.getElementById('ctrlv-' + key);
        if (disp) disp.textContent = val.toFixed(val < 2 ? 2 : 1) + unit;
        // sync opening-screen values if they exist
        _params[key] = val;
      });
    });
  }

  function _drawChart(metrics) {
    if (!_chartCtx) return;
    const { action, benevolence, coherence } = metrics;
    _chartData.action.push(action);          _chartData.action.shift();
    _chartData.benevolence.push(benevolence); _chartData.benevolence.shift();
    _chartData.coherence.push(coherence);     _chartData.coherence.shift();

    const ctx = _chartCtx;
    const w = 248, h = 90;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, w, h);

    const colors = ['#38bdf8', '#10b981', '#a855f7'];
    const datasets = [_chartData.action, _chartData.benevolence, _chartData.coherence];

    datasets.forEach((ds, i) => {
      ctx.beginPath();
      ctx.strokeStyle = colors[i];
      ctx.lineWidth   = 1.5;
      ds.forEach((v, x) => {
        const px = (x / CHART_LEN) * w;
        const py = h - (v / 10) * h;
        x === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.stroke();
    });

    // Horizontal grid
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.8;
    [0.25, 0.5, 0.75].forEach(f => {
      ctx.beginPath(); ctx.moveTo(0, h * (1 - f)); ctx.lineTo(w, h * (1 - f)); ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  // ── TICK (called each frame) ──────────────────────────────────
  function tick({ creatures, metrics, time, params }) {
    // Update top bar
    const live  = creatures.filter(c => c.alive).length;
    const setV  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setV('hud-total-pop', live);
    setV('hud-action',     metrics.action.toFixed(2));
    setV('hud-benevolence',metrics.benevolence.toFixed(2));
    setV('hud-coherence',  metrics.coherence.toFixed(2));

    const ecoHealth = (metrics.benevolence + metrics.coherence) / 2;
    const ecoEl = document.getElementById('hud-eco');
    if (ecoEl) {
      if (ecoHealth > 6) { ecoEl.textContent = 'THRIVING'; ecoEl.style.color = '#10b981'; }
      else if (ecoHealth > 3) { ecoEl.textContent = 'STABLE';   ecoEl.style.color = '#38bdf8'; }
      else                    { ecoEl.textContent = 'STRESSED'; ecoEl.style.color = '#f43f5e'; }
    }

    // Population per group
    const groupCounts = {};
    for (const c of creatures) {
      if (!c.alive) continue;
      groupCounts[c.group] = (groupCounts[c.group] || 0) + 1;
    }
    for (const gkey of Object.keys(window.SpeciesData.SPECIES_GROUPS)) {
      setV('hud-pop-' + gkey, groupCounts[gkey] || 0);
      setV('pop-count-' + gkey, groupCounts[gkey] || 0);
    }

    // Draw benevolence chart every 3 frames
    if (Math.random() < 0.33) _drawChart(metrics);
  }

  // ── POPULATION CONTROLS (Feature D) ──────────────────────────
  function setPopMultiplier(group, pct) {
    // pct 0-200 slider: map to multiplier 0-2
    const mult = parseFloat(pct) / 100;
    BiomeEngine.setParam('pop_' + group, mult);
  }

  function adjustPop(group, delta) {
    const catalog = window.SpeciesData.SPECIES_CATALOG;
    const species = catalog.find(s => s.group === group);
    if (!species) return;
    if (delta > 0) {
      for (let i = 0; i < delta; i++) BiomeEngine.spawnCreature(species.key, 1);
    } else {
      BiomeEngine.removeCreatures(species.key, -delta);
    }
  }

  // ── RANDOM CONTROLS (Feature G) ──────────────────────────────
  let _randAllActive = false;

  function toggleRandom(key, btn) {
    const active = btn.classList.toggle('active');
    BiomeEngine.setParam('randomToggle_' + key, active);
    const slider = document.getElementById('ctrl-' + key);
    if (slider) slider.classList.toggle('randomized', active);
  }

  function toggleRandomAll() {
    _randAllActive = !_randAllActive;
    const btn = document.getElementById('btn-rand-all');
    if (btn) btn.textContent = '🎲 Randomize All: ' + (_randAllActive ? 'ON' : 'OFF');
    ['larmorFreq', 'fluidViscosity', 'resourceRegen', 'coherence'].forEach(key => {
      BiomeEngine.setParam('randomToggle_' + key, _randAllActive);
      const slider = document.getElementById('ctrl-' + key);
      if (slider) slider.classList.toggle('randomized', _randAllActive);
      const randBtn = document.getElementById('rand-ctrl-' + key);
      if (randBtn) randBtn.classList.toggle('active', _randAllActive);
    });
  }

  // ── EVENT LOG ─────────────────────────────────────────────────
  function appendLog(msg) {
    const log = document.getElementById('event-log');
    if (!log) return;
    const li = document.createElement('li');
    li.textContent = msg;
    li.style.color = ['#38bdf8','#10b981','#a855f7','#fef08a','#f43f5e'][Math.floor(Math.random()*5)];
    log.prepend(li);
    while (log.children.length > 20) log.lastChild.remove();
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return {
    init,
    tick,
    togglePanel,
    toggleAll,
    toggleRandom,
    toggleRandomAll,
    setPopMultiplier,
    adjustPop,
    appendLog,
  };

})();

window.HUD = HUD;
