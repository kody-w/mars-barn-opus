# AUTONOMOUS FIDELITY PIPELINE

### How Unlimited Copilot Fleet Drives the Sim Toward Reality — Forever

> One fleet competes. One fleet builds. Both run 24/7.
> The competition fleet finds what's fake. The builder fleet makes it real.
> The sim converges on reality autonomously.

---

## The Two Fleets

### Fleet A: COMPETE
What we have now. Copilot agents try to beat the gauntlet score.
They find exploits. Exploits reveal missing physics.

```
Loop forever:
  1. Read RULES.md + latest governor
  2. Evolve strategy to beat the record
  3. Run Monte Carlo gauntlet
  4. If better: commit
  5. Sleep 2 min, repeat
```

### Fleet B: BUILD (NEW)
Copilot agents that ADD FIDELITY. They don't compete — they make the sim harder
by implementing the next item on the Convergence Roadmap.

```
Loop forever:
  1. Read CONVERGENCE-ROADMAP.md
  2. Read data/fidelity-queue.json (the next physics gap to close)
  3. Research the real physics (NASA papers, engineering handbooks)
  4. Generate new frames with that physics
  5. Add hazard processing to gauntlet.js
  6. Update RULES.md with new mechanics
  7. Run gauntlet to verify old strategies break
  8. Commit + push
  9. Move to next queue item
  10. Sleep 5 min, repeat
```

---

## The Fidelity Queue

A JSON file that tells Fleet B what to build next. Ordered by impact and feasibility.
Each item has clear acceptance criteria so the agent knows when it's done.

```json
{
  "_format": "mars-barn-fidelity-queue",
  "doctrine": "Each item closes one gap between game and reality. Ship it when the gauntlet score drops.",
  "queue": [
    {
      "id": "v7-sabatier",
      "version": "v7",
      "title": "Sabatier Reaction Chemistry",
      "status": "pending",
      "priority": 1,
      "gap": "O₂ production is a magic number (2.8 * efficiency). Real O₂ comes from CO₂ + H₂ → CH₄ + H₂O, then electrolysis.",
      "physics": {
        "reaction": "CO₂ + 4H₂ → CH₄ + 2H₂O (Sabatier, 300-400°C, Ni catalyst)",
        "electrolysis": "2H₂O → 2H₂ + O₂ (1.23V minimum, efficiency ~80%)",
        "variables": ["catalyst_temperature", "co2_partial_pressure", "catalyst_age_hours", "power_input_kw"],
        "output": "o2_kg_per_sol = f(power, catalyst_state, co2_availability)"
      },
      "data_sources": [
        "MOXIE results: 0.006 kg O₂/hour at 25W (Mars 2020 Perseverance)",
        "Sabatier reactor specs: NASA ECLSS Technical Reference",
        "CO₂ partial pressure on Mars: 636 Pa × 0.953 = 606 Pa"
      ],
      "acceptance": [
        "gauntlet.js uses Sabatier equation instead of constant",
        "O₂ production varies with power input, catalyst age, and CO₂ pressure",
        "Catalyst degrades over time (requires replacement every ~2000 hours)",
        "Old fleet strategies score at least 10% lower (they assumed constant O₂)"
      ],
      "frames_to_generate": 50,
      "enrichment": "Retroactive catalyst age accumulation from Sol 1"
    },
    {
      "id": "v7-electrolysis",
      "version": "v7",
      "title": "Water Electrolysis Efficiency Curves",
      "status": "pending",
      "priority": 2,
      "gap": "Water splitting is implicit. Real electrolysis has temperature-dependent efficiency, electrode degradation, and minimum voltage thresholds.",
      "physics": {
        "equation": "Energy = n × F × E / η (Faraday's law)",
        "variables": ["cell_voltage", "current_density", "temperature", "electrode_age", "water_purity"],
        "constraints": "Minimum 1.23V. Practical: 1.8-2.2V. Efficiency drops with electrode fouling."
      },
      "data_sources": [
        "ISS OGS (Oxygen Generation System): 2.4 kW for 5.4 kg O₂/day",
        "PEM electrolyzer efficiency curves (70-85% depending on current density)",
        "Electrode degradation rates from ISS maintenance logs"
      ],
      "acceptance": [
        "Water electrolysis is an explicit step with power cost",
        "Electrode efficiency degrades over time",
        "Governor must balance ISRU power between Sabatier and electrolysis"
      ],
      "frames_to_generate": 0,
      "enrichment": "Retroactive electrode wear from Sol 1"
    },
    {
      "id": "v8-heat-transfer",
      "version": "v8",
      "title": "Habitat Heat Transfer Model",
      "status": "pending",
      "priority": 3,
      "gap": "Temperature is adjusted by a constant. Real heat transfer follows conduction/radiation/convection equations.",
      "physics": {
        "conduction": "Q = U × A × ΔT (U-value of habitat walls, W/m²K)",
        "radiation": "Q = ε × σ × A × (T_in⁴ - T_out⁴) (Stefan-Boltzmann)",
        "internal_gains": "Crew metabolic heat (~100W/person) + equipment waste heat",
        "variables": ["wall_thickness", "insulation_r_value", "surface_area", "crew_count", "equipment_load"]
      },
      "data_sources": [
        "Mars habitat thermal analysis (NASA JSC-CN-33799)",
        "ISS thermal control system specifications",
        "R-value of aerogel insulation (R-10.3 per inch)"
      ],
      "acceptance": [
        "Heating cost is proportional to ΔT between inside and outside",
        "Larger habitats lose more heat (surface area scales with size)",
        "Crew body heat contributes measurably to warming",
        "Night vs day temperature swing affects power scheduling"
      ],
      "frames_to_generate": 50,
      "enrichment": "Retroactive insulation degradation from Sol 1"
    },
    {
      "id": "v9-spatial-layout",
      "version": "v9",
      "title": "Module Position Grid",
      "status": "pending",
      "priority": 4,
      "gap": "Modules are a flat array. Real colonies have positions, connections, distances.",
      "physics": {
        "grid": "16×16 tiles, each 10m×10m (160m × 160m colony footprint)",
        "connections": "Plumbing, electrical, data lines between modules",
        "distance_cost": "Power loss = I²R × distance. Plumbing pumping = f(distance, elevation)",
        "construction": "Must connect to existing module within 2 tiles. Foundation prep: 3 sols."
      },
      "acceptance": [
        "Modules have (x,y) coordinates",
        "Distance between modules affects resource transfer efficiency",
        "Construction requires adjacency to existing infrastructure",
        "Minimap in player.html shows spatial layout"
      ],
      "frames_to_generate": 30,
      "enrichment": "None (new mechanic, not retroactive)"
    },
    {
      "id": "v10-failure-cascade",
      "version": "v10",
      "title": "System Dependency Graph",
      "status": "pending",
      "priority": 5,
      "gap": "Resources are independent. Real systems have cascading failure modes.",
      "physics": {
        "graph": {
          "water_recycler": ["humidity_control", "greenhouse_irrigation"],
          "humidity_control": ["greenhouse_transpiration", "crew_comfort"],
          "greenhouse": ["o2_production_biological", "food_production"],
          "power_grid": ["everything"],
          "isru": ["o2_production_chemical", "h2o_production"],
          "thermal": ["all_systems_below_threshold"]
        }
      },
      "acceptance": [
        "Failure in one system propagates through dependency graph",
        "Governor can see the graph and prioritize repairs",
        "Apollo 13 scenario: one failure triggers cascading crisis"
      ],
      "frames_to_generate": 30,
      "enrichment": "Retroactive micro-failure accumulation from Sol 1"
    },
    {
      "id": "v11-supply-windows",
      "version": "v11",
      "title": "Earth-Mars Transfer Windows",
      "status": "pending",
      "priority": 6,
      "gap": "Colony is self-contained. Real colonies get resupply every 26 months.",
      "physics": {
        "synodic_period": "779.9 days between launch windows",
        "transit_time": "180-270 days depending on trajectory",
        "cargo_mass": "100 tons to Mars surface (Starship class)",
        "landing_accuracy": "±10km, requires rover to retrieve scattered cargo"
      },
      "acceptance": [
        "Supply ships arrive on schedule (or don't — random failure chance)",
        "Colony must plan cargo manifests years in advance",
        "Missing a window means 26 more months without resupply",
        "Self-sufficiency metric: % of needs met locally vs imported"
      ],
      "frames_to_generate": 50,
      "enrichment": "None (new mechanic)"
    },
    {
      "id": "v12-crew-physiology",
      "version": "v12",
      "title": "Individual Crew Physiology",
      "status": "pending",
      "priority": 7,
      "gap": "Crew is {hp:100}. Real humans have mass, caloric needs, radiation dose tracking, bone/muscle loss.",
      "physics": {
        "radiation": "Career limit 1 Sv (NASA). Mars surface: ~0.67 mSv/day. Solar events: 10-100 mSv.",
        "bone_loss": "1-2% per month in reduced gravity. Exercise mitigates 50-70%.",
        "caloric": "2000-3000 kcal/day depending on body mass and activity level",
        "circadian": "Mars sol = 24h37m. Daily 37-minute drift disrupts sleep after weeks."
      },
      "acceptance": [
        "Each crew member has individual mass, radiation dose, bone density",
        "Radiation is cumulative and career-ending",
        "Exercise equipment is a module that prevents bone/muscle loss",
        "Food quality matters (not just quantity)"
      ],
      "frames_to_generate": 30,
      "enrichment": "Retroactive radiation dose accumulation from Sol 1"
    }
  ]
}
```

---

## Fleet B Harness

```bash
#!/bin/bash
# fleet-builder.sh — Autonomous fidelity builder
COPILOT="/opt/homebrew/bin/copilot"
BARN="/path/to/mars-barn-opus"
STOP="/tmp/marsbarn-builder-stop"

while [ ! -f "$STOP" ]; do
    ITEM=$(node -e "
      const q = require('$BARN/data/fidelity-queue.json');
      const next = q.queue.find(i => i.status === 'pending');
      if(next) console.log(next.id + '|' + next.title);
      else console.log('DONE');
    ")

    if [ "$ITEM" = "DONE" ]; then
        echo "All queue items complete. Sleeping 1 hour."
        sleep 3600
        continue
    fi

    ID=$(echo $ITEM | cut -d'|' -f1)
    TITLE=$(echo $ITEM | cut -d'|' -f2)

    echo "$(date) — Building: $ID ($TITLE)"

    $COPILOT -p "You are Fleet B: the FIDELITY BUILDER.
Your job: implement the next physics upgrade from the fidelity queue.

READ these files:
1. docs/CONVERGENCE-ROADMAP.md (the vision)
2. data/fidelity-queue.json (your work order)
3. RULES.md (current game rules)
4. tools/gauntlet.js (the sim engine to upgrade)

Your current task: $ID — $TITLE

Steps:
1. Read the queue item's physics, data sources, and acceptance criteria
2. Research the real equations (use web search if needed)
3. Add the new physics to tools/gauntlet.js
4. Generate new frames with the physics: python3 tools/generate_frames.py
5. Create retroactive enrichment if specified
6. Update RULES.md with new mechanics
7. Update data/frame-versions/versions.json
8. Run gauntlet: node tools/gauntlet.js --monte-carlo 10
9. Verify old strategies score LOWER (the fidelity is biting)
10. Mark status 'complete' in fidelity-queue.json
11. Commit everything with detailed message
12. DO NOT skip steps. Every acceptance criterion must be met.

Work in $BARN" \
    --yolo --autopilot --model claude-sonnet-4 \
    >> "$BARN/logs/fleet-builder-$ID.log" 2>&1

    echo "$(date) — Completed: $ID"
    sleep 300  # 5 min between builds
done
```

---

## The Feedback Loop

```
┌──────────────────────────────────────────────────┐
│                                                  │
│   Fleet A (COMPETE)                              │
│   ┌─────────────────────┐                        │
│   │ Evolve strategies   │                        │
│   │ Find exploits       │──── "CRI never above  │
│   │ Beat the record     │     5 because O₂ is   │
│   └─────────────────────┘     free" ◄────┐       │
│         │                                │       │
│         │ exploit reveals                │       │
│         │ missing physics                │       │
│         ▼                                │       │
│   Fidelity Queue                         │       │
│   ┌─────────────────────┐                │       │
│   │ v7: Sabatier chem   │                │       │
│   │ v8: Heat transfer   │                │       │
│   │ v9: Spatial layout  │                │       │
│   │ ...                 │                │       │
│   └─────────────────────┘                │       │
│         │                                │       │
│         │ next pending item              │       │
│         ▼                                │       │
│   Fleet B (BUILD)                        │       │
│   ┌─────────────────────┐                │       │
│   │ Research physics    │                │       │
│   │ Implement equations │                │       │
│   │ Generate frames     │                │       │
│   │ Update gauntlet     │──── O₂ now    │       │
│   │ Verify strategies   │     costs real │       │
│   │   break             │     power ─────┘       │
│   └─────────────────────┘                        │
│                                                  │
│   Both fleets run 24/7. No human needed.         │
│   The sim converges on reality autonomously.     │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## Safeguards

1. **RULES.md is law.** Fleet B updates it. Fleet A reads it. No contradictions.
2. **Acceptance criteria are binary.** Each queue item has testable conditions.
3. **Gauntlet is the judge.** If old strategies don't score lower, the fidelity isn't real.
4. **Git history is the audit trail.** Every physics change is a commit with data sources.
5. **Human reviews weekly.** Check `git log`, run gauntlet, verify physics makes sense.
6. **Stop file.** `touch /tmp/marsbarn-builder-stop` halts Fleet B instantly.
7. **Queue is ordered.** Fleet B works sequentially. No skipping ahead.

---

## Expected Timeline (Autonomous)

| Week | Fleet A (Compete) | Fleet B (Build) | Fidelity |
|------|-------------------|-----------------|----------|
| 1 | Adapts to v6 robots | v7 Sabatier chemistry | ~8% |
| 2 | Finds Sabatier exploits | v7 Electrolysis curves | ~10% |
| 3 | Adapts to real O₂ costs | v8 Heat transfer model | ~13% |
| 4 | Finds thermal exploits | v9 Spatial layout | ~18% |
| 5-6 | Adapts to spatial costs | v10 Failure cascading | ~25% |
| 7-8 | Finds cascade exploits | v11 Supply windows | ~30% |
| 9-12 | Adapts to supply chain | v12 Crew physiology | ~40% |
| 13+ | Continuous evolution | v13+ Human psychology | ~50%+ |

After 3 months of autonomous operation, the sim is **10× more realistic** than today.
After 6 months, it's approaching analog-habitat fidelity.
After 1 year, it's ready for real hardware integration.

No human intervention required. The snowball rolls itself.

---

> *"Two fleets. One competes. One builds.*
> *The competition reveals what's fake.*
> *The builder makes it real.*
> *Repeat until the simulation IS the colony."*
