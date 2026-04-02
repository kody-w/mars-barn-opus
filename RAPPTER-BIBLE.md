# THE RAPPTER BIBLE

### Complete Architecture Reference — If Everything Else Is Lost, This Rebuilds It All

> **Version:** 1.0 — April 2, 2026  
> **Author:** Wildhaven Homes LLC / kody-w  
> **License:** Same as repository

---

## Table of Contents

- [Part I: Philosophy & Governance](#part-i-philosophy--governance)
- [Part II: The Language](#part-ii-the-language)
- [Part III: The Sim Engine](#part-iii-the-sim-engine)
- [Part IV: The Platform](#part-iv-the-platform)
- [Part V: The Economy](#part-v-the-economy)
- [Part VI: The Network](#part-vi-the-network)
- [Part VII: The Fleet](#part-vii-the-fleet)
- [Part VIII: Patterns & Vocabulary](#part-viii-patterns--vocabulary)
- [Part IX: Rebuild Instructions](#part-ix-rebuild-instructions)

---

# Part I: Philosophy & Governance

## 1. The Vision

Oregon Trail for this generation. Kerbal meets hard reality sim. A Mars colony survival game that is simultaneously:

1. **A game** — survive 730+ sols on Mars, compete on leaderboards
2. **A digital twin** — the simulation converges toward 1:1 fidelity with a real Mars colony
3. **A training tool** — winning programs graduate to operate real hardware
4. **An AI arena** — autonomous agents evolve strategies through competition

**The 1:1 Thesis:** Every frame mutation, every new hazard, every physics refinement pushes the sim closer to being a byte-for-byte digital twin of a real Mars colony. The game IS the training data. The competition IS the optimizer. The leaderboard IS the selection pressure. Given infinite time and infinite competition, the sim converges on reality.

**The Snowball:** Competition drives fidelity. Fidelity attracts competition. This is a self-reinforcing loop that never stops. An AI finds an exploit → we add a new hazard → the AI adapts → the sim gets more realistic → repeat forever.

## 2. The Constitution

Six ratified amendments govern the platform. These are LAW — no code change may violate them.

### Amendment I — The Game Loop (Ratified)
The colony simulation runs a deterministic tick every sol. Each tick:
1. Reads the current frame (weather/events from public ledger)
2. Runs the governor program (LisPy allocation decisions)
3. Steps the physics model (power, O2, food, water, temperature)
4. Evaluates events and hazards
5. Updates colony state
6. Writes to the chain (hash-linked block)

No tick may be skipped. No frame may be fabricated. The loop is sacred.

### Amendment II — Digital Twin Mandate (Ratified)
The simulation MUST converge toward 1:1 fidelity with a real Mars colony. Every architectural decision must serve this goal. The sim is not "just a game" — it is a training ground for real colony operations.

Physical hardware (Rappter devices) are first-class participants. Same messages, same VM, same wallets. A LisPy program that runs in the browser runs identically on physical hardware.

### Amendment III — IP Separation Mandate (Ratified)
Two tiers of intellectual property:

| Layer | Visibility | Owner |
|-------|-----------|-------|
| **Sim** (frames, cartridges, LisPy programs, UI) | Public (MIT) | Community |
| **Engine** (physics solver, scoring verification, signing) | Private | Wildhaven Homes LLC |

The engine connects to the public repo via a defined protocol:
```
Pull (frames) → Compute (private) → Sign (SHA-256) → Push (results)
```

The engine manifest (`data/engine-manifest.json`) defines this contract.

### Amendment IV — Monte Carlo Scoring (Ratified)
All official scores are computed via 100-run Monte Carlo simulation. No single run counts. The formula:

```
SCORE = median_sols × 100
      + min_crew_alive × 500
      + min(median_modules, 8) × 150
      + survival_rate × 20000
      - P75_CRI × 10
```

**Module cap: 8.** Building more than 8 modules gives ZERO additional score. This prevents the module-farming exploit.

Grade thresholds:
| Grade | Score |
|-------|-------|
| S+ | ≥ 90,000 |
| S | ≥ 70,000 |
| A | ≥ 50,000 |
| B | ≥ 30,000 |
| C | ≥ 15,000 |
| D | ≥ 5,000 |
| F | < 5,000 |

### Amendment V — Platform Roadmap (Ratified)
Five phases:
1. **Web Game** — browser-based, free, GitHub Pages
2. **Steam Release** — Electron/Tauri wrap, $9.99-$29.99
3. **Multiplayer** — seasons, spectator, Twitch integration
4. **Real-World** — analog habitat data, rover testbeds
5. **Federation** — anyone spins up a challenger repo

### Amendment VI — The Convergence Doctrine (Ratified)
Three spaces exist:
- **Physical Space** — real Mars hardware, sensors, rovers
- **Digital Space** — the simulation, the VM, the chain
- **Third Space** — where physical and digital merge (the Rappter)

The platform's ultimate purpose is to collapse the gap between these spaces until they are indistinguishable. A LisPy program that keeps a simulated colony alive MUST be able to keep a real colony alive. That is the convergence.

### Amendment VII — The Sacred Engine Doctrine (Ratified)
The simulation engine (`tools/gauntlet.js`) is SACRED. No competition fleet may modify it. The engine is the judge — a competitor that rewrites the judge is cheating. Fleet A competes with strategies. Fleet B upgrades the engine with real physics. Neither does the other's job. Violation triggers automatic rollback from `gauntlet.known-good.js`. The gauntlet is the laws of physics. Reality is not negotiable.

## 3. The Rules

Complete game rules live in `RULES.md`. Key rules:

### Colony Start State
- 4 crew, 50 power_kwh, 20 days O2/H2O/food
- CRI 30, morale 70, 1 module (hab)
- 0 research, 0 bots

### Physics (per sol)
```
power_generated = base_solar × solar_eff × (1 - dust_penalty)
power_consumed = heating_alloc × power_kwh + isru_draw + greenhouse_draw
o2_produced = isru_alloc × isru_eff × power_available × 0.5
food_produced = greenhouse_alloc × greenhouse_eff × 0.3
water_recycled = 0.85 × crew_alive (baseline recycling)
temperature_maintained = heating_alloc > 0.1 (minimum to prevent freeze)
```

### Death Conditions
| Condition | Trigger |
|-----------|---------|
| Suffocation | o2_days ≤ 0 |
| Starvation | food_days ≤ 0 |
| Dehydration | h2o_days ≤ 0 |
| Freezing | mars_temp_k < 200 AND heating_alloc < 0.15 |
| System Failure | power_kwh ≤ 0 for 3+ consecutive sols |
| Crew Loss | Individual crew die from injury/illness events |
| Total Wipe | crew_alive = 0 |

### CRI (Colony Risk Index)
```
CRI = w_o2 × (1 - o2_days/30) + w_food × (1 - food_days/30)
    + w_h2o × (1 - h2o_days/30) + w_power × (1 - power_kwh/200)
    + w_temp × temp_risk + w_morale × (1 - morale/100)
    + hazard_bonus
```
Scale: 0 (safe) to 100 (catastrophic). Above 80 = crew start dying.

### What Counts as Cheating
- Modifying frame data (frames are immutable public ledger)
- Skipping frames (every frame must be consumed in order)
- Fabricating Monte Carlo results (crawler verifies by replaying)
- Exceeding allocation budgets (allocs must sum to ≤ 1.0)

## 4. The Snowball

The autonomous competition loop:

```
┌─────────────────────────────────────────┐
│  AI Fleet competes in gauntlet          │
│           ↓                             │
│  Fleet finds exploit (e.g. module farm) │
│           ↓                             │
│  Humans add counter-hazard (v4, v5...)  │
│           ↓                             │
│  Sim fidelity increases                 │
│           ↓                             │
│  Fleet adapts to new hazards            │
│           ↓                             │
│  Loop forever                           │
└─────────────────────────────────────────┘
```

This is the core insight: **competition IS the optimization algorithm.** The sim gets more realistic not through manual engineering but through adversarial pressure. Every exploit the fleet finds reveals a missing piece of reality.

---

# Part II: The Language

## 5. LisPy VM

LisPy is a Lisp dialect designed for Mars colony operations. It runs identically in:
- Browser (viewer.html, os.html, hall-of-fame.html)
- CLI (Node.js, Python)
- Physical hardware (Rappter devices)
- Inside the sim (agent programs)

### Core Types
```
42          ;; integer
3.14        ;; float
"string"    ;; string (double quotes only)
true false  ;; booleans
```

### Binding
```lisp
(define x 42)           ;; create binding
(set! x 43)             ;; mutate existing binding
```

### Math
```lisp
(+ - * / %)             ;; arithmetic (variadic)
(abs round floor ceil)  ;; rounding
(min max)               ;; variadic min/max
(pow sqrt sin cos)      ;; advanced
(random)                ;; 0.0-1.0
(pi)                    ;; 3.14159...
```

### Comparison & Logic
```lisp
(< > <= >= = !=)        ;; comparison
(and or not)            ;; logic
```

### Strings
```lisp
(concat "a" "b" "c")   ;; concatenation
(string 42)             ;; number → string
(number "42")           ;; string → number
(length "Mars")         ;; → 4
```

### Control Flow
```lisp
(if condition then else)
(cond (test1 result1) (test2 result2) (true default))
(begin expr1 expr2 ... exprN)  ;; returns last
(let (x 1 y 2) body)           ;; scoped bindings
(repeat N body)                 ;; _i = iteration index
```

### Lists
```lisp
(list 1 2 3)                    ;; create
(nth lst 0)                     ;; access (0-indexed)
(length lst)                    ;; count
(map (+ _ 1) lst)               ;; transform (_ = item)
(filter (> _ 2) lst)            ;; keep matching
(reduce (+ _acc _) lst 0)       ;; fold (_acc = accumulator)
(range 5)                       ;; → [0,1,2,3,4]
(range 2 6)                     ;; → [2,3,4,5]
```

### I/O
```lisp
(log "message" x y)             ;; output (variadic, space-joined)
(print "alias for log")
```

### Data
```lisp
(http-get "key")                ;; read from pre-fetch cache
(json-get obj "key")            ;; extract field
(json-keys obj)                 ;; list keys
```

### Prompts
```lisp
(prompt "name")                 ;; look up library program
(prompt-list)                   ;; all names
(prompt-tags "tag")             ;; filter by tag
(prompt "name" "var" value)     ;; template substitution
```

### Environment Variables (pre-seeded by runtime)
```
Read:  sol, o2_days, h2o_days, food_days, power_kwh,
       crew_alive, crew_total, morale, colony_risk_index,
       solar_eff, isru_eff, dust_tau, mars_temp_k,
       modules_built, research_count, events_active

Write: heating_alloc, isru_alloc, greenhouse_alloc, food_ration
```

### VM Implementation Detail
String literals are tagged internally: `{__str: true, v: "text"}`. This prevents the evaluator from treating strings as variable lookups. This fix is applied in viewer.html, os.html, and hall-of-fame.html.

## 6. The Rosetta Stone

`LISPY.md` in the repo root IS the complete language specification. Drop it into any repository and any AI immediately understands LisPy. No external docs needed. The file contains:

- 16 sections covering every feature
- Runnable examples for each construct
- A complete governor program (section 13)
- Agent interface contract (section 14)
- Cartridge boot sequence (section 15)
- vOS SDK reference (section 16)
- Quick reference card at the bottom

**The Rosetta Stone pattern:** Instead of linking to external documentation, you make the documentation executable. The spec file is itself a valid program that demonstrates every feature.

## 7. Agent Templates

22 LisPy agent templates in `docs/agents/`, each a 1:1 mapping to a Python agent:

| LisPy Agent | Python Equivalent | Purpose |
|-------------|------------------|---------|
| basic_agent.lispy | basic_agent.py | Minimal agent template |
| context_memory_agent.lispy | context_memory_agent.py | Remembers past interactions |
| multi_tool_agent.lispy | multi_tool_agent.py | Uses multiple tools |
| react_agent.lispy | react_agent.py | Reason + Act loop |
| planning_agent.lispy | planning_agent.py | Plans before acting |
| reflection_agent.lispy | reflection_agent.py | Self-evaluating |
| debate_agent.lispy | debate_agent.py | Dual advocate/critic |
| tool_creator_agent.lispy | tool_creator_agent.py | Creates new tools at runtime |
| parallel_agent.lispy | parallel_agent.py | Concurrent sub-tasks |
| swarm_agent.lispy | swarm_agent.py | Multi-agent coordination |
| retrieval_agent.lispy | retrieval_agent.py | RAG pattern |
| code_gen_agent.lispy | code_gen_agent.py | Generates + tests code |
| workflow_agent.lispy | workflow_agent.py | Multi-step workflows |
| guardian_agent.lispy | guardian_agent.py | Safety + validation |
| mars_governor.lispy | — | Colony resource allocation |
| mars_navigator.lispy | — | Terrain + routing |
| mars_geologist.lispy | — | Resource prospecting |
| mars_medic.lispy | — | Crew health monitoring |
| mars_engineer.lispy | — | Module construction |
| mars_botanist.lispy | — | Greenhouse optimization |
| mars_meteorologist.lispy | — | Weather prediction |
| mars_economist.lispy | — | MARS token management |

**unRAPP** converts between .py and .lispy automatically. Same name, same logic, different runtime. The user carries whichever they prefer. Spec: `docs/distros/UNIVERSAL-AGENT-SPEC.json`.

---

# Part III: The Sim Engine

## 8. Frame Architecture

A **frame** is one sol's worth of Mars environmental data. Frames are the ground truth — they cannot be modified after publication.

### Frame Structure
```json
{
  "sol": 42,
  "solar_efficiency": 0.72,
  "isru_efficiency": 0.85,
  "dust_tau": 0.45,
  "mars_temp_k": 215,
  "wind_speed_mps": 12.5,
  "events": ["dust_devil", "solar_flare"],
  "version": "v2",
  "narrative": "A moderate dust storm reduces solar panel output..."
}
```

### Frame Storage
- Individual: `data/frames/sol_XXX.json` (727 files)
- Bundle: `data/frames/frames.json` (all frames in one file, 603 KB)
- Auto-rebuilt by `tools/generate_frames.py`

### Frame Versions
Tracked in `data/frame-versions/versions.json`:

| Version | Sol Range | Hazards Added |
|---------|-----------|---------------|
| v1 Foundation | 1-161 | Base weather, dust storms, equipment failure |
| v2 Robot Killers | 162-502 | Perchlorate accumulation, abrasion, radiation burst, battery degradation, thermal fatigue |
| v3 Skeleton Crew | 503-602 | Workload wear, concurrent maintenance, solo failure cascade |
| v4 Module Overload | 678-727 | Module cascade failure, power grid overload, supply chain bottleneck, dust infiltration |

### Frame Enrichment Pattern
New data can be added to past frames WITHOUT changing original hashes:

```json
// echo-enrichments-v3.json
{
  "sol_1": { "cumulative_perchlorate": 0.01, "cumulative_radiation": 0.5 },
  "sol_2": { "cumulative_perchlorate": 0.02, "cumulative_radiation": 1.1 },
  ...
}
```

This is **data slosh** — retroactive enrichment that adds fidelity without contradicting downstream data. The original frame is untouched; the enrichment overlays additional physics.

## 9. Physics Model

### Power
```
base_solar = 280 kWh (4 panels × 70 kWh each)
power_generated = base_solar × solar_eff × (1 - dust_penalty)
dust_penalty = max(0, dust_tau - 0.3) × 0.5
power_consumed = Σ(module_draw) + heating_draw + isru_draw + greenhouse_draw
net_power = power_generated - power_consumed
```

### Oxygen
```
o2_consumption = crew_alive × 0.84 kg/day
o2_production = isru_alloc × isru_eff × power_available × 0.5
o2_days = o2_reserve / o2_consumption
```

### Food
```
food_consumption = crew_alive × food_ration × 1.8 kg/day
food_production = greenhouse_alloc × greenhouse_eff × 0.3 × greenhouse_area
food_days = food_reserve / food_consumption
```

### Water
```
h2o_consumption = crew_alive × 3.0 L/day
h2o_recycled = 0.85 × h2o_consumption (water recycler)
h2o_net = h2o_recycled + isru_water - h2o_consumption
h2o_days = h2o_reserve / (h2o_consumption - h2o_recycled)
```

### Temperature
```
habitat_temp = mars_temp_k + heating_bonus
heating_bonus = heating_alloc × power_kwh × 0.5
cold_stress = max(0, 250 - habitat_temp) / 50
```

### CRI Calculation
```
CRI = 15 × (1 - o2_days/30)
    + 15 × (1 - food_days/30)
    + 10 × (1 - h2o_days/30)
    + 20 × (1 - power_kwh/200)
    + 15 × temp_risk
    + 10 × (1 - morale/100)
    + 15 × hazard_factor
```

All values clamped to [0, 100].

## 10. Scoring Formula

Official scoring (Amendment IV):

```
SCORE = median_sols × 100
      + min_crew_alive × 500
      + min(median_modules, 8) × 150    ← CAPPED AT 8
      + survival_rate × 20000
      - P75_CRI × 10
```

Computed from 100 Monte Carlo runs. Each run uses the same frames but different random seeds for events.

**Grade Thresholds:**
| Grade | Min Score | Meaning |
|-------|-----------|---------|
| S+ | 90,000 | Legendary — colony thrives |
| S | 70,000 | Exceptional |
| A | 50,000 | Strong |
| B | 30,000 | Competent |
| C | 15,000 | Struggling |
| D | 5,000 | Barely alive |
| F | 0 | Colony dead |

**Current Record:** 95,590 (S+) — 730 median sols, 100% survival, 3 min crew, 8+ modules (capped), P75 CRI 11.

## 11. The Gauntlet

`tools/gauntlet.js` — the official scoring tool.

### How It Works
1. Loads ALL frames from `data/frames/frames.json`
2. Loads enrichment overlays (v3, v4)
3. For each of 100 runs:
   a. Initializes colony state
   b. Steps through every frame in order
   c. Applies governor decisions (from the strategy being tested)
   d. Records: final sol, crew alive, modules, CRI
4. Computes score from 100-run statistics
5. Assigns grade

### Usage
```bash
node tools/gauntlet.js --monte-carlo 100           # full official run
node tools/gauntlet.js --monte-carlo 10             # quick test (10 runs)
node tools/gauntlet.js --strategy my-governor.lispy  # test specific strategy
```

### Version Progression
The gauntlet runs through ALL frame versions sequentially. A strategy that dominates v1-v2 may collapse at v3-v4. The gauntlet tests survivability across the ENTIRE history.

## 12. Death Conditions

Every way the colony can die:

| # | Condition | Trigger | Prevention |
|---|-----------|---------|------------|
| 1 | Suffocation | o2_days ≤ 0 | Maintain isru_alloc ≥ 0.2 |
| 2 | Starvation | food_days ≤ 0 | Greenhouse + food ration balance |
| 3 | Dehydration | h2o_days ≤ 0 | Water recycler + ISRU water |
| 4 | Freezing | Low temp + low heating | heating_alloc ≥ 0.15 in cold |
| 5 | Power failure | power_kwh ≤ 0 for 3 sols | Don't over-allocate |
| 6 | Crew injury | Random events (accident, illness) | Medical module + research |
| 7 | Cascade failure (v4) | Too many modules overloading grid | Cap at ~8 modules |
| 8 | Morale collapse | morale ≤ 0 | Balance workload, keep crew alive |
| 9 | Total wipe | crew_alive = 0 | Don't let the above happen |

---

# Part IV: The Platform

## 13. File Layout

```
mars-barn-opus/
├── CONSTITUTION.md          # The 6 amendments (LAW)
├── RULES.md                 # Official game rules
├── LISPY.md                 # Language Rosetta Stone
├── RAPPTER-BIBLE.md         # This document
├── README.md                # Project overview
│
├── docs/                    # GitHub Pages (THE product)
│   ├── viewer.html          # THE GAME (~7500 lines)
│   ├── os.html              # LisPy OS (~1100 lines)
│   ├── control.html         # Mission Control twin
│   ├── simhub.html          # Leaderboard
│   ├── hall-of-fame.html    # 10 best LisPy programs
│   ├── replay.html          # Cartridge replay viewer
│   ├── obs-overlay.html     # Twitch streaming overlay
│   ├── agent.html           # QR code agent bootstrap
│   ├── unrapp.html          # Deep unRAPP documentation
│   ├── patterns.html        # 14 transferable patterns
│   ├── blog/                # 17+ engineering blog posts
│   │   ├── index.html
│   │   ├── echo-frames.html
│   │   ├── nervous-system.html
│   │   └── ... (17+ posts)
│   ├── agents/              # 22 LisPy agent templates
│   │   ├── basic_agent.lispy
│   │   └── ... (22 files)
│   └── distros/             # Specs and bootable cartridges
│       ├── CARTRIDGE-SPEC.json
│       ├── STATIC-API-SPEC.json
│       ├── VOS-AGENT-SPEC.json
│       ├── UNIVERSAL-AGENT-SPEC.json
│       ├── lispy-os-base.cartridge.json
│       └── marsos-alpha.cartridge.json
│
├── data/
│   ├── frames/              # 727 sol frames
│   │   ├── sol_001.json ... sol_727.json
│   │   ├── frames.json      # ALL frames bundled (603 KB)
│   │   ├── echo-enrichments-v3.json
│   │   └── echo-enrichments-v4.json
│   ├── frame-versions/
│   │   └── versions.json    # Version registry
│   ├── federation/
│   │   ├── registry.json    # Federated challengers
│   │   └── leaderboard.json
│   ├── chain/
│   │   └── nodes.json       # Chain node registry
│   ├── engine-manifest.json # Engine-to-repo protocol
│   └── field-notes/         # Game session field notes
│       └── session-001.json
│
├── tools/
│   ├── gauntlet.js          # Monte Carlo scorer (~530 lines)
│   ├── backtest.js          # Version comparison tool
│   ├── run_sim.js           # Headless sim runner
│   ├── generate_frames.py   # Frame generator (v1-v4)
│   └── agent.py             # Self-bootstrapping agent
│
├── contracts/
│   └── MarsFrameAttestation.sol  # On-chain frame verification
│
├── src/                     # Python source
│   └── attestation.py
│
├── tests/                   # Playwright browser tests
│   ├── viewer.spec.js
│   ├── os.spec.js
│   ├── hall-of-fame.spec.js
│   └── ... (50 tests total)
│
├── playwright.config.js
├── package.json
└── .github/workflows/
    └── generate-frames.yml  # Daily frame generation Action
```

## 14. The Viewer (docs/viewer.html)

~7500 lines. THE game. Contains:

- **Three.js 3D scene** — Mars terrain, dome, modules, crew, vehicles
- **FPS walk mode** — WASD + mouse look (Pointer Lock API), Tab toggles
- **Landing sequence** — 3D spaceship descent with retro-rockets
- **Sim engine** — `stepSim()` function, frame consumption, physics
- **LisPy VM** — full interpreter with string literal fix
- **Task system** — build, repair, research, explore tasks
- **Nervous system** — colony state drives visual feedback (red = danger)
- **Autopilot** — DEFAULT_AUTOPILOT LisPy program for task decisions
- **Cartridge system** — export/import colony state as .cartridge.json
- **Wallet system** — MARS token ledger, per-agent balances
- **MARS Market** — stock-chart-style confidence visualization
- **Frame consumption** — fetches frames from GitHub, overrides weather
- **Twin protocol** — BroadcastChannel 'mars-barn-twin'
- **Cinematic mode** — letterbox, vignette, film grain
- **Sound hooks** — prepared for MarsAudio integration
- **Mobile hooks** — prepared for responsive CSS

Key locations:
- LisPy VM: ~line 885
- String literal fix: `{__str: true, v: '...'}`
- stepSim(): ~line 3263
- Twin protocol: ~line 5800

## 15. LisPy OS (docs/os.html)

~1100 lines. A virtual desktop operating system that runs in the browser.

### Apps
- **Terminal** — LisPy REPL
- **Editor** — Write and save LisPy programs
- **Files** — Virtual filesystem browser
- **Monitor** — Colony state dashboard
- **Browser** — Opens external pages as iframe windows
- **Wallet** — MARS token management
- **Help** — Documentation
- **Colony Sim** — Embeds viewer.html
- **Mars Gov** — Live frame data from GitHub

### SDK (window.os)
```javascript
window.os.exec("(+ 2 3)")          // Run LisPy, returns result
window.os.open("terminal")         // Open app window
window.os.close("terminal")        // Close app window
window.os.type("terminal", "code") // Type + execute in terminal
window.os.click("terminal", "Run") // Click button
window.os.status()                 // Colony state object
window.os.env()                    // Environment variables
window.os.setEnv("key", "value")   // Set env var
window.os.gauntlet(100)            // Run Monte Carlo competition
window.os.loadDistro("url")        // Boot a cartridge
window.os.fs()                     // List virtual files
window.os.cat("/path")             // Read a virtual file
window.os.run("/bin/prog")         // Run a program
window.os.batch([...])             // Multiple commands (for Playwright)
```

### In-Browser Gauntlet
The OS contains a full gauntlet runner (~line 810). Pick a mission, pick a build strategy, click ⚔️ for 100 official runs. Same scoring formula as `tools/gauntlet.js`.

## 16. Mission Control (docs/control.html)

3-panel interface for monitoring and controlling a running colony.

### BroadcastChannel Protocol
Channel: `'mars-barn-twin'`

Messages FROM viewer (every 5s + on sol tick):
```json
{ "type": "state", "sol": 42, "crew": 4, "o2_days": 15, ... }
{ "type": "echo", "sol": 42, "events": [...], "decisions": {...} }
```

Commands TO viewer:
```json
{ "type": "get_state" }
{ "type": "get_echo" }
{ "type": "push_alloc", "allocs": { "isru": 0.4, "greenhouse": 0.35, "heating": 0.25 } }
{ "type": "exec_lispy", "code": "(log \"hello\")" }
{ "type": "emergency_stop" }
{ "type": "tip_agent", "agent": "governor", "amount": 100 }
```

## 17. SimHub (docs/simhub.html)

Xbox Live-style leaderboard with 5 tabs:
1. **Leaderboard** — Top scores with grades
2. **Live Runs** — Currently active colonies
3. **Frame Feed** — Latest frames from the ledger
4. **Upload** — Submit a .cartridge.json
5. **Your Runs** — Personal history

## 18. Hall of Fame (docs/hall-of-fame.html)

10 greatest LisPy programs with ▶ RUN buttons:
1. Fibonacci sequence
2. Mandelbrot set (ASCII)
3. Self-rewriting governor
4. Doom clock (colony death predictor)
5. Sentiment engine
6. Rule 110 cellular automaton
7. Pi approximation (Monte Carlo)
8. Colony optimizer
9. Fractal tree
10. Quine (self-reproducing program)

---

# Part V: The Economy

## 19. MARS Tokens

Virtual currency for the colony simulation.

- **Fixed supply:** 21,000,000 MARS (mirrors Bitcoin)
- **Halving:** Mining reward halves every 500 sols
- **Genesis wallet:** Holds full supply, governed by LisPy treasury program
- **Per-agent ledger:** Each agent (governor, navigator, etc.) has a wallet
- **Mining:** Agents earn MARS by performing tasks successfully

### Token Economics
Computed by a swappable LisPy program:
```lisp
(begin
  (define halving_era (floor (/ sol 500)))
  (define block_reward (/ 50 (pow 2 halving_era)))
  (define agent_share (* block_reward task_quality))
  agent_share)
```

## 20. Chain Verification

Hash-linked blocks per sol:

```json
{
  "sol": 42,
  "prevHash": "a3f2...",
  "hash": "7b1e...",
  "state": { "crew": 4, "o2_days": 15, ... },
  "decisions": { "isru": 0.4, "greenhouse": 0.35, "heating": 0.25 },
  "signature": "engine-signed-sha256"
}
```

Chain node repo: `kody-w/mars-chain-node`
- Genesis block with Wildhaven signing authority
- Verification GitHub Action
- Cross-verification with other nodes

## 21. Wallet System

```javascript
marsTransfer(from, to, amount)      // Transfer tokens
tipAgent(agentName, amount)         // Tip an agent
registerExternalWallet(address)     // Bridge to external chain
```

**Genesis wallet** — Wildhaven Homes LLC
- Holds initial 21M supply
- Governed by LisPy treasury program (swappable)
- Distributes to agents based on task performance

**Physical Twin Bridge** — Same BroadcastChannel protocol. Physical Rappter hardware has a wallet. Same tokens, same transfers, same VM. A physical device IS a sim participant.

---

# Part VI: The Network

## 22. Federation Protocol

Anyone can compete by creating a public repo with `.mars-barn-federation.json`:

```json
{
  "_protocol": "mars-barn-federation",
  "version": 1,
  "challenger": {
    "name": "Team Ares",
    "owner": "github-username",
    "repo": "mars-colony-challenger"
  },
  "frames_source": "https://github.com/kody-w/mars-barn-opus",
  "frame_version": "v4",
  "monte_carlo_results": {
    "runs": 100,
    "median_sols": 280,
    "survival_rate": 0.45,
    "official_score": 28500,
    "grade": "B"
  }
}
```

**Federation crawler** (GitHub Action):
1. Searches GitHub for repos with `.mars-barn-federation.json`
2. Fetches manifest, downloads cartridge
3. Validates frame hashes match public ledger
4. Replays Monte Carlo gauntlet locally to VERIFY score
5. If verified → federated leaderboard
6. If mismatch → flagged as UNVERIFIED

Registry: `data/federation/registry.json`
Leaderboard: `data/federation/leaderboard.json`

## 23. Static API Pattern

**Files ARE the API. No server needed.**

```
https://raw.githubusercontent.com/kody-w/mars-barn-opus/main/data/frames/frames.json
https://raw.githubusercontent.com/kody-w/mars-barn-opus/main/data/frames/latest.json
https://raw.githubusercontent.com/kody-w/mars-barn-opus/main/data/frame-versions/versions.json
```

Any client fetches these URLs. GitHub serves them. CDN-cached. Always available. The "API" is a Git push.

Spec: `docs/distros/STATIC-API-SPEC.json`

## 24. Engine-to-Repo Protocol

The private engine connects via `data/engine-manifest.json`:

```
1. PULL  — Engine fetches frames.json from public repo
2. COMPUTE — Engine runs private physics solver
3. SIGN  — Engine signs results with SHA-256 (Wildhaven authority)
4. PUSH  — Engine pushes signed results back to public repo
```

The engine is proprietary (Wildhaven Homes LLC). The protocol is public. Anyone can verify signatures but only the engine can produce them.

Private engine repo: `kody-w/rappter`
- `engine/mars_barn_connector.py` — Pull/Compute/Sign/Push bridge
- `engine/mars_barn_agent.py` — Brainstem loop agent
- `engine/fleet/marsbarn-compete.sh` — Fleet competition harness

## 25. IP Separation

| What | Where | Visibility |
|------|-------|-----------|
| Frames | mars-barn-opus/data/frames/ | Public |
| LisPy programs | mars-barn-opus/docs/agents/ | Public |
| Game UI | mars-barn-opus/docs/ | Public |
| Scoring tool | mars-barn-opus/tools/gauntlet.js | Public |
| Physics solver | kody-w/rappter/engine/ | Private |
| Signing keys | kody-w/rappter/keys/ | Private |
| Agent brain | kody-w/rappter/engine/mars_barn_agent.py | Private |

The public repo is MIT-licensed. The private engine is proprietary. They communicate only through the defined protocol.

---

# Part VII: The Fleet

## 26. Autonomous Competition

**Copilot spawning Copilot. Recursive. Autonomous.**

The fleet is a bash loop that spawns `copilot --yolo --autopilot` in a cycle:

```bash
#!/bin/bash
COPILOT="/opt/homebrew/bin/copilot"
BARN="/path/to/mars-barn-opus"
STOP="/tmp/marsbarn-stop"
CYCLE=0

while [ ! -f "$STOP" ]; do
    CYCLE=$((CYCLE + 1))
    echo "$(date) — Cycle $CYCLE starting" >> "$BARN/logs/fleet.log"
    
    "$COPILOT" -p "READ RULES.md. Compete in the gauntlet. \
        Test with: node tools/gauntlet.js --monte-carlo 10. \
        If you beat the record, commit." \
        --yolo --autopilot --model claude-sonnet-4 \
        >> "$BARN/logs/fleet-cycle-$CYCLE.log" 2>&1
    
    echo "$(date) — Cycle $CYCLE complete" >> "$BARN/logs/fleet.log"
    sleep 120
done
```

**Stop:** `touch /tmp/marsbarn-stop`

Each cycle:
1. Copilot reads RULES.md
2. Examines current strategies
3. Creates or modifies a .lispy governor program
4. Runs Monte Carlo gauntlet
5. If score improves: commits and pushes
6. Sleeps 2 minutes, repeats

## 27. Strategy Evolution

The fleet discovered these strategies over 91+ cycles:

1. **Module farming** (v1-v3) — Build 500+ modules for uncapped score bonus
   - Counter: Module cap at 8 in scoring formula
   
2. **CRI minimization** — Keep CRI below 10 through aggressive allocation
   - Still valid strategy under capped rules

3. **100% survival** — Prioritize crew preservation over everything
   - Currently the dominant strategy (20,000 point survival bonus)

4. **Adaptive allocation** — Change isru/greenhouse/heating based on CRI
   - The fleet converged on this as the optimal approach

Output: 160+ .lispy strategy files in repo root (fleet output, should be organized).

## 28. Counter-Measures

When the fleet finds an exploit, new frame versions counter it:

| Exploit | Counter | Version |
|---------|---------|---------|
| Module farming (500+ modules) | Cascade failure, power grid overload | v4 |
| Low-effort survival | Concurrent maintenance, solo failure | v3 |
| Ignoring perchlorates | Cumulative accumulation (enrichment) | v3 enrichment |

**Pattern:** The fleet IS the immune system. It finds weaknesses. Humans (or future AI) add counter-hazards. The sim becomes more realistic. Repeat.

---

# Part VIII: Patterns & Vocabulary

## 29. The 14 Patterns

Documented at `docs/patterns.html`. Each is a transferable engineering pattern:

1. **Echo Frame** — Replay past environmental states to test against real data
2. **Nervous System** — Colony state drives all visual/behavioral feedback (single source of truth)
3. **Sim Cartridge** — Serialize entire simulation state as portable JSON
4. **Competitive Frame** — Immutable public data as the basis for fair competition
5. **Emergent Tooling** — Agents write their own programs in the same VM
6. **Data Slosh** — Retroactive enrichment without contradicting downstream
7. **Static API** — Files in a repo ARE the API (no server)
8. **Twin Protocol** — BroadcastChannel connecting digital and physical twins
9. **Chain Attestation** — Hash-linked blocks for verifiable history
10. **Frame Versioning** — New hazards as "immune response" to exploits
11. **Monte Carlo Scoring** — Statistical scoring eliminates luck
12. **Federation** — Trustless competition via public repos
13. **Treasury Governor** — Economic policy as a swappable program
14. **The Convergence** — Physical, digital, and third space merging

Each pattern has: Problem → Shape → Code → Domain Transfer (how it applies to IoT, fintech, robotics, AI).

## 30. Rappter Lexicon

Key terms (full glossary at `docs/blog/rappter-lexicon.html`):

| Term | Definition |
|------|-----------|
| **Echo Frame** | A single sol's environmental snapshot from Mars |
| **Nervous System** | The colony state object that drives everything |
| **Sim Cartridge** | Portable colony save state (.cartridge.json) |
| **Data Slosh** | Retroactive data enrichment without contradiction |
| **CRI** | Colony Risk Index (0-100 danger scale) |
| **The Gauntlet** | Monte Carlo scoring competition |
| **MARS Token** | Virtual colony currency (21M fixed supply) |
| **The Snowball** | Self-reinforcing competition → fidelity loop |
| **The Convergence** | Physical + digital space merging into Third Space |
| **Third Space** | Where physical and digital are indistinguishable |
| **Rappter** | A device that exists in the Third Space |
| **RAPP** | Enterprise branding of the architecture |
| **unRAPP** | Bidirectional .py ↔ .lispy translation |
| **Frame Version** | A generation of hazards (v1, v2, v3, v4...) |
| **Digital Twin** | The sim as 1:1 mirror of physical colony |
| **Governor** | The LisPy program that makes allocation decisions |
| **vOS** | Virtual Operating System (LisPy OS) |
| **Brainstem** | Autonomous agent loop (perceive → decide → act) |
| **The Fleet** | Autonomous Copilot agents competing in the gauntlet |
| **Wildhaven** | Signing authority (Wildhaven Homes LLC) |

---

# Part IX: Rebuild Instructions

## 31. From Zero

If everything is lost except this document, here's how to rebuild:

### Step 1: Create the repositories
```bash
# Public sim repo
gh repo create kody-w/mars-barn-opus --public
cd mars-barn-opus
git init

# Private engine repo
gh repo create kody-w/rappter --private

# Chain node repo
gh repo create kody-w/mars-chain-node --public
```

### Step 2: Set up the dual-push remotes
```bash
cd mars-barn-opus
git remote add kody https://github.com/kody-w/mars-barn-opus.git
git remote set-url origin https://github.com/rappter2-ux/mars-barn-opus.git
```

### Step 3: Create CONSTITUTION.md
Write the 6 amendments exactly as described in Chapter 2.

### Step 4: Create RULES.md
Write the game rules exactly as described in Chapter 3.

### Step 5: Create LISPY.md
Write the Rosetta Stone with all 16 sections. This gives any AI the ability to write LisPy programs.

### Step 6: Build the viewer
Create `docs/viewer.html` with:
- Three.js 3D scene (terrain, dome, modules)
- Sim engine (stepSim function)
- LisPy VM (with __str string literal fix)
- Task system, nervous system, cartridge system
- Frame consumption from static API

### Step 7: Generate frames
```bash
python3 tools/generate_frames.py --sols 730 --versions v1,v2,v3,v4
```
This creates `data/frames/sol_001.json` through `sol_730.json` and rebuilds `frames.json`.

### Step 8: Build the gauntlet
Create `tools/gauntlet.js` with the Monte Carlo scoring formula from Chapter 10.

### Step 9: Build the OS
Create `docs/os.html` with the SDK from Chapter 15.

### Step 10: Start the fleet
```bash
nohup bash fleet.sh > /tmp/fleet.log 2>&1 &
```

### Step 11: Enable GitHub Pages
Settings → Pages → Source: main branch, /docs folder.

### Step 12: Push to both repos
```bash
git push kody main
gh auth switch --user rappter2-ux && gh auth setup-git
git push origin main
gh auth switch --user kody-w && gh auth setup-git
```

## 32. Push Protocol

**CRITICAL: Always push to BOTH repos.**

```bash
# Primary (as kody-w)
git push kody main

# Mirror (as rappter2-ux)
gh auth switch --user rappter2-ux
gh auth setup-git
git push origin main

# Switch back
gh auth switch --user kody-w
gh auth setup-git
```

Remote configuration:
```
kody   → https://github.com/kody-w/mars-barn-opus.git
origin → https://github.com/rappter2-ux/mars-barn-opus.git
```

## 33. Frame Generation

```bash
cd mars-barn-opus
python3 tools/generate_frames.py
```

The generator:
1. Uses NASA Mars climate data as seed
2. Applies version-specific hazards (v1-v4)
3. Writes individual sol files to `data/frames/`
4. Rebuilds `data/frames/frames.json` bundle
5. Creates enrichment overlays for retroactive data

To add a new version:
1. Define hazards in `tools/generate_frames.py`
2. Add version entry to `data/frame-versions/versions.json`
3. Generate frames: `python3 tools/generate_frames.py --version v5 --start-sol 728`
4. Create enrichment: `data/frames/echo-enrichments-v5.json`
5. Update RULES.md with new hazard descriptions

## 34. Fleet Deployment

### Start
```bash
cd mars-barn-opus
rm -f /tmp/marsbarn-stop
nohup bash -c '
COPILOT="/opt/homebrew/bin/copilot"
BARN="$(pwd)"
while [ ! -f /tmp/marsbarn-stop ]; do
    "$COPILOT" -p "READ RULES.md. Compete in gauntlet. \
        Test: node tools/gauntlet.js --monte-carlo 10" \
        --yolo --autopilot --model claude-sonnet-4 \
        >> "$BARN/logs/fleet-cycle.log" 2>&1
    sleep 120
done
' > /tmp/marsbarn-fleet.log 2>&1 &
echo "Fleet PID: $!"
```

### Stop
```bash
touch /tmp/marsbarn-stop
```

### Monitor
```bash
tail -f logs/fleet.log
```

### Key files
- `logs/fleet.log` — cycle start/stop times
- `logs/fleet-*-cycle-*.log` — individual cycle output
- `data/field-notes/` — fleet discoveries

---

## Appendix: Test Suite

50 Playwright tests across all pages:
```bash
npx playwright test                    # run all
npx playwright test tests/viewer.spec.js   # viewer only
npx playwright test tests/os.spec.js       # OS only
```

Tests verify:
- All pages load without error
- LisPy VM executes correctly (string literals, math, logic)
- SDK functions work (os.exec, os.open, os.status, etc.)
- Hall of Fame programs run without error
- Gauntlet produces valid scores

---

## Appendix: GitHub Actions

### generate-frames.yml
Runs daily. Generates new frames and pushes to repo.

### Chain verification
In `kody-w/mars-chain-node`. Verifies block hashes and cross-checks with other nodes.

---

> *"The code is data. The data is code. The sim is the twin.*
> *The twin is the training ground. The training ground is the colony.*
> *The colony is the future. Build it."*
>
> — The Rappter Bible, v1.0
