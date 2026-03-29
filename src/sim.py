"""Mars Barn Opus — Simulation Runner

CLI entry point. Runs single-colony, multi-colony, or benchmark mode.
Produces human-readable reports and JSON output.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

from config import (
    DEFAULT_SOLS, DEFAULT_SEED, DEFAULT_COLONIES, BENCHMARK_SEEDS,
    GOVERNOR_ARCHETYPES,
)
from colony import Colony, Resources, create_colony, Allocation, step, serialize
from governor import Governor, create_governor
from events import EventEngine
from mars import (
    generate_terrain, atmosphere_at, daily_mean_irradiance,
    radiation_dose, render_terrain_ascii,
)
from world import World, create_world, run_world
from report import generate_report
from scoring import score_run, build_leaderboard, display_leaderboard
from mission_control import run_mission_control


def run_single(sols: int = DEFAULT_SOLS, seed: int = DEFAULT_SEED,
               archetype: str = "engineer") -> Dict:
    """Run a single-colony simulation."""
    terrain = generate_terrain(size=32, seed=seed)
    colony = create_colony("Solo", location_x=16, location_y=16)
    governor = create_governor("Governor", archetype=archetype)
    events = EventEngine()
    events.set_seed(seed)

    prev = Resources(
        o2_kg=colony.resources.o2_kg,
        h2o_liters=colony.resources.h2o_liters,
        food_kcal=colony.resources.food_kcal,
        power_kwh=colony.resources.power_kwh,
        crew_size=colony.resources.crew_size,
    )

    for sol in range(sols):
        if not colony.alive:
            break

        new_events = events.tick(sol + 1)
        agg = events.aggregate_effects()

        sol_of_year = (sol + 1) % 669
        dust_factor = agg.get("dust_factor", 1.0)
        solar_mult = agg.get("solar_multiplier", 1.0)
        temp_offset = agg.get("temp_offset_k", 0.0)

        cell = terrain.cell_at(16, 16)
        irradiance = daily_mean_irradiance(0.0, sol_of_year, dust_factor) * solar_mult
        atm = atmosphere_at(cell.elevation_m, 0.0, sol_of_year, dust_factor=dust_factor)
        ext_temp = atm.temperature_k + temp_offset
        rad = radiation_dose(
            sol_count=1, in_habitat=True,
            solar_flare=any(e.event_type == "solar_flare" for e in events.active_events),
        )

        allocation = governor.decide(colony, len(events.active_events), prev)

        prev = Resources(
            o2_kg=colony.resources.o2_kg,
            h2o_liters=colony.resources.h2o_liters,
            food_kcal=colony.resources.food_kcal,
            power_kwh=colony.resources.power_kwh,
            crew_size=colony.resources.crew_size,
        )

        step(colony, irradiance, ext_temp, allocation,
             active_events=events.active_event_dicts(),
             radiation_msv=rad)

    return {
        "mode": "single",
        "archetype": archetype,
        "seed": seed,
        "survived_sols": colony.sol,
        "alive": colony.alive,
        "cause_of_death": colony.cause_of_death,
        "final_state": serialize(colony),
        "event_log": events.event_log,
    }


def run_multi(num_colonies: int = DEFAULT_COLONIES, sols: int = DEFAULT_SOLS,
              seed: int = DEFAULT_SEED) -> Dict:
    """Run a multi-colony simulation."""
    world = create_world(num_colonies=num_colonies, max_sols=sols, seed=seed)
    return run_world(world)


def run_benchmark() -> Dict:
    """Benchmark all archetypes across multiple seeds."""
    archetypes = list(GOVERNOR_ARCHETYPES.keys())
    results = {arch: [] for arch in archetypes}

    total_runs = len(archetypes) * len(BENCHMARK_SEEDS)
    completed = 0

    for arch in archetypes:
        for seed in BENCHMARK_SEEDS:
            result = run_single(sols=500, seed=seed, archetype=arch)
            results[arch].append({
                "seed": seed,
                "survived": result["survived_sols"],
                "alive": result["alive"],
                "cause": result["cause_of_death"],
            })
            completed += 1
            print(f"\r  Benchmark: {completed}/{total_runs} "
                  f"({arch} seed={seed} -> sol {result['survived_sols']})",
                  end="", flush=True)

    print()

    # Compute stats
    summary = {}
    for arch in archetypes:
        runs = results[arch]
        survivals = [r["survived"] for r in runs]
        alive_count = sum(1 for r in runs if r["alive"])
        summary[arch] = {
            "avg_survival": round(sum(survivals) / len(survivals), 1),
            "min_survival": min(survivals),
            "max_survival": max(survivals),
            "survival_rate": f"{alive_count}/{len(runs)}",
            "description": GOVERNOR_ARCHETYPES[arch]["description"],
            "runs": runs,
        }

    return {"mode": "benchmark", "archetypes": summary}


# =============================================================================
# DISPLAY
# =============================================================================

def display_single(result: Dict) -> None:
    """Print single-colony results."""
    print(f"\n{'='*60}")
    print(f"  MARS BARN OPUS — Single Colony")
    print(f"{'='*60}")
    print(f"  Governor: {result['archetype']}")
    print(f"  Seed:     {result['seed']}")
    print(f"  Result:   {'SURVIVED' if result['alive'] else 'DEAD'}")
    print(f"  Sols:     {result['survived_sols']}")
    if result['cause_of_death']:
        print(f"  Cause:    {result['cause_of_death']}")

    state = result['final_state']
    r = state['resources']
    print(f"\n  Final Resources:")
    print(f"    O2:    {r['o2_kg']:>10.1f} kg")
    print(f"    H2O:   {r['h2o_liters']:>10.1f} L")
    print(f"    Food:  {r['food_kcal']:>10.0f} kcal")
    print(f"    Power: {r['power_kwh']:>10.1f} kWh")

    s = state['systems']
    print(f"\n  System Health:")
    for sys_name, eff in s.items():
        bar = '#' * int(eff * 20) + '.' * (20 - int(eff * 20))
        print(f"    {sys_name:>12}: [{bar}] {eff*100:.0f}%")

    print(f"\n  Radiation: {state['cumulative_radiation_msv']:.1f} mSv")
    print(f"  Morale:    {state['morale']:.1%}")
    print(f"  Ration sols: {state['sols_on_rations']}")
    print(f"{'='*60}\n")


def display_multi(result: Dict) -> None:
    """Print multi-colony results."""
    print(f"\n{'='*60}")
    print(f"  MARS BARN OPUS — Multi-Colony ({len(result['colonies'])} colonies)")
    print(f"{'='*60}")

    # Leaderboard sorted by survival time
    leaderboard = sorted(
        result['colonies'].items(),
        key=lambda x: (-x[1]['survived_sols'], -x[1]['reputation']),
    )

    print(f"\n  {'Rank':<5} {'Colony':<25} {'Arch':<12} {'Sols':>6} {'Status':<10} {'Rep':>5}")
    print(f"  {'-'*70}")
    for i, (name, data) in enumerate(leaderboard, 1):
        status = "ALIVE" if data['alive'] else f"DEAD"
        print(f"  {i:<5} {name:<25} {data['archetype']:<12} "
              f"{data['survived_sols']:>6} {status:<10} {data['reputation']:>5.2f}")

    # Details for each colony
    for name, data in leaderboard:
        print(f"\n  --- {name} ({data['archetype']}) ---")
        if data['cause_of_death']:
            print(f"  Died sol {data['survived_sols']}: {data['cause_of_death']}")
        print(f"  Trades: {data['trades_completed']}  "
              f"Sabotages: {data['sabotages_attempted']} attempted, "
              f"{data['sabotages_received']} received")
        print(f"  Ration sols: {data['sols_on_rations']}  "
              f"Radiation: {data['cumulative_radiation_msv']} mSv  "
              f"Morale: {data['morale']:.1%}")

    print(f"\n{'='*60}\n")


def display_benchmark(result: Dict) -> None:
    """Print benchmark results as a ranked table."""
    print(f"\n{'='*70}")
    print(f"  MARS BARN OPUS — Governor Benchmark (5 seeds x 500 sols)")
    print(f"{'='*70}")

    ranked = sorted(
        result['archetypes'].items(),
        key=lambda x: -x[1]['avg_survival'],
    )

    print(f"\n  {'Rank':<5} {'Archetype':<14} {'Avg':>6} {'Min':>6} {'Max':>6} "
          f"{'Rate':>6}  Description")
    print(f"  {'-'*75}")

    for i, (arch, data) in enumerate(ranked, 1):
        print(f"  {i:<5} {arch:<14} {data['avg_survival']:>6.0f} "
              f"{data['min_survival']:>6} {data['max_survival']:>6} "
              f"{data['survival_rate']:>6}  {data['description']}")

    # Winner
    winner = ranked[0]
    loser = ranked[-1]
    print(f"\n  Champion: {winner[0]} (avg {winner[1]['avg_survival']:.0f} sols)")
    print(f"  Last:     {loser[0]} (avg {loser[1]['avg_survival']:.0f} sols)")
    print(f"  Spread:   {winner[1]['avg_survival'] - loser[1]['avg_survival']:.0f} sols")
    print(f"{'='*70}\n")


# =============================================================================
# CLI
# =============================================================================

def _resource_bar(label: str, current: float, max_val: float,
                  width: int = 20) -> str:
    """Render a resource bar with color thresholds."""
    frac = min(1.0, max(0.0, current / max(1, max_val)))
    filled = int(frac * width)
    empty = width - filled
    if frac > 0.5:
        color = "\033[32m"  # green
    elif frac > 0.2:
        color = "\033[33m"  # yellow
    else:
        color = "\033[31m"  # red
    reset = "\033[0m"
    bar = f"{color}{'█' * filled}{'░' * empty}{reset}"
    return f"  {label:>8}: [{bar}] {current:>8.1f}"


def _status_display(colony: Colony, sol: int, events_active: int,
                    atm_temp_k: float, irradiance: float) -> None:
    """Print the interactive game status screen."""
    r = colony.resources
    s = colony.systems
    cascade = colony.cascade_state.value.upper().replace("_", " ")

    # Header
    print(f"\033[2J\033[H")  # Clear screen
    print(f"  ╔══════════════════════════════════════════════════════╗")
    print(f"  ║  MARS BARN OPUS — Sol {sol:>4}                          ║")
    print(f"  ║  Colony: {colony.name:<20}  Crew: {r.crew_size}            ║")
    print(f"  ╠══════════════════════════════════════════════════════╣")

    # Environment
    temp_c = atm_temp_k - 273.15
    print(f"  ║  Environment                                        ║")
    print(f"  ║    Exterior: {temp_c:>6.1f}°C   Solar: {irradiance:>6.1f} W/m²     ║")
    print(f"  ║    Interior: {colony.interior_temp_k - 273.15:>6.1f}°C   Events: {events_active:>2}          ║")
    print(f"  ║    Status:   {cascade:<15}                      ║")
    print(f"  ╠══════════════════════════════════════════════════════╣")

    # Resources
    crew = r.crew_size
    o2_max = crew * 0.84 * 30
    h2o_max = crew * 2.5 * 30
    food_max = crew * 2500 * 30
    print(f"  ║  Resources                                          ║")
    print(f"  ║{_resource_bar('O2', r.o2_kg, o2_max)}     ║")
    print(f"  ║{_resource_bar('H2O', r.h2o_liters, h2o_max)}     ║")
    print(f"  ║{_resource_bar('Food', r.food_kcal, food_max)}     ║")
    print(f"  ║{_resource_bar('Power', r.power_kwh, 1000)}     ║")
    print(f"  ╠══════════════════════════════════════════════════════╣")

    # Systems
    print(f"  ║  Systems                                            ║")
    for name, val in [("Solar", s.solar_efficiency), ("ISRU", s.isru_efficiency),
                      ("GreenH", s.greenhouse_efficiency), ("Heat", s.heating_efficiency)]:
        pct = int(val * 100)
        blocks = int(val * 10)
        bar = "█" * blocks + "░" * (10 - blocks)
        print(f"  ║    {name:>6}: [{bar}] {pct:>3}%                        ║")

    print(f"  ║  Morale: {colony.morale:.0%}   Radiation: {colony.cumulative_radiation_msv:.0f} mSv           ║")
    print(f"  ╠══════════════════════════════════════════════════════╣")
    print(f"  ║  Allocate power: (total must = 100%)                ║")
    print(f"  ║    [H]eating  [I]SRU  [G]reenhouse  [R]ation level  ║")
    print(f"  ║    [A]uto (let AI decide)  [Q]uit                   ║")
    print(f"  ╚══════════════════════════════════════════════════════╝")


def run_interactive(seed: int = DEFAULT_SEED) -> None:
    """Interactive survival mode — the player IS the governor."""
    terrain = generate_terrain(size=32, seed=seed)
    colony = create_colony("Player Colony", location_x=16, location_y=16)
    events = EventEngine()
    events.set_seed(seed)
    auto_governor = create_governor("AutoGov", "engineer")

    heating = 25
    isru = 40
    greenhouse = 35
    food_ration = 100  # Percentage

    print("\033[2J\033[H")
    print("""
  ╔══════════════════════════════════════════════════════╗
  ║         MARS BARN OPUS — SURVIVAL MODE              ║
  ║                                                     ║
  ║  You are the governor of a Mars colony.             ║
  ║  4 crew. 30 sols of reserves. Realistic physics.    ║
  ║                                                     ║
  ║  Allocate power between heating, ISRU (O2/H2O),     ║
  ║  and greenhouse (food). Survive as long as you can. ║
  ║                                                     ║
  ║  The Martian environment is hostile:                 ║
  ║  - Surface temp: -60°C average                      ║
  ║  - Dust storms cut solar power by 80%               ║
  ║  - Meteorite impacts damage systems                 ║
  ║  - If power fails, you have 3 sols to live          ║
  ║                                                     ║
  ║  Press ENTER to begin...                            ║
  ╚══════════════════════════════════════════════════════╝
""")

    try:
        input()
    except (EOFError, KeyboardInterrupt):
        return

    from colony import Resources

    while colony.alive:
        sol = colony.sol + 1
        new_events = events.tick(sol)
        agg = events.aggregate_effects()

        sol_of_year = sol % 669
        dust_factor = agg.get("dust_factor", 1.0)
        solar_mult = agg.get("solar_multiplier", 1.0)
        temp_offset = agg.get("temp_offset_k", 0.0)

        cell = terrain.cell_at(16, 16)
        irradiance = daily_mean_irradiance(0.0, sol_of_year, dust_factor) * solar_mult
        atm = atmosphere_at(cell.elevation_m, 0.0, sol_of_year, dust_factor=dust_factor)
        ext_temp = atm.temperature_k + temp_offset
        rad = radiation_dose(
            sol_count=1, in_habitat=True,
            solar_flare=any(e.event_type == "solar_flare" for e in events.active_events),
        )

        # Show status and events
        _status_display(colony, sol, len(events.active_events),
                       ext_temp, irradiance)

        if new_events:
            print(f"\n  \033[33m⚠ EVENTS:\033[0m")
            for e in new_events:
                print(f"    • {e.description} (severity: {e.severity:.1f}, "
                      f"duration: {e.duration_sols} sols)")

        # Get player input
        print(f"\n  Current: H={heating}% I={isru}% G={greenhouse}% Ration={food_ration}%")

        try:
            cmd = input("  > ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            break

        if cmd == 'q':
            break
        elif cmd == 'a':
            # Auto mode
            prev = Resources(o2_kg=colony.resources.o2_kg,
                            h2o_liters=colony.resources.h2o_liters,
                            food_kcal=colony.resources.food_kcal,
                            power_kwh=colony.resources.power_kwh,
                            crew_size=colony.resources.crew_size)
            auto_alloc = auto_governor.decide(colony, len(events.active_events), prev)
            heating = int(auto_alloc.heating_fraction * 100)
            isru = int(auto_alloc.isru_fraction * 100)
            greenhouse = 100 - heating - isru
            food_ration = int(auto_alloc.food_ration * 100)
        elif cmd.startswith('h'):
            try:
                heating = int(cmd[1:].strip() or input("    Heating %: "))
                remainder = 100 - heating
                isru = int(remainder * isru / max(1, isru + greenhouse))
                greenhouse = remainder - isru
            except (ValueError, ZeroDivisionError):
                pass
        elif cmd.startswith('i'):
            try:
                isru = int(cmd[1:].strip() or input("    ISRU %: "))
                remainder = 100 - isru
                heating = int(remainder * heating / max(1, heating + greenhouse))
                greenhouse = remainder - heating
            except (ValueError, ZeroDivisionError):
                pass
        elif cmd.startswith('g'):
            try:
                greenhouse = int(cmd[1:].strip() or input("    Greenhouse %: "))
                remainder = 100 - greenhouse
                heating = int(remainder * heating / max(1, heating + isru))
                isru = remainder - heating
            except (ValueError, ZeroDivisionError):
                pass
        elif cmd.startswith('r'):
            try:
                food_ration = int(cmd[1:].strip() or input("    Ration % (30-100): "))
                food_ration = max(30, min(100, food_ration))
            except ValueError:
                pass
        # else: keep current allocation (just press enter to advance)

        # Clamp
        heating = max(0, min(100, heating))
        isru = max(0, min(100, isru))
        greenhouse = max(0, min(100, greenhouse))
        total = heating + isru + greenhouse
        if total > 0:
            heating = int(heating / total * 100)
            isru = int(isru / total * 100)
            greenhouse = 100 - heating - isru

        allocation = Allocation(
            heating_fraction=heating / 100.0,
            isru_fraction=isru / 100.0,
            greenhouse_fraction=greenhouse / 100.0,
            food_ration=food_ration / 100.0,
        )

        step(colony, irradiance, ext_temp, allocation,
             active_events=events.active_event_dicts(),
             radiation_msv=rad)

    # Game over
    print(f"\n\033[31m{'='*56}\033[0m")
    print(f"  GAME OVER — Sol {colony.sol}")
    if colony.cause_of_death:
        print(f"  Cause: {colony.cause_of_death}")
    print(f"  Morale: {colony.morale:.0%}  Radiation: {colony.cumulative_radiation_msv:.0f} mSv")

    result = {"survived_sols": colony.sol, "alive": colony.alive,
              "morale": colony.morale, "reputation": 0.5,
              "trades_completed": 0, "sols_on_rations": colony.sols_on_rations,
              "cause_of_death": colony.cause_of_death,
              "sabotages_attempted": 0, "final_resources": {
                  "o2_kg": colony.resources.o2_kg,
                  "h2o_liters": colony.resources.h2o_liters,
                  "food_kcal": colony.resources.food_kcal,
                  "power_kwh": colony.resources.power_kwh,
              }}
    score = score_run(result)
    print(f"\n  Score: {score.composite:.0f}/100 (Grade: {score.grade})")
    print(f"    Survival: {score.survival:.0f}  Efficiency: {score.efficiency:.0f}  "
          f"Morale: {score.morale:.0f}  Resilience: {score.resilience:.0f}")
    print(f"\033[31m{'='*56}\033[0m\n")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Mars Barn Opus — Mars Colony Survival Simulation"
    )
    parser.add_argument("--sols", type=int, default=DEFAULT_SOLS,
                        help=f"Number of sols to simulate (default: {DEFAULT_SOLS})")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED,
                        help=f"Random seed (default: {DEFAULT_SEED})")
    parser.add_argument("--colonies", type=int, default=DEFAULT_COLONIES,
                        help=f"Number of colonies (default: {DEFAULT_COLONIES})")
    parser.add_argument("--archetype", type=str, default="engineer",
                        choices=list(GOVERNOR_ARCHETYPES.keys()),
                        help="Governor archetype for single-colony mode")
    parser.add_argument("--benchmark", action="store_true",
                        help="Run benchmark across all archetypes")
    parser.add_argument("--json", action="store_true",
                        help="Output results as JSON")
    parser.add_argument("--json-file", type=str,
                        help="Write JSON results to file")
    parser.add_argument("--html", type=str,
                        help="Write HTML report to file")
    parser.add_argument("--leaderboard", action="store_true",
                        help="Run benchmark with composite scoring and leaderboard")
    parser.add_argument("--play", action="store_true",
                        help="Interactive survival mode — you are the governor")
    parser.add_argument("--mission-control", action="store_true",
                        help="Mission Control digital twin — observe autonomous colony")
    parser.add_argument("--speed", type=float, default=1.0,
                        help="Simulation speed for mission control (sols/sec, 0=instant)")
    parser.add_argument("--twin-path", type=str, default="/tmp/mars-twin-state.json",
                        help="Path for digital twin state file")

    args = parser.parse_args()

    start = time.time()

    if args.mission_control:
        run_mission_control(seed=args.seed, max_sols=args.sols,
                           archetype=args.archetype, speed=args.speed,
                           twin_path=args.twin_path)
        return
    elif args.play:
        run_interactive(args.seed)
        return
    elif args.leaderboard:
        print("\n  Running Monte Carlo leaderboard...")
        result = run_benchmark()
        entries = build_leaderboard(result, max_sols=500)
        display_leaderboard(entries)
        if not args.json:
            display_benchmark(result)
    elif args.benchmark:
        print("\n  Running benchmark...")
        result = run_benchmark()
        if not args.json:
            display_benchmark(result)
    elif args.colonies > 1:
        result = run_multi(args.colonies, args.sols, args.seed)
        if not args.json:
            display_multi(result)
    else:
        result = run_single(args.sols, args.seed, args.archetype)
        if not args.json:
            display_single(result)

    elapsed = time.time() - start

    if args.json:
        print(json.dumps(result, indent=2))

    if args.json_file:
        with open(args.json_file, "w") as f:
            json.dump(result, f, indent=2)
        print(f"  Results written to {args.json_file}")

    if args.html:
        html = generate_report(result)
        with open(args.html, "w") as f:
            f.write(html)
        print(f"  HTML report written to {args.html}")

    print(f"  Elapsed: {elapsed:.2f}s")


if __name__ == "__main__":
    main()
