// ============================================================
// Tardigradia 2.0 — Physics Engine
// Swarm mechanics (Reynolds), fluid dynamics (curl-noise),
// and per-species particle-physics movement behaviours
// adapted from TGPU v2.0 subatomic worldline engine.
// ============================================================

const Physics = (() => {

  // ── CONSTANTS ────────────────────────────────────────────────
  const TWO_PI   = Math.PI * 2;
  const WORLD_W  = 3000;
  const WORLD_H  = 2000;

  // ── UTILITY ──────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function rand(lo, hi)     { return lo + Math.random() * (hi - lo); }
  function dist(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy) || 0.001;
  }

  // ── PERLIN / SIMPLEX-LIKE HASH (fast 2D smooth noise) ────────
  const _p = new Uint8Array(512);
  const _perm = new Uint8Array(256);
  (function initPerm() {
    for (let i = 0; i < 256; i++) _perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [_perm[i], _perm[j]] = [_perm[j], _perm[i]];
    }
    for (let i = 0; i < 512; i++) _p[i] = _perm[i & 255];
  })();

  function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function _lerp(t, a, b) { return a + t * (b - a); }
  function _grad(hash, x, y) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  function perlin2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = _fade(x), v = _fade(y);
    const a  = _p[X] + Y, aa = _p[a], ab = _p[a + 1];
    const b  = _p[X + 1] + Y, ba = _p[b], bb = _p[b + 1];
    return _lerp(v, _lerp(u, _grad(_p[aa], x, y),   _grad(_p[ba], x - 1, y)),
                    _lerp(u, _grad(_p[ab], x, y - 1),_grad(_p[bb], x - 1, y - 1)));
  }

  // ── CURL NOISE FLOW FIELD ─────────────────────────────────────
  // Returns velocity vector {vx,vy} giving a divergence-free flow.
  function curlNoise(x, y, t) {
    const eps  = 0.01;
    const s    = 0.0006;       // spatial scale
    const ts   = t * 0.00025; // temporal drift
    const n1   = perlin2(x * s, y * s + ts);
    const n2   = perlin2(x * s + eps, y * s + ts);
    const n3   = perlin2(x * s, y * s + eps + ts);
    const dvdy = (n3 - n1) / eps;
    const dvdx = (n2 - n1) / eps;
    return { vx:  dvdy * 18, vy: -dvdx * 18 };
  }

  // ── REYNOLDS FLOCKING ─────────────────────────────────────────
  // Returns a delta-velocity for one creature given visible neighbors.
  function flockingForce(cx, cy, cvx, cvy, neighbors, params) {
    const { cohesion = 0.6, separation = 28, alignment = 0.4, perceptionR = 90 } = params;
    let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0;
    let count = 0;

    for (const n of neighbors) {
      const d = dist(cx, cy, n.x, n.y);
      if (d > perceptionR || d === 0) continue;
      // Separation: steer away from too-close neighbors
      if (d < separation) {
        sepX += (cx - n.x) / d;
        sepY += (cy - n.y) / d;
      }
      aliX += n.vx; aliY += n.vy;
      cohX += n.x;  cohY += n.y;
      count++;
    }

    if (count === 0) return { vx: 0, vy: 0 };

    aliX /= count; aliY /= count;
    cohX = (cohX / count) - cx;
    cohY = (cohY / count) - cy;

    return {
      vx: sepX * 1.5 + (aliX - cvx) * alignment + cohX * cohesion * 0.01,
      vy: sepY * 1.5 + (aliY - cvy) * alignment + cohY * cohesion * 0.01,
    };
  }

  // ── PARTICLE-PHYSICS BEHAVIOUR FUNCTIONS ─────────────────────
  // Each returns a {dvx, dvy} acceleration for one time-step dt.
  // Mirrors TGPU v2.0 _updateParticles() switch-case logic.

  // Clifford attractor (electron / muon / tardigrade)
  function cliffordAttractor(c, dt, params) {
    const t  = params.time * 0.0004 * params.speed;
    const a  = c._a, b = c._b;
    const dx = Math.sin(a * c.y + t) + Math.cos(b * c.x + t * 0.7);
    const dy = Math.sin(b * c.x - t * 0.8) + Math.cos(a * c.y - t);
    c._berryPhase += 0.01 * dx;
    return { dvx: dx * 2.0 * dt, dvy: dy * 2.0 * dt };
  }

  // Central scalar attractor (higgs / bacteria producer)
  function centralAttractor(c, dt, params) {
    const t = params.time * 0.001 * params.speed;
    const dvx = (-c.x * 0.001 + Math.sin(t * 0.3 + c._phase) * 0.5) * dt * 60;
    const dvy = (-c.y * 0.001 + Math.cos(t * 0.3 + c._phase) * 0.5) * dt * 60;
    return { dvx, dvy };
  }

  // Light-like linear streak (photon / neutrino / graviton)
  function linearStreak(c, dt, params) {
    const spd = params.speed * 120;
    c.x += Math.cos(c._phase) * spd * dt;
    c.y += Math.sin(c._phase) * spd * dt;
    // wrap at boundary
    if (c.x < 0) c.x += WORLD_W; if (c.x > WORLD_W) c.x -= WORLD_W;
    if (c.y < 0) c.y += WORLD_H; if (c.y > WORLD_H) c.y -= WORLD_H;
    return { dvx: 0, dvy: 0 };
  }

  // BEC clustering (axion / streptomyces)
  function becCluster(c, dt, params) {
    const t = params.time * 0.0002 * params.speed;
    const dvx = Math.sin(t * 0.2 + c._phase) * 0.4 * 60 * dt;
    const dvy = Math.cos(t * 0.15 + c._phase) * 0.4 * 60 * dt;
    return { dvx, dvy };
  }

  // Hadronic orbit (proton / acanthamoeba)
  function hadronicOrbit(c, dt, params) {
    const t = params.time * 0.001 * params.speed;
    const dvx = Math.sin(t + c._phase) * 0.6 * 60 * dt;
    const dvy = Math.cos(t + c._phase) * 0.6 * 60 * dt;
    return { dvx, dvy };
  }

  // Meson orbital (pion / kaon / gardnerella / nocardia)
  function mesOrbital(c, dt, params) {
    const t    = params.time * 0.001 * params.speed;
    const spd  = (c._orbitSpeed || 1.5);
    const dvx  = Math.sin(t * spd + c._phase) * spd * 60 * dt;
    const dvy  = Math.cos(t * spd + c._phase) * spd * 60 * dt;
    return { dvx, dvy };
  }

  // Branching attractor (gluon / actinomyces)
  function branchingAttract(c, dt, params) {
    const t  = params.time * 0.0004 * params.speed;
    const a  = c._a, b = c._b;
    const dx = Math.sin(a * c.y * 2 + t * 2);
    const dy = Math.cos(b * c.x * 2 + t * 2);
    return { dvx: dx * 2.5 * dt, dvy: dy * 2.5 * dt };
  }

  // Acoustic propagation (Pines Demon / dictyostelium)
  function acousticPropag(c, dt, params, demonOrigin) {
    const t   = params.time * 0.001 * params.speed;
    let dvx = Math.sin(c._phase + t * 0.387) * 0.387 * 60 * dt;
    let dvy = Math.cos(c._phase + t * 0.387) * 0.387 * 60 * dt;
    // If demon-wave active, aggregate toward origin
    if (demonOrigin) {
      const d = dist(c.x, c.y, demonOrigin.x, demonOrigin.y);
      const pull = Math.min(1, 200 / d);
      dvx += (demonOrigin.x - c.x) * pull * dt * 0.8;
      dvy += (demonOrigin.y - c.y) * pull * dt * 0.8;
    }
    return { dvx, dvy };
  }

  // Quark confinement (entamoeba parasite)
  function confinement(c, dt, params) {
    const t  = params.time * 0.001 * params.speed;
    const cr = 80;
    const tx = Math.sin(t * 3 + c._phase) * cr;
    const ty = Math.cos(t * 3 + c._a * c._phase) * cr;
    // Clamp: want creature to stay near its "parent" (nearest producer)
    c.x = c._confineCx + tx;
    c.y = c._confineCy + ty;
    return { dvx: 0, dvy: 0 };
  }

  // Short-range decay (W/Z boson / brevibacterium)
  function shortRangeDecay(c, dt, params) {
    const range = 200;
    const dvx = (Math.random() - 0.5) * params.speed * 120 * dt;
    const dvy = (Math.random() - 0.5) * params.speed * 120 * dt;
    // bound to spawn region
    if (Math.abs(c.x - c._spawnX) > range) c.x = c._spawnX + (Math.random() - 0.5) * range;
    if (Math.abs(c.y - c._spawnY) > range) c.y = c._spawnY + (Math.random() - 0.5) * range;
    return { dvx, dvy };
  }

  // Dark drift (neutralino / mycobacterium)
  function darkDrift(c, dt, params) {
    const t  = params.time * 0.001;
    const dvx = Math.sin(t * 0.05 + c._phase) * 0.8 * 60 * dt;
    const dvy = Math.cos(t * 0.05) * 0.5 * 60 * dt;
    return { dvx, dvy };
  }

  // Stable neutral (neutron / micrococcus)
  function stableOrbit(c, dt, params) {
    const t  = params.time * 0.0005 * params.speed;
    const dvx = Math.sin(t + c._phase) * 0.3 * 60 * dt;
    const dvy = Math.cos(t * 0.7 + c._phase) * 0.3 * 60 * dt;
    return { dvx, dvy };
  }

  // ── BEHAVIOUR DISPATCHER ─────────────────────────────────────
  const BEHAVIOUR_MAP = {
    cliffordAttractor,
    centralAttractor,
    linearStreak,
    becCluster,
    hadronicOrbit,
    mesOrbital,
    branchingAttract,
    acousticPropag,
    confinement,
    shortRangeDecay,
    darkDrift,
    stableOrbit,
  };

  function applyParticleBehaviour(c, dt, params, extras) {
    const fn = BEHAVIOUR_MAP[c._behaviorFn];
    if (!fn) return { dvx: 0, dvy: 0 };
    return fn(c, dt, params, extras);
  }

  // ── BOUNDARY WRAP ─────────────────────────────────────────────
  function wrapBoundary(c) {
    if (c.x < 0)       c.x += WORLD_W;
    if (c.x > WORLD_W) c.x -= WORLD_W;
    if (c.y < 0)       c.y += WORLD_H;
    if (c.y > WORLD_H) c.y -= WORLD_H;
  }

  // ── SPEED LIMIT ───────────────────────────────────────────────
  function limitSpeed(c, maxSpd) {
    const len = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
    if (len > maxSpd) {
      c.vx = (c.vx / len) * maxSpd;
      c.vy = (c.vy / len) * maxSpd;
    }
  }

  // ── PUBLIC API ────────────────────────────────────────────────
  return {
    curlNoise,
    flockingForce,
    applyParticleBehaviour,
    wrapBoundary,
    limitSpeed,
    perlin2,
    WORLD_W,
    WORLD_H,
  };

})();

window.Physics = Physics;
