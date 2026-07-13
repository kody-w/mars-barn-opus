"""Mars Barn Opus — Multi-Colony World

Trade, diplomacy, supply drops, sabotage, and inter-colony dynamics.
Manages N colonies competing/cooperating on shared terrain.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from config import (
    TRADE_TRANSPORT_LOSS_PER_100KM, SUPPLY_DROP_INTERVAL_SOLS,
    SUPPLY_DROP_RESOURCES, REPUTATION_COOPERATE_BONUS,
    REPUTATION_DEFECT_PENALTY, REPUTATION_SABOTAGE_PENALTY,
    SABOTAGE_DETECTION_CHANCE, SABOTAGE_DAMAGE_FRACTION,
    RESOURCE_FACTOR_RANGES, GOVERNOR_ARCHETYPES,
    O2_KG_PER_PERSON_PER_SOL, FOOD_KCAL_PER_PERSON_PER_SOL,
)
from colony import (
    Colony, create_colony, Allocation, Resources, crew_water_balance,
    step, serialize,
)
from governor import Governor, create_governor
from events import EventEngine
from mars import (
    generate_terrain, Terrain, atmosphere_at, solar_irradiance,
    daily_mean_irradiance, radiation_dose,
)


@dataclass
class TradeOffer:
    """A trade proposal between colonies."""
    from_colony: str
    to_colony: str
    offering: Dict[str, float]    # Resource amounts offered
    requesting: Dict[str, float]  # Resource amounts requested
    accepted: bool = False


@dataclass
class WorldEvent:
    """Record of something that happened in the world."""
    sol: int
    event_type: str   # "trade", "sabotage", "supply_drop", "death", "event"
    description: str
    colonies_involved: List[str] = field(default_factory=list)


@dataclass
class World:
    """Multi-colony simulation world."""
    terrain: Terrain
    colonies: Dict[str, Colony] = field(default_factory=dict)
    governors: Dict[str, Governor] = field(default_factory=dict)
    event_engines: Dict[str, EventEngine] = field(default_factory=dict)
    previous_resources: Dict[str, Resources] = field(default_factory=dict)
    sol: int = 0
    max_sols: int = 500
    seed: int = 42
    rng: random.Random = field(default_factory=lambda: random.Random(42))
    history: List[WorldEvent] = field(default_factory=list)
    snapshots: List[Dict] = field(default_factory=list)  # Per-sol state snapshots

    def alive_colonies(self) -> List[str]:
        """Names of colonies still alive."""
        return [name for name, c in self.colonies.items() if c.alive]

    def dead_colonies(self) -> List[str]:
        """Names of dead colonies."""
        return [name for name, c in self.colonies.items() if not c.alive]


def create_world(num_colonies: int = 3, max_sols: int = 500,
                 seed: int = 42, terrain_size: int = 32) -> World:
    """Initialize a world with N colonies at different locations.

    Colonies are placed at spread-out locations with anti-correlated
    resource types to force trade interdependence.
    """
    rng = random.Random(seed)
    terrain = generate_terrain(size=terrain_size, seed=seed)

    # Assign resource types to force trade
    resource_types = list(RESOURCE_FACTOR_RANGES.keys())
    archetype_names = list(GOVERNOR_ARCHETYPES.keys())

    world = World(
        terrain=terrain, max_sols=max_sols, seed=seed,
        rng=rng,
    )

    for i in range(num_colonies):
        # Spread colonies across the terrain
        angle = 2 * math.pi * i / num_colonies
        radius = terrain_size * 0.3
        cx = int(terrain_size / 2 + radius * math.cos(angle))
        cy = int(terrain_size / 2 + radius * math.sin(angle))
        cx = max(1, min(cx, terrain_size - 2))
        cy = max(1, min(cy, terrain_size - 2))

        # Assign resource type (cycle through, skip "harsh" for fairness)
        fair_types = [t for t in resource_types if t != "harsh"]
        resource_type = fair_types[i % len(fair_types)]

        # Assign archetype
        archetype = archetype_names[i % len(archetype_names)]

        name = f"Colony-{archetype.capitalize()}"
        colony = create_colony(
            name=name,
            resource_type=resource_type,
            location_x=cx, location_y=cy,
        )

        governor = create_governor(
            name=f"Gov-{archetype}",
            archetype=archetype,
            seed=seed + i * 1000 + 17,
        )

        event_engine = EventEngine()
        event_engine.set_seed(seed + i * 1000)

        world.colonies[name] = colony
        world.governors[name] = governor
        world.event_engines[name] = event_engine
        world.previous_resources[name] = Resources(
            o2_kg=colony.resources.o2_kg,
            h2o_liters=colony.resources.h2o_liters,
            food_kcal=colony.resources.food_kcal,
            power_kwh=colony.resources.power_kwh,
            crew_size=colony.resources.crew_size,
            power_capacity_kwh=colony.resources.power_capacity_kwh,
        )

    return world


def distance_between(c1: Colony, c2: Colony) -> float:
    """Euclidean distance between two colonies in grid units."""
    return math.sqrt((c1.location_x - c2.location_x) ** 2
                     + (c1.location_y - c2.location_y) ** 2)


def world_step(world: World) -> Dict:
    """Advance the world by one sol. Returns sol summary.

    Order of operations:
    1. Generate/tick events for each colony
    2. Governors make allocation decisions
    3. Step each colony (production, consumption, cascade)
    4. Process trade between colonies
    5. Process sabotage attempts
    6. Supply drops (every N sols)
    7. Record snapshot
    """
    world.sol += 1
    sol_summary = {"sol": world.sol, "events": [], "trades": [],
                   "sabotages": [], "deaths": []}

    alive = world.alive_colonies()
    if not alive:
        return sol_summary

    # --- Phase 1: Events ---
    for name in alive:
        engine = world.event_engines[name]
        new_events = engine.tick(world.sol)
        for e in new_events:
            sol_summary["events"].append({
                "colony": name, "type": e.event_type,
                "severity": e.severity, "description": e.description,
            })
            world.history.append(WorldEvent(
                sol=world.sol, event_type="event",
                description=f"{name}: {e.description}",
                colonies_involved=[name],
            ))

    # --- Phase 2: Governor decisions ---
    allocations: Dict[str, Allocation] = {}
    for name in alive:
        colony = world.colonies[name]
        governor = world.governors[name]
        engine = world.event_engines[name]

        prev_resources = world.previous_resources[name]

        allocation = governor.decide(
            colony, events_active=len(engine.active_events),
            prev_resources=prev_resources,
        )
        allocations[name] = allocation
        world.previous_resources[name] = Resources(
            o2_kg=colony.resources.o2_kg,
            h2o_liters=colony.resources.h2o_liters,
            food_kcal=colony.resources.food_kcal,
            power_kwh=colony.resources.power_kwh,
            crew_size=colony.resources.crew_size,
            power_capacity_kwh=colony.resources.power_capacity_kwh,
        )

    # --- Phase 3: Step colonies ---
    for name in alive:
        colony = world.colonies[name]
        engine = world.event_engines[name]
        allocation = allocations[name]

        # Compute environment at colony location
        cell = world.terrain.cell_at(colony.location_x, colony.location_y)
        sol_of_year = world.sol % 669
        latitude = (colony.location_y - world.terrain.size / 2) / (world.terrain.size / 2) * 60.0

        # Aggregate event effects for environment modification
        agg = engine.aggregate_effects()
        dust_factor = agg.get("dust_factor", 1.0)
        solar_mult = agg.get("solar_multiplier", 1.0)
        temp_offset = agg.get("temp_offset_k", 0.0)

        irradiance = daily_mean_irradiance(
            latitude, sol_of_year, dust_factor
        ) * solar_mult

        atm = atmosphere_at(cell.elevation_m, latitude, sol_of_year,
                           dust_factor=dust_factor)
        ext_temp = atm.temperature_k + temp_offset

        rad = radiation_dose(
            sol_count=1, in_habitat=True,
            solar_flare=False,
        )

        step(colony, irradiance, ext_temp, allocation,
             active_events=engine.active_event_dicts(),
             radiation_msv=rad)

        if not colony.alive:
            sol_summary["deaths"].append({
                "colony": name, "sol": world.sol,
                "cause": colony.cause_of_death,
            })
            world.history.append(WorldEvent(
                sol=world.sol, event_type="death",
                description=f"{name} died: {colony.cause_of_death}",
                colonies_involved=[name],
            ))

    # --- Phase 4: Trade ---
    alive = world.alive_colonies()  # Refresh after deaths
    if len(alive) >= 2:
        _process_trades(world, alive, sol_summary)

    # --- Phase 5: Sabotage ---
    if len(alive) >= 2:
        _process_sabotage(world, alive, sol_summary)

    # --- Phase 6: Supply drops ---
    if world.sol % SUPPLY_DROP_INTERVAL_SOLS == 0 and alive:
        _supply_drop(world, alive, sol_summary)

    # --- Phase 7: Snapshot ---
    snapshot = {
        "sol": world.sol,
        "colonies": {name: serialize(world.colonies[name])
                     for name in world.colonies},
    }
    world.snapshots.append(snapshot)

    return sol_summary


def _process_trades(world: World, alive: List[str],
                    summary: Dict) -> None:
    """Each colony can propose one trade per sol to its nearest neighbor."""
    for name in alive:
        colony = world.colonies[name]
        governor = world.governors[name]
        r = colony.resources

        # Find nearest alive neighbor
        others = [n for n in alive if n != name]
        if not others:
            continue

        nearest = min(others, key=lambda n: distance_between(
            colony, world.colonies[n]))
        neighbor = world.colonies[nearest]
        neighbor_gov = world.governors[nearest]

        # Determine what to offer (surplus) and request (deficit)
        _, my_worst = r.lowest_resource_days()
        offering, requesting = _compute_trade_offer(colony, neighbor)

        if not offering or not requesting:
            continue

        # Apply transport losses
        dist = distance_between(colony, neighbor)
        loss = TRADE_TRANSPORT_LOSS_PER_100KM * dist / 10.0  # Grid units ≈ 10km
        for key in offering:
            offering[key] *= max(0.5, 1.0 - loss)

        # Evaluate
        accepted = neighbor_gov.evaluate_trade(
            offering, requesting, name, colony.reputation
        )

        if accepted:
            # Execute trade
            _execute_trade(colony, neighbor, offering, requesting)
            colony.reputation = min(1.0, colony.reputation + REPUTATION_COOPERATE_BONUS)
            neighbor.reputation = min(1.0, neighbor.reputation + REPUTATION_COOPERATE_BONUS)
            colony.trades_completed += 1
            neighbor.trades_completed += 1

            governor.trade_history.setdefault(nearest, []).append("cooperate")
            neighbor_gov.trade_history.setdefault(name, []).append("cooperate")

            summary["trades"].append({
                "from": name, "to": nearest, "accepted": True,
            })
            world.history.append(WorldEvent(
                sol=world.sol, event_type="trade",
                description=f"Trade: {name} <-> {nearest} (accepted)",
                colonies_involved=[name, nearest],
            ))
        else:
            governor.trade_history.setdefault(nearest, []).append("defect")
            neighbor_gov.trade_history.setdefault(name, []).append("defect")
            colony.reputation = max(0.0, colony.reputation - REPUTATION_DEFECT_PENALTY * 0.5)


def _crew_water_tank_draw(colony: Colony) -> float:
    consumption_reduction = (
        colony.research.get_effect("h2o_consumption_reduction")
        if colony.research is not None else 0.0
    )
    return crew_water_balance(
        colony.resources.crew_size,
        consumption_reduction=consumption_reduction,
    ).net_tank_draw_liters


def _compute_trade_offer(src: Colony, dst: Colony) -> Tuple[Dict, Dict]:
    """Compute what to trade based on comparative advantage."""
    offering = {}
    requesting = {}
    src_water_draw = _crew_water_tank_draw(src)
    dst_water_draw = _crew_water_tank_draw(dst)

    resources = [
        ("o2_kg", src.resources.o2_kg, dst.resources.o2_kg,
         O2_KG_PER_PERSON_PER_SOL * src.resources.crew_size,
         O2_KG_PER_PERSON_PER_SOL * dst.resources.crew_size),
        ("h2o_liters", src.resources.h2o_liters, dst.resources.h2o_liters,
         src_water_draw, dst_water_draw),
        ("food_kcal", src.resources.food_kcal, dst.resources.food_kcal,
         FOOD_KCAL_PER_PERSON_PER_SOL * src.resources.crew_size,
         FOOD_KCAL_PER_PERSON_PER_SOL * dst.resources.crew_size),
    ]

    for (rname, my_amount, their_amount,
         my_daily_consumption, their_daily_consumption) in resources:
        my_days = (my_amount / my_daily_consumption
                   if my_daily_consumption > 0 else 999)
        their_days = (their_amount / their_daily_consumption
                      if their_daily_consumption > 0 else 999)

        if my_days > their_days + 10:
            # I have surplus, offer some
            surplus = (my_days - 20) * my_daily_consumption * 0.1
            if surplus > 0:
                offering[rname] = surplus
        elif their_days > my_days + 10:
            # I need this, request some
            deficit = (20 - my_days) * my_daily_consumption * 0.1
            if deficit > 0:
                requesting[rname] = deficit

    return offering, requesting


def _execute_trade(src: Colony, dst: Colony,
                   offering: Dict[str, float],
                   requesting: Dict[str, float]) -> None:
    """Transfer resources between colonies."""
    for key, amount in offering.items():
        src_val = getattr(src.resources, key, 0)
        amount = min(amount, src_val * 0.9)  # Never trade more than 90%
        setattr(src.resources, key, src_val - amount)
        dst_val = getattr(dst.resources, key, 0)
        setattr(dst.resources, key, dst_val + amount)

    for key, amount in requesting.items():
        dst_val = getattr(dst.resources, key, 0)
        amount = min(amount, dst_val * 0.9)
        setattr(dst.resources, key, dst_val - amount)
        src_val = getattr(src.resources, key, 0)
        setattr(src.resources, key, src_val + amount)

    src.resources.enforce_power_capacity()
    dst.resources.enforce_power_capacity()


def _process_sabotage(world: World, alive: List[str],
                      summary: Dict) -> None:
    """Check if any governor wants to sabotage."""
    for name in alive:
        colony = world.colonies[name]
        governor = world.governors[name]

        others = [n for n in alive if n != name]
        if not others:
            continue

        # Consider sabotaging the strongest neighbor
        strongest = max(others, key=lambda n: world.colonies[n].resources.power_kwh)
        target = world.colonies[strongest]

        if governor.consider_sabotage(colony, target):
            colony.sabotages_attempted += 1

            # Detection check
            detected = world.rng.random() < SABOTAGE_DETECTION_CHANCE
            if detected:
                colony.reputation = max(0.0,
                    colony.reputation - REPUTATION_SABOTAGE_PENALTY)
                world.history.append(WorldEvent(
                    sol=world.sol, event_type="sabotage",
                    description=f"{name} attempted sabotage on {strongest} — DETECTED",
                    colonies_involved=[name, strongest],
                ))
            else:
                # Sabotage succeeds
                systems = ["solar", "isru", "greenhouse", "heating"]
                target_system = world.rng.choice(systems)
                target.systems.damage(target_system, SABOTAGE_DAMAGE_FRACTION)
                target.sabotages_received += 1

                world.history.append(WorldEvent(
                    sol=world.sol, event_type="sabotage",
                    description=f"{name} sabotaged {strongest}'s {target_system}",
                    colonies_involved=[name, strongest],
                ))

            summary["sabotages"].append({
                "attacker": name, "target": strongest,
                "detected": detected,
            })


def _supply_drop(world: World, alive: List[str],
                 summary: Dict) -> None:
    """Deliver supply drop to the colony with lowest reputation (neediest)."""
    # Supply drops go to the neediest (lowest total resources)
    neediest = min(alive, key=lambda n: (
        world.colonies[n].resources.o2_kg
        + world.colonies[n].resources.h2o_liters
        + world.colonies[n].resources.food_kcal
    ))

    colony = world.colonies[neediest]
    for key, amount in SUPPLY_DROP_RESOURCES.items():
        current = getattr(colony.resources, key, 0)
        setattr(colony.resources, key, current + amount)
    colony.resources.enforce_power_capacity()

    world.history.append(WorldEvent(
        sol=world.sol, event_type="supply_drop",
        description=f"Supply drop delivered to {neediest}",
        colonies_involved=[neediest],
    ))


def run_world(world: World) -> Dict:
    """Run the full simulation and return results."""
    results = {
        "seed": world.seed,
        "max_sols": world.max_sols,
        "colonies": {},
        "timeline": [],
    }

    for sol in range(world.max_sols):
        if not world.alive_colonies():
            break
        sol_summary = world_step(world)
        results["timeline"].append(sol_summary)

    # Final results
    for name, colony in world.colonies.items():
        results["colonies"][name] = {
            "archetype": world.governors[name].archetype,
            "survived_sols": colony.sol,
            "alive": colony.alive,
            "cause_of_death": colony.cause_of_death,
            "morale": round(colony.morale, 3),
            "reputation": round(colony.reputation, 3),
            "trades_completed": colony.trades_completed,
            "sabotages_attempted": colony.sabotages_attempted,
            "sabotages_received": colony.sabotages_received,
            "sols_on_rations": colony.sols_on_rations,
            "cumulative_radiation_msv": round(colony.cumulative_radiation_msv, 2),
            "final_resources": {
                "o2_kg": round(colony.resources.o2_kg, 2),
                "h2o_liters": round(colony.resources.h2o_liters, 2),
                "food_kcal": round(colony.resources.food_kcal, 1),
                "power_kwh": round(colony.resources.power_kwh, 2),
            },
        }

    return results
