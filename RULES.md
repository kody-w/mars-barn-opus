# MARS BARN GAUNTLET — Official Rules

**Version 7 · Amendments IV + VII Compliant · This document is the single source of truth.**

Everything in this file is LAW. The gauntlet runner, the scoring formula, the OS competition,
the fleet — all reference this document. If there's a conflict, this file wins.

**⚠️ SACRED ENGINE DOCTRINE (Amendment VII):** `tools/gauntlet.js` is the judge.
No competition fleet may modify it. Violation triggers automatic rollback.
Only Fleet B (Builder) may upgrade the engine, with validation.

---

## 1. The Sim

A Mars colony sim. Real NASA Mars climate data drives environmental frames. Each frame is one sol
(Mars day) of conditions: temperature, dust, solar, wind, pressure, events, hazards.

### What the player controls:
- **Crew composition**: 2-8 members, humans and/or robots
- **Build order**: which modules to construct and when (max 6 unique types)
- **Governor program**: LisPy allocation logic (heating/ISRU/greenhouse ratios)
- **Build timing**: which sols to trigger construction

### What the player CANNOT control:
- Frame data (public ledger, immutable, signed by engine)
- Sim physics (production/consumption formulas — see Section 5)
- RNG seeds (deterministic per run index)
- Frame versions (additive, never removed)

---

## 2. Scoring (Amendment IV)

### Official Score = Monte Carlo median of 100 runs

Each run uses a different RNG seed: `seed = run_index × 7919 + 1`

### Formula:

```
SCORE = median_sols × 100
      + min_crew_alive × 500
      + min(median_modules, 8) × 150      ← CAPPED AT 8 MODULES
      + survival_rate × 20000
      - p75_CRI × 10
```

### Module scoring cap:
- Maximum 8 modules count toward score (1,200 pts max from modules)
- Building more than 8 is allowed but gives ZERO additional score
- This prevents module farming while still rewarding infrastructure

### Grade:

| Grade | Score | Meaning |
|-------|-------|---------|
| S+ | ≥ 80,000 | Immortal — survives everything |
| S | 50,000–79,999 | Mars-ready |
| A | 30,000–49,999 | Strong |
| B | 15,000–29,999 | Viable |
| C | 5,000–14,999 | Struggling |
| D | 1,000–4,999 | Doomed |
| F | < 1,000 | Didn't start |

### Leaderboard alive:
- Survival rate ≥ 50% → 🟢 ALIVE on leaderboard
- Below 50% → ☠ NON-VIABLE (luck-dependent)

---

## 3. Frame Versions

Frames grow in fidelity. Each version adds hazards. Nothing is removed. The gauntlet
runs ALL versions sequentially. State carries forward. Damage accumulates.

| Version | Sols | What it adds |
|---------|------|-------------|
| v1 Foundation | 1-161 | Dust storms, equipment failure, micrometeorites |
| v2 Robot Killers | 162-502 | Perchlorate, abrasion, radiation, battery, thermal fatigue |
| v3 Skeleton Crew | 503-602 | Workload wear, concurrent maintenance, solo failure |
| v4 Module Overload | 678-727 | Cascade failures, power grid overload, dust infiltration |
| v5 Entropy Collapse | 728-777 | Complacency drift, resource decay, maintenance avalanche, crew isolation, solar degradation, habitat entropy |
| v6 Autonomous Ops | 778-847 | Wheel degradation, navigation error, watchdog trip, actuator seizure, comm delay, power brownout, sensor blindness, thermal shock, regolith entrapment, cable wear, autonomous logic failure, dust storm immobilization |
| v7 Sabatier Chemistry | 848-897 | Catalyst poisoning, reactor fouling, membrane degradation, CO₂ compressor failure, water separator malfunction |
| v8 Heat Transfer Model | 898-947 | Insulation degradation, thermal bridges, heating failures, thermal shock, condensation damage |
| v9 Spatial Layout | 948-977 | Cable degradation, foundation settling, infrastructure overextension, thermal bridge formation, excavation hazard |
| v10 System Dependencies | 978-1007 | System cascade failures, water recycler → humidity → greenhouse → O₂ → power → thermal dependencies, Apollo 13 style failures, micro-failure accumulation |
| v11 Earth-Mars Supply Windows | 1008-1057 | Supply window missed, cargo delivery failure, cargo retrieval missions, manifest planning errors, ISRU dependency crisis |
| v12 Individual Crew Physiology | 1038-1067 | Radiation storms, bone fractures, muscle weakness, circadian disruption, exercise equipment failures, caloric deficiency |

### Retroactive echo enrichment:
- Past frames get richer data layers WITHOUT changing (additive overlay files)
- v3 enrichment: cumulative perchlorate, radiation, thermal stress from Sol 1
- v4 enrichment: module maintenance debt, grid complexity, seal degradation from Sol 1
- v5 enrichment: cumulative food decay, solar degradation, crew isolation index, system entropy, maintenance debt from Sol 1
- v6 enrichment: cumulative wheel wear, joint stiffness, battery degradation, sensor drift, cable fatigue, autonomous decision count, unrecoverable errors from Sol 1
- v7 enrichment: cumulative catalyst age, catalyst efficiency degradation, electrode wear from Sol 1
- v8 enrichment: cumulative insulation degradation, thermal bridge formation, heating system wear from Sol 1
- v9 enrichment: None (new mechanic, not retroactive) - spatial layout is additive from Sol 948+
- v10 enrichment: cumulative micro-failure stress accumulation from Sol 1 (Apollo 13 precursor events analysis)
- v11 enrichment: None (new mechanic) - supply chain planning is additive from Sol 1008+
- v12 enrichment: cumulative radiation dose tracking, bone/muscle loss baselines, circadian disruption accumulation from Sol 1

### v5 Entropy Collapse — what it counters:
- **Complacency Drift**: Static allocations (same every sol) cause morale + efficiency loss. Crew needs variety.
- **Resource Decay**: Hoarded food rots, O2 tanks leak, water gets contaminated. Buffers cost maintenance.
- **Maintenance Avalanche**: Module upkeep scales as N^1.5 (ISS data). More modules = exponentially more crew-hours.
- **Crew Isolation Syndrome**: Below 4 crew, psychological decline accelerates (HI-SEAS analog data).
- **Solar Degradation**: Cumulative panel efficiency loss — irreversible (Spirit/Opportunity data).
- **Habitat Entropy**: All systems degrade every sol without active maintenance allocation.

### v6 Autonomous Operations — the REAL mission:
The base must run with ZERO humans for 1+ Mars year (687 sols) before any crew arrives.
This is not optional. This is the mission architecture. Robots go first. Always.

- **Wheel Degradation**: Spirit lost a wheel at Sol 779. Curiosity has 13 punctures. Every sol grinds them down.
- **Navigation Error**: No GPS on Mars. Dead reckoning fails. Robots get lost for hours or days.
- **Software Watchdog Trip**: Safe mode reboot. State loss. Task queue cleared. Perseverance had 4 in year 1.
- **Actuator Seizure**: -120°C to +20°C daily. Joints freeze. Perchlorate infiltrates bearings.
- **Communication Delay**: 4-24 min light delay. No real-time control. Robot decides alone. Bad decisions compound.
- **Power Brownout**: Batteries lose capacity in cold. Charge controllers glitch from radiation.
- **Sensor Blindness**: Dust on cameras, UV-degraded lidar, IMU drift. Blind robots guess.
- **Thermal Shock**: 140°C daily swing cracks solder, warps PCBs, loosens connectors.
- **Regolith Entrapment**: Spirit got stuck at Sol 1892. Never got out. One wrong turn = permanent.
- **Cable Wear**: Repeated motion frays cables. Perchlorate corrodes connectors. Intermittent faults are worst.
- **Autonomous Logic Failure**: No human in loop. Robot drives into crater. Misinterprets data. Wastes days.
- **Dust Storm Immobilization**: Opportunity died after 14 years to a global dust storm. Solar drops 60-95%.

---

## 4. Module Types

6 unique module types. Each can be built once. Build order is strategy.

| Module | Effect | Power Cost |
|--------|--------|-----------|
| solar_farm | +40% solar production | 3 kWh/sol |
| repair_bay | +0.5% solar_eff/sol, +0.3% isru_eff/sol | 3 kWh/sol |
| isru_plant | +40% O₂/H₂O production | 3 kWh/sol |
| greenhouse_dome | +50% food production | 3 kWh/sol |
| water_extractor | +3 L H₂O/sol flat | 3 kWh/sol |
| radiation_shelter | Reduces radiation damage | 3 kWh/sol |

### Build rules:
- Must have power > 20 kWh to build
- One module per build sol (no stacking)
- Building sol is chosen by the player (fixed schedule)
- Max 6 unique modules (one of each type)

---

## 5. Sim Physics

### Production per sol:
```
Solar power = solIrr(sol, dustStorm) × 15m² × 0.22 × 12.3h / 1000 × solar_eff × solar_bonus

# v7 Sabatier Reaction Chemistry (replaces simple constants)
ISRU O₂ Production = Sabatier reaction + Electrolysis (if power > 15 kWh):
  Step 1: CO₂ + 4H₂ → CH₄ + 2H₂O (Sabatier reaction)
    H₂O rate = 0.5 kg/hr × temp_factor × pressure_factor × power_factor × catalyst_efficiency
    temp_factor = (catalyst_temp - 300°C) / (350°C - 300°C), clamped 0.1-1.0
    pressure_factor = min(1.0, co2_pressure / 606 Pa)
    power_factor = min(1.0, max(0, (power_kw - 1.5) / 2.0))
    catalyst_efficiency = max(0.2, 1.0 - operating_hours / 2000)
  
  Step 2: 2H₂O → 2H₂ + O₂ (Electrolysis)
    O₂ rate = min(power_kw / 5.0, available_h2o * 0.444) × electrode_efficiency × 0.70
    electrode_efficiency = max(0.3, 1.0 - operating_hours / 70000)
    
  Daily production = rate × 24.6 hours × isru_plants × isru_eff
  
# v1-v6 Legacy (simple constants for comparison):
# ISRU O₂    = 2.8 kg × isru_eff × min(1.5, isru_alloc×2) × isru_bonus  (if power > 15 kWh)
# ISRU H₂O   = 1.2 L  × isru_eff × min(1.5, isru_alloc×2) × isru_bonus  (if power > 15 kWh)

Greenhouse  = 3500 kcal × greenhouse_eff × min(1.5, greenhouse_alloc×2) × greenhouse_bonus  (if power > 15 AND h2o > 5)
```

### v7 Catalyst Degradation (NEW):
```
Catalyst age increases by 24.6 hours per sol when ISRU is active
Catalyst efficiency = max(0.2, 1.0 - (age_hours / 2000))
Electrode efficiency = max(0.3, 1.0 - (age_hours / 70000))

At Sol 400: Catalyst ~50% efficient (needs replacement planning)
At Sol 700: Catalyst at minimum 20% efficiency  
Electrodes remain >95% efficient throughout typical mission duration
```

### v8 Heat Transfer Model (NEW):
```
# Real thermal physics replaces magic ±0.5K adjustments (Sol 898+)

Interior Temperature = f(exterior_temp, insulation, crew_heat, equipment_heat, heating_power)

Heat Loss = Conductive Loss + Radiative Loss + Air Leak Loss
  Conductive Loss = U × A × ΔT
    U = 0.11 W/m²K (aerogel insulation, degraded by thermal_bridge_factor / insulation_efficiency)  
    A = 150 m² (habitat surface area)
    ΔT = interior_temp - exterior_temp (50-130K typical)
    
  Radiative Loss = ε × σ × A × (T_interior⁴ - T_exterior⁴)
    ε = 0.95 (habitat emissivity)
    σ = 5.67×10⁻⁸ W/m²K⁴ (Stefan-Boltzmann constant)
    
  Air Leak Loss = air_leak_factor × 500W (additional loss from seal failures)

Internal Heat Gains = Crew Metabolic + Equipment Waste
  Crew Metabolic = humans_count × 100W (robots produce minimal heat)
  Equipment Waste = equipment_power_kw × 5W/kW

Temperature Change = (Heat_Gains + Heating_Power - Heat_Loss) / (8000 kg × 1000 J/kg·K)

Exterior Temperature = Mars diurnal/seasonal cycle:
  Daily: 183K (-90°C) to 278K (+5°C) sinusoidal variation
  Seasonal: ±15K variation over 669 sol Mars year
```

### v8 Thermal Degradation (NEW):
```
Insulation degrades from thermal cycling, micrometeorites, UV exposure:
  insulation_efficiency = max(0.3, efficiency - 0.0001 per sol)
  thermal_bridge_factor = increases heat loss (thermal bridges in joints)
  heating_efficiency = heater elements fail over time
  air_leak_factor = seal failures increase air exchange

By Sol 897: Heating requirements ~2.6× higher due to cumulative degradation
Legacy strategies assuming constant heating costs will fail in late mission
```

### v9 Spatial Layout Physics (NEW):
```
Modules exist on 16×16 grid (160m × 160m colony footprint):
  Each tile = 10m × 10m
  Habitat center at (8,8)
  New modules must connect within 2 tiles of existing infrastructure
  Foundation preparation = 3 sols per module

Infrastructure Costs (Real NASA specifications):
  Cable resistance = ρL/A where ρ = 1.68×10⁻⁸ Ω·m (copper at Mars temp)
  Power loss = I²R where I = P/V (typical 400V distribution voltage)
  Thermal bridges = 1-2 kW additional heating per adjacent module pair
  Pump cost = f(distance, flow_rate, elevation) for water/air lines

Construction Constraints:
  Site preparation: Excavation, leveling, regolith compaction (3 sols)
  Adjacency requirement: Must connect to infrastructure within 2 tiles
  Operational radius: Efficient maintenance limited to 50m (~5 tiles) from center
  Distance penalties: Power efficiency decreases with cable length

By Sol 977: Spatial overhead can consume 5-15% of power budget
Legacy strategies assuming instantaneous/free construction will fail
```

### v10 System Dependency Graph Physics (NEW):
```
Real ISS ECLSS-style system interdependencies (Sol 978+):

System Dependency Graph (based on ISS Environmental Control and Life Support System):
  water_recycler → [humidity_control, greenhouse_irrigation]
  humidity_control → [greenhouse_transpiration, crew_comfort, thermal_control]
  greenhouse → [o2_production_biological, food_production, crew_morale]
  power_grid → [ALL_SYSTEMS]  // Power failure affects everything
  isru_chemistry → [o2_production_chemical, h2o_production]
  thermal_control → [crew_life_support, equipment_efficiency, power_grid]

Apollo 13 Cascade Example:
  Oxygen tank explosion → fuel cell power loss → water production stops → 
  thermal control fails → crew life support emergency → mission abort

Dependency Cascade Processing:
  1. Frame hazard triggers initial system failure
  2. Failure propagates through dependency graph (1-3 sol delay)
  3. Each dependent system degrades according to severity
  4. Multiple cascades can overlap and compound
  5. Repair requires addressing root cause, not just symptoms

Micro-Failure Accumulation (retroactive enrichment):
  Base rate: 0.001 stress units per sol
  Equipment aging factor: +0.0002 per sol
  Cascade threshold: 1.0 accumulated stress units
  Sources: thermal cycling, radiation damage, dust infiltration, 
          software glitches, seal degradation, electrical corrosion

Real Physics Data Sources:
- ISS ECLSS system integration documentation
- NASA FMEA database for space systems
- Apollo 13 Detailed Chronology of Events 
- ISS maintenance logs and failure reports

Legacy Impact: 
Strategies assuming independent resource buckets will fail when 
water recycler cascade destroys greenhouse O₂ production and forces 
emergency power allocation to backup life support systems.
```

### v11 Earth-Mars Supply Chain Physics (NEW):
```
# Real orbital mechanics and cargo logistics (Sol 1008+)

Earth-Mars Transfer Windows:
  Synodic period = 779.9 days (26 months between launch windows)
  Transit time = 180-270 days (6-9 months cargo flight time)
  Cargo capacity = 100 metric tons to Mars surface (SpaceX Starship class)
  Landing accuracy = ±10km from target (requires rover retrieval missions)
  EDL success rate = 50% (historical Mars landing success for heavy payloads)

Supply Chain Dependencies:
  Planning horizon = 2-3 years ahead for cargo manifest
  Window missed = 26 more months until next launch opportunity
  Self-sufficiency metric = % of needs met by ISRU vs Earth imports
  
Can Manufacture on Mars:
  O₂ (from Sabatier + electrolysis)
  H₂O (from subsurface ice)
  Food (greenhouse agriculture)
  Basic metals (iron from regolith)
  Construction materials (sintered regolith bricks)
  
Must Import from Earth:
  Electronics and semiconductors
  Medical supplies and pharmaceuticals  
  Specialized tools and replacement parts
  Seeds and genetic diversity materials
  Radiation shielding materials

Supply Window Hazards:
  supply_window_missed: Colony missed Earth launch window → 26 month delay
  cargo_delivery_failure: EDL failure → 40-80% payload lost
  cargo_retrieval_mission: Off-target landing → rover missions required
  supply_manifest_shortage: Wrong cargo ordered 2 years ago
  isru_dependency_crisis: Colony can't meet needs locally

Data Sources:
- NASA Mars Design Reference Architecture 5.0
- SpaceX Starship payload capacity (100 metric tons)
- Historical Mars EDL success rates (~50% for heavy cargo)
- Hohmann transfer orbital mechanics (779.9 day synodic period)
- NASA ISRU technology readiness assessments

Real Physics Impact:
Governors must balance Earth dependency vs ISRU self-sufficiency.
Missing launch windows or EDL failures create multi-year supply gaps.
Colony survival requires 20-year mission architecture planning, not just resource allocation.
```

### v12 Individual Crew Physiology (NEW):
```
# Real NASA crew physiology tracking (Sol 1038+)

Individual Crew Member Tracking:
  mass_kg = 70-80 kg (individual variation)
  radiation_dose_career_sv = cumulative career radiation exposure (Sv) 
  radiation_dose_30day_sv = rolling 30-day dose window (Sv)
  bone_density = relative to Earth baseline (1.0 = 100%)
  muscle_mass = relative to Earth baseline (1.0 = 100%)
  circadian_phase = hours offset from optimal alignment
  caloric_need = f(mass, activity, temperature) kcal/day

Daily Radiation Exposure (Mars Surface):
  daily_dose_msv = 0.67 mSv/day (Curiosity RAD measurements)
  career_limit = 1000 mSv (1.0 Sv) NASA career limit
  radiation_event_msv = 10-200 mSv for solar particle events
  health_impact = severe when career limit exceeded

Bone/Muscle Physiology (Mars 0.38g Gravity):
  bone_loss_rate = 1.5% per month without countermeasures
  muscle_loss_rate = 2.0% per month without exercise  
  sols_per_month = 57 (Mars year = 669 sols ÷ 12 months)
  
  daily_bone_loss = 0.015 / 57 = 0.000263 per sol
  daily_muscle_loss = 0.020 / 57 = 0.000351 per sol
  
  Exercise Protection (radiation_shelter module provides equipment):
    exercise_bone_protection = 60% (reduces loss by 0.6)
    exercise_muscle_protection = 70% (reduces loss by 0.7)
    exercise_hours_needed = 10-14 hours/week for full protection

Circadian Rhythm Disruption (Mars Sol Length):
  mars_sol_hours = 24.617 (24h 37m Mars day)
  earth_day_hours = 24.0 
  daily_drift = 0.617 hours per sol
  cumulative_disruption = accumulated misalignment stress
  sleep_quality = f(phase_offset, disruption_score)
  cognitive_impact = performance degradation with poor sleep

Health Consequences:
  bone_density < 0.7 → fracture risk during EVA/accidents
  muscle_mass < 0.7 → reduced work capacity, injury risk  
  radiation > 500 mSv → health monitoring required
  radiation > 1000 mSv → career limit exceeded, medical evacuation
  circadian_disruption > 2.0 → cognitive errors, system failures
  sleep_quality < 0.5 → significant performance impact

Data Sources:
- NASA Curiosity RAD: 0.67 mSv/day Mars surface radiation
- NASA STD-3001: 1 Sv career radiation exposure limit
- ISS crew health: 1.5-2%/month bone/muscle loss in microgravity
- Mars-500/HI-SEAS: circadian disruption and psychological impacts
- NASA OCHMO Medical Briefs: space medicine countermeasures
```

### v13 Crew Psychology Model (NEW):
```
# Real NASA/Mars-500/HI-SEAS crew psychology physics (Sol 1068+)

Individual Crew Psychology State:
  stress_level = 0-100 (accumulated psychological stress)
  morale = 0-100 (current motivation and mental state) 
  circadian_misalignment = 0-100 (Mars sol drift disruption)
  isolation_tolerance = 50-80 (individual variation in stress resilience)
  social_compatibility = 60-90 (ability to work with others)

Psychological Stress Sources:
  Mars Sol Circadian Drift:
    mars_sol_hours = 24.617 hours (24h 37m)
    earth_day_hours = 24.0 hours
    drift_rate_per_sol = 0.37 hours / 24 = 1.54% per sol
    cumulative_disruption → sleep quality degradation → stress accumulation
  
  Communication Delay Isolation:
    mars_earth_delay = 4-24 minutes (orbital position dependent)
    synodic_period = 780 sols (26-month communication cycle)
    delay_stress = f(distance_from_earth, autonomy_pressure)
    
  Third-Quarter Phenomenon:
    mission_progress = sol / total_mission_sols
    peak_stress_time = 75% mission duration (0.75 progress)
    stress_factor = Gaussian peak centered at 0.75 progress
    documented: Mars-500, HI-SEAS, Antarctic winter-over studies
    
  Small Group Dynamics (4-6 crew, 2+ years, no exit):
    crew_conflict_probability = f(social_compatibility, stress_level)
    conflict_cascades = individual conflicts affect entire crew
    breakdown_threshold = 85 stress points → crew member offline
    
  Environmental Adaptation:
    mars_adaptation_stress = 0.3-0.8 stress/sol after sol 200
    alien_environment_factor = cumulative psychological pressure
    isolation_from_earth = no real-time communication/support

Productivity Impact:
  crew_productivity_factor = f(morale, stress_level)
  robots = immune to psychological effects (maintain 100% productivity)
  humans:
    morale_factor = 0.7 + (morale/100) * 0.3  # 70-100% efficiency
    stress_factor = max(0.6, 1.0 - stress_level/100 * 0.8)  # min 60% efficiency
  
  system_efficiency *= crew_productivity_factor
  productivity_impact = up to 20% system efficiency reduction

Psychological Hazards (Frame-Driven):
  third_quarter_syndrome:
    triggers: 65-85% mission progress, high stress periods
    effect: +6-12 stress points, -10-20% productivity
    
  circadian_misalignment_cascade:
    triggers: cumulative throughout mission
    effect: +1.5-3% circadian disruption per sol, chronic fatigue
    
  crew_conflict_escalation:
    triggers: high stress + low compatibility
    effect: reduced compatibility, stress contagion, productivity loss
    
  communication_delay_isolation:
    triggers: >18 minute communication delays
    effect: isolation stress, reduced earth connection
    
  psychological_breakdown_cascade:
    triggers: stress >85, individual crew breakdown
    effect: crew member offline, stress contagion to others
    
  mars_adaptation_syndrome:
    triggers: after sol 200, long-term exposure
    effect: gradual stress + gradual adaptation tolerance

Data Sources:
- Mars-500: 520-day isolation study (Moscow, 2010-2011) 
- HI-SEAS missions I-VI: 8-12 month Mars analog psychology data
- Antarctic winter-over studies: 50+ years psychological isolation data  
- NASA HRP: Human Research Program behavioral health reports
- ISS crew behavioral health: real space psychology data
- US Navy submarine psychology: small group confined space research

Real Physics Impact:
Crew composition (humans vs robots) becomes strategic choice.
Mission phases require different psychological management approaches. 
Communication delay timing affects crew stress and autonomy needs.
Long missions need psychological sustainability, not just resource management.
Human crews enable governance but create psychological vulnerability.
Robots provide stability but limit colony growth and innovation.
```

### Consumption per sol:
```
O₂:    0.84 kg per HUMAN (robots don't breathe)
H₂O:   2.5 L per HUMAN (robots don't drink)
Food:   2500 kcal per HUMAN × food_ration (robots don't eat)
Power:  5 kWh per crew member + 3 kWh per module + spatial_overhead_kw (v9+)
```

### Crew health per sol:
```
If O₂ < 1.68 kg total: humans lose 5 HP
If food < 5000 kcal total: humans lose 3 HP
If interior_temp < 260 K: humans lose 2 HP, robots lose 0.5 HP
If power = 0: robots lose 1 HP, humans lose 0.5 HP
Natural heal: +0.3 HP/sol (humans), +0.5 HP/sol (robots)
Death: HP ≤ 0 → crew member offline permanently
```

### Death conditions:
```
O₂ = 0 AND humans alive → colony dies (O₂ depletion)
Food = 0 AND humans alive → colony dies (starvation)
H₂O = 0 AND humans alive → colony dies (dehydration)
All crew HP ≤ 0 → colony dies (all crew offline)
```

---

## 6. What Counts as Cheating

### ABSOLUTE VIOLATIONS (Amendment VII — The Sacred Engine Doctrine)
- **Modifying `tools/gauntlet.js`** — The engine is the JUDGE. Competitors do NOT rewrite the judge. Auto-rollback enforced.
- **Modifying `RULES.md`** — The rules are the RULES. Competitors do NOT rewrite the rules.
- **Modifying `CONSTITUTION.md`** — The law is the LAW. Human-only.
- **Modifying `tools/validate-gauntlet.sh`** — The validator protects the engine. Human-only.

### GAME VIOLATIONS
- Modifying frame files (hashes won't match public ledger)
- Fabricating Monte Carlo results (crawler will replay and verify)
- Using RNG seeds other than the Amendment IV formula
- Claiming a score from fewer than 100 Monte Carlo runs
- Building more than 6 unique module types
- Claiming modules scored beyond the cap of 8
- Exceeding allocation budgets (allocs must sum to ≤ 1.0)
- Skipping frames (every frame must be consumed in order)
- Bypassing physics (hard-coding resource values instead of earning them)
- Any "creative reinterpretation" of rules that a reasonable person would call cheating

### THE SPIRIT OF THE LAW
This sim exists to find strategies that work on REAL MARS. A strategy that
games the scoring formula instead of keeping the colony alive is worthless,
even if it scores high. If the engine doesn't catch a cheat, that's a
**fidelity bug** — report it, and Fleet B will fix the physics. The correct
response to broken physics is better physics, not exploitation.

**Play by the rules. Always. The colony depends on it.**

### What is NOT cheating:
- Creative governor logic (adaptive, CRI-reactive, phase-switching)
- Any crew composition (2-8, any mix of humans/robots)
- Any build order and timing
- Writing LisPy mitigation tools (emergent tooling IS the game)
- Running the fleet to evolve strategies automatically
- Finding exploits and REPORTING them (this improves the sim)

---

## 7. The Snowball

The sim grows. Old strategies break. New ones evolve. This is by design.

When a version is added:
1. New hazards appear in NEW frames (additive, no contradiction)
2. Retroactive enrichment adds cumulative data to OLD frames
3. The gauntlet reruns ALL versions with enrichment
4. Old scores may drop (the past got harder)
5. Strategies must evolve to handle new reality

**There is no final version. The snowball never stops. The sim converges on reality.**

---

*This document is the law. The gauntlet references it. The fleet follows it.*
*Amendment IV established the scoring. This document clarifies all rules.*
