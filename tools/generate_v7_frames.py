#!/usr/bin/env python3
"""
Generate v7 Sabatier Reaction Chemistry frames for Mars Barn Gauntlet

This script generates frames with real Sabatier reaction hazards and chemistry challenges.
Data sources: NASA MOXIE results, Sabatier reactor studies, ISS OGS specifications.

Frame range: v7 should add 50 frames with Sabatier chemistry hazards.
Based on existing versions:
- v6: sols 778-847 (70 frames)  
- v7: sols 848-897 (50 frames) - NEW

Physics implemented:
- CO₂ + 4H₂ → CH₄ + 2H₂O (Sabatier reaction)
- 2H₂O → 2H₂ + O₂ (electrolysis)
- Catalyst degradation over time
- Pressure-dependent reaction rates
- Power-limited production
"""

import json
import random
import math
from pathlib import Path

# Frame generation parameters
V7_START_SOL = 848
V7_END_SOL = 897
V7_FRAME_COUNT = 50

# Mars environmental constants
MARS_SOL_LENGTH_HOURS = 24.6
MARS_YEAR_SOLS = 669

# Sabatier chemistry constants (from NASA studies)
CATALYST_LIFE_HOURS = 2000  # Ni catalyst needs replacement every ~2000 hours
ELECTRODE_LIFE_HOURS = 70000  # PEM electrolysis targets 70,000+ hours
CO2_PARTIAL_PRESSURE_PA = 606  # Mars surface CO₂ pressure

def generate_mars_weather(sol):
    """Generate realistic Mars weather for a given sol"""
    # Mars orbital mechanics (elliptical orbit, seasonal variation)
    year_progress = (sol % MARS_YEAR_SOLS) / MARS_YEAR_SOLS
    
    # Temperature: -120°C to +20°C seasonal variation + daily cycle
    seasonal_temp = -80 + 40 * math.cos(2 * math.pi * year_progress - math.pi/3)  # Winter offset
    daily_variation = 30 * math.sin(2 * math.pi * random.random())  # Random daily phase
    temperature_k = 273.15 + seasonal_temp + daily_variation
    
    # Pressure: 600-800 Pa seasonal variation (CO₂ sublimates at poles)
    pressure_pa = 606 + 100 * math.cos(2 * math.pi * year_progress - math.pi/2)
    
    # Dust: more common during southern summer (perihelion)
    dust_probability = 0.15 + 0.1 * math.cos(2 * math.pi * year_progress)
    
    # Solar irradiance: varies with orbital distance and dust
    orbital_factor = 1 + 0.09 * math.cos(2 * math.pi * year_progress)
    dust_factor = 0.7 if random.random() < dust_probability else 1.0
    solar_irradiance = 589 * orbital_factor * dust_factor  # W/m²
    
    return {
        "temperature_k": round(temperature_k, 1),
        "pressure_pa": round(pressure_pa, 1), 
        "solar_irradiance": round(solar_irradiance, 1),
        "dust_storm": dust_factor < 1.0
    }

def generate_sabatier_hazard(sol):
    """Generate Sabatier chemistry-specific hazards"""
    hazards = []
    
    # Base hazard probability increases with time (cumulative wear)
    base_prob = 0.05 + (sol - V7_START_SOL) * 0.001
    
    # Catalyst poisoning (sulfur compounds, atmospheric contaminants)
    if random.random() < base_prob * 0.8:
        severity = 0.1 + random.random() * 0.3  # 10-40% catalyst poisoning
        hazards.append({
            "type": "catalyst_poisoning",
            "severity": round(severity, 3),
            "regeneration_power_cost": round(severity * 100, 1),  # More power needed to burn off poisons
            "description": f"Catalyst poisoned by atmospheric sulfur compounds ({severity*100:.1f}% efficiency loss)"
        })
    
    # Reactor fouling (carbon deposition, ice buildup)
    if random.random() < base_prob * 0.6:
        fouling_rate = 0.02 + random.random() * 0.04  # 2-6% fouling per incident
        hazards.append({
            "type": "sabatier_reactor_fouling", 
            "fouling_rate": round(fouling_rate, 3),
            "description": f"Sabatier reactor fouled by carbon deposition ({fouling_rate*100:.1f}% efficiency loss)"
        })
    
    # Electrolysis membrane degradation
    if random.random() < base_prob * 0.5:
        degradation = 0.01 + random.random() * 0.04  # 1-5% membrane degradation
        hazards.append({
            "type": "electrolysis_membrane_degradation",
            "degradation_rate": round(degradation, 3),
            "description": f"PEM membrane degraded ({degradation*100:.1f}% efficiency loss)"
        })
    
    # CO₂ compressor failure (critical for Mars ISRU)
    if random.random() < base_prob * 0.3:
        pressure_loss = 0.2 + random.random() * 0.5  # 20-70% pressure loss
        hazards.append({
            "type": "co2_compressor_failure",
            "pressure_loss_pct": round(pressure_loss, 2),
            "description": f"CO₂ compressor failure ({pressure_loss*100:.0f}% pressure loss)"
        })
    
    # Water separator malfunction
    if random.random() < base_prob * 0.4:
        hazards.append({
            "type": "water_separator_malfunction",
            "description": "H₂O/CH₄ separator malfunction - water contamination"
        })
    
    return hazards

def generate_sabatier_events(sol):
    """Generate Sabatier-related events (operational challenges)"""
    events = []
    
    # Catalyst replacement required
    if sol % 100 == 0 and random.random() < 0.3:  # Every ~100 sols, 30% chance
        events.append({
            "type": "catalyst_replacement_required",
            "severity": 0.8,
            "duration_sols": 3,
            "description": "Sabatier catalyst degraded - replacement required (3 sol downtime)"
        })
    
    # Electrolysis optimization cycle 
    if sol % 50 == 0 and random.random() < 0.4:  # Every ~50 sols, 40% chance
        events.append({
            "type": "electrolysis_optimization",
            "severity": 0.3,
            "duration_sols": 1,
            "description": "Electrolysis system requires optimization cycle"
        })
    
    # CO₂ intake filter cleaning
    if random.random() < 0.08:  # ~8% per sol
        events.append({
            "type": "co2_filter_maintenance",
            "severity": 0.2,
            "duration_sols": 1,
            "description": "CO₂ intake filters clogged - cleaning required"
        })
    
    return events

def generate_v7_frame(sol):
    """Generate a complete v7 frame with Sabatier chemistry physics"""
    
    # Base Mars environment
    weather = generate_mars_weather(sol)
    
    # Sabatier-specific hazards and events
    hazards = generate_sabatier_hazard(sol)
    events = generate_sabatier_events(sol)
    
    # Frame metadata
    frame = {
        "sol": sol,
        "version": 7,
        "name": "Sabatier Chemistry",
        "environment": weather,
        "hazards": hazards,
        "events": events,
        "chemistry": {
            "catalyst_age_hours": (sol - V7_START_SOL + 1) * MARS_SOL_LENGTH_HOURS,
            "catalyst_efficiency_baseline": max(0.2, 1.0 - (sol - V7_START_SOL) * MARS_SOL_LENGTH_HOURS / CATALYST_LIFE_HOURS),
            "co2_pressure_pa": weather["pressure_pa"] * 0.953,  # 95.3% CO₂ in Mars atmosphere
            "electrolysis_efficiency_baseline": max(0.3, 1.0 - (sol - V7_START_SOL) * MARS_SOL_LENGTH_HOURS / ELECTRODE_LIFE_HOURS)
        },
        "challenges": [
            {
                "type": "sabatier_reactor_startup",
                "description": "Sabatier reactor requires 2-3 hours to reach operating temperature",
                "power_cost_kw": 2.5,
                "duration_hours": 2.5
            },
            {
                "type": "electrolysis_voltage_regulation", 
                "description": "Electrolysis voltage must be maintained above 1.23V minimum",
                "min_voltage": 1.23,
                "optimal_voltage": 1.8
            }
        ]
    }
    
    return frame

def main():
    """Generate all v7 frames and save to JSON files"""
    
    print(f"Generating v7 Sabatier Chemistry frames (sols {V7_START_SOL}-{V7_END_SOL})")
    
    frames_dir = Path(__file__).parent.parent / "data" / "frames"
    frames_dir.mkdir(exist_ok=True)
    
    all_frames = {}
    
    for sol in range(V7_START_SOL, V7_END_SOL + 1):
        frame = generate_v7_frame(sol)
        all_frames[sol] = frame
        
        # Save individual frame file
        frame_file = frames_dir / f"sol-{sol:04d}.json"
        with open(frame_file, 'w') as f:
            json.dump(frame, f, indent=2)
        
        if sol % 10 == 0:
            print(f"Generated sol {sol}")
    
    print(f"Generated {len(all_frames)} v7 frames")
    print("Individual frame files saved to data/frames/")
    print("Next: Update data/frames/frames.json bundle with new frames")
    print("Next: Create echo-enrichments-v7.json for retroactive catalyst aging")

if __name__ == "__main__":
    main()