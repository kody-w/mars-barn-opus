# MARS BARN GAUNTLET — Official Rules

**Version 5 · Amendment IV Compliant · This document is the single source of truth.**

Everything in this file is LAW. The gauntlet runner, the scoring formula, the OS competition,
the fleet — all reference this document. If there's a conflict, this file wins.

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

### Retroactive echo enrichment:
- Past frames get richer data layers WITHOUT changing (additive overlay files)
- v3 enrichment: cumulative perchlorate, radiation, thermal stress from Sol 1
- v4 enrichment: module maintenance debt, grid complexity, seal degradation from Sol 1
- v5 enrichment: cumulative food decay, solar degradation, crew isolation index, system entropy, maintenance debt from Sol 1
- v6 enrichment: cumulative wheel wear, joint stiffness, battery degradation, sensor drift, cable fatigue, autonomous decision count, unrecoverable errors from Sol 1
- v7 enrichment: cumulative catalyst age, catalyst efficiency degradation, electrode wear from Sol 1
- v8 enrichment: cumulative insulation degradation, thermal bridge formation, heating system wear from Sol 1
- These are ALWAYS applied — you can't opt out of enrichment

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

### Consumption per sol:
```
O₂:    0.84 kg per HUMAN (robots don't breathe)
H₂O:   2.5 L per HUMAN (robots don't drink)
Food:   2500 kcal per HUMAN × food_ration (robots don't eat)
Power:  5 kWh per crew member + 3 kWh per module
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

- Modifying frame files (hashes won't match public ledger)
- Modifying the sim physics (production/consumption formulas)
- Using RNG seeds other than the Amendment IV formula
- Claiming a score from fewer than 100 Monte Carlo runs
- Building more than 6 unique module types
- Claiming modules scored beyond the cap of 8

### What is NOT cheating:
- Creative governor logic (adaptive, CRI-reactive, phase-switching)
- Any crew composition (2-8, any mix of humans/robots)
- Any build order and timing
- Writing LisPy mitigation tools (emergent tooling IS the game)
- Running the fleet to evolve strategies automatically

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
