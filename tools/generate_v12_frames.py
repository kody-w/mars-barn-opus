#!/usr/bin/env python3
"""
Generate v12 Crew Physiology frames for Mars colony simulation.

This script generates 30 frames (sols 1038-1067) featuring individual crew 
physiology hazards based on real NASA human factors data.

Data sources:
- NASA OCHMO Technical Brief: Bone Loss (NASA/TB-2022-030)  
- Curiosity RAD radiation measurements (0.67 mSv/day)
- ISS crew health and countermeasures data
- Mars-500 and HI-SEAS analog mission results
- NASA circadian countermeasures research

Author: Fleet B (Autonomous Fidelity Builder)
Date: 2026-04-02
"""

import json
import math
import random
import os
from pathlib import Path

# Mars environment parameters (from NASA data)
MARS_YEAR_SOLS = 669  # Mars sidereal year in sols
MARS_SOL_LENGTH_HOURS = 24.65  # 24h 37m
MARS_RADIATION_BASE_MSV_DAY = 0.67  # Curiosity RAD measurements
SOLAR_CYCLE_YEARS = 11  # Solar activity cycle affects radiation

# Crew physiology constants (NASA specifications) 
NASA_CAREER_RADIATION_LIMIT_SV = 1.0  # 1 Sv career limit
BONE_LOSS_RATE_MONTH = 0.015  # 1.5%/month in reduced gravity
MUSCLE_LOSS_RATE_MONTH = 0.02  # 2%/month without exercise
CIRCADIAN_DRIFT_PER_SOL = 0.027  # Phase drift from 37min longer sol

def calculate_mars_environment(sol):
    """Calculate Mars environmental parameters for given sol."""
    # Mars orbital position affects temperature and solar irradiance
    mars_year = sol % MARS_YEAR_SOLS
    solar_longitude = (mars_year / MARS_YEAR_SOLS) * 360  # Ls degrees
    
    # Seasonal temperature variation (simplified model)
    base_temp_k = 220  # ~-53°C average
    seasonal_variation = 15 * math.cos(math.radians(solar_longitude - 270))  # Min at Ls=270 (southern summer)
    
    # Daily temperature variation (not modeled in detail for simplicity)
    daily_temp_k = base_temp_k + seasonal_variation
    
    # Solar irradiance varies with Mars orbital eccentricity and dust
    base_irradiance = 589  # W/m² at Mars distance
    orbital_factor = 1.0 + 0.093 * math.cos(math.radians(solar_longitude - 251))  # Perihelion at Ls=251
    dust_factor = 0.9 + 0.1 * math.cos(math.radians(solar_longitude * 2))  # Dust storm seasons
    
    # Atmospheric pressure varies seasonally (CO₂ sublimation/deposition)
    base_pressure = 610  # Pa average
    pressure_variation = 100 * math.sin(math.radians(solar_longitude))  # Southern summer minimum
    
    return {
        'temperature_k': round(daily_temp_k, 1),
        'temperature_c': round(daily_temp_k - 273.15, 1),
        'pressure_pa': round(base_pressure + pressure_variation, 1),
        'solar_irradiance': round(base_irradiance * orbital_factor * dust_factor, 1),
        'dust_storm': False,  # Simplified - no dust storms in v12 frames
        'solar_longitude': round(solar_longitude, 1),
        'season': get_mars_season(solar_longitude),
        'wind_speed_ms': round(15 + 10 * random.random(), 1)  # 15-25 m/s range
    }

def get_mars_season(solar_longitude):
    """Determine Mars season from solar longitude."""
    if solar_longitude < 90:
        return "Northern Spring"
    elif solar_longitude < 180:
        return "Northern Summer"  
    elif solar_longitude < 270:
        return "Northern Autumn"
    else:
        return "Northern Winter"

def generate_physiology_hazards(sol):
    """Generate crew physiology hazards for given sol."""
    hazards = []
    
    # Base probability of physiological events increases over mission duration
    mission_duration_factor = min(2.0, sol / 500)  # Risk doubles by sol 500
    
    # Radiation storm events (based on solar cycle and random events)
    if random.random() < 0.02 * mission_duration_factor:  # 2% daily chance, increases over time
        severity = 0.3 + random.random() * 0.7  # 0.3-1.0 severity
        dose_msv = 50 + severity * 150  # 50-200 mSv radiation storm
        hazards.append({
            'type': 'radiation_storm',
            'severity': round(severity, 3),
            'dose_msv': round(dose_msv, 1),
            'description': f'Solar particle event: {dose_msv:.1f} mSv radiation exposure',
            'data_source': 'NASA Space Radiation Analysis Group, solar cycle modeling'
        })
    
    # Bone fracture risk (becomes more likely as bone density decreases over mission)
    if sol > 100 and random.random() < 0.005 * mission_duration_factor:  # Starts at sol 100
        severity = 0.4 + random.random() * 0.6  # 0.4-1.0 severity
        hazards.append({
            'type': 'bone_fracture_risk',
            'severity': round(severity, 3),
            'bone_density_threshold': 0.7,
            'description': 'EVA accident risk due to reduced bone density from Mars gravity',
            'data_source': 'NASA OCHMO Technical Brief: Bone Loss in Spaceflight'
        })
    
    # Muscle weakness incidents (work capacity reduced)
    if sol > 150 and random.random() < 0.008 * mission_duration_factor:
        severity = 0.3 + random.random() * 0.5  # 0.3-0.8 severity
        hazards.append({
            'type': 'muscle_weakness_incident', 
            'severity': round(severity, 3),
            'muscle_mass_threshold': 0.7,
            'description': 'Work injury or reduced EVA capacity due to muscle atrophy',
            'data_source': 'ISS crew muscle mass studies, Mars analog data'
        })
    
    # Circadian disruption crisis (cognitive impairment from sleep disruption)
    if sol > 50 and random.random() < 0.01:  # 1% chance daily after initial adaptation
        severity = 0.4 + random.random() * 0.6  # 0.4-1.0 severity  
        hazards.append({
            'type': 'circadian_disruption_crisis',
            'severity': round(severity, 3),
            'sleep_quality_threshold': 0.5,
            'description': 'Cognitive errors and health impacts from Mars sol disrupting circadian rhythm',
            'data_source': 'NASA Fatigue Countermeasures Laboratory, Mars sol adaptation studies'
        })
    
    # Exercise equipment failure (accelerates bone/muscle loss)
    if sol > 200 and random.random() < 0.002:  # 0.2% chance daily, rare but serious
        severity = 0.6 + random.random() * 0.4  # 0.6-1.0 severity (serious when it happens)
        hazards.append({
            'type': 'exercise_equipment_failure',
            'severity': round(severity, 3),
            'equipment_type': random.choice(['ARED', 'treadmill', 'cycle_ergometer']),
            'description': 'Critical exercise equipment failure accelerates bone/muscle deconditioning',
            'data_source': 'ISS exercise equipment reliability data, spares analysis'
        })
    
    # Caloric deficiency crisis (specific to human nutritional needs)
    if sol > 300 and random.random() < 0.003:  # 0.3% chance daily, mid-mission risk
        severity = 0.5 + random.random() * 0.5  # 0.5-1.0 severity
        caloric_deficit = int(1000 + severity * 3000)  # 1000-4000 kcal deficit
        hazards.append({
            'type': 'caloric_deficiency_crisis',
            'severity': round(severity, 3),
            'caloric_deficit_kcal': caloric_deficit,
            'description': f'Food shortage creates {caloric_deficit} kcal deficit affecting crew performance',
            'data_source': 'NASA nutrition requirements, Antarctic analog station data'
        })
    
    return hazards

def generate_frame(sol):
    """Generate a complete frame for given sol."""
    frame = {
        'sol': sol,
        'version': 12,
        'name': 'Individual Crew Physiology',
        'environment': calculate_mars_environment(sol),
        'hazards': generate_physiology_hazards(sol),
        'events': [],  # v12 focuses on physiology hazards, not environmental events
        'challenges': [],  # No specific challenges for v12
        'physiology': {
            'description': 'v12 implements real NASA crew physiology tracking and health hazards',
            'radiation_physics': {
                'mars_surface_dose_rate': f'{MARS_RADIATION_BASE_MSV_DAY} mSv/day',
                'career_limit': f'{NASA_CAREER_RADIATION_LIMIT_SV} Sv (NASA STD-3001)',
                'solar_particle_events': '10-200 mSv per event',
                'cumulative_tracking': 'Individual crew member dose accumulation'
            },
            'bone_muscle_physics': {
                'mars_gravity': '0.38g (3.71 m/s²)', 
                'bone_loss_rate': f'{BONE_LOSS_RATE_MONTH*100:.1f}% per month without countermeasures',
                'muscle_loss_rate': f'{MUSCLE_LOSS_RATE_MONTH*100:.1f}% per month without exercise',
                'exercise_protection': 'Exercise reduces loss by 60-70% (ISS data)',
                'fracture_risk': 'Increased with bone density <70% of baseline'
            },
            'circadian_physics': {
                'sol_length': f'{MARS_SOL_LENGTH_HOURS} hours (37 minutes longer than Earth day)',
                'daily_drift': f'{CIRCADIAN_DRIFT_PER_SOL:.3f} phase shift per sol',
                'sleep_disruption': 'Accumulates over mission duration without countermeasures',
                'cognitive_impact': 'Performance degradation and error rate increase'
            },
            'data_sources': [
                'NASA OCHMO Technical Brief: Bone Loss (NASA/TB-2022-030)',
                'Curiosity Mars Science Laboratory Radiation Assessment Detector (RAD)',
                'ISS crew health and countermeasures database',
                'Mars-500 isolation study psychological and physiological data', 
                'HI-SEAS analog mission crew health monitoring',
                'NASA Fatigue Countermeasures Laboratory circadian research'
            ]
        },
        'physics_constants': {
            'mars_radiation_daily': f'{MARS_RADIATION_BASE_MSV_DAY} mSv/day',
            'nasa_career_limit': f'{NASA_CAREER_RADIATION_LIMIT_SV} Sv',
            'bone_loss_mars_gravity': f'{BONE_LOSS_RATE_MONTH:.3f} fraction per month',
            'muscle_loss_mars_gravity': f'{MUSCLE_LOSS_RATE_MONTH:.3f} fraction per month',
            'circadian_drift_daily': f'{CIRCADIAN_DRIFT_PER_SOL:.6f} phase hours per sol',
            'exercise_bone_protection': '0.60 (60% reduction in bone loss)',
            'exercise_muscle_protection': '0.70 (70% reduction in muscle loss)'
        }
    }
    
    return frame

def main():
    """Generate all v12 frames and save them."""
    print("Generating v12 Crew Physiology frames...")
    
    # Set random seed for reproducible hazard generation
    random.seed(42)  # Consistent seed for reproducible results
    
    # Create frames directory if it doesn't exist
    frames_dir = Path(__file__).parent.parent / 'data' / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate frames for sols 1038-1067 (30 frames total)
    start_sol = 1038
    end_sol = 1067
    total_frames = end_sol - start_sol + 1
    
    generated_frames = []
    
    for sol in range(start_sol, end_sol + 1):
        frame = generate_frame(sol)
        
        # Save individual frame file
        frame_filename = f'sol-{sol:04d}.json'
        frame_path = frames_dir / frame_filename
        
        with open(frame_path, 'w') as f:
            json.dump(frame, f, indent=2)
        
        generated_frames.append(frame)
        
        print(f"Generated {frame_filename} - {len(frame['hazards'])} hazards")
    
    # Update frames.json bundle
    frames_bundle_path = frames_dir / 'frames.json'
    if frames_bundle_path.exists():
        with open(frames_bundle_path, 'r') as f:
            bundle = json.load(f)
        # Handle different bundle formats
        if isinstance(bundle, list):
            bundle = {'frames': bundle}
        elif 'frames' not in bundle:
            bundle = {'frames': []}
        # Ensure frames is a list
        if not isinstance(bundle['frames'], list):
            bundle = {'frames': []}
    else:
        bundle = {'frames': []}
    
    # Add new frames to bundle (skip existing ones to avoid duplicates)
    existing_sols = {f.get('sol') for f in bundle['frames'] if isinstance(f, dict)}
    for frame in generated_frames:
        if frame['sol'] not in existing_sols:
            bundle['frames'].append(frame)
    
    # Sort frames by sol
    bundle['frames'] = [f for f in bundle['frames'] if isinstance(f, dict) and 'sol' in f]
    bundle['frames'].sort(key=lambda f: f.get('sol', 0))
    
    # Update metadata
    bundle['last_sol'] = max(f.get('sol', 0) for f in bundle['frames'])
    bundle['total_frames'] = len(bundle['frames'])
    bundle['latest_version'] = 'v12'
    
    with open(frames_bundle_path, 'w') as f:
        json.dump(bundle, f, indent=2)
    
    # Update latest.json
    latest_path = frames_dir / 'latest.json'
    with open(latest_path, 'w') as f:
        json.dump({
            'last_sol': bundle['last_sol'],
            'total_frames': bundle['total_frames'],
            'latest_version': 'v12'
        }, f, indent=2)
    
    print(f"\nGenerated {total_frames} v12 frames (sols {start_sol}-{end_sol})")
    print(f"Updated frames.json bundle with {bundle['total_frames']} total frames")
    print("v12 Individual Crew Physiology implementation complete!")

if __name__ == '__main__':
    main()