# Tardigradia 2.0 — V2 Update Report

**Location:** `Tardigradia/LOL2go/`  
**Date:** 2026-06-29  
**Version:** 2.0.0

---

## Overview

Tardigradia 2.0 merges the original microbe floating-icon website (LOL2go v1) with the TGPU v2.0 subatomic particle physics engine to create a self-sustaining living biome — a "universe in a droplet" — where microbial organisms swarm, eat, breed, and die according to laws derived from quantum mechanics, fluid dynamics, and food-chain ecology.

---

## Architecture

```
index.html
 ├── CSS Background + V1 Bubbles      (z-index: -1)
 ├── trail-canvas (fading trails)     (z-index:  0)
 ├── biome-canvas (live simulation)   (z-index:  1)
 ├── V2 HUD Panels                    (z-index: 20)
 ├── V1 Sidebar / Details / Nav       (z-index: 15)
 └── Opening Screen Modal             (z-index: 500)
```

The biome runs in a 3000×2000 virtual world space mapped onto the viewport via a camera with smooth lerp (zoom, translate, rotate).

---

## New Files

| File | Purpose |
|------|---------|
| `js/v2/config/species_data.js` | All species definitions, subatomic mappings, default params, resolution caps |
| `js/v2/core/physics.js` | Perlin/curl-noise flow field, Reynolds flocking, all TGPU particle behaviours |
| `js/v2/core/creature.js` | `Creature` class — lifecycle, physics update, eat, reproduce, die, draw |
| `js/v2/core/ecosystem.js` | Resource grid, food chain interactions, Lotka-Volterra auto-balance, event triggers |
| `js/v2/core/biome_engine.js` | Main rAF loop, camera, spatial partition, render pipeline, state serialisation |
| `js/v2/ui/opening_screen.js` | Full-screen config splash (Feature F) |
| `js/v2/ui/hud.js` | Collapsible HUD panels, benevolence chart, controls (Features A, D, G, H) |
| `js/v2/ui/pov_camera.js` | First-person creature tracking (Feature B) |
| `js/v2/ui/save_load.js` | localStorage save/load + autosave (Feature E) |
| `js/v2/ui/screensaver.js` | Wake Lock API + fallback (Feature C) |
| `css/v2/biome.css` | Canvas layers, sparks, trails, toast notifications |
| `css/v2/ui.css` | HUD panels, opening screen, sliders, buttons (Orbitron/Rajdhani fonts) |
| `V2_UPDATE_REPORT.md` | This document |

## Modified Files

| File | Change |
|------|--------|
| `index.html` | Added canvas elements, v2 CSS/JS tags, bootstrap for OpeningScreen; removed duplicate g0001 script load; preserved all v1 functionality |
| `css/styles.css` | Added `background-color:#020208` to body; added z-index stacking for v1 DOM elements above canvas |

---

## Feature Matrix

| Feature | Description | Implementation |
|---------|-------------|---------------|
| **Core** | Living biome with physics-driven creatures | `biome_engine.js` + `creature.js` + `physics.js` + `ecosystem.js` |
| **A** | All menus / 90% of text slide off-screen; pull-tabs remain | `hud.js` — `togglePanel()`, collapse CSS in `ui.css` |
| **B** | First-person inside-creature POV with heading rotation | `pov_camera.js` — canvas `translate + rotate + scale` per frame |
| **C** | Anti-screensaver (Wake Lock API + pointer-move fallback) | `screensaver.js` |
| **D** | Add/remove specific species via sliders and ±5 buttons | `hud.js` — `adjustPop()`, `setPopMultiplier()` |
| **E** | Save Progress / Load Progress via localStorage | `save_load.js` — 5-min autosave + manual with green flash |
| **F** | Opening screen: parameter config with defaults | `opening_screen.js` — fully adjustable via `species_data.js` |
| **G** | Random manipulation toggles on each physics control | `hud.js` — `toggleRandom()`, sinusoidal oscillation in `biome_engine.js` |
| **H** | Universal Resolution setting (Low/Medium/High) | Opening screen + mid-sim select in HUD; `RESOLUTION_CAPS` in `species_data.js` |

---

## Subatomic → Macroscopic Mappings

| Particle Type | Microbe Analogue | Eco Tier | Behaviour |
|---------------|------------------|----------|-----------|
| Electron (Clifford) | Hypsibius dujardini (Tardigrade) | Apex | Chaotic attractor worldline |
| Higgs (central scalar) | Bacteria spp. | Producer | Central attraction, nutrient harvest |
| Neutron (stable) | Micrococcus Luteus | Detritivore | Gentle orbital drift |
| Photon (light-streak) | Bifidobacterium Longum | Primary consumer | Fast light-like travel |
| Proton (hadronic orbit) | Acanthamoeba | Secondary consumer | Tight orbit pattern |
| Muon (Clifford heavy) | Amoeba Proteus | Secondary consumer | Slow heavy attractor |
| Axion (BEC cluster) | Streptomyces Coelicolor | Decomposer | Slow coherent clustering |
| Gluon (branching) | Actinomyces Israelii | Decomposer | Self-coupling branching |
| Pines Demon (acoustic) | Dictyostelium spp. | Special/Swarm | Pheromone wave aggregation |
| Neutrino (linear ghost) | Endolimax Nana | Commensal | Ghost streak, no eating |
| Quark (confined) | Entamoeba spp. | Parasite | Confined tight orbit |
| Neutralino (dark drift) | Mycobacterium tuberculosis | Parasite | Slow persistent dark drift |
| W/Z Boson (short decay) | Brevibacterium Linens | Decomposer | Short-range random walk |
| Pion/Kaon (meson orbit) | Gardnerella / Nocardia | Primary consumer | Fast meson-like orbital |
| Graviton (linear) | Tardigrade (cryptobiosis) | Apex survivor | Straight near-indestructible |

---

## Physics Model

### Flow Field
Curl-noise (Perlin-based divergence-free vector field) provides the fluid substrate. All creatures are nudged by it according to `fluidViscosity` parameter. Flow field arrows are rendered as faint directional hints.

### Flocking (Reynolds Rules)
Swarm species (`swarm: true`) apply three forces each frame:
- **Separation** — steer away from neighbors within `size×2` units
- **Alignment** — match velocity of neighbors within `perceptionR=90`
- **Cohesion** — steer toward centre-of-mass of local group

Cohesion factor is mapped to the TGPU `Coherence (C)` slider.

### Food Chain (Lotka-Volterra)
- Producers regenerate from the resource grid
- Up to 3 trophic levels of predation
- Dead creatures release nutrients back to the grid tile
- Auto-balance every 5 seconds: species below 30% of target ratio get emergency spawns

### TGPU-Mapped Events
| Button | TGPU Equivalent | Effect |
|--------|----------------|--------|
| Perturb | Perturb | Randomise all creature velocities + attractor params |
| Fusion | Fusion Event | Mass reproduction burst |
| Pheromone! | Pines Demon | Dictyostelium pheromone wave 8s aggregation |
| Trails | Trails | Toggle bioluminescent trail persistence |

---

## Configurable Defaults

Edit `js/v2/config/species_data.js` → `DEFAULT_PARAMS`:

```javascript
const DEFAULT_PARAMS = {
  resolution:      'medium',  // 'low' | 'medium' | 'high'
  tardigrades:     30,        // Starting tardigrade count
  bacteria:        100,       // Starting bacteria count
  amoebae:         50,        // Starting amoeba count
  decomposers:     40,        // Starting decomposer count
  special:         20,        // Starting special/swarm count
  parasites:       10,        // Starting parasite count
  larmorFreq:      1.0,       // Speed multiplier (TGPU: Larmor Frequency)
  fluidViscosity:  0.5,       // Fluid resistance
  resourceRegen:   1.0,       // Nutrient regeneration rate
  coherence:       0.6,       // Flock cohesion (TGPU: Coherence C)
};
```

Edit `RESOLUTION_CAPS` to tune per-resolution creature limits and trail lengths.

---

## V1 Compatibility

All v1 features are fully preserved:
- Floating bubbles background
- Random background image selector
- Slideshow / Stop Slideshow
- Release Microbes / Spinning icons (legacy DOM icons, separate from v2 canvas)
- CrowdSource page
- PDF download
- Logoshow / Stencilshow
- Speech module
- Right-side collapsible menu

---

## Known Limitations & Future Work

- Icon images (`_icon.png`) must exist alongside their parent JPGs for creature sprites to render; if absent, coloured circles render as fallback
- Save file is stored in the browser's localStorage; clearing browser data will erase saves
- Wake Lock requires HTTPS in most browsers; on HTTP, pointer-move fallback activates automatically
- High resolution (750 creatures) may be slow on integrated graphics; Medium is recommended default
- Future: export/import save as JSON file for portable backups
- Future: Three.js upgrade for WebGL bloom on creature glows
- Future: Sound design — pheromone / eating / breeding audio cues
