#!/usr/bin/env python3
"""
Generate v10 System Dependency Graph frames (Sol 978-1007)
Based on ISS ECLSS failure analysis and Apollo 13 cascade patterns
"""

import json
import math
import random
from datetime import datetime, timedelta

# Mars orbital mechanics for realistic seasons/weather
def mars_solar_longitude(sol):
    """Calculate Mars solar longitude (Ls) for seasonal effects"""
    mars_year_sols = 669
    sol_in_year = sol % mars_year_sols
    # Ls = 0° at northern spring equinox
    ls = (sol_in_year / mars_year_sols) * 360
    return ls % 360

def mars_temperature(sol, ls, dust_tau=0.2):
    """Mars surface temperature based on season and dust loading"""
    # Base temperature variation with season (simplified)
    seasonal_temp = 220 + 30 * math.cos(math.radians(ls - 90))  # Peak in southern summer
    
    # Daily variation (simplified - real Mars has ~100K swing)
    daily_variation = 15 * math.sin(2 * math.pi * (sol % 1))
    
    # Dust storm effect (reduces temperature swings)
    dust_damping = 1.0 - (dust_tau * 0.3)
    
    temp_k = seasonal_temp + daily_variation * dust_damping
    return max(150, min(300, temp_k))  # Realistic Mars bounds

def mars_pressure(sol, ls):
    """Mars atmospheric pressure with seasonal CO2 cycle"""
    # Base pressure at reference elevation
    base_pressure = 610  # Pa (about 1% of Earth)
    
    # Seasonal variation due to CO2 sublimation at polar caps
    # Pressure is highest during northern spring/summer
    seasonal_factor = 1.0 + 0.25 * math.cos(math.radians(ls - 90))
    
    return base_pressure * seasonal_factor

def mars_solar_irradiance(sol, dust_storm=False):
    """Mars solar irradiance with seasonal and dust variations"""
    # Mars orbital eccentricity causes 40% variation in solar flux
    mars_year_sols = 669
    sol_in_year = sol % mars_year_sols
    
    # Perihelion is around Ls=250° (southern summer)
    orbital_angle = (sol_in_year / mars_year_sols) * 2 * math.pi
    orbital_factor = 1.0 + 0.2 * math.cos(orbital_angle - math.radians(250))
    
    base_irradiance = 590 * orbital_factor  # W/m² (43% of Earth's)
    
    if dust_storm:
        return base_irradiance * 0.15  # Dust storms block 85% of sunlight
    else:
        return base_irradiance * random.uniform(0.85, 1.0)  # Daily dust variation

def generate_dependency_hazards(sol, random_seed):
    """Generate system dependency hazards for this sol"""
    random.seed(random_seed + sol)
    hazards = []
    
    # Base hazard probability increases with sol (equipment ages)
    base_prob = 0.05 + (sol - 978) * 0.001  # 5% base, increasing
    
    # Dependency cascade hazards (the new v10 physics)
    cascade_types = [
        {
            'type': 'system_dependency_cascade',
            'cascade_type': 'water_recycler_failure',
            'description': 'Water recycler failure triggers humidity and irrigation cascade',
            'probability': 0.03,
            'severity_range': (0.2, 0.6),
            'duration_range': (3, 7)
        },
        {
            'type': 'system_dependency_cascade', 
            'cascade_type': 'power_grid_failure',
            'description': 'Power grid overload affects all electrical systems',
            'probability': 0.04,
            'severity_range': (0.3, 0.8),
            'duration_range': (2, 5)
        },
        {
            'type': 'system_dependency_cascade',
            'cascade_type': 'isru_system_failure', 
            'description': 'ISRU chemistry failure forces emergency backup systems',
            'probability': 0.05,
            'severity_range': (0.4, 0.7),
            'duration_range': (4, 8)
        },
        {
            'type': 'system_dependency_cascade',
            'cascade_type': 'thermal_control_failure',
            'description': 'Thermal control failure affects all temperature-sensitive systems',
            'probability': 0.03,
            'severity_range': (0.2, 0.5),
            'duration_range': (5, 10)
        },
        {
            'type': 'system_dependency_cascade',
            'cascade_type': 'oxygen_system_failure',
            'description': 'Apollo 13 scenario: oxygen failure cascades through power and thermal',
            'probability': 0.02,  # Rare but catastrophic
            'severity_range': (0.6, 0.9),
            'duration_range': (7, 14)
        }
    ]
    
    for cascade_def in cascade_types:
        if random.random() < cascade_def['probability']:
            severity = random.uniform(*cascade_def['severity_range'])
            duration = random.randint(*cascade_def['duration_range'])
            
            hazards.append({
                'type': cascade_def['type'],
                'cascade_type': cascade_def['cascade_type'],
                'severity': severity,
                'duration_sols': duration,
                'description': cascade_def['description'],
                'data_source': 'ISS ECLSS FMEA database, Apollo 13 failure timeline'
            })
    
    # Micro-failure accumulation (background system stress)
    if random.random() < 0.15:
        hazards.append({
            'type': 'micro_failure_accumulation',
            'stress_factor': random.uniform(0.05, 0.2),
            'description': 'Small system failures accumulate toward major cascade',
            'data_source': 'Apollo 13 precursor events analysis'
        })
    
    return hazards

def generate_dependency_events(sol, random_seed):
    """Generate events related to system dependencies"""
    random.seed(random_seed + sol + 1000)
    events = []
    
    # Maintenance coordination events
    if random.random() < 0.08:
        events.append({
            'type': 'system_maintenance_coordination',
            'description': 'Multiple systems require simultaneous maintenance - crew scheduling conflict',
            'crew_hours_required': random.randint(8, 20),
            'systems_affected': random.choice([
                ['isru', 'thermal'],
                ['water_recycler', 'power_grid'], 
                ['greenhouse', 'life_support'],
                ['thermal', 'power_grid', 'isru']
            ])
        })
    
    # System redundancy loss
    if random.random() < 0.06:
        events.append({
            'type': 'redundancy_loss',
            'description': 'Backup system offline - primary system now single point of failure',
            'system': random.choice(['water_recycler', 'power_grid', 'isru', 'thermal_control']),
            'failure_multiplier': 1.5  # Increased failure risk
        })
    
    return events

def generate_dependency_challenges(sol, random_seed):
    """Generate challenges that test system dependency understanding"""
    random.seed(random_seed + sol + 2000)
    challenges = []
    
    challenge_types = [
        {
            'type': 'dependency_diagnosis',
            'description': 'Identify root cause of cascading system failures',
            'success_criteria': 'Governor must isolate failing system within 2 sols',
            'penalty_per_sol': 15  # kWh power penalty for delayed diagnosis
        },
        {
            'type': 'resource_prioritization', 
            'description': 'Multiple systems failing - choose repair priority order',
            'systems_failing': random.choice([
                ['water_recycler', 'greenhouse'],
                ['power_grid', 'thermal'],
                ['isru', 'life_support']
            ]),
            'optimal_order': 'power_grid > life_support > isru > water_recycler > thermal > greenhouse'
        },
        {
            'type': 'apollo_13_scenario',
            'description': 'Oxygen tank failure - execute emergency procedures',
            'time_limit_sols': 3,
            'required_actions': ['power_conservation', 'thermal_management', 'co2_scrubbing'],
            'failure_penalty': 'crew_hp_loss'
        }
    ]
    
    if random.random() < 0.12:
        challenge = random.choice(challenge_types)
        challenges.append(challenge)
    
    return challenges

def generate_v10_frame(sol):
    """Generate a complete v10 frame with dependency physics"""
    # Deterministic random seed based on sol for reproducible frames
    frame_seed = sol * 7919 + 42
    random.seed(frame_seed)
    
    # Mars environmental conditions
    ls = mars_solar_longitude(sol)
    temp_k = mars_temperature(sol, ls)
    pressure_pa = mars_pressure(sol, ls)
    dust_storm = random.random() < 0.02  # 2% chance of dust storm
    irradiance = mars_solar_irradiance(sol, dust_storm)
    
    # Season name
    if 0 <= ls < 90:
        season = "Northern Spring"
    elif 90 <= ls < 180:
        season = "Northern Summer" 
    elif 180 <= ls < 270:
        season = "Northern Autumn"
    else:
        season = "Northern Winter"
    
    # Frame structure
    frame = {
        'sol': sol,
        'version': 10,
        'name': 'System Dependency Graph',
        'environment': {
            'temperature_k': round(temp_k, 1),
            'temperature_c': round(temp_k - 273.15, 1),
            'pressure_pa': round(pressure_pa, 1),
            'solar_irradiance': round(irradiance, 1),
            'dust_storm': dust_storm,
            'solar_longitude': round(ls, 1),
            'season': season,
            'wind_speed_ms': random.uniform(2, 15)
        },
        'hazards': generate_dependency_hazards(sol, frame_seed),
        'events': generate_dependency_events(sol, frame_seed),
        'challenges': generate_dependency_challenges(sol, frame_seed),
        'system_dependencies': {
            'description': 'v10 implements real system interdependencies based on ISS ECLSS',
            'dependency_graph': {
                'water_recycler': ['humidity_control', 'greenhouse_irrigation'],
                'humidity_control': ['greenhouse_transpiration', 'crew_comfort'], 
                'greenhouse': ['o2_production_biological', 'food_production'],
                'power_grid': ['all_systems'],
                'isru': ['o2_production_chemical', 'h2o_production'],
                'thermal': ['crew_life_support', 'equipment_efficiency']
            },
            'data_sources': [
                'ISS Environmental Control and Life Support System (ECLSS)',
                'NASA FMEA database for space systems',
                'Apollo 13 failure cascade timeline',
                'ISS maintenance logs and failure reports'
            ]
        },
        'physics_constants': {
            'cascade_propagation_delay': '1-3 sols (realistic system response time)',
            'micro_failure_threshold': '1.0 accumulated stress units',
            'system_interdependency': 'Binary dependency graph with severity multipliers',
            'repair_complexity': 'Scales with number of affected systems'
        }
    }
    
    return frame

def main():
    """Generate all v10 frames (Sol 978-1007)"""
    print("Generating v10 System Dependency Graph frames...")
    print("Data sources: ISS ECLSS, Apollo 13 analysis, NASA FMEA database")
    print()
    
    frames_generated = 0
    
    # Generate Sol 978-1007 (30 frames)
    for sol in range(978, 1008):
        frame = generate_v10_frame(sol)
        
        # Save individual frame file
        frame_filename = f"data/frames/sol-{sol:04d}.json"
        with open(frame_filename, 'w') as f:
            json.dump(frame, f, indent=2)
        
        frames_generated += 1
        
        # Progress indicator  
        if frames_generated % 5 == 0:
            print(f"Generated {frames_generated}/30 frames (Sol {sol})")
    
    # Update latest.json
    latest = {
        'last_sol': 1007,
        'total_frames': 1007, 
        'latest_version': 'v10'
    }
    
    with open('data/frames/latest.json', 'w') as f:
        json.dump(latest, f, indent=2)
    
    print(f"\n✓ Generated {frames_generated} v10 frames successfully")
    print("✓ Updated latest.json")
    print("\nv10 System Dependency Graph frames ready for gauntlet testing!")
    
    # Display sample frame
    print(f"\nSample frame (Sol 978):")
    sample = generate_v10_frame(978)
    print(json.dumps(sample, indent=2)[:800] + "...")

if __name__ == '__main__':
    main()