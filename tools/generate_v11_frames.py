#!/usr/bin/env python3
"""
Generate v11 Earth-Mars Transfer Window frames (sols 1008-1057)

Real orbital mechanics:
- Synodic period: 779.9 days (26 months) between launch windows
- Transit time: 180-270 days (6-9 months) 
- Cargo capacity: ~100 metric tons to Mars surface (SpaceX Starship class)
- Landing accuracy: ±10km from target
- EDL failure rate: ~50% historically for heavy payloads

Data sources:
- NASA Mars Design Reference Architecture 5.0
- SpaceX Starship specifications  
- NASA Mars mission orbital mechanics studies
- Historical Mars landing success rates

v11 Supply Windows closes the gap: Self-contained → launch windows + resupply
"""

import json
import random
import math
from typing import Dict, List, Any

# Physical constants - NASA specifications
EARTH_MARS_SYNODIC_PERIOD = 779.9  # days between launch windows
HOHMANN_TRANSFER_TIME_MIN = 180    # days minimum transit time  
HOHMANN_TRANSFER_TIME_MAX = 270    # days maximum transit time
CARGO_CAPACITY_TONS = 100          # metric tons to Mars surface (Starship)
LANDING_ACCURACY_KM = 10           # ±10km landing accuracy
EDL_SUCCESS_RATE = 0.50           # Historical Mars EDL success rate for heavy payloads

def calculate_mars_environment(sol: int) -> Dict[str, Any]:
    """Calculate Mars environmental conditions for given sol."""
    # Mars year = 669 sols, seasonal variation
    mars_year_progress = (sol % 669) / 669
    seasonal_angle = 2 * math.pi * mars_year_progress
    
    # Mars aphelion/perihelion affects solar irradiance (eccentricity = 0.0934)
    orbital_distance_factor = 1 + 0.09 * math.cos(seasonal_angle - math.pi)
    base_solar = 589  # W/m² at mean distance
    solar_irradiance = base_solar / (orbital_distance_factor ** 2)
    
    # Seasonal temperature variation: -90°C to +5°C range
    base_temp = 183 + 45 * (math.cos(seasonal_angle - math.pi/2) * 0.5 + 0.5)
    
    # Daily temperature variation (simplified)
    daily_variation = 15 * math.sin(2 * math.pi * (sol % 1) + random.uniform(0, 2*math.pi))
    temperature_k = base_temp + daily_variation
    
    # Pressure varies seasonally due to CO₂ sublimation at poles
    pressure_variation = 100 * math.sin(seasonal_angle)  # ±100 Pa variation
    pressure_pa = 605 + pressure_variation
    
    # Wind speed (dust devil and weather patterns)
    wind_base = 8 + 12 * (0.5 + 0.5 * math.sin(seasonal_angle + random.uniform(0, 2*math.pi)))
    wind_speed_ms = wind_base + random.uniform(-3, 8)
    
    return {
        "temperature_k": round(temperature_k, 1),
        "temperature_c": round(temperature_k - 273.15, 1),
        "pressure_pa": round(pressure_pa, 1),
        "solar_irradiance": round(solar_irradiance, 1),
        "dust_storm": False,
        "solar_longitude": round((mars_year_progress * 360) % 360, 1),
        "season": get_mars_season(mars_year_progress * 360),
        "wind_speed_ms": round(wind_speed_ms, 1)
    }

def get_mars_season(solar_longitude: float) -> str:
    """Get Mars season from solar longitude (Ls)."""
    if 0 <= solar_longitude < 90:
        return "Northern Spring"
    elif 90 <= solar_longitude < 180:
        return "Northern Summer" 
    elif 180 <= solar_longitude < 270:
        return "Northern Autumn"
    else:
        return "Northern Winter"

def get_supply_window_phase(sol: int) -> str:
    """Determine if sol is in a supply window phase."""
    # Next Earth-Mars window after mission start
    # Assuming mission starts at sol 0 = optimal launch window
    sols_since_last_window = sol % EARTH_MARS_SYNODIC_PERIOD
    
    if sols_since_last_window < 30:
        return "launch_window_open"
    elif sols_since_last_window < 200:  # During transit time
        return "cargo_in_transit"
    elif sols_since_last_window > 700:  # Approaching next window
        return "pre_launch_planning"
    else:
        return "inter_window_period"

def generate_supply_hazards(sol: int, window_phase: str) -> List[Dict[str, Any]]:
    """Generate supply chain hazards based on transfer window phase."""
    hazards = []
    
    # Base probability of supply-related hazards
    base_prob = 0.08
    
    if window_phase == "launch_window_open":
        if random.random() < 0.15:  # 15% chance during launch windows
            hazards.append({
                "type": "supply_window_missed",
                "severity": random.uniform(0.4, 0.8),
                "cargo_shortfall": random.uniform(0.2, 0.5),
                "delay_sols": int(EARTH_MARS_SYNODIC_PERIOD),
                "description": "Colony missed Earth-Mars launch window - next resupply delayed by 26 months",
                "data_source": "NASA Mars Design Reference Architecture orbital mechanics"
            })
    
    elif window_phase == "cargo_in_transit":
        if random.random() < base_prob:
            hazards.append({
                "type": "supply_manifest_shortage", 
                "severity": random.uniform(0.3, 0.6),
                "planning_error": random.uniform(0.2, 0.5),
                "shortage_type": random.choice(["electronics", "medical", "tools", "mixed"]),
                "description": "Colony planned wrong cargo manifest - supply mismatch for current needs",
                "data_source": "NASA Mars mission logistics planning requirements"
            })
    
    elif window_phase == "inter_window_period":
        if random.random() < base_prob * 1.5:  # Higher risk during inter-window periods
            hazards.append({
                "type": "isru_dependency_crisis",
                "severity": random.uniform(0.4, 0.7), 
                "dependency_ratio": random.uniform(0.5, 0.9),
                "isru_capacity_gap": random.uniform(0.3, 0.7),
                "description": "Colony ISRU systems cannot meet needs - too dependent on Earth supplies",
                "data_source": "NASA ISRU technology readiness assessment"
            })
        
        # Cargo arrival events (from previous window)
        if random.random() < 0.12:
            if random.random() < EDL_SUCCESS_RATE:
                # Successful landing but needs retrieval
                hazards.append({
                    "type": "cargo_retrieval_mission",
                    "severity": random.uniform(0.2, 0.5),
                    "landing_distance": random.uniform(2, 18),  # km from colony
                    "description": "Cargo landed off-target - rover retrieval mission required",
                    "data_source": "NASA Mars EDL accuracy specifications (±10km)"
                })
            else:
                # EDL failure
                hazards.append({
                    "type": "cargo_delivery_failure", 
                    "severity": random.uniform(0.6, 0.9),
                    "payload_loss_pct": random.uniform(0.4, 0.8),
                    "recovery_power_cost": random.randint(60, 120),
                    "description": "Mars EDL failure - cargo shipment lost during atmospheric entry",
                    "data_source": "Historical Mars mission EDL success rates (~50% for heavy payloads)"
                })
    
    return hazards

def generate_supply_events(sol: int, window_phase: str) -> List[Dict[str, Any]]:
    """Generate supply chain events."""
    events = []
    
    if window_phase == "launch_window_open" and random.random() < 0.20:
        events.append({
            "type": "earth_launch_window",
            "description": "Earth-Mars launch window opens - cargo shipment opportunity",
            "window_duration_sols": 30,
            "cargo_capacity_tons": CARGO_CAPACITY_TONS,
            "transit_time_sols": random.randint(HOHMANN_TRANSFER_TIME_MIN, HOHMANN_TRANSFER_TIME_MAX)
        })
    
    elif window_phase == "pre_launch_planning" and random.random() < 0.15:
        events.append({
            "type": "cargo_manifest_deadline",
            "description": "Deadline for next cargo manifest submission to Earth", 
            "sols_until_launch": int(EARTH_MARS_SYNODIC_PERIOD - (sol % EARTH_MARS_SYNODIC_PERIOD)),
            "planning_requirements": "Must plan 2+ years ahead for supply needs"
        })
    
    elif window_phase == "cargo_in_transit" and random.random() < 0.10:
        events.append({
            "type": "cargo_trajectory_update",
            "description": "Trajectory correction for incoming cargo shipment",
            "estimated_arrival_sol": sol + random.randint(30, 120),
            "landing_ellipse_km": random.uniform(5, 15)
        })
    
    return events

def generate_supply_challenges(sol: int, window_phase: str) -> List[Dict[str, Any]]:
    """Generate supply chain challenges."""
    challenges = []
    
    if random.random() < 0.06:  # 6% chance per sol
        challenge_types = [
            {
                "type": "isru_scaling_optimization",
                "description": "Optimize ISRU production to reduce Earth dependency",
                "target_self_sufficiency": random.uniform(0.6, 0.9),
                "efficiency_bonus": 0.15
            },
            {
                "type": "cargo_manifest_optimization", 
                "description": "Plan optimal cargo manifest for next launch window",
                "planning_horizon_sols": int(EARTH_MARS_SYNODIC_PERIOD * 2),
                "supply_efficiency_bonus": 0.20
            },
            {
                "type": "landing_site_preparation",
                "description": "Prepare landing site for incoming cargo delivery", 
                "site_preparation_sols": random.randint(5, 15),
                "landing_accuracy_bonus": 0.3
            },
            {
                "type": "emergency_supply_rationing",
                "description": "Implement emergency rationing due to supply shortage",
                "rationing_severity": random.uniform(0.2, 0.4),
                "duration_sols": random.randint(20, 60)
            }
        ]
        
        challenges.append(random.choice(challenge_types))
    
    return challenges

def generate_frame(sol: int) -> Dict[str, Any]:
    """Generate a single frame for v11 supply windows."""
    window_phase = get_supply_window_phase(sol)
    
    frame = {
        "sol": sol,
        "version": 11,
        "name": "Earth-Mars Transfer Windows",
        "environment": calculate_mars_environment(sol),
        "hazards": generate_supply_hazards(sol, window_phase),
        "events": generate_supply_events(sol, window_phase), 
        "challenges": generate_supply_challenges(sol, window_phase),
        "supply_chain": {
            "description": "v11 implements real Earth-Mars orbital mechanics and cargo logistics",
            "window_phase": window_phase,
            "transfer_window_physics": {
                "synodic_period_days": EARTH_MARS_SYNODIC_PERIOD,
                "transit_time_range_days": f"{HOHMANN_TRANSFER_TIME_MIN}-{HOHMANN_TRANSFER_TIME_MAX}",
                "cargo_capacity_tons": CARGO_CAPACITY_TONS,
                "landing_accuracy_km": f"±{LANDING_ACCURACY_KM}",
                "edl_success_rate": EDL_SUCCESS_RATE
            },
            "data_sources": [
                "NASA Mars Design Reference Architecture 5.0",
                "SpaceX Starship payload specifications",
                "NASA Mars mission orbital mechanics studies", 
                "Historical Mars EDL success/failure rates",
                "Hohmann transfer orbit calculations"
            ]
        },
        "physics_constants": {
            "earth_mars_synodic_period": f"{EARTH_MARS_SYNODIC_PERIOD} days (26 months)",
            "hohmann_transfer_window": "Every 779.9 days when planets align for efficient transfer",
            "cargo_transit_time": "180-270 days depending on trajectory optimization",
            "landing_accuracy": "±10km (requires rover retrieval operations)",
            "supply_dependency": "Colony must plan 2-3 years ahead for Earth supplies"
        }
    }
    
    return frame

def main():
    """Generate v11 frames for sols 1008-1057."""
    print("Generating v11 Earth-Mars Transfer Window frames...")
    print(f"Range: sols 1008-1057 (50 frames)")
    print(f"Physics: Hohmann transfer windows every {EARTH_MARS_SYNODIC_PERIOD} days")
    print(f"Cargo capacity: {CARGO_CAPACITY_TONS} metric tons per Starship")
    print(f"EDL success rate: {EDL_SUCCESS_RATE*100}% (historical average)\n")
    
    frames_generated = 0
    
    for sol in range(1008, 1058):  # sols 1008-1057 (50 frames)
        frame = generate_frame(sol)
        
        # Write individual frame file
        filename = f"data/frames/sol-{sol:04d}.json"
        try:
            with open(filename, 'w') as f:
                json.dump(frame, f, indent=2)
            frames_generated += 1
            
            # Show progress for key frames
            if sol % 10 == 0 or sol == 1008 or sol == 1057:
                window_phase = get_supply_window_phase(sol)
                hazard_count = len(frame['hazards'])
                print(f"Sol {sol}: {window_phase} ({hazard_count} hazards)")
        
        except Exception as e:
            print(f"Error writing sol {sol}: {e}")
    
    print(f"\nGenerated {frames_generated} v11 frames successfully!")
    print("\nKey supply window mechanics:")
    print("- Launch windows every 26 months (779.9 days)")
    print("- Cargo transit time: 6-9 months")
    print("- Landing accuracy: ±10km (retrieval required)")
    print("- EDL failure rate: ~50% for heavy payloads")
    print("- Colony must plan 2+ years ahead for supplies")
    print("- Self-sufficiency vs Earth dependency trade-offs")

if __name__ == "__main__":
    main()