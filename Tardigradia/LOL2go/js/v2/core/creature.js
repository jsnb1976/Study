// ============================================================
// Tardigradia 2.0 — Creature Class
// Each creature is a living entity with biology, physics,
// and ecology mapped from subatomic particle behaviors.
// ============================================================

let _creatureIdCounter = 0;

class Creature {
  constructor(speciesData, x, y) {
    this.id      = ++_creatureIdCounter;
    this.species = speciesData;        // reference to SPECIES_CATALOG entry
    this.key     = speciesData.key;
    this.tier    = speciesData.tier;
    this.group   = speciesData.group;

    // Position + velocity
    this.x  = x;
    this.y  = y;
    this.vx = (Math.random() - 0.5) * speciesData.speed * 0.4;
    this.vy = (Math.random() - 0.5) * speciesData.speed * 0.4;

    // Biology
    this.energy  = speciesData.energyMax * (0.5 + Math.random() * 0.5);
    this.age     = 0;
    this.alive   = true;
    this.heading = Math.atan2(this.vy, this.vx);

    // Eco flags
    this.eating    = false;          // flash flag for render
    this.spawning  = false;          // flash flag for render
    this.sparkTimer = 0;

    // Physics private state (particle analogue)
    const pt = window.SpeciesData.PHYSICS_TRAITS[speciesData.particleType] || {};
    this._behaviorFn  = pt.behaviorFn || 'stableOrbit';
    this._a           = (pt.baseA || 0.15) + Math.random() * 0.1;
    this._b           = (pt.baseB || 0.15) + Math.random() * 0.1;
    this._phase       = Math.random() * Math.PI * 2;
    this._freq        = 0.3 + Math.random() * 2.5;
    this._berryPhase  = 0;
    this._orbitSpeed  = pt.orbitSpeed || 1.5;
    this._spawnX      = x;
    this._spawnY      = y;
    this._confineCx   = x;
    this._confineCy   = y;

    // Image: pick a random icon from the species' directory
    this.imgEl = null;
    this._loadImage();

    // Reproduction cooldown
    this._reproduceCooldown = 0;

    // Corpse decompose flag
    this._decomposing = false;
    this._decomposeTimer = 0;
  }

  _loadImage() {
    // Build _icon.png URL from the species imageDir
    const cache = window.BiomeEngine && window.BiomeEngine.imgCache;
    if (cache && cache.has(this.key)) {
      this.imgEl = cache.get(this.key);
      return;
    }
    // The image files follow the pattern: images/NN_Name/Name_Gemini_HASH.jpg
    // with icon variants: same path but _icon.png appended before extension
    // We use a shared pool assigned per species key in BiomeEngine.imgCache
    // If not yet cached, request will complete asynchronously
    if (cache) {
      const img = new Image();
      // Pick icon URL from species catalog first picture, converted to _icon.png
      const sp = window.SpeciesData.SPECIES_CATALOG.find(s => s.key === this.key);
      if (sp && sp._iconSrc) {
        img.src = sp._iconSrc;
        img.onload = () => {
          cache.set(this.key, img);
          if (!this.imgEl) this.imgEl = img;
        };
        cache.set(this.key, img);
        this.imgEl = img;
      }
    }
  }

  // ── UPDATE ───────────────────────────────────────────────────
  update(dt, neighbors, biomeParams, resources, extras) {
    if (!this.alive) return;

    const S = this.species;
    const speed = S.speed * biomeParams.larmorFreq;

    // ─ particle physics behaviour ─
    const { dvx, dvy } = Physics.applyParticleBehaviour(
      this, dt, { ...biomeParams, time: extras.time }, extras.demonOrigin
    );
    this.vx += dvx;
    this.vy += dvy;

    // ─ flocking (swarm species only) ─
    if (S.swarm && neighbors.length > 0) {
      const flock = Physics.flockingForce(
        this.x, this.y, this.vx, this.vy,
        neighbors,
        { cohesion: biomeParams.coherence, separation: S.size * 2, alignment: 0.4, perceptionR: 80 }
      );
      this.vx += flock.vx * dt * 60;
      this.vy += flock.vy * dt * 60;
    }

    // ─ fluid flow field nudge ─
    const flow = Physics.curlNoise(this.x, this.y, extras.time);
    const visc = 1 - biomeParams.fluidViscosity * 0.4;
    this.vx = this.vx * visc + flow.vx * (1 - visc) * biomeParams.fluidViscosity;
    this.vy = this.vy * visc + flow.vy * (1 - visc) * biomeParams.fluidViscosity;

    // ─ speed limit ─
    Physics.limitSpeed(this, speed * (1 + Math.random() * 0.3));

    // ─ integrate position ─
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    Physics.wrapBoundary(this);

    // ─ update heading ─
    if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
      this.heading = Math.atan2(this.vy, this.vx);
    }

    // ─ age & energy ─
    this.age += dt;
    const energyDrain = biomeParams.energyRate * dt * (S.energyMax / 200);
    this.energy -= energyDrain;

    // ─ resource harvesting (producers) ─
    if (S.tier === SpeciesData.TIERS.PRODUCER && resources) {
      const gain = resources.harvest(this.x, this.y, biomeParams.resourceRegen) * dt;
      this.energy = Math.min(S.energyMax, this.energy + gain);
    }

    // ─ reproduction cooldown ─
    this._reproduceCooldown = Math.max(0, this._reproduceCooldown - dt);

    // ─ flash cooldown ─
    this.sparkTimer = Math.max(0, this.sparkTimer - dt);
    this.eating  = this.sparkTimer > 0;

    // ─ death ─
    if (this.energy <= 0 || this.age > S.lifespan) {
      this.die();
    }
  }

  // ── EAT ──────────────────────────────────────────────────────
  eat(other, eatEnergy) {
    other.die();
    this.energy  = Math.min(this.species.energyMax, this.energy + eatEnergy);
    this.sparkTimer = 0.3;
    this.eating     = true;
    return eatEnergy;
  }

  // ── REPRODUCE ────────────────────────────────────────────────
  reproduce() {
    if (this.energy < this.species.reproduceEnergy) return null;
    if (this._reproduceCooldown > 0) return null;

    // Cost
    this.energy *= 0.55;
    this._reproduceCooldown = 8 + Math.random() * 10;
    this.spawning    = true;
    this.sparkTimer  = 0.4;

    // Offspring near parent
    const ox = this.x + (Math.random() - 0.5) * 40;
    const oy = this.y + (Math.random() - 0.5) * 40;
    const child = new Creature(this.species, ox, oy);
    child.energy = this.species.energyMax * 0.35;
    child.imgEl  = this.imgEl;
    return child;
  }

  // ── DIE ──────────────────────────────────────────────────────
  die() {
    this.alive = false;
    this._decomposing   = true;
    this._decomposeTimer = 4.0;  // seconds until fully removed
  }

  // ── DRAW ──────────────────────────────────────────────────────
  draw(ctx, biomeParams, highlighted) {
    if (!this.alive && this._decomposeTimer <= 0) return;

    const sz   = this.species.size * (biomeParams.scale || 1);
    const half = sz / 2;
    const alpha = this.alive ? 1 : Math.max(0, this._decomposeTimer / 4.0) * 0.5;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);

    // ─ glow effect ─
    if (biomeParams.glowEffects && this.species.glowColor) {
      ctx.shadowColor = this.species.glowColor;
      ctx.shadowBlur  = highlighted ? 18 : (this.sparkTimer > 0 ? 14 : 6);
    }

    // ─ highlight ring (selected / eating) ─
    if (highlighted || this.sparkTimer > 0) {
      const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.15;
      ctx.beginPath();
      ctx.arc(0, 0, half * 1.4 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = highlighted ? this.species.color : '#fef08a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // ─ draw icon image or coloured circle fallback ─
    if (this.imgEl && this.imgEl.complete && this.imgEl.naturalWidth > 0) {
      ctx.drawImage(this.imgEl, -half, -half, sz, sz);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, half * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = this.species.color;
      ctx.globalAlpha = alpha * 0.85;
      ctx.fill();
    }

    ctx.restore();
  }

  // ── SERIALISE ─────────────────────────────────────────────────
  toJSON() {
    return {
      key: this.key,
      x: this.x, y: this.y,
      vx: this.vx, vy: this.vy,
      energy: this.energy,
      age: this.age,
      heading: this.heading,
      _a: this._a, _b: this._b, _phase: this._phase,
      _reproduceCooldown: this._reproduceCooldown,
    };
  }

  static fromJSON(data) {
    const sp = window.SpeciesData.SPECIES_CATALOG.find(s => s.key === data.key);
    if (!sp) return null;
    const c = new Creature(sp, data.x, data.y);
    Object.assign(c, {
      vx: data.vx, vy: data.vy,
      energy: data.energy, age: data.age,
      heading: data.heading,
      _a: data._a, _b: data._b, _phase: data._phase,
      _reproduceCooldown: data._reproduceCooldown || 0,
    });
    return c;
  }
}

window.Creature = Creature;
