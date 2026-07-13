"""Mars Barn Opus — Configuration

Every constant in one place. Zero magic numbers elsewhere.
All values sourced from NASA/ESA Mars data unless noted.
"""
from __future__ import annotations


# =============================================================================
# MARS PHYSICAL CONSTANTS
# =============================================================================

# Atmosphere
MARS_SURFACE_PRESSURE_PA = 610.0          # Mean surface pressure (Pa)
MARS_SCALE_HEIGHT_KM = 11.1              # Atmospheric scale height
MARS_CO2_FRACTION = 0.953                 # CO2 volume fraction
MARS_SURFACE_TEMP_K = 210.0              # Mean surface temperature (K)
MARS_TEMP_LAPSE_RATE_K_PER_KM = 1.5      # Temperature lapse rate
MARS_MIN_TEMP_K = 130.0                   # Floor (polar night)
MARS_MAX_TEMP_K = 293.0                   # Ceiling (equatorial noon summer)
MARS_DIURNAL_SWING_K = 40.0              # Day-night temperature amplitude
MARS_LATITUDE_TEMP_GRADIENT_K = 40.0     # Equator-to-pole temp difference

# Terrain
MARS_MIN_ELEVATION_M = -8200.0           # Hellas Planitia
MARS_MAX_ELEVATION_M = 21229.0           # Olympus Mons
MARS_MEAN_ELEVATION_M = 0.0              # Areoid datum

# Solar
MARS_SOLAR_CONSTANT_W_M2 = 589.0         # Mean solar irradiance at Mars
MARS_SOLAR_MIN_W_M2 = 492.0              # Aphelion
MARS_SOLAR_MAX_W_M2 = 715.0              # Perihelion
MARS_AXIAL_TILT_DEG = 25.19              # Obliquity
MARS_SOL_HOURS = 24.66                    # Hours per sol
MARS_YEAR_SOLS = 668.6                    # Sols per Martian year

# Radiation
MARS_SURFACE_RADIATION_MSV_PER_SOL = 0.67  # GCR dose rate (MSL/RAD)
MARS_SOLAR_FLARE_DOSE_MSV = 50.0           # Typical SEP event

# Gravity
MARS_GRAVITY_M_S2 = 3.721


# =============================================================================
# COLONY PARAMETERS
# =============================================================================

# Crew
DEFAULT_CREW_SIZE = 4
DEFAULT_RESERVE_SOLS = 30

# Resource consumption (per crew member, per sol)
O2_KG_PER_PERSON_PER_SOL = 0.84
H2O_L_PER_PERSON_PER_SOL = 2.5
FOOD_KCAL_PER_PERSON_PER_SOL = 2500.0
POWER_BASELINE_KWH_PER_SOL = 30.0

# SOURCE: NASA reports 93-94% historical ISS water recovery and a 98%
# demonstration. DESIGN: derate recovery to 90% for a dusty, maintenance-
# constrained Mars habitat; NASA does not prescribe this simulation value.
# https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/
HABITAT_WATER_RECOVERY_FRACTION = 0.90

# Production rates (at full efficiency)
ISRU_O2_KG_PER_SOL = 5.0                  # MOXIE-class, per unit
ISRU_H2O_L_PER_SOL = 12.0                 # Regolith extraction
GREENHOUSE_KCAL_PER_SOL = 15000.0          # Pressurized growing area
ISRU_POWER_KWH_PER_SOL = 60.0              # MOXIE + regolith extraction process load
GREENHOUSE_POWER_KWH_PER_SOL = 30.0        # Lighting, pumps, and climate control
GREENHOUSE_H2O_L_PER_SOL = 5.0             # Recirculating crop evapotranspiration makeup
SOLAR_PANEL_AREA_M2 = 200.0               # Default panel area
SOLAR_PANEL_EFFICIENCY = 0.22             # Multi-junction cells

# SOURCE: NASA's Mars surface-array study calls for 5-10 kW survival
# contingency power, storage, and worst-case sizing for storms lasting weeks
# to months. DESIGN: this simplified model stores 30 sols of its configured
# 30 kWh/sol survival baseline; this is not a NASA-mandated capacity.
# https://ntrs.nasa.gov/api/citations/20170006908/downloads/20170006908.txt
POWER_CONTINGENCY_SOLS = DEFAULT_RESERVE_SOLS
POWER_STORAGE_CAPACITY_KWH = (
    POWER_BASELINE_KWH_PER_SOL * POWER_CONTINGENCY_SOLS
)
INITIAL_POWER_RESERVE_KWH = POWER_STORAGE_CAPACITY_KWH

# Habitat
HABITAT_SURFACE_AREA_M2 = 200.0
HABITAT_THERMAL_MASS_KG = 2000.0
HABITAT_INSULATION_R_VALUE = 5.0          # m²K/W
HABITAT_WINDOW_EFFICIENCY = 0.10
HABITAT_TARGET_TEMP_K = 293.15            # 20°C
HABITAT_EMISSIVITY = 0.8

# Failure cascade
POWER_CRITICAL_THRESHOLD_KWH = 50.0
TEMP_CRITICAL_LOW_K = 263.15              # -10°C, pipes freeze
CASCADE_STEP_SOLS = 1                     # Sols between cascade stages

# Resource factors — anti-correlated for trade incentive
RESOURCE_FACTOR_RANGES = {
    "water_rich":  {"h2o": 1.5, "food": 0.7, "o2": 1.3, "power": 0.9},
    "food_rich":   {"h2o": 0.8, "food": 1.6, "o2": 0.9, "power": 1.1},
    "power_rich":  {"h2o": 0.9, "food": 0.9, "o2": 1.0, "power": 1.5},
    "balanced":    {"h2o": 1.0, "food": 1.0, "o2": 1.0, "power": 1.0},
    "harsh":       {"h2o": 0.6, "food": 0.6, "o2": 0.8, "power": 0.7},
}


# =============================================================================
# EVENT PARAMETERS
# =============================================================================

# SOURCE: local storms generally last a few days, global storms can last
# weeks to months, and Mars dust activity is seasonal.
# DESIGN: this public simplified simulator uses five mixed local/regional
# onsets and eighteen short dust-devil encounters per Mars year. The storm
# count was transparently calibrated after annualization against the
# repository's 1,000-case design cohort; NASA does not prescribe it. Both
# hazards remain annualized across every sol to avoid a fixed-start safe
# window, and physical orbital seasonality remains in mars.py.
# https://ntrs.nasa.gov/api/citations/20190027303/downloads/20190027303.txt
DUST_STORM_ANNUAL_RATE = 5.0
DUST_DEVIL_ANNUAL_RATE = 18.0

# SOURCE: NASA ECLSS guidance emphasizes reliability, maintainability,
# redundancy, and fault tolerance rather than these event frequencies.
# DESIGN: annualized rates below keep failures stochastic without the former
# near-continuous occupancy; NASA does not mandate these gameplay rates.
# https://ntrs.nasa.gov/api/citations/20040012725/downloads/20040012725.txt
SOLAR_FLARE_ANNUAL_RATE = 2.0
METEORITE_ANNUAL_RATE = 0.02
EQUIPMENT_FAILURE_ANNUAL_RATE = 3.0
RADIATION_SPIKE_ANNUAL_RATE = 3.0

EVENT_PROBABILITIES = {
    "dust_storm": DUST_STORM_ANNUAL_RATE / MARS_YEAR_SOLS,
    "dust_devil": DUST_DEVIL_ANNUAL_RATE / MARS_YEAR_SOLS,
    "solar_flare": SOLAR_FLARE_ANNUAL_RATE / MARS_YEAR_SOLS,
    "meteorite": METEORITE_ANNUAL_RATE / MARS_YEAR_SOLS,
    "equipment_failure": EQUIPMENT_FAILURE_ANNUAL_RATE / MARS_YEAR_SOLS,
    # DESIGN: disabled because mars.py already models orbital seasonality.
    # https://www.giss.nasa.gov/tools/mars24/help/notes.html
    "seasonal_shift": 0.0,
    "radiation_spike": RADIATION_SPIKE_ANNUAL_RATE / MARS_YEAR_SOLS,
}

EVENT_DURATION_RANGE = {
    # SOURCE/DESIGN: bracket NASA's "couple days" local storms and
    # continent-scale storms lasting weeks without treating every event as a
    # months-long global storm.
    # https://ntrs.nasa.gov/api/citations/20190027303/downloads/20190027303.txt
    "dust_storm":       (4, 21),
    "dust_devil":       (1, 1),
    "solar_flare":      (1, 3),
    "meteorite":        (1, 1),
    "equipment_failure": (3, 15),
    "seasonal_shift":   (1, 1),
    "radiation_spike":  (1, 3),
}

# SOURCE: global storms can reach optical depth 5 or more. DESIGN: cap this
# simplified event at 4x background opacity and apply attenuation only through
# mars.py's optical-depth calculation.
# https://ntrs.nasa.gov/api/citations/20190027303/downloads/20190027303.txt
DUST_STORM_MAX_DUST_FACTOR = 4.0
DUST_DEVIL_MAX_DUST_FACTOR = 1.3
DUST_STORM_SEVERE_THRESHOLD = 0.7
DUST_STORM_SEVERE_DURATION_MULTIPLIER = 2.0

# SOURCE: NASA notes dust devils can clean panels, while human-rated arrays
# require engineered dust control. DESIGN: cleaning is a small onset-only
# repair and never a dependable power source.
# https://ntrs.nasa.gov/api/citations/20170006908/downloads/20170006908.txt
DUST_DEVIL_CLEANING_SEVERITY_MAX = 0.3
DUST_DEVIL_SOLAR_REPAIR_FRACTION = 0.01

# SOURCE: NASA ECLSS design guidance motivates bounded, onset-only fault
# pulses. DESIGN: these severities are simplified public-sim assumptions, not
# NASA component failure specifications.
# https://ntrs.nasa.gov/api/citations/20040012725/downloads/20040012725.txt
SOLAR_FLARE_COMMS_DAMAGE_FRACTION = 0.10
SOLAR_FLARE_SOLAR_DAMAGE_FRACTION = 0.05
METEORITE_SOLAR_DAMAGE_FRACTION = 0.15
METEORITE_GREENHOUSE_DAMAGE_FRACTION = 0.20
METEORITE_HEATING_DAMAGE_FRACTION = 0.10
METEORITE_O2_LOSS_KG = 5.0
METEORITE_WATER_LOSS_LITERS = 10.0
EQUIPMENT_FAILURE_ISRU_DAMAGE_FRACTION = 0.15
EQUIPMENT_FAILURE_POWER_LOSS_KWH = 20.0
RADIATION_SPIKE_MSV = 2.0
EVENT_SEVERITY_MIN = 0.2
EVENT_SEVERITY_MAX = 1.0

# SOURCE: regenerative life support must expose consumable margins and fault
# tolerance. DESIGN: these are observability bands only, not causal proof or
# NASA mission rules.
# https://ntrs.nasa.gov/api/citations/20040012725/downloads/20040012725.txt
READINESS_RUNWAY_THRESHOLDS_SOLS = (20.0, 10.0, 3.0)
READINESS_SURVIVAL_CURVE_STEP_SOLS = 10

# SOURCE: Mars24 defines a 668.5921-sol Mars year. DESIGN: 100 deterministic
# seeds is this repository's acceptance sample, not a NASA sample-size rule.
# https://www.giss.nasa.gov/tools/mars24/help/notes.html
MISSION_READINESS_DEFAULT_SEED_COUNT = 100

# SOURCE: NASA evidence establishes stochastic Mars dust exposure and
# life-support fault-tolerance needs. DESIGN: these are repository acceptance
# bands supplied for mission-readiness analysis, not NASA safety thresholds.
# https://ntrs.nasa.gov/api/citations/20190027303/downloads/20190027303.txt
READINESS_TARGET_SURVIVAL_RATE = (0.20, 0.70)
READINESS_TARGET_RMST_SOLS = (250.0, 425.0)


# =============================================================================
# GOVERNOR PARAMETERS
# =============================================================================

GOVERNOR_ARCHETYPES = {
    "engineer": {
        "risk_tolerance": 0.3,
        "efficiency_focus": 0.9,
        "social_trust": 0.6,
        "innovation_drive": 0.4,
        "crisis_aggression": 0.5,
        "trade_willingness": 0.7,
        "sabotage_threshold": 0.05,
        "description": "Optimizes systems. Trusts data over intuition.",
    },
    "philosopher": {
        "risk_tolerance": 0.5,
        "efficiency_focus": 0.4,
        "social_trust": 0.8,
        "innovation_drive": 0.7,
        "crisis_aggression": 0.2,
        "trade_willingness": 0.9,
        "sabotage_threshold": 0.01,
        "description": "Seeks harmony. Trades freely, rarely sabotages.",
    },
    "contrarian": {
        "risk_tolerance": 0.8,
        "efficiency_focus": 0.5,
        "social_trust": 0.2,
        "innovation_drive": 0.9,
        "crisis_aggression": 0.8,
        "trade_willingness": 0.3,
        "sabotage_threshold": 0.15,
        "description": "Bets against consensus. High risk, high variance.",
    },
    "survivalist": {
        "risk_tolerance": 0.1,
        "efficiency_focus": 0.7,
        "social_trust": 0.3,
        "innovation_drive": 0.2,
        "crisis_aggression": 0.7,
        "trade_willingness": 0.4,
        "sabotage_threshold": 0.10,
        "description": "Hoards reserves. Trades reluctantly. Hard to kill.",
    },
    "diplomat": {
        "risk_tolerance": 0.4,
        "efficiency_focus": 0.5,
        "social_trust": 0.9,
        "innovation_drive": 0.5,
        "crisis_aggression": 0.1,
        "trade_willingness": 0.95,
        "sabotage_threshold": 0.02,
        "description": "Lives and dies by alliances. Master trader.",
    },
    "wildcard": {
        "risk_tolerance": 0.9,
        "efficiency_focus": 0.3,
        "social_trust": 0.5,
        "innovation_drive": 0.95,
        "crisis_aggression": 0.6,
        "trade_willingness": 0.5,
        "sabotage_threshold": 0.20,
        "description": "Unpredictable. Sometimes brilliant, sometimes dead.",
    },
    "commander": {
        "risk_tolerance": 0.4,
        "efficiency_focus": 0.8,
        "social_trust": 0.5,
        "innovation_drive": 0.3,
        "crisis_aggression": 0.9,
        "trade_willingness": 0.6,
        "sabotage_threshold": 0.08,
        "description": "Military discipline. Escalates fast in crisis.",
    },
    "scientist": {
        "risk_tolerance": 0.6,
        "efficiency_focus": 0.6,
        "social_trust": 0.7,
        "innovation_drive": 0.8,
        "crisis_aggression": 0.3,
        "trade_willingness": 0.8,
        "sabotage_threshold": 0.03,
        "description": "Experiments. Adapts strategy based on evidence.",
    },
    "merchant": {
        "risk_tolerance": 0.5,
        "efficiency_focus": 0.7,
        "social_trust": 0.4,
        "innovation_drive": 0.4,
        "crisis_aggression": 0.4,
        "trade_willingness": 0.99,
        "sabotage_threshold": 0.12,
        "description": "Everything has a price. Trades aggressively.",
    },
    "hermit": {
        "risk_tolerance": 0.2,
        "efficiency_focus": 0.8,
        "social_trust": 0.1,
        "innovation_drive": 0.3,
        "crisis_aggression": 0.3,
        "trade_willingness": 0.1,
        "sabotage_threshold": 0.25,
        "description": "Self-sufficient. Refuses help. Dangerous when cornered.",
    },
}


# =============================================================================
# TRADE & DIPLOMACY
# =============================================================================

TRADE_TRANSPORT_LOSS_PER_100KM = 0.10     # 10% loss per 100km distance
SUPPLY_DROP_INTERVAL_SOLS = 50
SUPPLY_DROP_RESOURCES = {
    "o2_kg": 50.0,
    "h2o_liters": 100.0,
    "food_kcal": 50000.0,
    "power_kwh": 200.0,
}
REPUTATION_COOPERATE_BONUS = 0.05
REPUTATION_DEFECT_PENALTY = 0.10
REPUTATION_SABOTAGE_PENALTY = 0.25
SABOTAGE_DETECTION_CHANCE = 0.40
SABOTAGE_DAMAGE_FRACTION = 0.20           # Fraction of target system destroyed


# =============================================================================
# SIMULATION
# =============================================================================

DEFAULT_SOLS = 500
DEFAULT_SEED = 42
DEFAULT_COLONIES = 1
BENCHMARK_SEEDS = [42, 137, 256, 1337, 9999]
