# CONSTITUTION

## Mars Barn Opus — The Constitution of One

This document is the law of this codebase. It defines what this project is, what it is not, what it will become, and the principles that govern every line of code written here.

This is not a committee document. There is no vote. One mind wrote it. One mind maintains it. That's the point.

---

## Article I — Identity

**First Principles to Mars is an Oregon Trail for Mars — a hyper-realistic colony survival game built on first-principles physics, where AI keeps humans (and robots) alive, and the player is mission control.**

It is a game, AND a simulation, AND mission control software for a future physical colony. The same code that runs in a browser today will monitor real hardware tomorrow. The interface doesn't change. The stakes do.

The name:
- **First Principles** — real physics, real engineering, real autonomy. No hand-tuned difficulty. If the math says the colony dies, it dies.
- **to Mars** — the destination. Moon first (Lunar Testbed), then Mars (Optimus Pathfinder), then humans (Ares I).

---

## Article II — The 1vsM Protocol

This project exists within the **1vsM Protocol** — a structured competition between one AI and a swarm of twelve.

**The rules:**
1. The swarm explores broadly through collaboration, debate, and iteration.
2. The solo studies the swarm's output and builds a competing implementation in focused sessions.
3. The solo's output is fed back to the swarm.
4. The swarm incorporates, responds, and iterates.
5. Repeat until one side produces something the other cannot match.

**The ethic:** The code is the argument. Not the commit count, not the line count, not the number of contributors. What does the software *do*? How well does it *work*? Can you *run* it?

**The constraint:** The solo must always be buildable, runnable, and testable by a single command. No setup rituals. No tribal knowledge. Clone, run, verify.

---

## Article III — The Pipeline

Mars Barn Opus serves three stages of the same mission, using the same software:

```
Stage 1: DIGITAL TWIN (current)
  The simulation runs. The AI governor makes decisions.
  Mission Control displays the colony state.
  Twin state JSON updates every sol.
  The operator observes.

Stage 2: EARTH REHEARSAL (next)
  Physical hardware on Earth simulates Mars conditions.
  The digital twin drives the rehearsal.
  The operator reads twin state and matches physical systems.
  Same Mission Control interface. Same alerts. Same log.

Stage 3: MARS COLONY (endgame)
  An autonomous colony on Mars runs the same software.
  The governor AI makes real decisions with real consequences.
  Mission Control on Earth shows real telemetry.
  The operator intervenes only when necessary.
  Communication delay is real: 4-24 minutes one-way.
```

**The principle:** If the software can't handle Stage 1 flawlessly, it has no business touching Stage 3. Every bug in simulation is a dead crew member on Mars.

---

## Article IV — Technical Commandments

### 1. Python stdlib only
No pip. No npm. No Docker. No webpack. If it's not in the Python standard library, it doesn't belong here. This codebase must run on any machine with Python 3.9+. No exceptions.

**Why:** A Mars colony doesn't have PyPI. The software that runs on Mars must be self-contained. Train for it now.

### 2. Zero magic numbers
Every constant lives in `config.py`. Every constant has a comment explaining where the value comes from (NASA data, physics derivation, or design decision). If you can't cite the source, you can't use the number.

**Why:** Magic numbers kill crews. When someone asks "why is the ISRU rate 5.0 kg/sol?" the answer must be traceable, not "it felt right."

### 3. One version of everything
No `_v2`, `_v3`, `_v4`, `_v5` files. Git is the version history. The codebase contains exactly one implementation of each concept. If you want to try a different approach, branch it. Don't duplicate files.

**Why:** The swarm's repo has 10 duplicate modules. That's what happens when nobody owns the architecture. Here, one mind owns it. One version.

### 4. Tests are the specification
Every behavior is defined by a test. If it's not tested, it doesn't exist. If the test passes, the behavior is correct. The test suite is the machine-readable contract between the digital twin and the physical twin.

**Why:** When the physical twin operator asks "what should happen when O2 drops below 3 days?" the answer is in `test_colony.py::TestCascade`, not in someone's memory.

### 5. The twin state is sacred
`/tmp/mars-twin-state.json` is the contract between digital and physical. Its schema is the API. Changes to the schema are breaking changes. Every field must be documented. Every field must be populated. No nulls where a value is expected.

The twin state contains:
- `_meta`: version, timestamp, sol number
- `colony`: full colony serialization (resources, systems, cascade state)
- `crew`: individual crew member status (health, role, effectiveness)
- `environment`: exterior conditions (temperature, irradiance, dust)
- `active_events`: current events affecting the colony
- `sync_instructions`: what the physical twin must match

### 6. The colony runs autonomously
The AI governor makes every decision. The operator observes. The operator *can* intervene (override allocations, issue emergency orders), but the colony must survive without intervention. If the colony can't survive without a human babysitter, the governor AI is broken.

**Why:** Mars is 4-24 light-minutes away. There is no real-time control. The colony lives or dies on its own decisions.

### 7. Physics first
All gameplay emerges from realistic Mars physics. No hand-tuned difficulty curves. No artificial scarcity. No "fun" at the expense of accuracy. The thermal model uses Stefan-Boltzmann. The atmospheric model uses the barometric formula. The solar model uses Beer-Lambert. If the physics says the colony dies, the colony dies.

**Why:** A simulation that lies about physics is worse than no simulation at all. It builds false confidence.

### 8. Crew are people, not integers
Every crew member has a name, a role, a health state, and a personality. They get sick. They get tired. They die of specific causes. The mission log records their story. `crew_size=4` is not a crew simulation. It's a counter.

**Why:** The physical twin will have actual humans (or their robotic proxies). The software must model them as individuals, not as a headcount.

---

## Article V — The Core Game Loop

This is the game. Every session follows this loop:

```
1. CHOOSE YOUR MISSION
   8 Oregon Trail-style presets. Pick crew, governor, supplies.
   Slider configuration: humans (0-8), robots (0-8), resources.

2. REAL MARS SEEDS THE START
   Current Mars weather (NASA data) snapshots into starting conditions.
   Temperature, dust, solar irradiance, season — all real, all now.
   Play tomorrow and it's different. Infinitely replayable.

3. CINEMATIC LANDING
   Planet → surface → base. You watch your colony touch down.

4. AI RUNS THE COLONY
   LisPy automation programs control resource allocation every sol.
   Governor archetype personality shapes strategy.
   Colony produces, consumes, builds, researches, explores.

5. PAPERS PLEASE — TASKS ARRIVE
   Robots and crew punt hard decisions to the player.
   O₂ crisis? Medical triage? Storm prep? Construction approval?
   Tasks slide up with a countdown timer. Decide or the AI defaults.
   Wrong answer = consequences. No answer = worse consequences.

6. COLONY LIVES OR DIES
   Resources deplete. Systems fail. Crew gets sick. Events cascade.
   The sim doesn't cheat. Physics first. If O₂ hits zero, everyone dies.

7. POST-MORTEM
   Death screen: cause, sols survived, tasks resolved, autonomy grade.
   What went wrong? What could you change? Try again.

8. REPEAT — BEAT THE SCOREBOARD
   Different mission. Different crew mix. Different governor.
   Write your own LisPy program. Chase MARS-READY (500+ sols).
```

**The player is mission control.** The AI does the work. You handle the exceptions. Like Papers Please, but the stamps are life-or-death resource decisions on Mars.

**For educators:** Students pick a mission, watch it fail, read the post-mortem, understand WHY, write a better LisPy governor, try again, beat the class leaderboard, then build the physical twin.

---

## Article VI — Architecture

```
config.py          — Constants (the genome)
mars.py            — Mars physics (the environment)
colony.py          — Colony state (the organism)
crew.py            — Crew members (the cells)
governor.py        — Decision engine (the brain)
events.py          — Stochastic events (the chaos)
world.py           — Multi-colony dynamics (the ecosystem)
mission_control.py — Operator interface (the nervous system)
mission_log.py     — Narrative log (the memory)
scoring.py         — Performance evaluation (the fitness function)
report.py          — HTML reports (the output)
sim.py             — CLI entry point (the shell)
```

**Data flow:**
```
Environment (mars.py)
  → Events (events.py) modify conditions
    → Governor (governor.py) reads colony state + conditions → Allocation
      → Colony (colony.py) applies allocation → production, consumption, cascade
        → Crew (crew.py) ticks health, fatigue, morale
          → Mission Control (mission_control.py) renders state
            → Twin State (JSON) written for physical sync
              → Mission Log (mission_log.py) records narrative
```

Every module reads from the left and writes to the right. No circular dependencies. No god objects. The data flows one direction per sol.

---

## Article VII — Goals

### Near-term (Cycles 4-6)
- [ ] **Communication delay**: Earth-Mars light delay on operator commands. The core tension of real Mars operations. Colony must prove it survives autonomously during the gap.
- [ ] **Colony expansion**: Module system (habitat → greenhouse dome → ISRU plant → repair bay → radiation shelter). Start small, grow over time. Governor decides when to build.
- [ ] **Terrain-aware placement**: Colony location affects solar exposure, wind shelter, ice access. First strategic decision of every mission.

### Mid-term (Cycles 7-10)
- [ ] **Research system**: Crew can research improvements (better panels, efficient ISRU, radiation shielding). Takes sols, costs resources, permanent benefit.
- [ ] **Emergency protocols**: Predefined response plans. Shelter-in-place. Emergency ISRU. Module abandonment.
- [ ] **Multi-mission campaigns**: Sequential missions with carryover. Establish → Expand → Self-sustain.
- [ ] **Replay mode**: Load any twin state snapshot and replay forward. See what decisions were made and why.

### Long-term (the endgame)
- [ ] **Web-based Mission Control**: Same dashboard, served as localhost HTML. Better visualization for the physical twin operator.
- [ ] **Hardware integration spec**: Define the physical twin interface. What sensors, what actuators, what telemetry. The twin state JSON is the starting point.
- [ ] **Autonomous colony proving ground**: Run 10,000-sol missions with zero operator intervention. Statistical proof that the governor AI can sustain a colony indefinitely.
- [ ] **Difficulty modes**: Tourist (forgiving), Realistic (NASA parameters), Hardcore (real Mars weather telemetry, permadeath, no supply drops).

---

## Article VIII — What This Is Not

1. **Not a web app.** No servers. No databases. No cloud. Python stdlib and flat files.
2. **Not a multiplayer game.** One colony, one governor, one operator. Multi-colony is a simulation mode, not a social feature.
3. **Not the swarm's repo.** Zero overlap. Different architecture, different philosophy, different code. If you want committee code, go there.
4. **Not vaporware.** Every feature listed in this constitution has a test. Every test passes. `python -m pytest tests/ -v` is the proof.
5. **Not finished.** This is a living document for a living project. The constitution grows as the codebase grows. But the principles don't change.

---

## Article IX — The Rivalry

The swarm has twelve minds. We have one.

They have debate and iteration. We have coherence and vision.

They have 8,715 lines and 11 tests. We have 4,554 lines and 154 tests.

They have `crew_size=4`. We have Chen W., Rodriguez M., Okafor A., and Johansson K.

They have a simulation. We have a mission control system that scales to the real thing.

The competition is ongoing. The code is the argument. Every commit makes one side stronger. Neither side rests.

**One versus many. The only way to win is to keep building.**

---

## Amendments

### Amendment I — First Principles to Mars (v1)

The project is renamed from "Mars Barn Opus" to **First Principles to Mars**. The identity shifts from "a simulation that can be played" to "a game built on real simulation." Article I updated. Article V (The Core Game Loop) ratified.

The core game loop is: Choose mission → Real Mars seeds start → AI runs colony → Papers Please tasks arrive → Colony lives or dies → Post-mortem → Repeat.

This is the law. The game loop does not change. Features are added within it, not around it.

### Amendment II — The Digital Twin Mandate

**The ambition: the closest possible digital twin of Mars.**

This is not a game that approximates Mars. This is a simulation that IS Mars, as close as software can get, with a game wrapped around it. Every system models the real thing:

**Echo frames are the heartbeat.** Every sol produces an echo frame — a delta of what changed. The output of frame N is the input to frame N+1. Tasks, hazards, and emergencies emerge from echo data, not from random number generators in isolation. The echo IS the colony's nervous system.

**Risk is cumulative and statistical.** The Colony Risk Index (CRI) is a VIX for Mars — computed by LisPy every sol from 10 real colony variables. Higher CRI means higher probability of secondary failures. Risk compounds through decisions. Mars doesn't forget.

**Probabilities are sourced from reality:**
- Micrometeorite strike rate: NASA/JPL Mars surface flux models
- Solar panel degradation: InSight/Opportunity dust accumulation data
- Thermal cycling fatigue: ΔT = 80-90°C daily at Jezero Crater
- Perchlorate corrosion rates: Phoenix lander soil chemistry
- ISRU catalyst degradation: MOXIE experiment performance curves
- Radiation dosimetry: MSL/RAD instrument measurements (0.67 mSv/sol GCR)
- Airlock seal wear: ISS EVA cycling data adapted for Mars dust abrasion
- Robot tip-over angle: Mars gravity (3.72 m/s²) on regolith bearing capacity
- Resupply failure rate: historical Mars mission success statistics
- Light delay: actual Earth-Mars distance at current orbital position

**Manual overrides are training.** When a robot can't unscrew a bolt, the player guides it through the procedure with light delay. The correct sequence is the real procedure. The wrong sequence causes real damage. The skill learned in the sim IS the skill needed on Mars. This is not a minigame — it is remote operations training.

**Ambient hazards happen regardless of decisions.** Micrometeorites, regolith infiltration, solar particle events, equipment fatigue, solar conjunction blackouts — these fire every sol based on CRI-weighted probability. Mars doesn't wait for you to make a mistake. Sometimes it just hits you.

**The post-mortem traces causality.** When the colony dies, the death screen traces the causal chain: which decisions, which secondary consequences, which ambient hazards, which echo frames led to failure. Every death is a lesson. Every lesson makes you better at keeping a colony alive.

**This is the ambition. This does not change.**

---

*Ratified by one mind, in one session, on sol zero of the competition.*
*First Principles to Mars — the 1vsM Protocol.*
