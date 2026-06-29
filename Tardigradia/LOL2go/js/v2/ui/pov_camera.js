// ============================================================
// Tardigradia 2.0 — POV Camera (Feature B)
// First-person perspective: canvas rotates and translates
// so the tracked creature is always at the viewport centre
// and the view faces its heading direction.
// ============================================================

const PovCamera = (() => {

  let _tracked    = null;   // currently tracked Creature
  let _active     = false;
  let _hudPanel   = null;
  const POV_ZOOM  = 3.2;    // zoom factor for first-person immersion
  let _normalZoom = 1;      // remembered zoom before entering POV

  // ── INIT ────────────────────────────────────────────────────
  function init() {
    _hudPanel = document.getElementById('hud-pov');
    if (!_hudPanel) {
      _hudPanel = document.createElement('div');
      _hudPanel.id        = 'hud-pov';
      _hudPanel.className = 'hud-panel';
      _hudPanel.innerHTML = `
        <div class="pov-name"  id="pov-species-name">—</div>
        <div class="pov-particle" id="pov-particle-name">—</div>
        <div class="pov-bar-wrap">
          <span class="pov-bar-label">Energy</span>
          <div class="pov-bar-track">
            <div class="pov-bar-fill energy" id="pov-energy-bar" style="width:0%"></div>
          </div>
        </div>
        <div class="pov-bar-wrap">
          <span class="pov-bar-label">Age</span>
          <div class="pov-bar-track">
            <div class="pov-bar-fill age" id="pov-age-bar" style="width:0%"></div>
          </div>
        </div>
        <div style="text-align:center; padding:0 10px 8px; font-size:0.65rem; color:#475569">
          ESC or click creature to exit
        </div>`;
      document.body.appendChild(_hudPanel);
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') exit();
    });
  }

  // ── TRACK ────────────────────────────────────────────────────
  function trackCreature(creature, camera) {
    _tracked    = creature;
    _active     = true;
    _normalZoom = camera.zoom;

    // Show POV HUD panel
    _hudPanel.classList.add('active');
    document.getElementById('biome-canvas').classList.add('pov-active');

    // Snap species info into HUD
    _updateHUD(creature);

    // Log event
    if (window.BiomeEngine) {
      BiomeEngine.logEvent
        ? BiomeEngine.logEvent('[POV] Tracking ' + creature.species.name + ' (particle: ' + creature.species.particleType + ')')
        : null;
    }
    if (window.HUD) HUD.appendLog('[POV] Now inside: ' + creature.species.name);
  }

  function exit() {
    if (!_active) return;
    _active  = false;
    _tracked = null;

    _hudPanel.classList.remove('active');
    document.getElementById('biome-canvas')?.classList.remove('pov-active');

    // Reset camera to normal overview
    const cam = BiomeEngine.camera;
    if (cam) {
      cam.targetZoom     = _normalZoom;
      cam.targetRotation = 0;
      cam.targetX        = Physics.WORLD_W / 2;
      cam.targetY        = Physics.WORLD_H / 2;
    }
    if (window.HUD) HUD.appendLog('[POV] Exited — returning to overview');
  }

  // ── UPDATE (called every frame from BiomeEngine) ─────────────
  function update(camera, creatures) {
    if (!_active) return;

    // Remove dead tracked creature
    if (!_tracked || !_tracked.alive) {
      // Try to re-attach to same species if nearby
      const same = creatures.find(c => c.alive && c.key === (_tracked ? _tracked.key : ''));
      if (same) {
        _tracked = same;
      } else {
        exit();
        return;
      }
    }

    // ── Camera target: center on creature, face heading ──────
    camera.targetX        = _tracked.x;
    camera.targetY        = _tracked.y;
    camera.targetZoom     = POV_ZOOM;
    // Rotate canvas to face creature's direction of travel
    // (negative of heading so the creature faces "up" on screen)
    camera.targetRotation = -_tracked.heading;

    // ── Update HUD bars ──────────────────────────────────────
    _updateHUD(_tracked);
  }

  function _updateHUD(c) {
    const nameEl  = document.getElementById('pov-species-name');
    const partEl  = document.getElementById('pov-particle-name');
    const engBar  = document.getElementById('pov-energy-bar');
    const ageBar  = document.getElementById('pov-age-bar');

    if (nameEl) nameEl.textContent  = c.species.name;
    if (partEl) partEl.textContent  = '⟨ ' + c.species.particleType.replace(/_/g,' ') + ' analogue ⟩';
    if (nameEl) nameEl.style.color  = c.species.color;

    if (engBar) {
      const pct = Math.max(0, Math.min(100, (c.energy / c.species.energyMax) * 100));
      engBar.style.width = pct + '%';
    }
    if (ageBar) {
      const pct = Math.max(0, Math.min(100, (c.age / c.species.lifespan) * 100));
      ageBar.style.width = pct + '%';
    }
  }

  // ── ACCESSORS ────────────────────────────────────────────────
  function isActive()            { return _active; }
  function getTrackedCreature()  { return _tracked; }

  return { init, trackCreature, exit, update, isActive, getTrackedCreature };

})();

window.PovCamera = PovCamera;
