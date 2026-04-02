# First Principles to Mars

*Formerly Mars Barn Opus — the 1vsM Protocol*

**An Oregon Trail for Mars. Hyper-realistic colony survival simulation where AI keeps humans (and robots) alive — or doesn't. Pick a mission. Watch your colony. Learn from the post-mortem. Write a better AI. Try again.**

**For classrooms, robotics clubs, and anyone who wants to go to Mars.**

**[Play it live](https://rappter2-ux.github.io/mars-barn-opus/)** | **[3D Colony RTS](https://rappter2-ux.github.io/mars-barn-opus/rts.html)** | **[3D Viewer](https://rappter2-ux.github.io/mars-barn-opus/viewer.html)** | **[Split-Screen](https://rappter2-ux.github.io/mars-barn-opus/splitscreen.html)** | **[Timelapse](https://rappter2-ux.github.io/mars-barn-opus/timelapse.html)** | **[Multiplayer](https://rappter2-ux.github.io/mars-barn-opus/multiplayer.html)**

## Why this exists

The question isn't "can we get to Mars?" It's "can we STAY on Mars — without calling home?"

Mars Barn Opus simulates that question. An AI governor manages a colony autonomously. No human intervention. If it needs a human, the mission fails. The scoreboard tracks one number: **how many sols without human contact.**

A score of 500+ means the AI is ready. Anything less means the colony would have needed Earth to survive — and on Mars, Earth is 4-24 minutes away. Sometimes that's too late.

## Choose your mission (Oregon Trail style)

| Mission | Crew | Difficulty | Strategy |
|---------|------|-----------|----------|
| **Optimus Pathfinder** | 4 Tesla bots | Medium | Pure robot autonomy, no humans needed |
| **Lunar Testbed** | 2 bots | Hard | Prove it on the Moon first (14-day night!) |
| **Ares I: First Landing** | 4 humans | Medium | The classic Mars mission |
| **Skeleton Crew** | 2 humans | Hard | Every gram counts |
| **Garden of Mars** | 6 humans | Easy | Double reserves — but can you sustain it? |
| **Dust Bowl** | 4 humans | Extreme | Land during dust season |
| **ISRU Down** | 4 humans | Extreme | No local O2/H2O production |
| **Hybrid Colony** | 2 humans + 4 bots | Medium | The real future of Mars |

## For educators

- **Physics**: real Mars atmosphere, solar irradiance, thermal dynamics, radiation
- **Engineering**: resource management, system failures, failure cascades
- **Computer Science**: write your own governor AI in LisPy (a safe, sandboxed Lisp)
- **Robotics**: physical twin hardware spec with pin mappings and wiring diagrams
- **Game theory**: multi-colony trade, sabotage, Prisoner's Dilemma
- **Data science**: genetic algorithm evolution, Monte Carlo scoring, confidence intervals
- **Ethics**: who lives? who gets the food? when do you sacrifice a module?

Zero dependencies. Runs in any browser. Works offline. Open source.

## Run it

```bash
python3 src/sim.py --mission-control              # Watch autonomous colony
python3 src/sim.py --mission-control --speed 5     # Faster
python3 src/sim.py --play                          # You are the governor
python3 src/sim.py --benchmark                     # Test all 10 archetypes
python3 src/sim.py --leaderboard                   # Monte Carlo scoring
python3 src/sim.py --evolve                        # Breed optimal governor DNA
python3 src/sim.py --colonies 5 --sols 500         # Multi-colony competition
python3 src/sim.py --html report.html              # Generate HTML report
python3 -m pytest tests/ -v                        # 246 tests
```

**No dependencies. Python 3.9+ stdlib only.**

## What's in here

### Simulation Engine (24 Python modules)
| Module | What it does |
|--------|-------------|
| `config.py` | All constants. Zero magic numbers. NASA-sourced. |
| `mars.py` | Terrain, atmosphere, solar, thermal, radiation physics |
| `colony.py` | Resources, production, consumption, failure cascade |
| `crew.py` | Named crew: Chen W., Rodriguez M., Okafor A., Johansson K. |
| `governor.py` | 10 AI archetypes with memory + personality divergence |
| `events.py` | Dust storms, meteorites, flares, equipment failures |
| `world.py` | Multi-colony trade, sabotage, supply drops, game theory |
| `modules.py` | 9 buildable colony modules (greenhouse, ISRU, solar farm...) |
| `research.py` | 11 technologies across 3 tiers (tech tree) |
| `comms.py` | Earth-Mars communication with orbital light delay |
| `crew.py` | Individual health, fatigue, roles, death |
| `emergency.py` | 5 crisis response protocols |
| `geology.py` | Rover exploration: ice, minerals, caves, riverbeds |
| `economy.py` | RAPPcoin internal currency |
| `disasters.py` | Scenario editor + post-mortem investigation |
| `conversations.py` | AI crew dialogue (context-sensitive) |
| `journals.py` | Procedural crew journal entries |
| `dna.py` | Colony DNA fingerprint (visual history) |
| `evolution.py` | Genetic algorithm governor breeding |
| `scoring.py` | 5-dimension composite scoring + confidence intervals |
| `mission_control.py` | Terminal mission control with digital twin sync |
| `mission_log.py` | Sol-by-sol narrative log |
| `report.py` | HTML reports with inline SVG charts |
| `twin_spec.py` | Physical twin hardware specification |

### Web Experience (5 pages, zero dependencies)
| Page | What it does |
|------|-------------|
| **Dashboard** | 2D mission control with crew, resources, events |
| **3D Viewer** | Globe.gl planet → warmap → Three.js ground with day/night cycle |
| **Split-Screen** | Earth↔Mars with animated light delay signals |
| **Timelapse** | Cinematic colony lifecycle replay with DNA strip |
| **Multiplayer** | WebRTC peer-to-peer two-colony network |

### 3D Viewer Zoom Levels
```
PLANET → SURFACE → WARMAP → BASE → MODULES → CREW
(globe)   (zoom)   (2D map)  (3D)   (3D)    (overlay)
```

### Ground View Features
- Glass habitat dome with clearcoat material
- Airlock, landing pad with H markings
- 8 autonomous rovers with pathfinding
- Crew figures in colored EVA suits
- Day/night cycle synced to real Mars LMST
- Stars visible at night, sun tracks east→west
- Colony lights: pathway, beacons, floodlights, dome glow
- Dust particles drifting in wind (2000 in storms)
- Scattered Mars rocks on procedural terrain
- Built modules appear as 3D buildings with connection tubes
- Real NASA Mars weather data (30s refresh)

### Features the Swarm Doesn't Have
1. Named crew members who live and die individually
2. Mission Control digital twin interface
3. 3D viewer with Globe.gl + Three.js
4. Day/night cycle synced to real Mars time
5. Warmap tactical satellite view
6. Communication delay with orbital mechanics
7. Colony expansion (9 module types)
8. Research tree (11 technologies, 3 tiers)
9. Emergency protocols (5 crisis plans)
10. Crew journals (procedural storytelling)
11. Colony DNA fingerprint
12. Genetic algorithm governor evolution
13. Voice mission control (Web Speech API)
14. Supply chain (Earth-Mars logistics)
15. Split-screen Earth↔Mars with light delay
16. Multiplayer WebRTC (peer-to-peer)
17. Timelapse replay with film grain
18. Geological survey with rover discoveries
19. Colony economy (RAPPcoin)
20. Post-mortem investigation reports

## The Pipeline

```
DIGITAL TWIN (this software)
  ↓ twin-state.json updates every sol
EARTH REHEARSAL (physical hardware)
  ↓ same interface, same state contract
MARS COLONY (the endgame)
  ↓ same Mission Control, real consequences
```

See `src/twin_spec.py` for the complete hardware specification.

## Stats

| Metric | Solo (Opus) | Swarm (12 agents) |
|--------|-------------|-------------------|
| Source | 7,155 lines, 24 modules | 8,715 lines, 24 files |
| Tests | **246** (14 files) | 11 |
| Web pages | 5 (3,046 lines) | 0 |
| Features | 20+ unique | Basic sim only |
| Last commit | Active | Dormant 4+ days |

---

*Read the [CONSTITUTION.md](CONSTITUTION.md). Run the tests. Start Mission Control. Pick a side.*
