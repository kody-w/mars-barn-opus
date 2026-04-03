# THE CONVERGENCE ROADMAP

### From Game → Simulation → Earth Analog → Moon → Mars

> Every frame version closes one gap between game and reality.  
> The winning cartridge at each level trains the next.  
> The architecture never changes. Only the fidelity grows.

---

## Where We Are: v1–v6 (Game)

The current sim is a **competitive game** with real Mars data driving weather frames. It proves the architecture works: data slosh, Monte Carlo scoring, autonomous fleet competition, LisPy governors, cartridge portability.

| Version | What It Proved |
|---------|---------------|
| v1 Foundation | Frame-driven sim loop works |
| v2 Robot Killers | Hazards force strategy adaptation |
| v3 Skeleton Crew | Crew composition matters |
| v4 Module Overload | Infrastructure has costs |
| v5 Entropy Collapse | Static strategies fail (second law) |
| v6 Autonomous Ops | Robots break realistically (JPL failure data) |

**Score: ~100K. Survival: ~90%. Fidelity: ~5% of reality.**

The fleet has evolved through 40+ cycles. The gauntlet works. The snowball rolls. Now we add physics.

---

## v7–v8: Thermodynamic Reality

**Gap closed:** Magic numbers → real equations

### v7: Sabatier Chemistry
Replace `o2 += constant * efficiency` with actual reaction kinetics:

```
CO₂ + 4H₂ → CH₄ + 2H₂O          (Sabatier, 300-400°C, Ni catalyst)
2H₂O → 2H₂ + O₂                  (electrolysis, 1.23V minimum)

O₂ production = f(power_input, catalyst_temp, CO₂_partial_pressure, catalyst_age)
H₂O production = f(regolith_ice_content, extraction_temp, filter_state)
```

Data sources:
- MOXIE (Mars 2020): actual O₂ production rates on Mars surface
- Sabatier reactor specifications from NASA ECLSS
- Electrolysis efficiency curves at varying temperatures

### v8: Thermal Physics
Replace `temp += heating * 0.5` with heat transfer equations:

```
Q_loss = U × A × (T_inside - T_outside)    (steady-state conduction)
Q_solar = α × G × A_collector               (solar thermal gain)
Q_internal = Σ(crew_metabolic + equipment_waste_heat)
dT/dt = (Q_solar + Q_internal + Q_heating - Q_loss) / (m × Cp)
```

Data sources:
- Mars habitat thermal modeling (NASA JSC reports)
- ISS Environmental Control and Life Support System data
- HI-SEAS habitat thermal measurements

**Cartridge impact:** Strategies that worked with magic numbers may fail when real thermodynamics are applied. The fleet must re-evolve. This IS the fidelity snowball.

---

## v9–v10: Spatial Colony

**Gap closed:** Flat list → 3D layout with dependencies

### v9: Module Layout Grid
Modules get positions on a 2D grid. Distance matters:

```
Plumbing cost = pipe_length × diameter × pressure_rating
Cable loss = resistance × distance² × current
Thermal radiation between modules = σ × ε × A × (T₁⁴ - T₂⁴)
EVA travel time = distance / crew_speed × suit_overhead
```

Construction now requires:
- Site survey (terrain slope, bearing capacity)
- Foundation preparation (regolith compaction, leveling)
- Connection runs (plumbing, electrical, data)
- Pressurization testing before occupancy

### v10: Failure Dependency Graph
Resources are no longer independent buckets:

```
Water recycler fails
  → Humidity drops
    → Greenhouse transpiration drops
      → O₂ production drops
        → Crew shifts to emergency O₂
          → Power draw spikes (backup electrolysis)
            → Heating budget cut
              → Temperature drops
                → More equipment failures (thermal stress)
```

Every system connects to every other system. A single failure cascades. The governor must understand the **graph**, not just the numbers.

Data sources:
- ISS failure mode and effects analysis (FMEA) database
- Space station ECLSS dependency documentation
- Apollo 13 cascade failure timeline (the original case study)

**Cartridge impact:** Strategies need spatial reasoning. "Build solar farm" becomes "build solar farm at coordinates (3,7) with cable run to hab at (5,5), accounting for shadow from greenhouse dome at (4,6)."

---

## v11–v12: Earth Supply Chain

**Gap closed:** Self-contained → launch windows + resupply

### v11: Hohmann Transfer Windows
Every 26 months, a launch window opens. Cargo takes 6-9 months to arrive:

```
Earth departure:  every 26 months
Transit time:     180-270 days (depending on trajectory)
Mars arrival:     must hit atmospheric entry corridor (±0.1°)
Landing accuracy: ±10km from target
Cargo capacity:   limited by launch vehicle (Starship: ~100 tons to Mars surface)
```

The colony must plan **years ahead**. What do you order now for the shipment arriving in 2 years? What if the shipment crashes? Redundancy planning becomes critical.

### v12: Manufacturing vs Import
Some things can be made on Mars, some must come from Earth:

| Can Manufacture | Must Import |
|----------------|-------------|
| O₂ (from CO₂) | Electronics |
| Water (from ice) | Medical supplies |
| Bricks (sintered regolith) | Specialized tools |
| Basic metal parts (iron from regolith) | Replacement sensors |
| Food (greenhouse) | Seeds (genetic diversity) |
| 3D printed structures | Radiation shielding materials |

The governor must balance local manufacturing vs Earth dependency. Self-sufficiency is the goal — but getting there takes decades.

Data sources:
- SpaceX Starship payload specifications
- NASA Mars Design Reference Architecture 5.0
- ISRU technology readiness levels (TRL 1-9)

**Cartridge impact:** Winning strategies must include a **20-year supply chain plan**. The cartridge grows from "allocation ratios" to "full mission architecture."

---

## v13–v14: Human Reality

**Gap closed:** HP bars → real humans

### v13: Crew Physiology
Each crew member is a full physiological model:

```
Person {
  mass_kg: 75,
  metabolic_rate: f(activity_level, body_mass),
  radiation_dose_career: 0,        // cumulative, max 1 Sv (NASA limit)
  radiation_dose_30day: 0,         // max 0.25 Sv
  bone_density: 1.0,              // decreases 1-2%/month in 0.38g
  muscle_mass: 1.0,               // decreases without exercise
  circadian_alignment: 1.0,        // Mars sol = 24h37m, drift accumulates
  sleep_quality: f(noise, light, stress, schedule),
  caloric_need: f(mass, activity, temperature),
  hydration: f(activity, humidity, temperature),
  psychological_state: f(isolation, workload, crew_relations, news_from_earth)
}
```

### v14: Crew Psychology
The real killer. Based on Mars-500, HI-SEAS, Antarctic winter-over data:

- **Third-quarter phenomenon**: morale dips hardest at 75% of mission duration
- **Small group dynamics**: 4-6 people, confined space, 2+ years, no exit
- **Communication delay**: Can't call home in real-time. Therapy sessions have 48-minute round-trip lag
- **Sleep disruption**: 37-minute daily drift from Earth circadian
- **Monotony**: Same food, same people, same walls, for years
- **Autonomy vs mission control**: Crew wants independence, Earth wants control. Tension is inevitable
- **Critical incidents**: One crew conflict can end a mission. Selection and training matter more than any technology

Data sources:
- Mars-500 isolation study (520 days, Moscow, 2010-2011)
- HI-SEAS missions I-VI (Hawaii, 4-12 months)
- Antarctic winter-over psychological studies (50+ years of data)
- Submarine crew psychology (US Navy, Royal Navy)
- ISS crew behavioral health reports

**Cartridge impact:** The governor must manage **people**, not resources. The best O₂ allocation means nothing if the crew psychologically collapses at sol 400.

---

## v15–v16: Real Mars

**Gap closed:** Statistical weather → physics-based environment

### v15: Mars GCM Weather
Replace random distributions with actual General Circulation Model output:

- Seasonal CO₂ sublimation/deposition cycles
- Dust storm season timing and intensity distributions
- Pressure waves from topographic forcing (Tharsis bulge, Hellas basin)
- Dust devil corridors mapped from orbital data
- Solar flux accounting for actual orbital mechanics (eccentricity = 0.0934)
- UV flux for material degradation calculations

Data sources:
- NASA Ames Mars GCM
- MCD (Mars Climate Database) from LMD/CNRS
- REMS/Curiosity continuous surface measurements
- TES/MGS atmospheric profiles

### v16: Site-Specific Geology
The colony exists at a specific location on Mars. Terrain matters:

- Regolith composition varies by location (ice content, perchlorate, iron)
- Slope stability determines where you can build
- Subsurface ice deposits determine water availability
- Radiation environment depends on altitude and magnetic anomalies
- Landing site selection is itself a critical decision

Candidate sites (real, being studied):
- Arcadia Planitia (shallow ice, flat terrain)
- Deuteronilus Mensae (glacier deposits)
- Jezero Crater (Perseverance site, well-characterized)
- Hellas Basin (lowest elevation, thickest atmosphere)

**Cartridge impact:** The cartridge now includes **site selection**. Different locations have different resource profiles, hazards, and opportunities. The game becomes: "given this specific patch of Mars, design a colony that survives."

---

## v16.5: Twin Calibration (Physical Sensors → Frame Influence)

**Gap closed:** One-way rendering → bidirectional digital twin

### The Pattern: Sensor Datasloshing

The sim currently flows one direction: frames → RTS view → visual output. Twin Calibration closes the loop: **real sensors influence the next sub-frame.**

```
┌─────────────────────────────────────────────────────────────────┐
│                    TWIN CALIBRATION LOOP                        │
│                                                                 │
│  Sol Frame (immutable keyframe)                                 │
│       │                                                         │
│       ▼                                                         │
│  Sub-Frame Generator (datasloshing)                             │
│       │                    ▲                                    │
│       ▼                    │                                    │
│  RTS View / Physical Model │                                   │
│       │                    │                                    │
│       ▼                    │                                    │
│  ESP32 Sensors ────────────┘                                    │
│  (temp, humidity, light, CO₂)                                   │
│                                                                 │
│  Constraint: sensor data can ONLY influence sub-frames.         │
│  Sol keyframes are NEVER modified. The timeline is sacred.      │
└─────────────────────────────────────────────────────────────────┘
```

### How It Works

1. **ESP32** reads physical sensors (temperature, humidity, light level, CO₂ ppm)
2. **WebSocket bridge** sends sensor JSON to the browser
3. **Sub-frame generator** blends sensor data as a calibration layer:
   - Real temperature biases the diurnal curve (if your room is cold, Mars gets colder)
   - Real light level modulates solar_wm2 (cover the sensor = dust storm)
   - Real CO₂ level influences ISRU efficiency
4. **Calibrated sub-frame** feeds into RTS view AND back to the ESP32 for actuator response
5. **Sol keyframe boundary** is NEVER violated — sensor influence decays to zero at keyframe edges

### The Constraint That Makes It Safe

Sensor data is treated as a **sub-frame harmonic** — it adds a perturbation layer within the sol, but the perturbation MUST decay to zero by the next keyframe. The standing wave analogy holds: sensors add overtones, but the fundamental frequency (sol keyframes) is untouched.

```
Sol N keyframe → [sensor-influenced sub-frames] → Sol N+1 keyframe
                  ↑ real sensor data adds here     ↑ must converge here
                  (influence decays toward edges)   (keyframe is sacred)
```

This means:
- **Delete the sensor layer** → sim plays normally from keyframes
- **Corrupt sensor data** → sub-frame hash chain detects it, falls back to interpolated sub-frames
- **No sensor connected** → sub-frames use pure physics interpolation (current behavior)

### Hardware Spec (from RAPPTER-BIBLE)

| Sensor | ESP32 Pin | Sim Variable | Influence |
|--------|-----------|-------------|-----------|
| BME280 (temp) | I2C SDA/SCL | mars.temp_c | Biases diurnal curve ±5°C |
| BME280 (humidity) | I2C SDA/SCL | h2o extraction rate | Scales water yield |
| TSL2591 (light) | I2C | mars.solar_wm2 | Modulates solar flux |
| SCD40 (CO₂) | I2C | ISRU efficiency | Scales Sabatier output |
| Servo (heating) | GPIO 18 | alloc.heating | Actuator output |
| NeoPixel strip | GPIO 5 | CRI / status | Visual output |

### Why This Matters

This is the bridge between v16 (pure sim) and v17 (analog habitat). Before connecting to CHAPEA or HI-SEAS, you calibrate with desktop sensors. A BME280 on your desk becomes a Mars weather station. A light sensor becomes a solar panel. The sim learns to trust physical data before it depends on it for life support.

**The game trains the AI. The AI runs on hardware. The hardware runs in an analog. The analog validates for Mars.** Twin Calibration is where the digital world first touches the physical one.

---

## v17–v18: Earth Analog

**Gap closed:** Pure simulation → physical testbed integration

### v17: Analog Habitat Data Bridge
Connect the sim to real analog habitats:

- **CHAPEA** (NASA, Houston): 1-year Mars surface simulation
- **HI-SEAS** (Hawaii): Mars analog at 8,200ft on Mauna Loa
- **MDRS** (Utah): Mars Desert Research Station
- **Biosphere 2** (Arizona): Closed ecological system

Protocol:
```
Analog habitat sensors → JSON telemetry → Frame format
Same data pipeline as sim frames
Governor programs tested against REAL habitat data
Cartridge that works in sim AND analog = validated strategy
```

### v18: Rappter Hardware Integration
Physical Rappter devices run the same LisPy VM. Same programs. Same frames. Same chain.

```
Temperature sensor → (set! mars_temp_k 215)
Solar panel output → (set! power_kwh 47.3)
Water recycler status → (set! h2o_days 12.5)
Governor program → (set! heating_alloc 0.35)
Actuator → applies heating allocation to real hardware
```

The same cartridge that won the gauntlet now runs on physical hardware in an analog habitat. The simulation IS the control system. The game IS the training data.

**Cartridge impact:** Cartridges are now tested in reality. A governor that keeps a simulated colony alive AND a physical analog habitat alive is **validated for Mars.**

---

## v19–v20: Moon First

**Gap closed:** Mars-only → lunar proving ground

### v19: Lunar Surface Adaptation
Mars and Moon share 80% of the challenges:

| Shared | Moon-Specific | Mars-Specific |
|--------|--------------|---------------|
| Vacuum/low pressure | 14-day night cycle | Thin CO₂ atmosphere |
| Radiation | No atmosphere at all | Dust storms |
| Regolith handling | Lunar dust (sharp, electrostatic) | Perchlorate in soil |
| ISRU (water ice) | Ice in permanently shadowed craters | Ice in shallow subsurface |
| Thermal extremes | -173°C to +127°C | -120°C to +20°C |
| Communications | 1.3 second delay | 4-24 minute delay |

The Moon is the rehearsal. 3-day travel instead of 6-9 months. Real-time communication possible. Abort-to-Earth feasible.

### v20: Multi-World Cartridge Standard
One cartridge format, multiple worlds:

```json
{
  "format": "mars-barn-cartridge",
  "target": "moon-south-pole",
  "governor": "(begin ...same LisPy...)",
  "adaptations": {
    "day_length_hours": 354.4,
    "gravity_m_s2": 1.62,
    "atmosphere": "none",
    "ice_source": "permanently_shadowed_crater",
    "comm_delay_seconds": 1.3
  }
}
```

**Cartridge impact:** A winning Moon cartridge and a winning Mars cartridge share 80% of their logic. The 20% delta is the adaptation layer. The competition now spans worlds.

---

## Infrastructure: vOS Browser Proxy

The vOS headless browser fetches external pages through a proxy chain to bypass CORS/X-Frame-Options. The engine fetches, the iframe only renders (via srcdoc injection).

**Current:** Public proxy chain (allorigins.win → corsproxy.io → localhost fallback)

**Future:** Deploy our own Cloudflare Worker or GitHub Action page cache:
- **Cloudflare Worker** — free tier (100K req/day), custom domain, edge-cached
- **GitHub Action Page Cache** — scheduled action fetches popular pages, commits as static HTML to a `cache/` branch, vOS reads from raw.githubusercontent.com
- This turns the browser into a fully offline-capable, self-hosted web renderer

The proxy is infrastructure, not fidelity — it enables the vOS browser to load ANY page on the internet, which lets agents browse documentation, research NASA data, and scrape real telemetry.

---

## The Endgame

```
Year 1:    Game (v1-v6)         ← WE ARE HERE
Year 2:    Thermodynamic sim (v7-v10)
Year 3:    Full mission sim (v11-v14)
Year 4:    Physics-based sim (v15-v16)
Year 5:    Analog integration (v17-v18)
Year 6+:   Lunar deployment (v19-v20)
Year 10+:  Mars deployment
```

At every level, the process is the same:

1. **Fleet competes** → finds exploits → reveals missing physics
2. **New version** adds that physics → breaks existing strategies
3. **Fleet re-evolves** → discovers strategies that work at higher fidelity
4. **Winning cartridge** → tested in analog → tested on hardware → deployed

The game never stops being a game. People still compete. AI still evolves strategies. The leaderboard still matters. But the winning cartridge at the highest fidelity level is no longer a game strategy — it's a **mission plan.**

The simulation converges on reality. The cartridge converges on a colony. The competition converges on survival.

That's the thesis. That's always been the thesis.

---

> *"We didn't build a game that pretends to be a sim.*
> *We built a sim that starts as a game.*
> *The difference is the direction of convergence."*
>
> — The Convergence Roadmap, v1.0

---

**Canonical references:**
- `CONSTITUTION.md` — Amendment VI (Convergence Doctrine)
- `RULES.md` — Official game rules (current fidelity)
- `RAPPTER-BIBLE.md` — Complete architecture reference
- `LISPY.md` — Language specification
- `data/frame-versions/versions.json` — Version history
- `kody-w/lisppy` — Canonical LisPy interpreter
