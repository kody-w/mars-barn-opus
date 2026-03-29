"""Mars Barn Opus — Mission Control (Digital Twin)

The colony runs fully autonomous. You observe from Earth.
The AI governor makes all decisions. You see what happens.
You CAN intervene — override allocations, issue emergency orders —
but the colony survives (or dies) on its own merit.

This is the digital twin. State persists to JSON.
A physical twin syncs from this state file.

Usage:
    python src/sim.py --mission-control
    python src/sim.py --mission-control --seed 42 --speed 2
"""
from __future__ import annotations

import json
import time
import sys
import os
from pathlib import Path
from typing import Dict, Optional

from config import DEFAULT_SEED, DEFAULT_SOLS, MARS_SOL_HOURS
from colony import Colony, Resources, create_colony, Allocation, step, serialize
from governor import Governor, create_governor
from events import EventEngine, Event
from mars import (
    generate_terrain, Terrain, atmosphere_at, daily_mean_irradiance,
    radiation_dose, render_terrain_ascii,
)
from scoring import score_run


# ANSI color codes
class C:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_YELLOW = "\033[43m"
    CLEAR = "\033[2J\033[H"


def _bar(value: float, max_val: float, width: int = 25) -> str:
    """Colored resource bar."""
    frac = min(1.0, max(0.0, value / max(0.01, max_val)))
    filled = int(frac * width)
    empty = width - filled
    if frac > 0.5:
        color = C.GREEN
    elif frac > 0.2:
        color = C.YELLOW
    else:
        color = C.RED
    return f"{color}{'█' * filled}{C.DIM}{'░' * empty}{C.RESET}"


def _pct_bar(value: float, width: int = 10) -> str:
    """System efficiency bar."""
    filled = int(value * width)
    empty = width - filled
    if value > 0.7:
        color = C.GREEN
    elif value > 0.3:
        color = C.YELLOW
    else:
        color = C.RED
    return f"{color}{'█' * filled}{'░' * empty}{C.RESET}"


def _days_label(days: float) -> str:
    """Color-coded days remaining."""
    if days > 20:
        return f"{C.GREEN}{days:.0f}d{C.RESET}"
    if days > 7:
        return f"{C.YELLOW}{days:.0f}d{C.RESET}"
    return f"{C.RED}{days:.0f}d{C.RESET}"


def save_twin_state(colony: Colony, sol: int, events: list,
                    env: Dict, governor_name: str,
                    path: str = "/tmp/mars-twin-state.json") -> None:
    """Persist digital twin state for physical twin sync."""
    state = {
        "_meta": {
            "twin_type": "digital",
            "version": "mars-barn-opus-1vsm",
            "updated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "sol": sol,
        },
        "colony": serialize(colony),
        "environment": env,
        "governor": governor_name,
        "active_events": [
            {"type": e.event_type, "severity": e.severity,
             "remaining": e.remaining_sols, "description": e.description}
            for e in events
        ],
        "sync_instructions": {
            "note": "Physical twin should match these values",
            "heating_kw": env.get("heating_kw", 0),
            "solar_output_kwh": env.get("solar_kwh", 0),
            "isru_active": colony.resources.power_kwh > 50,
            "greenhouse_active": colony.resources.h2o_liters > 5,
            "alert_level": _alert_level(colony),
        },
    }
    with open(path, "w") as f:
        json.dump(state, f, indent=2)


def _alert_level(colony: Colony) -> str:
    """Determine current alert level."""
    if colony.cascade_state.value == "dead":
        return "BLACK"
    if colony.cascade_state.value != "nominal":
        return "RED"
    lowest, days = colony.resources.lowest_resource_days()
    if days < 5:
        return "RED"
    if days < 15:
        return "YELLOW"
    return "GREEN"


def render_mission_control(colony: Colony, sol: int, events: EventEngine,
                           ext_temp_k: float, irradiance: float,
                           allocation: Allocation, governor: Governor,
                           new_events: list, speed: float) -> None:
    """Render the full Mission Control display."""
    r = colony.resources
    s = colony.systems
    alert = _alert_level(colony)

    # Alert banner color
    if alert == "RED":
        banner_color = C.BG_RED
    elif alert == "YELLOW":
        banner_color = C.BG_YELLOW
    else:
        banner_color = C.BG_GREEN

    crew = r.crew_size
    o2_cap = crew * 0.84 * 60
    h2o_cap = crew * 2.5 * 60
    food_cap = crew * 2500 * 60

    temp_c = ext_temp_k - 273.15
    int_c = colony.interior_temp_k - 273.15
    cascade = colony.cascade_state.value.replace("_", " ").upper()

    print(C.CLEAR, end="")

    # Header
    print(f"  {banner_color}{C.WHITE}{C.BOLD}  MARS BARN — MISSION CONTROL  {C.RESET}"
          f"  {C.DIM}Digital Twin v1  |  Speed: {speed}x  |  "
          f"State: /tmp/mars-twin-state.json{C.RESET}")
    print()

    # Sol + Time
    hour = (sol * 3.7) % MARS_SOL_HOURS  # Rough sol-to-hour mapping
    mars_time = f"{int(hour):02d}:{int((hour % 1) * 60):02d}"
    print(f"  {C.BOLD}Sol {sol:>5}{C.RESET}  {C.DIM}Mars Local: {mars_time}{C.RESET}"
          f"  {C.BOLD}Governor:{C.RESET} {governor.archetype}"
          f"  {C.BOLD}Alert:{C.RESET} {banner_color} {alert} {C.RESET}"
          f"  {C.BOLD}Cascade:{C.RESET} {cascade}")
    print()

    # Environment box
    print(f"  {C.CYAN}╔═══ ENVIRONMENT ═══════════════════════════════════════════════╗{C.RESET}")
    print(f"  {C.CYAN}║{C.RESET}  Exterior: {C.BOLD}{temp_c:>7.1f}°C{C.RESET}"
          f"   Interior: {C.BOLD}{int_c:>7.1f}°C{C.RESET}"
          f"   Solar: {C.BOLD}{irradiance:>7.1f} W/m²{C.RESET}"
          f"      {C.CYAN}║{C.RESET}")
    print(f"  {C.CYAN}║{C.RESET}  Active events: {len(events.active_events)}"
          f"   Radiation: {colony.cumulative_radiation_msv:>6.1f} mSv"
          f"   Morale: {colony.morale:>5.0%}"
          f"           {C.CYAN}║{C.RESET}")
    print(f"  {C.CYAN}╚═══════════════════════════════════════════════════════════════╝{C.RESET}")
    print()

    # Resources
    print(f"  {C.GREEN}╔═══ RESOURCES ═════════════════════════════════════════════════╗{C.RESET}")
    print(f"  {C.GREEN}║{C.RESET}  O2    [{_bar(r.o2_kg, o2_cap)}] "
          f"{r.o2_kg:>8.1f} kg   {_days_label(r.days_of('o2'))}"
          f"       {C.GREEN}║{C.RESET}")
    print(f"  {C.GREEN}║{C.RESET}  H2O   [{_bar(r.h2o_liters, h2o_cap)}] "
          f"{r.h2o_liters:>8.1f} L    {_days_label(r.days_of('h2o'))}"
          f"       {C.GREEN}║{C.RESET}")
    print(f"  {C.GREEN}║{C.RESET}  Food  [{_bar(r.food_kcal, food_cap)}] "
          f"{r.food_kcal:>8.0f} kcal {_days_label(r.days_of('food'))}"
          f"       {C.GREEN}║{C.RESET}")
    print(f"  {C.GREEN}║{C.RESET}  Power [{_bar(r.power_kwh, 1000)}] "
          f"{r.power_kwh:>8.1f} kWh  {_days_label(r.days_of('power'))}"
          f"       {C.GREEN}║{C.RESET}")
    print(f"  {C.GREEN}╚═══════════════════════════════════════════════════════════════╝{C.RESET}")
    print()

    # Systems + Allocation side by side
    print(f"  {C.MAGENTA}╔═══ SYSTEMS ═══════════════╗{C.RESET}"
          f"  {C.BLUE}╔═══ GOVERNOR ALLOCATION ═══╗{C.RESET}")
    systems = [("Solar", s.solar_efficiency), ("ISRU", s.isru_efficiency),
               ("Greenhouse", s.greenhouse_efficiency), ("Heating", s.heating_efficiency),
               ("Comms", s.comms_efficiency)]
    allocs = [
        ("Heating", allocation.heating_fraction),
        ("ISRU", allocation.isru_fraction),
        ("Greenhouse", allocation.greenhouse_fraction),
        ("Ration", allocation.food_ration),
        ("Repair", 0.0),
    ]
    for i in range(5):
        sname, sval = systems[i]
        aname, aval = allocs[i]
        sys_str = f"  {sname:<11} [{_pct_bar(sval)}] {sval:>4.0%}"
        if aname == "Repair":
            alloc_str = f"  Target: {allocation.repair_target or 'none':<12}"
        else:
            alloc_str = f"  {aname:<11} [{_pct_bar(aval)}] {aval:>4.0%}"
        print(f"  {C.MAGENTA}║{C.RESET}{sys_str}  {C.MAGENTA}║{C.RESET}"
              f"  {C.BLUE}║{C.RESET}{alloc_str}  {C.BLUE}║{C.RESET}")
    print(f"  {C.MAGENTA}╚═══════════════════════════╝{C.RESET}"
          f"  {C.BLUE}╚═══════════════════════════╝{C.RESET}")
    print()

    # Event feed
    if new_events or events.active_events:
        print(f"  {C.YELLOW}╔═══ EVENT FEED ════════════════════════════════════════════════╗{C.RESET}")
        for e in new_events:
            print(f"  {C.YELLOW}║{C.RESET}  {C.RED}NEW{C.RESET} {e.description}"
                  f" {C.DIM}(severity {e.severity:.1f}, {e.duration_sols} sols){C.RESET}"
                  f"  {C.YELLOW}║{C.RESET}")
        for e in events.active_events:
            if e not in new_events:
                print(f"  {C.YELLOW}║{C.RESET}  {C.DIM}ACTIVE{C.RESET} {e.event_type}"
                      f" {C.DIM}({e.remaining_sols} sols left){C.RESET}"
                      f"                          {C.YELLOW}║{C.RESET}")
        print(f"  {C.YELLOW}╚═══════════════════════════════════════════════════════════════╝{C.RESET}")
        print()

    # Controls
    print(f"  {C.DIM}Controls: [Enter] advance  [o] override allocation  "
          f"[s] change speed  [q] abort mission{C.RESET}")


def run_mission_control(seed: int = DEFAULT_SEED, max_sols: int = DEFAULT_SOLS,
                        archetype: str = "engineer", speed: float = 1.0,
                        twin_path: str = "/tmp/mars-twin-state.json") -> None:
    """Run Mission Control — the digital twin operator experience.

    The colony runs autonomously. You watch. You can intervene.
    State saves every sol for physical twin sync.
    """
    terrain = generate_terrain(size=32, seed=seed)
    colony = create_colony("Ares Colony", location_x=16, location_y=16)
    governor = create_governor(f"AI-{archetype}", archetype)
    event_engine = EventEngine()
    event_engine.set_seed(seed)

    override_allocation: Optional[Allocation] = None

    # Startup screen
    print(C.CLEAR)
    print(f"""
  {C.CYAN}╔══════════════════════════════════════════════════════════════╗
  ║                                                            ║
  ║   {C.WHITE}{C.BOLD}M A R S   B A R N   —   M I S S I O N   C O N T R O L{C.RESET}{C.CYAN}   ║
  ║                                                            ║
  ║   {C.DIM}Digital Twin Interface{C.RESET}{C.CYAN}                                    ║
  ║   {C.DIM}Colony: Ares Colony  |  Crew: 4  |  Governor: {archetype:<10}{C.RESET}{C.CYAN} ║
  ║   {C.DIM}Seed: {seed:<5}  |  Twin state: {twin_path:<24}{C.RESET}{C.CYAN} ║
  ║                                                            ║
  ║   {C.WHITE}The colony runs autonomously.{C.RESET}{C.CYAN}                           ║
  ║   {C.WHITE}You observe. You can intervene. They survive or die.{C.RESET}{C.CYAN}    ║
  ║                                                            ║
  ║   {C.DIM}Press ENTER to establish uplink...{C.RESET}{C.CYAN}                       ║
  ╚══════════════════════════════════════════════════════════════╝{C.RESET}
""")

    try:
        input()
    except (EOFError, KeyboardInterrupt):
        return

    prev = Resources(
        o2_kg=colony.resources.o2_kg, h2o_liters=colony.resources.h2o_liters,
        food_kcal=colony.resources.food_kcal, power_kwh=colony.resources.power_kwh,
        crew_size=colony.resources.crew_size,
    )

    while colony.alive and colony.sol < max_sols:
        sol = colony.sol + 1

        # Tick events
        new_events = event_engine.tick(sol)
        agg = event_engine.aggregate_effects()

        # Environment
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
            solar_flare=any(e.event_type == "solar_flare"
                          for e in event_engine.active_events),
        )

        # Governor decides (or use override)
        if override_allocation:
            allocation = override_allocation
        else:
            allocation = governor.decide(
                colony, len(event_engine.active_events), prev)

        # Snapshot previous for next cycle
        prev = Resources(
            o2_kg=colony.resources.o2_kg, h2o_liters=colony.resources.h2o_liters,
            food_kcal=colony.resources.food_kcal, power_kwh=colony.resources.power_kwh,
            crew_size=colony.resources.crew_size,
        )

        # Step the colony
        step(colony, irradiance, ext_temp, allocation,
             active_events=event_engine.active_event_dicts(),
             radiation_msv=rad)

        # Save twin state
        env = {
            "exterior_temp_k": round(ext_temp, 2),
            "irradiance_w_m2": round(irradiance, 2),
            "dust_factor": round(dust_factor, 2),
            "sol_of_year": sol_of_year,
            "solar_kwh": round(irradiance * 200 * 0.22 * MARS_SOL_HOURS / 1000, 2),
        }
        save_twin_state(colony, sol, event_engine.active_events, env,
                       governor.archetype, twin_path)

        # Render
        render_mission_control(colony, sol, event_engine, ext_temp,
                              irradiance, allocation, governor,
                              new_events, speed)

        # Pace based on speed (0 = instant, 1 = 1sec/sol, etc.)
        if speed > 0:
            delay = 1.0 / speed
        else:
            delay = 0

        # Wait for input or timeout
        try:
            if delay > 0:
                import select
                # Non-blocking input with timeout
                print(f"\n  {C.DIM}Next sol in {delay:.1f}s...{C.RESET}", end="", flush=True)
                rlist, _, _ = select.select([sys.stdin], [], [], delay)
                if rlist:
                    cmd = sys.stdin.readline().strip().lower()
                    if cmd == 'q':
                        break
                    elif cmd == 'o':
                        override_allocation = _get_override()
                    elif cmd == 's':
                        speed = _get_speed(speed)
                    elif cmd == '':
                        pass  # Just advance
                    elif cmd == 'r':
                        override_allocation = None  # Release override
                        print(f"  {C.GREEN}Override released — governor in control{C.RESET}")
                        time.sleep(0.5)
            else:
                pass  # Instant mode
        except (EOFError, KeyboardInterrupt):
            break

    # Mission end
    print(f"\n  {C.RED}{C.BOLD}{'═' * 60}{C.RESET}")
    if colony.alive:
        print(f"  {C.GREEN}{C.BOLD}MISSION COMPLETE — Colony survived {colony.sol} sols{C.RESET}")
    else:
        print(f"  {C.RED}{C.BOLD}COLONY LOST — Sol {colony.sol}{C.RESET}")
        if colony.cause_of_death:
            print(f"  {C.RED}Cause: {colony.cause_of_death}{C.RESET}")

    result = {
        "survived_sols": colony.sol, "alive": colony.alive,
        "morale": colony.morale, "reputation": 0.5,
        "trades_completed": 0, "sols_on_rations": colony.sols_on_rations,
        "cause_of_death": colony.cause_of_death,
        "sabotages_attempted": 0, "final_resources": {
            "o2_kg": colony.resources.o2_kg,
            "h2o_liters": colony.resources.h2o_liters,
            "food_kcal": colony.resources.food_kcal,
            "power_kwh": colony.resources.power_kwh,
        },
    }
    score = score_run(result)
    print(f"\n  {C.BOLD}Mission Score: {score.composite:.0f}/100 (Grade: {score.grade}){C.RESET}")
    print(f"  Survival: {score.survival:.0f}  Efficiency: {score.efficiency:.0f}  "
          f"Morale: {score.morale:.0f}  Resilience: {score.resilience:.0f}")
    print(f"\n  {C.DIM}Final twin state saved to {twin_path}{C.RESET}")
    print(f"  {C.RED}{C.BOLD}{'═' * 60}{C.RESET}\n")


def _get_override() -> Optional[Allocation]:
    """Prompt operator for allocation override."""
    print(f"\n  {C.YELLOW}OVERRIDE MODE — Enter allocations (total must = 100%){C.RESET}")
    try:
        h = int(input(f"  Heating %  [0-100]: ") or "25")
        i = int(input(f"  ISRU %     [0-100]: ") or "40")
        g = int(input(f"  Greenhouse [0-100]: ") or "35")
        r = int(input(f"  Ration %   [30-100]: ") or "100")
        total = h + i + g
        if total <= 0:
            return None
        return Allocation(
            heating_fraction=h / total,
            isru_fraction=i / total,
            greenhouse_fraction=g / total,
            food_ration=max(30, min(100, r)) / 100.0,
        )
    except (ValueError, EOFError):
        return None


def _get_speed(current: float) -> float:
    """Prompt for new speed."""
    try:
        s = input(f"\n  Speed (current {current}x, 0=instant): ")
        return max(0, float(s or current))
    except (ValueError, EOFError):
        return current
