# Mars Barn Opus — Plan

## Cycle 3: Crew Simulation [DONE]
The single biggest thing the swarm doesn't have. Makes it feel real.

### What was built
1. `src/crew.py` — individual crew members
   - CrewMember dataclass: name, role, health (0-100), fatigue (0-100),
     radiation_dose, morale, skills dict
   - Roles: Commander, Engineer, Scientist, Medic (4 crew = 4 roles)
   - Health degrades from: radiation, starvation, dehydration, cold
   - Fatigue accumulates from work, resets with rest
   - Skills affect production efficiency (engineer boosts ISRU, scientist
     boosts greenhouse, etc.)
   - Crew events: injury, illness, conflict, breakthrough

2. Wire into colony.py
   - Production scales with crew skill + health
   - Crew consume individually (sick crew consume less but produce nothing)
   - Death of crew member = permanent loss (crew_size decrements)
   - Morale is average of individual crew morale

3. Wire into mission_control.py
   - Show crew roster in dashboard
   - Crew health bars
   - Alert on crew health critical

4. Tests: test_crew.py

### Definition of done [ALL MET]
- [x] Individual crew members with names, roles, health, fatigue
- [x] Crew health affects colony production
- [x] Crew can die individually (not just colony death)
- [x] Mission control shows crew roster
- [x] Mission log writes sol-by-sol narrative
- [x] Twin state includes crew data
- [x] 154 tests pass (23 new crew tests)

## Cycle 4: Communication Delay
The core tension of real Mars operations.

### What to build
- Commands from operator have 4-24 minute delay (configurable)
- Colony must survive autonomously during delay
- In mission control: you see "Command queued... ETA 14m"
- Emergency override: instant but costs reputation/trust

## Cycle 5: Colony Expansion
Start small, grow over time.

### What to build
- Module system: habitat, greenhouse_dome, isru_plant, repair_bay, shelter
- Each module: build_time, resource_cost, production_bonus
- Governor decides when to build (or operator overrides)
- Visual: show colony layout in ASCII
