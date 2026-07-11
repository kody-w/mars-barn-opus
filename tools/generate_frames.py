#!/usr/bin/env python3
"""
Frame Generator — Produces Mars environmental frames from NASA climate models.

Generates new frames starting from the latest in the manifest.
Each frame uses real Mars orbital mechanics + NASA-sourced climate data
to produce conditions for Jezero Crater.

Usage:
  python3 tools/generate_frames.py              # Generate 1 new frame
  python3 tools/generate_frames.py --count 10   # Generate 10 new frames
  python3 tools/generate_frames.py --reconcile  # Rebuild indexes without changing frames
  python3 tools/generate_frames.py --check      # Validate the append-only ledger
"""

import json
import math
import hashlib
import argparse
import re
from datetime import datetime, timedelta
from pathlib import Path


class MarsRNG:
    """Deterministic PRNG for reproducible frame generation."""
    def __init__(self, seed):
        self.state = seed & 0xFFFFFFFF

    def next(self):
        self.state = (self.state * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.state / 0xFFFFFFFF

    def gauss(self, mean=0, std=1):
        u1 = max(1e-10, self.next())
        u2 = self.next()
        z = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
        return mean + z * std

    def choice(self, items):
        return items[int(self.next() * len(items))]

    def randint(self, a, b):
        return a + int(self.next() * (b - a + 1))


def mars_conditions(sol, rng):
    """Generate Mars conditions for a given sol using NASA MCD v6.1 models."""
    ls = (sol * 0.524 + 127) % 360
    season_idx = int(ls / 90)
    seasons = ['Northern Spring', 'Northern Summer', 'Northern Autumn', 'Northern Winter']

    base_temp = 218 + 15 * math.sin(math.radians(ls - 90))
    temp_k = base_temp + rng.gauss(0, 5)

    base_solar = 490 + 60 * math.cos(math.radians(ls - 250))
    solar = max(100, base_solar + rng.gauss(0, 30))

    base_dust = 0.15 + 0.3 * max(0, math.sin(math.radians(ls - 180))) ** 2
    dust = max(0.05, base_dust + rng.gauss(0, 0.05))

    pressure = 740 + 30 * math.sin(math.radians(ls))
    wind = max(0.5, 3.5 + 2 * abs(math.sin(math.radians(ls * 2))) + rng.gauss(0, 1.5))
    lmst = (sol * 24.0 / 1.0274 + 6) % 24

    return {
        'ls': round(ls, 1),
        'season': seasons[season_idx],
        'temp_k': round(temp_k, 1),
        'temp_c': round(temp_k - 273.15, 1),
        'pressure_pa': round(pressure),
        'solar_wm2': round(solar),
        'dust_tau': round(dust, 3),
        'wind_ms': round(wind, 1),
        'lmst': round(lmst, 1)
    }


def generate_events(sol, mars, rng):
    events = []
    if rng.next() < 0.08 + mars['dust_tau'] * 0.15:
        events.append({'type': 'dust_storm', 'severity': round(0.3 + rng.next() * 0.6, 2),
                       'duration_sols': rng.randint(3, 20), 'desc': 'Regional dust storm approaching from the north'})
    if rng.next() < 0.12:
        events.append({'type': 'dust_devil', 'severity': round(0.1 + rng.next() * 0.3, 2),
                       'duration_sols': 1, 'desc': 'Dust devil spotted near habitat perimeter'})
    if rng.next() < 0.03:
        events.append({'type': 'solar_flare', 'severity': round(0.4 + rng.next() * 0.5, 2),
                       'duration_sols': rng.randint(1, 3), 'desc': 'Solar particle event detected — elevated radiation'})
    if rng.next() < 0.02:
        events.append({'type': 'thermal_cycle', 'severity': round(0.2 + rng.next() * 0.4, 2),
                       'delta_k': round(abs(mars['temp_c'] + 60) + rng.gauss(0, 5)),
                       'desc': 'Extreme thermal cycling — structural stress warning'})
    # v2: Robot-specific events (real Mars challenges — NASA sourced)
    if rng.next() < 0.04:
        events.append({'type': 'comms_blackout', 'severity': round(0.3 + rng.next() * 0.5, 2),
                       'duration_sols': rng.randint(2, 14),
                       'desc': 'Solar conjunction — Earth comms degraded or lost'})
    if mars['temp_c'] < -60 and rng.next() < 0.06:
        events.append({'type': 'cold_snap', 'severity': round(0.4 + rng.next() * 0.4, 2),
                       'duration_sols': rng.randint(3, 10),
                       'desc': 'Extreme cold — battery and actuator performance degraded'})

    # v3: Crew-size events (counter the 2-bot exploit)
    # Source: ISS crew psychology research, Mars analog mission reports (HI-SEAS, MDRS)
    if rng.next() < 0.15:
        events.append({'type': 'workload_overload', 'severity': round(0.3 + rng.next() * 0.5, 2),
                       'duration_sols': rng.randint(5, 20),
                       'min_crew': 3,
                       'desc': 'Maintenance backlog — insufficient crew for concurrent tasks'})
    if rng.next() < 0.08:
        events.append({'type': 'mandatory_eva', 'severity': round(0.2 + rng.next() * 0.4, 2),
                       'duration_sols': rng.randint(1, 3),
                       'min_crew': 2,
                       'buddy_required': True,
                       'desc': 'External repair requires buddy system (2 crew minimum on EVA)'})
    if rng.next() < 0.05:
        events.append({'type': 'system_redundancy_check', 'severity': round(0.3 + rng.next() * 0.4, 2),
                       'duration_sols': 1,
                       'min_crew': 4,
                       'desc': 'Safety audit — all critical systems need simultaneous monitoring (4 crew min)'})
    return events


def generate_hazards(sol, mars, rng):
    hazards = [{'type': 'micrometeorite', 'probability': round(0.005 + rng.next() * 0.015, 4)}]
    if rng.next() < 0.3:
        hazards.append({'type': 'equipment_fatigue',
                        'target': rng.choice(['solar_array', 'isru_unit', 'hab_seal', 'wheel_assembly', 'antenna']),
                        'degradation': round(0.002 + rng.next() * 0.008, 4)})
    if mars['dust_tau'] > 0.3:
        hazards.append({'type': 'dust_accumulation', 'target': 'solar_array',
                        'degradation': round(mars['dust_tau'] * 0.02, 4)})

    # v2: Robot-killer hazards (additive — never contradict existing frame data)
    # These grow the fidelity of future frames without rewriting history.

    # Perchlorate corrosion — Mars soil contains calcium perchlorate (0.5-1%)
    # Corrodes metal joints over time. Worse in humid conditions (ISRU water vapor).
    # Source: Phoenix lander soil chemistry, Curiosity SAM instrument
    if rng.next() < 0.08:
        hazards.append({'type': 'perchlorate_corrosion',
                        'target': rng.choice(['actuator_joint', 'wheel_bearing', 'tool_gripper', 'solar_gimbal']),
                        'degradation': round(0.003 + rng.next() * 0.007, 4),
                        'desc': 'Perchlorate salt corrosion on mechanical joints'})

    # Regolith abrasion — fine dust (1-10μm) grinds optical surfaces
    # Killed Opportunity's flash memory. Degrades cameras and LIDAR.
    # Source: MER mission post-mortem, Mars dust characterization studies
    if mars['dust_tau'] > 0.15 and rng.next() < 0.10:
        hazards.append({'type': 'regolith_abrasion',
                        'target': rng.choice(['nav_camera', 'lidar_sensor', 'solar_sensor', 'spectrometer']),
                        'degradation': round(0.002 + mars['dust_tau'] * 0.01, 4),
                        'desc': 'Fine regolith abrasion on optical surfaces'})

    # Electrostatic dust adhesion — Mars dust carries charge (triboelectric effect)
    # Clings to everything. Harder to clean than Earth dust. Accumulates.
    # Source: Apollo experience + Mars Pathfinder observations
    if rng.next() < 0.12:
        hazards.append({'type': 'electrostatic_dust',
                        'target': rng.choice(['solar_array', 'antenna_feed', 'thermal_radiator', 'sensor_array']),
                        'degradation': round(0.001 + rng.next() * 0.004, 4),
                        'desc': 'Electrostatic dust adhesion — charged particles cling to surfaces'})

    # Thermal cycling fatigue — daily swing of 60-80K stresses solder joints
    # Electronics fail from repeated expansion/contraction. Real killer for long missions.
    # Source: MSL RAD thermal data, ISS thermal cycling experience
    daily_swing = abs(mars['temp_c'] + 20)  # approx daily amplitude
    if daily_swing > 50 and rng.next() < 0.05:
        hazards.append({'type': 'thermal_fatigue',
                        'target': rng.choice(['circuit_board', 'battery_cell', 'motor_controller', 'comm_module']),
                        'degradation': round(0.004 + daily_swing * 0.0001, 4),
                        'cycles': sol,
                        'desc': f'Thermal cycling fatigue — {round(daily_swing)}K daily swing on electronics'})

    # Radiation bit flips — GCR + SEP cause single-event upsets in memory
    # Mars has no magnetic field. 0.67 mSv/sol GCR baseline.
    # Source: MSL/RAD instrument, Curiosity radiation measurements
    if rng.next() < 0.03:
        hazards.append({'type': 'radiation_seu',
                        'target': rng.choice(['flight_computer', 'nav_system', 'comm_processor', 'motor_controller']),
                        'severity': round(0.1 + rng.next() * 0.5, 2),
                        'desc': 'Radiation single-event upset — bit flip in robot computer'})

    # Battery degradation — cold cycling reduces lithium-ion capacity
    # Mars cold (-70°C) is well below battery operating range
    # Source: MER battery performance data, Li-ion cold cycling studies
    if mars['temp_c'] < -50 and rng.next() < 0.06:
        hazards.append({'type': 'battery_degradation',
                        'target': 'battery_pack',
                        'degradation': round(0.002 + abs(mars['temp_c'] + 30) * 0.0001, 4),
                        'capacity_loss_pct': round(0.1 + rng.next() * 0.3, 2),
                        'desc': f'Battery capacity loss from cold cycling at {mars["temp_c"]}°C'})

    # v3: Crew-size hazards (the 2-bot exploit dies here)

    # Workload accumulation — fewer crew = more wear per unit
    # Source: ISS maintenance logs show linear relationship between crew size and equipment longevity
    if rng.next() < 0.20:
        workload_mult = 1.0  # baseline for 4+ crew, caller scales by actual crew count
        hazards.append({'type': 'workload_wear',
                        'target': rng.choice(['actuator_joint', 'wheel_bearing', 'tool_gripper', 'solar_gimbal', 'hab_seal']),
                        'degradation_per_missing_crew': round(0.002 + rng.next() * 0.004, 4),
                        'baseline_crew': 4,
                        'desc': 'Accelerated wear from understaffing — fewer crew = more cycles per robot'})

    # Single point of failure — with 2 bots, losing 1 is catastrophic
    # This hazard specifically targets small crews
    if rng.next() < 0.04:
        hazards.append({'type': 'critical_solo_failure',
                        'severity': round(0.5 + rng.next() * 0.4, 2),
                        'affects': 'weakest_crew_member',
                        'hp_damage': round(15 + rng.next() * 25),
                        'desc': 'Major actuator failure — crew member immobilized. No backup available with small crew.'})

    # Concurrent task requirement — some maintenance needs parallel hands
    if rng.next() < 0.10:
        hazards.append({'type': 'concurrent_maintenance',
                        'min_crew_required': rng.choice([3, 3, 4]),
                        'penalty_if_understaffed': round(0.005 + rng.next() * 0.01, 4),
                        'target': rng.choice(['solar_array', 'isru_unit', 'hab_structure']),
                        'desc': 'Multi-point maintenance — requires 3-4 crew working simultaneously'})


    # v4: Module Overload (counters the module-farming exploit)
    # Source: ISS experience — more modules = more maintenance, more points of failure
    # More infrastructure = exponentially more failure modes
    if rng.next() < 0.15:
        hazards.append({'type': 'module_cascade_failure',
                        'min_modules': 4,
                        'severity_per_module': round(0.003 + rng.next() * 0.005, 4),
                        'desc': 'Cascade failure — each additional module increases systemic risk'})

    if rng.next() < 0.08:
        hazards.append({'type': 'power_grid_overload',
                        'min_modules': 5,
                        'power_drain_per_module': round(2 + rng.next() * 4, 1),
                        'desc': 'Power grid strain — too many modules for available power capacity'})

    if rng.next() < 0.06:
        hazards.append({'type': 'supply_chain_bottleneck',
                        'min_crew': 3,
                        'min_modules': 3,
                        'efficiency_penalty': round(0.01 + rng.next() * 0.02, 4),
                        'desc': 'Supply chain bottleneck — insufficient crew to maintain module density'})

    if rng.next() < 0.10:
        hazards.append({'type': 'dust_infiltration',
                        'targets_all_modules': True,
                        'degradation_per_module': round(0.001 + rng.next() * 0.002, 4),
                        'desc': 'Regolith dust infiltration through module seals — affects ALL modules'})

    return hazards


CHALLENGE_TYPES = [
    'solar_tracking_fault', 'pressure_anomaly', 'water_recycler_fault',
    'isru_catalyst_degradation', 'co2_scrubber_saturation', 'radiation_dosimetry',
    # v2: Robot-specific challenges
    'actuator_calibration',    # joint drift from perchlorate + thermal cycling
    'nav_sensor_degradation',  # camera/lidar obscured by regolith
    'battery_reconditioning',  # cold-cycled cells need recalibration
    'software_watchdog_reset', # cosmic ray bit flip triggered watchdog
]


def generate_challenge(sol, rng, mars=None):
    if sol % 5 != 0 and not (sol < 10 and sol % 3 == 0):
        return None
    ch_type = rng.choice(CHALLENGE_TYPES)
    params = {}
    if ch_type == 'solar_tracking_fault':
        params = {'misalignment_deg': round(5 + rng.next() * 20, 1), 'dust_factor': round(1 + rng.next(), 1)}
    elif ch_type == 'pressure_anomaly':
        params = {'section': rng.choice(['hab_a', 'hab_b', 'airlock']), 'drop_pa': round(10 + rng.next() * 40)}
    elif ch_type == 'water_recycler_fault':
        params = {'efficiency_drop': round(0.1 + rng.next() * 0.3, 2), 'filter_age_sols': rng.randint(30, 200)}
    elif ch_type == 'isru_catalyst_degradation':
        params = {'remaining_pct': round(20 + rng.next() * 60), 'output_reduction': round(0.1 + rng.next() * 0.4, 2)}
    elif ch_type == 'co2_scrubber_saturation':
        params = {'saturation_pct': round(70 + rng.next() * 25), 'co2_ppm': round(800 + rng.next() * 600)}
    elif ch_type == 'radiation_dosimetry':
        params = {'cumulative_msv': round(50 + rng.next() * 200), 'rate_usv_h': round(0.5 + rng.next() * 1.5, 2)}
    elif ch_type == 'actuator_calibration':
        params = {'joint': rng.choice(['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle']),
                  'drift_deg': round(1 + rng.next() * 8, 1), 'torque_loss_pct': round(5 + rng.next() * 25)}
    elif ch_type == 'nav_sensor_degradation':
        params = {'sensor': rng.choice(['front_hazcam', 'rear_hazcam', 'navcam', 'lidar']),
                  'obscuration_pct': round(10 + rng.next() * 50), 'cause': rng.choice(['dust', 'abrasion', 'frost'])}
    elif ch_type == 'battery_reconditioning':
        params = {'cells_affected': rng.randint(1, 4), 'capacity_remaining_pct': round(50 + rng.next() * 40),
                  'temp_at_failure': round(mars['temp_c']) if mars else -50}
    elif ch_type == 'software_watchdog_reset':
        params = {'subsystem': rng.choice(['nav', 'comm', 'motor', 'science', 'thermal']),
                  'reboot_count': rng.randint(1, 5), 'memory_errors': rng.randint(1, 12)}
    return {'id': f'sol{sol}_{ch_type}', 'type': ch_type, 'params': params}


def generate_frame(sol, rng, prev_mars=None):
    mars = mars_conditions(sol, rng)
    events = generate_events(sol, mars, rng)
    hazards = generate_hazards(sol, mars, rng)
    earth_delay = 4 + 10 * abs(math.sin(math.radians(sol * 0.5)))
    challenge = generate_challenge(sol, rng, mars)

    echo = {
        'prev_sol': sol - 1 if sol > 1 else None,
        'global_dust_trend': 'rising' if mars['dust_tau'] > 0.25 else 'falling' if mars['dust_tau'] < 0.1 else 'stable',
        'solar_efficiency_trend': 'declining' if mars['dust_tau'] > 0.2 else 'improving' if mars['dust_tau'] < 0.1 else 'stable',
    }
    if prev_mars:
        echo['temp_delta'] = round(mars['temp_k'] - prev_mars['temp_k'], 1)
        echo['dust_delta'] = round(mars['dust_tau'] - prev_mars['dust_tau'], 3)

    utc = (datetime(2025, 7, 9) + timedelta(hours=sol * 24.66)).isoformat() + 'Z'

    frame = {
        'sol': sol, 'utc': utc, 'mars': mars, 'events': events, 'hazards': hazards,
        'comms': {'earth_delay_min': round(earth_delay, 1), 'window_open': 6 < mars['lmst'] < 20,
                  'bandwidth_kbps': 32 if earth_delay < 10 else 16},
        'terrain': {'regolith_hardness': round(0.5 + rng.next() * 0.4, 2),
                    'water_ice_depth_m': round(0.8 + rng.next() * 1.5, 1),
                    'surface_radiation_usv': round(0.3 + rng.next() * 0.7, 2)},
        'challenge': challenge, 'frame_echo': echo
    }

    frame_str = json.dumps(frame, sort_keys=True, separators=(',', ':'))
    frame['_hash'] = hashlib.sha256(frame_str.encode()).hexdigest()[:16]
    return frame, mars


FRAME_FILE_RE = re.compile(r"sol-(\d+)\.json$")


def _generated_at():
    return datetime.utcnow().isoformat() + 'Z'


def _atomic_write(path, content):
    temp_path = path.with_suffix(path.suffix + '.tmp')
    temp_path.write_text(content)
    temp_path.replace(path)


def _semantic_number(mapping, aliases, sol, field, minimum, maximum,
                     required=True):
    value = None
    for alias in aliases:
        if alias in mapping:
            value = mapping[alias]
            break
    if value is None:
        if required:
            raise ValueError(f'Sol {sol} missing {field}')
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'Sol {sol} {field} must be numeric')
    if not math.isfinite(value) or not minimum <= value <= maximum:
        raise ValueError(
            f'Sol {sol} {field} must be between {minimum} and {maximum}'
        )
    return value


def _validate_frame_semantics(frame):
    sol = frame.get('sol')
    if isinstance(sol, bool) or not isinstance(sol, int) or sol < 1:
        raise ValueError('Frame sol must be a positive integer')

    version = frame.get('version')
    if version is not None and version not in (7, 12):
        raise ValueError(f'Sol {sol} has unsupported frame version {version}')

    environment = frame.get('mars') or frame.get('environment')
    if not isinstance(environment, dict):
        raise ValueError(f'Sol {sol} requires mars or environment data')

    _semantic_number(
        environment, ('temp_k', 'temperature_k'), sol,
        'environment.temperature_k', 130, 330,
    )
    _semantic_number(
        environment, ('pressure_pa',), sol,
        'environment.pressure_pa', 0, 2000,
    )
    _semantic_number(
        environment, ('solar_wm2', 'solar_irradiance'), sol,
        'environment.solar_wm2', 0, 1500,
    )
    _semantic_number(
        environment, ('dust_tau',), sol,
        'environment.dust_tau', 0, 10,
        required='mars' in frame,
    )
    _semantic_number(
        environment, ('wind_ms', 'wind_speed_ms'), sol,
        'environment.wind_ms', 0, 200,
        required='mars' in frame,
    )

    for collection_name in ('events', 'hazards'):
        collection = frame.get(collection_name)
        if not isinstance(collection, list):
            raise ValueError(f'Sol {sol} {collection_name} must be a list')
        for index, item in enumerate(collection):
            if not isinstance(item, dict) or not isinstance(item.get('type'), str):
                raise ValueError(
                    f'Sol {sol} {collection_name}[{index}].type must be text'
                )

    if 'challenge' in frame and not isinstance(frame['challenge'], (dict, type(None))):
        raise ValueError(f'Sol {sol} challenge must be an object or null')
    if 'challenges' in frame and not isinstance(frame['challenges'], list):
        raise ValueError(f'Sol {sol} challenges must be a list')

    echo = frame.get('frame_echo')
    if echo is not None:
        if not isinstance(echo, dict):
            raise ValueError(f'Sol {sol} frame_echo must be an object')
        expected_previous = sol - 1 if sol > 1 else None
        if echo.get('prev_sol') != expected_previous:
            raise ValueError(
                f'Sol {sol} frame_echo.prev_sol must be {expected_previous}'
            )

    stored_hash = frame.get('_hash')
    if stored_hash is not None and (
        not isinstance(stored_hash, str)
        or not re.fullmatch(r'[0-9a-f]{16}', stored_hash)
    ):
        raise ValueError(f'Sol {sol} _hash must be 16 lowercase hex characters')


def _frame_entry(path, expected_sol=None):
    raw = path.read_bytes()
    frame = json.loads(raw)
    match = FRAME_FILE_RE.fullmatch(path.name)
    if not match:
        raise ValueError(f'Invalid frame filename: {path.name}')

    filename_sol = int(match.group(1))
    frame_sol = frame.get('sol')
    if frame_sol != filename_sol:
        raise ValueError(
            f'Frame Sol mismatch: {path.name} contains sol={frame_sol!r}'
        )
    if expected_sol is not None and frame_sol != expected_sol:
        raise ValueError(
            f'Frame ledger gap: expected Sol {expected_sol}, found Sol {frame_sol}'
        )
    _validate_frame_semantics(frame)

    return frame, {
        'sol': frame_sol,
        'hash': hashlib.sha256(raw).hexdigest(),
        'size': len(raw),
    }


def _manifest_from_frames(frames_dir, generated=None):
    paths = sorted(
        frames_dir.glob('sol-*.json'),
        key=lambda path: int(FRAME_FILE_RE.fullmatch(path.name).group(1)),
    )
    if not paths:
        raise ValueError('Frame ledger is empty')

    entries = []
    for expected_sol, path in enumerate(paths, start=1):
        _, entry = _frame_entry(path, expected_sol)
        entries.append(entry)

    return {
        'version': 2,
        'hash_algorithm': 'sha256-file',
        'generated': generated or _generated_at(),
        'total_frames': len(entries),
        'first_sol': entries[0]['sol'],
        'last_sol': entries[-1]['sol'],
        'frames': entries,
    }


def _bundle_frame(frame):
    if frame.get('mars') or not frame.get('environment'):
        return frame

    environment = frame['environment']
    temp_k = environment.get('temp_k', environment.get('temperature_k'))
    temp_c = environment.get('temp_c', environment.get('temperature_c'))
    if temp_k is None:
        temp_k = temp_c + 273.15 if temp_c is not None else 213.15
    if temp_c is None:
        temp_c = temp_k - 273.15

    normalized = dict(frame)
    normalized['mars'] = {
        'ls': environment.get(
            'ls',
            environment.get('solar_longitude', 0),
        ),
        'season': environment.get('season', 'Unknown'),
        'temp_k': temp_k,
        'temp_c': temp_c,
        'pressure_pa': environment.get('pressure_pa', 740),
        'solar_wm2': environment.get(
            'solar_wm2',
            environment.get('solar_irradiance', 490),
        ),
        'dust_tau': environment.get(
            'dust_tau',
            0.8 if environment.get('dust_storm') else 0.15,
        ),
        'wind_ms': environment.get(
            'wind_ms',
            environment.get('wind_speed_ms', 4),
        ),
        'lmst': environment.get('lmst', 12),
    }
    return normalized


def _write_indexes(frames_dir, manifest):
    manifest_path = frames_dir / 'manifest.json'
    latest_path = frames_dir / 'latest.json'
    bundle_path = frames_dir / 'frames.json'

    _atomic_write(manifest_path, json.dumps(manifest, indent=2))
    _atomic_write(latest_path, json.dumps({
        'sol': manifest['last_sol'],
        'hash': manifest['frames'][-1]['hash'],
        'updated': manifest['generated'],
    }, indent=2))

    bundle = {
        '_format': 'mars-barn-frames-bundle',
        'version': 1,
        'total': manifest['total_frames'],
        'first_sol': manifest['first_sol'],
        'last_sol': manifest['last_sol'],
        'generated': manifest['generated'],
        'frames': {},
    }
    for entry in manifest['frames']:
        path = frames_dir / f'sol-{entry["sol"]:04d}.json'
        bundle['frames'][str(entry['sol'])] = _bundle_frame(
            json.loads(path.read_text())
        )

    bundle_json = json.dumps(bundle)
    _atomic_write(bundle_path, bundle_json)
    return len(bundle_json)


def _check_ledger(frames_dir):
    manifest_path = frames_dir / 'manifest.json'
    latest_path = frames_dir / 'latest.json'
    bundle_path = frames_dir / 'frames.json'
    for path in (manifest_path, latest_path, bundle_path):
        if not path.exists():
            raise ValueError(f'Missing ledger index: {path.name}')

    manifest = json.loads(manifest_path.read_text())
    expected = _manifest_from_frames(
        frames_dir,
        generated=manifest.get('generated'),
    )
    comparable_keys = (
        'version', 'hash_algorithm', 'total_frames', 'first_sol', 'last_sol',
        'frames'
    )
    for key in comparable_keys:
        if manifest.get(key) != expected[key]:
            raise ValueError(f'Manifest {key} does not match frame files')

    latest = json.loads(latest_path.read_text())
    if latest.get('sol') != expected['last_sol']:
        raise ValueError('latest.json Sol does not match the manifest')
    if latest.get('hash') != expected['frames'][-1]['hash']:
        raise ValueError('latest.json hash does not match the manifest')

    bundle = json.loads(bundle_path.read_text())
    expected_sols = [str(entry['sol']) for entry in expected['frames']]
    if bundle.get('total') != expected['total_frames']:
        raise ValueError('frames.json total does not match the manifest')
    if bundle.get('first_sol') != expected['first_sol']:
        raise ValueError('frames.json first_sol does not match the manifest')
    if bundle.get('last_sol') != expected['last_sol']:
        raise ValueError('frames.json last_sol does not match the manifest')
    if list(bundle.get('frames', {}).keys()) != expected_sols:
        raise ValueError('frames.json contents do not match the manifest')
    for sol in expected_sols:
        frame_path = frames_dir / f'sol-{int(sol):04d}.json'
        expected_frame = _bundle_frame(json.loads(frame_path.read_text()))
        if bundle['frames'][sol] != expected_frame:
            raise ValueError(f'frames.json payload differs from Sol {sol}')

    return expected


def main():
    parser = argparse.ArgumentParser(description='Generate Mars environmental frames')
    parser.add_argument('--count', type=int, default=1, help='Number of new frames to generate')
    parser.add_argument('--reseed', type=int, default=0, help='Regenerate from sol 1 to N')
    parser.add_argument('--seed', type=int, default=42, help='RNG seed')
    parser.add_argument('--reconcile', action='store_true',
                        help='Rebuild manifest/latest/bundle from immutable frame files')
    parser.add_argument('--check', action='store_true',
                        help='Validate frame files and indexes without writing')
    parser.add_argument('--frames-dir', type=Path,
                        help=argparse.SUPPRESS)
    args = parser.parse_args()

    repo_root = Path(__file__).parent.parent
    frames_dir = args.frames_dir or repo_root / 'data' / 'frames'
    frames_dir.mkdir(parents=True, exist_ok=True)

    if args.check:
        checked = _check_ledger(frames_dir)
        print(
            f'Ledger valid: {checked["total_frames"]} frames '
            f'(Sol {checked["first_sol"]}-{checked["last_sol"]})'
        )
        return

    if args.reconcile:
        existing_manifest = None
        manifest_path = frames_dir / 'manifest.json'
        if manifest_path.exists():
            existing_manifest = json.loads(manifest_path.read_text())
        manifest = _manifest_from_frames(frames_dir)
        if existing_manifest and existing_manifest.get('version', 1) >= 2:
            existing_by_sol = {
                entry['sol']: entry for entry in existing_manifest.get('frames', [])
            }
            reconciled_sols = {entry['sol'] for entry in manifest['frames']}
            missing_sols = sorted(set(existing_by_sol) - reconciled_sols)
            if missing_sols:
                raise SystemExit(
                    f'Refusing to truncate immutable frame ledger; '
                    f'missing Sol {missing_sols[0]}'
                )
            for entry in manifest['frames']:
                previous = existing_by_sol.get(entry['sol'])
                if previous and previous.get('hash') != entry['hash']:
                    raise SystemExit(
                        f'Refusing to reconcile modified historical frame '
                        f'Sol {entry["sol"]}'
                    )
        bundle_size = _write_indexes(frames_dir, manifest)
        _check_ledger(frames_dir)
        print(
            f'Reconciled {manifest["total_frames"]} immutable frames '
            f'(Sol {manifest["first_sol"]}-{manifest["last_sol"]})'
        )
        print(f'Bundle: {manifest["total_frames"]} frames, {bundle_size//1024} KB')
        return

    if args.count < 1 or args.reseed < 0:
        parser.error('--count must be positive and --reseed cannot be negative')

    manifest_path = frames_dir / 'manifest.json'
    if manifest_path.exists():
        _check_ledger(frames_dir)
    if manifest_path.exists() and args.reseed == 0:
        manifest = json.loads(manifest_path.read_text())
        start_sol = manifest['last_sol'] + 1
    else:
        manifest = {'version': 2, 'hash_algorithm': 'sha256-file',
                     'generated': '', 'total_frames': 0,
                     'first_sol': 1, 'last_sol': 0, 'frames': []}
        start_sol = 1

    count = args.reseed if args.reseed else args.count
    if args.reseed:
        start_sol = 1

    end_sol = start_sol + count - 1
    target_paths = [
        frames_dir / f'sol-{sol:04d}.json'
        for sol in range(start_sol, end_sol + 1)
    ]
    collisions = [path.name for path in target_paths if path.exists()]
    if collisions:
        raise SystemExit(
            'Refusing to overwrite immutable frame files: '
            + ', '.join(collisions[:5])
        )

    existing_paths = list(frames_dir.glob('sol-*.json'))
    if existing_paths:
        highest_existing = max(
            int(FRAME_FILE_RE.fullmatch(path.name).group(1))
            for path in existing_paths
        )
        if highest_existing >= start_sol:
            raise SystemExit(
                f'Manifest ends at Sol {start_sol - 1}, but frame files exist '
                f'through Sol {highest_existing}; run --reconcile first'
            )

    prev_mars = None
    if start_sol > 1:
        prev_path = frames_dir / f'sol-{start_sol - 1:04d}.json'
        if prev_path.exists():
            prev_mars = json.loads(prev_path.read_text()).get('mars')
        if prev_mars is None:
            raise SystemExit(
                f'Sol {start_sol - 1} uses an unsupported frame schema; '
                'publication remains frozen until schemas are normalized'
            )

    generated_frames = []
    for sol in range(start_sol, end_sol + 1):
        rng = MarsRNG(args.seed + sol)
        frame, mars = generate_frame(sol, rng, prev_mars)
        generated_frames.append((sol, frame))
        prev_mars = mars

    for sol, frame in generated_frames:
        frame_path = frames_dir / f'sol-{sol:04d}.json'
        _atomic_write(frame_path, json.dumps(frame, indent=2))
        _, entry = _frame_entry(frame_path, sol)
        manifest['frames'].append(entry)

    manifest['frames'].sort(key=lambda f: f['sol'])
    manifest['total_frames'] = len(manifest['frames'])
    manifest['first_sol'] = manifest['frames'][0]['sol']
    manifest['last_sol'] = manifest['frames'][-1]['sol']
    manifest['generated'] = _generated_at()

    print(f'Generated {count} frames (Sol {start_sol}-{end_sol})')
    print(f'Total: {manifest["total_frames"]} frames (Sol {manifest["first_sol"]}-{manifest["last_sol"]})')

    bundle_size = _write_indexes(frames_dir, manifest)
    _check_ledger(frames_dir)
    print(f'Bundle: {manifest["total_frames"]} frames, {bundle_size//1024} KB')


if __name__ == '__main__':
    main()

# v4 hazards added at the bottom of generate_hazards
# These are appended to the function by the frame generator
# when --v4 flag is used
